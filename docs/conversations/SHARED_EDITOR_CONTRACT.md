# Shared conversation editor integration — proposal 0.1

Status: REVIEW ONLY, 5 November 2026. No endpoint, sender, schema migration, workflow executor or production configuration is added by this package. Examples are synthetic and are not dispatch packets. Existing Notifications 1.0/2.0 parsers must reject these envelopes rather than silently accepting them.

## Inspected baseline and deployment evidence

NeedACab Plus: `546077451ed74dce209ac350bb08021f3be33c70` (current PR31 head).
TaxiCRM: `d6b6f700e03493001904a1b9bcba6e1ee165f720` (current PR8 head).
Read-only Coolify deployment metadata reports both exact commits finished on 2026-11-05, respectively 11:52:13Z and 11:47:21Z. This proves the deployed revision, not database grants, enabled capabilities or successful runtime end-to-end behavior. PRs are no longer draft in GitHub at inspection time; no PR status was changed. No credentials or runtime flags were changed or printed. Meta approvals, private database ACLs and actual production worker readiness were not queried in this review.

## Boundaries

- NeedACab owns canonical booking ingestion, operational policy and booking actions. Existing shared PostgreSQL Booking tables may physically reside in the shared TaxiCRM database; that does not make TaxiCRM another ingestion owner. No new Autocab receiver/consumer and no duplicated booking store.
- TaxiCRM owns the ONE visual editor, conversation orchestration, Inbox, marketing rules, common message history and sole WhatsApp transport to Meta. Current webhook stays `/api/webhooks/whatsapp/meta` on TaxiCRM.
- Editor publishes immutable validated flow versions; runtime pins a version. Saving or previewing never activates or sends. Marketing flows cannot subscribe independently to operational notification delivery. The existing NAC rule selects the operational message; a flow references that decision, never creates a competing operational send.
- Booking references and projections in flow state are correlation/minimal context, not an alternative canonical booking database. Reload authorized canonical context before any side effect.
- Existing app-notification selection remains in NAC. Do not infer mobile-app booking ownership from a telephone/email or assume a webapp account proves mobile origin. The current adapter detects webapp + verified account; a verified native-mobile-origin relation is a gap. Until resolved, fail closed for ambiguous channel routing. Preserve existing app notification behavior.

## Verified inventory (paths relative to each repository)

| Area | Existing implementation | Limit / change needed |
|---|---|---|
| NAC ingest | `lib/autocab/process-canonical-booking-event.ts`, `canonical-booking-handler.ts`: locked WebhookEvent transaction, exclusive-writer guard, persisted canonical events | New durable flow-event outbox must join the canonical commit, or use a recoverable post-commit reconciliation; no network call in that transaction |
| Lifecycle | NAC `lib/whatsapp-journey.ts`, `whatsapp-journey-producer.ts`; CRM `src/lib/integrations/whatsapp/journey.ts`: six milestones, evidence, 15-minute expiry, stale stage suppression | Existing producer polls canonical rows; do not add another Autocab consumer. Keep current notification capture distinct from new event publication |
| Notifications | NAC `lib/notifications/engine.ts`, `canonical.ts`, `v2/contract.ts`, `controlled/`; CRM `notifications-v2-contract.ts`, `controlled-booking-confirmed.ts` under WhatsApp library | v2 preview supports only confirmed/assigned synthetic intents; controlled dispatch is bounded to Booking confirmed and approved single-parameter template; not a general workflow executor |
| Authentication | `lib/whatsapp-service-auth.ts` and CRM `service-auth.ts` / `service-http.ts`: direction-specific HMAC, body hash, 300s skew, durable nonce, 32KiB body | Scope/audience/action rights must be enforced by NEW route handlers; possession of an HMAC key never proves customer booking ownership |
| Shared state | CRM `docs/integrations/WHATSAPP_SHARED_GATEWAY.md`, `/api/internal/whatsapp/v1/message-intents`, conversation messages, events and handoff | Reuse message IDs, event outbox/inbox and revision locking. Flow-run persistence, node claims and restart semantics are proposed, not implemented |
| Operator | CRM `/api/dashboard/marketing/whatsapp/conversations`: session permission, same-origin mutation, command ID + expected revision | Existing takeover cancels held intents. New flow waits/actions must honor same conversation fence; release must not flush old work |
| Templates | CRM `template-components.ts`, `template-edit.ts`, template workspace and template UI; docs `WHATSAPP_TEMPLATE_WIZARD_RELEASE.md`, `WHATSAPP_TEMPLATE_EDIT_RELEASE.md` | This is a Meta template editor, not a visual conversation canvas. NAC server facade currently allows list/preview only. `docs/WHATSAPP_BOOKING_FIELD_PREVIEW.md` was not found in this inspected tree |
| Payload adapters | CRM `operational-adapters.ts`, `meta-send.ts`: text, positional/named body parameters, URL suffix validation, static phone buttons; exact template fingerprint | Media/dynamic header, interactive questions, quick replies and Flow execution are not operational send capabilities merely because the template editor represents them |
| Existing automation | CRM `src/app/api/dashboard/ai/automation/route.ts`, `src/lib/ai-automation-simulation.ts`: permissioned persisted automation rules and simulations | Reuse appropriate audit/permission concepts after compatibility review; no evidence this implements the requested WhatsApp node graph or durable question/wait executor |

Presence in deployed source is distinct from enabled runtime capability. Never advertise unsupported nodes as usable.

## Proposed event contract `nac.conversations.events/1.0`

Proposed NEW authenticated route: `POST /api/internal/conversations/v1/booking-events` in TaxiCRM. Not currently available. Existing WhatsApp endpoints are not widened implicitly.

Envelope: `contract`, `contract_version`, `event_id` (UUID stable across retries), `event_type`, `source=needacabplus.canonical`, `workspace_id`, `booking_ref` (`provider=AUTOCAB`, external ID), `booking_revision` (positive per-booking monotonic sequence), `milestone_revision` (existing evidence identity), `source_event_ref`, `occurred_at`, `recorded_at`, `expires_at`, `correlation_id`, `causation_id`, `mode=DRY_RUN`. Times are UTC RFC3339. Operational TTL is at most 900 seconds; an old event does not become fresh on retry. Event has no arbitrary phone, message body, Meta token or copied full booking payload.

| event_type | Canonical evidence | Current milestone revision |
|---|---|---|
| booking.confirmed | Booking.bookedAtTime; successful canonical booking state | 1 |
| driver.assigned | Booking.acceptedAt AND driverId AND vehicleId | acceptedAt epoch milliseconds |
| driver.arrived | Booking.arrivedAt AND driverId | arrivedAt epoch milliseconds |
| journey.started | Booking.pickedUpAt | pickedUpAt epoch milliseconds |
| journey.completed | Booking.completedAt, not cancelled | completedAt epoch milliseconds |
| booking.cancelled | Booking.cancelledAt | cancelledAt epoch milliseconds |

Important: `bookingdispatched` webhook is NOT assumed identical to driver acceptance; current `driver.assigned` uses acceptedAt. UI “on the way” must label that mapping accurately. Rejected/no-fare/no-show suppress inappropriate stages but do not fabricate a cancellation timestamp.

`booking_revision` is a NEW ordering requirement, not an existing guaranteed field. Allocate in the same locked canonical-write transaction (or adopt a proven existing monotonic audit sequence only after inspection); do not use updatedAt, external ID, random UUID or the old milestone timestamp as a total-order guarantee. Persist mapping from canonical transition to event UUID. The integration cannot be activated until this ordering source is implemented and tested. Existing milestone_revision and Notifications idempotency keys remain unchanged for compatibility.

Logical dedup key: workspace/provider/externalId/event_type/milestone_revision. Store payload hash: exact duplicate returns original acknowledgement; same identity with different payload returns 409. Persist authenticated receipt before 202; a 202 means stored, never sent. Out-of-order arrivals are recorded; decisions reload latest canonical state and skip superseded events. A terminal cancellation invalidates pending non-cancellation operational work, but never claims it recalled a provider call already started. Do not replay six historical notifications when starting a flow.

## Proposed action contract `nac.conversations.actions/1.0`

NEW routes in NAC (not implemented): POST `/api/internal/conversations/v1/actions` and GET `/api/internal/conversations/v1/actions/{action_id}`. Input is a strict allowlist, bounded to 32KiB. Fields: contract/version, action_id UUID, operation_key, workspace_id, flow_id/version, run_id, node_id, conversation_id/revision, correlation_id, action, booking_ref (when relevant), expected_booking_revision, customer_authorization_ref (opaque server-side), confirmation_ref (write actions), requested_at, expires_at, mode DRY_RUN and typed `parameters`.

Replies: `action_id`, `operation_key`, `status` (SUCCEEDED, BLOCKED, REJECTED, PENDING, UNKNOWN), `reason`, canonical booking revision, typed `result`, checked_at, correlation_id. Network timeout is UNKNOWN, not proof of no side effect. Persist immutable request + hash before execution. Same operation key/different hash = 409. GET status is read-only and does not execute. Redact authorization/confirmation references and personal content from technical logs.

| Action | Existing source (NAC) | Proposed parameters → result | Validation / authorization / errors | Availability |
|---|---|---|---|---|
| address.search | GET `/api/address/search?q=`, `lib/autocab-api.ts` searchAddresses/resolveAddressPlaceId | query string 2–160 chars → items {address, fullAddress?, placeID?, customAddressID?}; normalized action returns bounded resolved suggestions | Service scope address.search, tenant limits, provider rate limits; no arbitrary URL or raw provider request. INVALID_INPUT, PROVIDER_UNAVAILABLE, RATE_LIMITED. Resolve complete coordinates/zone before quote | Web exists; authenticated action adapter missing |
| fare.quote | POST `/api/quotes`, `lib/quotes.ts`: quoteRequestSchema/createQuote | pickup/destination resolved address {text,coordinate{latitude,longitude},zoneId}, vias<=3, vehicle, service, paymentMethod?, scheduledAt nullable → quote{id,totalPence,currency,expiresAt,...}, opaque token | lat/lon bounds, distinct stops, current provider/service/payment/membership policy, valid schedule. Delegated account affects membership; never grant by phone. INVALID_ADDRESS, QUOTE_UNAVAILABLE, INVALID_SCHEDULE | Web exists; adapter missing. Do not promise all vehicle/payment options are enabled |
| booking.create | POST `/api/bookings`, `lib/live-cash-booking.ts`, submitLiveCashBooking | quote UUID/token, exact quote journey/vehicle, name, phone, passengers 1–6, luggage 0–20, pickupNote, acknowledged=true, supported payment proof → attempt ID, pending/rejected/externalBookingId/status | Verified delegated customer or session-bound guest capability + one-use confirmation bound to exact summary/quote/revision/expiry. Existing route is same-origin customer flow; service must not forge cookies. Quote expiry, duplicate quote, existing sending/unknown, payment/policy checks. CONFIRMATION_REQUIRED, QUOTE_EXPIRED, OWNERSHIP_REQUIRED, OUTCOME_UNKNOWN | Existing web cash path; safe conversation adapter missing. Card availability follows existing backend; never synthesize payment |
| booking.read | GET `/api/customer/booking-status?id=<quote UUID>`, customer/trips, ebooker [slug]/track | booking_ref + authorization_ref → minimized canonical state, addresses, schedule, permitted driver details | Resolve principal → web_booking_attempts.user_id/customer-account relation (or explicit scoped guest authorization). Do not expose dispatch-only GET /api/bookings or operator readBookingDetails to clients. NOT_FOUND_OR_FORBIDDEN unified externally, STALE_CONTEXT | Web ownership checks exist; delegated action adapter missing |
| booking.update | No verified customer booking mutation adapter found; PATCH /api/bookings is admin/local status management, not a journey amendment | proposed allowlisted patch + expected revision + confirmation → result/new revision | Ownership + allowed-state/provider capability, exact before/after confirmation, optimistic concurrency, payment/fare re-quote. ACTION_UNAVAILABLE, CONFLICT, CONFIRMATION_REQUIRED | UNAVAILABLE; do not wire to generic PATCH |
| booking.cancel | No verified canonical customer cancellation function found | booking_ref + expected revision + confirmation → terminal result | Ownership, cancellable state, disclosed fee if any from verified policy, final confirmation and last-moment check. ACTION_UNAVAILABLE, CONFLICT | UNAVAILABLE |
| booking.tracking_link | `lib/taxicrm-customer-trips.ts` taxiCrmBookingTracking and owner-checked web endpoints return tracking data | booking_ref + authorization_ref → opaque scoped expiring HTTPS link only after issuer exists | No guessed URL from booking ID. Token must grant one booking only, be revocable, limited lifetime and avoid PII/ID in public path. SECURE_LINK_UNAVAILABLE | Tracking data exists; reusable secure link issuer NOT verified, action UNAVAILABLE |

Shared action authorization errors: UNAUTHORIZED, REPLAY, WRONG_SCOPE, ACTION_FORBIDDEN, OWNERSHIP_REQUIRED, OPERATOR_TAKEOVER, EXPIRED, DUPLICATE_CONFLICT, STALE_BOOKING_REVISION, OUTCOME_UNKNOWN. Use 401/403 for machine auth, 409 conflicts, 422 validation, 503 unavailable; no internal SQL/provider secrets in error bodies. Read access must not leak booking existence to an unauthorized client.

Customer identity: verified inbound WhatsApp participant plus phone match is NOT universal authority. Link to an authenticated NAC account through a short-lived one-use server-issued authorization exchange (NEW capability, requires implementation), or a scoped booking capability proven from the original booking session. Scope to workspace/conversation/principal/action/booking/expiry, revalidate revocation and account relation on each action. Operator service credentials are not customer consent. A guest without proof is redirected to secure sign-in/support, not admitted via booking ID.

Confirmation is NEW durable server state: bind customer principal, conversation revision, action digest, booking revision or quote, summary, expiry and consumption. Display pickup, destination, time, price/payment and cancellation consequences where known. Only an explicit authenticated client response consumes it transactionally with the operation claim. Flow transitions, previous consent and marketing permission are not booking confirmation. Any change requires fresh confirmation. If a write outcome is UNKNOWN, reconcile by the original attempt/reference before any separately approved recovery; never issue a fresh booking/action ID automatically.

## Typed variable catalog

Canonical source is current read-only AUTOCAB Booking (existing shared database), not a cached editor example. `lib/notifications/canonical.ts` demonstrates field mapping; catalog below adds no new production resolver.

| Variable | Type | Canonical source | Availability / missing behavior |
|---|---|---|---|
| customer_name | nonempty string or null | Booking.customerName | May be absent; required use blocks, optional use needs explicit separate text branch |
| booking_id | nonempty string | Booking.externalId + provider scope separately | Required, missing blocks |
| pickup_address | string or null | BookingLocation.address where type=PICKUP, bookingId relation | Missing blocks required use; no geocoded guess |
| dropoff_address | string or null | BookingLocation.address where type=DESTINATION | Missing blocks required use |
| pickup_time | UTC instant or null | Booking.pickupDueTime | Render Europe/London with GMT/BST; missing/invalid blocks |
| driver_name | string or null | Booking.driverForename | Available after canonical assignment; omit through an explicit branch or block |
| vehicle_registration | string or null | Booking.vehicleRegistration | Available only when recorded; no driver/vehicle guess |
| estimated_price | {amount_minor:integer,currency:GBP,quote_id,expires_at} or null | Fresh createQuote result: quote.totalPence/currency/id/expiresAt | Not inferred from historical booking fare; expired quote requires a new quote and confirmation |
| manage_booking_url | scoped HTTPS capability or null | No verified reusable issuer in canonical adapter | Unavailable; action/button blocks |
| track_driver_url | scoped HTTPS capability or null | Tracking data reader is NOT a link issuer | Unavailable; action/button blocks |

Scope variables by workspace/conversation/run and authorization. Catalog declares type, sensitivity, required/optional use, source, availability and retention. No implicit null→empty string substitution in a required template. Meta approval examples are never operational values. Body positional/named parameters and button slot mappings are separate. Template fingerprint/category/language/status must still match; unsupported components fail closed. New source fields are not silently added to the existing Notifications v2 allowlist.

## Nodes, policy and persistence

Trigger = authenticated event or authorized inbound message. Condition = typed side-effect-free expression with bounded operators, no eval/SQL/HTTP. Message = existing notification intent, never direct Meta HTTP. Question = typed answer + timeout + correlation to a particular prompt/run; inbound event must match identity and conversation revision; no arbitrary text authorizes a write. Action = the above NAC registry. Wait = persisted wake_at/deadline, not an in-memory sleep. Handoff = existing revision-checked audited OPERATOR command.

Persist flow/version, run_id, trigger ID, current node, node operation key, expected revisions, wake_at, deadline, claim/lease/fence, minimal validated answers and result references. Workers claim using PostgreSQL locks/unique constraints; crash recovery reclaims reads/waits safely, but marks already-started external writes UNKNOWN pending reconciliation. Flow graph validation bounds cycles, total actions, timers and payload sizes. Resume rechecks expiry, latest booking, suppression and takeover. Stop all automatic nodes on takeover; release is explicit and starts a fresh reviewed continuation, never queue flush.

HMAC: reuse x-wa-key/timestamp/nonce/signature over METHOD, exact path+query, timestamp, nonce, SHA256(body), LF-separated. Different keys per direction, <=300s skew, durable unique nonce, fixed HTTPS origins/no redirects, rotation by key ID. Re-sign callback retry with fresh nonce and same immutable event/action identity. For side-effecting actions do not retry after uncertain execution; query status. Route/action/tenant rights and customer capability are separate checks. No Meta credential in NAC or browser.

TaxiCRM is the final channel gate under its existing conversation lock: current permissions, STOP/suppression, operator state, canonical eligibility, deadline, provider outcome, template approval/fingerprint and 24h window from the last eligible customer inbound message. Check after queue wait and immediately before provider call. At 24h expiry recompute approved template choice from the saved rule or block; do not send stale free text. UNKNOWN never triggers resend or SMS. `131026` is a delivery failure, not proof of absent WhatsApp; any proposed recipient-wide no-WhatsApp policy needs separately scoped reviewed evidence/expiry. SMS/STOP/reconsent fallback is a separate stage with no SMS transport here. ACCEPTED != DELIVERED != READ; preserve REJECTED/FAILED/UNKNOWN distinctions and existing monotonic receipt handling.

Common audit linkage: event_id, correlation_id, causation_id, flow/version/run/node, action_id, operation_key, rule/version, conversation/revision, common intent/message IDs, provider message ID if known and delivery receipt ID. Origins remain operational_notification / crm_campaign / operator_reply. Content/PII only in access-controlled history with existing retention; technical logs use IDs and reason codes only.

## Accessing the ONE editor from NeedACab Plus

Phase A (reuses existing auth): NAC Admin/Dispatch navigation opens the single TaxiCRM editor in a new top-level tab; TaxiCRM requires its existing NextAuth session and AUTOMATION_VIEW/appropriate edit permission. Do not assume NAC cookie/session is shared. Deep-link only an opaque workspace/resource reference validated by TaxiCRM; no token or PII in URL. Current AI automation permissions and WhatsApp permission checks must be reconciled before publishing new editor routes. There is no verified cross-app SSO today.

Phase B (optional NEW integration): NAC same-origin permissioned backend acts as BFF, signs narrowly scoped editor context with the existing server-to-server HMAC; TaxiCRM issues a single-use short-lived auth handoff only after a verified operator identity/role mapping and audience binding. Requires a reviewed exchange and CSRF/replay tests; do not pass a browser-provided role as authority. Until built, use Phase A. No iframe is promised; CSP/cookies must be validated before embedding. Never expose Meta tokens or HMAC secrets to browser. Existing template list/preview BFF is an architectural example, not the conversation editor itself.

## Integration gaps and delivery sequence

NAC: durable canonical event/revision/outbox; strict inbound action schemas and permission registry; delegated ownership/confirmation capability; action ledger/reconciliation; quote/create/read adapters; mobile-origin evidence; secure link issuer only if designed; no update/cancel until verified backend exists.
TaxiCRM: single visual graph editor; durable versioned run/node/wait/question engine; scoped event/action client; capability discovery (unsupported nodes disabled), inbound-answer router; reuse shared handoff/intent/receipt/history; template capabilities separated from runtime adapters; operator entry point and optionally identity exchange.
Shared: versioned schemas, immutable IDs/hashes, backwards compatibility fixtures, least-privilege grants and migrations reviewed later. No schema change is part of this proposal. Separate deployment/runtime enablement approval is required. Existing control and sending flags are left untouched; this package cannot enable execution.

## Review and staging test plan

1. Validate synthetic envelopes and all six evidence mappings; assert distinct booking and milestone revisions; unknown versions/fields rejected; source event replays produce no new ID. Property tests for ordering, reassignments, modified/cancelled bookings and terminal stage precedence.
2. Signed requests: invalid key/signature/path/query/body, stale timestamp, nonce replay/rotation, cross-tenant, body-size and redirect rejection. Authorization: phone-only and ID-only access denied, wrong account/guest/conversation, expired/revoked capability, insufficient action scope.
3. Real application routes with isolated PostgreSQL and synthetic canonical bookings/accounts/permissions. Outbox commit/crash, two workers claiming same event/action, operator takeover racing final claim/provider call, revision conflicts, restart of waits/questions, duplicate inbound answers and delayed callbacks. No production DB.
4. Rule → field mapping → app/text/approved template selection. Boundary at 24h while queued/processing, named/positional and URL suffix payloads, unavailable media/Flow/quick-reply behavior. GMT/BST gaps/overlaps (29 Mar and 25 Oct 2026), missing required data, no fake price/link.
5. Booking writes: missing/stale/reused confirmation, changed quote/revision, simultaneous cancel/update, expired quote, provider accepted but response lost. UNKNOWN reconciles using original attempt and never resubmits. Unsupported actions fail closed.
6. Simulated provider only: ACCEPTED, later DELIVERED/READ, terminal failure 131026, timeout/5xx/malformed response, DB failure after provider acceptance; common history contains one message/operation. No SMS or automatic retry. Separate service and marketing permissions.
7. Before any future activation present exact preview, permissions, TTLs, migration/grant SQL, kill switches and one-shot approval packet. This proposal grants no authority to send, change Meta templates, mutate real bookings or enable general notifications.

Validation included here checks document/source references and synthetic contract examples only. It is not evidence that the proposed endpoints or end-to-end orchestration exist. Runtime integration and concurrent PostgreSQL tests above remain to implement after contract review.

## Machine-readable review fixtures

`event.schema.json` and `action.schema.json` are strict proposal schemas, not imported by either application. `examples/*.json` are intentionally historical, synthetic DRY_RUN fixtures; no identifier or capability is usable in production. For booking.create the wire action carries `quote_ref` and a journey digest referencing a protected server-side quote/summary (NEW adapter), not arbitrary client-supplied payment/customer data. The adapter must resolve all fields required by the existing booking route and validate the confirmation against that digest. Until that secure server-side quote/authorization store is implemented this action remains blocked. Update uses a protected `proposal_ref` with the same requirement; no unsupported arbitrary patch is accepted.

Run offline review checks (Python 3 + jsonschema; no application server needed):
`PYTHONDONTWRITEBYTECODE=1 python docs/conversations/tests/validate_proposal.py`
The equivalent TaxiCRM directory is `docs/integrations/conversation-editor`; mirror comparison uses `CONVERSATION_CONTRACT_MIRROR` with an explicit local checkout path. These checks validate examples/negative schema cases only, not action ownership, HMAC or runtime behavior. The staging plan is the required evidence for those guarantees.

## Corrected configuration observation — resource and time

The earlier observation incorrectly collapsed production and preview entries with the same key. It must not be used to claim production sending was enabled.

Read-only GET responses from `https://admin.plymhub.ai`:
- NeedACab Plus resource `/api/v1/applications/crqpd2l9iolo0aqxubv5xztd/envs`: request 2026-11-05 14:29:52.549909Z, response 14:29:53.764836Z.
- TaxiCRM resource `/api/v1/applications/gbwo4xfa46m5n1klnqxr8afl/envs`: request 2026-11-05 14:29:53.764937Z, response 14:29:54.632105Z.

London was GMT at these instants. The sanitized exact observation is `flag-observation-20261105.json`; entries preserve `is_preview`, `is_runtime` and `is_buildtime` rather than overwriting by key.

| Resource configuration | META_WHATSAPP_SENDING_ENABLED | META_WHATSAPP_TEST_SEND_ENABLED | WHATSAPP_JOURNEY_SENDING_ENABLED |
|---|---|---|---|
| NAC production (is_preview=false) | false | false | false |
| NAC preview (is_preview=true) | false | false | false |
| TaxiCRM production (is_preview=false) | false | false | false |
| TaxiCRM preview (is_preview=true) | true | true | false |

All selected entries have is_runtime=true and is_buildtime=false. These are stored configuration values returned by Coolify at the recorded time, not proof of the effective environment inside an already-running process or of worker execution. No settings were modified. Do not infer approval or activation from preview flags. New staging integration must use isolated configuration with all send/test-send flags off and simulated transport.
