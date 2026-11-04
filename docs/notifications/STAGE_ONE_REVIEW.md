# Notifications — stage-one development review

Date: 2026-11-04. Mode: **synthetic / no-send**. Neither branch is deployed.

## Existing implementation inspected

NeedACab Plus base: `7ee61b4aeb30a212859026017c9ccfe7102e92f8`.
TaxiCRM base: `e3883da` on `origin/codex/taxicrm`.

| Capability | Existing evidence | Stage-one change / remaining gap |
|---|---|---|
| Canonical booking owner | NAC `app/api/internal/canonical-booking-worker/route.ts`, `lib/autocab/process-canonical-booking-event` | Preserved. No second Autocab consumer or booking table. |
| Single sender and durable history | CRM `shared.ts`, `dispatch.ts`, `outbox.ts`, `shared-worker.ts` | Preserved. New module has **no send transport** and creates no gateway intents. |
| Signed service API | Both `whatsapp-service-auth.ts` / CRM `service-auth.ts`; CRM `service-http.ts` | Reused for a narrow preview/catalog facade. Nonce reservation and scope remain centralized. |
| Operator pause / duplicate claims | CRM conversation advisory barrier, durable intents/outbound claims, command revisions | Preserved. Synthetic decision engine exercises these outcomes; it does not replace the existing barrier. |
| Canonical journey producer | NAC `whatsapp-journey-producer.ts`, `whatsapp-journey.ts` | Existing producer untouched. Its legacy policy does not yet implement all new account/channel/rule requirements. |
| Rich Meta editor | CRM `WhatsAppTemplateEditor.tsx`, `templates.ts`, `template-components.ts`, `template-edit.ts`, `template-parameters.ts` | Same browser component generated into NAC; same CRM validation backend. No second independent Meta validator. |
| Sending rich templates | CRM `approved-template.ts`, `dispatch.ts`, `journey.ts`, `meta-send.ts` | Existing sender supports approved Utility numeric BODY parameters and four source keys. Named parameters, headers/media, dynamic buttons, free text and operational SMS still need send adapters. |
| Rules / UI / decisions | No equivalent complete module found | Added five sections, two editable rules, separate explicit dry-run activation, versioned storage/audit, synthetic history/filter API and deterministic policy previews. |
| Shared catalog | Existing CRM catalog projects first 25 templates with `hasMore` | Signed read-only facade reuses it. Full pagination remains pending and UI discloses this. |
| Template submission from NAC | Not present | **Unavailable** in stage one, including uploads. UI permits drafting and shared validation; create/edit submissions are disabled server-side as well as in UI. |
| Delivery reporting | Existing shared message status events | New history records **synthetic decisions**, not live provider delivery. Runtime projection/reconciliation remains pending. |

Read CRM documents: `docs/integrations/WHATSAPP_SHARED_GATEWAY.md`, `docs/integrations/whatsapp-service-template-drafts.json`, `docs/WHATSAPP_TEMPLATE_WIZARD_RELEASE.md`, `docs/WHATSAPP_TEMPLATE_EDIT_RELEASE.md`, `docs/WHATSAPP_TEMPLATE_EDITOR_META_REVIEW_2026-11-04.md`. The requested `WHATSAPP_BOOKING_FIELD_PREVIEW.md` was not found in available workspace checkouts (including the fetched TaxiCRM branch); no functionality is inferred from that missing file.

## What was built

- `/admin/notifications`: Overview, Rules & triggers, Templates, Delivery history, Settings, matching existing admin navigation and mobile layout.
- `lib/notifications/engine.ts`: pure decision function with no network/database/sending dependency; immutable event/booking matching, active-rule check, duplicate/stale/TTL/cancellation checks, source conditions, verified account relationship, recipient/service permission/suppression/takeover, unknown/accepted status guards, inbound-only 24-hour window, approved Utility template/schema check, independent body/button mapping, explicit capability gates and SMS fallback only on confirmed unavailability.
- Stored rules are always saved as **draft**. Activating uses the persisted revision, never unsaved browser changes. Every change increments a revision; stale saves return conflict. “Active” only means active for development dry runs.
- `notification_decisions` accepts synthetic booking identifiers only. Request UUID retries are idempotent; conflicting reuse is rejected. Cursor/filter API supports booking, event, channel, rule and result. UI displays the last 50 loaded previews (not global production metrics).
- Text placeholders referenced in a message are required. Unreferenced booking fields are optional and omitted from the message; missing required values block, never substitute invented values. Approval examples never become operational customer values.
- Button mappings are distinct from body mappings; missing secure URLs block. Quick reply and Flow behaviour remain blocked rather than inventing handlers. Header/named/button/field adapters are gated independently of editor support.
- Shared editor extraction removes credential settings imports from browser parameter validation, accepts endpoint props and remains backward compatible in TaxiCRM. `scripts/sync-whatsapp-editor.py` generates NAC files and verifies byte parity; source hashes are recorded. Do not edit generated NAC files.
- CRM internal facade only exposes `preview` and `list`; it has no Meta mutation implementation. NAC also rejects submit/edit/upload/send actions. Existing CRM operator template workflows retain their original explicit confirmation gates.

## Exact dynamic field sources

| Operational field | Canonical source | Behaviour |
|---|---|---|
| booking_id | public.`Booking.externalId` with provider AUTOCAB | Required identity; no guessed booking references. |
| customer_name | `Booking.customerName` | Required only when mapped into the chosen message. |
| pickup_address | `BookingLocation.address`, bookingId relation and type PICKUP | Adapter selects first by stable id. Multiple location ambiguity should be reviewed before live activation. |
| dropoff_address | `BookingLocation.address`, type DESTINATION | Same rule; no JSON property assumptions. |
| pickup_time | `Booking.pickupDueTime` | Preserve instant; format Europe/London including GMT/BST. Invalid date blocks. |
| driver_name | `Booking.driverForename` | Never guessed from surname/callsign. Driver rule requires it. |
| vehicle_registration | `Booking.vehicleRegistration` | Not vehicle plate licence number or callsign. |
| manage_booking_url | **No generic secure booking link issuer verified** | Adapter deliberately does not supply it; referenced field blocks. |
| track_driver_url | **No generic secure tracking link issuer verified** | Authenticated customer trips and eBooker cookie ownership are not public share links. No URL is guessed. |

Read-only adapter: `lib/notifications/canonical.ts`. Existing historical helper name `withTaxiCrmReadOnly` refers to shared canonical schema access, not ownership of ingest. It is not invoked by the synthetic UI/API. No real booking or customer row was queried for these demonstrations.

Verified webapp ownership uses `web_booking_attempts.external_booking_id → user_id → customer_accounts.id`. Explicit `guest:` identifiers remain guests. Missing/dangling/ambiguous account proof blocks instead of classifying by phone/email. `ourReference=NAC-<quote UUID>` and canonical `bookingSource` can mark an unresolved web source but cannot prove an account. This adapter must be checked against actual source conventions before production integration.

The existing verified driver event is `driver.assigned` from `Booking.acceptedAt` with driver/vehicle evidence. UI label `Driver dispatched / on the way` maps to that event. `dispatchedAt` alone is **not** assumed to prove a driver is on the way. Confirmation revision remains 1; assigned revision follows the verified canonical accepted timestamp. Before wiring, use the existing `journeyEvidence` validation to reject superseded stages; the adapter alone is not event eligibility proof.

## Development migration / configuration

`20261104_notifications_dry_run.sql` adds only three development tables: notification_rules, notification_rule_revisions, notification_decisions. No changes to canonical bookings, existing WhatsApp tables or sender flags. Applied only inside isolated PGlite tests; **not applied to production**.

Optional development API persistence needs the migration on a dedicated development database and `NOTIFICATIONS_DEVELOPMENT_ENABLED=true`. API additionally refuses production NODE_ENV. Without it, the UI offers a browser-only synthetic sandbox and clearly reports that drafts/history are not persisted.

Optional shared template validation/catalog requires `NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED=true` in NAC and `WHATSAPP_TEMPLATE_WORKSPACE_ENABLED=true` in CRM, the existing shared gateway flag, HTTPS origin and the existing HMAC service credentials in secure server configuration. No flags or credentials were changed in a deployed environment. These endpoints have not been tested across deployed applications in this stage.

## Testing / demonstration

Commands:

```
npx tsx --test tests/notifications.test.ts tests/whatsapp-gateway.test.ts tests/whatsapp-journey.test.ts
python3 scripts/sync-whatsapp-editor.py /path/to/taxicrm --check
# TaxiCRM:
npx tsx --test src/lib/integrations/whatsapp/template*.test.ts src/lib/integrations/whatsapp/shared.test.ts src/lib/integrations/whatsapp/dispatch.test.ts
```

16 NAC + 26 CRM tests passed. Notifications tests exercise 46 synthetic event/scenario combinations plus inbound-window boundaries, named mappings, unavailable adapters, provider status distinctions, schema drift, missing secure links and four DST boundary instants. Actual SQL is exercised in PGlite, including revision audit/conflict, explicit activation, request idempotency and history filtering. PGlite substitutes the advisory-lock statement: this is **not proof of PostgreSQL concurrent writer locking**. Existing shared gateway race tests remain separate from the new development store.

Demo booking confirmation:
- Event `booking.confirmed`, booking `SYNTHETIC-1001`, active dry-run rule, closed window, synthetic approved template.
- Result `PREVIEW_READY`, WhatsApp candidate, provider `NONE`.
- “Hello Demo Passenger, booking SYNTHETIC-1001 is confirmed. From Example pickup, Plymouth to Example destination, Plymouth, 04 Nov 2026, 13:00 GMT.”

Demo driver:
- `driver.dispatched`, same synthetic booking, active rule, verified synthetic driver/vehicle values.
- “Hello Demo Passenger, Demo Driver is on the way in DEMO 001. Booking SYNTHETIC-1001.”
- With an associated app account: `APP_NOTIFICATION_FLOW_SELECTED`; with takeover: `OPERATOR_TAKEOVER`; with unknown provider outcome: `SEND_OUTCOME_UNKNOWN` and **no SMS**.

The synthetic adapters can preview the intended free-text/named/button policy. They do **not** imply those send adapters exist. Selecting `gateway-current` demonstrates that extended customer/address field mappings are blocked by the current dispatcher's four-key adapter.

Both Next builds and TypeScript checks passed. Browser checks passed at 1440×1000 and 390×844 with no horizontal overflow or page errors; the shared editor mounted successfully.

Artifacts: `/workspace/artifacts/notifications-stage-one/synthetic-decisions.json`, desktop/mobile screenshots and browser report. Static harness mounts the actual client component; API responses are mocked. It is not a deployed authenticated end-to-end test.

## Remaining work before controlled sending

1. Review and approve the shared contract addition; then deploy only after explicit owner approval.
2. Complete fresh context/reconciliation, source and account verification, secure link issuer, recipient service grants and the policy recheck under the existing conversation dispatch barrier.
3. Implement free-text/interactive, named/media/button and idempotent SMS adapters in the **existing CRM sender**; verify current Meta docs and exact account capabilities. No number-existence checker has been invented.
4. Persist real event decisions and provider outcomes with data retention/access controls; stage one stores synthetic data only. Integrate event revision high-water marks and existing intent IDs instead of making a parallel event consumer.
5. Add template fingerprint normalization, full catalog pagination, local purpose classification, cross-application rule/campaign dependencies and change notifications. NAC Meta mutations must stay unavailable until dependency checks and an explicitly approved mutation contract exist.
6. Add preference/suppression/configuration callback types with versioned capabilities; current NAC callback rejects unknown types. Never silently send new types to the old receiver.
7. PostgreSQL concurrency tests for the new rule store, cross-application signed-route tests and an authenticated Next deployment rehearsal on dedicated staging.
8. Owner approves an exact phone, message, rule/template revision and test time. Then one controlled test can be prepared; no test send, template write, migration, deployment or send flag activation has been authorized by this report.

## Meta documentation verification

Attempted all five requested official URLs on 2026-11-04 through the web tool; each returned **HTTP 429**. Prior dated CRM review documents were inspected as secondary evidence, not treated as a successful current revalidation. Existing editor capabilities were reused; **no new Meta send capabilities were enabled**.

- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/components
- https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-management/
- https://developers.facebook.com/docs/graph-api/guides/upload
- https://developers.facebook.com/documentation/business-messaging/whatsapp/flows/guides/sendingaflow

## Follow-up review integration

Review fixes from `4840a9a` are integrated on PR31 (cherry-pick `beb11de`). See `REVIEW_FIXES.md` and `SHARED_GATEWAY_V2.md` for the strict no-send v2 contract and executable two-application staging rehearsal. The earlier stage-one results above describe that original baseline; the follow-up verification is recorded separately. No production activation has occurred.
