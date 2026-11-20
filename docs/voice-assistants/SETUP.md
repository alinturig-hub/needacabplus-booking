# Siri and Android assistant entry — preview

The shared entry is https://webapp.needacabplus.app/voice-booking . It uses the
existing guest conversation and direct Autocab cash quotes. The browser adapter
always forces preview: it cannot dispatch a taxi, including when Alexa is live.
It does not use Plus prices, subscriptions, discounts, card payments or account
linking. API requests use an origin-checked, signed HttpOnly guest cookie with
per-IP/global limits. Guest state remains in PostgreSQL under the existing voice
retention. Location is an explicit browser permission and is never inferred from IP.

This is an assistant-launched booking screen. It does not make Siri, Gemini,
Google Assistant or Bixby host the complete conversation. Users confirm addresses,
contact details and the Autocab fare in the screen. Browser dictation/read-aloud
are optional; mobile keyboard dictation remains available when Web Speech is not.

## Siri — usable without an iPhone app

No native iOS project was found in the connected repository. Create this personal
shortcut on the iPhone in Apple's **Shortcuts** app:

1. Add a new shortcut named **Need A Cab taxi**.
2. Add the **URL** action with `https://webapp.needacabplus.app/voice-booking`.
3. Add **Open URLs** using that URL. Save.
4. Say **Hey Siri, Need A Cab taxi**. The screen opens; tap Start booking or Use
   current location, then answer its questions. Review dictated text before Send.

A generic shortcut name such as Book me a taxi may conflict with platform routing;
verify the chosen phrase on the device. An installable native App Intent requires
an actual iOS target, Apple signing and Xcode testing. This change does not claim
a compiled iPhone app or provide an unsigned .shortcut file as installable.

## Android test app 0.5.0

Install the updated test APK (same testing package/certificate as 0.4.0). Long-press
**Need A Cab Plus Test** and choose **Book a taxi**. It opens the shared preview.

The app declares `actions.intent.OPEN_APP_FEATURE` for the Book a taxi feature,
using the Shortcuts XML framework and a fixed allowlisted deep link. Assistant
invocation depends on Google Play/App Actions registration, locale and the device's
assistant. It has not been verified on an actual Google/Gemini device in this task.
Do not promise the global "Hey Google, book me a taxi" phrase. Existing dedicated
CREATE_TAXI_RESERVATION App Actions were deprecated in the February 2024 streamlining.

The deterministic Android entry can be tested with:

```sh
adb shell am start -a android.intent.action.VIEW -d 'needacabplus-test://booking/voice' app.needacabplus.passenger.testing
```

This URL has no parameters and never confirms or dispatches a job. The new route
is isolated from the existing native Google sign-in return handler.

Bixby capsule/marketplace integration remains a separate task. Merely launching
the Android app from Bixby is not a completed Bixby booking integration.

## Validation limits

The Android test build and deep-link unit test can be verified locally. Actual
assistant phrase matching, device GPS permissions, Siri Shortcut installation and
store distribution require owner/device testing. Local browser UI tests mock
conversation responses; backend tests verify cookie/origin/rate/mode boundaries.
No real booking or driver message is sent by this implementation or its checks.

Official references:
- https://developer.apple.com/guide/shortcuts/welcome/ios
- https://developer.apple.com/documentation/appintents
- https://developer.android.com/reference/app-actions/built-in-intents/common/open-app-feature
- https://developer.android.com/develop/devices/assistant/action-schema
