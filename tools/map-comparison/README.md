# Isolated map comparison

Development-only comparison of OpenFreeMap Liberty/Bright/Positron/Dark/Fiord and the current passenger MapTiler presets. No application routes, settings, database records or live provider selections are changed.

Run from the repository root:

```sh
python tools/map-comparison/serve.py
```

Open http://127.0.0.1:8765. The loopback-only server serves MapLibre from installed node_modules, the existing car image, and reads the public production map configuration in memory. It does not log URLs or write configuration to disk. The browser receives the same browser-visible map configuration used by the passenger app; no server credential is requested or embedded in source/artifacts. MapTiler may reject localhost because its existing key is restricted to the application origin. OpenFreeMap needs no key for the tested styles. No origin restriction is modified.

Browser verification uses a request-intercepted synthetic page under the application's origin, solely in the local test browser. Only the HTML/JS/CSS/car/config fixture paths are fulfilled. There is no published preview route, session, booking, vehicle feed, send or payment request. External map style/font/sprite/tile reads are real. The inherited network proxy and certificate verification remain enabled.

```sh
PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs \
MAP_COMPARISON_OUTPUT=/tmp/nac-map-comparison \
node tools/map-comparison/check.mjs
```

The test requires Playwright and Chromium, and the server above. Use CHROMIUM_PATH to override /usr/bin/chromium. HTTP proxy settings are inherited. Test checks all five OpenFreeMap styles, route restoration after style changes, synchronized camera, and screenshots at desktop and mobile viewport sizes. Synthetic positions and a schematic route are used; the route is not routing-engine output. GPS is not requested.

Do not interpret one headless desktop run as a mobile performance benchmark. Rendering timings vary with cache, network and GPU. Physical Android testing, endpoint availability over the customer's network, POI completeness, service terms/capacity and a staging integration with the actual booking component remain to be assessed before switching production. Self-hosted geocoding/routing is outside this preview.
