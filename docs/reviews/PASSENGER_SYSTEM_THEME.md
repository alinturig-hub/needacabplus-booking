# Passenger theme and map proportions

Default theme follows prefers-color-scheme; explicitly saved light/dark preferences remain respected. The existing media listener follows phone theme changes. Initial GPS camera minimum zoom changes from 15.5 to 16.5; this is an approximation from the reference screenshot, not a claim to know Bolt's camera configuration. Route fitting remains unchanged.

Mobile home action symbols shrink from 24 to 20px with a 36px tile, while tap targets remain unchanged. Car images shrink from 34x50 to 27x40px.

For the standard streets-v4 light/dark configuration, the map config response selects MapTiler basic-v2 and basic-v2-dark. Custom administrator styles remain unchanged. No saved settings or database records are edited. Both style documents returned HTTP 200 during read-only provider verification, using the existing origin and configuration; query values are not logged. These are MapTiler designs, not Google tiles.

Nine unit tests passed; real-component browser test passed GPS centring at zoom 16.5, dark fallback with identical configured URLs, and system dark/light/dark changes. Targeted ESLint and full TypeScript passed. Physical Android behaviour is not verified. Changes are prepared locally and not deployed by this step.
