import { Prisma } from "@/generated/prisma/client";
import { isObject, normaliseString } from "@/lib/autocab/booking-mappers";
import {
  lockWebhookEntities,
  driverIdentityUpdate,
  vehicleIdentityUpdate,
} from "@/lib/autocab/webhook-processing";

function parseRequiredDate(value: unknown, fieldName: string): Date {
  const normalised = normaliseString(value);

  if (!normalised) {
    throw new Error(`Missing ${fieldName}.`);
  }

  const date = new Date(normalised);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${fieldName}: ${normalised}`);
  }

  return date;
}

function parseOptionalDate(value: unknown): Date | null {
  const normalised = normaliseString(value);

  if (!normalised) {
    return null;
  }

  const date = new Date(normalised);

  return Number.isNaN(date.getTime()) ? null : date;
}

export async function processDriverShiftStartedEndedWebhook(
  webhookEventId: string,
  tx: Prisma.TransactionClient,
): Promise<void> {
  const webhookEvent = await tx.webhookEvent.findUnique({
    where: {
      id: webhookEventId,
    },
    select: {
      id: true,
      status: true,
      payload: true,
    },
  });

  if (!webhookEvent) {
    throw new Error(`WebhookEvent not found: ${webhookEventId}`);
  }

  if (webhookEvent.status === "PROCESSED") {
    return;
  }

  if (!isObject(webhookEvent.payload)) {
    throw new Error("Webhook payload is not a JSON object.");
  }

  const payload = webhookEvent.payload;

  if (!isObject(payload.Driver)) {
    throw new Error("Missing Autocab driver payload.");
  }

  const driverPayload = payload.Driver;

  const driverExternalId = normaliseString(driverPayload.Id);

  if (!driverExternalId) {
    throw new Error("Missing Autocab driver ID.");
  }

  const startedAt = parseRequiredDate(payload.StartedDate, "StartedDate");

  const endedAt = parseOptionalDate(payload.EndedDate);
  const modifiedAt = parseOptionalDate(payload.ModifiedDate);

  const subEventType = normaliseString(payload.SubEventType) ?? "Unknown";

  const kind = subEventType.toLowerCase();
  if (kind !== "started" && kind !== "ended") {
    throw new Error(
      "Unknown driver shift SubEventType; expected Started or Ended.",
    );
  }
  const isEnded = kind === "ended";
  if (isEnded && normaliseString(payload.EndedDate) && !endedAt)
    throw new Error("Invalid EndedDate.");
  if (isEnded && endedAt && endedAt < startedAt)
    throw new Error("EndedDate precedes StartedDate.");

  const durationSeconds =
    isEnded && endedAt
      ? Math.max(
          0,
          Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
        )
      : null;

  await lockWebhookEntities(tx, [`AUTOCAB:driver:${driverExternalId}`]);
  const driver = await tx.driver.upsert({
    where: {
      provider_externalId: {
        provider: "AUTOCAB",
        externalId: driverExternalId,
      },
    },
    create: {
      provider: "AUTOCAB",
      externalId: driverExternalId,
      callsign: normaliseString(driverPayload.Callsign),
      forename: normaliseString(driverPayload.Forename),
      surname: normaliseString(driverPayload.Surname),
      badgeNumber: normaliseString(driverPayload.BadgeNumber),
      licenceNumber: normaliseString(driverPayload.LicenceNumber),
      rawPayload: driverPayload as Prisma.InputJsonObject,
    },
    update: {
      ...driverIdentityUpdate(driverPayload),
      rawPayload: driverPayload as Prisma.InputJsonObject,
    },
  });

  let vehicleId: string | null = null;

  if (isObject(payload.Vehicle)) {
    const vehiclePayload = payload.Vehicle;
    const vehicleExternalId = normaliseString(vehiclePayload.Id);

    if (vehicleExternalId) {
      const vehicle = await tx.vehicle.upsert({
        where: {
          provider_externalId: {
            provider: "AUTOCAB",
            externalId: vehicleExternalId,
          },
        },
        create: {
          provider: "AUTOCAB",
          externalId: vehicleExternalId,
          callsign: normaliseString(vehiclePayload.Callsign),
          deviceId: normaliseString(vehiclePayload.DeviceId),
          vinNumber: normaliseString(vehiclePayload.VINNumber),
          plateNumber: normaliseString(vehiclePayload.PlateNumber),
          registration: normaliseString(vehiclePayload.Registration),
          rawPayload: vehiclePayload as Prisma.InputJsonObject,
        },
        update: {
          ...vehicleIdentityUpdate(vehiclePayload),
          rawPayload: vehiclePayload as Prisma.InputJsonObject,
        },
      });

      vehicleId = vehicle.id;
    }
  }

  if (isEnded) {
    const toleranceMs = 2_000;

    const matchingActiveShift = await tx.driverShift.findFirst({
      where: {
        provider: "AUTOCAB",
        driverId: driver.id,
        startedAt: {
          gte: new Date(startedAt.getTime() - toleranceMs),
          lte: new Date(startedAt.getTime() + toleranceMs),
        },
      },
      orderBy: [{ status: "asc" }, { startedAt: "desc" }],
    });

    if (matchingActiveShift) {
      // A retry/older end cannot erase or regress an already recorded closure.
      if (
        matchingActiveShift.endedAt &&
        (!endedAt || endedAt < matchingActiveShift.endedAt)
      )
        return;
      const matchedDurationSeconds = endedAt
        ? Math.max(
            0,
            Math.floor(
              (endedAt.getTime() - matchingActiveShift.startedAt.getTime()) /
                1000,
            ),
          )
        : null;

      await tx.driverShift.update({
        where: {
          id: matchingActiveShift.id,
        },
        data: {
          vehicleId: vehicleId ?? matchingActiveShift.vehicleId,
          status: "ENDED",
          subEventType,
          endedAt,
          modifiedAt,
          durationSeconds: matchedDurationSeconds,
          sourceWebhookEvent: webhookEvent.id,
          rawPayload: payload as Prisma.InputJsonObject,
        },
      });
    } else {
      await tx.driverShift.upsert({
        where: {
          provider_driverId_startedAt: {
            provider: "AUTOCAB",
            driverId: driver.id,
            startedAt,
          },
        },
        create: {
          provider: "AUTOCAB",
          driverId: driver.id,
          vehicleId,
          status: "ENDED",
          subEventType,
          startedAt,
          endedAt,
          modifiedAt,
          durationSeconds,
          sourceWebhookEvent: webhookEvent.id,
          rawPayload: payload as Prisma.InputJsonObject,
        },
        update: {
          vehicleId,
          status: "ENDED",
          subEventType,
          endedAt,
          modifiedAt,
          durationSeconds,
          sourceWebhookEvent: webhookEvent.id,
          rawPayload: payload as Prisma.InputJsonObject,
        },
      });
    }
  } else {
    const endedShift = await tx.driverShift.findFirst({
      where: {
        provider: "AUTOCAB",
        driverId: driver.id,
        status: "ENDED",
        startedAt: {
          gte: new Date(startedAt.getTime() - 2000),
          lte: new Date(startedAt.getTime() + 2000),
        },
      },
    });
    if (endedShift) return;
    await tx.driverShift.upsert({
      where: {
        provider_driverId_startedAt: {
          provider: "AUTOCAB",
          driverId: driver.id,
          startedAt,
        },
      },
      create: {
        provider: "AUTOCAB",
        driverId: driver.id,
        vehicleId,
        status: "ACTIVE",
        subEventType,
        startedAt,
        endedAt: null,
        modifiedAt,
        durationSeconds: null,
        sourceWebhookEvent: webhookEvent.id,
        rawPayload: payload as Prisma.InputJsonObject,
      },
      update: {
        ...(isObject(payload.Vehicle) && vehicleId
          ? { vehicleId }
          : payload.Vehicle === null
            ? { vehicleId: null }
            : {}),
        status: "ACTIVE",
        subEventType,
        endedAt: null,
        modifiedAt,
        durationSeconds: null,
        sourceWebhookEvent: webhookEvent.id,
        rawPayload: payload as Prisma.InputJsonObject,
      },
    });
  }
}
