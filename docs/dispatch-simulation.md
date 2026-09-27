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
Capability IDs are matched against the driver and vehicle capability lists, with passenger capacity and requested/forbidden assignments checked. Missing or unreadable booking requirements remain blocked with an explanation. Explicit requirements are preserved across partial booking updates.
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

## Dispatch Live dashboard

`/admin/dispatch` is authenticated and reads `/api/admin/dispatch-live` every five
seconds while visible. The selected awaiting job is simulated every ten seconds;
there is no unattended scheduler and no external dispatch write. Connection
staleness and calculation failures are visible. Changing selection cancels the
previous request; assigned or accepted jobs do not generate new offers.

The dashboard separates current booking state, rule-based recommendations and
Autocab receipt history. `dispatch_observations` stores explicit booking/vehicle/
driver IDs for recognized dispatch events from authenticated webhooks. It does
not infer IDs from arbitrary nested objects or change booking state. Source event timestamps are used when available; otherwise receipt time is labelled. Identical payload retries are deduplicated by a stable fingerprint. Events are observations, never dispatch commands.
History starts after this release; existing records are not invented or backfilled.
Unmatched IDs remain visible in the all-events view. Journal write failure does
not fail a webhook whose booking was already stored.

Counters label their scope: active bookings are counted across stored real jobs;
awaiting/accepted counts refer to the latest 100 displayed records; CLEAR counts
are fresh vehicle tracks across the fleet, not necessarily eligible candidates.
Live DB payload mapping still requires operational verification. UI validation
used clearly labelled sample data locally; no sample routes ship to production.

## Booking journey and analytics

The selected booking shows the recorded offers, refusals, acceptance and arrival
in chronological order. Acceptance does not prove movement or arrival. Unknown
actors remain unidentified; responses without a matching offer cannot produce
an offer-response duration. First-offer-to-acceptance and acceptance-to-arrival
are separate metrics. Missing measurements are shown explicitly.

The authenticated analytics endpoint reports a rolling 30-day window, capped at
20,000 recent receipts with a visible partial-data notice. Driver profiles show
matched responses, refusals, unresolved offers and sample counts. Customer
contact profiles group an HMAC of the normalized booking telephone number using
ADMIN_SESSION_SECRET; they are contact groups, not verified individual identities
or personal scores. Without that secret/contact, no contact profile is created.
Changing the secret changes these grouping keys.

Recognized booking lifecycle webhooks are journalled going forward. Existing
history is not fabricated. Booking history is capped at 1,000 receipts and marks
truncation. Recommendations are stored separately as simulation snapshots, at
most once per booking per minute, with the latest 20 shown. These analytics do
not yet train a model or enable autonomous dispatch. Existing booking state
normalization is unchanged and still needs full event-order reconciliation
before automatic dispatch.