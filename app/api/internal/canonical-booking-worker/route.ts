import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const waitingForBooking = 'Booking context event is waiting for its booking.';

function authorized(request: NextRequest) {
  const expected = process.env.BOOKING_WRITER_JOB_SECRET;
  const supplied = request.headers.get('x-booking-writer-secret');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
  if (process.env.CANONICAL_BOOKING_WRITER_ENABLED !== 'true') {
    return NextResponse.json({ enabled: false, processed: 0, failed: 0, remaining: 0 });
  }

  try {
    const [{ prisma }, { retryableWebhooks }, { processCanonicalBookingEvent }, { drainBookingPostCommitEffects }, { processOperationalWebhookEvent }] = await Promise.all([
      import('@/lib/prisma'),
      import('@/lib/autocab/webhook-processing'),
      import('@/lib/autocab/process-canonical-booking-event'),
      import('@/lib/autocab/booking-post-commit-outbox'),
      import('@/lib/autocab/process-operational-webhook-event'),
    ]);
    // Events that arrived before BookingCreated may have exhausted their normal
    // retries. Once the parent exists, put them back in the queue.
    const waiting = await prisma.webhookEvent.findMany({
      where: {
        provider: 'AUTOCAB', eventType: { startsWith: 'Booking' },
        status: 'FAILED', processingError: waitingForBooking,
        attemptCount: { gte: 5 }, externalBookingId: { not: null },
      },
      select: { id: true, externalBookingId: true },
      take: 100, orderBy: { receivedAt: 'desc' },
    });
    const externalIds = [...new Set(waiting.map(event => event.externalBookingId).filter((id): id is string => Boolean(id)))];
    if (externalIds.length) {
      const parents = await prisma.booking.findMany({
        where: { provider: 'AUTOCAB', externalId: { in: externalIds } },
        select: { externalId: true },
      });
      const found = new Set(parents.map(booking => booking.externalId));
      const ready = waiting.filter(event => event.externalBookingId && found.has(event.externalBookingId)).map(event => event.id);
      if (ready.length) await prisma.webhookEvent.updateMany({
        where: { id: { in: ready }, status: 'FAILED', processingError: waitingForBooking },
        data: { status: 'RECEIVED', attemptCount: 0, processingError: null },
      });
    }

    const pending = await prisma.webhookEvent.findMany({
      where: { AND: [retryableWebhooks(), { provider: 'AUTOCAB', eventType: { startsWith: 'Booking' } }] },
      orderBy: { receivedAt: 'asc' }, take: 10, select: { id: true },
    });
    let processed = 0;
    let failed = 0;
    for (const event of pending) {
      try {
        await processCanonicalBookingEvent(event.id);
        processed++;
      } catch (error) {
        console.error(`Canonical booking processing failed for ${event.id}:`, error);
        failed++;
      }
    }
    if (process.env.AUTOCAB_OPERATIONAL_WEBHOOK_WRITER_ENABLED === 'true') {
      const cutoverAt = new Date(process.env.AUTOCAB_OPERATIONAL_CUTOVER_AT || '');
      if (Number.isNaN(cutoverAt.getTime())) throw new Error('AUTOCAB_OPERATIONAL_CUTOVER_AT is required for the fleet webhook cutover.');
      const operational = await prisma.webhookEvent.findMany({
        where: { AND: [retryableWebhooks(), { provider: 'AUTOCAB', receivedAt: { gte: cutoverAt } }, { eventType: { in: ['VehicleTracksChanged', 'DriverShiftStartedEnded', 'DriverShiftStarted', 'DriverShiftEnded'] } }] },
        orderBy: { receivedAt: 'asc' }, take: 10, select: { id: true },
      });
      for (const event of operational) {
        try { await processOperationalWebhookEvent(event.id); processed++; }
        catch (error) { console.error(`Operational webhook processing failed for ${event.id}:`, error); failed++; }
      }
    }
    const effects = process.env.CANONICAL_BOOKING_EFFECTS_ENABLED === 'false'
      ? { disabled: true, claimed: 0, completed: 0, failed: 0 }
      : await drainBookingPostCommitEffects(5);
    const remaining = await prisma.webhookEvent.count({
      where: { AND: [retryableWebhooks(), { provider: 'AUTOCAB', eventType: { startsWith: 'Booking' } }] },
    });
    return NextResponse.json({ enabled: true, processed, failed, remaining, effects });
  } catch (error) {
    console.error('Canonical booking worker failed:', error);
    return NextResponse.json({ error: 'WORKER_FAILED' }, { status: 500 });
  }
}
