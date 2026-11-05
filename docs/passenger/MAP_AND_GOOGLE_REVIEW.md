# Passenger map, history and browser OAuth review

Development branch: codex/passenger-map-login-review, based on 546077451ed74dce209ac350bb08021f3be33c70. No production deployment, database migration, booking, SMS or WhatsApp send.

## Map-led planning

The existing mobile stage-zero CSS explicitly hid the map. The new mobile layout exposes the existing CustomerLiveMap above a rounded planning sheet, keeping the map camera inside the visible area. No second fleet feed is introduced. Existing clear-vehicle feed, three-mile/seven-car display limit, coordinate validation and two-minute freshness checks remain unchanged. Current location can center the map before a pickup is selected; a quote still requires validated selected addresses.

History and saved places remain available when the active field is empty. Search results replace them while typing, followed by a map selection action for supported pickup/destination targets. Via points keep their existing search behavior. Light/dark themes and map picker/stop editor flows retain separate layouts. The app/account history is not fabricated; the preview uses explicitly synthetic fixtures.

## Browser Google sign-in

The screenshot's provider_expired category means missing browser proof or no matching unexpired state. It does not uniquely establish a root cause. This patch addresses concrete failure modes found in code:
- OAuth provider buttons use full document navigation, avoiding the Next client-router fetch path to external authorization.
- A request received on a different host is redirected to the configured callback origin BEFORE minting its host-only correlation cookie.
- Each attempt has a distinct correlation cookie derived from the state hash; parallel attempts no longer overwrite one provider-wide browser secret. The cookie is deleted after the matching database state is consumed. A legacy cookie fallback allows an already-started flow to finish during rollout.
- State, browser hash, five-minute expiry, one-use DELETE, PKCE, token signature/nonce/audience/issuer and verified email checks remain. The cookie requirement is never bypassed.

There was no real Google sign-in, provider credential inspection or production log query. The reported login must still be retested in the same browser after a future authorized deployment. Expired/blocked cookies or switching browsers can still correctly reject authentication.

The testing APK uses a WebView. Native Google authentication requires a secure browser authorization and verified return/session exchange; this patch DOES NOT implement that handoff or claim it fixed. Use existing phone login in the APK until that separate integration is ready. No user-agent override or state-check removal is used.

## Validation

```sh
node --test tests/oauth-browser.test.cjs tests/oauth-flow-browser.test.cjs tests/oauth-errors.test.cjs tests/customer-oauth-account.test.cjs tests/oauth-token.test.mjs
./node_modules/.bin/eslint app/booking-app.tsx app/customer-login/page.tsx lib/customer-oauth.ts lib/oauth-browser.ts 'app/api/customer/auth/oauth/[provider]/route.ts'
./node_modules/.bin/tsc --noEmit --pretty false --incremental false
```

Six test cases cover independent attempts, canonical host routing, the actual start/finish functions with simulated state storage and provider responses, missing browser proof/replay, safe diagnostic categories, account linking and signed identity-token validation. Local TypeScript and targeted lint pass.

A separate local browser harness renders the real BookingApp at 390×844, mocks app APIs and uses synthetic addresses/vehicle/account only. It confirms map visibility, history before input, results replacing history, map action, light/dark layouts and no page exceptions. It is not an end-to-end live authentication/booking/stream test. Evidence and screenshots are in /workspace/artifacts/passenger-map-login. No APK rebuild was performed for this web-only change; the current remote-content APK will see a future web deployment, while native OAuth handoff remains outstanding.
