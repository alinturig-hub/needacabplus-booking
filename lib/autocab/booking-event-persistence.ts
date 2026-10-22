import {recoverAssignmentDetails} from '@/lib/autocab/assignment-details.mjs';
import { Prisma } from "@/generated/prisma/client";
import { upsertBooking } from "@/lib/autocab/booking-upsert";
import {
  updateBookingStatus,
  canTransitionBookingStatus,
  type BookingOperationalStatus,
} from "@/lib/autocab/booking-state";
import {
  bookingExternalId,
  lockWebhookEntities,
  webhookOccurredAt,
  normaliseEventType,
} from "@/lib/autocab/webhook-processing";
import { projectBookingJson } from "@/lib/autocab/booking-json-projection";
import { isObject } from "@/lib/autocab/booking-mappers";

type BookingEventOptions = {
  title: string;
  description: string;
  status?: BookingOperationalStatus;
};

export async function persistBookingEvent(
  tx: Prisma.TransactionClient,
  webhookEventId: string,
  options: BookingEventOptions,
) {
  const event = await tx.webhookEvent.findUniqueOrThrow({
    where: { id: webhookEventId },
  });
  if (!isObject(event.payload))
    throw new Error("Webhook payload is not a JSON object.");
  const externalId = bookingExternalId(event.payload);
  if (!externalId) throw new Error("Missing Autocab booking ID.");
  await lockWebhookEntities(tx, [`AUTOCAB:booking:${externalId}`]);
  const current = await tx.booking.findUnique({
    where: { provider_externalId: { provider: "AUTOCAB", externalId } },
  });
  if (!current && !options.status) {
    // Retain the event for a retry when its parent booking arrives, without creating
    // a partial booking from a context-only payload or permanently ignoring it.
    throw new Error("Booking context event is waiting for its booking.");
  }
  const occurredAt = webhookOccurredAt(event);
  const previous = current
    ? await tx.webhookEvent.findMany({
        where: {
          bookingId: current.id,
          status: "PROCESSED",
          id: { not: event.id },
        },
        select: { eventType: true, payload: true, receivedAt: true },
      })
    : [];
  const stale = previous.some((item) => webhookOccurredAt(item) > occurredAt);
  const recovered =
    !stale && normaliseEventType(event.eventType) === "bookingrecovered";
  const regressive =
    !!current &&
    !!options.status &&
    current.status !== options.status &&
    !canTransitionBookingStatus(current.status, options.status, recovered);
  const bookingId = await upsertBooking(
    tx,
    externalId,
    event.payload,
    stale || regressive || options.status === "REJECTED",
    options.status === "REJECTED",
  );
  if (options.status && !stale) {
    await updateBookingStatus(tx, bookingId, options.status, recovered);
  }
  const timestampField = {
    ACCEPTED: "acceptedAt",
    CANCELLED: "cancelledAt",
    NO_FARE: "noFareAt",
    COMPLETED: "completedAt",
  } as const;
  const applied = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    select: { status: true },
  });
  if (
    options.status &&
    !stale &&
    options.status in timestampField &&
    (options.status === "ACCEPTED" || applied.status === options.status)
  ) {
    const field = timestampField[options.status as keyof typeof timestampField];
    await tx.booking.updateMany({
      where: { id: bookingId, [field]: null },
      data: { [field]: occurredAt },
    });
  }
  await projectBookingJson(tx,{
    bookingId,externalId,event,occurredAt,
    preserveExisting:stale||regressive||options.status==='REJECTED',
    ignoreDriverAssignment:options.status==='REJECTED',
    previousBooking:current,previousEvents:previous,operationalStatus:applied.status,
  });
  const assigned = await tx.booking.findUniqueOrThrow({where:{id:bookingId}});
  const details = recoverAssignmentDetails(assigned as unknown as Record<string,unknown>,
    options.status==='REJECTED'?[]:[{kind:'webhook',id:event.id,payload:event.payload}],
    {fillOnly:stale||regressive});
  if(details.changed)await tx.booking.update({where:{id:bookingId},data:{...details.patch,assignmentDetails:details.details as Prisma.InputJsonObject}});
  await tx.webhookEvent.update({
    where: { id: event.id },
    data: { externalBookingId: externalId, bookingId },
  });
  await tx.bookingTimelineEvent.create({
    data: {
      bookingId,
      webhookEventId: event.id,
      eventType: event.eventType,
      title: options.title,
      description: options.description,
      metadata: event.payload as Prisma.InputJsonObject,
      occurredAt,
    },
  });
  const booking = await tx.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { locations: true, vias: true, timelineEvents: true },
  });
  const latest = await tx.bookingSnapshot.aggregate({
    where: { bookingId },
    _max: { version: true },
  });
  await tx.bookingSnapshot.create({
    data: {
      bookingId,
      webhookEventId: event.id,
      version: (latest._max.version ?? 0) + 1,
      eventType: event.eventType,
      snapshot: JSON.parse(JSON.stringify(booking)) as Prisma.InputJsonValue,
    },
  });
  return { bookingId, event, occurredAt };
}
