# Traffic message ban list

Admin → Operations → Roadworks & driver alerts → Ban list.

Administrators can add up to 100 comma/newline-separated driver callsigns at once, edit a single entry or remove it. A batch is atomic. Callsigns are trimmed/uppercased; only one active, non-suspended, non-archived Autocab driver may match. Archived drivers with reused callsigns are ignored. Ambiguous/missing drivers or vehicle associations reject the whole save.

Association resolution runs at add/edit only: current vehicle → active shift → latest recorded shift. The UI labels the source and association timestamp. The selected vehicle ID is frozen until the entry is edited or removed; logging out, stale GPS, reassignment to another driver and registry refresh do not clear the block. The selected driver ID/callsign is also blocked if they move to another vehicle. A saved vehicle can be covered by multiple entries; all covering entries must be removed to unblock it. No example callsigns are seeded.

Apply `scripts/migrations/20261110_traffic_message_bans.sql` as schema owner. Runtime permissions: SELECT/INSERT/UPDATE on `street_manager_message_bans`, SELECT/INSERT on append-only `street_manager_message_ban_audit`. Removed entries are inactive and their history remains. Each edit/removal requires the current entry version, preventing silent overwrites from another admin session.

The planner excludes banned drivers/vehicles. `sendDriverClosureMessage` also rechecks the persistent list immediately before the provider request. The final send and admin changes use the same PostgreSQL transaction advisory lock (`nac:traffic-message-ban-list`): an in-flight send completes before a save is acknowledged. Queued messages cannot be recalled. A missing/unreadable block list fails closed. The authenticated admin API also requires same-origin for mutations.

This protects traffic messages sent by this application; independent direct calls to Autocab made elsewhere are outside its control. Tests use a mocked message transport and synthetic drivers; no real driver messages are needed. The deployment preserves `ROAD_CLOSURE_ALERTS_MODE=observe` and does not enable automatic sending.


## Single-driver live pilot

Set runtime `ROAD_CLOSURE_ALERTS_MODE=pilot`, `ROAD_CLOSURE_PILOT_DRIVER_ID` to the exact Autocab driver ID, and `ROAD_CLOSURE_PILOT_CALLSIGN` to that driver's callsign. This is separate from unrestricted `live` mode. An absent/invalid pilot target suppresses every send; the worker never falls back to the whole fleet. Other drivers remain observable but are excluded from live candidates. The sender independently requires the matching active driver/callsign, their current active vehicle, fresh tracking and an active paired shift. Bans retain priority. Messages use `[TRAFFIC TEST]` and normal closure/time/approach/dedup rules. Admin shows the pilot scope and message history records the actual sent text. Stop the pilot by switching back to `observe`.

Optional runtime secret `ROAD_CLOSURE_MESSAGE_API_KEY` supplies a separately verified credential for the vehicle-message endpoint only; if absent, the enabled shared Autocab credential remains the fallback. An explicitly empty override disables the message connection. This does not modify registry credentials or other integrations.
