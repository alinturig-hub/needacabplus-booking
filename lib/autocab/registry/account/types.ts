export type AutocabAccountRecord = {
  id: number;
  rowVersion?: number | null;
  accountType?: string | null;
  active?: boolean | null;
  displayName?: string | null;
  accountCode?: string | null;
  companyId?: number | null;
  company?: {
    id?: number | null;
    name?: string | null;
  } | null;
  suspended?: boolean | null;
  suspendedReason?: string | null;
  companyName?: string | null;
  contactName?: string | null;
  telephone?: string | null;
  email?: string | null;
  waitingTimeMinutesFree?: number | null;
  rawPayload?: unknown;
  [key: string]: unknown;
};

export type AccountSyncResult = {
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
