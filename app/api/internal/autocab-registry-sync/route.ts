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
  const [{ prisma }, { database }] = await Promise.all([import('@/lib/prisma'), import('@/lib/database')]);
  const cutoverAt = new Date(process.env.AUTOCAB_OPERATIONAL_CUTOVER_AT || '');
  const [configurations, jobs, recentEvents, tracking, fleetParity, operationalPending] = await Promise.all([
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
    database().query<{ vehicles: number; latest_position_at: Date | null; local_webhook_last_at: Date | null }>(`
      SELECT
        (SELECT count(DISTINCT COALESCE(vehicle_id, driver_id))::int FROM driver_positions WHERE recorded_at >= now() - interval '2 minutes') AS vehicles,
        (SELECT max(recorded_at) FROM driver_positions) AS latest_position_at,
        (SELECT max(last_received_at) FROM provider_webhooks WHERE event_url_suffix = '/tracks_change') AS local_webhook_last_at
    `),
    database().query<{ canonical_live: number; local_live: number; in_both: number; canonical_only: number; local_only: number; positions_differ: number; canonical_latest: Date | null; local_latest: Date | null }>(`
      WITH canonical AS (
        SELECT "externalId" AS vehicle_id, "currentLatitude"::double precision AS latitude,
          "currentLongitude"::double precision AS longitude, "lastSeenAt" AS recorded_at
        FROM public."Vehicle"
        WHERE "lastSeenAt" >= now() - interval '2 minutes'
          AND "currentLatitude" IS NOT NULL AND "currentLongitude" IS NOT NULL
      ), local AS (
        SELECT DISTINCT ON (vehicle_id) vehicle_id, latitude, longitude, recorded_at
        FROM driver_positions
        WHERE vehicle_id IS NOT NULL AND recorded_at >= now() - interval '2 minutes'
        ORDER BY vehicle_id, recorded_at DESC, id DESC
      )
      SELECT count(*) FILTER (WHERE canonical.vehicle_id IS NOT NULL)::int AS canonical_live,
        count(*) FILTER (WHERE local.vehicle_id IS NOT NULL)::int AS local_live,
        count(*) FILTER (WHERE canonical.vehicle_id IS NOT NULL AND local.vehicle_id IS NOT NULL)::int AS in_both,
        count(*) FILTER (WHERE canonical.vehicle_id IS NOT NULL AND local.vehicle_id IS NULL)::int AS canonical_only,
        count(*) FILTER (WHERE canonical.vehicle_id IS NULL AND local.vehicle_id IS NOT NULL)::int AS local_only,
        count(*) FILTER (WHERE canonical.vehicle_id IS NOT NULL AND local.vehicle_id IS NOT NULL
          AND (abs(canonical.latitude - local.latitude) > 0.0001 OR abs(canonical.longitude - local.longitude) > 0.0001))::int AS positions_differ,
        max(canonical.recorded_at) AS canonical_latest, max(local.recorded_at) AS local_latest
      FROM canonical FULL JOIN local USING (vehicle_id)
    `),
    Number.isNaN(cutoverAt.getTime()) ? Promise.resolve(0) : prisma.webhookEvent.count({
      where: { provider: 'AUTOCAB', receivedAt: { gte: cutoverAt }, eventType: { in: ['VehicleTracksChanged', 'DriverShiftStartedEnded', 'DriverShiftStarted', 'DriverShiftEnded'] }, status: { in: ['RECEIVED', 'FAILED', 'PROCESSING'] } },
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
    tracking: { liveVehicles: tracking.rows[0]?.vehicles || 0, latestPositionAt: tracking.rows[0]?.latest_position_at || null, localWebhookLastAt: tracking.rows[0]?.local_webhook_last_at || null, operationalPending },
    fleetParity: fleetParity.rows[0] || null,
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
