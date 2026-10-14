import { timingSafeEqual } from 'node:crypto';
import type { RegistryEntity } from '@/lib/autocab/registry-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const entities = new Set<RegistryEntity | 'GENERIC_API'>(['DRIVERS', 'VEHICLES', 'ACCOUNTS', 'ZONES', 'GENERIC_API']);
function authorized(request: Request) {
  const secret = process.env.BOOKING_WRITER_JOB_SECRET;
  const supplied = request.headers.get('x-booking-writer-secret');
  return !!secret && !!supplied && Buffer.byteLength(secret) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { prisma } = await import('@/lib/prisma');
  const [configurations, jobs, recentEvents] = await Promise.all([
    prisma.autocabWebhookConfiguration.findMany({
      select: { eventType: true, endpointSlug: true, isEnabled: true, webhookProvider: { select: { isEnabled: true, apiKeyEncrypted: true } } },
      orderBy: { eventType: 'asc' },
    }),
    prisma.integrationSyncJob.findMany({
      where: { provider: 'AUTOCAB' }, orderBy: { startedAt: 'desc' }, take: 8,
      select: { entity: true, status: true, source: true, startedAt: true, finishedAt: true, recordsReceived: true, recordsFailed: true },
    }),
    prisma.webhookEvent.findMany({
      where: { provider: 'AUTOCAB', receivedAt: { gte: new Date(Date.now() - 30 * 60_000) } },
      orderBy: { receivedAt: 'desc' }, take: 1000,
      select: { headers: true, receivedAt: true, eventType: true, status: true },
    }),
  ]);
  const ingress = {
    needACabPlus: { count: 0, lastReceivedAt: null as Date | null },
    taxiCRM: { count: 0, lastReceivedAt: null as Date | null },
    unknown: { count: 0, lastReceivedAt: null as Date | null },
  };
  const recentEventStatuses: Record<string, Record<string, number>> = {};
  for (const event of recentEvents) {
    const statuses = recentEventStatuses[event.eventType] ||= {};
    statuses[event.status] = (statuses[event.status] || 0) + 1;
    const headers = event.headers && typeof event.headers === 'object' && !Array.isArray(event.headers)
      ? event.headers as Record<string, unknown> : {};
    const host = String(headers['x-forwarded-host'] || headers.host || '').toLowerCase();
    const bucket = host.includes('webhook.needacabplus.app') ? ingress.needACabPlus
      : host.includes('taxicrm.plymhub.ai') ? ingress.taxiCRM : ingress.unknown;
    bucket.count++;
    if (!bucket.lastReceivedAt) bucket.lastReceivedAt = event.receivedAt;
  }
  return Response.json({
    receiverEnabled: process.env.AUTOCAB_WEBHOOK_INGEST_ENABLED === 'true',
    operationalWriterEnabled: process.env.AUTOCAB_OPERATIONAL_WEBHOOK_WRITER_ENABLED === 'true',
    registryWriterEnabled: process.env.AUTOCAB_REGISTRY_WRITER_ENABLED === 'true',
    configurations: configurations.map(row => ({ eventType: row.eventType, endpointSlug: row.endpointSlug, enabled: row.isEnabled && row.webhookProvider.isEnabled, keyConfigured: !!row.webhookProvider.apiKeyEncrypted || !!process.env.TRACKING_WEBHOOK_TOKEN })),
    recentJobs: jobs,
    recentIngress: { windowMinutes: 30, sampledEvents: recentEvents.length, ...ingress },
    recentEventStatuses,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null) as { entity?: string; dryRun?: boolean } | null;
  const entity = body?.entity?.toUpperCase() as RegistryEntity | 'GENERIC_API' | undefined;
  if (!entity || !entities.has(entity)) return Response.json({ error: 'INVALID_ENTITY' }, { status: 400 });
  try {
    if (entity === 'GENERIC_API') {
      const { syncAutocabGenericApi } = await import('@/lib/autocab/generic-api-sync');
      return Response.json(await syncAutocabGenericApi(body?.dryRun === true));
    }
    const { syncAutocabRegistry } = await import('@/lib/autocab/registry-sync');
    return Response.json(await syncAutocabRegistry(entity, body?.dryRun === true));
  }
  catch (error) {
    console.error(`Autocab ${entity} registry sync failed:`, error);
    return Response.json({ error: 'REGISTRY_SYNC_FAILED' }, { status: 503 });
  }
}
