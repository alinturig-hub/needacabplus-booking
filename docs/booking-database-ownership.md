# Booking database ownership

## Target

Need A Cab Plus owns the operational PostgreSQL database and the booking write path. TaxiCRM reads the same booking rows for customer profiles and reporting. A booking is stored once, with `(provider, externalId)` identifying an Autocab booking. TaxiCRM keeps its CRM-specific writes, such as customer tags and predictions, separate from the operational booking writer.

## Current state, 13 October 2026

- TaxiCRM uses its own PostgreSQL database. Its Prisma `Booking` model contains the complete Autocab booking, with dependent `BookingLocation`, `BookingVia`, `WebhookEvent`, `BookingTimelineEvent`, and `BookingSnapshot` records. Its webhook handler writes bookings and related customer records in transactions.
- Need A Cab Plus has a separate PostgreSQL database with a smaller `bookings` table. Its live customer booking path writes there, while admin search, dispatch views and the map can read TaxiCRM directly. Its webhook normalization code can also write to the smaller table, but this is not equivalent to TaxiCRM's full booking model.
- The two database containers are private Coolify resources. Their connection strings are available to the applications, but are not directly reachable from this development workspace.
- The two schemas have no identical table names in the checked-in Prisma model and Need A Cab Plus `db/init.sql`. Production schema must still be checked before any restore.

## Migration sequence

1. **Preflight:** Run `node scripts/booking-migration-preflight.mjs` from the Need A Cab Plus runtime, where `TAXICRM_DATABASE_URL` and `DATABASE_URL` are configured. Keep the JSON result. Confirm actual table collisions, database sizes and booking foreign keys. Obtain a restorable backup of **both** databases and verify it in an isolated database.
2. **Prepare the target:** Restore the TaxiCRM tables, indexes, constraints and sequences into the Need A Cab Plus PostgreSQL instance without replacing existing Need A Cab Plus tables. Preserve all booking IDs, external IDs, locations, events and snapshots. Verify row counts and foreign keys before connecting either application to the restored data. The entire TaxiCRM schema may be required initially because bookings link to customer records and other tables.
3. **Prepare application code:** Move Autocab webhook ingestion and booking status writes to Need A Cab Plus against the restored `Booking` model. Keep the webhook idempotency key and forward-only status rules. Update Need A Cab Plus search, dispatch, customer history and map reads to use its own database. Give TaxiCRM a database role that can read operational booking tables but cannot write them. Route CRM tag and prediction writes to CRM-owned tables.
4. **Cut over once:** Briefly stop booking writes at the existing TaxiCRM webhook endpoint, drain and verify accepted events, take the final incremental transfer, then switch webhook delivery and application database connections together. Record the last source event and first target event. Do not enable two active webhook writers. Booking creation must remain unavailable until the target writer is healthy; a silent fallback could create duplicates.
5. **Verify:** Compare source and target booking counts by provider, status and pickup day; inspect a sample of booking IDs including edits, cancellations and no-fare outcomes; verify locations, financial fields, customer links, timeline and webhook idempotency. Exercise a new booking through quote, Autocab acceptance, webhook updates, dispatch, completion and TaxiCRM profiling. Monitor rejected and unprocessed events. Retain the original database read-only for rollback until reconciliation is complete.

## Constraints

- The existing lowercase `bookings` table must not be treated as a complete replacement for TaxiCRM's `Booking` table. The models differ and a direct row copy would lose data.
- Changing the location of the database alone does not transfer booking ownership: the webhook writer and every other booking write path must also move.
- Do not switch the live connection strings before the target has been restored, code deployed and the event gap reconciled.
- A future Autocab/Local operating switch must be recorded per booking. Changing the default mode must not move an active booking to another dispatch engine.
