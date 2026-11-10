# Traffic message ban list

Admin → Operations → Roadworks & driver alerts → Ban list.

Administrators can add up to 100 comma/newline-separated driver callsigns at once, edit a single entry or remove it. A batch is atomic. Callsigns are trimmed/uppercased; only one active, non-suspended, non-archived Autocab driver may match. Archived drivers with reused callsigns are ignored. Ambiguous/missing drivers or vehicle associations reject the whole save.

Association resolution runs at add/edit only: current vehicle → active shift → latest recorded shift. The UI labels the source and association timestamp. The selected vehicle ID is frozen until the entry is edited or removed; logging out, stale GPS, reassignment to another driver and registry refresh do not clear the block. The selected driver ID/callsign is also blocked if they move to another vehicle. A saved vehicle can be covered by multiple entries; all covering entries must be removed to unblock it. No example callsigns are seeded.

Apply `scripts/migrations/20261110_traffic_message_bans.sql` as schema owner. Runtime permissions: SELECT/INSERT/UPDATE on `street_manager_message_bans`, SELECT/INSERT on append-only `street_manager_message_ban_audit`. Removed entries are inactive and their history remains. Each edit/removal requires the current entry version, preventing silent overwrites from another admin session.

The planner excludes banned drivers/vehicles. `sendDriverClosureMessage` also rechecks the persistent list immediately before the provider request. The final send and admin changes use the same PostgreSQL transaction advisory lock (`nac:traffic-message-ban-list`): an in-flight send completes before a save is acknowledged. Queued messages cannot be recalled. A missing/unreadable block list fails closed. The authenticated admin API also requires same-origin for mutations.

This protects traffic messages sent by this application; independent direct calls to Autocab made elsewhere are outside its control. Tests use a mocked message transport and synthetic drivers; no real driver messages are needed. The deployment preserves `ROAD_CLOSURE_ALERTS_MODE=observe` and does not enable automatic sending.
