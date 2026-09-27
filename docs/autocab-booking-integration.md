# Autocab booking integration status

The operator documentation supplied on 27 September 2026 confirms:

- Quote: POST `/booking/v1/quote`.
- Create: POST `/booking/v1/booking`.
- `third-party-user: Need A Cab Plus` identifies this application.
- `capabilities` is an array of integer IDs. Preserve the IDs and full resolved
  pickup/via/destination objects from the accepted quote, with company 1.
- `pricing.price` and `pricing.bookingPrice` contain the final customer total
  in GBP. `isManual: true`, `pricingTariff: "Manually Entered"` preserve the fixed price.
- The user confirmed that `cost` and `bookingCost` retain the independent values
  returned by Autocab. They are never copied from the customer price or marked up.
- `hold: true` prevents dispatch. `override=true` bypasses validation warnings
  and is intentionally not sent.

## Implemented

`buildAutocabBookingRequest` constructs and validates the documented request.
It uses actual passenger details/count supplied to it, validates vehicle capacity,
retains ordered vias and capability IDs, refreshes the ASAP timestamp, preserves
prebook UTC time, and sets a stable `ourReference` derived from the quote ID.
It omits account customer IDs, return journey fields and arbitrary priority overrides.
New quote tokens retain verified `outward.cost` and `outward.bookingCost` encrypted.
Missing costs block request preparation; quotes can still display a passenger price.

Configuration → API → Make a booking opens a preset for `booking.create` on the
existing quote connection. Saving the preset does not enable customer booking.
The held-create transport sends an exact body (never merged with demo JSON), adds
the caller header, omits override and makes one attempt with no automatic retries.
It is not called by the customer confirmation route yet.

POST `/api/admin/autocab/booking-preview` accepts a valid `quoteToken` and `passenger`
object (name, telephoneNumber, customerEmail, passengers, luggage, driverNote).
An authenticated administrator can inspect the prepared body with `sent: false`.
This route never creates a booking or sends personal details to Autocab.

## Remaining before customer activation

The success/validation response schema is still needed to parse the booking ID and
warnings correctly. Implement a durable submission record before any external call;
reconcile ambiguous timeouts by reference rather than resubmitting blindly.
`ourReference` is a correlation reference, not proof of upstream idempotency.

Stripe wallet setup currently saves cards only. Implement payment authorization,
required customer authentication, failure compensation and the chosen capture policy
before activating card-only customer booking. Obtain the documented hold release /
dispatch operation before releasing a held booking. Do not infer a payment type or
payment reference field not present in the supplied create documentation.

The customer confirmation still creates a local test booking, with no Autocab
creation, card charge or driver dispatch. Actual passenger count must be collected
and used consistently in quote and create before that flow becomes live.
