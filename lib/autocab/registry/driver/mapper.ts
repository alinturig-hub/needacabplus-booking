import { Prisma } from "@/generated/prisma/client";

import type { AutocabDriverRecord } from "./types";

function normaliseString(
  value: unknown,
): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function normaliseInteger(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isInteger(value)
  ) {
    return value;
  }

  return null;
}

function normaliseDate(
  value: unknown,
): Date | null {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    return null;
  }

  const result = new Date(value);

  return Number.isNaN(result.getTime())
    ? null
    : result;
}

function toJsonValue(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

export function mapAutocabDriver(
  driver: AutocabDriverRecord,
  syncedAt: Date,
) {
  const externalId = String(driver.id);

  const forename =
    normaliseString(driver.forename);
  const surname =
    normaliseString(driver.surname);

  const generatedFullName = [forename, surname]
    .filter(Boolean)
    .join(" ");

  const active = driver.active === true;
  const archived =
    normaliseDate(driver.archivedDate) !== null;

  return {
    provider: "AUTOCAB",
    externalId,

    rowVersion:
      normaliseInteger(driver.rowVersion),
    callsign:
      normaliseString(driver.callsign),
    forename,
    surname,
    fullName:
      normaliseString(driver.fullName) ||
      generatedFullName ||
      null,

    mobile:
      normaliseString(driver.mobile),
    telephone:
      normaliseString(driver.telephone),
    email:
      normaliseString(driver.email),

    badgeNumber:
      normaliseString(driver.badgeNumber),
    licenceNumber:
      normaliseString(
        driver.driverLicenceNumber,
      ),

    active,
    suspended:
      driver.suspended === true,
    archived,

    companyId:
      normaliseInteger(driver.companyId),
    shiftPatternId:
      normaliseInteger(driver.shiftPatternId),
    fleetOwnerId:
      normaliseInteger(driver.fleetOwnerId),

    postalAddressSummary:
      normaliseString(
        driver.postalAddress?.summaryText,
      ),

    badgeExpiryDate:
      normaliseDate(driver.badgeExpiryDate),
    cpcExpiryDate:
      normaliseDate(driver.cpcExpiryDate),
    dbsExpiryDate:
      normaliseDate(driver.dbsExpiryDate),
    tachographExpiryDate:
      normaliseDate(
        driver.digitalTachographExpiryDate,
      ),
    licenceExpiryDate:
      normaliseDate(
        driver.driverLicenceExpiryDate,
      ),
    insuranceExpiryDate:
      normaliseDate(
        driver.insuranceExpiryDate,
      ),
    medicalCardExpiryDate:
      normaliseDate(
        driver.medicalCardExpiryDate,
      ),

    capabilities:
      toJsonValue(driver.capabilities),

    lastApiSyncAt: syncedAt,
    lastSeenInApiAt: syncedAt,
    markedInactiveAt: active
      ? null
      : syncedAt,

    rawPayload: toJsonValue(driver),
  };
}
