import { Prisma } from "@/generated/prisma/client";

export type BookingOperationalStatus =
  | "CREATED"
  | "DISPATCHED"
  | "ACCEPTED"
  | "ARRIVED"
  | "POB"
  | "COMPLETED"
  | "CANCELLED"
  | "NO_FARE"
  | "REJECTED";

type CurrentBookingStatus = BookingOperationalStatus | "ACTIVE";

const activeStatusPriority: Partial<Record<CurrentBookingStatus, number>> = {
  ACTIVE: 1,
  CREATED: 1,
  DISPATCHED: 2,
  ACCEPTED: 3,
  ARRIVED: 4,
  POB: 5,
  REJECTED: 2,
};

const terminalStatuses = new Set<BookingOperationalStatus>([
  "COMPLETED",
  "CANCELLED",
  "NO_FARE",
]);

function isTerminalStatus(status: string): status is BookingOperationalStatus {
  return terminalStatuses.has(status as BookingOperationalStatus);
}

export function canTransitionBookingStatus(
  currentStatus: string,
  nextStatus: BookingOperationalStatus,
  recovered = false,
): boolean {
  const current = currentStatus.toUpperCase() as CurrentBookingStatus;

  if (current === nextStatus) {
    return false;
  }

  if (current === "REJECTED" && nextStatus === "DISPATCHED") return true;

  /*
   * Once a booking reaches a terminal state, delayed webhooks
   * must not move it back into the operational lifecycle.
   */
  if (isTerminalStatus(current)) {
    return false;
  }

  if (recovered && nextStatus === "DISPATCHED") return true;

  /*
   * Any non-terminal booking may move directly to a terminal
   * state if intermediary events were delayed or missing.
   */
  if (isTerminalStatus(nextStatus)) {
    return true;
  }

  const currentPriority = activeStatusPriority[current];

  const nextPriority = activeStatusPriority[nextStatus];

  /*
   * Unknown provider statuses may initialise only as CREATED.
   */
  if (currentPriority === undefined) {
    return nextStatus === "CREATED";
  }

  if (nextPriority === undefined) {
    return false;
  }

  /*
   * Forward-only transitions prevent delayed webhooks from
   * regressing the booking lifecycle.
   */
  return nextPriority > currentPriority;
}

export async function updateBookingStatus(
  tx: Prisma.TransactionClient,
  bookingId: string,
  nextStatus: BookingOperationalStatus,
  recovered = false,
): Promise<void> {
  const booking = await tx.booking.findUnique({
    where: {
      id: bookingId,
    },
    select: {
      status: true,
    },
  });

  if (!booking) {
    throw new Error(`Booking not found: ${bookingId}`);
  }

  if (!canTransitionBookingStatus(booking.status, nextStatus, recovered)) {
    return;
  }

  await tx.booking.update({
    where: {
      id: bookingId,
    },
    data: {
      status: nextStatus,
    },
  });
}
