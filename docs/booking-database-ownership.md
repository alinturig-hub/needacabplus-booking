# Booking database ownership

## Target

Need A Cab Plus owns the operational PostgreSQL database and the booking write path. TaxiCRM reads the same booking rows for customer profiles and reporting. A booking is stored once, with `(provider, externalId)` identifying an Autocab booking. TaxiCRM keeps its CRM-specific writes, such as customer tags and predictions, separate from the operational booking writer.

## Current state, 13 October 2026

- TaxiCRM uses its own PostgreSQL database. Its Prisma `Booking` model contains the complete Autocab booking, with dependent `BookingLocation`, `BookingVia`, `WebhookEvent`, `BookingTimelineEvent`, and `BookingSnapshot` records. Its webhook handler writes bookings and related customer records in transactions.
- Need A Cab Plus has a separate PostgreSQL database with a smaller `bookings` table. Its live customer booking path writes there, while admin search, dispatch views and the map can read TaxiCRM directly. Its webhook normalization code can also write to the smaller table, but this is not equivalent to TaxiCRM's full booking model.
- The two database containers are private Coolify resources. Their connection strings are available to the applications, but are not directly reachable from this development workspace.
- The production preflight on 13 October 2026 found 63 TaxiCRM tables, 39 Need A Cab Plus tables, and no identical table names. All six required booking tables exist.
- TaxiCRM's database occupies 48.84 GB, including an estimated 2.61 million `Booking` rows. Need A Cab Plus occupies 3.44 GB, of which 2.86 GiB is `driver_positions`. The figures are estimates from PostgreSQL statistics; exact row counts and available storage still need verification.
- Need A Cab Plus currently reads TaxiCRM bookings, fleet, dispatch and customer data, with its booking-copy and webhook-ingest paths disabled. TaxiCRM's Autocab webhook processing is active.
- No Coolify scheduled database backup is configured for either database. A verified full backup is required before any restore or connection switch.

## Physical database choice

The safest way to reach **one shared database owned operationally by Need A Cab Plus** is to transfer the smaller Need A Cab Plus schema into the existing 48.84 GB PostgreSQL database, then rename and manage that database as the Need A Cab Plus operational resource. Both applications would connect to that same database with different roles. This transfers about 3.44 GB instead of moving almost 49 GB, while preserving the 2.61 million historical booking rows and their IDs in place. The destination is still one database; the previous Coolify resource name does not define product ownership.

If the physical data must instead be copied into the current `needacabplus-db` container, the same logical design is possible, but the larger transfer requires more storage, a longer final event catch-up and a more demanding rollback. This choice must be resolved before the restore procedure is executed.

## Migration sequence

1. **Preflight:** Run `node scripts/booking-migration-preflight.mjs` from the Need A Cab Plus runtime, where `TAXICRM_DATABASE_URL` and `DATABASE_URL` are configured. Keep the JSON result. Confirm actual table collisions, database sizes and booking foreign keys. Obtain a restorable backup of **both** databases and verify it in an isolated database.
2. **Prepare the shared database:** Restore the smaller Need A Cab Plus tables, indexes, constraints and sequences into the database that already contains TaxiCRM's `Booking` rows, unless the physical destination is explicitly chosen otherwise. Preserve all IDs and timestamps. Verify row counts and foreign keys before connecting Need A Cab Plus to the shared database. Keep the existing `Booking` model intact; do not flatten it into the lowercase `bookings` table.
3. **Prepare application code:** Move Autocab webhook ingestion and booking status writes to Need A Cab Plus against the restored `Booking` model. Keep the webhook idempotency key and forward-only status rules. Update Need A Cab Plus search, dispatch, customer history and map reads to use its own database. Give TaxiCRM a database role that can read operational booking tables but cannot write them. Route CRM tag and prediction writes to CRM-owned tables.
4. **Cut over once:** Briefly stop booking writes at the existing TaxiCRM webhook endpoint, drain and verify accepted events, take the final incremental transfer, then switch webhook delivery and application database connections together. Record the last source event and first target event. Do not enable two active webhook writers. Booking creation must remain unavailable until the target writer is healthy; a silent fallback could create duplicates.
5. **Verify:** Compare source and target booking counts by provider, status and pickup day; inspect a sample of booking IDs including edits, cancellations and no-fare outcomes; verify locations, financial fields, customer links, timeline and webhook idempotency. Exercise a new booking through quote, Autocab acceptance, webhook updates, dispatch, completion and TaxiCRM profiling. Monitor rejected and unprocessed events. Retain the original database read-only for rollback until reconciliation is complete.

## Constraints

- The existing lowercase `bookings` table must not be treated as a complete replacement for TaxiCRM's `Booking` table. The models differ and a direct row copy would lose data.
- Changing the location of the database alone does not transfer booking ownership: the webhook writer and every other booking write path must also move.
- Do not switch the live connection strings before the shared database has been restored, code deployed and the event gap reconciled.
- A future Autocab/Local operating switch must be recorded per booking. Changing the default mode must not move an active booking to another dispatch engine.
