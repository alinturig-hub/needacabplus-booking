import { timingSafeEqual } from 'node:crypto';
import type { RegistryEntity } from '@/lib/autocab/registry-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const entities = new Set<RegistryEntity>(['DRIVERS', 'VEHICLES', 'ACCOUNTS', 'ZONES']);
function authorized(request: Request) {
  const secret = process.env.BOOKING_WRITER_JOB_SECRET;
  const supplied = request.headers.get('x-booking-writer-secret');
  return !!secret && !!supplied && Buffer.byteLength(secret) === Buffer.byteLength(supplied) && timingSafeEqual(Buffer.from(secret), Buffer.from(supplied));
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const { prisma } = await import('@/lib/prisma');
  const [configurations, jobs] = await Promise.all([
    prisma.autocabWebhookConfiguration.findMany({
      select: { eventType: true, endpointSlug: true, isEnabled: true, webhookProvider: { select: { isEnabled: true, apiKeyEncrypted: true } } },
      orderBy: { eventType: 'asc' },
    }),
    prisma.integrationSyncJob.findMany({
      where: { provider: 'AUTOCAB' }, orderBy: { startedAt: 'desc' }, take: 8,
      select: { entity: true, status: true, source: true, startedAt: true, finishedAt: true, recordsReceived: true, recordsFailed: true },
    }),
  ]);
  return Response.json({
    receiverEnabled: process.env.AUTOCAB_WEBHOOK_INGEST_ENABLED === 'true',
    operationalWriterEnabled: process.env.AUTOCAB_OPERATIONAL_WEBHOOK_WRITER_ENABLED === 'true',
    registryWriterEnabled: process.env.AUTOCAB_REGISTRY_WRITER_ENABLED === 'true',
    configurations: configurations.map(row => ({ eventType: row.eventType, endpointSlug: row.endpointSlug, enabled: row.isEnabled && row.webhookProvider.isEnabled, keyConfigured: !!row.webhookProvider.apiKeyEncrypted || !!process.env.TRACKING_WEBHOOK_TOKEN })),
    recentJobs: jobs,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!authorized(request)) return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  const body = await request.json().catch(() => null) as { entity?: string; dryRun?: boolean } | null;
  const entity = body?.entity?.toUpperCase() as RegistryEntity | undefined;
  if (!entity || !entities.has(entity)) return Response.json({ error: 'INVALID_ENTITY' }, { status: 400 });
  try {
    const { syncAutocabRegistry } = await import('@/lib/autocab/registry-sync');
    return Response.json(await syncAutocabRegistry(entity, body?.dryRun === true));
  }
  catch (error) {
    console.error(`Autocab ${entity} registry sync failed:`, error);
    return Response.json({ error: 'REGISTRY_SYNC_FAILED' }, { status: 503 });
  }
}
