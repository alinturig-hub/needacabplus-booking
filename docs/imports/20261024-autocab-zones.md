# Autocab zones imported into the boundary editor

The company-1 Autocab registry contains 103 active records. On 24 October 2026,
100 validated boundaries were imported as drafts: 94 driver plot zones and six
system zones. MDT IDs, descriptors, centres, bid settings, auto/manual plot flags,
queue positions, visibility and all other original fields are retained in
`map_zones.source_payload`. Source IDs are indexed independently from display names.
The registry's Irish test zones are preserved as drafts, along with national
catch-all records; importing does not make any of these operational.

Six boundaries needed only consecutive duplicate vertices removed. This removes
zero-length segments and does not change their shape. Three source boundaries
fail simple polygon validation: Parkway W (2080), Barbican (2092), National
(2269). They remain intact in the canonical Autocab `Zone` registry and were not
invented or repaired for the drawing editor.

Existing manual Mutley was adopted by matching its name, with its previous
version recorded and its published snapshot retained. The Autocab boundary is a
new draft. No live snapshot, pricing assignment, dispatch rule or driver queue
was changed by this import. A single operating boundary cannot be inferred from
Autocab's Normal/System zone types; its intended coverage needs to be specified.

Reproduce with `npx tsx scripts/import-autocab-map-zones.ts inventory.json output.sql`.
The inventory JSON contains `zones`, with externalId, name, active, mdtZoneId,
descriptor and rawPayload from the company-1 Autocab registry. Execute generated
SQL atomically. Re-running the same inventory is idempotent and does not overwrite
local edits unless the source payload has changed. Source conflicts fail rather
than silently replacing another zone. The script writes a rejected-record report
beside its SQL output. Original registry data stays in the database, not GitHub.
