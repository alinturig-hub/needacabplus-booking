# Missing distance investigation — 22 October 2026

Read-only SQL investigation of the live shared database. Missing means all six
canonical fields are NULL: distance, systemDistance, meterDistance,
meterDistanceMetres, gpsMeterDistance and estimatedDistance. Zero is separate.

## Findings

18,965 bookings match, pickup dates 14 August 2025–3 November 2026 (stored UTC).
6,119 have pickup years 2025; 12,846 have pickup years 2026.

| Current canonical status | Bookings |
|---|---:|
| CANCELLED | 10,851 |
| COMPLETED | 4,874 |
| CREATED | 2,686 |
| IN_PROGRESS | 218 |
| ARRIVED | 170 |
| NOFARE | 122 |
| DISPATCHED | 43 |
| PASSENGER-ON-BOARD | 1 |

All have NULL companyId. 18,791 also have NULL bookingSource; their canonical
rawPayload contains only source=`aws_import` and bookingId. The remaining 174
have legacy normalized exports. This identifies provenance, not the importer
implementation or proof of which historical transformation caused the mismatch.

18,949 match the preserved Autocab archive by original booking reference.
The latest archive version has positive system distance for 18,700, zero for
249, and no archive match for 16. Meter distance, read explicitly as
pricing.meterDistance.asMiles, is positive for 325, zero for 18,624 and absent
with the 16 missing archive matches. These are overlapping measurements, not
additive counts. System distance is not proof of actual driven mileage.
Archive distances may be objects with asMiles/asMetres/asKilometres; flattening
must retain units and must not parse these objects as scalar numbers.

## Conflicting outcome evidence

Of 4,874 canonical COMPLETED bookings, all have completedAt but none have a
price. 4,864 have archive entries and **none** have any Completed or
ExchangedCompleted archive version. Latest archive outcomes for these 4,864:

| Latest archive reason | Bookings |
|---|---:|
| NoJob | 3,938 |
| Suspended | 684 |
| Cancelled | 130 |
| Skipped | 104 |
| Dispatched | 8 |

The other 10 have no archive match. Conversely, 324 currently non-completed
records have latest archive reason Completed and a completion timestamp there.
NoJob is not assumed to mean either Completed or No Fare. Status reconciliation
requires original event/outcome evidence; these records were not automatically
rewritten, deleted, or classified as actual driven trips.

Example 12471324: canonical COMPLETED, latest archive Cancelled, system distance
2.32287192794083 miles, meter distance zero. Example 12472901 has the same
outcome conflict, system distance 17.0815562117235 miles, meter distance zero.

Of the 16 unmatched references, 14 have stored pickup dates on 26 October 2025
around the clock-change window; one is 14 March 2026 and one 3 November 2026.
The clustering is an observation, not a verified explanation for missing data.

## Separate authorized deletion of test-text bookings

The user explicitly requested deletion of the previously reported text-match
set. Current preflight, after Exeter deletion, found 1,115 bookings matching
case-insensitive substring `test` in customerName, ourReference, officeNote,
driverNote or accountName. None were in the missing-distance set.

Deleted 1,115 canonical bookings, 2,183 history JSON versions, the same 2,183
versions in the original import archive, 2,022 webhook events, 1,356 repair
audit rows, 1,070 reconciliation queue rows, 6 live JSON projections, and
cascade-dependent booking details. ID-only replay suppression was added for
all 1,115 references. Post-deletion read-only verification found zero remaining
text matches. Existing backups and retired databases were not purged.

## Next work

Reconcile conflicting historical outcomes before repairing distance or using
these records in completed-job performance statistics. Preserve planned/system
and meter distance separately, including original units and provenance. Investigate
the 16 unmatched references via authoritative source retrieval if available.
