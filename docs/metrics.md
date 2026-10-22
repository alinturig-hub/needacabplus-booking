# Booking service timing

Implementation: `lib/booking-service-timing.mjs`, `bookingServiceTimingSql`.
The server executes this one SQL definition for each displayed page of canonical
bookings. Fixture tests execute the same SQL. These are read-time assessments of
current saved facts, available for historical bookings without rewriting them.
Raw unoffset Autocab values are London wall times; ambiguous/nonexistent BST
transition times require an explicit offset and otherwise remain unassessable.
Legacy normalized exports are UTC. All assessment timestamps are UTC instants; presentation uses Europe/London, including BST.
No LLM computes these values. Original payloads and operational statuses remain intact.

## Service type

Use the recorded `typeOfBooking`, then explicit equivalent JSON service fields:
ASAP/Priority/Now versus Advanced/Prebook/Prebooked/Scheduled/Guarantee.
Active/Dispatched/Archived are lifecycle categories and never imply service type.
Unknown service type produces no punctuality classification.

## Pickup punctuality and DAP

DAP means **driver arrived at pickup**, sourced from `arrivedAt` /
`VehicleArrivedAtTime`. It is distinct from the passenger-on-board timestamp.

ASAP uses recorded booking time (not the importer-created timestamp). Default
DAP deadline = booking time + 10 minutes. DAP <= deadline is On time;
10 minutes < booking-to-DAP <= 15 minutes is Late; >15 minutes is Severely late.
These are an initial operator policy, not a measured industry standard or proof
of driver fault. For an ASAP booking at 05:50:00: through 06:00:00 is on time;
06:00:00.001–06:05:00 is late; after 06:05:00 is severely late.
`BOOKING_ASAP_ON_TIME_MINUTES` and `BOOKING_ASAP_SEVERE_MINUTES` can configure these
thresholds; positive finite values with severe > on-time and severe <=180 are required.

Pre-book target window = [scheduled pickup − 5 minutes, scheduled pickup − 1 minute].
Earlier DAP is Early (not penalised); within that inclusive window is On time;
after the deadline is Late. For pickup 06:00:00, target is 05:55:00–05:59:00;
05:59:00.001 is already after the deadline. Early arrival remains successful
arrival before the deadline, but is separately labelled outside the target window.
No severe threshold is imposed on pre-books without an operator rule.

Classification uses exact elapsed seconds. Displayed minute values are rounded
to one decimal and must never be used to reclassify boundary cases.

Missing DAP on a completed/on-board booking is Unknown. On an active job, before
the deadline it is Awaiting DAP; after the deadline it is Overdue — DAP not recorded
(unconfirmed, not a claim that the driver was late). Cancelled/NoFare/Rejected
outcomes are not assessed. DAP before booking time is an invalid timeline.

## Phase durations (minutes)

`bookingToDapMinutes` = (DAP − booked time)/60 seconds.
`lateMinutes` = positive (DAP − deadline)/60 seconds; null otherwise.
`dispatchDelayMinutes` = (dispatched − booked)/60 seconds.
`dispatchToDapMinutes` = (DAP − dispatched)/60 seconds.
`acceptanceToDapMinutes` = (DAP − accepted)/60 seconds.
`dapToOnboardMinutes` = (passenger on board − DAP)/60 seconds.
Each duration requires both timestamps in chronological order; otherwise null.
Dispatch-to-DAP can include dispatch/acceptance delays and reassignment; it is not
asserted to be driving time. DAP-to-onboard is not automatically customer fault.
No promised-ETA compliance is inferred from a latest, potentially revised ETA.

## Estimated drop-off

Use the supplied drop-off time when recorded. Otherwise, require a positive
recorded estimated journey duration (`HH:MM:SS`, optionally fractional seconds)
and a usable start: recorded passenger-on-board time, then saved pickup ETA,
then scheduled pickup for pre-books. Add the duration in SQL and label the exact
basis. No estimate is generated from the punctuality allowance, straight-line
distance or an assumed speed. A saved pickup ETA may have been revised; this is
not a point-in-time accuracy/backtest metric. Recorded completion is displayed
separately; it is not assumed to be an exact passenger drop-off event.

## Human review

These assessments show service delivery and timing evidence. They do not establish
individual driver responsibility and never change a driver's status, allocation,
pay or access. No penalties, suspension or ranking are automated.
