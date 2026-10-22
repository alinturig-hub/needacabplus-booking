# Driver service timing: DPIA screening note

The booking detail view evaluates existing Autocab booking, dispatch, acceptance,
arrival (DAP), on-board and completion event timestamps. It does not collect new
telematics, speed, continuous movement, audio or behaviour data. Maps are route
previews between saved booking locations, not actual GPS traces.

Purpose: help authorised operations staff review service punctuality and distinguish
pre-dispatch waiting from subsequent phases. Initial ASAP thresholds are operator
policy; pre-book DAP must be no later than one minute before pickup. Missing events
remain unknown or unconfirmed. Individual fault cannot be inferred from these times.
There are no automatic penalties, allocation changes, suspension, pay changes or
rating-based decisions. Drivers can ask for human review/correction of source events.

The booking and original JSON remain the source; this feature creates no extra
tracking history or assessment table. Existing booking retention/access controls
apply. Estimated route preview uses the existing map/routing providers. Location
access must remain limited to authorised staff and existing privacy arrangements.

Before extending this to continuous telematics, fleet ranking or employment decisions,
the operator must complete a full DPIA and confirm lawful basis, driver notice,
proportionality, accuracy, retention, processor agreements and contestability.
See `/driver/service-timing` for the driver-facing measurement notice.
