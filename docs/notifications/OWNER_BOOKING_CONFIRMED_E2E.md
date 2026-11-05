# Booking confirmed: controlled synthetic end-to-end preparation

Status: **prepared, not sent**. The target recipient and complete evidence are in the private preparation files, outside Git. This test does not authorize general notifications or create a real booking.

## Live catalog read

On 2026-11-05 at 06:56 London, a read-only Meta catalog request returned all six operational templates as APPROVED / UTILITY / en_GB, without pagination remaining. No template or Meta setting was changed. See `evidence/owner-booking-confirmed/live-catalog-status.json`.

The selected existing template is `nac_booking_confirmation_v1`, Meta ID `1384212676937085`. Its verified snapshot fingerprint is `fd6dd0fa15d844023153906c049f7778785d704364de27b4752e04bc9b9079b1`. It contains exactly one BODY variable and no buttons or header. The saved catalog snapshot agrees with the earlier reviewed private packet. Live status must be rechecked immediately before any future send.

## Exact mapping and content

| Message variable | Operational source | Canonical source | Synthetic value |
|---|---|---|---|
| BODY `{{1}}` | booking_id | Booking.externalId | SYNTHETIC-OWNER-TEST-20261105 |

Customer name, pickup, destination and pickup time are read through the existing canonical adapter but are **not variables of this approved template**. The previous five-variable demonstration used a synthetic catalog template. It must not be substituted for this real approved template.

> Your Need A Cab Plus booking SYNTHETIC-OWNER-TEST-20261105 is confirmed. Please contact our team if your journey details change.

The provider payload consists of template name, en_GB language and one body text parameter containing that booking ID. There are no dynamic buttons or URL parameters. Payload SHA-256: `b056cc7f3ae955551cefd16c9d9fe6bfbf82323e13c7e5794c37450ce2e8b593`.

## Actual simulated trigger execution

`staging/notifications/full/prepare-owner-confirmed.ts` is a fail-closed local preparation harness. It accepts only PostgreSQL at 127.0.0.1:55439, role whatsapp_qa, database notifications_fullstage, and loopback full Next staging routes. It refuses Meta/SMS credentials. The reviewed private packet hash and live catalog snapshot must agree.

It creates a new synthetic canonical Booking and PICKUP/DESTINATION rows only in this isolated database. The fixture has a telephone booking source, no associated application account, and a separate synthetic normalCustomerId/conversation/grant. The simulated permission fixture is explicitly **not live consent**.

The stored rule `owner-confirmed-e2e`, revision 2, is active only in the isolated simulation. It maps just `{{1}} → booking_id`, uses the real template snapshot and preserves the existing app flow. Synthetic activation does not enable any provider or production rule.

The actual HMAC-authenticated Next route `/api/internal/notifications/v2/booking-event` processes Booking confirmed revision 1 from Booking.bookedAtTime, asks the single TaxiCRM gateway for a fresh canonical decision, and chooses template for a closed conversation window. TaxiCRM persists the message as SIMULATED in the existing common history; NAC persists the rule/version decision. The exact generated payload matches the reviewed packet. Assertions passed: one NAC decision, one shared message, one shared event, no actual queued intent, zero real provider POSTs and zero real booking mutations. Redacted evidence: `evidence/owner-booking-confirmed/e2e-redacted.json`.

## Execution sequence to review before a future real test

1. Review this mapping, selected template, rendered message, exact recipient in the private packet, payload hash and the single-attempt limit. Do not treat a prior transport-only approval as general trigger activation.
2. In an authorized TaxiCRM runtime with access to the bound private PostgreSQL, recheck the packet hash/expiry and server/database identity; read current Meta approval and fingerprint. Keep all general sending flags false.
3. Recheck service denial/suppression, operator takeover and existing durable claims. Stop on missing access or any failed check. Use the existing conversation lock and one durable claim.
4. If specifically approved, the existing pinned owner one-shot runner may send the reviewed exact payload once through the sole TaxiCRM transport. The local trigger preparation proves payload generation; the owner runner itself remains a narrow transport smoke test and does not subscribe to or activate production booking events.
5. Record provider acceptance in the common history with the synthetic booking reference and approval correlation. Treat acceptance separately from delivered/read receipts. UNKNOWN stops without retry or SMS. Do not touch real bookings or enable workers.

There is no live automatic v2 trigger sender enabled by this preparation. The earlier private-PostgreSQL access limitation still applies to a real one-shot execution; this isolated rehearsal does not resolve it. The owner runner from commit 01d3457 is unchanged and was not executed here. No production migration, deployment, real grant, real booking or general flag was modified.
