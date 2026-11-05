# Android Google return and keyboard handling — testing 0.3.0

## Protocol and trust boundaries

Google remains in the system browser with the existing approved WEB redirect URI. The Android app generates its own random verifier and state, persists them in app-private preferences (backup disabled), and sends only S256 challenge/state through the browser's OAuth start. The standard Google nonce, browser cookie, state, provider signature/issuer/audience/email and provider PKCE checks remain unchanged.

The existing `customer_oauth_states.verifier` text supports a versioned JSON encoding for native attempts containing the ORIGINAL provider verifier and native challenge/state. Plain 43-character verifiers remain supported for browser-only/previously started attempts. No schema migration or new grants are needed: this is the existing OAuth temporary-state store, not a booking store.

After canonical account linking/login, a separate `native_google_handoff_v1` row stores SHA256(grant), SHA256(app verifier), app state and a versioned canonical customer-ID reference, with a 60-second expiry. Its provider namespace prevents either route consuming the other kind of state. Expired handoff rows are pruned on grant issuance. Neither raw grant nor a session token is stored in that row. The 256-bit grant is returned in a URL FRAGMENT, not in a request query/access log. HTTP redirects suppress referrers.

The landing page removes the fragment from its history entry and opens a package-pinned `intent://` link for `app.needacabplus.passenger.testing`, with an explicit Return to app button if automatic launch is blocked. This custom-scheme grant is not a bearer session: it also requires the APK's private verifier and pending state. Native code strips auth intent data BEFORE passing anything to Capacitor, validates its own pending state and age, and sends one bounded HTTPS POST to `/api/customer/auth/native/exchange`. It never forwards the grant or cookie to JavaScript.

The exchange route accepts only code/state/verifier JSON, caps input at 2KiB, rejects foreign browser Origins, rate limits, and atomically DELETEs the matching unexpired row. Wrong proof/state does not consume the legitimate row; replay/expiry fails. It then calls the EXISTING setCustomerSession for that canonical account. Response JSON is only `{ok:true}`; the ordinary Secure HttpOnly customer-session cookie is in Set-Cookie. Android installs that cookie through CookieManager, flushes it and reloads the passenger homepage. Unknown outcomes are not retried with the consumed grant; start a fresh sign-in. No phone/booking ID grants account access.

Browser-only Google behavior is retained. Google app return is implemented; Apple still remains browser-only. No Meta tokens, Google client secrets or session cookies are in APK source, intent URLs, JSON or logs. No new database objects, production migrations, bookings, SMS/WhatsApp or notification flags are involved.

## Keyboard

The web planning sheet follows visualViewport height/offset and focus. While the software keyboard occupies the viewport, the map/shortcuts temporarily hide and the address sheet uses the remaining visible area; closing restores layout without losing address state. Android 11+ explicitly sizes the WebView using the greater system/IME bottom inset; older versions use adjustResize. This also retains status-bar/cutout spacing.

## Validation and limits

- `node --test tests/native-auth.test.cjs tests/oauth-flow-browser.test.cjs tests/customer-oauth-account.test.cjs tests/oauth-token.test.mjs`: six cases passed. PGlite uses the existing OAuth/account/session DDL. Covers provider/verifier codec compatibility, wrong proof/state, expiry, simultaneous claims/replay, canonical identity, real standard session helper/cookie attributes and no session in JSON.
- Targeted ESLint and TypeScript pass; Next production build passes with a build-only local-unreachable database URL. Android assembleDebug/lintDebug pass; APK signatures and package/version checked separately.
- Synthetic 390×844 browser verification reduces viewport to 390×390 with an address input focused: field and result remain visible, map hides, no page exceptions, destination preserved after restoring height. This simulates available viewport; it is not a physical IME test.
- No real Google account was used to claim a native end-to-end device success. Owner must install APK 0.3.0, start Google FROM THE APP, complete provider login, tap Return to app if necessary, verify account in the APK (no browser address bar), then close/reopen. Test keyboard on the device without confirming a real booking.

Both server and APK 0.3.0 are required for this flow. APK 0.2.0 stays browser-only. Google Play publication, native push and production signing remain separate work.
