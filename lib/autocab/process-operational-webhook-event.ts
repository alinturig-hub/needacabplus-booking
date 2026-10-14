import { prisma } from '@/lib/prisma';
import { database } from '@/lib/database';
import { handlesDriverEvent, saveDriverEvent } from '@/lib/driver-events';
import { normaliseEventType } from '@/lib/autocab/webhook-processing';
import { processVehicleTracksChangedWebhook } from '@/lib/autocab/process-vehicle-tracks-changed';
import { processDriverShiftStartedEndedWebhook } from '@/lib/autocab/process-driver-shift-started-ended';

/** Drain the shared raw inbox for fleet events that no longer belong to TaxiCRM. */
export async function processOperationalWebhookEvent(id: string) {
  const claimed = await prisma.webhookEvent.updateMany({
    where: { id, OR: [
      { status: { in: ['RECEIVED', 'FAILED'] } },
      { status: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 5 * 60_000) } },
    ] },
    data: { status: 'PROCESSING', processingError: null, attemptCount: { increment: 1 } },
  });
  if (!claimed.count) return;
  const event = await prisma.webhookEvent.findUnique({ where: { id }, select: { eventType: true, payload: true } });
  if (!event) return;
  try {
    if (!handlesDriverEvent(event.eventType)) {
      await prisma.webhookEvent.update({ where: { id }, data: { status: 'IGNORED', processedAt: new Date(), processingError: 'No local operational handler registered.' } });
      return;
    }
    const result = await saveDriverEvent(database(), event.payload, event.eventType);
    if (!result.saved) throw new Error(result.reason || 'Fleet event could not be normalized.');
    await prisma.$transaction(async tx => {
      const kind = normaliseEventType(event.eventType);
      if (kind === 'vehicletrackschanged') await processVehicleTracksChangedWebhook(id, tx);
      else await processDriverShiftStartedEndedWebhook(id, tx);
      await tx.webhookEvent.update({ where: { id }, data: { status: 'PROCESSED', processedAt: new Date(), processingError: null } });
    }, { maxWait: 10_000, timeout: 30_000 });
  } catch (error) {
    await prisma.webhookEvent.update({ where: { id }, data: { status: 'FAILED', processedAt: null, processingError: (error instanceof Error ? error.message : 'Unknown fleet webhook error').slice(0, 5000) } });
    throw error;
  }
}
