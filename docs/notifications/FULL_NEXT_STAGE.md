# Notifications v2: full Next applications, isolated PostgreSQL

This supersedes the pending full-application/PG milestone in SHARED_GATEWAY_V2.md. The earlier SQLite protocol lab remains historical evidence, not evidence of PostgreSQL locking.

## Scope and isolation

Both complete Next applications run in a separate Coolify environment `notifications-full-next-staging`, using one new private PostgreSQL 17 database `notifications_fullstage`. Only synthetic bookings, accounts, grants, catalog entries and operator identities are used. Production applications, canonical ingestion, Meta templates and the existing Meta webhook are unchanged. Deployment uses separate staging Dockerfiles; production entrypoints and workers are bypassed. No Meta/SMS credential is provisioned. Sending is disabled.

- NAC: https://tfz8ctgb0xupjw69vku1b7zl.144.76.63.11.sslip.io/admin/notifications
- CRM: https://eqcd0c860djikhvkinzmtbpi.144.76.63.11.sslip.io/dashboard/marketing/whatsapp/inbox

Credentials are kept outside the repository. Positive runtime guards require the staging workspace, database identity, all database aliases, origins and no-send flags. Provider secrets or sending flags fail closed. The control endpoints additionally require the existing HMAC authentication and durable PostgreSQL anti-replay nonces. They are unavailable outside this guarded environment.

## Real application path

1. Real NAC admin login/session, same-origin check and `/api/admin/notifications/staging-booking` create a synthetic canonical Booking. The operator chooses either saved active rule.
2. Signed `/api/internal/notifications/v2/booking-event` reads the saved rule/version and current canonical booking. Driver dispatched maps to the existing canonical `driver.assigned` lifecycle evidence (`acceptedAt`), not a second booking consumer.
3. NAC calls the single TaxiCRM gateway `/api/internal/whatsapp/v2/notification-preview`. CRM reads actual recipient grants, inbound messages and conversation mode, then calls signed NAC `/api/internal/notifications/v2/context-preview` for a fresh validated snapshot.
4. Policy chooses the existing application flow, WhatsApp text or a synthetic approved template. Every missing required value blocks evaluation. Template approval here is a test fixture, not actual Meta approval.
5. CRM persists an immutable idempotent decision, common `WhatsAppSharedEvent`, and ready messages in the existing `WhatsAppMessage` history with status **SIMULATED**. Provider status remains NONE and `provider_called=false`; no actual outbound intent is queued. Existing signed v1 conversation-history routes return the completed content.

Saving/evaluating never activates real sending. APP_NOTIFICATION_FLOW_SELECTED records the policy decision; this test does not send an app push.

## Verified sources

| Value | Canonical source |
|---|---|
| booking_id | Booking.externalId, provider AUTOCAB |
| customer_name | Booking.customerName |
| pickup_address | BookingLocation.address, type PICKUP |
| dropoff_address | BookingLocation.address, type DESTINATION |
| pickup_time | Booking.pickupDueTime, formatted Europe/London |
| driver_name | Booking.driverForename |
| vehicle_registration | Booking.vehicleRegistration |
| application association | confirmed web_booking_attempts.external_booking_id → user_id → customer_accounts.id |
| recipient | Booking.telephoneNumber, normalized by existing helper |
| service permission | WhatsAppRecipientGrant, valid verification dates and customerId matching Booking.normalCustomerId |
| WhatsApp window | latest eligible customer INBOUND/RECEIVED WhatsAppMessage, never an outbound notification |
| takeover | WhatsAppConversation.mode and revision via existing shared handoff helper |

No phone/email guessing establishes an application account. Secure manage/track URL issuance is still not wired into this stage; missing required links block rules rather than inventing URLs.

## PostgreSQL consistency and tests

The simulated dispatcher uses the same session advisory conversation lock key as the existing gateway; handoff uses the same transaction advisory lock. The lock spans context validation and simulated transport. A short final transaction locks a staging revision fence and rechecks cancellation, recipient suppression, takeover, expiry and snapshot consistency. No database transaction is held over HTTP. Canonical/account/rule/grant/conversation changes bump the staging fence.

`staging/notifications/full/check.ts` calls the actual deployed Next endpoints with existing service authentication. Each event covers closed window/template, open window/text, linked app account, cancellation, expiry, unapproved template, missing field, missing grant, suppression, 12 simultaneous duplicate requests, cancellation during simulation, and both PostgreSQL lock orderings between dispatch and handoff. Tests observe actual advisory-lock contention. After takeover acknowledgement, subsequent notifications are blocked. History is checked in both applications; real queued intents must remain zero.

Run confirmed first, then driver, without overlapping suites (they deliberately share one synthetic conversation):

```sh
NODE_USE_ENV_PROXY=1 NOTIFICATIONS_FULL_STAGE_CONFIG=/secure/private.json npx tsx staging/notifications/full/check.ts --confirmed-only
NODE_USE_ENV_PROXY=1 NOTIFICATIONS_FULL_STAGE_CONFIG=/secure/private.json npx tsx staging/notifications/full/check.ts --driver-only
```

Versioned synthetic evidence is in `evidence/full-next/`. The actual NAC admin UI creates bookings, renders complete messages and displays common gateway results. Desktop/mobile browser checks pass with no horizontal overflow or runtime errors. Supporting guard/regression tests and full Next builds passed in both repositories.

## Remaining limits before activation

This proves the guarded application integration with simulated transport, not production sending. Real Meta approval/catalog synchronization, secure booking link issuance, provider adapters for all editor components, SMS fallback delivery, production migration review and an explicitly approved owner-number send remain separate work. Production lifecycle ingestion must be wired only through the existing canonical owner after review. No second Autocab consumer is introduced. A live rollout or real send requires explicit approval of the prepared result.

## TaxiCRM operator demonstration

A synthetic `@notifications.invalid` administrator is provisioned only through the guarded, signed staging bootstrap. Its tables use the existing User/RBAC migration definitions; login uses the unchanged NextAuth credentials provider, bcrypt and real session cookie. The existing dashboard conversation routes enforce RBAC. No forged session or authentication bypass is used.

The actual shared inbox displays the simulated completed messages. Clicking its existing **Take over conversation** button updates the common conversation through the real authenticated route. A subsequently created synthetic NAC booking returns OPERATOR_TAKEOVER with no provider call. Explicit **Release to automation** is then verified. See `evidence/full-next/crm-ui-report.json`.
