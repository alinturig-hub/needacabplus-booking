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
in flight. Daytime uses minimum 7.5 seconds between request starts plus
0–999ms jitter, across process restarts; explicit night/trial policies below
use their own bounded ceilings. Recommended schedule after a successful one-page canary:
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

## UK evening/night hourly ramp (authorised 19 October 2026)

With `AUTOCAB_HISTORY_NIGHT_BOOST=true`, the window is 21:00 inclusive to 04:00
exclusive Europe/London. This replaces the prior midnight +60% policy. The operator subsequently
authorised a 100/minute ceiling for 02:00–04:00 only; earlier hours retain
the hourly +5 ramp.

| UK hour | Requests/minute ceiling |
| --- | ---: |
| 21:00–22:00 | 25 |
| 22:00–23:00 | 30 |
| 23:00–00:00 | 35 |
| 00:00–01:00 | 40 |
| 01:00–02:00 | 45 |
| 02:00–03:00 | 100 |
| 03:00–04:00 | 100 |

Intervals are rounded up from 60000/ceiling, plus existing jitter. Throughput
can be lower due to API/DB latency, jitter and backoff. London wall-clock hours
handle DST: the repeated autumn hour retains its ceiling, and the skipped spring
hour has no separate slot. The night session key is the local date at 21:00,
so midnight and process restarts do not reset reductions.

At the start of each nightly session, persist the current `rate_multiplier` in
`night_reference_multiplier`. The scheduled ceiling is multiplied by the ratio
of current/reference (never above one). Each new error still multiplies current
rate by 0.9; hourly increases do not clear accumulated reductions. The old day
multiplier is retained for restoration at 04:00, including subsequent errors.
Existing 429 floors and Retry-After remain mandatory and can impose a stricter
limit. No keys, cursors, cooldown or throttle-floor values are reset.

Night runs retain the shared lock and bypass normal per-batch request/duration
bounds, then restore the day profile at 04:00. Use scheduled-task timeout 36000
seconds (ten hours), covering the extra autumn hour and a following day batch.
The half-hour schedule remains unchanged; overlapping runs exit without calls.
One request in flight, transactional checkpoints, response timeouts and the
five-consecutive-errors stop remain active. A temporary trial's ten-minute pause
also remains mandatory if it overlaps the night window.

Disable the night flag to restore daytime-only scheduling; preserve all saved
state. The vendor quota is not confirmed; these are client-side ceilings.

## One-hour 20/minute trial

An explicit operator-authorised trial can be armed in the private archive's
`import_progress` row using `trial_started_at`, `trial_until` (start + 60 minutes),
`trial_pause_until` (end + 10 minutes), and `trial_reference_multiplier` (the saved
current multiplier). No secret or second subscription key is used. Arm only after
the worker version supporting these fields is deployed. Do not clear API cooldown,
429 floor, cursor, counters, or the existing rate multiplier.

During the active window the ceiling is 20/minute (3000ms plus normal jitter).
The trial uses the saved initial multiplier as a reference, so it preserves the
previous reduced regime for automatic restoration; subsequent errors lower both
the trial and the restored regime by the normal ten-percent rule. A prior/new 429
floor and Retry-After still override the trial rate. No API calls are made during
the ten-minute pause, including by another registry worker using the shared rate
state. Expiry/pause are timestamped in PostgreSQL and survive process restarts.

The worker bypasses normal batch bounds for the hour and holds its lock through
the pause, then starts a new normal bounded batch. Night/day selection still uses
Europe/London. Scheduled overlapping workers return without calls. Five consecutive
retriable errors can stop a run early; expiry still cannot extend past the armed
hour. All original records and checkpoints remain transactional and unchanged.
To stop a trial early, shorten its expiry and set an appropriate pause end; never
extend a trial without a new explicit instruction. Missing dates mean no trial.


### Two-hour 25/minute trial

Explicitly authorised trials may now run up to two hours, using
`trial_interval_ms=2400` (maximum 25/minute plus existing jitter), with the same
ten-minute pause and automatic restoration. The default remains 3000ms for
older 20/minute trials. Schema and code reject intervals below 2400ms and windows
longer than two hours. A new trial must not overwrite an active/pause window.
The saved reference multiplier, subsequent ten-percent error reductions, 429
floor, Retry-After, shared lock and transactional checkpoints still apply.
