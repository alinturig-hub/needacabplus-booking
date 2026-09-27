# Dispatch simulation

Admin → Configuration → Dispatch rules contains a read-only planning simulator.
It cannot call the Autocab dispatch endpoint, reserve vehicles or change bookings.
Automatic dispatch is disabled in both the settings UI and settings API.

The example uses editable travel times and a fictional 15:00 pickup. Refusal
excludes that candidate for this example; acceptance stops recommendations.
The midpoint of the fastest and slowest selected candidates is displayed.
Dispatch-by uses the maximum of each candidate's travel time plus all preceding
acceptance windows (including its own), plus the configured travel buffer.
The arrival target defaults to five minutes before pickup. These are estimates,
not an arrival guarantee. Example settings update immediately; live snapshots
use saved settings.

## Real booking snapshots

`GET /api/admin/dispatch-simulation` returns the latest 100 awaiting bookings and
receipt metadata for the three configured webhook paths. It requires admin auth.
The UI polls this metadata every 30 seconds while mounted, not in the background.

`POST /api/admin/dispatch-simulation` accepts only an internal booking UUID and
requires same-origin plus admin auth. It reads fresh eligible fleet data and
calculates a single-booking snapshot. It never sends a dispatch request.
Eligible vehicles have a position no older than two minutes, CLEAR status,
an open driver shift, no current booking and no suspended driver/vehicle.
Only the Plymouth companies and the saved maximum radius are considered.
Up to 20 nearby cars are checked. Candidates are ranked by estimated travel time.
Capability-specific or unknown requirements are blocked pending verified mapping.
The older selection strategy and radius expansion values are retained in storage
but hidden from this simulator; it always ranks by estimated ETA inside the maximum radius and requires
working, non-suspended drivers.

By default the simulator uses track positions keyed by vehicle and driver ID.
Ten minutes of recent tracks supply moving segment speeds. Segments shorter than
10 seconds, longer than 120 seconds, below 5 mph or above 60 mph are excluded.
At least three usable segments are required. Their median is clamped to 8–30 mph;
otherwise the configurable fallback speed (18 mph initially) is used and labelled.
Straight-line GPS distance is multiplied by a configurable allowance (1.4 initially).
This is explicitly an approximate, uncalibrated ETA, not a road or traffic ETA.
Validate it against actual trips before any operational dispatch use.

Optionally configure `DISPATCH_OSRM_URL` on the server to an operator-controlled OSRM base
URL for route estimates. There is no default public demo service. The adapter
uses `/table/v1/driving/...` with vehicle sources and the pickup destination,
seconds as units, an eight-second timeout and no straight-line fallback.
See https://project-osrm.org/docs/v5.24.0/api/#table-service.
OSRM estimates do not include live traffic. Without this service, the track-based approximation remains available with a visible warning.

## Remaining before automatic dispatch

- Verify authentic accepted/rejected/dispatched JSON and the event-to-vehicle
  relationship. Receipt counts are not proof of correct payload mapping.
- Implement durable offers with event ordering, replay handling, timeout
  reconciliation, rejection cooldown and recovery/cancellation semantics.
- Correlate customer-created bookings with Autocab IDs and payment readiness.
- Verify capabilities and company matching against actual operator data.
- Add multi-booking reservations, continuous worker scheduling and live ETA
  monitoring after acceptance. A snapshot does not prevent another booking
  from recommending the same car.
- Integrate the supplied vehicle dispatch API only after these are validated.

No webhook normalization or production booking state transitions were changed
by this simulation feature.
