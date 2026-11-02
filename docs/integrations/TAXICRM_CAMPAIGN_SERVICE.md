# TaxiCRM campaign service first stage

Development branch based on local reference 03ac368, not verified against current
production. Reuses marketing_campaigns; no migration and no booking writer changes.
The store requires a caller-managed authenticated transaction. It is not exposed
through an HTTP route. No credentials or external calls are involved.

Implemented: draft insertion with integer GBP budget; approval under row lock,
with optimistic snapshot comparison. Tests use synthetic query stubs and establish
SQL intent and stale approval rejection, not real database concurrency guarantees.
A repeated approval currently returns CAMPAIGN_NOT_DRAFT rather than an idempotent
success; durable API operation idempotency must precede exposure.

Blocking schema gaps: existing table lacks explicit tenant ownership and approver
identity/version audit. Do not expose as a commercial multi-tenant API before those
are implemented and reviewed. Need A Cab Plus-owned grant/reservation ledger,
transactional cross-channel limits/budget, authenticated API and signed events are
still pending. Existing schema must be extended only after approved proposal.
No public-code entry is required by customers; provider codes remain internal.
No assumed Autocab discount mutation is implemented. No real discount or message
was issued. No production deployment or migration is authorized by this stage.
