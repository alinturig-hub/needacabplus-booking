# Shift-aware Autocab availability

Canonical fleet reads now derive availability from `DriverShift`, `Driver`, `Vehicle` and `Booking`, rather than interpreting the last `Clear` GPS record as a current working state. This covers the shared TaxiCRM reader used by public map markers, available-driver lists, fleet maps and freshness counts. The corresponding TaxiCRM fleet API uses the same SQL fragment.

The newest shift for both the current driver and vehicle must be the same shift, with status ACTIVE, no end date and an exact vehicle association. A later shift on another vehicle or with another driver invalidates the previous pair. Missing shift evidence fails closed. A delayed GPS or completed booking cannot reopen an ended shift. A newer shift is not blocked by the closure of an earlier shift.

Assigned bookings within that shift take priority over the GPS status: DISPATCHED/ACCEPTED → DOW, ARRIVED → DAP, POB → POB. A terminal event clears its own referenced job only if there is no other active assigned booking and the shift remains open. Future-dated shifts are ignored. New jobs are found using the driver's external ID and the vehicle's external ID when available; missing booking vehicle IDs conservatively block availability for that driver. Completed historical jobs from earlier shifts cannot clear the current vehicle.

Availability also requires a position at or after login, within the existing consumer freshness window, and an active, unsuspended vehicle. A position more than 30 seconds in the future is excluded. Historical fleet rows remain available as offline/stale records, never counted as free. Public markers still omit names and operational callsigns.

No production rows, schema or webhook processing order are changed. Existing monotonic shift handling and canonical booking state transitions remain the event store. The legacy lowercase-table fallback is unchanged; this rollout targets the current shared canonical database configuration.

Validation: an in-memory PostgreSQL regression runs the actual SQL through login, dispatch, arrival, POB, completion, another job, logout, delayed position/completion, a new shift, driver/vehicle reassignment, stale positions and suspension. Existing driver webhook and map interpolation tests also pass. A read-only production query completed successfully on 1 November 2026 at 08:14 UTC; it classified 6 recent available cars, 6 POB, 3 assigned and 2 arrived vehicles, excluding 282 records without a matching open shift. These counts are a point-in-time snapshot, not fixed expected totals.

Publish the Need A Cab Plus and TaxiCRM changes together for consistent map and summary counts. Until deployed, production still uses its previous availability rules.

## External driversInfo receivers

`driversinfo-pusher.js` targets both `https://api.plymhub.app/api/webhook/driversInfo` and `https://testapi.plymhub.app/api/webhook/driversInfo`. Its previous query filtered snapshots to Clear before selecting the latest record, which could resurrect a driver with a later busy snapshot. It also did not enforce shifts. It now reads canonical Vehicle state through the same `fleet-lifecycle.mjs` query as the fleet API.

The outgoing contract remains `{ generatedAt, count, drivers }`, with driver fields `callsign`, `name`, `status: CLEAR`, `lat`, `lng`, external Autocab `driverId`, external Autocab `carId` and `updatedAt`. The existing exclusion for callsign 926 and the two-minute freshness window are preserved. Both receivers get byte-identical snapshots. Successful empty reads send an empty list to remove old cars; failed reads send nothing. An overlapping timer cannot publish snapshots out of order, and failure at one receiver does not prevent attempting the other.

Run `node --test driversinfo-pusher.test.cjs`. Five tests cover the real PostgreSQL query, contract, both destinations, empty/failing reads, receiver failure and timer overlap. No real POST was made during validation. Direct GET checks to both receivers returned HTTP 403 with error code 1010 from this environment, so reception/acceptance is not confirmed. They are not listed as hosted apps/services in the connected Coolify inventory. The existing pusher's running process/service was not located; `server.mjs` does not start it. Deployment must update/restart the actual standalone pusher against the active shared database in addition to the two web applications. Remove any older duplicate pusher before enabling the replacement.
