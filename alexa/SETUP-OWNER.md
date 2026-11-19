# Current private skill

Skill ID: `amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd`
Locale: en-GB. Invocation name: `need a cab plus`.

The public skill ID is configured in the handler. The web backend is deployed
in preview mode; its three tables and runtime privileges were verified. This
does not install the code or interaction model in Amazon.

## Amazon Developer Console

1. Build → Interaction Model → JSON Editor: import
   `skill-package/interactionModels/custom/en-GB.json`; Save and Build Model.
2. If this is an Alexa-hosted Node.js skill, build the archive with
   `python alexa/package.py --format alexa-hosted --skill-id amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd --output /tmp/alexa-hosted.zip`.
   Open Code → Import Code, select all supplied files and replace the sample.
   Deploy and wait for success. Native HTTPS supports Node.js 16.20.2; no
   dependencies or environment variables are needed in the hosted editor. Keep the Amazon-managed invocation restriction for this skill.
   If it is not Alexa-hosted, use the Lambda/SAM option in README instead.
3. Build → Account Linking: select authorization code grant and use:
   - Authorization URI: `https://webapp.needacabplus.app/alexa/link`
   - Access Token URI: `https://webapp.needacabplus.app/api/alexa/token`
   - Scope: `bookings:voice`
   - HTTP Basic client authentication; PKCE S256.
4. Send the exact Alexa Redirect URLs displayed by Amazon to the backend operator.
   They are public callbacks. Do not guess them from the skill ID. Client secret
   will be generated and configured privately, never put into these source files.
5. Keep Development testing and backend preview mode for the first linked test.

Backend migration, client credentials and the exact callback allowlist are
configured. Complete and save the Account Linking form in Amazon, install/build
the model and handler, then run the first linked simulator/device test. Public
publication/certification and real booking activation remain outstanding.

## Owner callbacks (copied from Account Linking screenshot)

- https://pitangui.amazon.com/api/skill/link/M3NKLXHRHFLX1G
- https://layla.amazon.com/api/skill/link/M3NKLXHRHFLX1G
- https://alexa.amazon.co.jp/api/skill/link/M3NKLXHRHFLX1G

Client ID: `needacabplus-alexa`. Client secret is generated/stored only in Coolify
runtime variables; copy it directly into Amazon's Your Secret field.

Use web linking only: turn off app/website-initiated linking, mobile-app
authentication and voice-based account linking. Those flows are not implemented.
Keep Auth Code Grant and PKCE enabled. Scope: `bookings:voice`; token lifetime:
3600 seconds. iOS/Android authorization fields and Your Redirect URLs are unused
when those advanced flows are disabled. Amazon's displayed Alexa Redirect URLs
are the callback allowlist on our backend, not app-initiated redirect URLs.

## Verified preview deployment

Backend release: `8bb52028b87077da2192cb0cce8b3ef1811d2cc9`.
Startup confirmed `ALEXA_SCHEMA_READY` for three tables with runtime CRUD access.
Health returned 200; unauthenticated conversation returned 401. Valid client
credentials with an unissued code returned `invalid_grant`; wrong credentials
returned `invalid_client`. A valid authorization request redirected to customer
login. No customer authorization code or real booking was created by these checks.

The client secret is available only in Coolify → Need A Cab Plus → Environment
Variables → `ALEXA_OAUTH_CLIENT_SECRET`; copy it directly into Amazon's Your Secret
field. Token expiration is 3600 seconds. Optional Domain List: `webapp.needacabplus.app`.

## Autocab-only pricing

Alexa reads and rechecks the Autocab API fare directly. It does not load Need A
Cab Plus pricing, membership, smart-fare or promotion rules. A live booking omits
manual pricing/tariff fields so Autocab remains the pricing authority. Account
linking, saved addresses and replay protection remain technical backend functions.
Company defaults to 1, no customer/account is inherited, and capabilities default
to empty. See README for explicit Autocab-only profile environment variables.
The deployed mode remains preview; no taxi is sent by a test confirmation.
