# NOW, Priority and Guarantee

Configure in Admin → Configuration → Fares & demand → Live webapp fares.

- NOW (`asap`): normal Autocab fare, no local uplift; eligible for a lower capability quote when quiet.
- Priority: Autocab fare with its service capabilities, then the existing configured Priority uplift.
- Guarantee: scheduled Autocab fare with its service capabilities, then the configured Guarantee uplift.

The capability catalog supports multiple selections. Shared booking capabilities still apply, except ID 42 and IDs selected for quiet-time discounts. Priority and Guarantee can explicitly opt into those IDs in their own selection. NOW discount IDs must be placed in the quiet-time selection. No database migration is required; settings are stored under `operations_settings.settings.liveQuotes`.

## Trial defaults

Smart Fare starts in **Shadow**: compare the normal and discounted quote when eligible but keep the customer's normal fare. Select **Live** and save to apply reductions, or **Off** to skip discount evaluation. The initial quiet-time selection is capability 42.

A quiet signal requires at least 5 CLEAR vehicles, at most 0.25 waiting jobs per CLEAR vehicle, and data no older than 120 seconds. These thresholds are editable. Vehicle freshness is checked individually. Booking freshness uses the latest operator booking update. The waiting count includes unassigned Booked/Created/Modified/Running Late jobs due within the configured forward booking window (15 minutes by default), all overdue jobs, and unknown due times conservatively. An inactive booking feed therefore falls back to normal, even if that inactivity represents a genuinely quiet period.

The signal is fleet-wide, evaluated for each NOW quote. It does not yet use pickup zones, historical trends, ETA, a rolling 15-minute booking-arrival count or sustained-quiet hysteresis. The admin signal refreshes every 30 seconds and reflects saved settings.

Eligible normal/discount quotes run concurrently for identical coordinates, payment profile and pickup time. A failed, invalid, equal or higher capability fare retains the normal request and price. Only a strictly lower fare in Live mode replaces it. The selected request, capabilities, costs, price and decision are bound into the authenticated quote token; confirmation uses that quote until expiry. Saved bookings include the Smart Fare decision in their pricing data. Customer responses expose only the final price and whether Smart Fare applied.

Prebooking loyalty credits, return-trip rewards and membership discounts are not introduced by this change. Existing Priority demand additions remain independent of NOW Smart Fare.

## Verification

`node --test tests/smart-fare.test.cjs tests/capability-quote-test.test.cjs tests/quote-policy.test.mjs tests/quote-presentation.test.mjs tests/quote-token.test.mjs tests/autocab-booking-request.test.mjs tests/live-cash-booking.test.cjs tests/booking-capabilities.test.cjs`

Then `npm run lint` and `npm run build`. The Smart Fare suite includes an application-schema PostgreSQL test through PGlite and verifies matching booking costs/capabilities. Quote tests use mocked Autocab responses and never create a real booking.
