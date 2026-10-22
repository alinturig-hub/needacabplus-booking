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

function retainOmittedLocationData(
  data: NonNullable<ReturnType<typeof buildLocationData>>,
  source: JsonObject,
  existing: ReturnType<typeof buildLocationData> | undefined,
) {
  // A sparse update for the same address is not a removal of its zone or coordinates.
  // A changed address must not inherit coordinates from the previous stop.
  if (existing?.address === data.address) {
    for (const [group, fields] of [
      ["Zone", [["Id", "zoneId"], ["Descriptor", "zoneDescriptor"], ["Name", "zoneName"]]],
      ["Coordinates", [["Latitude", "latitude"], ["Longitude", "longitude"]]],
    ] as const) {
      const incoming = getObject(source, group);
      for (const [sourceKey, target] of fields) {
        if (!hasOwn(source, group) || (incoming && !hasOwn(incoming, sourceKey))) {
          (data as Record<string, unknown>)[target] = existing[target];
        }
      }
    }
  }

}


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
        address: true,
        latitude: true,
        longitude: true,
        zoneId: true,
        zoneDescriptor: true,
        zoneName: true,
      },
    });

  retainOmittedLocationData(data, location, existing);

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
  const previous = vias?.length ? await tx.bookingVia.findMany({where:{bookingId}}) : [];

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

      retainOmittedLocationData(data, via, previous.find(item=>item.position===index));
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
