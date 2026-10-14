import { Prisma } from "@/generated/prisma/client";
import { isObject, normaliseString } from "@/lib/autocab/booking-mappers";
import {
  lockWebhookEntities,
  driverIdentityUpdate,
  vehicleIdentityUpdate,
} from "@/lib/autocab/webhook-processing";

function parseOptionalInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value > 0 ? value : null;
  }

  const normalised = normaliseString(value);

  if (!normalised) {
    return null;
  }

  const parsed = Number.parseInt(normalised, 10);

  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

function parseCoordinate(value: unknown, fieldName: string): Prisma.Decimal {
  if (typeof value !== "number" && typeof value !== "string") {
    throw new Error(`Missing ${fieldName}.`);
  }

  const normalised =
    typeof value === "number" ? value.toString() : value.trim();

  if (!normalised) {
    throw new Error(`Missing ${fieldName}.`);
  }

  try {
    return new Prisma.Decimal(normalised);
  } catch {
    throw new Error(`Invalid ${fieldName}: ${normalised}`);
  }
}

function parseSnapshotDate(value: unknown): Date {
  const normalised = normaliseString(value);

  if (!normalised) {
    throw new Error("Missing VehicleTrack Timestamp.");
  }

  const date = new Date(normalised);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid VehicleTrack Timestamp: ${normalised}`);
  }

  return date;
}

function getVehicleTracks(payload: Prisma.JsonValue): Prisma.JsonObject[] {
  if (!isObject(payload)) {
    throw new Error("Webhook payload is not a JSON object.");
  }

  const tracks = payload.VehicleTracks;

  if (!Array.isArray(tracks)) {
    throw new Error(
      "VehicleTracksChanged payload does not contain VehicleTracks.",
    );
  }

  return tracks.filter((track): track is Prisma.JsonObject => isObject(track));
}

export async function processVehicleTracksChangedWebhook(
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

  const tracks = getVehicleTracks(webhookEvent.payload);

  const keys = tracks.flatMap((track) => {
    const vehicle = isObject(track.Vehicle)
      ? normaliseString(track.Vehicle.Id)
      : null;
    const driver = isObject(track.Driver)
      ? normaliseString(track.Driver.Id)
      : null;
    return [
      ...(vehicle ? [`AUTOCAB:vehicle:${vehicle}`] : []),
      ...(driver ? [`AUTOCAB:driver:${driver}`] : []),
    ];
  });
  await lockWebhookEntities(tx, keys);
  for (const track of tracks) {
    if (!isObject(track.Vehicle)) {
      throw new Error("VehicleTrack is missing the Vehicle payload.");
    }

    const vehiclePayload = track.Vehicle;
    const vehicleExternalId = normaliseString(vehiclePayload.Id);

    if (!vehicleExternalId) {
      throw new Error("VehicleTrack is missing the Autocab vehicle ID.");
    }

    const snapshotAt = parseSnapshotDate(track.Timestamp);
    const existingVehicle = await tx.vehicle.findUnique({
      where: {
        provider_externalId: {
          provider: "AUTOCAB",
          externalId: vehicleExternalId,
        },
      },
      select: { lastSeenAt: true },
    });
    if (existingVehicle?.lastSeenAt && existingVehicle.lastSeenAt >= snapshotAt)
      continue;

    let driverId: string | null = null;

    if (isObject(track.Driver)) {
      const driverPayload = track.Driver;
      const driverExternalId = normaliseString(driverPayload.Id);

      if (driverExternalId) {
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
          },
        });

        driverId = driver.id;

      }
    }

    if (!isObject(track.CurrentLocation)) {
      throw new Error(
        `VehicleTrack for vehicle ${vehicleExternalId} is missing CurrentLocation.`,
      );
    }

    const latitude = parseCoordinate(
      track.CurrentLocation.Latitude,
      "CurrentLocation.Latitude",
    );

    const longitude = parseCoordinate(
      track.CurrentLocation.Longitude,
      "CurrentLocation.Longitude",
    );

    const vehicleStatus = normaliseString(track.VehicleStatus) ?? "Unknown";

    const bookingId = parseOptionalInteger(track.BookingId);

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
        currentDriverId: driverId,
        currentStatus: vehicleStatus,
        currentBookingId: bookingId,
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastSeenAt: snapshotAt,
      },
      update: {
        ...vehicleIdentityUpdate(vehiclePayload),
        rawPayload: vehiclePayload as Prisma.InputJsonObject,
        currentDriverId: driverId,
        currentStatus: vehicleStatus,
        currentBookingId: bookingId,
        currentLatitude: latitude,
        currentLongitude: longitude,
        lastSeenAt: snapshotAt,
      },
    });

    const latestSnapshot = await tx.vehicleSnapshot.findFirst({
      where: {
        vehicleId: vehicle.id,
      },
      orderBy: {
        snapshotAt: "desc",
      },
      select: {
        snapshotAt: true,
      },
    });

    const shouldCreateSnapshot =
      !latestSnapshot ||
      snapshotAt.getTime() - latestSnapshot.snapshotAt.getTime() >= 30 * 1000;

    if (shouldCreateSnapshot) {
      await tx.vehicleSnapshot.create({
        data: {
          provider: "AUTOCAB",
          vehicleId: vehicle.id,
          driverId,
          bookingId,
          vehicleStatus,
          latitude,
          longitude,
          snapshotAt,
          sourceWebhookId: webhookEvent.id,
          rawPayload: track as Prisma.InputJsonObject,
        },
      });
    }

  }
}
