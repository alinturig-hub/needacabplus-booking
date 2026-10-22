# Live webhook detail recovery

The canonical booking transaction applies `recoverBookingDetails`, also used by
`scripts/repair-booking-details.mjs`, after normal event mapping and assignment
recovery, before timeline/snapshot creation. An accepted current event supplements
missing journey facts, including nested pricing distances, saved stop zones and
coordinates, and supplied pickup/drop-off times. It uses only that event's JSON,
not a current driver register or an older archived route.

Stale/regressive events and rejected offers do not run this supplementation.
Existing nonempty values (including financial/distance zero) remain authoritative.
Explicit assignment removal is handled by the existing assignment mapper.
Original webhook JSON, the merged document and snapshots remain preserved.
Raw Autocab times follow the Europe/London contract; no missing completion or
arrival is invented. Punctuality is evaluated on read using the shared service
timing rules, not frozen into a saved late/on-time flag. Insufficient evidence
remains unevaluable.

This change does not automatically reclassify Hackney/FlaggedBooking, test or
Exeter bookings, nor fill distances using guessed values.
