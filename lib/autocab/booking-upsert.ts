import { Prisma } from "@/generated/prisma/client";

import {
  buildBookingCreateData,
  buildBookingUpdateData,
  type JsonObject,
} from "@/lib/autocab/booking-mappers";
import {
  synchroniseLocation,
  synchroniseVias,
} from "@/lib/autocab/booking-synchronisers";
import { synchroniseNormalCustomer } from "@/lib/autocab/normal-customer-sync";

export async function upsertBooking(
  tx: Prisma.TransactionClient,
  externalId: string,
  payload: JsonObject,
  preserveExisting = false,
  ignoreDriverAssignment = false,
): Promise<string> {
  const existing = await tx.booking.findUnique({
    where: { provider_externalId: { provider: "AUTOCAB", externalId } },
  });
  const update = buildBookingUpdateData(payload);
  const create = buildBookingCreateData(payload, externalId);
  if (ignoreDriverAssignment) {
    for (const key of [
      "driverId",
      "driverCallSign",
      "driverForename",
      "driverSurname",
      "driverBadgeNumber",
    ] as const) {
      create[key] = null;
      delete update[key];
    }
  }
  if (preserveExisting && existing) {
    const assignmentConflict =
      (existing.driverId !== null && update.driverId !== existing.driverId) ||
      (existing.driverBadgeNumber !== null &&
        typeof update.driverBadgeNumber === "string" &&
        update.driverBadgeNumber !== existing.driverBadgeNumber);
    // A delayed event may fill gaps but must not overwrite a newer badge, fare,
    // pickup date or raw payload. Locations/vias/customer links also stay intact.
    for (const key of Object.keys(update)) {
      if (
        key === "rawPayload" ||
        (key.startsWith("driver") && assignmentConflict) ||
        existing[key as keyof typeof existing] !== null
      ) {
        delete (update as Record<string, unknown>)[key];
      }
    }
  } else if (
    existing &&
    (typeof update.driverId === "string" || update.driverId === null) &&
    update.driverId !== existing.driverId
  ) {
    Object.assign(
      update,
      {
        driverCallSign: null,
        driverForename: null,
        driverSurname: null,
        driverBadgeNumber: null,
      },
      buildBookingUpdateData(payload),
    );
  }
  const booking = await tx.booking.upsert({
    where: {
      provider_externalId: {
        provider: "AUTOCAB",
        externalId,
      },
    },
    create,
    update,
    select: {
      id: true,
    },
  });

  if (preserveExisting && existing) return booking.id;

  await synchroniseLocation(tx, booking.id, payload, "Pickup", "PICKUP");

  await synchroniseLocation(
    tx,
    booking.id,
    payload,
    "Destination",
    "DESTINATION",
  );

  await synchroniseVias(tx, booking.id, payload);

  await synchroniseNormalCustomer(tx, booking.id, payload);

  return booking.id;
}
