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

## Isolated ledger migration — 2026-11-02

20261102_marketing_benefit_ledger.sql adds campaign approval/control, customer
grants, reservations and audit, referencing the existing campaigns table. It is
not included in startup and grants no PUBLIC execution of its functions.
Tested on a disposable PostgreSQL 17 container with network=none, synthetic IDs,
no host ports, no production volumes. PostgreSQL row locks serialize grant usage
across AUTOCAB and NEEDACABPLUS and serialize campaign budget across grants.
Tests execute real SQL and simultaneous transactions, retries, conflicting
idempotency payload, release/commit repeat, terminal protection, expiry, identity,
tenant and budget checks. Tests do not establish upstream application success.

Limits before activation: commercial calculation and eligibility enforcement,
signed authenticated API, campaign-wide usage count cap, grant-creation audit,
durable outbox/reconciliation, cancellation/refund policy and canonical booking
mapping remain pending. No cross-channel booking identity is inferred from bare
references. Amount supplied to reservation must be derived by trusted policy code,
not accepted from client. Released reservation is terminal: a changed booking needs
an explicitly reviewed revision policy; do not reuse/reopen that operation silently.
Expiry blocks new reserves; confirmed in-flight application may still settle after
expiry. Production identity schemas and roles must be reviewed before migration.
