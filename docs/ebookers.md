# Configurable eBookers

This module adds independently configured public booking links at `/ebooker/<slug>` and an administrator workspace at `/admin/configuration/ebookers` (Operations → eBookers, also linked from Applications). There is no application-level limit on the number of configurations.

Each eBooker has its own immutable public link, display name, optional HTTPS logo, support telephone, enabled/draft state, passenger limit and pickup mode:

- Customer chooses: no preset address.
- Preset: start with the configured address and let the customer change it.
- Fixed: enforce the configured pickup on the server as well as making the input read-only.

The customer interface uses a compact navy, white and teal enterprise theme with a single-page workflow: destination entry, Now/Schedule, optional intermediate stops, passenger details, a UK-time calendar, route map, fare review, cash confirmation, booking reference lookup and status refresh. Discounts come from the existing quote engine automatically; there is no promo-code entry.

## Initial scope and existing booking rules

The existing quote engine currently accepts Saloon quoting only. eBookers therefore support 1–4 passengers, standard ASAP/prebook and cash only. This is explicit in configuration; the page does not advertise unsupported larger vehicles or card checkout. The existing payment, quote expiry, membership eligibility, live/sandbox and Autocab integration controls remain authoritative. Sandbox results are explicitly labelled as previews with no driver requested.

The header links to the existing mobile sign-in/registration flow and returns to the eBooker after phone authentication. That existing flow creates an account for a new verified number; it does not create a second eBooker account. The existing customer cookie, session and database are shared with `webapp.needacabplus.app`. Signed-in customers have their name and mobile prefilled, while guests can still enter their own details. No account or session data is stored in browser storage.

Desktop places route and passenger details side by side and keeps the standard journey within a 1280×900 viewport. Mobile uses compact stacked sections, collapsed optional instructions, a sticky continue/review action, safe-area spacing and at least 44px touch targets for primary controls. Address and phone fields retain 16px text to avoid focus zoom on iOS. Browser checks cover 320×568, 360×800, 390×844, 430×932 and 844×390 with two extra stops, calendar bounds and reachable actions. These are Chromium viewport checks, not physical iOS/Safari device certification. Additional stops, error messages, keyboard use or larger accessibility text can require vertical scrolling; content is never clipped to force a single screen.

Editable addresses support a map popup and a geolocation/nearby-place lookup with explicit confirmation. Cancel leaves the existing selection untouched. A new map point invalidates the old candidate until its full address and zone have resolved. Fixed pickup cannot open this editor. Pickup minutes are separate select options in five-minute steps.

Guest sessions use the existing signed HTTP-only guest cookie. Missing guest email is omitted from the Autocab request, rather than inventing an email address. Existing valid customer email handling is unchanged.

Quotes include encrypted, authenticated eBooker attribution, configuration revision and passenger count. A changed/disabled eBooker, changed passenger count or an invalid fixed pickup rejects confirmation. Quote creation also requires the revision shown to the client, preventing a mid-flow configuration change from silently substituting a different pickup. Changing a configuration requires its expected revision, and slugs cannot be renamed after creation.

Submission uses the existing `/api/bookings` and idempotent `web_booking_attempts` workflow. The existing `NAC-<quote UUID>` reference is preserved for canonical webhook reconciliation. The eBooker name and ID are added to the documented Autocab office note; no guessed provider source fields are introduced. `ebooker_booking_origins` stores the source and session/account owner without copying bookings or passenger PII. Its administrator counter is **booking requests**, including preview or rejected requests, not a count of confirmed journeys.

Manage booking accepts an internal UUID, its NAC-prefixed form or an external numeric reference. It requires the original guest session or the signed-in account that submitted the request, and checks both customer ownership and eBooker ownership before reading a booking. It never exposes an arbitrary reservation by booking number alone. Disabled eBookers still permit existing owners to check their bookings. Guest sessions expire after the existing 24-hour window; cross-device guest verification, self-service changes and cancellation are not implemented. Support is available through the configured telephone. Existing signed-in-account tracking works across devices.

The separate five-digit guest checkout OTP, expanded driver/trip sheet, secure share links, self-service modification/cancellation, partner payment options and CRM campaign conversion reporting remain follow-up work. The existing shared account sign-in still uses its configured four-digit OTP; this change does not silently change that contract or treat a phone found in the database as verification.

## Database and rollout

The two new Need A Cab Plus-owned tables are defined in `scripts/migrations/20261102_ebookers.sql` and included in local `db/init.sql`. Apply that additive SQL through the shared database owner's migration process before deployment. It grants SELECT/INSERT/UPDATE to `needacabplus_shared_app` when that role exists. It does not alter canonical bookings, Driver/Vehicle or TaxiCRM tables, and does not grant public access. Existing configurations and provenance cannot be deleted through this UI.

On the current shared production database, `DATABASE_SCHEMA_MANAGED_EXTERNALLY=true` means startup will not apply this migration. Do not run the full historical database bootstrap or role-provisioning migration against production to add these tables. This feature has not applied any production migration or created any real Autocab bookings.

After applying the migration and deploying:

1. Open Operations → eBookers and create a disabled draft.
2. Choose the public link name once, branding, support telephone and pickup behaviour. Select a resolved Autocab pickup when required.
3. Use Preview to review the layout. Admin preview disables booking submission and is not available to unauthenticated visitors for disabled links.
4. Enable the public link when ready. Copy the displayed webapp link and share it or encode it in a QR code.
5. Verify an approved test reservation through the real quote/booking settings. Public links start no live work on their own.

## Validation

- `npx tsx --test tests/ebooker.test.ts tests/autocab-booking-request.test.mjs tests/booking-payments.test.mjs tests/live-cash-booking.test.cjs`
- `EBOOKER_ARTIFACT_DIR=/absolute/output node tests/ebooker-browser.mjs` (Playwright available in the QA environment, Chromium at `/usr/bin/chromium` or set `CHROMIUM_PATH`). This browser harness builds the actual client components with esbuild and uses synthetic API responses; it does not replace real server integration testing. It covers mobile/desktop layout, fixed/editable pickup, calendar, passenger data, confirmation, status lookup and admin creation. All external traffic is intercepted.
- TypeScript, ESLint and the production Next build.

Database tests execute the additive SQL in isolated PGlite and test source ownership, duplicate claims and revision conflicts. No production data or external messages are used by these tests. Example screenshots are marked as synthetic design previews.
