# Shared WhatsApp gateway — implementation and activation

This change implements the shared storage and service contract. **It does not activate automatic Meta sends.** The existing Meta webhook URL remains `https://taxicrm.plymhub.ai/api/webhooks/whatsapp/meta`; the signed receiver and its acknowledgement behavior are unchanged.

## Responsibilities and current boundary

TaxiCRM owns canonical messages, conversation mode and its audited commands, service intents and the event delivery outbox. NeedACab Plus reconciles only durable, confirmed live Autocab booking attempts into a local notification outbox. Preview, rejected, sending and unknown attempts do not produce confirmations. Autocab ID, milestone, normalized recipient and revision form the cross-system idempotency key.

Gateway intents start `HELD`. The central dispatcher can move eligible intents through SENDING to ACCEPTED, UNKNOWN or REJECTED only when both journey and Meta sending flags are explicitly enabled. ACCEPTED is not delivered. Operator takeover and release cancel held intents. No queue is flushed on release. The existing controlled test sender is blocked while the shared gateway is enabled so it cannot bypass operator mode. The common-history API is server-to-server only: it does not grant customers access using a phone number or booking number.

Implemented:
- Durable canonical messages from captured webhook receipts, scoped to workspace/WABA/phone. Rebatched message/status receipts deduplicate by provider message ID. Delivery/read facts do not regress.
- Signed service requests with separate per-direction credentials, five-minute timestamp tolerance and durable unique nonces. Each retry signs a fresh nonce while preserving its operation/event ID.
- Intent POST and status GET; immutable request conflict returns 409; accepted intent returns 202 plus HELD/CANCELLED status. Acknowledgement is not a send receipt.
- Paged history GET, operator conversation list, revision-checked takeover/release, immutable command audit, event fanout and durable consumer inbox. Event callbacks do not trigger sends or grant customer identity.
- Bounded concurrent-safe worker batches; raw receipt and canonical update/event insert commit together. Delivery leases commit before HTTP; retries keep the same event ID. Twelve failed delivery attempts stop automatic retries for manual inspection.
- NeedACab confirmed-booking reconciliation and timeout-safe retry to the gateway. Booking submission has no new HTTP dependency. Existing confirmed source rows allow capture after a crash.

Additional implemented dispatch behavior:
- TaxiCRM is the sole Meta sender. It reads the exact template name/language/category/approval from Meta before every send and supports approved Utility text-body templates only. The central binding chooses parameter order; parameter values are resolved from the authoritative booking, not trusted from the producer.
- A verified, unexpired service recipient grant must match the canonical booking's NormalCustomer ID and normalized phone. Grants require operator permission, explicit verification evidence and an audit row; they do not authorize marketing. STOP/UNSUBSCRIBE suppress the recipient and cancel held notifications. Opaque Meta participant IDs are preserved and never interpreted as E.164; explicit Meta phone fields join the shared E.164 conversation when present.
- A per-conversation PostgreSQL session advisory lock spans dispatch, including its committed claim and the bounded Meta request. Handoff, permission edits and inbound suppression share its transaction-level lock. There is no open database transaction during Meta HTTP. Handoff acknowledges after any already initiated call finishes; such a message cannot be recalled.
- A durable outbox claim is made exactly once. Repeated intents and concurrent dispatchers do not start a second operation. Timeout, HTTP 5xx, malformed success and crashes remain UNKNOWN; no automatic resend or provider fallback. A database failure after Meta acceptance leaves SENDING until crash recovery marks UNKNOWN. Delivery facts from subsequent webhooks remain distinct.
- Canonical outbound history includes the exact template snapshot, rendered text and producer provenance. History/message status events remain durable and paginated.
- NeedACab Plus decides confirmation, driver-assigned, arrival, start, completion and cancellation notifications from read-only authoritative Autocab Booking timestamps, including telephone bookings. Superseded stages and events older than 15 minutes are skipped. The gateway verifies the same milestone/revision and customer link again before sending.
- Blocked intents use bounded backoff so a missing template/permission cannot permanently hold the head of the queue. Each batch runs at most ten sends with two concurrent workers. Receiver/event queues retain their existing bounded batches.
- TaxiCRM Inbox contains service template bindings, recipient verification permission forms and queue reasons, protected by existing integration management permissions. Binding save is not template approval and never sends a message.

Activation dependencies:
- The actual Meta phone was independently confirmed CONNECTED and app 1800340067849051 subscribed to WABA 4556038757974595 on 2026-11-04. The template list was empty at that check. Six Utility templates matching `whatsapp-service-template-drafts.json` have now been submitted to Meta in en_GB and were PENDING at submission. Template submission/approval is separate from message sending.
- Apply both shared and dispatch owner-run migrations and least-privilege grants. Configure verified recipients and bindings to actually APPROVED Meta templates. The shared worker seeds the six default bindings disabled and never overwrites operator changes. Sender activation remains a separate runtime setting; shared storage can be deployed while Meta sending stays disabled.
- Confirm the six English template texts and Meta approval/category, then run a separately authorized allowlisted live smoke test. Do not bulk-enable recipients or send historical queued work. No live WhatsApp messages have been sent by these changes.
- Current authoritative lifecycle support is Autocab. A future native NeedACab booking engine needs an explicit authoritative adapter; unsupported booking providers fail closed.
- Backfill outbound text from older test outbox rows if required; historical content never captured from Meta cannot be reconstructed. Retention, dead-letter review and rotation overlap remain operational rollout decisions.

## HTTP contract

NAC → TaxiCRM:
- `POST /api/internal/whatsapp/v1/message-intents`
- `GET /api/internal/whatsapp/v1/message-intents/{id}`
- `GET /api/internal/whatsapp/v1/conversations/{id}/messages?cursor={id}` (50 messages descending, `next_cursor`)

TaxiCRM → NAC:
- `POST /api/internal/whatsapp/v1/events`, acknowledged only after its event row is stored. Same event ID + different body is a conflict.

Browser operators use existing session/permission checks and same-origin mutation protection at `/api/dashboard/marketing/whatsapp/conversations`. POST requires `conversation_id`, UUID `command_id`, `revision` and `mode: OPERATOR|AUTOMATED`. A stale revision returns 409.

The common history route is internal and must not be exposed as customer authorization.

Machine headers: `x-wa-key`, `x-wa-timestamp` (Unix seconds), `x-wa-nonce`, `x-wa-signature` (hex HMAC-SHA256). Canonical string is METHOD, exact pathname+query, timestamp, nonce, SHA256(UTF8 body), separated by LF. Bodies are limited to 32KiB. No Meta token is shared.

Intent example (replace expiry with a future instant, maximum 24 hours):
```json
{"schema_version":"1.0","workspace_id":"needacabplus","idempotency_key":"autocab:100:booking.confirmed:+447700900123:1","recipient":"+447700900123","booking_id":"autocab:100","event_type":"booking.confirmed","revision":1,"template_binding":"booking.confirmed","parameters":["100"],"expires_at":"2026-11-05T10:00:00Z"}
```

## Configuration and rollout

Default is OFF. Do not change the Meta webhook. Do not copy access tokens to NAC. Do not enable Meta sending as part of this migration.

Both apps:
- `WHATSAPP_SHARED_ENABLED=false` until the additive schema and permissions are verified.
- `WHATSAPP_WORKSPACE_ID=needacabplus`
- `WHATSAPP_NAC_KEY_ID=nac-v1`, `WHATSAPP_NAC_SECRET` (32+ random characters; NAC signs, CRM verifies).
- `WHATSAPP_CRM_KEY_ID=crm-v1`, `WHATSAPP_CRM_SECRET` (a different 32+ character secret; CRM signs, NAC verifies).
- `WHATSAPP_WORKER_SECRET` (32+ random characters, preferably different per app). Background polling uses only a local authenticated worker route; never put this credential in browser code.

TaxiCRM additionally:
- Existing `META_WHATSAPP_WABA_ID=4556038757974595` and `META_WHATSAPP_PHONE_NUMBER_ID=1406119395919653`.
- `WHATSAPP_NAC_ORIGIN=https://webapp.needacabplus.app` (fixed consumer origin).
- Keep `META_WHATSAPP_SENDING_ENABLED=false`, `WHATSAPP_JOURNEY_SENDING_ENABLED=false` and `META_WHATSAPP_TEST_SEND_ENABLED=false` until activation. Only the shared journey dispatcher is permitted to call Meta when enabled.

NAC additionally:
- `WHATSAPP_WABA_ID=4556038757974595`, `WHATSAPP_PHONE_NUMBER_ID=1406119395919653`.
- `WHATSAPP_GATEWAY_ORIGIN=https://taxicrm.plymhub.ai`.
- `WHATSAPP_JOURNEY_CAPTURE_ENABLED=false` until canonical lifecycle capture is reviewed; set true for all six milestone producers. Confirmation-only capture remains available independently.

Apply TaxiCRM migration `20261104000000_whatsapp_shared/migration.sql` using the database owner after its existing WhatsApp migrations, followed by `20261104010000_whatsapp_dispatch/migration.sql`. Apply NAC `scripts/migrations/20261104_whatsapp_shared.sql` to its app database. Grant the restricted runtime role CRUD on the new tables and USAGE/SELECT on the new bigserial sequences; do not give runtime roles schema ownership. No startup DDL is added, compatible with externally managed production schema.

Deploy both changes with the shared flag OFF. Set the secure direction keys/origins and worker secrets. Enable shared storage/event processing in staging; with journey and Meta sending flags OFF this can be verified using synthetic receipts and a synthetic recipient. Each app polls its internal worker every minute when enabled. The CLI scripts are optional source-checkout tools; production uses the compiled worker routes, not tsx or a new container process.

NAC capture considers confirmed attempts updated within the last day and expires confirmations after 15 minutes. Older pending delivery is expired, never resent with a new operation key. Batches skip already captured bookings, avoiding starvation by older records. Repeated intent payloads must preserve their original expiry and parameters.

Monitor raw inbox RECEIVED backlog, shared event attempts >=12, NAC QUEUED attempts >=12 / BLOCKED / EXPIRED and gateway HELD intents. Inspect failures without logging raw payloads, phones, tokens or message content. To replay a known failed callback, reset attempts/nextAttemptAt after fixing the cause, preserving the event ID. Do not delete nonce rows within the five-minute acceptance window.

Rollback: turn `WHATSAPP_SHARED_ENABLED=false` on both apps first; retain the additive tables and raw receipts for recovery. This reverts UI to the legacy captured-window inbox and stops the new background jobs. Do not enable the old test sender during rollback without independent review.

## Verification

Synthetic tests cover both applications. PostgreSQL integration tests use a fresh local cluster restricted to role whatsapp_qa on 127.0.0.1:55439 via WHATSAPP_TEST_DATABASE_URL; they never use DATABASE_URL or a production database. Two actual PostgreSQL sessions verify dispatch-vs-handoff ordering, concurrent dispatch deduplication, visibility of the committed claim during provider HTTP, last-moment permission checks, uncertain timeout and post-acceptance persistence failure. All Meta HTTP in tests is mocked.
