# Test build verification

Build: assembleDebug and lintDebug passed. APK signatures v1/v2 verified using apksigner.
Passenger HTTPS GET returned 200. No customer data, booking or message was submitted.

Artifact SHA-256: `05eaafe4c04f0d6353d926d0a22e83b7cdcd55d960aa2cb40d50a1f632efe7c9`

Package: `app.needacabplus.passenger.testing`; version: `0.1.0-testing`.
Native push and mobile booking-origin proof are not implemented. The binary uses the live web backend, not a booking sandbox.

No device/emulator was available: login, permission prompts, GPS accuracy, maps, back navigation, theme and offline recovery still need the device smoke test in README.md.

Android Lint: 0 errors; 19 warnings (generated template resources, SDK/library updates, manifest ordering and backup-rule guidance). Review these before a release build.
