# Driver and vehicle details in booking views

The canonical booking reader previously projected only its generic `driver` and `vehicle` fields. Schema discovery selected the call-sign fields, after which the response placed those identifiers into `driver_data.name` and `vehicle_data.registration`. Consequently stored webhook details were not shown in the modal.

Canonical `public."Booking"` UI pages now fetch assignments in one bounded batch for the displayed booking IDs using the existing read-only reader. Snapshot forename/surname, badge, call sign and registration/plate fields have priority. Matching raw webhook assignment objects supply additional original details. Registry records are matched using the saved provider plus external/internal ID, never a call sign that could be reassigned. Raw assignment IDs/call signs that contradict the saved assignment are ignored.

Only missing details are filled from the current driver/vehicle registry (for example the driver phone or vehicle make/model/colour). Affected cards explicitly disclose current-register additions, which are not asserted to be historical snapshots. The current vehicle's driver or booking is never used to identify a past assignment. No assignment means no reconstructed driver/vehicle object. ETA remains unknown unless separately provided; it is not fabricated from identifiers or status.

Call signs now have their own rows and cannot be used as substitutes for names, badges, registration or plate numbers. Generic noncanonical source behavior and CSV export remain unchanged; large CSV exports do not perform assignment enrichment. The parent booking API retains its existing Admin/Dispatcher authentication. No booking, webhook, driver or vehicle record is written, and ingestion configuration is unchanged.

Validation: synthetic mapping cases, a PostgreSQL-compatible batched-query fixture with overlapping IDs across providers, existing schema mapper tests, TypeScript, targeted ESLint and production build. A read-only live query for booking 13215030 verified processed BookingModified/Arrived/POB events and the availability of snapshot identity/registration and matched registry phone/make/model. The exact enrichment query was also checked with `needacabplus_shared_reader`; diagnostic output contained only presence flags and no names/phone numbers.

## Saved JSON recovery (22 October 2026)

The canonical admin reader now returns both complete `BookingLocation` records,
ordered `BookingVia` records, financial/distance fields and every recorded
operational timestamp. UTC canonical timestamps are sent with an explicit `Z`;
Explicit JSON offsets are authoritative; unoffset fields from this feed use UTC,
matching the canonical columns (verified on the supplied booking references). Estimated pickup
is only populated from an actual `EstimatedPickupTime`, never from journey
`estimatedTime`. Missing events are labelled **Not recorded**. Other missing
values are labelled **Not supplied by source**. `Archived` is displayed as
**Historical record**; the operational outcome remains Completed, Cancelled, etc.
The complete saved source JSON includes the merged webhook document where present.

`Booking.assignmentDetails` retains assignment snapshot attributes not represented
by scalar columns, including full name, phone, make/model/colour and per-field
source IDs. New webhooks update this inside the existing per-booking transaction,
before snapshots are written. A changed assignment clears previous attributes;
explicit unassignment is respected. Rejected offers cannot assign a driver or
vehicle. Sparse updates to the same pickup/destination retain omitted zone and
coordinate attributes; a different address cannot inherit the old coordinates.

### Historical repair

Apply `scripts/migrations/20261022_booking_assignment_details.sql` before deploying
the writer. Run `node scripts/repair-booking-details.mjs` in the application
container. This script refuses any database other than the current shared live
host/database. Controls: `BOOKING_DETAILS_BATCH` (1–1000; default 250),
`BOOKING_DETAILS_MINUTES` (default 55), `BOOKING_DETAILS_MAX` (default 3,000,000),
`BOOKING_DETAILS_DRY_RUN=true` (one rolled-back batch).

The job scans every pre-cutoff AUTOCAB booking. It uses canonical original JSON,
merged documents, processed non-rejection webhooks and all matching original-ID
archive stages. Assignment identities require exact IDs; missing IDs may only
be recovered from an original-reference and final-outcome matching archive or
an authoritative modern canonical payload. Call signs are never identity keys.
No current register attributes are written into historical facts. Legacy flattened
JSON attributes without an identity are retained as explicitly legacy snapshots.

Existing nonempty facts, including zero fares, win. The one correction exception
is a numeric registration proven to be a matched vehicle's call sign, when that
same source supplies a real registration. General route/timeline recovery uses
the canonical JSON or an original-ID/outcome matching archive, supplements an
existing location only at the same exact address, and never invents a completion,
NoFare event, ETA or drop-off time. Unknown source fields stay in original JSON.

`autocab_history.assignment_repair_progress` checkpoints the fixed cutoff and
last canonical ID. `assignment_repair_audit` records before/after booking fields,
location/via details and sources. Each batch commits facts, audit and checkpoint
atomically, under the same booking locks used by live ingestion. A failed batch
rolls back and can be retried. Historical repairs preserve `Booking.updatedAt`,
raw payload, operational status and existing money. No API calls to Autocab,
notifications, driver allocation, penalties or fictitious webhook events occur.

Pause by disabling its scheduled task or stopping the process; committed batches
remain valid. Restart the same command to resume. An audit-backed rollback must
compare the current field to the recorded repaired value before restoring its
before-value, so later real webhook updates cannot be erased. Do not drop the
snapshot column while a deployed application uses it.
