# Autocab master control and model configuration

Configuration → Integrations contains **Enable Autocab integration** and an explicit save action. The integration remains enabled after this release; applying the migration does not turn it off. Memberships, Smart Fare, Service fares, Promotions & loyalty, Demand & timing and Fare sources have separate Configuration pages, each with independent N+ and Autocab settings. Booking rules already use independent models.

## State and scope

- `public.integration_controls` is the authoritative server-side switch. Missing state or an unavailable control database fails closed for Autocab work. Versioned saves reject stale administrator writes.
- Clients refresh status after saving, across tabs and every ten seconds. Disabling unmounts Autocab editors/live workspaces, hides its integration/dashboard cards and forces native fleet/settings views. Deep integration links are redirected to Integrations.
- Server guards cover Autocab quotes, booking creation and payment initiation, address lookup, capability comparisons, registry and generic API sync, canonical/operational webhook processing, canonical workers, post-commit effects and history/audit HTTP jobs. Live imported fleet feeds return no vehicles while disabled, including already-open public streams on their next update.
- Database triggers suspend the shared Autocab API configuration and Autocab webhook provider. Their individual enabled states are restored on re-enable; previously disabled providers stay disabled. Attempts to enable either provider while the master is off are rejected. Other webhook providers are unaffected.
- Imported booking history, customer records, saved credentials and imported zone geometry are retained. Existing memberships and payment records are not deleted or cancelled by this switch. Calls already sent before disabling can finish; this control cannot recall a request already received by an external service.
- Native driver pilot jobs, map routing, zones, local fleet, native booking/dispatch configuration, maps, identity and independent payment/SMS integrations remain available. Native live customer quote/dispatch delivery is **not activated** by disabling Autocab. The native quote policy remains non-live until that integration is implemented.

## Pricing storage

Autocab policies use `operations_settings.pricing.settings.liveQuotes`; N+ uses `nativeQuotes`. Native configuration is seeded once from the current policy with live quoting disabled. Native reads/saves strip Autocab capability IDs and cannot enable the external quote engine. Feature-level updates merge only their owned fields under a row lock, preserving edits made in other pages or models. Customer-facing policy selection uses Autocab while enabled and native configuration while disabled; disabled native live quotes remain unavailable.

## Installation and verification

Apply `scripts/migrations/20261025_integration_ecosystem.sql`, then `scripts/migrations/20261025_integration_shared_gate.sql`. Both are idempotent and included in `db/init.sql`. The second migration tolerates installations without the shared Autocab schema; rerun it after adding those shared tables to install their provider guards.

Verified with PostgreSQL-compatible PGlite tests for migration reapplication, provider suspension/restoration, stale writes, feature/model isolation and native availability. Real component browser tests cover model-specific saves, disable/hide/native preservation and re-enable/restore. Existing quote/capability, membership and native booking regressions pass. Production verification keeps the integration enabled.
