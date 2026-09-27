# Autocab booking handoff audit

Current live operation: `booking.quote`, POST `/booking/v1/quote`, company 1.
Passenger price is `outward.price` in GBP. Customer responses show only the
final total. Internal base price, uplift and full request are encrypted in
the expiring quote token and retained in the test booking audit data.

`POST /api/bookings` currently creates a local **test** booking. It does not
create an Autocab booking, charge a card, allocate a driver or dispatch.

The quote snapshot retains the full pickup/destination/via address objects,
coordinates, zone IDs, ordered vias, company, UTC pickup time, vehicle
capability IDs and quoted passenger capacity. Capability mappings live in
Configuration → Price changes. A later booking must use this snapshot, not
look up changed capability settings or reconstruct addresses from text.

Before enabling real booking creation, obtain the official create-booking
endpoint and request/response schema, including:

- Passenger name, telephone, actual passenger count, notes and references.
- The field and mode that preserve the final customer price, including the
  supplement, without replacing the driver's cost or recalculating it away.
- Card payment / authorization references and payment lifecycle semantics.
- Capability representation, company scope, prebook and ASAP semantics.
- Booking ID returned on success, duplicate prevention and reconciliation
  after an ambiguous timeout. Do not blindly retry a create call.

Register the create action as `booking.create` after its method and path
are confirmed. Merely registering it must not enable live dispatch.

For auto-dispatch obtain the documented allocation/dispatch operation and
its requirements. Confirm whether creation already starts automatic
dispatch before adding a second call. Gate it on a successfully created
booking and the payment policy; preserve the returned Autocab booking ID,
capabilities and dispatch rules. Use webhooks to reconcile final status.

No create/dispatch endpoint path or pricing field is guessed in this change.
