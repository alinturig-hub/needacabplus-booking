# Android testing 0.3.0 verification

Package app.needacabplus.passenger.testing, versionCode 3. assembleDebug/lintDebug passed. APK signature v1/v2 verifies. The signer remains f595f4f43bacd8a3702def3d522db01e1ebc948ae5ce5eff30456d4d38d9665c, compatible with existing testing installs.

APK SHA-256: 34efdf40a8feb8e4b24b9f39237a85906a4641e62e6cb6c9882b64148b849eac.

Google return uses private app PKCE/state, a package-pinned return intent, one-use server exchange, then native CookieManager installation of the normal HttpOnly session. No session token travels through intents/JavaScript. Native system and IME insets resize above the keyboard on Android 11+; older versions use adjustResize.

Synthetic backend/browser tests are recorded in docs/passenger/NATIVE_GOOGLE_RETURN.md on the corresponding web branch. No physical-device real Google completion or IME result is claimed. Owner must install 0.3.0 over 0.2.0 and start Google again FROM THE APP. Both server and 0.3.0 are required.

This testing binary connects to the LIVE web backend. Do not confirm real bookings during the smoke test. No push or Google Play release is included.
