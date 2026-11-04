# Notifications stage-one review fixes

Follow-up to PR31 at f135359; this branch does not enable a provider or extend the v1 send contract.

## Fixed

1. Rendered payload limits: validate the substituted free-text body against 4096 characters; validate each template body parameter against 1024 characters and existing control-character policy. SMS preview uses the editor's explicit 1000-character policy cap after rendering; this is not a claim that one SMS segment supports 1000 characters. An oversized message is blocked with MESSAGE_LENGTH_EXCEEDED, no prepared content and wouldSend=false.
2. Explicit open-window content mode: optional internal rule field openWindowMode=text|interactive. Existing rules default to text-only behavior. UI states that approved template buttons are not included in this plain-text mode, decisions expose contentMode and a TEXT_ONLY_MODE explanation when configured template actions are omitted. Required interactive mode blocks with INTERACTIVE_ADAPTER_UNAVAILABLE; no sender or automatic downgrade is invented.
3. Stable unique button slots: Add allocates an unused index; removing a mapping does not change remaining indices. The operator can select a free actual template slot, with one-based display and explicit zero-based index. Duplicate button indices and duplicate body variables are rejected by the rule schema before saving or activation. Closed-window template validation is unchanged otherwise.

## Compatibility

openWindowMode and contentMode are development rule/decision fields only. No fields are added to strict shared v1 intents/callbacks. Old valid rules without openWindowMode continue to parse; no schema migration. Existing invalid duplicate mappings now fail validation and must be corrected, not silently rewritten.

Both approved-template and free-text adapters still need the reviewed versioned gateway implementation before real sending. This fix does not create secure booking links, service grants, provider error allowlists or live delivery projections. No generated shared editor files were edited.

## Verification

Regression tests cover rendered free text exactly at and over 4096, template parameter boundaries, post-render SMS cap, text-mode disclosure vs blocked interactive mode, delete/readd button slots, duplicate mappings and full slot exhaustion. Existing gateway and lifecycle tests are retained. All provider HTTP uses test doubles, and SQL tests use isolated PGlite; they do not prove PostgreSQL advisory-lock races.

No production migration, deployment, runtime flag change, Meta template update or WhatsApp/SMS send is part of this branch. Next step: review and integrate these development fixes, then finalize v2 intent/context/capability contracts and staging tests before any request for live activation.

Verification completed in this follow-up: all 20 notifications/gateway/journey tests passed with the repository's installed dependency versions; targeted ESLint passed; full Next 16.3.4 production build passed with a synthetic unavailable database URL and local Prisma client generation only. A temporary local Next page mounted the actual workspace and Chromium verified remove/readd indices [1,0], explicit TEXT_ONLY_MODE disclosure, blocked interactive mode, rendered length rejection, 390px width without horizontal overflow and no page errors. Notification API reads were mocked and no mutation/provider request was made. The temporary page was removed after verification.
