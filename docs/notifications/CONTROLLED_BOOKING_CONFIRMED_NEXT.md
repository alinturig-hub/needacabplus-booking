# Next controlled Booking confirmed trigger test — not sent

The previous owner transport test is CLOSED/READ as confirmed by the owner. Its packet, owner-transport-v1 operation key, outbox claim and approval are not reused. No call to the old runner is made by this preparation.

## New concrete preparation

- Test UUID: 53fd75f0-eb4d-4042-8ee6-92ebcc845f9d.
- Synthetic Booking.externalId: SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d.
- Application request UUID: baf9e881-a255-4d5f-9ae1-70a62df8fb6a.
- Saved isolated rule: controlled-bc-53fd75f0-eb4, revision 2.
- Idempotency: the existing canonical `autocab:<NEW_BOOKING>:booking.confirmed:<RECIPIENT>:1` key, not owner-transport-v1. The full value is in the private manifest.
- Recipient: only the owner-confirmed number in the private allowlist, matched before preparation; no phone is committed to Git.
- Template: nac_booking_confirmation_v1, en_GB, APPROVED/UTILITY in the read-only catalog snapshot used for preparation (2026-11-05 06:56 London).
- Mapping: BODY {{1}} → booking_id → Booking.externalId. No other variables or buttons.
- Manifest: new format/purpose CONTROLLED_BOOKING_CONFIRMED_TRIGGER, execution_enabled=false, maximum one POST, zero retries, SMS=false. This is not a live authorization packet.

Message:

> Your Need A Cab Plus booking SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d is confirmed. Please contact our team if your journey details change.

## Changes implemented in this preparation

`staging/notifications/full/prepare-controlled-booking-confirmed.ts` generates fresh booking/test/rule/request identities instead of reading the old owner packet or using its fixed reference. It invokes the real HMAC-protected application Booking confirmed route, reads the canonical synthetic booking and saved rule, passes through the existing sole TaxiCRM simulation gateway and checks both NAC decisions and common TaxiCRM history.

The new TaxiCRM `controlled-booking-confirmed.ts` preparation contract rejects an old smoke-test booking ID, a different recipient, a different trigger/revision, changed mappings, missing approved template snapshot, suppression, operator takeover, prior provider acceptance and expiry. It pins the exact provider payload and a separate new manifest hash. It has no HTTP/DB/execution entrypoint and does not alter the previous one-shot runner.

Only local isolated PostgreSQL 127.0.0.1:55439 / notifications_fullstage / whatsapp_qa and loopback staging Next apps are allowed by the harness. It refuses Meta/SMS tokens and does not create real bookings or live grants. Any permission/grant mutations used for guard tests are explicitly synthetic fixtures in this database. Shared conversation history may retain the same participant conversation; **a conversation is not an operation claim**. All notification operation keys and booking IDs are fresh.

Assertions passed: one canonical decision, one SIMULATED common-history message and one shared event for the main new booking; repeated delivery of the same event returns the existing result without another message; separate fresh synthetic probes return RECIPIENT_SUPPRESSED and OPERATOR_TAKEOVER with no message. Three preparation-contract tests and repository TypeScript checks passed. No real provider POST was made.

## Implementation difference still required for the requested Meta leg

The current app-to-gateway v2 route remains DRY_RUN/SYNTHETIC-only. The new preparation contract intentionally cannot send. The existing Meta HTTP transport and durable outbox machinery are available, but this new trigger manifest is **not wired to a narrowly authorized live dispatcher**. The old owner runner is not a substitute: it bypasses the trigger and fixes the previous synthetic booking reference.

Before a real execution can be offered for approval, connect a scoped app-controlled handoff for this purpose to the existing TaxiCRM dispatcher. It must verify signed fresh canonical context and saved rule version, enforce the one-number allowlist and new manifest hash, re-read approved Meta metadata, respect suppression and operator state under the existing conversation lock, commit a unique durable claim under the NEW application operation key, and use the single Meta transport once. No independent sender, new Autocab consumer, general worker activation or reset of prior operations is permitted. A production deployment or real send is not authorized by this preparation.

## Review/execution sequence

1. Review the new test identity, exact message, template/body mapping, recipient and requested implementation difference above.
2. Implement and test the scoped live handoff with a simulated provider and actual PostgreSQL claims/concurrency; do not enable it generally. Keep the old READ operation immutable.
3. In an authorized runtime, recheck live Meta approval, recipient permission/suppression, operator takeover, new-key absence and current canonical event/TTL. This rehearsal does not resolve the previous private-PostgreSQL access limitation.
4. Generate a fresh final execution approval packet binding the new operation, recipient, exact payload/hash and expiry. The preview event has the existing 15-minute TTL and must not be silently refreshed or replayed after expiry.
5. Only after explicit approval of the prepared final result, allow maximum one provider POST, record acceptance/common history/correlation, and track delivered/read via the existing signed Meta webhook. UNKNOWN stops with no retry or SMS. All general flags stay false.

Evidence is in `evidence/controlled-booking-confirmed/`. The complete target manifest and payload are private, separate files. Neither production bookings nor the completed owner test were modified. No schema migration, live deployment, general notification flag change or live message occurred.

## Subsequent implementation

The previously missing scoped app-to-transport handoff is now implemented locally in [CONTROLLED_BC_IMPLEMENTATION.md](CONTROLLED_BC_IMPLEMENTATION.md), with simulated verification and an explicit activation plan. This does not activate or publish it, extend the original event TTL, or authorize a real send.
