# Guest voice booking (private preview)

No Need A Cab Plus account, OAuth grant, saved place, membership or card is required.
Autocab quotes and creates the cash booking. Guest dispatch defaults to preview,
independently of `ALEXA_BOOKING_MODE`; only `ALEXA_GUEST_BOOKING_MODE=live` enables
real guest sends. Keep that setting absent or `preview` for this test.

## Amazon console (owner)

1. Build → Account Linking: turn off the master account-linking switch and Save.
2. Build → Endpoint: choose HTTPS, use
   `https://webapp.needacabplus.app/api/alexa/guest` as the Default Region endpoint.
   Choose the SSL certificate option for a certificate issued by a trusted
   certificate authority. Save Endpoints. This replaces the Lambda endpoint; the
   previous Code tab handler can remain, but is no longer invoked by this endpoint.
3. Build → Interaction Model → JSON Editor: replace the model with
   `skill-package/interactionModels/custom/en-GB-guest.json`. Save, then Build Model.
4. Test → Development, English (GB): say `open need a cab plus`.

Example conversation (addresses must resolve unambiguously):

- `pickup is 67 Salcombe Road Plymouth`
- `yes` after Alexa reads the found address
- `destination is Plymouth railway station Plymouth`
- `yes` after Alexa reads the found destination
- `my name is Alin`
- `my phone number is` followed by your actual contact number
- Alexa reads the name, phone number, addresses and cash Autocab fare
- `yes` simulates confirmation: **Test complete. No taxi has been booked.**

Use a street number, town and postcode if address search is ambiguous. There is
no silent first-result selection. Home/Work needs a full address for a guest.
If the name or phone number read back is wrong, say no and restart.

## Server

The POST route verifies Amazon's raw-body signature/certificate using the Amazon
SDK, a 150-second timestamp window (including future requests), exact skill ID,
locale, Alexa user and voice session before reaching booking logic. It is not a
public unauthenticated booking API. Do not proxy the old Lambda's unsigned JSON
into this route. No secret needs to be copied into Amazon's editor.

The migration adds `alexa_guest_sessions` and `alexa_guest_requests`, grants the
same runtime privileges as the existing Alexa tables and is run at server startup.
No guest customer accounts or local Plus booking copies are created. State and
request replay results live in PostgreSQL, not Lambda memory or session attributes.
Guest voice details expire after 20 minutes; completed/expired session details and
cached replies are pruned on subsequent requests after 24 hours. Pending/unknown
outcomes are retained for operator investigation. Live operator booking attempts
retain their existing audit policy.

Quotes expire after three minutes. A preview quote cannot turn live after a
settings change. Live confirmation rechecks the fare, commits a durable claim
before sending, uses the existing one-send Autocab attempt store and blocks another
request for the same Alexa user while an outcome is uncertain. A new price needs
a new quote and a fresh spoken Yes. Cash only; no fabricated email is supplied.

This endpoint/model can be tested only after the owner changes the Amazon console
settings. Local mocked tests do not prove Amazon model build or a live device flow.

Amazon endpoint/hosting reference: https://developer.amazon.com/en-AU/docs/alexa/hosted-skills/build-a-skill-end-to-end-using-an-alexa-hosted-skill.html

## Place search and shorter prompts

The voice flow now uses the same named-place lookup as the webapp, with the
operator address API as fallback. It ranks Plymouth results first, resolves
coordinates/zone and keeps the venue label. Up to three alternatives can be
read one at a time: Yes accepts the address just read; No offers the next one.
No route or fare is requested until both endpoints are explicitly accepted.

Reimport the updated guest interaction model and Build Model to add:
`pick up is ...`, `I am at ...`, `the address is ...`, `collect me from ...`.
Existing `pick me up from Need a Cab Plymouth` also works with the previous model.
A bare `need a cab` is a booking command; it does not specify a pickup place.
