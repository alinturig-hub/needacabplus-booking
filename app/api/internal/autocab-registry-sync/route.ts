import { timingSafeEqual } from 'node:crypto';
import type { RegistryEntity } from '@/lib/autocab/registry-sync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const entities = new Set<RegistryEntity>(['DRIVERS', 'VEHICLES', 'ACCOUNTS', 'ZONES']);
export async function POST(request: Request) {
  const secret = process.env.BOOKING_WRITER_JOB_SECRET;
  const supplied = request.headers.get('x-booking-writer-secret');
  if (!secret || !supplied || Buffer.byteLength(secret) !== Buffer.byteLength(supplied) || !timingSafeEqual(Buffer.from(secret), Buffer.from(supplied))) {
    return Response.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
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
