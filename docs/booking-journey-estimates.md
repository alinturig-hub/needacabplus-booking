# Passenger journey estimates

The ride chooser shows approximate pickup time from road-route durations for up to three nearby free cars. Only GPS observations from the last two minutes are eligible; future observations beyond 30 seconds are rejected. Estimates refresh every 30 seconds and expire after 90 seconds without a successful refresh. They describe nearby availability, not an assigned driver or a class-specific dispatch promise.

The drop-off estimate is the current time plus pickup travel time and journey road travel time, including intermediate stops. Scheduled journeys use the requested pickup time. Times display in Europe/London and follow BST/GMT. OSRM road times do not include live traffic, dispatch delays or stop dwell time; labels identify them as estimates. Missing or stale availability leaves the ASAP drop-off time unavailable.

On mobile, drag or tap the panel handle to expand the vehicle list. Choices scroll independently while payment and confirmation stay visible. Keyboard users can activate the handle or use its up/down arrow keys.

# Operator membership tests

Apply `scripts/migrations/20261017_membership_test_access.sql` before deploying this feature to an externally managed database. Fresh installations also receive the columns through `db/init.sql`.

An operator can grant a single customer's existing membership a bounded `operator_access_until`, with an explanation in `operator_access_reason`. The membership must be active, started, unexpired, and have an enabled tier. This explicit test grant can enable benefits before subscriptions or plan prices are configured. It does not create a Stripe subscription, record a payment or enable benefits for other customers. The account screen labels the grant as test access and shows its expiry. Quote creation and booking confirmation use the same entitlement resolver as the account screen. Clearing the grant or cancelling the membership revokes test access.
