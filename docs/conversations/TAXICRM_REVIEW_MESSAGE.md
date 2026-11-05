# Text prepared for the TaxiCRM review chat

Please review shared conversation-editor contract proposal 0.1 before integration implementation.

Inspected NAC 546077451ed74dce209ac350bb08021f3be33c70 and TaxiCRM d6b6f700e03493001904a1b9bcba6e1ee165f720, matching the latest finished deployment metadata. The common HMAC, conversation history, intents, operator handoff and payload adapters are reusable; a template editor and AI rule simulation are not proof of a WhatsApp graph executor.

TaxiCRM owns the single editor/orchestrator/Inbox and sole WhatsApp transport. NAC owns canonical ingestion, operational decisions and authorized booking functions. Do not add an Autocab consumer or copy the booking database. Operational flows consume NAC decisions, not duplicate operational notifications.

Proposed versioned event/action envelopes, strict schemas, synthetic JSON, typed fields, gap inventory and staging test plan are in SHARED_EDITOR_CONTRACT.md alongside event.schema.json and action.schema.json. Booking event revision ordering, delegated customer authorization, write confirmation and durable action/run persistence still require implementation. Web address/quote/create/read functionality can be adapted; customer update/cancel and reusable secure tracking-link issuance are unavailable for editor use until verified implementations exist.

Review decisions needed: monotonic canonical booking revision source; account/guest authorization exchange; confirmation lifecycle and UNKNOWN reconciliation; lock/fence/expiry semantics for waits/questions/actions; operator role mapping for access to the single editor. Initial access reuses TaxiCRM login in a top-level tab, not assumed cross-app SSO. Body and button mappings remain separate; unsupported node/components must fail closed.

Nine offline proposal tests passed. They are schema/fixture checks, not proof of runtime PostgreSQL integration. Next phase is isolated app routes and PostgreSQL concurrency with a simulated provider after this contract review.

Important configuration discrepancy: live TaxiCRM currently reports Meta-send=true, test-send=true, journey-send=false. NAC reports all three false. This was read-only inspection; no flags were changed. The new contract adds no execution path and must remain DRY_RUN in an isolated environment with sending off.

No deployment, production migration, real booking, template mutation or message was performed. These are local development-branch proposals, not an activation request.
