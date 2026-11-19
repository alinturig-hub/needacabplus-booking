# Need A Cab Plus — private Alexa prototype (en-GB)

Status: private prototype. The web backend is deployed in preview mode, with its
schema/runtime access and OAuth endpoint behavior verified.
Amazon code/model installation and the first account-linked simulator/device test
remain unverified. No real taxi has been requested by this task.
The owner has created an Amazon Developer account and supplied a private skill ID.
The first account-linked Amazon simulator/device test remains outstanding.
Current skill setup: see `SETUP-OWNER.md`.

## What it does

“Alexa, open Need A Cab Plus.” → “Where would you like to go from Home?” →
“Work” → read exact saved addresses, the Autocab cash quote and one passenger/no luggage →
“Yes”. Test mode explicitly says no taxi will be sent before and after review.
Home, Work and a favourite named “Plymouth Station” are supported. Save these
addresses in the existing app first. Unknown/ambiguous names are rejected; no
venue or nearby address is guessed. Custom saved-place names require adding
sample slot values and testing recognition in Amazon's console.

## Pricing and booking authority: Autocab

Alexa calls the configured Autocab booking API directly for its fare, reading
`outward.price` in GBP. It does not call the Need A Cab Plus quote engine, price
policy, memberships, smart fares, discounts, cashback or payment-policy rules.
The technical backend retains account linking, saved addresses and duplicate
protection. The skill/brand name and OAuth fields do not change.

Immediate cash journeys support one passenger with no luggage. Autocab selects
its default vehicle/profile unless explicit operator capability IDs are configured;
Alexa does not promise a saloon when no such capability is set.

Optional runtime configuration, independent of Plus settings:
- `ALEXA_AUTOCAB_COMPANY_ID`: defaults to Autocab company 1.
- `ALEXA_AUTOCAB_CASH_CUSTOMER_ID`: absent by default; optionally an explicit
  Autocab cash-compatible account ID. No Plus account ID is inherited.
- `ALEXA_AUTOCAB_CAPABILITIES`: comma-separated Autocab capability IDs, empty
  by default. No Plus service, membership or discount capabilities are inherited.

The direct transports require `autocab-api.azure-api.net`, fixed documented quote
and booking paths, and refuse redirects. The existing configured Autocab credentials
and technical integration kill switch are reused; ordinary webapp pricing stays
on its existing path.

Only unadjusted, valid two-decimal GBP provider prices are spoken. Before a live
submission the fare is refreshed from Autocab: a changed price/profile needs a
new quote and a new explicit Yes. The booking request contains **no pricing object,
manual tariff, cost/price override, local surcharge or discount**. Autocab calculates
the booking itself; this is not a manually locked fare. There can still be operator
recalculation between quote and creation, as with a normal Autocab booking.

Reviews use a distinct encrypted `aa1` Autocab-only token; old Plus `q2` reviews
cannot submit a new Alexa booking. Durable attempts reuse `web_booking_attempts`
and the `NAC-<uuid>` technical correlation reference for reconciliation, but do not
create a local Plus booking/pricing copy. Autocab/webhooks remain the booking record.
No card charges, prebooking, guest access, actual ride cancellation, device-address
permission or Amazon Pay flow is implemented. Stopping a request does not cancel
an already confirmed ride.

## First owner step

Create an account at https://developer.amazon.com/ using the Amazon account you
will test with. Open https://developer.amazon.com/alexa/console/ask and create a
**Custom** skill, language **English (UK)**, named **Need A Cab Plus**. Do not
submit it for public certification yet.

Recommended private setup: Alexa-hosted Node.js, if available for the account.
Build an Alexa-hosted import archive (the root `lambda/` directory is required):

```sh
python alexa/package.py --format alexa-hosted --skill-id amzn1.ask.skill.REPLACE --output /tmp/alexa-hosted.zip
```

Open Code → Import Code, upload this archive, select all supplied files and
replace the sample files. Then Deploy and wait for deployment to succeed.
The handler uses native HTTPS and supports the observed Alexa-hosted Node.js
16.20.2 runtime as well as newer Node.js runtimes, without dependencies or global
fetch. The public skill ID is embedded by the packager; `skill-config.json` is
included for reference but is not required at startup. Keep the Amazon-managed
invocation permission bound to this exact skill. Replace the sample handler
rather than adding a second exported handler to the existing sample.

If testing says “You just triggered BookTaxiIntent”, the sample code is still
running. The interaction model already recognized the intent; import and deploy
the handler. An unlinked account should receive the account-linking prompt.

For an independently managed AWS Lambda, use `template.yaml` with AWS SAM in
`eu-west-1` and provide `SkillId`. The template grants invocation only to
`alexa-appkit.amazon.com` with that exact `EventSourceToken`, and has **no public
Function URL**. The handler's skill-ID check is defense in depth, not a substitute
for AWS's invocation policy. This handler is not a signature-verified HTTPS
endpoint; never mount it on an unauthenticated web route. Alternatively package:

```sh
python alexa/package.py --skill-id amzn1.ask.skill.REPLACE --output /tmp/alexa-lambda.zip
# Optional separate AWS account setup, not executed here:
cd alexa
sam build
sam deploy --guided --region eu-west-1 --parameter-overrides SkillId=amzn1.ask.skill.REPLACE
```

AWS/hosting charges depend on the chosen account/plan; no paid service or account
has been created by this prototype task.

Import `skill-package/interactionModels/custom/en-GB.json` in the console JSON
Editor and build the model. The optional `skill-package/skill.json` is a scaffold;
replace its Lambda ARN before using SMAPI. Public listing privacy/terms URLs,
icons, customer support details and Amazon policy review are not supplied by this
private development scaffold. Invocation/recognition and certification require
Amazon validation; the generic “Alexa, book me a taxi” invocation is not promised.

## Backend setup after the skill exists

1. Review `db/20261117_alexa_private_skill.sql`. When the skill is enabled,
   `start-production.mjs` runs `migrate-alexa.mjs` using `NAC_GRANT_DATABASE_URL`
   (or the runtime DSN for a schema-owning installation). It verifies the owner
   and runtime target are the same database, grants CRUD only on the three Alexa
   tables, and verifies runtime access. Existing booking tables are unchanged.
   `ALEXA_SCHEMA_READY` confirms success; failure disables Alexa for that process
   while allowing the existing application to start. Migration is idempotent.
2. Set Coolify **runtime only** variables (never put secrets in chat):
   - `ALEXA_SKILL_ENABLED=true`
   - `ALEXA_BOOKING_MODE=preview`
   - `ALEXA_OAUTH_CLIENT_ID`: unique identifier for this Alexa client
   - `ALEXA_OAUTH_CLIENT_SECRET`: random secret of at least 32 characters
   - `ALEXA_OAUTH_REDIRECT_URIS`: comma-separated **exact** redirect URLs from
     Amazon's Account Linking screen. Only the official pitangui.amazon.com,
     layla.amazon.com and alexa.amazon.co.jp hosts are allowed. Do not use wildcard
     paths/domains or the sample callback values from tests.
3. Deploy the reviewed backend code with the new schema/permissions.
4. Configure Account Linking in Amazon:
   - Authorization code grant, **PKCE S256**
   - Authorization URI: `https://webapp.needacabplus.app/alexa/link`
   - Access-token URI: `https://webapp.needacabplus.app/api/alexa/token`
   - Client ID and secret: exact values configured above
   - Client authentication: HTTP Basic (body credentials also supported)
   - Scope: `bookings:voice`
   - Link account before using the skill; no guest booking
5. Enable Development testing, link the account, and test in the Alexa simulator
   and on a device with `ALEXA_BOOKING_MODE=preview`. Confirm the speech includes
   “This is a test. No taxi will be sent.” Follow the acceptance cases below.

`ALEXA_SKILL_ENABLED` defaults off and the mode defaults to preview. The repo
contains the public skill ID, but no OAuth secret, Lambda ARN or developer credentials.

## Confirmation, replay and account controls

- OAuth codes expire in two minutes, are hashed, single-use, and bound to redirect
  and S256 PKCE proof. Refresh tokens rotate, expire after 30 days, and are hashed.
  Access tokens last one hour. Credentials are checked before token DB access.
- Customer consent is required after the existing customer login, with exact
  redirect validation and same-origin form POST. The page explains shared Alexa
  account access to saved places and booking permission. `/alexa` disconnects all
  grants for the customer; revoked/expired tokens cannot request or confirm rides.
- Pending journey, quote token and review text are stored server-side, scoped to
  the linked grant and Alexa session. Alexa session attributes contain only a
  conversation UUID. No phone, fare token or bearer token is put in attributes.
- At most five quotes per customer per minute. A newer request invalidates pending
  quotes in that voice session. Review expires at the earlier of three minutes or
  quote expiry. Changing preview/live mode invalidates the old review.
- Yes atomically claims the review once. Live sends use the existing durable
  `web_booking_attempts` reservation and quote UUID. Timeout/uncertainty never
  reports success or retries creation. The app/operator is the recovery path.
- Lambda checks skill identity, locale and request timestamp (150 seconds); the
  AWS invocation permission is mandatory. Output speech is PlainText, not SSML.
- Do not enable full Alexa request/response logging: linked bearer tokens and
  spoken addresses are sensitive. Configure retention for these new tables;
  delete expired authorization codes and old terminal conversations periodically,
  preserving uncertain attempts until reconciled under existing booking policy.

Live cash mode exists for later controlled testing, but **has not been enabled**.
It requires the dedicated Alexa mode and an enabled, correctly configured Autocab
API connection. Need A Cab Plus live-quote/cash/membership toggles do not govern it.
Never change the mode to live during a pending preview. The backend rejects that
review rather than silently turning a simulation into a real booking. First live
exercise should use a known linked tester and one explicit voice confirmation,
with operator visibility; no automated real-booking tests are included here.

## Local verification

```sh
node --test tests/alexa-lambda.test.mjs tests/alexa-backend.test.cjs tests/alexa-autocab-direct.test.cjs
node_modules/.bin/tsx --test tests/alexa-policy.test.ts
node alexa/tools/rehearse.mjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/eslint lib/alexa app/alexa app/api/alexa alexa/lambda/index.js
```

The rehearsal uses synthetic addresses/prices and a mocked backend. Database
checks use PGlite; transport and operator booking creation are mocked. None of
these commands invokes Alexa or creates a real taxi booking.

Amazon simulator/device acceptance: launch and Link Account; authorize/cancel;
Home→Work; unknown/ambiguous favourite; read back both addresses and cash fare;
No/Stop; Yes before a quote; expired quote; repeated/concurrent Yes; expired and
revoked access; changed mode; backend timeout while confirming; verify zero live
operator jobs in preview. Public release and real voice recognition remain
unverified until these Amazon-side checks are completed.

Official references:
- https://developer.amazon.com/docs/alexaplus/account-linking/configure-authorization-code-grant
- https://developer.amazon.com/docs/alexaplus/account-linking/standard-account-linking
- https://developer.amazon.com/en-US/docs/alexa/hosted-skills/alexa-hosted-skills-create.html
