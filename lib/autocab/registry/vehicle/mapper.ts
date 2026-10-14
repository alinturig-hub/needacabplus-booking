import { Prisma } from "@/generated/prisma/client";
import type { AutocabVehicleRecord } from "./types";

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function intValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

function dateValue(value: unknown) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function jsonValue(
  value: unknown,
): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(
    JSON.stringify(value),
  ) as Prisma.InputJsonValue;
}

export function mapAutocabVehicle(
  vehicle: AutocabVehicleRecord,
) {
  return {
    provider: "AUTOCAB",
    externalId: String(vehicle.id),
    rowVersion: intValue(vehicle.rowVersion),
    companyId: intValue(vehicle.companyId),
    callsign: stringValue(vehicle.callsign),
    make: stringValue(vehicle.make),
    model: stringValue(vehicle.model),
    colour: stringValue(vehicle.colour),
    yearOfManufacture: intValue(
      vehicle.yearOfManufacture,
    ),
    registration: stringValue(vehicle.registration),
    vehicleType: stringValue(vehicle.vehicleType),
    size: intValue(vehicle.size),
    plateNumber: stringValue(vehicle.plateNumber),
    phoneNumber: stringValue(vehicle.phoneNumber),
    isSuspended: vehicle.isSuspended === true,
    isActive: vehicle.isActive !== false,
    fleetOwnerId: intValue(vehicle.fleetOwnerId),
    ownerDriverId: intValue(vehicle.ownerDriverId),
    secondOwnerDriverId: intValue(
      vehicle.secondOwnerDriverId,
    ),
    plateExpiryDate: dateValue(vehicle.plateExpiryDate),
    insuranceExpiryDate: dateValue(
      vehicle.insuranceExpiryDate,
    ),
    motExpiryDate: dateValue(vehicle.motExpiryDate),
    roadTaxExpiryDate: dateValue(
      vehicle.roadTaxExpiryDate,
    ),
    mileage: intValue(vehicle.mileage),
    mdtId: intValue(vehicle.mdtId),
    terminalId: intValue(vehicle.terminalId),
    terminalType: stringValue(vehicle.terminalType),
    mdtVersion: stringValue(vehicle.mdtVersion),
    imei: stringValue(vehicle.imei),
    serial: stringValue(vehicle.serial),
    simNumber1: stringValue(vehicle.simNumber1),
    simNumber2: stringValue(vehicle.simNumber2),
    capabilities: jsonValue(vehicle.capabilities),
    drivers: jsonValue(vehicle.drivers),
    rawPayload: jsonValue(vehicle),
  };
}
