# Historical Autocab merge into the shared live database

The completed archive contains 4,675,190 API archive entries representing
2,417,891 original booking references. `archivedBooking.originalAutoID` identifies
the trip; archive `id` identifies an individual stage, not the trip.

## First stage: preserve and link the complete history

`autocab_history.entries` in the shared live database keeps every source column,
full raw JSON, unknown fields, rejected vehicle lists and all stages. Original
provider timestamps inside JSON are unchanged; indexed timestamp columns are
transferred as timestamp strings to retain microseconds. The source database is
read-only and remains intact. `autocab_history.booking_entries` links each entry
to canonical `public."Booking"` using `(AUTOCAB, originalAutoID)`.

Do not insert these rows into public.autocab_bookings: its IDs are original
booking references and its required provenance fields describe webhook-derived
documents. Do not turn archived stages into fake webhook events, notifications,
charges or dispatch actions. NoJob is not assumed to be passenger no-fare.

Apply `scripts/migrations/20261020_autocab_history_merge.sql` with the live database
administrator; it creates only the history schema, copy progress, indexes, view
and grants. Cabby and TaxiCRM receive SELECT on this history. The existing runtime
writer receives INSERT on entries and progress DML, without canonical updates.

Deploy the worker through the existing Docker image. Its default invocation is a
read-only preflight:

```
node /app/scripts/autocab-history-merge.mjs
```

It verifies source completion and cutoff, target identity, immutable source
metadata and a sample overlap with live references. Start the copy with:

```
node /app/scripts/autocab-history-merge.mjs --apply
```

Existing `AUTOCAB_HISTORY_DATABASE_URL` and `DATABASE_URL` bindings supply the
connections. Never copy their values into documentation or logs. Defaults are
500 entries per transaction, at most 28 minutes per invocation and 100ms between
batches. `AUTOCAB_MERGE_BATCH_SIZE` allows 1–2000; `AUTOCAB_MERGE_MAX_MINUTES`
allows 1–120. A session advisory lock prevents concurrent workers.

Each transaction inserts missing archive keys, checks raw JSON/hash and original
archive metadata, then advances its checkpoint. A conflicting payload rolls back
the entire batch. Retries do not overwrite existing history. Source count and last
fetch timestamp must match across resumptions; changes stop the worker. No PII is
logged. Progress completion requires both copied and stored row counts to match
the source. Neither source rows nor canonical live rows are deleted or updated.

## Reconciliation after the history copy

Count distinct original IDs, matched live IDs, missing IDs, all archive reasons,
invalid/missing identities and content conflicts. Compare full source/target
entry counts and hashes in bounded batches. Missing original booking references
must be mapped into the canonical model in a separate tested reconciliation;
existing live records require field-level freshness evidence. Copy completion
alone does not certify canonical reconciliation or historical financial totals.
Until that reconciliation is verified, use the linked history view to inspect
original API data alongside live state and report unmatched references explicitly.

Rollback: disable only the history-copy task. Keep the additive tables and source
archive; no canonical rollback is needed because this stage never changes them.

## Canonical missing-booking reconciliation

`20261020_autocab_canonical_reconcile.sql` adds an audit queue. The explicit worker
`scripts/autocab-canonical-reconcile.mjs --prepare` selects missing original IDs
only and the most recent provider `archivedBooking.archiveTime`, with numeric
archive ID as a deterministic tie-break. Conflicting reasons at the same latest
time are flagged for review. Run without flags for a read-only queue summary.

`--apply` inserts missing canonical rows in transactions of at most 100 bookings,
with the same per-booking advisory locks as the webhook writer and
`ON CONFLICT(provider, externalId) DO NOTHING`. Only newly inserted rows receive
normalized pickup, destination and via records. Existing live rows and their
relationships are never updated. The queue records source entry, resulting ID,
state, review flags and processing time. A relation failure rolls back the full
batch and queue updates. Resume selects only pending queue rows.

Each inserted Booking.rawPayload is the full, unchanged selected Search JSON.
Every other version remains linked through autocab_history.entries.original_booking_id.
No synthetic webhook, timeline event, notification, charge or dispatch action is
created. The worker refuses unreviewed non-internal triggers on canonical tables.
No NormalCustomer or consent record is manufactured.

Completed / ExchangedCompleted map to COMPLETED; Cancelled / ExchangedCancelled
to CANCELLED. The source has no verified cancellation timestamp, so it is not
invented from archive time. Missing completion timestamps are flagged. NoJob maps
to ARCHIVED_NO_JOB, never automatically NO_FARE. Historical Dispatched, Recover,
Suspended and Skipped receive ARCHIVED_* states to keep them out of live dispatch.
Unknown or conflicting states become ARCHIVED_REVIEW. These records need review
before interpreting historical service outcomes as operational KPIs.

UTC-normalized canonical timestamp columns follow the existing timestamp-without-
time-zone convention. Explicit offsets take precedence; offset-free Autocab times
use the existing Europe/London parser, which rejects ambiguous/nonexistent DST
times. All original timestamps and their original precision remain in raw JSON.
Money is copied only from corresponding provider fields, without computing
commission, net earnings or office revenue. Missing nullable fields remain null;
required fields use existing model defaults, while raw JSON preserves absence.

For the first production canary use AUTOCAB_RECONCILE_MAX_BOOKINGS=100. Check its
ledger, full JSON equality with its source entries, relations, queue accounting,
absence of dispatch-active states and unchanged preexisting bookings before
continuing. Completion requires zero unmatched original references and no pending
queue rows; counts alone do not certify financial or service-quality formulas.
Rollback is reviewed, never an automatic delete: imported rows may subsequently
have received live webhooks or CRM links. Preserve the ledger and history.
