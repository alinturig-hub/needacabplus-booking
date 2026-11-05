# Need A Cab Plus — Android testing 0.3.0

Package `app.needacabplus.passenger.testing`, versionCode 3, Android API 23+ with current WebView. The app loads https://webapp.needacabplus.app. This is a testing binary connected to the LIVE backend: confirming a booking can create a real reservation. No automated booking or notification is run by the build.

## Google return

The app generates an independent PKCE verifier and state, stores them in app-private preferences, and opens the whole Google flow in the system browser. The existing server callback validates Google and issues a 60-second one-use grant bound to that verifier/state. The return page uses a package-pinned Android intent (with a visible Return to app button if automatic launch is blocked). Native code checks its pending state, exchanges the grant over HTTPS, installs only the ordinary HttpOnly customer-session cookie through CookieManager, and reloads the passenger homepage. No Google/session token is in the intent, JSON or JavaScript. Return intents are intercepted before Capacitor sees their data. Wrong, expired or reused grants fail closed; unknown outcomes are not retried automatically.

The server reuses the existing ephemeral OAuth state store with a separate versioned provider namespace. No database migration, Firebase setup, Google Android SDK/client or Meta credential is needed. Existing browser-only OAuth stays supported. The native handoff in this version is Google-only; Apple remains browser-only. No native push is implemented.

## Keyboard and system bars

System-bar/cutout margins are forced. On Android 11+ the WebView applies the greater of system and IME bottom insets to resize above the keyboard; older Android uses adjustResize. Web address search uses the visual viewport and prioritizes fields/results while typing, preserving entered addresses on keyboard close.

## Build and install

Requires Node 22+, JDK 21 and Android SDK 35/build tools. From `mobile`: `npm ci`, `node scripts/check-config.mjs`, `npx cap sync android`, then `cd android && ./gradlew --no-daemon :app:assembleDebug :app:lintDebug`.

Install the debug APK over the previous test app (same package/signing key); no uninstall is needed. New signing keys require uninstall and lose local app data. Signing keys, SDK paths and APKs stay out of Git. Google Play signing/publication is a separate release.

## Owner device check

1. Install 0.3.0 and start Google sign-in FROM THE APP. Complete Google in the browser; tap Return to app if it does not open automatically. Confirm that the APK homepage shows the signed-in account without a browser address bar.
2. Close/reopen and verify session persistence; check app sign-out. Test cancelling Google, an expired return and repeat tapping without a booking.
3. Enter a destination with the keyboard visible. Check results, scrolling and preservation of pickup/destination when hiding the keyboard, in light/dark themes.
4. Check GPS permission, precise/approximate/manual pickup, back navigation and connection recovery. Do not confirm a real booking as part of the smoke test.

No physical-device or real-Google-account success is claimed until the owner performs this test. Local native build/signature and synthetic server/browser protocol tests are recorded separately.
