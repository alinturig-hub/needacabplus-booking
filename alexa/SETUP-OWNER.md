# Current private skill

Skill ID: `amzn1.ask.skill.98ba95c6-7892-4739-8faf-6a26e41cbccd`
Locale: en-GB. Invocation name: `need a cab plus`.

The public skill ID is now configured in the handler. This does not install the
code or interaction model in Amazon. The backend remains disabled and undeployed.

## Amazon Developer Console

1. Build → Interaction Model → JSON Editor: import
   `skill-package/interactionModels/custom/en-GB.json`; Save and Build Model.
2. If this is an Alexa-hosted Node.js skill, open Code and replace the sample
   `index.js`, `package.json` and add `skill-config.json` using `lambda/` files.
   Save and Deploy. Keep the Amazon-managed invocation restriction for this skill.
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

Publishing/certification, production migration, OAuth credentials, exact callback
allowlist and Amazon simulator/device testing remain outstanding. Account linking
will not work until those backend setup steps in README are complete.
