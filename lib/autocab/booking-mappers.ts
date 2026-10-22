import {autocabIso} from '@/lib/autocab-time.mjs';
import { Prisma } from "@/generated/prisma/client";

export function normaliseString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return null;
}

export function normaliseInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }

  return null;
}

export function normaliseDecimal(value: unknown): Prisma.Decimal | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Prisma.Decimal(value.toString());
  }

  if (typeof value === "string" && value.trim() !== "") {
    try {
      return new Prisma.Decimal(value.trim());
    } catch {
      return null;
    }
  }

  return null;
}

export function normaliseBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (value === 1 || value === "1" || value === "true") {
    return true;
  }

  if (value === 0 || value === "0" || value === "false") {
    return false;
  }

  return null;
}

export function normaliseDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const iso=autocabIso(value);
    if(iso&&Date.parse(iso)>=0)return new Date(iso);
  }

  return null;
}

export function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) {
    return undefined;
  }

  return value as Prisma.InputJsonValue;
}

export type JsonObject = Record<string, unknown>;

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(object: JsonObject, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

export function getObject(object: JsonObject, key: string): JsonObject | null {
  const value = object[key];
  return isObject(value) ? value : null;
}

export function getArray(object: JsonObject, key: string): unknown[] | null {
  const value = object[key];
  return Array.isArray(value) ? value : null;
}

function getFirstPresent(object: JsonObject, ...keys: string[]): unknown {
  for (const key of keys) {
    if (hasOwn(object, key)) {
      return object[key];
    }
  }

  return undefined;
}

function assignDecimalFromKeys(
  target: Record<string, unknown>,
  source: JsonObject,
  targetKey: string,
  ...sourceKeys: string[]
): void {
  const value = getFirstPresent(source, ...sourceKeys);

  if (value !== undefined) {
    target[targetKey] = normaliseDecimal(value);
  }
}

function getAssignedDriver(payload: JsonObject): JsonObject | null {
  const driverDetails = getObject(payload, "DriverDetails");

  return (
    (driverDetails ? getObject(driverDetails, "Driver") : null) ??
    getObject(payload, "Driver")
  );
}

function getAssignedVehicle(payload: JsonObject): JsonObject | null {
  const vehicleDetails = getObject(payload, "VehicleDetails");

  return (
    (vehicleDetails ? getObject(vehicleDetails, "Vehicle") : null) ??
    getObject(payload, "Vehicle")
  );
}

export function assignIfPresent<T>(
  target: Record<string, unknown>,
  source: JsonObject,
  sourceKey: string,
  targetKey: string,
  parser: (value: unknown) => T,
): void {
  if (hasOwn(source, sourceKey)) {
    target[targetKey] = parser(source[sourceKey]);
  }
}

export function buildLocationData(location: JsonObject): {
  address: string;
  zoneId: string | null;
  zoneDescriptor: string | null;
  zoneName: string | null;
  longitude: Prisma.Decimal | null;
  latitude: Prisma.Decimal | null;
} | null {
  const address = normaliseString(location.Address);

  if (!address) {
    return null;
  }

  const zone = getObject(location, "Zone");
  const coordinates = getObject(location, "Coordinates");

  return {
    address,
    zoneId: zone ? normaliseString(zone.Id) : null,
    zoneDescriptor: zone ? normaliseString(zone.Descriptor) : null,
    zoneName: zone ? normaliseString(zone.Name) : null,
    longitude: coordinates ? normaliseDecimal(coordinates.Longitude) : null,
    latitude: coordinates ? normaliseDecimal(coordinates.Latitude) : null,
  };
}

export function buildBookingCreateData(
  payload: JsonObject,
  externalId: string,
): Prisma.BookingCreateInput {
  const company = getObject(payload, "Company");
  const account = getObject(payload, "Account");
  const pricing = getObject(payload, "Pricing");
  const priceComparison = getObject(payload, "PriceComparison");
  const driver = getAssignedDriver(payload);
  const vehicle = getAssignedVehicle(payload);

  return {
    provider: "AUTOCAB",
    externalId,
    originalBookingId: normaliseString(payload.OriginalBookingId),
    bookingType: normaliseString(payload.BookingType),
    typeOfBooking: normaliseString(payload.TypeOfBooking),
    status: "CREATED",

    driverId: driver ? normaliseString(driver.Id) : null,
    driverCallSign: driver ? normaliseString(driver.Callsign) : null,
    driverForename: driver ? normaliseString(driver.Forename) : null,
    driverSurname: driver ? normaliseString(driver.Surname) : null,
    driverBadgeNumber: driver ? normaliseString(driver.BadgeNumber) : null,

    vehicleId: vehicle ? normaliseString(vehicle.Id) : null,
    vehicleCallSign: vehicle ? normaliseString(vehicle.Callsign) : null,
    vehicleRegistration: vehicle ? normaliseString(vehicle.Registration) : null,
    vehiclePlateNumber: vehicle ? normaliseString(vehicle.PlateNumber) : null,

    dispatchedAt: normaliseDate(payload.DispatchedAtTime),
    arrivedAt: normaliseDate(payload.VehicleArrivedAtTime),
    pickedUpAt: normaliseDate(payload.PickedUpAtTime),
    completedAt: normaliseDate(payload.CompletedAtTime),

    pickupDueTime: normaliseDate(payload.PickupDueTime),
    dropOffDueTime: normaliseDate(payload.DropOffDueTime),
    bookedAtTime: normaliseDate(payload.BookedAtTime),

    customerName: normaliseString(payload.Name),
    telephoneNumber: normaliseString(payload.TelephoneNumber),
    customerEmail: normaliseString(payload.CustomerEmail),

    paymentType: normaliseString(payload.PaymentType),
    accountType: normaliseString(payload.AccountType),
    accountId: account ? normaliseString(account.Id) : null,
    accountCode: account ? normaliseString(account.AccountCode) : null,
    accountName: account
      ? (normaliseString(account.DisplayName) ??
        normaliseString(account.Name) ??
        normaliseString(account.AccountCode))
      : null,

    companyId: company ? normaliseString(company.Id) : null,
    companyName: company ? normaliseString(company.Name) : null,
    companyRegisteredNo: company
      ? normaliseString(company.RegisteredNumber)
      : null,
    companyCode: company ? normaliseString(company.CompanyCode) : null,

    priority: normaliseInteger(payload.Priority) ?? 0,
    passengers: normaliseInteger(payload.Passengers) ?? 1,
    luggage: normaliseInteger(payload.Luggage) ?? 0,

    driverNote: normaliseString(payload.DriverNote),
    officeNote: normaliseString(payload.OfficeNote),
    ourReference: normaliseString(payload.OurReference),
    flightDetails: normaliseString(payload.FlightDetails),
    bookedBy: normaliseString(payload.BookedBy),
    bookingSource: normaliseString(payload.BookingSource),
    cabExchangeReference: normaliseString(payload.CabExchangeAgentBookingRef),
    loyaltyCardId: normaliseString(payload.LoyaltyCardID),
    loyaltyCardCostValue:
      normaliseDecimal(payload.LoyaltyCardCostValue) ?? new Prisma.Decimal(0),
    isStreetPickup: normaliseBoolean(payload.IsStreetPickup) ?? false,

    fare: pricing
      ? normaliseDecimal(getFirstPresent(pricing, "Fare", "fare"))
      : null,
    cost: pricing
      ? normaliseDecimal(getFirstPresent(pricing, "Cost", "cost"))
      : null,
    price: pricing
      ? normaliseDecimal(getFirstPresent(pricing, "Price", "price"))
      : null,
    accountAmount: pricing
      ? normaliseDecimal(
          getFirstPresent(pricing, "AccountAmount", "accountAmount"),
        )
      : null,
    cashAmount: pricing
      ? normaliseDecimal(getFirstPresent(pricing, "CashAmount", "cashAmount"))
      : null,
    cardAmount: pricing
      ? normaliseDecimal(getFirstPresent(pricing, "CardAmount", "cardAmount"))
      : null,
    extraCost: pricing ? normaliseDecimal(pricing.ExtraCost) : null,
    fixedCost: pricing ? normaliseDecimal(pricing.FixedCost) : null,
    fixedPrice: pricing ? normaliseDecimal(pricing.FixedPrice) : null,
    chargingAreaCost: pricing
      ? normaliseDecimal(pricing.ChargingAreaCost)
      : null,
    chargingAreaPrice: pricing
      ? normaliseDecimal(pricing.ChargingAreaPrice)
      : null,
    waitingTime: pricing ? normaliseDecimal(pricing.WaitingTime) : null,
    waitingTimeChargeable: pricing
      ? normaliseDecimal(pricing.WaitingTimeChargeable)
      : null,
    gratuityAmount: pricing ? normaliseDecimal(pricing.GratuityAmount) : null,
    costSource: pricing ? normaliseString(pricing.CostSource) : null,
    pricingTariff: pricing ? normaliseString(pricing.PricingTariff) : null,
    pricingSource: pricing ? normaliseString(pricing.PricingSource) : null,

    distance: normaliseDecimal(payload.Distance),
    systemDistance: normaliseDecimal(payload.SystemDistance),
    meterDistance: normaliseDecimal(payload.MeterDistance),
    meterDistanceMetres: normaliseInteger(payload.MeterDistanceAsMetres),

    gpsMeterDistance: priceComparison
      ? normaliseDecimal(priceComparison.GpsMeterDistance)
      : null,
    gpsMeterPrice: priceComparison
      ? normaliseDecimal(priceComparison.GpsMeterPrice)
      : null,
    gpsMeterPriceSource: priceComparison
      ? normaliseString(priceComparison.GpsMeterPriceSource)
      : null,
    estimatedDistance: priceComparison
      ? normaliseDecimal(priceComparison.SystemEstimatedDistance)
      : null,
    estimatedPrice: priceComparison
      ? normaliseDecimal(priceComparison.SystemEstimatedPrice)
      : null,
    estimatedPriceSource: priceComparison
      ? normaliseString(priceComparison.SystemEstimatedPriceSource)
      : null,
    estimatedTime: priceComparison
      ? normaliseString(priceComparison.EstimatedTime)
      : null,

    capabilities: jsonValue(payload.Capabilities),
    yourReferences: jsonValue(payload.YourReferences),
    promotionCodeDiscount: pricing
      ? jsonValue(pricing.PromotionCodeDiscount)
      : undefined,
    rawPayload: payload as Prisma.InputJsonObject,
  };
}
export function buildBookingUpdateData(
  payload: JsonObject,
): Prisma.BookingUpdateInput {
  const data: Record<string, unknown> = {
    rawPayload: payload as Prisma.InputJsonObject,
  };

  if (hasOwn(payload, "DriverDetails") || hasOwn(payload, "Driver")) {
    const driver = getAssignedDriver(payload);

    if (driver) {
      for (const [source, target] of [
        ["Id", "driverId"],
        ["Callsign", "driverCallSign"],
        ["Forename", "driverForename"],
        ["Surname", "driverSurname"],
        ["BadgeNumber", "driverBadgeNumber"],
      ]) {
        assignIfPresent(data, driver, source, target, normaliseString);
      }
    } else if (
      payload.Driver === null ||
      payload.DriverDetails === null ||
      getObject(payload, "DriverDetails")?.Driver === null
    ) {
      Object.assign(data, {
        driverId: null,
        driverCallSign: null,
        driverForename: null,
        driverSurname: null,
        driverBadgeNumber: null,
      });
    }
  }

  if (hasOwn(payload, "VehicleDetails") || hasOwn(payload, "Vehicle")) {
    const vehicle = getAssignedVehicle(payload);

    if (vehicle) {
      for (const [source,target] of [['Id','vehicleId'],['Callsign','vehicleCallSign'],['Registration','vehicleRegistration'],['PlateNumber','vehiclePlateNumber']]) {
        assignIfPresent(data,vehicle,source,target,normaliseString);
      }
    } else if (payload.Vehicle===null || payload.VehicleDetails===null || getObject(payload,'VehicleDetails')?.Vehicle===null) {
      Object.assign(data,{vehicleId:null,vehicleCallSign:null,vehicleRegistration:null,vehiclePlateNumber:null});
    }
  }

  const dispatchedAt = normaliseDate(payload.DispatchedAtTime);
  if (dispatchedAt) {
    data.dispatchedAt = dispatchedAt;
  }

  const arrivedAt = normaliseDate(payload.VehicleArrivedAtTime);
  if (arrivedAt) {
    data.arrivedAt = arrivedAt;
  }

  const pickedUpAt = normaliseDate(payload.PickedUpAtTime);
  if (pickedUpAt) {
    data.pickedUpAt = pickedUpAt;
  }

  const completedAt = normaliseDate(payload.CompletedAtTime);
  if (completedAt) {
    data.completedAt = completedAt;
  }

  assignIfPresent(
    data,
    payload,
    "OriginalBookingId",
    "originalBookingId",
    normaliseString,
  );
  assignIfPresent(data, payload, "BookingType", "bookingType", normaliseString);
  assignIfPresent(
    data,
    payload,
    "TypeOfBooking",
    "typeOfBooking",
    normaliseString,
  );

  assignIfPresent(
    data,
    payload,
    "PickupDueTime",
    "pickupDueTime",
    normaliseDate,
  );
  assignIfPresent(
    data,
    payload,
    "DropOffDueTime",
    "dropOffDueTime",
    normaliseDate,
  );
  assignIfPresent(data, payload, "BookedAtTime", "bookedAtTime", normaliseDate);

  assignIfPresent(data, payload, "Name", "customerName", normaliseString);
  assignIfPresent(
    data,
    payload,
    "TelephoneNumber",
    "telephoneNumber",
    normaliseString,
  );
  assignIfPresent(
    data,
    payload,
    "CustomerEmail",
    "customerEmail",
    normaliseString,
  );

  assignIfPresent(data, payload, "PaymentType", "paymentType", normaliseString);
  assignIfPresent(data, payload, "AccountType", "accountType", normaliseString);

  if (hasOwn(payload, "Account")) {
    const account = getObject(payload, "Account");

    data.accountId = account ? normaliseString(account.Id) : null;
    data.accountCode = account ? normaliseString(account.AccountCode) : null;
    data.accountName = account
      ? (normaliseString(account.DisplayName) ??
        normaliseString(account.Name) ??
        normaliseString(account.AccountCode))
      : null;
  }

  if (hasOwn(payload, "Company")) {
    const company = getObject(payload, "Company");

    data.companyId = company ? normaliseString(company.Id) : null;
    data.companyName = company ? normaliseString(company.Name) : null;
    data.companyRegisteredNo = company
      ? normaliseString(company.RegisteredNumber)
      : null;
    data.companyCode = company ? normaliseString(company.CompanyCode) : null;
  }

  assignIfPresent(data, payload, "Priority", "priority", normaliseInteger);
  assignIfPresent(data, payload, "Passengers", "passengers", normaliseInteger);
  assignIfPresent(data, payload, "Luggage", "luggage", normaliseInteger);

  assignIfPresent(data, payload, "DriverNote", "driverNote", normaliseString);
  assignIfPresent(data, payload, "OfficeNote", "officeNote", normaliseString);
  assignIfPresent(
    data,
    payload,
    "OurReference",
    "ourReference",
    normaliseString,
  );
  assignIfPresent(
    data,
    payload,
    "FlightDetails",
    "flightDetails",
    normaliseString,
  );
  assignIfPresent(data, payload, "BookedBy", "bookedBy", normaliseString);
  assignIfPresent(
    data,
    payload,
    "BookingSource",
    "bookingSource",
    normaliseString,
  );
  assignIfPresent(
    data,
    payload,
    "CabExchangeAgentBookingRef",
    "cabExchangeReference",
    normaliseString,
  );
  assignIfPresent(
    data,
    payload,
    "LoyaltyCardID",
    "loyaltyCardId",
    normaliseString,
  );
  assignIfPresent(
    data,
    payload,
    "LoyaltyCardCostValue",
    "loyaltyCardCostValue",
    normaliseDecimal,
  );
  assignIfPresent(
    data,
    payload,
    "IsStreetPickup",
    "isStreetPickup",
    normaliseBoolean,
  );

  if (hasOwn(payload, "Pricing")) {
    const pricing = getObject(payload, "Pricing");

    if (!pricing) {
      data.fare = null;
      data.cost = null;
      data.price = null;
      data.accountAmount = null;
      data.cashAmount = null;
      data.cardAmount = null;
      data.extraCost = null;
      data.fixedCost = null;
      data.fixedPrice = null;
      data.chargingAreaCost = null;
      data.chargingAreaPrice = null;
      data.waitingTime = null;
      data.waitingTimeChargeable = null;
      data.gratuityAmount = null;
      data.costSource = null;
      data.pricingTariff = null;
      data.pricingSource = null;
      data.promotionCodeDiscount = Prisma.JsonNull;
    } else {
      assignDecimalFromKeys(data, pricing, "fare", "Fare", "fare");
      assignDecimalFromKeys(data, pricing, "cost", "Cost", "cost");
      assignDecimalFromKeys(data, pricing, "price", "Price", "price");
      assignDecimalFromKeys(
        data,
        pricing,
        "accountAmount",
        "AccountAmount",
        "accountAmount",
      );
      assignDecimalFromKeys(
        data,
        pricing,
        "cashAmount",
        "CashAmount",
        "cashAmount",
      );
      assignDecimalFromKeys(
        data,
        pricing,
        "cardAmount",
        "CardAmount",
        "cardAmount",
      );
      assignIfPresent(
        data,
        pricing,
        "ExtraCost",
        "extraCost",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "FixedCost",
        "fixedCost",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "FixedPrice",
        "fixedPrice",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "ChargingAreaCost",
        "chargingAreaCost",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "ChargingAreaPrice",
        "chargingAreaPrice",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "WaitingTime",
        "waitingTime",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "WaitingTimeChargeable",
        "waitingTimeChargeable",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "GratuityAmount",
        "gratuityAmount",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        pricing,
        "CostSource",
        "costSource",
        normaliseString,
      );
      assignIfPresent(
        data,
        pricing,
        "PricingTariff",
        "pricingTariff",
        normaliseString,
      );
      assignIfPresent(
        data,
        pricing,
        "PricingSource",
        "pricingSource",
        normaliseString,
      );

      if (hasOwn(pricing, "PromotionCodeDiscount")) {
        data.promotionCodeDiscount =
          pricing.PromotionCodeDiscount === null
            ? Prisma.JsonNull
            : jsonValue(pricing.PromotionCodeDiscount);
      }
    }
  }

  assignIfPresent(data, payload, "Distance", "distance", normaliseDecimal);
  assignIfPresent(
    data,
    payload,
    "SystemDistance",
    "systemDistance",
    normaliseDecimal,
  );
  assignIfPresent(
    data,
    payload,
    "MeterDistance",
    "meterDistance",
    normaliseDecimal,
  );
  assignIfPresent(
    data,
    payload,
    "MeterDistanceAsMetres",
    "meterDistanceMetres",
    normaliseInteger,
  );

  if (hasOwn(payload, "PriceComparison")) {
    const comparison = getObject(payload, "PriceComparison");

    if (!comparison) {
      data.gpsMeterDistance = null;
      data.gpsMeterPrice = null;
      data.gpsMeterPriceSource = null;
      data.estimatedDistance = null;
      data.estimatedPrice = null;
      data.estimatedPriceSource = null;
      data.estimatedTime = null;
    } else {
      assignIfPresent(
        data,
        comparison,
        "GpsMeterDistance",
        "gpsMeterDistance",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        comparison,
        "GpsMeterPrice",
        "gpsMeterPrice",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        comparison,
        "GpsMeterPriceSource",
        "gpsMeterPriceSource",
        normaliseString,
      );
      assignIfPresent(
        data,
        comparison,
        "SystemEstimatedDistance",
        "estimatedDistance",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        comparison,
        "SystemEstimatedPrice",
        "estimatedPrice",
        normaliseDecimal,
      );
      assignIfPresent(
        data,
        comparison,
        "SystemEstimatedPriceSource",
        "estimatedPriceSource",
        normaliseString,
      );
      assignIfPresent(
        data,
        comparison,
        "EstimatedTime",
        "estimatedTime",
        normaliseString,
      );
    }
  }

  if (hasOwn(payload, "Capabilities")) {
    data.capabilities =
      payload.Capabilities === null
        ? Prisma.JsonNull
        : jsonValue(payload.Capabilities);
  }

  if (hasOwn(payload, "YourReferences")) {
    data.yourReferences =
      payload.YourReferences === null
        ? Prisma.JsonNull
        : jsonValue(payload.YourReferences);
  }

  return data as Prisma.BookingUpdateInput;
}
