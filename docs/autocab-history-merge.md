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
