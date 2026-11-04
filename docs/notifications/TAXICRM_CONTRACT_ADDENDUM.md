# Shared gateway contract addendum — development proposal

Status: implemented **preview/catalog facade only**; runtime notification extensions below are proposed, not active. Preserve the existing Meta app, WABA, phone ID and `https://taxicrm.plymhub.ai/api/webhooks/whatsapp/meta`.

## Implemented additive endpoint

`POST /api/internal/whatsapp/v1/template-workspace` on TaxiCRM.
Existing HMAC headers, canonical method/path/body hash, timestamp and durable nonce validation through `service-http.authenticate`. Requires `WHATSAPP_SHARED_ENABLED` and separate `WHATSAPP_TEMPLATE_WORKSPACE_ENABLED`. Scope derives from server settings, never client account IDs.

- `{action:"preview", draft:<existing TemplateDraft>}` delegates to existing `templatePreview`. No provider call, no rule save and no submission. Meta sample values only.
- `{action:"list"}` delegates to the existing shared `listTemplates`; same WABA catalog as CRM, first 25 with `hasMore` disclosed. Read-only external provider request, only when an administrator explicitly asks for the catalog.
- Submit/edit/upload/send are rejected. Do not add a generic Graph API proxy.
- NAC browser talks to its own admin+same-origin `/api/admin/notifications/templates`. Only the NAC server signs the service call; no secret reaches the browser. Bounds: 32 KiB request; 256 KiB response; no raw provider errors returned/logged.

The shared browser editor accepts configurable API/upload paths; its default CRM paths remain unchanged. Generated NAC source is pinned by hashes. Pure parameter parsing/error types are shared, not a credential settings module. Future shared-package distribution can replace this generated contract without changing validators.

## Runtime extension required before sending

Do not extend the current v1 intent payload in place: `validateIntent` and callback allow-lists are strict. Negotiate a capability-versioned v2 contract using the same authenticated service identity and same single sender/queue/history, after review.

Proposed intent includes immutable canonical booking/event/revision, notification rule ID+version, origin `operational_notification`, TTL, template identity+fingerprint OR free-text specification, body source mappings and separate button source mappings. No customer values or approval examples are authoritative. NAC resolves canonical data; the gateway rechecks current booking/conversation/grant/catalog state under the existing dispatch barrier immediately before dispatch. Agree on a trusted fresh NAC context contract rather than duplicating booking ingestion. Current gateway canonical read remains until the reviewed replacement is complete.

Map UI `driver.dispatched` to current canonical `driver.assigned` exactly once. Preserve existing dedup scope and operation keys on migration; do not let a renamed event or rule version generate a second message. Rule changes do not retroactively replay events. No second operational trigger in TaxiCRM.

Needed context: verified app-account relationship (not phone/email), canonical event eligibility/current revision, cancellation, normalized verified recipient+service grant, suppression, conversation mode+revision, latest eligible inbound client time, template status+schema fingerprint, secure booking-link capability and prior send result. Fail closed on missing, stale or conflicting context.

WhatsApp window = last eligible inbound client timestamp + 24h. A booking, outbound message, operator reply or receipt is not evidence of an open window. Identify eligible inbound message types using verified Meta semantics; do not treat a status or malformed/system event as client contact. The simulator accepts already verified `lastEligibleInboundAt` and does not pretend to compute it from raw payloads.

SMS may only follow explicit definitive unavailability evidence and configured eligibility. ACCEPTED ≠ DELIVERED ≠ READ. UNKNOWN/network timeout/5xx must hold for reconciliation, not immediate fallback or re-keying. Later FAILED alone is not proof that the phone has no WhatsApp. Definitive errors need a reviewed provider-code allow-list; none is invented here.

## Bidirectional events / shared history

Existing CRM→NAC receiver accepts message.received, message.status, message.accepted, conversation.mode_changed. Reuse existing delivery/replay mechanism and scope checks. Current receiver durably stores these; a new notification projection is still needed.

Proposed additional event families after version negotiation: recipient.preferences_changed, template.configuration_changed. Include event ID, scope, aggregate ID+monotonic revision, occurred_at and correlation references. Duplicate event ID+same content succeeds; conflicting content rejects. Apply aggregate revisions so delayed events cannot undo takeover/suppression/newer template state.

Every outbound shared-history entry needs origin: operational_notification, crm_campaign or operator_reply; inbound customer messages retain their inbound origin. These are provenance labels, not interchangeable consent categories. Add a service policy revision and common intent/conversation/provider IDs to notification decisions. No token or full raw payload goes to technical logs. Marketing permissions are never inferred from service permission.

Takeover acknowledgement continues to use the existing conversation barrier. Operator release is explicit. Held expired/superseded notifications are cancelled, never flushed as a backlog. In-flight accepted messages cannot be recalled; unknown results require reconciliation.

## Template edits / dependency contract still required

Before enabling NAC mutations: expose authoritative usage across NAC rules and CRM campaigns, template fingerprint/status revision and unsupported-component flags; enforce reviewed dependencies. Preserve unsupported components or block editing with WhatsApp Manager access. New `*_v2` is a separate template; never repoint rules automatically. Changes must trigger a versioned configuration event and dispatcher status/schema revalidation. A local draft or preview does not save a binding or activate a notification.

## Controlled-test approval packet (not executed)

Owner supplies/approves: exact destination, service permission, exact synthetic-safe content, approved Utility template ID/language/fingerprint, rule revision, one event, TTL, expected channel, handoff state, no-fallback-on-unknown behaviour and stop/reconciliation steps. One stable operation key, one sender and one shared-history record. No real booking mutation. No send until the owner explicitly approves this concrete packet and the missing adapters/context checks are complete.
