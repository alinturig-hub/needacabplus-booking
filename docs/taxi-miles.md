# Taxi Miles: configuration and simulation release

This release implements the agreed **configure first, apply later** stage. `/admin/configuration/taxi-miles` contains campaign tiers, membership benefits, quiet-time limits, guest invitations and marketing limits. `/admin/configuration/discount-vouchers` manages voucher drafts; `/admin/configuration/rewards-marketing` opens automation configuration. Previous Promotions & loyalty navigation redirects here; legacy saved pricing policies are retained.

## Explicit activation boundary

The new policy accepts `mode: "draft"` only. Neither creating a voucher nor enabling a campaign in simulation activates customer discounts. No new miles are credited, rewards assigned, redemptions consumed, booking amounts changed or promotional messages sent by this workspace. No AI service is called. WhatsApp remains pending its connector. Existing live pricing and membership/subscription flows keep using their existing policies.

The passenger fare selector now displays a confirmed discounted price above its crossed-out comparison price, and a selected-offer saving banner. These values come from the signed quote calculation's existing confirmed membership/quiet-time discount, not from Taxi Miles draft settings. No price is invented when no discount exists.

## Agreed rules represented in drafts

- Guests: ASAP and Pre-Book; no discount or miles. Post-completion registration invitation only with consent and a configurable cooldown.
- Registered accounts: ASAP, Pre-Book and Guarantee; vouchers and reward campaigns.
- Active members: all four services. Ordinary voucher codes default to ASAP/Pre-Book; reward campaigns have independent service eligibility. N+ membership plan benefits are independently configured per service.
- Percent of base, percent of total or fixed £ reduction. A percentage may have a monetary cap: 10% capped at £5 yields £95 from £100 and £27 from £30.
- Best eligible discount wins by default; explicit stacking is modelled only for N+. Autocab previews use a single eligible discount code and do not assume native membership/quiet benefits or multiple-code support.
- Campaigns have dated validity, stable IDs and flexible named mile thresholds. Repeated milestone rewards can be suppressed using their campaign/tier key. A journey crossing several thresholds can earn each milestone once.
- Vouchers have validity, model and service restrictions, member restrictions, pickup/dropoff zones, total/per-customer limits, optional total budget, funding metadata and optional automatic verified-account assignment metadata. Drafts can be edited/paused with version conflict protection.
- Quiet-time simulation checks UK hours, fresh supply/demand, minimum clear cars, ratio, membership, cap and available daily budget. Marketing simulations require a registered customer, consent, inactivity, frequency limits and available budget. These are deterministic bounded recommendations, not live AI decisions.

## Persistence and controls

Apply `scripts/migrations/20261026_taxi_miles.sql` (also in `db/init.sql`). It installs configuration, draft vouchers and an audit log, plus ledger/redemption tables reserved for activation. Seed data does not enable live rewards or overwrite settings. Configuration and voucher edits use optimistic versions, transactions and audit records. Generated codes use cryptographic randomness; code collisions cannot overwrite existing vouchers.

The administration APIs require administrator access and same-origin mutations. The preview endpoint has no customer-side effects. It can use unsaved settings to demonstrate rules before saving. Empty zone selections mean any zone; selected values are published N+ map zone IDs.

## Work required at the later activation stage

Connect and verify completed native/canonical journeys, canonical customer identity and verified phone/account attribution; use actual travelled miles with explicit units, an activation start boundary and cancellation/reversal handling. The ledger key must prevent duplicate credit for the same physical journey across sources. Connect reward creation with per-customer/per-campaign/tier uniqueness, welcome account verification and consistent expiration. Introduce transactional quote-time budget/use reservations, expiry/release and booking/payment settlement; all existing holds must be honoured when selecting a new offer. Lock the chosen quiet-time decision into the issued quote. Validate operator/driver funding settlement.

Verify Autocab's actual discount code API contract, booking confirmation and fare/payment reconciliation before enabling its adapter. Do not mutate Autocab prices locally and assume a code was accepted. Connect approved AI tooling only within these guardrails; promotional delivery remains a separate switch and consent check, using the current SMS infrastructure or future WhatsApp connector.

Finally connect the customer Taxi Miles wallet/history and automatic offer selection to the booking UI. Activation requires an explicit subsequent implementation/release; draft controls cannot accidentally turn it on.

## Verification

Domain and PostgreSQL-compatible PGlite tests cover caps, integer pence, guest/member eligibility, best-discount selection, explicit native stacking, Autocab code-only behaviour, dates/zones/limits/budgets, fresh quiet signals, flexible thresholds, cooldown/consent, marketing caps, idempotent migrations, version conflicts, audited storage and unauthorized API rejection. Real component browser checks cover add/save tiers, membership benefits, voucher generation/edit/pause, five-use limits, £100→£95 and guest £100 previews, light/dark and a 390px viewport.
