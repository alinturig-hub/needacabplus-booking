# Shared WhatsApp contract — proposal v1

Status: PROPOSAL ONLY. No production code, configuration, database, webhook subscription or message sending changed by this review.

## Verified baseline (4 November 2026)

Reviewed the deployed TaxiCRM commit `ceeb371de557f8901b3ddd6773a732a438a13b70` on `codex/taxicrm`, and NeedACab Plus commit `8a34faea7b3562227a820f94a9aea83ca21ff621` on `main`. Both applications report healthy in Coolify.

Runtime identifiers match the supplied App ID `1800340067849051`, WABA ID `4556038757974595`, and Phone Number ID `1406119395919653`. The supplied business number is `+44 7737 290923`; its Meta registration/display-number association was not independently queried. TaxiCRM uses Graph version `v25.0`. Tokens and webhook secrets were not printed, copied to NeedACab Plus or used for a Meta API call.

TaxiCRM runtime flags: integration and durable inbox enabled; general sending and controlled test sending disabled. NeedACab Plus has no WhatsApp transport implementation or WhatsApp runtime bindings in the inspected deployment.

TaxiCRM already has:

- GET verification challenge and POST exact-byte HMAC signature verification at `https://taxicrm.plymhub.ai/api/webhooks/whatsapp/meta`. Keep this URL unchanged.
- A bounded durable raw-envelope receiver, validated against the configured WABA. Acknowledgement occurs only after persistence or a confirmed raw-body duplicate.
- `WhatsAppWebhookInbox`, unique on connection key/body hash. Its receipt scope is currently `META:<waba>`.
- A read-only inbox projection from the latest 200 envelopes, with message-ID deduplication and non-regressing sent/delivered/read projection within that window. This is not a paginated, complete shared conversation store.
- `WhatsAppOutboundMessage`, operation-key/request-hash conflict checks, durable claim before provider HTTP, provider message IDs, and UNKNOWN rather than automatic resend after an ambiguous result.
- A controlled allowlisted `hello_world` test-send path. This is not a general journey/campaign sender and both send flags are currently off.
- Template listing/local draft validation and generic eligibility policy functions. Template submission and a complete campaign/operator workflow are not established by this implementation.

Not found: a NeedACab Plus ↔ TaxiCRM messaging API, durable operator takeover controls, a takeover-aware dispatch barrier, cross-system event fanout, or a complete common message history. The provider capability endpoint still hardcodes canReceive/canSend false despite the separate receiver/test-send code; readiness indicators and setup documentation need aligning with actual capabilities.

Read-only checks: public webhook GET without verification parameters returned 403, consistent with the deployed handler; this does not prove a valid Meta subscription handshake or real-event ingestion. Twenty existing signature/inbox/projection/outbox/provider/test-send tests passed using synthetic data and mocked transports. No valid webhook was injected, no production message rows were read or changed, and no message was sent.

## Ownership and transport

Keep one public Meta webhook and one outbound WhatsApp gateway in TaxiCRM for this phone. Both applications use the same Meta app/account/number, without independently dispatching through Meta.

| Owner | Responsibility |
| --- | --- |
| TaxiCRM | Operator inbox, assignments/takeover, campaigns, audiences, template catalogue/approval state, consent/suppression, canonical WhatsApp history, durable event routing and the single Meta dispatcher |
| NeedACab Plus | Booking/fare/tracking authority; decides which journey event requires a service notification and requests it through the gateway |

Meta credentials remain in TaxiCRM's secure configuration. NeedACab Plus receives a separate scoped service credential for the gateway, not a second copy of the Meta token. Com.Bot is not an automatic fallback; any additional sender outside this gateway must be identified before claiming system-wide duplicate prevention.

Canonical message scope: `(workspace_id, waba_id, phone_number_id)`. The logical connection key for the supplied phone is `META:4556038757974595:1406119395919653`. Preserve the existing raw WABA-level inbox as the receipt layer; project it into the narrower message scope rather than rewriting old keys blindly. WABA-level template events need not contain a phone ID and must not be discarded for that reason.

Conversation identity is the business phone plus provider participant identity, within a workspace. Store provider identifiers without assuming every identifier is an E.164 phone number. Keep verified phone mapping and customer/account links separately; a booking number or unverified telephone match must not grant access to history.

## Proposed private API (not existing endpoints)

All routes below are proposals. The existing dashboard test-send endpoint is not reused as a service API.

| Direction | Route | Meaning |
| --- | --- | --- |
| NeedACab Plus → TaxiCRM | `POST /api/internal/whatsapp/v1/message-intents` | Durably request a scoped service notification |
| NeedACab Plus → TaxiCRM | `GET /api/internal/whatsapp/v1/message-intents/{id}` | Read actual acceptance/hold/delivery state |
| NeedACab Plus → TaxiCRM | `GET /api/internal/whatsapp/v1/conversations/{id}/messages?cursor=...` | Read authorized, cursor-paginated common history |
| TaxiCRM → NeedACab Plus | `POST /api/internal/whatsapp/v1/events` | Deliver normalized inbound/status/control events |
| TaxiCRM operator UI → TaxiCRM | Takeover/release commands with command ID and expected conversation revision | Change authoritative conversation ownership under operator permissions |

Only TaxiCRM operators can take over/release a conversation. NeedACab Plus cannot send marketing intents, change audience/consent state, impersonate an operator or mutate the common message tables directly.

Example service notification request, with synthetic booking/recipient placeholders:

```json
{
  "schema_version": "1.0",
  "intent_id": "<persisted-source-intent-uuid>",
  "workspace_id": "<agreed-workspace-id>",
  "connection_key": "META:4556038757974595:1406119395919653",
  "producer": "needacabplus",
  "purpose": "SERVICE",
  "idempotency_key": "trip:<canonical-trip-id>:confirmed:<recipient-key>:1",
  "event": {
    "id": "<canonical-domain-event-id>",
    "type": "journey.confirmed",
    "booking_id": "<canonical-trip-id>",
    "revision": 1,
    "occurred_at": "<UTC-ISO8601>"
  },
  "conversation_id": "<canonical-conversation-id>",
  "recipient": {"phone_e164": "<verified-recipient>"},
  "template": {
    "binding": "journey_confirmation",
    "language": "en_GB",
    "parameters": {"booking_reference": "<reference>", "pickup_time": "<time>"}
  },
  "expires_at": "<UTC-ISO8601>",
  "correlation_id": "<trace-uuid>"
}
```

The gateway selects an approved, versioned template from an allowlisted binding; these binding names are proposals, not confirmed Meta templates. It verifies workspace/connection, actor scope, template category, recipient linkage, consent/eligibility, expiry and current conversation mode. Client-supplied purpose or consent claims are not trusted. An optional price/discount in notification text must come from the confirmed booking/fare snapshot, not be recalculated by the messaging gateway.

A new request returns 202 only after durable enqueue, with intent/message IDs and a state such as QUEUED or HELD_OPERATOR. This does not mean sent or delivered. An identical retry returns the original record/state; the same idempotency key with changed request content returns 409. Invalid scope returns 403. Invalid schema returns 422. Booking creation must not fail just because the messaging gateway is unavailable: NeedACab Plus retains its local notification outbox and retries the same intent until expiry.

Journey triggers include confirmed booking, driver assignment/arrival, journey start/completion and cancellation. Each must reference actual authoritative state; pending/rejected/preview bookings cannot generate a real confirmation. Shared canonical booking IDs must map NeedACab request IDs and Autocab IDs so the same milestone is not sent once for each source.

## Shared history and webhook fanout

1. Keep current Meta signature validation and durable raw receipt. Return 200 only when safely recorded. A valid signature alone is not permission to accept an unrelated workspace/phone into this conversation store.
2. A TaxiCRM worker normalizes messages, statuses and relevant WABA/template events into persistent canonical message/event records. Deduplicate messages by scoped provider message ID, not just body hash: Meta can re-batch the same message into different envelopes.
3. Persist the canonical update and per-consumer event deliveries atomically. Every delivery has stable event ID, schema version, scope, occurred/recorded timestamps, correlation/causation IDs and minimal typed data.
4. Deliver to each consumer independently with durable retry, exponential backoff/jitter and a dead-letter queue. NeedACab Plus persists a consumer-inbox receipt before acknowledging; replay keeps the same event ID and business idempotency key.
5. Both applications read the same authorized canonical timeline. NeedACab Plus must not rebuild it from only callbacks it happened to receive. Include inbound/operator/campaign/journey origin, content or template snapshot, provider ID, timestamps and status/error events. Keep internal notes separate from customer-visible messages.

Initial event types: `whatsapp.message.received`, `whatsapp.message.status_changed`, `whatsapp.conversation.taken_over`, `whatsapp.conversation.released`, and relevant template-state changes. A customer message does not automatically authorize a booking mutation; any change follows the booking system's own workflow and permissions.

Existing raw envelopes/outbox rows can be backfilled idempotently. Do not promise recovery of WhatsApp history that was never captured. Replace the 200-envelope UI projection with cursor pagination over canonical history. Preserve individual status/error facts and prevent delayed sent/delivered events from overwriting READ; provider acceptance is distinct from delivery.

## Operator takeover and dispatch races

Persist conversation mode `AUTOMATED` or `OPERATOR`, assigned operator, revision, timestamp and an audit trail in TaxiCRM. A takeover command is idempotent and uses expected revision; it atomically changes mode and holds not-yet-dispatched automated messages from BOTH systems, including marketing and journey notifications. No exception for service messages is implicit in v1.

The sole dispatcher rechecks the authoritative mode immediately before dispatch; a NeedACab Plus cache/event notification is not sufficient. Takeover and automated dispatch share a per-conversation dispatch barrier. Takeover acknowledgement must account for a previously claimed dispatch section before reporting suspension complete. Requests already initiated to Meta before takeover cannot be recalled and may be reported later; expose that in history rather than promising to retract them.

Only an explicit operator release returns to automation. Do not resume on page close/logout or flush all held messages: re-evaluate current booking revision, relevance, expiry, recipient eligibility and consent. Stale arrival estimates or superseded driver assignments are discarded. If the gateway or ownership check is unavailable, automation stays queued/blocked rather than sending directly through Meta.

## Duplicate prevention and unknown outcomes

- Unique inbound message identity: workspace + business phone + provider message ID; separate stable status-event identities support out-of-order delivery and replay.
- Unique outbound operation: workspace + connection + semantic idempotency key. Booking milestone keys are producer-independent; campaign keys use campaign/audience member/offer revision. Random request IDs alone are insufficient.
- Store an immutable normalized request/template snapshot and hash. Changed payload under the same key is a conflict, not a second send.
- One durable dispatcher claim per operation. Delivery-attempt records are separate from message state; no database transaction is held open across a provider call and then rolled back as though nothing was sent.
- An ambiguous timeout, crash after send, or malformed success becomes UNKNOWN. Never automatically retry it with a new key or another provider. Reconcile from provider IDs/status events/operator review; any explicitly authorized resend is audited and linked to the original operation.
- Do not claim exactly-once external delivery from a database uniqueness constraint. This design prevents duplicate application dispatch and deliberately quarantines uncertain outcomes.

## Service authentication and data access

Use HTTPS plus a dedicated, rotatable, per-direction service identity with endpoint/workspace/connection scopes. One concrete option is HMAC over method, path/query, timestamp, nonce and SHA-256 of the exact body, with key ID, a five-minute freshness window and replay-nonce storage. Retries use a fresh signature/nonce but retain the same event/intent ID. Keys remain in secure deployment configuration, never message payloads, browser storage or this document.

Use static configured consumer destinations, not callback URLs supplied in message requests. Actor/workspace authorization is enforced on every read/write; browser/customer callers cannot directly use the service credential. Marketing needs explicit applicable consent and approved templates. Free-form service replies require an open customer-service window; outside it, use an approved template. Recheck eligibility at dispatch, including for queued work. Status webhooks must not extend the inbound customer-message window.

## Rollout and acceptance

1. Agree this contract and the actual workspace/customer/booking identity mappings. Independently confirm the current Meta app subscription/phone association through authorized read-only checks; no callback replacement.
2. Implement canonical history, per-consumer event outbox/inbox and durable takeover controls in TaxiCRM with sending still disabled. Review migrations and backfill existing captured events in isolation.
3. Add NeedACab Plus service-intent outbox, service authentication, shared history access and consumer dedupe. Keep the Meta token only at the gateway.
4. Test batched/replayed webhooks, changed-payload conflicts, two systems requesting the same booking milestone, concurrent workers, out-of-order statuses, wrong phone/workspace, takeover during dispatch, stale queues on release and UNKNOWN outcomes. No real recipients are needed for these tests.
5. After separate authorization, run an allowlisted end-to-end send, verify both histories and takeover, then activate journey notifications independently of marketing. Keep the existing public webhook throughout.

Acceptance requires one canonical timeline visible to authorized staff in both applications, no second application dispatch for a repeated semantic operation, no new automated dispatch after acknowledged takeover (apart from already initiated provider operations), auditable release, and clear ACCEPTED versus DELIVERED/READ/UNKNOWN states.
