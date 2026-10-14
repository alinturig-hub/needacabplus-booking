import { Prisma } from "@/generated/prisma/client";
import {
  buildLocationData,
  getArray,
  getObject,
  hasOwn,
  isObject,
  type JsonObject,
} from "@/lib/autocab/booking-mappers";

type LocationType = "PICKUP" | "DESTINATION";

export async function synchroniseLocation(
  tx: Prisma.TransactionClient,
  bookingId: string,
  payload: JsonObject,
  payloadKey: "Pickup" | "Destination",
  type: LocationType,
): Promise<void> {
  if (!hasOwn(payload, payloadKey)) {
    return;
  }

  const location = getObject(payload, payloadKey);

  if (!location) {
    await tx.bookingLocation.deleteMany({
      where: {
        bookingId,
        type,
      },
    });

    return;
  }

  const data = buildLocationData(location);

  if (!data) {
    return;
  }

  const existing =
    await tx.bookingLocation.findUnique({
      where: {
        bookingId_type: {
          bookingId,
          type,
        },
      },
      select: {
        latitude: true,
        longitude: true,
      },
    });

  const coordinatesChanged =
    existing !== null &&
    (
      Number(existing.latitude) !==
        Number(data.latitude) ||
      Number(existing.longitude) !==
        Number(data.longitude)
    );

  await tx.bookingLocation.upsert({
    where: {
      bookingId_type: {
        bookingId,
        type,
      },
    },
    create: {
      bookingId,
      type,
      ...data,
    },
    update: {
      ...data,
      ...(coordinatesChanged
        ? {
            placeIntelligenceId: null,
          }
        : {}),
    },
  });
}
export async function synchroniseVias(
  tx: Prisma.TransactionClient,
  bookingId: string,
  payload: JsonObject,
): Promise<void> {
  if (!hasOwn(payload, "Vias")) {
    return;
  }

  const vias = getArray(payload, "Vias");

  await tx.bookingVia.deleteMany({
    where: {
      bookingId,
    },
  });

  if (!vias || vias.length === 0) {
    return;
  }

  const validVias = vias
    .map((via, index) => {
      if (!isObject(via)) {
        return null;
      }

      const data = buildLocationData(via);

      if (!data) {
        return null;
      }

      return {
        bookingId,
        position: index,
        ...data,
      };
    })
    .filter(
      (
        via,
      ): via is {
        bookingId: string;
        position: number;
        address: string;
        zoneId: string | null;
        zoneDescriptor: string | null;
        zoneName: string | null;
        longitude: Prisma.Decimal | null;
        latitude: Prisma.Decimal | null;
      } => via !== null,
    );

  if (validVias.length > 0) {
    await tx.bookingVia.createMany({
      data: validVias,
    });
  }
}
