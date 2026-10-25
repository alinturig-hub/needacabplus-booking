import {requireAutocabIntegration} from '@/lib/integration-control';
import { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { decryptWebhookSecret } from '@/lib/autocab/webhook-secret';

type ApiRecord = { externalId: string; data: unknown };

function recordsFromResponse(payload: unknown, recordKey: string | null): ApiRecord[] {
  if (!Array.isArray(payload) || !recordKey) return [{ externalId: '$response', data: payload }];
  const seen = new Set<string>();
  return payload.map((data, index) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`Record ${index + 1} is not an object.`);
    const value = (data as Record<string, unknown>)[recordKey];
    if ((typeof value !== 'string' && typeof value !== 'number') ||
        (typeof value === 'number' && !Number.isFinite(value)) || !String(value).trim()) {
      throw new Error(`Record ${index + 1} has no valid ${recordKey}.`);
    }
    const externalId = String(value);
    if (seen.has(externalId)) throw new Error(`Duplicate record key: ${externalId}.`);
    seen.add(externalId);
    return { externalId, data };
  });
}

/** Refresh the shared generic Autocab datasets previously maintained by TaxiCRM. */
export async function syncAutocabGenericApi(dryRun = false) {
  await requireAutocabIntegration();
  if (!dryRun && process.env.AUTOCAB_REGISTRY_WRITER_ENABLED !== 'true') throw new Error('Need A Cab Plus registry writer is disabled.');
  const configuration = await prisma.autocabApiConfiguration.findUnique({ where: { provider: 'AUTOCAB' } });
  if (!configuration?.isEnabled || !configuration.apiKeyEncrypted) throw new Error('Shared Autocab API configuration is unavailable.');
  const base = new URL(configuration.baseUrl);
  if (base.protocol !== 'https:') throw new Error('Autocab API must use HTTPS.');
  const endpoints = await prisma.apiEndpointConfiguration.findMany({
    where: { provider: 'AUTOCAB', isEnabled: true, storeRecords: true },
    select: { id: true, name: true, url: true, recordKey: true },
  });
  if (!endpoints.length) return { entity: 'GENERIC_API', endpoints: 0, received: 0, saved: 0, failed: 0, status: 'SUCCESS', dryRun };
  const apiKey = decryptWebhookSecret(configuration.apiKeyEncrypted);
  let received = 0, saved = 0, failed = 0;
  for (const endpoint of endpoints) {
    try {
      const url = new URL(endpoint.url);
      if (url.protocol !== 'https:' || url.origin !== base.origin) throw new Error('Endpoint host differs from the configured Autocab host.');
      await requireAutocabIntegration();
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'Ocp-Apim-Subscription-Key': apiKey },
        redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) throw new Error(`Autocab returned HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      const records = recordsFromResponse(payload, endpoint.recordKey);
      received += Array.isArray(payload) ? payload.length : 1;
      if (dryRun) continue;
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`api-records:${endpoint.id}`}, 0))::text`;
        const syncedAt = new Date();
        for (const record of records) {
          const source = record.data && typeof record.data === 'object' && !Array.isArray(record.data)
            ? (record.data as Record<string, unknown>).rowVersion : null;
          const data = record.data === null ? Prisma.JsonNull : record.data as Prisma.InputJsonValue;
          const values = {
            data, isActive: true, lastSyncedAt: syncedAt,
            sourceVersion: typeof source === 'string' || typeof source === 'number' ? String(source) : null,
          };
          await tx.apiEndpointRecord.upsert({
            where: { endpointId_externalId: { endpointId: endpoint.id, externalId: record.externalId } },
            create: { endpointId: endpoint.id, externalId: record.externalId, ...values }, update: values,
          });
        }
        await tx.apiEndpointConfiguration.update({
          where: { id: endpoint.id },
          data: { sampleResponse: payload === null ? Prisma.JsonNull : payload as Prisma.InputJsonValue },
        });
      }, { timeout: 120_000 });
      saved += records.length;
    } catch (error) {
      failed++;
      console.error(`Autocab generic endpoint ${endpoint.id} failed:`, error);
    }
  }
  return { entity: 'GENERIC_API', endpoints: endpoints.length, received, saved, failed,
    status: failed ? 'PARTIAL' : 'SUCCESS', dryRun };
}
