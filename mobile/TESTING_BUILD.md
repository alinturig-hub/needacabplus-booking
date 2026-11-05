# Android testing 0.4.0

Install over the existing testing APK; same package and signing certificate, versionCode 4.
Loads the current live https://webapp.needacabplus.app, rather than a bundled offline copy.
Reviewed web baseline: 2e1ce5dd22bc1f30f347a01561ebf351842f52aa.
First-open GPS, guest map centring/zoom/marker and dark fallback are implemented in that web baseline.
Native Google return, origin-restricted geolocation permission handling and keyboard/system insets are retained.

Verification: six GPS/theme unit tests PASS; isolated real-component browser GPS/guest/dark test PASS; capacitor configuration check PASS; assembleDebug and lintDebug PASS; APK v1/v2 signatures PASS and certificate matches v3.
Physical Android GPS permission, real Google completion and keyboard behaviour still require owner device verification.
This APK connects to the live booking backend. Avoid confirming a real booking during UI testing.
No web deployment, production configuration change, booking creation or message sending performed.

APK SHA-256: c6455f73cfec9b98d2133cb5994017d16a6955a88f40f4f7f937bd9df7b7ef66
