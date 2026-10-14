export type AutocabDriverRecord = {
  id: number;
  rowVersion?: number | null;
  callsign?: string | null;
  forename?: string | null;
  surname?: string | null;
  fullName?: string | null;

  mobile?: string | null;
  telephone?: string | null;
  email?: string | null;

  badgeNumber?: string | null;
  driverLicenceNumber?: string | null;

  active?: boolean;
  suspended?: boolean;
  archivedDate?: string | null;

  companyId?: number | null;
  shiftPatternId?: number | null;
  fleetOwnerId?: number | null;

  postalAddress?: {
    summaryText?: string | null;
  } | null;

  badgeExpiryDate?: string | null;
  cpcExpiryDate?: string | null;
  dbsExpiryDate?: string | null;
  digitalTachographExpiryDate?: string | null;
  driverLicenceExpiryDate?: string | null;
  insuranceExpiryDate?: string | null;
  medicalCardExpiryDate?: string | null;

  capabilities?: unknown;
  [key: string]: unknown;
};

export type DriverSyncSource =
  | "MANUAL"
  | "SCHEDULED"
  | "SYSTEM";

export type DriverSyncResult = {
  jobId: string;
  status: "SUCCESS" | "PARTIAL" | "FAILED";
  startedAt: Date;
  finishedAt: Date;
  durationMs: number;

  recordsReceived: number;
  recordsEligible: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  recordsDisabled: number;
  recordsFailed: number;

  nextSyncAt: Date;
  message: string;
};
