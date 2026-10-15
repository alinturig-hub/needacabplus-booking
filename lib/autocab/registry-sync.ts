import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptWebhookSecret } from '@/lib/autocab/webhook-secret';
import { mapAutocabDriver } from '@/lib/autocab/registry/driver/mapper';
import { mapAutocabVehicle } from '@/lib/autocab/registry/vehicle/mapper';
import { mapAutocabAccount } from '@/lib/autocab/registry/account/mapper';
import type { AutocabDriverRecord } from '@/lib/autocab/registry/driver/types';
import type { AutocabVehicleRecord } from '@/lib/autocab/registry/vehicle/types';
import type { AutocabAccountRecord } from '@/lib/autocab/registry/account/types';

export type RegistryEntity = 'DRIVERS' | 'VEHICLES' | 'ACCOUNTS' | 'ZONES';
const paths: Record<RegistryEntity, string> = {
  DRIVERS: '/driver/v1/drivers',
  VEHICLES: '/vehicle/v1/vehicles',
  ACCOUNTS: '/accounts/v1/customers',
  ZONES: '/booking/v1/zones',
};

type RecordWithId = Record<string, unknown> & { id: string | number };
const string = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : null;
const integer = (value: unknown) => typeof value === 'number' && Number.isInteger(value) ? value : null;
const isRecordWithId = (value: unknown): value is RecordWithId =>
  !!value && typeof value === 'object' && !Array.isArray(value) &&
  (typeof (value as Record<string, unknown>).id === 'number' || typeof (value as Record<string, unknown>).id === 'string');

async function fetchRegistry(entity: RegistryEntity) {
  const configuration = await prisma.autocabApiConfiguration.findUnique({ where: { provider: 'AUTOCAB' } });
  if (!configuration?.isEnabled || !configuration.apiKeyEncrypted) throw new Error('Shared Autocab API configuration is unavailable.');
  const base = new URL(configuration.baseUrl);
  if (base.protocol !== 'https:') throw new Error('Autocab API must use HTTPS.');
  const url = new URL(paths[entity], base);
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'Ocp-Apim-Subscription-Key': decryptWebhookSecret(configuration.apiKeyEncrypted) },
    cache: 'no-store', signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Autocab ${entity} returned HTTP ${response.status}.`);
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error(`Autocab ${entity} did not return an array.`);
  // An unexpected empty response must never deactivate a populated registry.
  if (!payload.length) throw new Error(`Autocab ${entity} returned no records.`);
  if (!payload.every(isRecordWithId)) throw new Error(`Autocab ${entity} returned records without IDs.`);
  if (payload.some(item => typeof item.sourceSystem === 'string' && item.sourceSystem.toLowerCase() === 'taxicrm')) {
    throw new Error(`Autocab ${entity} endpoint returned TaxiCRM data. No registry records were changed.`);
  }
  return payload as RecordWithId[];
}

async function upsertRecord(entity: RegistryEntity, item: RecordWithId, syncedAt: Date) {
  const externalId = String(item.id);
  const where = { provider_externalId: { provider: 'AUTOCAB', externalId } };
  if (entity === 'DRIVERS') {
    const data = mapAutocabDriver(item as AutocabDriverRecord, syncedAt);
    await prisma.driver.upsert({ where, create: data, update: data });
  } else if (entity === 'VEHICLES') {
    const data = mapAutocabVehicle(item as AutocabVehicleRecord);
    await prisma.vehicle.upsert({ where, create: data, update: data });
  } else if (entity === 'ACCOUNTS') {
    if (item.active === false || !String(item.accountCode ?? '').trim()) return false;
    const data = mapAutocabAccount(item as AutocabAccountRecord, syncedAt);
    await prisma.autocabAccount.upsert({ where, create: data, update: data });
  } else {
    if (item.active !== true || item.companyId !== 1 || !string(item.name)) return false;
    const centre = item.centre && typeof item.centre === 'object' ? item.centre as Record<string, unknown> : {};
    const data = {
      provider: 'AUTOCAB', externalId, companyId: 1,
      mdtZoneId: integer(item.mdtZoneId), name: string(item.name)!, descriptor: string(item.descriptor),
      latitude: typeof centre.latitude === 'number' ? centre.latitude : null,
      longitude: typeof centre.longitude === 'number' ? centre.longitude : null,
      active: true, rawPayload: item as Prisma.InputJsonObject, lastSyncedAt: syncedAt,
    };
    await prisma.zone.upsert({ where, create: data, update: data });
  }
  return true;
}

export async function syncAutocabRegistry(entity: RegistryEntity, dryRun = false) {
  const items = await fetchRegistry(entity);
  const eligible = items.filter(item => entity === 'ACCOUNTS'
    ? item.active !== false && !!String(item.accountCode ?? '').trim()
    : entity === 'ZONES' ? item.active === true && item.companyId === 1 && !!string(item.name) : true);
  if (dryRun) return { entity, received: items.length, eligible: eligible.length, dryRun: true };
  if (process.env.AUTOCAB_REGISTRY_WRITER_ENABLED !== 'true') throw new Error('Need A Cab Plus registry writer is disabled.');
  const recent = await prisma.integrationSyncJob.findFirst({
    where: { provider: 'AUTOCAB', entity, status: 'RUNNING', startedAt: { gt: new Date(Date.now() - 30 * 60_000) } },
    select: { id: true },
  });
  if (recent) throw new Error(`${entity} synchronisation is already running.`);
  const job = await prisma.integrationSyncJob.create({ data: { provider: 'AUTOCAB', entity, source: 'NEEDACABPLUS', status: 'RUNNING' } });
  const syncedAt = new Date();
  let saved = 0, failed = 0, disabled = 0;
  try {
    for (const item of eligible) {
      try { if (await upsertRecord(entity, item, syncedAt)) saved++; }
      catch (error) { failed++; console.error(`Autocab ${entity} record ${String(item.id)} failed:`, error); }
    }
    if (!failed && eligible.length) {
      const activeIds = eligible.map(item => String(item.id));
      if (entity === 'ACCOUNTS') disabled = (await prisma.autocabAccount.updateMany({
        where: { provider: 'AUTOCAB', active: true, externalId: { notIn: activeIds } }, data: { active: false },
      })).count;
      if (entity === 'ZONES') disabled = (await prisma.zone.updateMany({
        where: { provider: 'AUTOCAB', companyId: 1, active: true, externalId: { notIn: activeIds } }, data: { active: false },
      })).count;
      if (entity === 'DRIVERS') disabled = (await prisma.driver.updateMany({
        where: { provider: 'AUTOCAB', active: true, externalId: { notIn: activeIds } }, data: { active: false, markedInactiveAt: syncedAt },
      })).count;
      if (entity === 'VEHICLES') disabled = (await prisma.vehicle.updateMany({
        where: { provider: 'AUTOCAB', isActive: true, externalId: { notIn: activeIds } }, data: { isActive: false },
      })).count;
    }
    const status = failed ? 'PARTIAL' : 'SUCCESS';
    await prisma.integrationSyncJob.update({ where: { id: job.id }, data: {
      status, finishedAt: new Date(), durationMs: Date.now() - job.startedAt.getTime(),
      recordsReceived: items.length, recordsUpdated: saved, recordsSkipped: items.length - eligible.length, recordsDisabled: disabled, recordsFailed: failed,
    } });
    return { entity, received: items.length, eligible: eligible.length, saved, disabled, failed, status, dryRun: false };
  } catch (error) {
    await prisma.integrationSyncJob.update({ where: { id: job.id }, data: { status: 'FAILED', finishedAt: new Date(), error: String(error).slice(0, 2000) } });
    throw error;
  }
}
