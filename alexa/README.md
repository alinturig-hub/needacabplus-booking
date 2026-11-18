# Need A Cab Plus — private Alexa prototype (en-GB)

Status: private prototype, configured for a preview-only backend rollout.
Amazon code/model installation and the first account-linked simulator/device test
remain unverified. No real taxi has been requested by this task.
The owner has created an Amazon Developer account and supplied a private skill ID.
The first account-linked Amazon simulator/device test remains outstanding.
Current skill setup: see `SETUP-OWNER.md`.

## What it does

“Alexa, open Need A Cab Plus.” → “Where would you like to go from Home?” →
“Work” → read exact saved addresses, cash fare and one passenger/no luggage →
“Yes”. Test mode explicitly says no taxi will be sent before and after review.
Home, Work and a favourite named “Plymouth Station” are supported. Save these
addresses in the existing app first. Unknown/ambiguous names are rejected; no
venue or nearby address is guessed. Custom saved-place names require adding
sample slot values and testing recognition in Amazon's console.

Live adapter is limited to an ASAP saloon for one passenger, no luggage, cash.
Existing quote, membership, payment-policy, Autocab integration and durable cash
booking-attempt guards are reused. No new card charges, prebooking, guest access,
ride cancellation, device-address permission or Amazon Pay flow is implemented.
A stopped request does not cancel a confirmed ride.

## First owner step

Create an account at https://developer.amazon.com/ using the Amazon account you
will test with. Open https://developer.amazon.com/alexa/console/ask and create a
**Custom** skill, language **English (UK)**, named **Need A Cab Plus**. Do not
submit it for public certification yet.

Recommended private setup: Alexa-hosted Node.js, if available for the account.
Replace the sample handler with `lambda/index.js`, retain `lambda/package.json`,
and add `lambda/skill-config.json` with the exact public skill ID shown in the
console. No packages are required. Alexa-hosted manages the Lambda invocation
permission; keep the trigger bound to this exact skill. Replace the sample handler
rather than adding a second exported handler to the existing sample.

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
It additionally requires live cash/ASAP access in the existing booking settings.
Never change the mode to live during a pending preview. The backend rejects that
review rather than silently turning a simulation into a real booking. First live
exercise should use a known linked tester and one explicit voice confirmation,
with operator visibility; no automated real-booking tests are included here.

## Local verification

```sh
node --test tests/alexa-lambda.test.mjs tests/alexa-backend.test.cjs
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
