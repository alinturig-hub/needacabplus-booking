# TaxiCRM ↔ Need A Cab Plus webhook correspondence

## Production comparison, 13 October 2026, 14:46 UTC

The read-only audit is `node scripts/audit-webhook-correspondence.mjs` in the Need A Cab Plus runtime. It uses the configured database connections and prints aggregate counts plus a small booking-reference sample; it does not print payload contents.

- TaxiCRM processed 79,644 `VehicleTracksChanged` events in the previous 24 hours. Need A Cab Plus stored 160,919 vehicle positions in that period through `/tracks_change`. One event may contain several vehicle positions, so the totals must not be compared one-to-one. The latest receipt times matched within milliseconds.
- TaxiCRM processed booking events throughout the day, including 1,280 `BookingCreated`, 5,776 `BookingModified`, 1,439 `BookingDispatched`, 1,214 `BookingPOB`, and 1,199 `BookingComplete`. Need A Cab Plus booking webhook endpoints had not received an event since 11 October, and its local `bookings` table had no rows updated in the previous 24 hours. None of 37 recent TaxiCRM booking references sampled were present in the local booking table.
- This is the current single-writer arrangement, not a failed live copy: TaxiCRM still owns the full booking writer, while Need A Cab Plus reads its booking tables through a read-only connection. `TAXICRM_WEBHOOK_INGEST_DISABLED` prevents a second booking writer. Do not infer that the smaller local `bookings` table is a full substitute for TaxiCRM's `Booking` model.
- TaxiCRM journals every raw event and its processing state. Need A Cab Plus currently stores a raw event in `webhook_events` only when normalization fails. These journals do not yet have equivalent coverage or idempotency semantics.

## Event mapping

| TaxiCRM event | Need A Cab Plus endpoint | Current booking owner |
| --- | --- | --- |
| BookingCreated | `/booking_created` | TaxiCRM |
| BookingModified | `/booking_modified` | TaxiCRM |
| BookingDispatched | `/booking_dispatch` | TaxiCRM |
| BookingDispatchAccepted | `/booking_accepted` | TaxiCRM |
| BookingArrived | `/dap` | TaxiCRM |
| BookingPOB | `/pob` | TaxiCRM |
| BookingComplete | `/booking_done` | TaxiCRM |
| BookingCancelled | `/booking_cancelled` | TaxiCRM |
| BookingNoFare | `/booking_no_fare` | TaxiCRM |
| BookingRejected | `/booking_rejected` | TaxiCRM |
| BookingRecovered | `/booking_recovered` | TaxiCRM |
| BookingRunningLate | `/running_late` | TaxiCRM |
| DriverShiftStartedEnded | `/driver_shift_start` | TaxiCRM until cutover |
| VehicleTracksChanged | `/tracks_change` | Need A Cab Plus live feed |

The `/booking_dispatch` and `/booking_accepted` configuration labels were reversed. Startup migration now aligns the labels with the event delivered to each endpoint. The combined `DriverShiftStartedEnded` payload now uses its `SubEventType` and `EndedDate` to determine whether the shift started or ended.

## Path to full booking parity

The live admin comparison is available in General Settings → Webhooks. It is diagnostic and does not duplicate bookings. Full correspondence requires the single shared operational database and the booking writer cutover described in [booking-database-ownership.md](booking-database-ownership.md). That migration must preserve booking locations, via points, financial data, customer links, timeline, raw events, idempotency, and the historical recovery tables. Only after those records and code paths are reconciled should booking webhook delivery move from TaxiCRM to Need A Cab Plus.
