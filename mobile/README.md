# Android testing APK — Need A Cab Plus

A Capacitor 7 Android shell for `https://webapp.needacabplus.app`, isolated from the web application's build and dependencies. No production deployment or server changes are required.

- Label: **Need A Cab Plus Test**
- Package: `app.needacabplus.passenger.testing`
- Version: `0.2.0-testing` (code 2)
- Android 6.0 / API 23 or later, target API 35.
- HTTPS only, no wildcard in-WebView navigation, no mixed content or WebView debugging. App backup disabled.
- Foreground coarse/fine location only; Capacitor requests Android permission when the website asks for GPS. Location permission is restricted to the exact passenger HTTPS origin. No background location.
- Uses the existing passenger website and first-party account session; it does not copy credentials into native storage. The same account can sign in, but a browser session is not automatically shared with the APK.
- External links use the device browser/appropriate app. No OAuth/native payment handoff is claimed; use existing phone/password login for the first device smoke test.
- No push token registration, Firebase setup, background tracking, native booking-origin proof or SMS/WhatsApp policy changes in this build. Those require an explicit backend integration, not a User-Agent flag.

## Important test boundary

This is a **testing binary connected to the live web application**, not a sandbox booking backend. Booking confirmation can create a real reservation; do not confirm a booking during the initial installation/GPS/login test. No automated booking or message is performed by the build. Existing live service policy still applies.

## Build

Requires Node 22+, JDK 21, Android SDK platform 35 and build tools (Gradle may select 34.0.0). The Gradle wrapper downloads its pinned version. Install SDK components and accept the Android SDK licenses in your development environment. Local SDK paths and signing keys must remain untracked.

```sh
cd mobile
npm ci
node scripts/check-config.mjs
npx cap sync android
cd android
./gradlew --no-daemon :app:assembleDebug :app:lintDebug
```

Output: `mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Gradle signs it with the local **debug** key; this is not the Google Play signing identity. Keep the same local test key for installable upgrades or uninstall the previous test app first. The production Play application ID/signing/AAB release process will be established separately.

## Install and device smoke test

1. Download the APK on Android and open it. Allow installation from that download app if Android asks; you can revoke that permission after installation. Alternatively: `adb install -r app-debug.apk`.
2. Open **Need A Cab Plus Test**, check layout, light/dark theme, keyboard and Android back navigation.
3. Sign in with an existing customer account using phone/password. Close/reopen and verify session persistence. Check sign-out.
4. Tap current location, grant **While using the app** and choose precise location if available. Confirm the displayed pickup; test denied permission/manual address too. Accuracy depends on the device and environment, not a guaranteed one metre.
5. Search pickup, destination and via, inspect the map, and request a quote only if desired. Do not confirm a real booking as part of this smoke test.
6. Disable the network and reopen; verify the connection screen and retry after reconnecting.

No device/emulator smoke test is claimed until one is actually run. Push delivery, OAuth handoff, native wallets, app links, accessible/native offline UX and Play policy/target SDK requirements need separate validation before release. Remote-server loading is appropriate for this first internal test; review a bundled frontend/native integration before a Play submission.

Version 0.2.0 forces Android system-bar/cutout margins so web content does not overlap the clock, battery or navigation bar. Install over the previous APK using the same package and test signing key. Native Google return/session exchange remains unimplemented.

OAuth start links now open in the system browser before creating any OAuth cookie in the WebView. Browser sign-in remains in that browser; this avoids mixing browser/WebView cookie jars but does not transfer the session back to the APK. Phone sign-in remains the in-app test path.
