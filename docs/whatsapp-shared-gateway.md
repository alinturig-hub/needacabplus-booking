# Shared WhatsApp gateway — staged implementation

This change implements the shared storage and service contract. **It does not activate automatic Meta sends.** The existing Meta webhook URL remains `https://taxicrm.plymhub.ai/api/webhooks/whatsapp/meta`; the signed receiver and its acknowledgement behavior are unchanged.

## Responsibilities and current boundary

TaxiCRM owns canonical messages, conversation mode and its audited commands, service intents and the event delivery outbox. NeedACab Plus reconciles only durable, confirmed live Autocab booking attempts into a local notification outbox. Preview, rejected, sending and unknown attempts do not produce confirmations. Autocab ID, milestone, normalized recipient and revision form the cross-system idempotency key.

Gateway intents are deliberately `HELD`, not sent or described as delivered. Operator takeover and release cancel held intents. No queue is flushed on release. The existing controlled test sender is blocked while the shared gateway is enabled so it cannot bypass operator mode. The common-history API is server-to-server only: it does not grant customers access using a phone number or booking number.

Implemented:
- Durable canonical messages from captured webhook receipts, scoped to workspace/WABA/phone. Rebatched message/status receipts deduplicate by provider message ID. Delivery/read facts do not regress.
- Signed service requests with separate per-direction credentials, five-minute timestamp tolerance and durable unique nonces. Each retry signs a fresh nonce while preserving its operation/event ID.
- Intent POST and status GET; immutable request conflict returns 409; accepted intent returns 202 plus HELD/CANCELLED status. Acknowledgement is not a send receipt.
- Paged history GET, operator conversation list, revision-checked takeover/release, immutable command audit, event fanout and durable consumer inbox. Event callbacks do not trigger sends or grant customer identity.
- Bounded concurrent-safe worker batches; raw receipt and canonical update/event insert commit together. Delivery leases commit before HTTP; retries keep the same event ID. Twelve failed delivery attempts stop automatic retries for manual inspection.
- NeedACab confirmed-booking reconciliation and timeout-safe retry to the gateway. Booking submission has no new HTTP dependency. Existing confirmed source rows allow capture after a crash.

Still required before sending activation:
- Verify the actual Meta subscription and phone registration; confirm approved service template names, language, parameter order and freshness. No template approval is inferred from an intent's binding.
- Authoritative verified customer/recipient links and eligibility/suppression checks. Normalizing an E.164 phone is **not** proof of ownership or marketing consent. Opaque Meta participant IDs are preserved separately and not guessed into phone identities.
- Wire canonical driver-assigned/arrival/start/completion/cancellation transitions with their authoritative revision and booking mapping. The API validates these milestone shapes, but this change captures only confirmed NeedACab cash booking attempts automatically.
- Implement the one central provider dispatch worker, shared per-conversation barrier for claim vs takeover, approved template binding resolution, last-moment booking/eligibility checks and UNKNOWN recovery. No provider-dispatch worker is included here; HELD intents cannot reach Meta.
- Backfill outbound content from the existing test outbox if needed. Incoming raw envelopes provide canonical inbound content and outbound status facts, not historical outbound text absent from the capture.
- Review retention, dead-letter inspection/replay, signed-key rotation overlap and operator permissions for production.

## HTTP contract

NAC → TaxiCRM:
- `POST /api/internal/whatsapp/v1/message-intents`
- `GET /api/internal/whatsapp/v1/message-intents/{id}`
- `GET /api/internal/whatsapp/v1/conversations/{id}/messages?cursor={id}` (50 messages descending, `next_cursor`)

TaxiCRM → NAC:
- `POST /api/internal/whatsapp/v1/events`, acknowledged only after its event row is stored. Same event ID + different body is a conflict.

Browser operators use existing session/permission checks and same-origin mutation protection at `/api/dashboard/marketing/whatsapp/conversations`. POST requires `conversation_id`, UUID `command_id`, `revision` and `mode: OPERATOR|AUTOMATED`. A stale revision returns 409.

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
- Keep `META_WHATSAPP_SENDING_ENABLED=false` and `META_WHATSAPP_TEST_SEND_ENABLED=false`.

NAC additionally:
- `WHATSAPP_WABA_ID=4556038757974595`, `WHATSAPP_PHONE_NUMBER_ID=1406119395919653`.
- `WHATSAPP_GATEWAY_ORIGIN=https://taxicrm.plymhub.ai`.

Apply TaxiCRM migration `20261104000000_whatsapp_shared/migration.sql` using the database owner after its existing WhatsApp migrations. Apply NAC `scripts/migrations/20261104_whatsapp_shared.sql` to its app database. Grant the restricted runtime role CRUD on the new tables and USAGE/SELECT on the new bigserial sequences; do not give runtime roles schema ownership. No startup DDL is added, compatible with externally managed production schema.

Deploy both changes with the shared flag OFF. Set the secure direction keys/origins and worker secrets. Enable shared storage/event processing in staging; with no Meta send paths active this can be verified using synthetic receipts and a synthetic recipient. Each app polls its internal worker every minute when enabled. The CLI scripts are optional source-checkout tools; production uses the compiled worker routes, not tsx or a new container process.

NAC capture considers confirmed attempts updated within the last day and expires confirmations after 15 minutes. Older pending delivery is expired, never resent with a new operation key. Batches skip already captured bookings, avoiding starvation by older records. Repeated intent payloads must preserve their original expiry and parameters.

Monitor raw inbox RECEIVED backlog, shared event attempts >=12, NAC QUEUED attempts >=12 / BLOCKED / EXPIRED and gateway HELD intents. Inspect failures without logging raw payloads, phones, tokens or message content. To replay a known failed callback, reset attempts/nextAttemptAt after fixing the cause, preserving the event ID. Do not delete nonce rows within the five-minute acceptance window.

Rollback: turn `WHATSAPP_SHARED_ENABLED=false` on both apps first; retain the additive tables and raw receipts for recovery. This reverts UI to the legacy captured-window inbox and stops the new background jobs. Do not enable the old test sender during rollback without independent review.
