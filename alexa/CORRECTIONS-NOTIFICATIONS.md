# Alexa address corrections and taxi updates

Bookings remain in preview. Preview bookings do not dispatch a taxi and do not generate vehicle notifications.

## Interaction model

Import `skill-package/interactionModels/custom/en-GB-guest.json` in the Alexa console's English (UK) Interaction Model JSON Editor. Save and Build Model. The HTTPS endpoint stays `https://webapp.needacabplus.app/api/alexa/guest`.

Examples:
- `no I want main reception`
- `change destination to Derriford Hospital main reception`
- `I don't want discharge lounge`
- `where is my taxi`

A correction clears the old quote and requires the new address and fare to be confirmed. Freephone entries are excluded. For Derriford's main reception request, the service offers the verified **Main Entrance** record using its actual name; it does not invent a Main Reception coordinate.

## Confirmation and per-booking update choice

After a successful live Autocab response, Alexa reads the returned booking ID as the reference number and asks whether the passenger wants updates. A second Yes opts **that booking** in; No/Stop declines updates without cancelling the taxi. An unknown/rejected response never announces a confirmed reference or enrolls the passenger. Preview still creates no booking and invents no reference.

Spoken Yes and Amazon's MessageAlert subscription are both required. A permission card opens the notification setting if Amazon subscription consent is absent. `keep me updated` and `stop taxi updates` change the preference for the latest confirmed booking owned by that Alexa user. Preferences persist through restarts and are rechecked before every send.

## Status

`Alexa, ask Need A Cab Plus where my taxi is` returns the latest real booking owned by that Alexa user. Confirmed Autocab webhook data supplies status, colour, make, model and registration where available. A dispatch offer is not driver acceptance. Missing or stale details are not presented as current confirmed information.

## Development notifications: owner configuration required

The backend is prepared but notifications are disabled until all the following are configured:

1. Download the existing development skill manifest through ASK CLI or SMAPI. Keep a backup.
2. Run `node alexa/tools/prepare-notifications.mjs current-manifest.json notifications-manifest.json`. This prepares a full manifest wrapper, preserving existing metadata. Review and apply it through SMAPI's Update Skill Manifest operation to the **development** stage. This is not interaction-model JSON and must not be pasted into the Interaction Model editor.
3. In Alexa Developer Console → Build → Permissions → Alexa Skill Messaging, obtain this skill's Alexa Client ID and Client Secret. These are different from our account-linking OAuth secret.
4. In Coolify, add runtime variables (build time off): `ALEXA_PROACTIVE_CLIENT_ID`, `ALEXA_PROACTIVE_CLIENT_SECRET`, and `ALEXA_NOTIFICATIONS_MODE=development`. Preserve the existing `BOOKING_WRITER_JOB_SECRET`. Do not share secrets in chat.
5. Save/redeploy. Enable notifications for this skill in the Alexa app with the same Amazon development account. The signed MessageAlert subscription event must arrive before a user is enrolled.
6. Validate with an explicitly authorized real test booking. Preview bookings deliberately produce no real vehicle or notification.

Alexa delivers its standard new-message notification. The customer then asks for taxi status to hear vehicle details. The skill cannot make an idle Echo spontaneously speak arbitrary dispatch text.

This implementation only sends to Amazon's development proactive-events endpoint. Production notifications require a separate release/certification step. It does not activate live taxi dispatch.

## Persistence

Subscriptions and the notification outbox persist in PostgreSQL. The production process polls opted-in users every 30 seconds when development notifications are configured. The worker distinguishes accepted driver allocation, a fresh Autocab pickup ETA within two minutes, and the explicit ARRIVED status. An ETA never infers that a taxi is outside. Missing, expired or stale ETA data suppresses the two-minute update; scheduled pickup and journey duration are never used instead. Identical milestone/allocation updates do not generate repeated alerts. The pickup milestone helper is shared code for future customer-webapp delivery; this release updates Alexa only. Consent revocation and replaced vehicle allocations are rechecked before sending; delivery retries use a stable event reference.

## Explicit development notification test

The internal `GET /api/internal/alexa/notification-test` returns configured state and recent subscribed recipient hashes. It requires the existing booking-writer job secret and discloses no raw Alexa user ID or credentials. `POST` with only `principal` sends one standard development MessageAlert to that exact subscribed recipient, provided the recipient has a voice response in the previous 15 minutes. It never creates a booking, quote or booking update preference. One persistent claim per recipient per UTC hour prevents duplicate or uncertain test sends across restarts. An Amazon 202 means accepted, not confirmed device delivery; the customer must report receipt on a supported Alexa device/app.
