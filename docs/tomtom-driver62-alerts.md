# TomTom single-driver traffic pilot

The existing 10-second traffic worker can additionally check TomTom Incident Details for **driver ID 1364, callsign 62 only**. It is enabled only when all four runtime settings match:

- `TOMTOM_DRIVER62_ALERTS_ENABLED=true`
- `ROAD_CLOSURE_ALERTS_MODE=pilot`
- `ROAD_CLOSURE_PILOT_DRIVER_ID=1364`
- `ROAD_CLOSURE_PILOT_CALLSIGN=62`

`TOMTOM_API_KEY` must also be configured. `live` mode does not enable this TomTom pilot. A different identity, suspended/offline shift, stale GPS or traffic ban prevents its TomTom candidate and provider refresh. Recipients are checked again at the existing final send gate against their current vehicle and active paired shift. No group message endpoint is used.

While the exact target has eligible GPS, the worker fetches the fixed Plymouth-area box at most once per 120 seconds. This transient feed is dedicated to the single driver; it is not used to distribute TomTom data to the wider fleet or to serve the Admin map. Raw TomTom traffic is not written to a new database/archive. Restarting clears the feed and requires a fresh provider response; existing SQL delivery deduplication and driver cooldown persist. A failed refresh invalidates the feed, and numeric Retry-After is respected with a minimum two-minute interval.

Eligible records must have provider `timeValidity=present`, a valid explicit start instant, current start/end bounds, valid geometry and a fetch age below 120 seconds. An ongoing event without an expected end expires with the feed. Categories distinguish road closures, lane closures, works, accidents, congestion, broken-down vehicles and reported weather hazards; unsupported or unlocated events are excluded. Messages begin `TomTom reports … nearby` and refer to the reported endpoints rather than claiming a junction label is the closed street. The existing worker adds `[TRAFFIC TEST]`.

The existing proximity checks remain: within 300 m of the event geometry, at least 10 m closer over two recent GPS fixes for the same driver/vehicle, active paired shift, and rejection of implausible GPS jumps. Daily per-driver/event/type suppression and the two-minute driver cooldown apply across both sources. Nearby reports whose normalized road names match use a common key, preferring Street Manager for the same kind; distinct kinds retain closure escalation. A previously attempted closure suppresses lower-severity warnings on that canonical road key. Cross-provider matching is based on names and nearby geometry, not a guaranteed common incident identifier.

Admin → Roadworks & driver alerts → Rules & feed displays source status, last fetch and eligible count. Worker logs include the sanitized TomTom status; retained Admin-map data never drives alerts. Viewing Admin does not fetch this feed or initiate messages. Existing map requests remain separate. Archive records remain excluded. Separately enabled Council notices can complement the pilot after freshness, location, schedule and cross-source checks; see `three-source-traffic.md`.

This authorizes only the requested single-driver pilot. Confirm commercial fleet distribution/storage rights and define a separate rollout before using TomTom for other recipients. Delivery audit rows retain the generated operational message and deduplication key, not the raw provider response.
