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
  encrypted direct Autocab connection from the existing `DATABASE_URL`, reading
  only `api_connections` using `CREDENTIALS_ENCRYPTION_KEY`. No production writes.
- `AUTOCAB_HISTORY_INTERVAL_MS`: default/minimum 10000; maximum 300000.
- `AUTOCAB_HISTORY_MAX_REQUESTS`: default/maximum 100; set 1 for the initial canary.
- `AUTOCAB_HISTORY_MAX_MINUTES`: default 25; maximum 120.
- `AUTOCAB_HISTORY_STATUS_ONLY=true`: aggregate checkpoint/count report, no API calls.

Never paste API keys in commands, logs or documentation. Configure through the
server's secret environment settings. Subscription keys exposed in chat should
be rotated by the account owner.

## Scheduling and controls

One active importer per archive via a session advisory lock. At most one request
in flight, minimum ten seconds between request starts plus 0–999ms jitter, even
across process restarts. Recommended schedule after a successful one-page canary:
every 30 minutes (`*/30 * * * *`), timeout 1800 seconds, 100 requests per invocation.
Pause by disabling the scheduled task. SIGTERM/SIGINT stop after the current page;
the database transaction keeps bookings, page journal and checkpoint together.

429 and 5xx persist cooldown using the larger of Retry-After and exponential
backoff (exponential component capped at 15 minutes; Retry-After never shortened).
Stop after five consecutive retriable errors. Other HTTP failures stop immediately.
Requests time out after 30 seconds. Malformed responses and repeated/cyclic tokens
stop without skipping the page. Request budget includes failed attempts.
No quota for the Autocab subscription has been assumed or discovered: six requests
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
