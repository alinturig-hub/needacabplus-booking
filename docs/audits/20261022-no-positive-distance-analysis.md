# No-positive-distance operational analysis — 22 October 2026

Read-only SQL audit of the live canonical Booking table and preserved Autocab
history. No booking records or classifications were changed during this audit.
Queries and aggregate results were obtained in separate read-only transactions;
ongoing ingestion added one zero-distance OperatorWeb record between the first
and last observations. Counts below use the final total where available.

## Definition and final population

No-positive means none of distance, systemDistance, meterDistance,
meterDistanceMetres, gpsMeterDistance or estimatedDistance is >0. NULL is not a
measured zero. There are no negative values in these six fields in this group.

| Population | Jobs |
|---|---:|
| No positive distance | 152,892 |
| All six distance fields NULL | 18,965 |
| At least one recorded zero, no positive value | 133,927 |
| Nonzero driver ID or nonempty/nonzero call sign | 125,955 |
| No valid saved driver identifier | 26,937 |
| Dispatch timestamp present | 130,617 |
| Dispatch timestamp absent | 22,275 |
| POB timestamp present | 127,754 |
| POB timestamp absent | 25,138 |
| Canonical status COMPLETED | 132,648 |

Driver ID '0' is not a valid assignment identifier. 179 no-positive records had
that sentinel; using mere non-NULL driverId would overstate driver coverage.
15,856 have only a call sign, with no usable driver ID. Recorded identifiers do
not establish a person's current employment or prove physical service delivery.
19,493 have POB but no valid saved driver identifier; 19,899 have a dispatch
entry but no valid saved driver identifier. Those are identity/documentation
gaps, not proof that the vehicle was physically driverless.

Initial status breakdown (before one new OperatorWeb record): COMPLETED 132,648;
CANCELLED 15,853; CREATED 2,689; ARCHIVED_NO_JOB 1,050; IN_PROGRESS 218; ARRIVED
170; NOFARE 122; NO_FARE 60; DISPATCHED 43; REJECTED 27; BOOKED 3; POB 3;
PASSENGER-ON-BOARD, ARCHIVED_SUSPENDED, ARCHIVED_SKIPPED, ARCHIVED_DISPATCHED and
ACTIVE each 1. A completed timestamp is present on 132,649, including one
record whose current status is BOOKED: columns and status are not interchangeable.

## Booking origin and comparison

121,256 are FlaggedBooking (79.3% of the initial population); 121,009 of these
are canonically COMPLETED. Of those 121,009, all have POB, 117,002 have
completion more than one minute after POB, and 113,042 have dispatch and POB at
exactly the same instant. This resembles a different street-booking lifecycle,
not an absence of service. It does not prove the physical journey occurred.

| Completed source | No-positive jobs | Median POB-to-completion | Positive-distance jobs | Their median |
|---|---:|---:|---:|---:|
| FlaggedBooking | 121,009 | 10.18 min | 86,393 | 9.65 min |
| OperatorWeb | 4,482 | 8.38 sec | 860,493 | 10.97 min |
| MobileApp | 397 | 39.73 sec | 588,005 | 9.69 min |

Medians use nonnegative recorded intervals where both timestamps exist; they
are all-history within-source diagnostics, not time-matched causal estimates.
74.3% of the no-positive completed OperatorWeb group has POB-to-completion <=1
minute, compared with 0.34% of its positive-distance group. MobileApp: 52.6%
versus 0.21%. These patterns warrant review of rapid manual completion,
short/same-site bookings and status semantics, not automatic fraud allegations.

7,943 no-positive completed records have POB before dispatch. Every one is
FlaggedBooking and the difference is <=5 seconds. That pattern is consistent
with closely timed event recording; it is not evidence of driver lateness.
22 have completion before POB and should be flagged for timestamp review.

A separate full-population comparison matched source, current status and pickup
month. It covered 149,491 no-positive jobs (97.8% of the first snapshot), with
2,398,676 distinct positive-distance controls. Observed POB presence was 85.36%
versus an expected 88.83% using positive-control rates weighted by the no-positive
stratum distribution. Dispatch: 87.25% versus 91.23%. This adjusts for observable
mix but does not resolve misclassified status, missing identity, legacy imports
or unrecorded operational factors; it is not an estimate of driver fault.

## Full archive cross-check

| Cohort | Jobs | Archive matches | Positive system distance in JSON | Positive meter distance in JSON |
|---|---:|---:|---:|---:|
| Recorded zero/no positive | 133,927 | 113,463 | 101,240 | 3 |
| All six NULL | 18,965 | 18,949 | 18,700 | 325 |

At least 119,940 have positive `archivedBooking.systemDistance.asMiles` in the
latest examined archive entry despite no positive value in canonical columns.
System/planned distance is distinct from actual meter distance; these counts
must not be added together as separate jobs.

100,900 canonical COMPLETED jobs in the recorded-zero cohort also have latest
archive reason Completed and positive system distance. These are strong
candidates for provenance-preserving distance normalization without an outcome
change. The all-NULL legacy group has separate outcome conflicts described in
`20261022-missing-booking-distance.md`; do not blindly overwrite those statuses.

The archive import mapper uses `number(a.systemDistance)` and
`number(pricing.meterDistance)`, while the provider supplies objects with asMiles,
asMetres and units. The saved-JSON repair's scalar number conversion also does
not extract these objects. Known zeros are deliberately preserved by fill-only
repair. This establishes a normalization gap; it does not imply every zero is
invalid or that a planned distance is actual travel.

Concrete examples with archive Completed:

- 5688968, FlaggedBooking: canonical no positive distance, archive system distance
  0.670459516424083 miles, meter zero, recorded trip duration 5.45 minutes.
- 12033923, MobileApp: archive system distance 3.27493686868687 miles, meter zero,
  recorded trip duration 15.29 minutes.
- 13156442, OperatorWeb: archive system distance 7.94963662212678 miles, meter
  zero, recorded trip duration 1.815 seconds. Planned route length alone is not
  evidence that this trip was physically driven.

## Archive coverage and sampling limits

20,480 have no archive entry: 20,284 have pickup before the configured import
start (30 September 2022 UK); 7 have pickup after the configured end (20 October
2026, 10:00 UK); 189 have pickup inside it. Pickup position relative to this
window is a coverage clue, not proof of the Autocab search endpoint's date-filter
semantics. Do not infer an ingestion failure from all unmatched rows.

A separate 1,200-row JSON/location diagnostic used 200 completed bookings in each
of FlaggedBooking/OperatorWeb/MobileApp x no-positive/positive cohorts. Hash-ranked
no-positive rows and positive candidates from a repeatable page sample were used;
these are diagnostic samples, not population estimates or exactly time-matched
controls. Same pickup/destination coordinates appeared in 31/200 zero-distance
OperatorWeb rows versus 11/200 controls, but most had different coordinates.
The full-population archive counts above supersede sample extrapolation.

## Recommended handling

1. Keep rows and raw JSON. Normalize unit-bearing distance objects into separate
   system/meter fields with provenance and an audit trail; never synthesize a
   measured trip distance from the planned route.
2. Reconcile authoritative outcome and timing conflicts before treating every
   canonical COMPLETED entry as a performed trip.
3. Surface independent flags: missing driver identity, missing dispatch/POB
   evidence, rapid completion, chronology inconsistency and archive coverage.
   Street jobs should be evaluated against street-job patterns.
4. Investigate the 189 inside-window unmatched references; extend archive coverage
   for earlier periods if operationally useful. No automatic deletion or driver
   sanctions are justified by distance zero alone.
