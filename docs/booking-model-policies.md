# Separate booking model policies

Booking rules at `/admin/configuration#bookings` provide independent Autocab and
Need A Cab Plus panels. Switching panels preserves unsaved edits.

- Autocab retains the existing `app_configuration.bookings` record, customer
  configuration API, quote/booking validation, account IDs, capabilities, payment
  controls, reference audit and booking sandbox. Its public booking flow is unchanged.
- Need A Cab Plus stores `app_configuration.bookings_native` through the separate
  administrator-only `/api/admin/native-booking-rules` API. It has no Autocab IDs or
  capability mapping. Unknown fields and attempts to enable native live delivery
  are rejected. Native customer booking delivery/payment processing is not wired;
  the UI identifies those settings as preparation for the native model.
- Native dispatch configuration and its simulator now read the native cash policy
  for effective No Fare priority. The Autocab booking policy no longer controls it.

`20261025_native_booking_policy.sql` adds the native configuration namespace and
seeds its common policy fields once from the existing record. It explicitly keeps
native live delivery off, does not modify the Autocab record, and does not copy
account/capability fields. This preserves the previously shared native cash
behavior at cutover while allowing independent edits afterward. Re-running the
migration never overwrites either model's later edits. No booking is sent and no
live flow is switched by applying this migration or choosing a panel.

Validation covers administrator/origin guards, migration idempotence, rejected
cross-model fields, isolated persistence and native dispatch cash selection.
