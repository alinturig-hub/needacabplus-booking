# Foreground live GPS

Booking view starts a high-accuracy watchPosition subscription after the initial location request succeeds. maximumAge is zero; the explicit pickup location button also requests a new fix. Login-to-guest in-memory handoff is at most five seconds, not two minutes. Nothing is persisted or reverse-geocoded on every update.

The watch stops while the document is hidden and resumes when visible, and is cleared on unmount. Generation checks ignore callbacks from a stopped watch. Failed/invalid fixes hide the current-location marker until a valid fix arrives. The confirmed pickup is stored independently and does not follow GPS. Initial automatic camera targeting/framing runs once, rather than repeatedly overriding user gestures as GPS coordinates move.

Validation: five initial/live GPS unit tests, including high-accuracy/zero-age options, successive positions, hide/resume/cleanup, obsolete callback rejection and error handling. Actual-component browser checks initial GPS/guest map, attribution, inline editing and modal dismissal. Repeated explicit getCurrentPosition responses are synthetic fixtures to keep UI tests independent of headless geolocation caching/timeout behaviour; these do not establish real-device fresh GPS quality. Production webpack build passed. Physical Android foreground/background return and indoor precision need device verification. Frequency and accuracy are controlled by the OS and receiver; no 1m accuracy or one-update-per-second guarantee is made.

This does not diagnose the reported McDonald's by guessing a branch. Venue database coverage and the exact phone coordinates still require the branch/address supplied by the owner.
