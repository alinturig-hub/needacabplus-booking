import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import {
  assignIfPresent,
  normaliseString,
  type JsonObject,
} from "@/lib/autocab/booking-mappers";

export type WebhookAfterCommit = () => Promise<void>;
export type WebhookHandler = (
  id: string,
  tx: Prisma.TransactionClient,
) => Promise<void | WebhookAfterCommit>;

export function normaliseEventType(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function webhookIdempotencyKey(event: string, payload: JsonObject) {
  return `AUTOCAB:${normaliseEventType(event)}:${createHash("sha256").update(canonicalJson(payload)).digest("hex")}`;
}

export function bookingExternalId(payload: JsonObject) {
  return (
    normaliseString(payload.OriginalBookingId) ||
    normaliseString(payload.BookingId) ||
    normaliseString(payload.Id)
  );
}

export function driverIdentityUpdate(payload: JsonObject) {
  const data: Record<string, string | null> = {};
  for (const [source, target] of [
    ["Callsign", "callsign"],
    ["Forename", "forename"],
    ["Surname", "surname"],
    ["BadgeNumber", "badgeNumber"],
    ["LicenceNumber", "licenceNumber"],
  ]) {
    assignIfPresent(data, payload, source, target, normaliseString);
  }
  return data;
}

export function vehicleIdentityUpdate(payload: JsonObject) {
  const data: Record<string, string | null> = {};
  for (const [source, target] of [
    ["Callsign", "callsign"],
    ["DeviceId", "deviceId"],
    ["VINNumber", "vinNumber"],
    ["PlateNumber", "plateNumber"],
    ["Registration", "registration"],
  ]) {
    assignIfPresent(data, payload, source, target, normaliseString);
  }
  return data;
}

export function webhookOccurredAt(event: {
  eventType: string;
  payload: unknown;
  receivedAt: Date;
}) {
  const payload = event.payload as JsonObject;
  const lifecycleField: Record<string, string> = {
    bookingcomplete: "CompletedAtTime",
    bookingdispatched: "DispatchedAtTime",
    bookingarrived: "VehicleArrivedAtTime",
    bookingpob: "PickedUpAtTime",
    bookingdispatchaccepted: "AcceptedAtTime",
    bookingcancelled: "CancelledAtTime",
    bookingnofare: "NoFareAtTime",
    bookingcreated: "BookedAtTime",
  };
  for (const key of [
    "EventTimestamp",
    "Timestamp",
    "ModifiedAtTime",
    "ModifiedDate",
    lifecycleField[normaliseEventType(event.eventType)],
  ]) {
    const value = payload?.[key];
    if (typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return event.receivedAt;
}

export async function lockWebhookEntities(
  tx: Prisma.TransactionClient,
  keys: string[],
) {
  for (const key of Array.from(new Set(keys)).sort()) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`;
  }
}

export function retryableWebhooks(
  now = new Date(),
): Prisma.WebhookEventWhereInput {
  return {
    OR: [
      { status: "RECEIVED" },
      {
        status: "FAILED",
        attemptCount: { lt: 5 },
        updatedAt: { lt: new Date(now.getTime() - 60_000) },
      },
      {
        status: "PROCESSING",
        updatedAt: { lt: new Date(now.getTime() - 5 * 60_000) },
      },
    ],
  };
}
