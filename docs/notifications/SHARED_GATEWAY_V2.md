# Notifications shared gateway v2 — development contract and staging rehearsal

Status: **review proposal with executable no-send cross-application tests**. Extends PR31 and TaxiCRM PR8. No production route is mounted; handler factories are exercised by two isolated HTTP servers and now by the dedicated remote staging lab described below. No sender, migration, deployment, runtime flag, Meta template or webhook was changed. Existing v1 intents/callbacks remain strict and untouched.

## Integrated review corrections

Reviewed `codex/notifications-review-fixes` commit `4840a9adc41e0b77163a18a71a543fa3e82b875c`, read `REVIEW_FIXES.md`, and cherry-picked it as `beb11de` on the PR31 development branch. It adds post-render text/SMS/parameter limits, explicit text/interactive modes, text-only button disclosure, stable button slots and duplicate mapping validation. Existing valid rules remain compatible; no SQL schema change.

During v2 review an additional conservative capability correction was made: the current BODY-only gateway cannot handle **static phone/URL buttons either**, so any template button is blocked when the button adapter capability is unavailable. A rich editor or an approved template does not imply a rich sender exists.

## Ownership and protocol source

- NeedACab Plus owns canonical booking ingestion, saved rule versions, fresh booking/account proof, rendering and secure link issuance. No additional Autocab consumer or booking copy.
- TaxiCRM remains the **only** Meta sender and owner of conversation state, recipient service grants/suppression, provider status and operator takeover. No duplicate operational triggers in CRM.
- Canonical protocol source: NAC `lib/notifications/v2/contract.ts`; generated verbatim into CRM `notifications-v2-contract.ts`. `scripts/sync-notifications-v2.py` updates/checks the copy. The cross-application test fails on source drift.
- All v2 requests currently require `mode=DRY_RUN`, origin `operational_notification`, synthetic booking identity and the expected workspace. Campaign/operator origins cannot use the operational intent endpoint. Actual send capability is absent.
- Preserve current Meta webhook `https://taxicrm.plymhub.ai/api/webhooks/whatsapp/meta` and server-held credentials. No Meta credentials are passed between these applications.

## Routes, implemented as handler factories (isolated staging only)

### NAC → TaxiCRM

`POST /api/internal/whatsapp/v2/notification-preview`

Strict IntentV2 fields:

| Group | Fields / invariants |
|---|---|
| Identity | schema_version=2.0, mode=DRY_RUN, origin=operational_notification, workspace_id |
| Canonical event | booking_id=`autocab:SYNTHETIC-…`, event_type=booking.confirmed or driver.assigned, revision, occurred_at, expires_at |
| Recipient | normalized E.164; must exactly match the fresh server-resolved canonical recipient in NAC; CRM still supplies verified service grant and suppression state |
| Idempotency | **Same as v1**: `<booking_id>:<canonical_event>:<recipient>:<revision>`. No rule version, protocol version, text mode or template version in the key. Renaming the UI event cannot create a new send. |
| Rule | saved rule ID and exact revision |
| Content | open_window_mode=text/interactive, closed template ID/name/language/fingerprint, body source mappings, separate button index/source mappings |

The UI's driver.dispatched is converted to existing canonical `driver.assigned`. No new event spelling is sent to v1 or canonical ingestion. Existing revision semantics remain: confirmation 1, assignment from verified canonical evidence. The fixture revision is synthetic; no new production lifecycle evidence is invented.

No rendered customer values or Meta approval examples belong in the intent. The server resolves booking data afresh. Maps must match the saved rule revision exactly; duplicate body variables/button slots or unknown keys are rejected.

### TaxiCRM → NAC

`POST /api/internal/notifications/v2/context-preview`

Payload contains the validated intent and **CRM-owned GatewayState**: conversation ID/revision, operator state, last eligible inbound client timestamp, verified recipient/service permission/suppression, prior provider status, explicit definitive-unavailability evidence, duplicate/high-water state and configured adapter capabilities. Only the signed CRM identity may provide this state; never accept it from a browser.

NAC loads the saved rule and fresh canonical snapshot using a server-side ContextLoader. It checks canonical recipient, rule identity/version and intent policy against the stored definition. No customer data can be supplied through extra request fields. The current test loader uses only synthetic fixtures; a production canonical loader is deliberately not mounted here.

NAC's policy engine then decides:
- verified account-linked webapp booking → preserve existing app flow, no additional WhatsApp/SMS;
- operator/suppression/missing data/cancelled/stale/expired → block or omit with a reason;
- open inbound 24-hour window → configured text; interactive currently blocks, with no silent downgrade;
- closed window → approved Utility template with matching fingerprint/map/capabilities;
- confirmed unavailability + enabled eligible SMS policy → SMS candidate;
- UNKNOWN, timeout, ACCEPTED, DELIVERED, READ → no new automatic send or immediate fallback.

Filling variables uses existing canonical field sources documented in `STAGE_ONE_REVIEW.md`. Pickup time is formatted in Europe/London. Approval examples never become operational values. Maps are saved once per rule, values vary per booking.

### ResultV2

Correlates exact idempotency key, booking, rule ID/version, conversation ID/revision; checked_at is no more than 30s old and cannot be future-dated. Returns decision, reason, structured explanations (including TEXT_ONLY_MODE when configured template buttons are omitted), channel, explicit content_mode, optional prepared synthetic content and provider_called=false. Provider status remains separate from readiness.

Only template mode returns body_parameters and separate button_parameters. Text mode returns rendered text without template button parameters. A blocked/omitted result cannot contain prepared content or parameters. The decoder verifies mapping identities, slot uniqueness, HTTPS button URLs and open/closed window selection. The rehearsal caps prepared content at 4096 characters as an explicit conservative protocol limit, not a newly verified Meta template rendering allowance.

Template fingerprints in this rehearsal are opaque server-owned bindings; production normalization and current-Meta catalog verification remain required before mounting a real context loader. The v2 draft does not claim that fixture fingerprint strings verify a real template.

The dynamic button field is a **full secure URL**, not Meta's URL suffix. The future TaxiCRM Meta adapter must fetch the approved button definition, verify the URL against its immutable approved prefix and extract the exact suffix. Static Call requires a separately supported approved phone component. Quick reply/Flow require real handlers and remain blocked. No live secure manage/tracking issuer is yet verified; the demonstration uses `https://synthetic.invalid/opaque-test-token` only.

## Auth, failures and handoff

Both directions reuse existing HMAC method/path/body-hash/timestamp/nonce authentication, distinct service identities, bounded bodies/responses and no redirects. The test reserves nonces in isolated memory; mounting staging routes must use existing durable nonce storage and scoped service identities, not this test store. No Meta access token is copied to NAC, browser, Git or logs.

TaxiCRM re-reads GatewayState after the NAC round trip. A newly acquired operator conversation blocks and removes prepared content. A changed conversation revision, grant, window, prior status, duplicate watermark or capability profile blocks for fresh evaluation. Expiry is checked again. This preview recheck **does not replace the existing dispatch advisory barrier**: any future real worker must perform fresh validation/claim under that barrier and the existing shared durable outbox. No new queue has been created here.

There is no automatic retry/fallback on context timeout. The preview call fails closed. A future send timeout remains UNKNOWN and requires reconciliation with the same operation key; accepted cannot be called delivered.

## Status contract

States: NONE (no attempt), UNKNOWN (indeterminate), ACCEPTED (provider acknowledged), DELIVERED, READ, REJECTED (definitive rejection), FAILED (subsequent failure). Only verified Meta webhook receipts can establish delivery/read/failure. A client-supplied status is not evidence.

`applyReceipt` is a pure rehearsal reducer: exact provider-message correlation, increasing gateway-assigned projection revision (not an invented Meta webhook sequence), no downgrade of delivery/read by delayed receipt, UNKNOWN can resolve to ACCEPTED via verified evidence. Duplicate/old revisions do not replay. NONE/UNKNOWN cannot be injected as delivery receipts. This is **not wired into the live history projection** and does not persist new statuses. Stable receipt sequencing and dedup remain the existing gateway's responsibility when integration is implemented.

Marketing permission and operational service permission remain independent. Current strict v1 callback allow-lists are unchanged. Any future recipient/template configuration event extensions require separate negotiated schemas and versioned handlers; none are silently added by this v2 preview.

## Execute the local staging rehearsal

Check out both companion PR heads with installed dependencies, then in NAC:

```sh
python3 scripts/sync-notifications-v2.py "$TAXICRM_TEST_ROOT" --check
TAXICRM_TEST_ROOT=/path/to/taxicrm npm run test:notifications:v2
```

Optional `NOTIFICATIONS_TEST_ARTIFACT_DIR=/path/to/artifacts` saves a JSON report; default `/tmp/notifications-v2-artifacts`. No secrets are needed: each test generates distinct ephemeral HMAC secrets and binds two random loopback ports. HTTPS caller identities are rewritten **inside the test transport only** to those loopback servers. Unexpected/provider destinations are forbidden. There is no insecure TLS bypass in application code.

Covered: both lifecycle events, open/closed windows, associated app account, recipient/service/suppression checks, named fields, body and separate dynamic button values, missing link, current sender limits, text-only buttons/interactive refusal, unknown/SMS policy, duplicate/stale/expiry, cancel-after-intent, takeover-during-context, expiry-during-context, DST, signed replay/body tampering, scope/version/mode/origin/extra fields, canonical-recipient/rule revision conflict, response correlation/freshness, provider status transitions and a no-retry context timeout. These are actual HTTP exchanges between both repository implementations, **not an assertion that remote staging has passed**.

## Remote staging procedure and remaining full-application checks

1. Review both PRs and this contract. Select isolated staging deployments and dedicated synthetic fixture loaders; do not attach real bookings or provider transports.
2. Mount the handler factories at the proposed paths only on staging, behind existing durable HMAC auth/nonce reservation. Keep production routes and all sender flags untouched. Deployment/configuration is a separate reviewed action; none performed here.
3. Verify network identity and scope; run two-direction HMAC replay/tamper tests. Store no tokens/raw customer payloads in logs. Use synthetic-only IDs/recipients and redact idempotency keys if logged (they contain the recipient).
4. Run the matrix above across staging HTTPS origins with production-grade durable replay storage and the same no-send loaders. Verify zero outbound provider requests, zero intents queued for sending, no live booking writes and unchanged canonical ingestion.
5. Exercise real PostgreSQL operator/claim barrier races separately in an isolated existing test database. Loopback/in-memory tests do not prove distributed locks, real deployment routing or runtime grants.
6. Only after this passes prepare the separate owner-approved controlled-send packet. This contract review does not authorize sends, migrations, Meta writes or publication live. No new SQL migration is required by this v2 rehearsal.

## Verification before remote staging installation

- 20 NAC notification/gateway/lifecycle tests passed after integration of review fixes.
- Two new cross-application tests passed: 28 lifecycle/scenario combinations plus security, mapping, race, timeout, freshness and receipt assertions. Latest run exchanged 44 signed NAC context requests between real loopback HTTP servers; zero provider calls.
- 26 existing relevant TaxiCRM template/shared gateway/dispatcher tests passed.
- TypeScript passed in both repositories; targeted NAC ESLint passed; both Next application builds passed with synthetic unavailable database URLs. Local Prisma generation is not a database migration.
- Shared protocol byte-parity check passed. Existing v1 validation/callbacks, live dispatcher, operator barrier and canonical ingest are unchanged.
- The original regression SQL tests use isolated PGlite only. The new v2 integration harness uses no database and applies no migration. At that earlier verification step, no production/staging configuration had been changed and remote staging had not yet been exercised. No real SMS/WhatsApp or Meta template mutation occurred.

Local evidence: `/workspace/artifacts/notifications-v2/cross-application-report.json`. The report contains synthetic scenario reasons and counts, not service credentials, raw webhooks or real customer details.

## Remote isolated staging execution — 2026-11-04

Owner-authorized execution is complete in a separate Coolify `notifications-v2-staging` environment. Two small, separate role services mount the NAC and pinned CRM v2 handler code. They do not run the full Next applications, booking ingestion, scheduled workers or provider adapters. Production apps and Meta webhook are unchanged.

- Tested deployment commit: `50a73e508a4556554df93b2aa0850925ca49bfd4`.
- 44 event/scenario combinations passed over verified HTTPS between the role services.
- Both services rejected replay after full Coolify restart while the signatures were still valid; fresh requests succeeded with their persistent storage identities preserved.
- Per-role named volumes persist SQLite WAL nonce/fixture/counter state. This proves durable staging anti-replay, **not** production PostgreSQL distributed handoff/dispatch locking.
- Runtime audit: staging-only identities; no production DB/provider credentials; no-send flag set; provider endpoints absent; egress restricted to the NAC context-preview peer route.
- No WhatsApp/SMS messages, actual booking changes, production migrations or live application publication. Production application read-only health checks remained healthy.

Evidence is versioned in `evidence/remote-staging-20261104.json`. Runtime setup, commands and isolation limits are documented in `staging/notifications/README.md`. Full Next route/middleware integration, real canonical account/grant resolution, secure live link issuance, Meta sender adapters and isolated PostgreSQL race tests remain pending. No controlled real send is authorized by these staging results.
