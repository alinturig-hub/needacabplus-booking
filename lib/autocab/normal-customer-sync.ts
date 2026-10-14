import { Prisma } from "@/generated/prisma/client";

import {
  normaliseString,
  type JsonObject,
} from "@/lib/autocab/booking-mappers";

export function normaliseCustomerTelephone(
  value: unknown,
): string | null {
  const telephone = normaliseString(value);

  if (!telephone) {
    return null;
  }

  const compact = telephone.replace(
    /\s+/g,
    "",
  );

  const digits = compact.replace(
    /[^0-9]/g,
    "",
  );

  if (/^0044[0-9]{10}$/.test(digits)) {
    return `0${digits.slice(4)}`;
  }

  if (/^44[0-9]{10}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }

  if (/^7[0-9]{9}$/.test(digits)) {
    return `0${digits}`;
  }

  if (/^0[0-9]{10}$/.test(digits)) {
    return digits;
  }

  // Keep unknown or international formats stable.
  // They require explicit country-aware handling and
  // must not be merged into a UK profile by assumption.
  return compact;
}

export async function synchroniseNormalCustomer(
  tx: Prisma.TransactionClient,
  bookingId: string,
  payload: JsonObject,
): Promise<void> {
  const account =
    typeof payload.Account === "object" &&
    payload.Account !== null &&
    !Array.isArray(payload.Account)
      ? payload.Account
      : null;

  if (account) {
    return;
  }

  const telephone =
    normaliseCustomerTelephone(
      payload.TelephoneNumber,
    );

  if (!telephone) {
    return;
  }

  const displayTelephone =
    normaliseString(
      payload.TelephoneNumber,
    ) ?? telephone;

  const displayName =
    normaliseString(payload.Name);

  const email =
    normaliseString(
      payload.CustomerEmail,
    );

  const booking =
    await tx.booking.findUnique({
      where: {
        id: bookingId,
      },
      select: {
        bookedAtTime: true,
        createdAt: true,
      },
    });

  const bookingDate =
    booking?.bookedAtTime ??
    booking?.createdAt ??
    new Date();

  const customer =
    await tx.normalCustomer.upsert({
      where: {
        normalizedTelephone: telephone,
      },
      create: {
        normalizedTelephone: telephone,
        telephoneNumber: displayTelephone,
        displayName,
        email,
        firstBookingAt: bookingDate,
        lastBookingAt: bookingDate,
      },
      update: {
        telephoneNumber: displayTelephone,
        ...(displayName
          ? { displayName }
          : {}),
        ...(email
          ? { email }
          : {}),
        lastBookingAt: bookingDate,
      },
      select: {
        id: true,
      },
    });

  await tx.booking.update({
    where: {
      id: bookingId,
    },
    data: {
      normalCustomerId: customer.id,
    },
  });

  await tx.booking.updateMany({
    where: {
      telephoneNumber: displayTelephone,
      normalCustomerId: null,
      accountId: null,
      accountCode: null,
      accountName: null,
    },
    data: {
      normalCustomerId: customer.id,
    },
  });
}
