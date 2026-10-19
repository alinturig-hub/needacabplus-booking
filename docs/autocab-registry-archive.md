# Driver and vehicle registry archive

Run `node scripts/autocab-history-registry.mjs` in the production application
container with the existing `AUTOCAB_HISTORY_DATABASE_URL` and the validated
`AUTOCAB_HISTORY_CONNECTION_ID`. Only the private archive database named
`needacabplus_archive_20261018` is accepted. The live fleet tables are untouched.

Sources: GET `/driver/v1/drivers` and `/vehicle/v1/vehicles` on the direct Autocab
host. The same subscription key as the validated booking history connection is
used, not alternate keys to increase quota.

- `autocab_drivers` and `autocab_vehicles`: provider ID, selected lookup fields,
  complete raw JSON, payload hash and observation timestamps.
- `autocab_registry_versions`: each distinct observed entity payload.
- `autocab_registry_responses`: complete successful API responses, including
  payloads blocked by validation, so future/unknown fields are retained.
- `autocab_registry_progress`: per-resource completion/checkpoint or blocked state.

Current entities are upserted by numeric provider ID. Callsigns, names and
registrations are never substituted as primary IDs. Missing records are never
deleted or marked inactive. Suspension/status values are taken from the response,
not inferred from absence. Logs contain counts/codes, not customer or driver PII.

The initial import is one-shot and skips completed resources on another invocation.
A deliberate future refresh requires resetting the desired progress row after
review; prior responses and entity versions remain intact. An unknown continuation
contract, malformed identity or cross-host paging blocks that resource and saves
its raw response for inspection. Explicit same-host, same-operation next links
are supported. A terminal page with totalCount is checked against all records
already seen, not just the last page.

## Shared API budget

The registry worker takes the same advisory lock as the booking history worker.
If history is active, it defers without any API call. Registry requests use the
shared `import_progress` last-request/cooldown state and at least 10 seconds plus
jitter between request starts. At most five requests and approximately 110 seconds
per invocation. 429/5xx persist the same Retry-After/backoff/fallback used by the
booking importer. Non-retriable HTTP failures block the resource. No concurrent
fleet/history API calls are launched by these workers.

For the initial rollout, pause only future history scheduled runs; let any active
bounded run finish. Deploy the script, import and verify both registries, then
resume the unchanged history task from its checkpoint. Do not kill a history
transaction or reset its cursor to make room for the registry.

## Analytical limitations

The API list is a snapshot of the registry returned now, not proof that it contains
every retired/deleted driver or vehicle from 2022 onward. Measure historical ID
coverage after import and report missing references. Current driver–vehicle
assignment does not establish who was driving at a historical offer timestamp.
`rejectedVehicles` contains vehicle IDs in the inspected archive; attributing those
rejections to individual drivers needs offer/shift history, not the current fleet.

Historical Search IDs identify archive entries: link their
`archivedBooking.originalAutoID` to the operational booking reference, preserving
both identifiers and validating coverage before merging. Do not count several
Dispatched/Recover/Completed archive entries as separate completed trips.

Verification: `node --test tests/autocab-history-registry.test.mjs`.

## Active roster and Hackney read models

Apply `scripts/migrations/20261019_archive_driver_booking_classification.sql`
**only to the archive database**, after both the registry and booking tables exist.
It adds views, changes no original rows and makes no Autocab API requests.

- `autocab_driver_classification`: preserves all profiles, with explicit activity,
  suspension, archive and driver-category fields.
- `autocab_active_drivers`: operational roster: `active=true`, `suspended=false`,
  no nonempty `archivedDate`. Missing flags are not assumed eligible. This is
  registry eligibility, not live online/free availability.
- `autocab_booking_classification`: one row per archive entry (not unique ride).
  Exposes `original_booking_id` and keeps historical driver callsign separate from
  booking source. Use the original reference plus phase/status when merging.

Tenant rule confirmed by the operator: trimmed callsigns beginning with `9` are
`HACKNEY`; other nonempty callsigns are `PRIVATE_HIRE`; missing is `UNKNOWN`.
Booking driver category uses **the archived booking's driver snapshot**, never
joins to today's callsign or activity state. Inactive drivers' past trips remain.

`bookingSource = 'FlaggedBooking'` is the actual Autocab flag-source marker.
`service_category` separates `FLAGGED_BOOKING`, `HACKNEY_BOOKING`,
`PRIVATE_HIRE_BOOKING`, and `UNKNOWN`. A Hackney driver's ordinary booking is
not automatically a flagged/street-hail job. A flagged job with a missing or
non-Hackney callsign remains flagged; its independent driver category is kept
for reconciliation. Missing source or snapshot does not become private hire.
No totals should combine these categories without an explicit reporting choice.

These database read models do not change the existing live Admin driver screen.
Verification: `node --test tests/autocab-archive-classification.test.mjs`.
