# Live Autocab JSON and the history archive

## One writer, two read representations

The authenticated webhook inbox remains `WebhookEvent`. It stores the complete
original payload and raw body. The existing canonical transaction still owns
`Booking`, locations, vias, customer links, timelines, snapshots and status rules.
No extra Search/detail request is made per webhook.

`public.autocab_bookings` is an additive cumulative JSON read model in the **live
shared database**. It is updated inside that same transaction after canonical
status handling. It is not a second ingress or an independent operational writer.
Failure of its save rolls back the canonical transaction, leaving the durable
inbox event available for retry. It uses the canonical transaction's per-booking
advisory lock and `autocab_booking_document_events` as an idempotency journal.

## Compatibility and fidelity

The separate archive database `needacabplus_archive_20261018` has an
`autocab_bookings` table too. Common columns have matching names and types:
`autocab_id`, `company_id`, `booking_type`, `archive_reason`, `pickup_due_utc`,
`booked_at_utc`, `pricing`, `archived_booking`, `pickup`, `destination`, `vias`,
`raw_payload`, `payload_sha256`, `first_fetched_at`, `last_fetched_at`.

For an eventual merge, join `autocab_id` to canonical `Booking.externalId` with
provider AUTOCAB. Never join on internal database IDs or passenger identity.
Do not simply UNION SELECT *: the live read model has extra provenance columns.

Archive `raw_payload` is the original Search booking object. Live `raw_payload`
is a **derived cumulative Search-shaped document**, identified by
`payload_origin=WEBHOOK_PROJECTION`, `projection_version=1`. These are different
source representations, not byte-identical payloads. Live `raw_webhook_payload`
is the exact latest received webhook JSON (even if delayed), while all originals
remain available in `WebhookEvent.payload` / `rawBody`.

Known financial keys are mapped from webhook casing to Search casing. Webhook
`TypeOfBooking` maps to Search `bookingType`; webhook `BookingType` is retained as
`webhookBookingType` and must not be confused with ASAP/Advanced. Webhook flat
locations become Search-style `address.text`, `address.coordinate` and
`address.zone`. Unknown fields remain in the raw event, with unknown keys also
retained in the cumulative document. The adapter does not invent Search-only
fields, archive reasons or missing commission/payment values.

New partial events merge nested objects rather than replace the complete pricing
or address object. Missing keys leave existing values intact. Explicit null and
empty arrays clear their fields; zero stays zero. Delayed/regressive events can
fill absent keys but cannot overwrite newer values, explicit nulls or arrays.
Rejected offers never become the assigned driver in the JSON read model.

On first projection of a preexisting booking, known non-null canonical values and
its previously processed webhook payloads seed the cumulative document. This is
not a guaranteed full historical reconstruction: original events absent from the
inbox cannot be recreated. The historical API archive remains a separate source.
Raw provider date strings stay unchanged. Explicit offsets remain authoritative;
offset-free webhook times use Europe/London with ambiguous/nonexistent DST wall
times left unconverted in indexed UTC columns. Historical canonical timestamp
columns are not silently reinterpreted or migrated.

## Rollout and access

Apply `scripts/migrations/20261018_live_autocab_documents.sql` to the live shared
database **before** deploying this writer. It creates only new tables and indexes;
it does not rename or drop canonical objects. The operational writer gets the
necessary DML on the new read model; configured reader roles including `cabby_ro`
get SELECT only. No PII is written to application logs.

This projects bookings touched by processed webhook events after rollout. It does
not synchronously scan/replay millions of historical events. No merge or backfill
of the ongoing archive is performed by this change.

Rollback: deploy the preceding application commit; keep the additive tables and
inbox intact. Do not drop raw events or switch ingress back to a second writer.
After fixing a projection failure, the existing durable retry mechanism processes
the event; do not reset already-PROCESSED events to manufacture a replay.

## Verification

- `node --test tests/booking-json-document.test.mjs`
- Prepare a disposable localhost Prisma database; apply the SQL migration above.
- Set `CANONICAL_WRITER_TEST_URL` to that disposable DB and run
  `npm run test:canonical-writer`.

Integration checks cover the full canonical lifecycle, concurrent and repeated
events, partial payloads, null/zero/empty values, delayed events, rejected driver
offers and rollback on a simulated read-model write failure.
Production checks must inspect real received events and table counts without
posting a fabricated booking or exposing passenger data.
