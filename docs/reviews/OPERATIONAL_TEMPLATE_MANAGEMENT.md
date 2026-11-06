# Booking template management in NeedACab Plus

NeedACab Plus owns the booking-template UI at `/admin/notifications?tab=Templates`. TaxiCRM keeps the Meta credentials, catalog, validation, media upload and creation transport. Marketing stays in TaxiCRM. No Meta templates, phone registrations, webhooks, notification rules or mappings were changed by this development work.

## Behaviour

- NAC defaults to booking/driver/journey templates; it also includes templates referenced by locally loaded notification rules. Other/shared templates can be revealed for inspection.
- The ownership convention is the reserved names `nac_booking_*`, `nac_driver_*`, `nac_journey_*`. It is separate from Meta category: not every Utility template is a booking template. Legacy custom names are not silently reclassified. New operational submissions require one of those prefixes and Utility.
- Existing Meta templates are inspect-only in NAC. Create a new version to change content, images, video/PDF samples, variables or buttons. This does not switch rule IDs/fingerprints automatically. In-place edits stay unavailable because shared campaign/rule dependency checks are not complete.
- The shared editor supports preview and explicit confirmation before submission. Uploading a sample during preview is a Meta media upload, separate from template submission. Existing Meta sample handles are reused; no media bytes or credentials go through browser-configurable remote URLs.
- CRM defaults to marketing/other shared templates, offers an opt-in read-only view of booking templates and a link to NAC. The CRM dashboard mutation API rejects operational name prefixes, so revealing a template does not enable edits there. Templates are not deleted or recreated as part of this move.

## Security and transport

NAC endpoints require existing admin authentication and same-origin checks for writes. JSON requests retain the 32 KiB limit. Media has a dedicated 16 MiB bounded binary path; image/video/PDF magic-byte and type-specific limits remain in the existing central validator. Bytes are HMAC-bound directly (no base64 expansion); normal service JSON limits are unchanged. Fixed HTTPS gateway paths, timestamps, durable nonces and no redirect following are retained. No Meta access token is sent to the browser or added to NAC.

Gateway creation is separately gated by `WHATSAPP_OPERATIONAL_TEMPLATE_MANAGEMENT_ENABLED=true`, in addition to existing shared/template-workspace and Meta template-submission readiness. Every create still requires explicit confirmation and central validation. There is no in-place edit or send action on the new facade. Ambiguous create responses propagate `TEMPLATE_SUBMISSION_UNCONFIRMED` so the existing editor locks retries. Uploads never create a WhatsApp message. Rate limits apply to catalog/create and media.

## Validation

- 24 CRM tests passed across the operational facade, template components, edit/upload regressions, binary HMAC/replay/tamper/size checks and capability gates.
- 3 NAC proxy tests passed: fixed signed JSON/binary routes, no retries on transport uncertainty, disabled feature rejection and uncertain submission classification.
- 5 browser scenarios passed using the actual NAC/CRM components with synthetic API interception: catalog/deep link separation, existing-template read-only inspection, sample-image/button round-trip, explicit review/confirmation for a new version, CRM read-only reveal/link.
- TypeScript and targeted lint passed in both repositories. Both full production builds passed with synthetic unreachable DB configuration (NAC webpack because its isolated worktree uses external node_modules; CRM Next default build).

These tests do not establish live service credentials/nonces/permissions, live Meta access or authenticated user-session integration. No provider API was called. No schema migration or production configuration/deployment was performed.

Reproduction:

```
npx tsx --test tests/operational-template-proxy.test.ts
TAXICRM_REVIEW_ROOT=/path/to/matching/taxicrm node tests/operational-template-ui.mjs
```

The shared-source manifest records hashes from the matching CRM editor, types, parameter helper, errors and ownership helper. The media-body reader is copied byte-for-byte into both repos. This change does not create a second Meta implementation.

## Reviewed release plan — not executed

1. Before enabling, verify the existing gateway nonce table `public."WhatsAppServiceNonce"` and its SELECT/INSERT grants for `taxicrm_shared_app` in the shared primary, and confirm matching server-only service identity/workspace settings. Do not create a duplicate nonce table or repoint databases to work around a failed check. The existing HMAC facade depends on this table; code-only tests do not prove its live availability.
2. Deploy CRM gateway and catalog split first. Enable production `WHATSAPP_TEMPLATE_WORKSPACE_ENABLED=true` for read/preview/capabilities. Keep the new operational mutation flag false until the facade authenticates successfully.
3. Deploy NAC UI/proxy and enable `NOTIFICATIONS_TEMPLATE_WORKSPACE_ENABLED=true`. Verify catalog and capabilities through an authorized admin session. No template submission is needed to verify read access.
4. After owner approval, enable CRM `WHATSAPP_OPERATIONAL_TEMPLATE_MANAGEMENT_ENABLED=true` only if existing Meta template submission is authorized/configured. This enables future operator-confirmed template/media changes; it does not perform one. Keep Meta/test/journey send flags false and controlled mode disabled throughout.
5. Check default catalog separation in both apps, inspect an existing booking template read-only, and preview a text-only synthetic new version without submitting. Test real sample upload or template creation only with a separately reviewed concrete sample/name, since previewing uploaded media calls Meta.

No database migration is proposed. Catalog remains bounded to the existing first 25 templates; UI discloses when more exist. There is no new pagination, automatic dependency rewiring or dispatcher capability expansion: editor support for media/Flow/buttons does not imply the operational dispatcher can send those components. Roll back feature flags/images if necessary; do not delete templates or modify rules to undo this UI change.
