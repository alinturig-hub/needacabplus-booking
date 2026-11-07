# Text prepared for the TaxiCRM review chat

Please review shared conversation-editor contract proposal 0.1 before integration implementation.

Inspected NAC 546077451ed74dce209ac350bb08021f3be33c70 and TaxiCRM d6b6f700e03493001904a1b9bcba6e1ee165f720, matching the latest finished deployment metadata. The common HMAC, conversation history, intents, operator handoff and payload adapters are reusable; a template editor and AI rule simulation are not proof of a WhatsApp graph executor.

TaxiCRM owns the single editor/orchestrator/Inbox and sole WhatsApp transport. NAC owns canonical ingestion, operational decisions and authorized booking functions. Do not add an Autocab consumer or copy the booking database. Operational flows consume NAC decisions, not duplicate operational notifications.

Proposed versioned event/action envelopes, strict schemas, synthetic JSON, typed fields, gap inventory and staging test plan are in SHARED_EDITOR_CONTRACT.md alongside event.schema.json and action.schema.json. Booking event revision ordering, delegated customer authorization, write confirmation and durable action/run persistence still require implementation. Web address/quote/create/read functionality can be adapted; customer update/cancel and reusable secure tracking-link issuance are unavailable for editor use until verified implementations exist.

Review decisions needed: monotonic canonical booking revision source; account/guest authorization exchange; confirmation lifecycle and UNKNOWN reconciliation; lock/fence/expiry semantics for waits/questions/actions; operator role mapping for access to the single editor. Initial access reuses TaxiCRM login in a top-level tab, not assumed cross-app SSO. Body and button mappings remain separate; unsupported node/components must fail closed.

Nine offline proposal tests passed. They are schema/fixture checks, not proof of runtime PostgreSQL integration. Next phase is isolated app routes and PostgreSQL concurrency with a simulated provider after this contract review.

Corrected configuration observation: GET of Coolify application envs resources crqpd2l9iolo0aqxubv5xztd (NAC) and gbwo4xfa46m5n1klnqxr8afl (TaxiCRM) on 2026-11-05 14:29:52–14:29:54 GMT shows all three production entries (is_preview=false) false in BOTH applications. TaxiCRM preview entries alone have Meta-send=true/test-send=true, with journey-send=false. The earlier keyed summary incorrectly overwrote production with preview entries. These are stored configuration observations, not verified running-process values; no settings were changed. See the exact timestamped sanitized JSON in this package.

No deployment, production migration, real booking, template mutation or message was performed. These are local development-branch proposals, not an activation request.
