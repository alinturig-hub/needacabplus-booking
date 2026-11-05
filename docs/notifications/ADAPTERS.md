# Operational send adapters: simulated release and owner-test proposal

## Implemented

The existing TaxiCRM `meta-send.ts` owns the sole Meta HTTP transport. The v1 dispatcher retains its existing durable outbox/claim and approval checks. Its positional body serializer is now shared with v2; `sendMetaPayload` accepts prepared operational payloads, still gated by the existing sending flag. No v2 live entrypoint, worker, SMS sender or independent NAC sender is enabled.

`operational-adapters.ts` serializes WhatsApp text, positional/named BODY parameters, dynamic URL template buttons and static call/URL buttons. Named send parameters use `parameter_name`. Static buttons need no runtime component; dynamic buttons keep their original slot and receive only the suffix of the exact approved URL prefix. A different origin/prefix is rejected. Approval examples never become send values. A SHA-256 fingerprint binds the raw provider snapshot to the intent; metadata, approval, category, mapped keys and rendered body are checked before serialization.

The single dispatcher module exposes a simulation-only v2 path. Full staging calls it inside the existing PostgreSQL conversation barrier and final consistency fence. Common history stores the exact synthetic provider payload and simulated acceptance separately from actual provider status. Message status remains SIMULATED, provider status NONE, and no real outbox intent is queued. The in-process supplier simulator cannot fall back to fetch.

## Window expiry while processing

Time can close a customer-service window without changing any database revision. After processing delay, if an initially eligible text decision is now outside the strict 24-hour boundary, CRM asks NAC's canonical rule engine for a fresh decision. It must obtain a correctly mapped approved template or block. It never wraps stale text in a template. A final 8-second guard rejects free text too close to expiry, including immediately before the HTTP call. Meta remains authoritative; a timeout is UNKNOWN, never an immediate SMS or automatic resend.

Two real-route PostgreSQL scenarios per event seed an eligible inbound message with four seconds remaining, observe initial `text`, process for five seconds and assert either a template payload or TEMPLATE_NOT_APPROVED with no message. Other canonical/account/grant/takeover races still fail closed.

## Verification

- Exact JSON unit tests for positional/named bodies, button slot/suffix handling, text, stale snapshots, unsupported components, suppression/takeover/expiry and provider acceptance/rejection/unknown outcomes.
- The existing HTTP transport is tested with an injected fake provider: exact endpoint/body/options; no network request to Meta. Free text expiring before the HTTP boundary produces zero requests.
- Existing v1 dispatcher PostgreSQL tests recheck durable claim, both lock orderings, duplicate consumers, unknown timeout, revoked permission, unapproved template and persistence failure after provider acceptance.
- Both full Next applications use the same isolated synthetic PostgreSQL staging environment. No production migration is required. Stage bootstrap upgrades only legacy synthetic template fingerprints via saved rule versions.

## Deliberate limits

Media headers, dynamic header variables, interactive free-form actions, Flow/quick-reply behaviour and actual SMS delivery remain blocked. Static text headers are representable by the pure serializer; the canonical stage capability guard remains conservative about headers. Secure booking link issuance remains separate: the adapter validates a supplied trusted link; it does not invent one. Real catalog approval and named/button sends are not confirmed against Meta by mock tests. No production code has been deployed in this phase.

## One owner-number test: prepared artifact, not execution approval

`evidence/adapters/owner-test-preview.json` fixes one proposed booking-confirmed transport test, one synthetic booking ID, the existing `nac_booking_confirmation_v1` en_GB candidate, the exact preview text/payload, sender identifiers, stop conditions and maximum **one provider POST**. The recipient in the preview is reserved synthetic data, not the owner's number. Real recipient and current Meta approval/metadata have not been confirmed. Approval must bind the final recipient, template fingerprint, exact final payload hash and an expiry; this preview hash cannot authorize a real send.

Generate the packet offline in the TaxiCRM repository:

```sh
npx tsx scripts/notifications/owner-test-preview.ts /tmp/owner-test-preview.json
```

This script has no credentials, DB access or real sender import. After private recipient confirmation and read-only template verification, prepare the final bounded one-shot runner through the existing claim/history path for review. Do not enable global dispatch workers to run this test. ACCEPTED is not DELIVERED; unknown outcomes prohibit automatic retry/SMS.

## Primary references inspected

Meta's current documentation URLs were requested on 2026-11-05 but returned HTTP 429 in this environment. Published Meta examples were also consulted; mock compatibility is not live account certification.

- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components/
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text
- https://www.postman.com/meta/whatsapp-business-platform/request/lwtlz1k/send-message-template-interactive
- https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/types/button_parameter_object/ (Meta-hosted archived SDK, URL-prefix/suffix reference)

## Completed staging evidence (2026-11-05)

Both full Next deployments passed 15 scenarios per event (30 total), including initial text → template after expiry and initial text → blocked when the template is unapproved. Exact simulated payloads, zero actual queued intents and lock contention are recorded in `evidence/adapters/booking-confirmed.json` and `driver-dispatched.json`. Payload/transport tests: 17 passed. Existing PostgreSQL dispatcher tests: 9 passed. Both Next deployment builds and TypeScript checks passed. Staging credentials contain no Meta/SMS provider token, sending flags remain false, and the PostgreSQL database remains private.
