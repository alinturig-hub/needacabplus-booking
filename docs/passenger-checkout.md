# Passenger ride selection and checkout

The Home screen offers Pre-book and Guarantee. Priority is chosen alongside vehicles after addresses are selected and still requires the configured membership entitlement. The mobile ride sheet has compact, medium (default) and expanded positions. Its payment selector, confirmation button and calendar remain visible while the choices scroll. The compact position shows only the chosen ride. Confirm selection advances to passenger details and explicit pick-up confirmation; it does not dispatch a vehicle.

The calendar is a separate modal screen. It uses the operator's minimum notice, five-minute intervals, a 90-day maximum and Europe/London time independently of the device timezone. DST gaps are rejected and overlapping times resolve to the earliest eligible occurrence. Both the API and UI enforce the schedule boundaries.

## Payment selection

One payment screen replaces the Card/Cash switches. Cash is labelled Pay the driver. Authenticated customers can select an owned saved card, save a new card with Stripe SetupIntents, or choose Apple Pay / Google Pay when the browser, wallet and payment domain support them. Card setup uses the same component as My Account. The preferred method is stored on the device under the customer ID and is copied into the journey draft when navigating away. The server always rechecks ownership; a device preference grants no payment access.

The authenticated wallet endpoint prepares Stripe's payment-method domain for the canonical `webapp.needacabplus.app` host and caches its status per Stripe configuration for five minutes. It never registers a domain from request headers. A restricted Stripe key or inactive domain leaves saved cards working and hides unavailable native wallets. Stripe handles wallet tokenisation and merchant validation. Apple Pay still requires an eligible Apple device/browser and card; Google Pay requires an eligible Google Wallet/browser. The UI does not pretend that unsupported wallets are usable.

## Sandbox checkout

`POST /api/customer/booking-payment` accepts a signed quote token and optionally an owned saved payment-method ID. Amount and currency come from the decrypted server quote. It checks current booking switches, schedule, membership access, customer and Stripe mode. It creates an idempotent GBP test PaymentIntent keyed by customer and quote. Saved cards use Stripe confirmation with 3DS support; wallets use the Stripe Express Checkout Element. The client cannot create a real payment through this route.

Booking confirmation retrieves the intent from Stripe and requires succeeded status, test mode, the exact quote ID, customer ID, Stripe customer, currency, amount and booking-sandbox purpose. Pending payments, mismatched customers/quotes/amounts, missing payments and live intents are rejected. Confirmation retries reuse the payment and preview; they never create another operational booking.

Sandbox results are inserted idempotently into `web_booking_previews`, separate from `Booking`, `bookings` and live dispatch attempts. Cash previews need no Stripe intent. These rows contain passenger test details and should be included in the operator's test-data retention policy. They are not operational trips or analytics revenue. The client does not poll live booking tracking for a preview.

Apply `scripts/migrations/20261018_booking_previews.sql` before deployment on externally managed databases. Fresh installations receive the table through `db/init.sql`. The migration adds the table and grants the shared application only the SELECT/INSERT privileges used here.

## Live payments

Live cash booking behaviour is preserved. Live online booking payments remain blocked by `validateBookingPayment`: the current Autocab integration has no verified prepaid creation/release/compensation flow. Stripe live keys do not bypass this guard. Enabling real online payments requires that documented integration and a verified payment/dispatch failure recovery flow. No sandbox preview is sent to Autocab.

## Validation

Fixture tests cover payment/customer/amount binding, pending and live rejection, idempotent preview creation, no operational booking writes, origin/auth guards, domain preparation and UK scheduling around both clock changes. Browser checks at 320 and 390 px cover all sheet positions, footer visibility, the calendar, saved-card selection, capability-controlled wallet rows and a mocked Stripe sandbox confirmation. Native wallet authorisation itself must be verified on eligible real devices with the registered Stripe domain.
