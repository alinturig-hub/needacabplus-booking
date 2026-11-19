# Contextual guest pickup (private preview)

This builds on the guest HTTPS endpoint; account linking stays OFF. Pricing and
cash bookings remain direct Autocab calls. `ALEXA_GUEST_BOOKING_MODE` stays absent
or `preview` during the first real-device test. No live dispatch is enabled here.

## Owner console changes

1. Build → Permissions: enable **Device Address → Full Address** and
   **Location Services**. Save. These are optional for manual booking.
2. In the Alexa mobile app, open this development skill's Settings/Permissions and
   grant device-address/location access. The phone's own location setting must
   also be on. Permission in Amazon Developer Console alone is not customer consent.
3. Build → Interaction Model → JSON Editor: import the updated
   `skill-package/interactionModels/custom/en-GB-guest.json`. Save and Build Model.
4. Keep the existing HTTPS endpoint:
   `https://webapp.needacabplus.app/api/alexa/guest`.
5. Test on an actual Echo/compatible mobile device as well as the simulator.
   A simulator request may not contain a real device address or Geolocation; this
   should produce a normal manual-pickup question, not an invented location.

The separate `skill-package/skill-guest.json` is an optional SMAPI manifest reference
for the HTTPS guest skill, including its permissions. The original `skill.json`
continues to describe the legacy linked-account Lambda pilot.

## Example conversations

`Alexa, ask need a cab plus to book me a taxi to the train station.`

- Echo (consented complete address): "Shall I pick you up from your device
  address, ...?"
- Compatible mobile device (fresh consented GPS): "Based on your location,
  your pickup is near ... Is this the right pickup?"
- Unavailable/denied/inaccurate location: "Sure. What is your pickup address or place?"
- After pickup Yes, Alexa searches and confirms the already supplied station,
  without asking where the user wants to go again.
- It asks only for missing contact fields, reads the Autocab cash fare and waits
  for a separate spoken Yes. In preview: "Test complete. No taxi has been booked."

`Alexa, ask need a cab plus to book a taxi from Crowne Plaza to the station.`

The single Journey phrase is split into two endpoints; each is searched and
confirmed. A location hint can help select the city but never replaces an explicit
spoken pickup. City is obtained from the device address or reverse-geocoded GPS
when available. Generic "the station" resolves within that city; Plymouth remains
the pilot fallback when no city is known.

Common short place replies ("the station", "Crowne Plaza") follow the current
pickup/destination question. For an arbitrary address, use "pick me up from ...",
"I am at ..." or "take me to ...". Alexa's SearchQuery slot permits one phrase per
sample: two endpoints are intentionally captured in one Journey slot and parsed
server-side, rather than using two SearchQuery slots in the same utterance.

## Location checks

- Only Amazon-signed requests for the exact skill reach location/booking logic.
- Device-address tokens go only to the three allowlisted Alexa API origins over
  HTTPS, with redirects disabled and a bounded read timeout. Amazon enforces the
  full-address grant; denial/incomplete or ambiguous address produces manual pickup.
- GPS needs explicit GRANTED geolocation permission, valid coordinates, accuracy
  <=100m and measurement age <=60s (up to 10s future clock tolerance). Disabled
  location services fail closed. A GPS-capable device with missing/stale/denied
  GPS never falls back to its stationary registered home address.
- A GPS proposal that becomes stale while waiting for Yes is refreshed and must
  be accepted again. Automatic pickup is never accepted just because a location
  is available; rejecting it returns to manual input.
- API tokens and raw Alexa context are never stored in voice state, booking
  bodies, logs or response session attributes. Only address/city/source metadata
  needed for the confirmed journey is retained under the existing guest retention.
- A new route invalidates the prior fare; changing route after a quote requires
  new address confirmation and a new spoken fare confirmation.

Custom skills cannot guarantee ownership of the generic global phrase
"Alexa, book me a taxi". Use "Alexa, ask need a cab plus ...", or open the skill
first and then say "book me a taxi".

Official references:
- https://developer.amazon.com/en-US/docs/alexa/custom-skills/use-device-address.html
- https://developer.amazon.com/en-US/docs/alexa/custom-skills/location-services-for-alexa-skills.html
- https://developer.amazon.com/en-US/docs/alexa/smapi/skill-manifest.html
