# Native dispatch rules — implemented core and connection boundary

The native rule engine is `lib/native-dispatch-engine.ts`. Rules are stored
under `operations_settings.dispatch.nativeRules`, independently of the older
travel-time simulator. Admin → Dispatch → Rules & simulation edits these rules
and previews synthetic offer schedules. This does not send live offers.

## Confirmed business rules

- Zone queue: eligible, fresh-GPS drivers join FIFO when entering a published zone.
- A refusal, including an expired offer, moves the driver to the tail and removes
  No Fare priority. That driver is excluded from this booking's later offers.
- An explicit refusal opens the next planned offer immediately if nobody else
  currently has an open offer. Existing open offers otherwise remain available.
- Progressive offers use a shared deadline T and spacing T/N. 60 seconds / 5
  drivers opens at 0, 12, 24, 36 and 48 seconds; all expire at second 60.
- Progressive disabled: one driver per round, for the full configured duration.
- Acceptance consumes No Fare priority and closes other offers for that booking,
  plus any other offers to the now-busy driver, within the engine state.
- Customer cancellation or No Fare after acceptance but before POB grants priority
  again. The original cancelled/no-fare outcome stays distinct.
- No Fare priority moves with the driver. In a new zone, No Fare drivers already
  there remain ahead. Ordinary FIFO drivers follow the No Fare group.
- Nearest-car priority applies only to that driver's nearest eligible waiting job,
  not to every distant booking. Distance is geographical miles in this core.
- Cash disabled turns effective No Fare priority off at every planning call.
  Cash-off events clear outstanding in-memory grants. An authenticated live
  adapter must also process the policy change before re-enabling priority.
- Minimum fare + waiting-time charging is a separate payments feature and is
  not implemented by this rule engine.
- Automatic method selection uses the first matching explicit metric rule,
  otherwise the configured fallback. No LLM/AI service is currently connected.
- Missing zone has no implicit fallback in zone mode. Overlapping published
  polygons are rejected; backup/feeder rules are not invented.

## Driver App integration still required

A separate Driver App pilot is available at `drivers.needacabplus.app`, with
invited accounts, foreground GPS, integrated road routing, voice instructions and
training job lifecycle events. `/driver/preview` is a public design preview.
Accounts and training offers are managed under Configuration → Apps → Driver.
Training jobs are database-constrained and never update customer bookings or payments.
Real native offer delivery remains unconnected. Routing uses a configurable HTTPS
OSRM service (`DRIVER_ROUTING_URL`); the pilot defaults to the public OSRM server.
Live traffic, speed limits and native background navigation are not included.

The map-first workspace uses a compact online/offline dock with an expandable
status sheet, a home map preview, recentering and device-local voice/follow
preferences. Offered training trips show a road route via pickup to destination
with separate pickup and trip estimates before acceptance. The map camera reserves
space for the measured sheet height. Service/cash filters, demand heatmaps and
rewards are not simulated; operator eligibility and live dispatch remain separate.

Before real offer delivery, connect this core to:

1. An authenticated driver identity, eligibility/capability checks and fresh GPS.
2. Only the published live zone snapshots, never draft geometry.
3. Durable queue entry timestamps, priority grants and deduplicated lifecycle IDs.
4. A transactional booking + driver claim, persisted offer round and outbox.
   Database locks/CAS must ensure two devices or workers cannot accept the same
   booking or assign the same driver to two bookings. Pure reducer tests do not
   replace this cross-process guarantee.
5. A server scheduler for offer opening and expiry, and push/poll delivery.
6. Trusted customer cancellation and DOW/DAP/POB/Completed events; driver payloads
   must not be allowed to fabricate a cancellation or choose event timestamps.
7. Persisted cash-policy invalidation so old priority cannot reappear after an
   off/on cycle, including periods with no GPS events.

The admin API is deliberately configuration/simulation-only. It does not accept
arbitrary driver events or claim that native live delivery is available.


Driver navigation uses a close, heading-up camera with a route overview toggle.
A moving device GPS heading takes precedence; otherwise the matched road segment
supplies the bearing. GPS positions are only visually snapped near the road with
good accuracy. Routing synchronizes a fresh foreground GPS fix before requesting
the route. OSRM segment distance/duration annotations drive remaining distance and
ETA where available; uncertain GPS does not trigger rerouting, and deviations must
persist before recalculation. This remains estimated routing without live traffic.


Following also applies while online without a job. The vehicle uses a fixed screen
anchor while the map interpolates GPS/camera movement underneath it. Reliable moving
GPS course, or sufficient accurate displacement, updates heading along the shortest
angular path; stationary/noisy fixes retain the last reliable course. Manual map
exploration pauses follow and resumes after eight seconds of inactivity. Explicit
follow preferences disable this automatic return until the driver recenters.


Offered jobs use a separate floating card and full-route overview (driver → pickup
→ destination), with a passenger pickup marker, destination marker, separate road
ETAs/distances, fare and an acceptance countdown. `service_type` persists ASAP,
Priority, Prebook or Guarantee; the operator selects the label when sending a
training offer. These labels do not enable live dispatch or change fare rules.
Public previews accept `?service=ASAP|Priority|Prebook|Guarantee`. Accepted trip
navigation and the expandable passenger/destination/fare panel are unchanged.
