# NeedACab Plus WhatsApp inbox — read-only phase

An admin-only page at `/admin/notifications/inbox` lets operators search the shared conversation list by phone number, load additional conversations, read messages in chronological order and load older messages. It clearly states that replies and operator controls are not available. It does not create messages or bookings and it leaves the TaxiCRM inbox intact.

The browser calls only the same-origin NeedACab Plus read API. Its server uses the existing HMAC service identity and a fixed HTTPS TaxiCRM gateway origin. A new authenticated TaxiCRM list endpoint reuses the existing scope-bound conversation query and pagination; message details use the existing signed internal endpoint. Neither endpoint reveals credentials. The existing service authentication reserves nonces in the shared database; this is not a new history store, webhook or sender.

Both the page and NeedACab Plus proxy use the existing `isAdmin()` authorization. This intentionally limits the first version to existing administrators; no role or permission changes were made. Non-admin staff access requires a separately reviewed authorization design. Names are not guessed from phone numbers. The CRM inbox continues to own conversation controls and history.

Validation: existing scope/pagination tests and operational template regressions; signed proxy tests; browser test using the real component with intercepted synthetic GET responses, including list, selection, chronological message display, search, empty and error states. Zero provider calls and no real messages. TypeScript and targeted lint checked. Browser tests do not establish live credentials, actual admin-session authorization or end-to-end webhook delivery. Exact deployment requires a separate release review in both applications, plus an authorized admin check against a test conversation; do not activate sending or remove the existing inbox.

Reproduce: `npx tsx --test tests/whatsapp-inbox-read.test.ts` and `node tests/whatsapp-inbox-browser.mjs` (Playwright and Chromium required). Matching TaxiCRM branch: `codex/nac-inbox-list-gateway`.
