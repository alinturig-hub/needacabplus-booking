# Autocab historical archive

Standalone server command: `node scripts/autocab-history-import.mjs`.
This script only calls POST `https://autocab-api.azure-api.net/booking/v1/1.2/search`.
It never creates, dispatches or modifies a booking in Autocab, and never writes to
operational databases. The target URL must name `needacabplus_archive_20261018`.

## Scope and fidelity

30 September 2022 00:00 through 18 October 2026 22:00 Europe/London, inclusive:
`2022-09-29T23:00:00.000Z` through `2026-10-18T21:00:00.000Z`.
All documented Search types, empty company/capability/telephone filters.
Daily UTC windows (not UK calendar-day buckets), with millisecond-inclusive bounds
and no gaps. The window's filters stay unchanged throughout token pagination.
A final window in the future is deferred. This is a snapshot fetched now, not a
historical reconstruction of each booking's state at the cutoff.

`autocab_bookings.raw_payload` preserves every field, including unknown future
fields. Main fields and nested pricing/archive/locations are available separately.
`import_pages.response_payload` preserves each entire successful response.
IDs deduplicate on `autocab_id`. Provider zero prices remain zero. Do not infer
operator commission from a field named price or overwrite it with a fixed fare.
Offset-free dates are retained raw but not silently interpreted as server time.

## Secrets and settings

- `AUTOCAB_HISTORY_DATABASE_URL`: private new archive database URL, never the live URL.
- `AUTOCAB_HISTORY_API_KEY`: optional separate subscription key. If unset, reuse the
  explicitly selected encrypted direct Autocab connection (`AUTOCAB_HISTORY_CONNECTION_ID`) from the existing `DATABASE_URL`, reading
  only `api_connections` using `CREDENTIALS_ENCRYPTION_KEY`. No production writes.
- `AUTOCAB_HISTORY_INTERVAL_MS`: default 10000; minimum 7500; maximum 300000.
- `AUTOCAB_HISTORY_MAX_REQUESTS`: default 100, maximum 200; set 1 for the initial canary.
- `AUTOCAB_HISTORY_MAX_MINUTES`: default 25; maximum 120.
- `AUTOCAB_HISTORY_NIGHT_BOOST=true`: enable the UK-local night policy below.
- `AUTOCAB_HISTORY_STATUS_ONLY=true`: aggregate checkpoint/count report, no API calls.

Never paste API keys in commands, logs or documentation. Configure through the
server's secret environment settings. Subscription keys exposed in chat should
be rotated by the account owner.

## Scheduling and controls

One active importer per archive via a session advisory lock. At most one request
in flight, minimum 7.5 seconds between request starts plus 0–999ms jitter, even
across process restarts. Recommended schedule after a successful one-page canary:
every 30 minutes (`*/30 * * * *`), timeout 1800 seconds, up to 200 requests per invocation (28-minute run budget for the faster profile).
Pause by disabling the scheduled task. SIGTERM/SIGINT stop after the current page;
the database transaction keeps bookings, page journal and checkpoint together.

429 and 5xx persist cooldown using the larger of Retry-After and exponential
backoff (exponential component capped at 15 minutes; Retry-After never shortened).
Stop after five consecutive retriable errors. Other HTTP failures stop immediately.
Requests time out after 30 seconds. Malformed responses and repeated/cyclic tokens
stop without skipping the page. Request budget includes failed attempts.
No quota for the Autocab subscription has been assumed or discovered: eight requests
per minute is a conservative client ceiling, not a promise from the vendor.

Logs contain counts, page numbers and HTTP status, never passenger payloads,
credentials or continuation tokens. Raw archive data includes customer PII; keep
the database private and restrict access and retention accordingly.

## Verification

Run `node --test tests/autocab-history-import.test.mjs`.
Check canary output, `import_progress`, unique IDs, full JSON fields and received
pickup ranges before enabling the recurring task. `records_seen` counts API
records including repeats, not unique bookings. Exhausting all tokens proves
only that this Search request is exhausted, not that Autocab has retained every
booking ever created. Reconcile date/status/company counts against an independent
Autocab export before claiming completeness.

## Source validation

Run `node scripts/autocab-history-source-check.mjs` manually before enabling the
importer. It compares distinct configured subscription keys, at least eleven
seconds apart, using the provided example search; raw responses stay in private
`source_validation_probes`, and logs show only counts, ID ranges and whether the
known supplied reference 10017549 was returned. Stop on 429/5xx. Never combine data
from keys identifying different source systems. The importer requires an explicit
connection ID when reusing stored credentials; it will not choose the newest
address/quote connection automatically.

## Faster bounded profile

After a successful 20-request canary, the operator-authorized faster profile uses
7500ms plus jitter, 200 requests per run, 28 minutes per run, every 30 minutes.
This improves throughput by increasing the request rate moderately and reducing
idle time between batches. The default settings stay 10000ms / 100 requests.
A 429 raises persisted `import_progress.throttle_floor_ms` to at least 10000ms,
so subsequent calls/runs fall back to no more than six requests/minute, in addition
to respecting Retry-After. That fallback does not reset automatically on restart.
No additional subscription keys or parallel requests are used to increase quota.

## UK night window (operator authorised 19 October 2026)

With `AUTOCAB_HISTORY_NIGHT_BOOST=true`, 00:00 inclusive to 04:00 exclusive
Europe/London raises the configured daytime request ceiling by 60%. With the
7500ms day interval this is 4688ms minimum at night (approximately 12.8/minute),
plus existing jitter. Actual throughput can be lower due to jitter, API/database
latency or backoff. DST boundaries use the London timezone, not host UTC.

During this window the worker keeps its lock and runs continuously, bypassing
both the per-run request cap and run-duration boundary. It does not pause after
200 requests or wait for the next half-hour schedule. Single request in flight,
transactional checkpoints and cooldown remain mandatory. Raise the scheduled-task
timeout to 18000 seconds (five hours) before enabling the flag. The usual
half-hour schedule remains; overlapping invocations exit without API calls.
At 04:00 normal rate and batch bounds resume, including rechecking after sleeps.
This is a bounded historical importer, not a second live ingestion process.

Each HTTP/network/response-read failure persists `rate_multiplier *= 0.9` (floor
0.01), so the ceiling falls ten percent of its current value per failure.
No automatic reset after success, midnight or restart. Example ceiling before
jitter: 12.8 -> 11.52 -> 10.368 requests/minute. The multiplier also applies to
the day rate. The existing 429 fallback floor of 10000ms still applies, so rate
limits can cause a larger safety reduction. Retry-After and exponential backoff
can still require pauses, and five consecutive retriable errors stop the run.
Invalid payload/schema/token and database errors never advance the checkpoint.
The API subscription's actual quota remains unconfirmed.

Disable the night flag to restore daytime-only policy; do not reset the cursor,
request timestamps, cooldown, throttle floor or multiplier for rollback.
