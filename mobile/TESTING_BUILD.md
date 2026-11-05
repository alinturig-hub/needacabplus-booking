# Android 0.2.0 testing build

Package app.needacabplus.passenger.testing, versionCode 2. assembleDebug and lintDebug passed; apksigner verifies v1/v2 signatures. Certificate SHA-256 f595f4f43bacd8a3702def3d522db01e1ebc948ae5ce5eff30456d4d38d9665c matches version 0.1.0.

APK SHA-256: 198de129ec2fb582cf48db0a8cac2391978ade91b75d9df0138d91d43512dede.

Forces system-bar/cutout margins and opens entire OAuth start flow in the system browser. Browser session is not transferred to the app. Native Google handoff and push remain unimplemented. The remote web backend is live: confirming a booking can create a real reservation.

No physical device/emulator test was performed. Check system-bar clearance, keyboard, back navigation, GPS, phone sign-in and upgrade/session persistence on the owner's device. No real Google account, booking or message was used by this build.
