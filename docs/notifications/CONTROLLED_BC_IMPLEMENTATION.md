# Connected controlled Booking confirmed — development only

Implemented in the local PR31/PR8 branches. **No push, remote deployment, production migration, live message or general flag activation is included.** The completed owner-transport-v1 test remains CLOSED/READ per the owner and is never invoked or reset.

## Bound scope and message

Only `SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d`, Booking confirmed revision 1 and the privately configured owner recipient matching the fixed SHA-256 allowlist are accepted. Another booking, recipient, rule/version, scope or mode is rejected. SIMULATED state cannot be promoted into LIVE state in the same event record.

Template: `nac_booking_confirmation_v1`, `en_GB`, approved UTILITY snapshot. Exactly BODY `{{1}} → booking_id → Booking.externalId`; no other variables, media or buttons.

> Your Need A Cab Plus booking SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d is confirmed. Please contact our team if your journey details change.

## Connected implementation

1. The signed application trigger `POST /api/internal/notifications/v2/controlled-booking-event` accepts only the bound booking ID, not caller-supplied customer values or timestamps. It reads the canonical booking/account association, stored active rule/version and pinned template metadata. The original Booking.bookedAtTime supplies event time and the rule supplies TTL.
2. NAC durably registers the existing semantic operation key in `notification_controlled_events` before making one gateway request. A repeated or in-flight request returns the stored state/UNKNOWN and does not forward again. There is no application send retry queue.
3. The signed gateway endpoint `POST /api/internal/whatsapp/v2/controlled-booking-confirmed` accepts an explicit controlled envelope, checks the private profile, and holds the existing PostgreSQL conversation advisory barrier. Its durable `WhatsAppControlledDispatch` record prevents replay after validation failure or crash.
4. TaxiCRM reads current recipient permission/suppression and conversation mode, reads Meta approval in LIVE (a file fixture in SIMULATED), and calls signed NAC `POST /api/internal/notifications/v2/controlled-context` for fresh canonical context. The planning intent remains DRY_RUN; it cannot itself authorize sending. The explicit controlled envelope, mode, exact approval hash and private profile are additionally required.
5. The canonical fence covers the bound booking, locations, account/attempt associations, saved rule and recipient grant. A short final transaction locks the fence row, rechecks policy and claims the existing `WhatsAppOutboundMessage` operation. No transaction remains open during provider HTTP. Another final signed context/eligibility/expiry check occurs after claim, immediately before the one POST.
6. The sole existing `sendMetaPayload` HTTP transport performs the request. Only its argument receives an in-memory sending-enabled copy after all checks; process/global flags stay false. The general dispatch worker never consumes the new controlled ledger. Rejected/unknown/claimed operations never requeue and never invoke SMS. Operator release does not revive a blocked old test.
7. Acceptance, common `WhatsAppMessage` history and an existing `message.accepted` event commit atomically. The content origin is `operational_notification` with booking/operation correlation. SIMULATED transport writes a SIMULATED message and counts zero real provider POSTs.
8. The unchanged signed Meta webhook and existing receipt worker materialize provider statuses. Only controlled-message receipts enrich their existing `message.status` event with the operation reference. NAC projects these events monotonically into its controlled record. READ cannot be downgraded by delayed DELIVERED/FAILED/ACCEPTED events; foreign provider IDs/modes/scopes are rejected.

`GET` on the application event endpoint is HMAC-authenticated and read-only. It remains usable after the controlled mode is disabled or its approval expires, provided the normal shared-service configuration remains enabled. No new public sender, Autocab consumer or automatic general trigger activation is introduced.

## Uncertainty and duplicate handling

The outbox claim commits before HTTP with attemptCount=1. Duplicate producers, duplicate gateway calls, expired events, a blocked operator conversation and a changed canonical snapshot cannot create a second attempt. After acceptance followed by history persistence failure, the durable SENDING claim remains and the controlled result is UNKNOWN: stop and reconcile manually, never resend.

If the app loses the gateway response, it reports UNKNOWN with a null/unknown attempt count for the relevant transport, rather than falsely reporting zero. The common acceptance/status event can later reconcile that state without another provider POST. Receipt-event delivery retries are distinct from sending retries and cannot resend a customer message.

The fixed test currently pins the template branch. An open-window text decision is conservatively blocked rather than silently changing the approved content mode. Do not fake a closed window or turn an expired event into a fresh one.

## Prepared database changes — not applied to production

- NAC: `scripts/migrations/20261105_controlled_booking_confirmed.sql`, trial event/fence table and row-level triggers. The SECURITY DEFINER fence function has a fixed search path and touches only the trial ledger; source booking rows are never changed by it. Unrelated booking/association writes do not invalidate the trial. OLD and NEW associations are checked on moves/deletes.
- TaxiCRM: `prisma/migrations/20261105090000_controlled_booking_confirmed/migration.sql`, immutable-operation registration ledger, with matching Prisma model.
- Existing nonce, shared inbox/event, outbox, rule and canonical tables remain prerequisites. Request handlers perform no automatic DDL or migration.

Both applications must use the same physical canonical database for this controlled path; aliases are checked. Main application roles may differ. Grant the NAC role SELECT/INSERT/UPDATE on its new trial table and its existing nonce/rule access; grant the CRM role SELECT/INSERT/UPDATE on its new ledger, existing outbox/common-history permissions and SELECT/UPDATE on the NAC fence row for locking. No new UPDATE privilege on real Booking data is required for the dispatcher. The migration owner must review role names, function ownership and privileges; do not guess or broaden permissions at runtime.

## Exact future activation sequence — all steps still require release approval

1. **Stop on stale/missing canonical state.** Verify the bound synthetic booking really exists in the authorized shared store, remains eligible/unassigned, has a valid recipient/customer/permission association and an unexpired Booking confirmed event. The earlier rehearsal had expiry **2026-11-05 07:24:29.611 London**, already past during this implementation. The code does not reset that timestamp/TTL or delete an old claim. If it is still the current event, activation is blocked; a separately authorized valid test event/state is needed first. QA timestamps below belong only to fresh disposable databases.
2. Review these commits, target runtime access, all pending migration changes and runtime grants. Only after separate publication/migration approval, deploy compatible NAC/CRM code with `CONTROLLED_BC_MODE=DISABLED`. Apply only reviewed migrations through the approved migration process. No handler auto-applies them.
3. Preserve `META_WHATSAPP_SENDING_ENABLED=false`, `WHATSAPP_JOURNEY_SENDING_ENABLED=false`, `META_WHATSAPP_TEST_SEND_ENABLED=false`. Existing `WHATSAPP_SHARED_ENABLED=true` and receipt processing remain enabled. Provider secrets stay only in secure CRM runtime configuration; never copy them into NAC, QA databases or approval artifacts.
4. Configure each application's bounded profile privately: the exact booking, one allowed recipient, stored `CONTROLLED_BC_RULE_ID` and `CONTROLLED_BC_RULE_VERSION`, `CONTROLLED_BC_TEMPLATE_FILE`, and a new explicit `CONTROLLED_BC_EXPIRES_AT` no more than 24 hours away. Event TTL remains independently enforced. LIVE must use the expected App/WABA/Phone IDs and reviewed HTTPS origins. Normal HMAC keys/nonces are reused.
5. Bind each application's own DB URI identity with `CONTROLLED_BC_DATABASE_IDENTITY_SHA256` (host, port, database name, role; no password). For NAC read-only preparation, provide `CONTROLLED_BC_GATEWAY_DATABASE_IDENTITY` describing the **CRM** main role on the same physical host/port/database; NAC and CRM roles need not match. The final approval hash binds the CRM identity.
6. Read the current approved Meta metadata without changing Meta. Save that metadata-only snapshot privately and match the saved rule fingerprint. With mode disabled, run the NAC read-only command below; it refuses existing registrations/claims, expiry and ineligible canonical state. It does not register an event or send any HTTP request. Then run the CRM offline approval builder. Review the exact recipient, intent, payload, template fingerprint, DB identity, effective expiry and new `approval_sha256`. Do not reuse an earlier owner packet or any prior approval hash.

```sh
# In the authorized NAC runtime with the disabled private profile:
node /app/notification-tools/prepare-controlled-event.cjs /secure/new-controlled-descriptor.json
# In the reviewed CRM checkout; offline, no DB/network:
node /app/notification-tools/prepare-controlled-approval.cjs /secure/new-controlled-descriptor.json /secure/new-controlled-approval.json
```

7. Only after owner approval of that new final packet, put its exact hash in `CONTROLLED_BC_APPROVAL_SHA256` in both scoped profiles, retain the packet privately as `CONTROLLED_BC_PACKET_FILE` for the launcher, and enable only `CONTROLLED_BC_MODE=LIVE`. General flags remain false. Never probe the LIVE event endpoint with a dummy hash: registration/validation is terminal for this operation.
8. From the authorized application runtime invoke **once**:

```sh
node /app/notification-tools/run-controlled-booking-event.cjs --inspect
# Only after the separately approved activation:
node /app/notification-tools/run-controlled-booking-event.cjs --execute
# Read-only monitoring, also after the trial is disabled:
node /app/notification-tools/run-controlled-booking-event.cjs --status
```

The launcher posts to the application trigger, not to Meta. App → TaxiCRM performs the single controlled handoff. If access is missing, the event/approval expires, validation fails or any outcome is uncertain, stop without retry/SMS. Repeated invocation cannot reset a registration or claim. Disable the controlled mode after the attempt and retain all ledgers. Continue normal signed receipt synchronization to DELIVERED/READ. A missing provider/common-history record after uncertainty requires manual reconciliation, not a replacement send.

## Local verification

The reproducible harness creates a **new** local PostgreSQL database matching `notifications_controlled_qa_*` on 127.0.0.1:55439 under whatsapp_qa. Fresh migration definitions are used. All destructive fixture resets and synthetic permissions exist only there, never in the previous owner-test DB or production. Both complete Next applications run locally with the production builds and synthetic HMAC/Meta signature keys. The supplier is an in-process fake using the same payload/HTTP transport seam; it has no network fallback in SIMULATED mode.

```sh
# Set CONTROLLED_QA_RECIPIENT privately to the allowed target and select the CRM checkout.
TAXICRM_CHECKOUT=/path/to/taxicrm npx tsx staging/notifications/controlled/setup.ts
# After building both apps with controlled mode disabled, start them in separate terminals:
CONTROLLED_QA_CONFIG=/secure/config.private.json TAXICRM_CHECKOUT=/path/to/taxicrm python3 staging/notifications/controlled/start.py nac
CONTROLLED_QA_CONFIG=/secure/config.private.json TAXICRM_CHECKOUT=/path/to/taxicrm python3 staging/notifications/controlled/start.py crm
CONTROLLED_QA_CONFIG=/secure/config.private.json TAXICRM_CHECKOUT=/path/to/taxicrm npx tsx staging/notifications/controlled/check.ts
```

Evidence in `evidence/controlled-bc-implementation/` is redacted and **cannot be used as an execution packet**. Counts and final commit IDs are recorded with the prepared result. No LIVE execution command was run.

### Verified result

26 full production-Next/PostgreSQL scenarios passed, including exact payload, signed receipt ingestion, status readback, foreign receipt rejection, both operator lock orderings, eight concurrent triggers, suppression/cancellation after claim, expiry during processing, unknown responses and post-acceptance persistence failure. Four profile guard tests, 26 CRM regressions, nine existing dispatcher PostgreSQL tests and six NAC regressions passed. Both Next builds, TypeScript, targeted lint and Prisma validation passed. Zero real provider POSTs. Commit IDs are provided in the accompanying task result; changes remain local and unpublished.

## Subsequent draft-PR publication

This implementation-phase record originally described unpublished local work. The verified source commits are now being published to the existing draft PR branches through a fast-forward cherry-pick workflow, with no release action. See [PUBLICATION_REVIEW_20261105.md](PUBLICATION_REVIEW_20261105.md) for full source/applied IDs, live-version comparison, exact migration/grant SQL and activation/deactivation instructions. The code is not thereby deployed or enabled.
