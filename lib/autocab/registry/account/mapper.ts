import { Prisma } from "@/generated/prisma/client";

import type { AutocabAccountRecord } from "./types";

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
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

export function mapAutocabAccount(
  account: AutocabAccountRecord,
  syncedAt: Date,
) {
  const companyId =
    account.companyId ??
    account.company?.id ??
    null;

  const companyName =
    stringValue(account.companyName) ??
    stringValue(account.company?.name);

  return {
    provider: "AUTOCAB",
    externalId: String(account.id),
    accountCode:
      stringValue(account.accountCode) ??
      String(account.id),
    displayName:
      stringValue(account.displayName),
    accountType:
      stringValue(account.accountType),
    active: account.active !== false,
    suspended: account.suspended === true,
    suspendedReason:
      stringValue(account.suspendedReason),
    companyId:
      companyId === null
        ? null
        : String(companyId),
    companyName,
    contactName:
      stringValue(account.contactName),
    telephone:
      stringValue(account.telephone),
    email:
      stringValue(account.email),
    rawPayload: jsonValue(account),
    lastSyncedAt: syncedAt,
  };
}
