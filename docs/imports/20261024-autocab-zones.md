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
was changed by this import. The user specified UK-wide operating coverage. A separate United Kingdom draft
uses Natural Earth 1:50m Admin 0 data (public domain), including England, Scotland,
Wales and Northern Ireland and island components. This is a generalised national
boundary, not an Autocab plot or a detailed coastal/legal service boundary.
The source GeoJSON and attribution are saved in scripts/data/uk-operating-area.geojson.
Generate its idempotent import with `npx tsx scripts/import-uk-operating-area.ts output.sql`.
MultiPolygon support preserves its 23 parts as one operating area in the editor.

Reproduce with `npx tsx scripts/import-autocab-map-zones.ts inventory.json output.sql`.
The inventory JSON contains `zones`, with externalId, name, active, mdtZoneId,
descriptor and rawPayload from the company-1 Autocab registry. Execute generated
SQL atomically. Re-running the same inventory is idempotent and does not overwrite
local edits unless the source payload has changed. Source conflicts fail rather
than silently replacing another zone. The script writes a rejected-record report
beside its SQL output. Original registry data stays in the database, not GitHub.

## Combined plot map

The Zones workspace opens with a Plymouth overview of every plot boundary and
its original `(MDT ID) DESCRIPTOR` label. The UK operating outline is a separate
layer. System zones stay out of the geographic plot overlay. Search filters the
left list while retaining neighbouring boundaries on the right-hand map.
Clicking a label or polygon selects its record; edit mode exposes only the
selected boundary to the drawing tools, with neighbours remaining read-only.
The list and inspector scroll independently from the desktop map. Mobile puts
the map above the controls. No ASAP service label is present in Zones.

The three rejected Autocab polygons can now be inspected as dashed, read-only
reference outlines. `/api/admin/zones/references` is administrator-only and reads
unimported company-1 Normal zones without modifying the registry or map drafts.
They still cannot be saved or published until their geometry passes validation.
Viewing a boundary never publishes it. The Live-only map uses saved published
geometry, while the default overview displays drafts and identifies that state.

## Saving and deleting

The map toolbar provides **Save map** for the selected draft and **Delete zone**
with a confirmation naming the selected record. Saving does not publish a draft;
Publish live remains a separate action. Deletion removes the zone from both
editor and live results, clears its publication and retains its original source
link, geometry and version history. An imported zone's retained source link also
prevents it reappearing as an unimported reference. Original Autocab registry data
is never deleted. The server requires an administrator, a valid request origin
and the current zone version for deletion; stale requests cannot remove a newer
edit. Deleted names can be reused for new zones.

The zone editor now lives under Configuration at `/admin/configuration/zones`,
next to Maps & places. `/admin/zones` redirects there for existing bookmarks.
Dispatch contains the algorithm/rule workspace; the zone storage and APIs are unchanged.
