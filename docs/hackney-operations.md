# Hackney operations

`/admin/hackney` is an authenticated Admin operations workspace. Its configuration
is held in the shared database (`public.hackney_configuration`). By default a
booking's saved driver call sign beginning with 9 or 4 classifies its driver as
Hackney. Missing call signs remain unknown. Leading zeros are preserved.

Street bookings have the explicit `isStreetPickup` flag or an exact source match
(default `FlaggedBooking`). Street origin is independent of Hackney driver class:
these groups overlap and are not additive. Filters and CSV exports use the same
parameterized predicates. The panel labels all-history counts separately from
UK pickup-day counts. No group changes dispatch eligibility, fares or service
punctuality. Configuration changes regroup the full history without overwriting
original booking facts. Access to settings updates requires Admin and same origin.

Apply `scripts/migrations/20261022_hackney_workspace.sql` before deploying. This
also installs an ID-only deletion suppression list. The canonical worker ignores
replays for IDs listed there, preventing deleted historical bookings from being
recreated by a delayed event. Incoming events remain retained by the webhook inbox;
this is not a general company-wide ingestion exclusion or a backup erasure system.

On 22 October 2026, the user explicitly authorized permanent deletion of Needacab
Exeter bookings (Autocab company 4). Identification uses source company IDs,
not addresses or destination text. Retired databases and pre-existing backups
are distinct from the operational shared database; no claim of backup erasure
is made by the operations module.

Deletion completed and committed on 22 October 2026:

- Live canonical bookings deleted: 9,301.
- Shared history JSON versions deleted: 16,026.
- Original import archive JSON versions deleted: 16,026 (the same versions in its source copy).
- Repair audit rows deleted: 9,383; reconciliation queue rows deleted: 704.
- 9,301 ID-only replay suppression records retained.
- Live total immediately after deletion: 2,732,142; ongoing ingestion can change it.

The guarded SQL used is retained under `scripts/maintenance/`. These scripts are
manual maintenance records and are not run by application startup or deployment.
The first original-archive attempt timed out during a redundant JSON join and
rolled back; the validated company-scoped retry completed successfully.
