# First-open location and guest dark map

Requests browser location on the customer login screen, sharing the pending request and short-lived in-memory result with the guest booking screen. Guest navigation does not wait for GPS. Once available, the guest map shows the location marker, centres on it and zooms to street level (15.5 minimum), with a mobile offset to keep the point above the booking panel.

Coordinates are not persisted by the new helper or sent to reverse geocoding on startup. Pickup address selection/confirmation remains explicit. A restored journey or manually chosen pickup is not replaced by an arriving automatic camera target. Denial, timeout, unsupported APIs, invalid coordinates and synchronous browser failures leave manual booking available. A failed/denied startup attempt is not automatically repeated in the same tab session; the existing explicit location buttons remain available. Browser/OS permissions still govern whether a native prompt can appear; a previously blocked site must be re-enabled in browser settings.

New customer login and booking visits default to dark when there is no saved preference; existing light/system preferences remain respected. Other application pages keep their prior default. The OSM fallback is dark from its initial style, so it does not flash light while loading. A configured dark MapTiler URL can be used even without a light URL; missing/failed styles fall back to the matching OSM theme. Routes are restored after style changes. No new map provider is added.

Validation:

- Six unit tests passed: shared GPS request/cache, denial, timeout/throw/invalid coordinates, unsupported geolocation, initial fallback paint and independently configured dark style.
- Isolated browser test with the actual login and booking components, native Playwright GPS and synthetic API responses passed: initial request, Continue as Guest, GPS marker, target coordinates, zoom, single shared GPS request, initial dark paint. Only the intercepted synthetic guest-auth POST occurred; no booking/payment/SMS/provider writes.
- TypeScript and targeted ESLint passed.
- Next production build passed with synthetic unreachable database configuration using `next build --webpack`. Default Turbopack cannot follow the development worktree's external node_modules symlink; that local tooling failure was not an application compile failure. Webpack completed compilation, type checking and page generation.

Run `npx tsx --test tests/browser-location.test.ts tests/browser-map-style.test.ts` and `node tests/guest-location-browser.mjs` (review tooling Playwright/Chromium required). Browser test aliases Next navigation and intercepts all APIs; it does not establish a live guest session, physical-device GPS permission behaviour or actual tile-provider availability. OSM tile requests are blocked in the test; dark styling is checked from the actual map initialization paint, not claimed as a live map-provider screenshot.

No database migration, send-flag change or deployment performed. Real Safari/Android permission checks and live tile visibility remain post-release verification.
