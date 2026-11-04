# API workspace

Overview keeps the integration summary and endpoint groups. Connections store a service origin and authentication once; endpoints inherit those credentials. The main endpoint form asks for connection, name, method and path. Authentication headers, action keys, descriptions and request JSON are under Advanced. New well-known endpoints receive the existing consumer action keys automatically; editing preserves the saved key.

The endpoint list uses the full width with Edit, Test and Enabled controls. Tests only execute enabled GET endpoints. POST/PUT/PATCH/DELETE are never sent from the generic test screen. Saving configuration does not create bookings, promotions or rewards. A connection with endpoints cannot be deleted; move its endpoints first.

## Existing configuration normalization

Production startup runs `scripts/normalize-api-connections.mjs` once. This uses the application's existing configuration-table grants, not schema-owner privileges. A transaction, advisory lock and table locks serialize the change. A full snapshot of the original connections and endpoints is retained with provider `autocab-archive-v1`: keys stay encrypted, copied endpoints are disabled, and the active API catalog/consumers exclude that provider. Connection snapshot names contain the original ID/name plus the surviving canonical connection ID; endpoint snapshot names preserve original ID/name/enabled state. No booking, customer, fleet or registry-writer data is modified.

Only connections with identical origins and decrypted authentication can share a connection. Header names compare case-insensitively; different/unreadable credentials or duplicate action keys stay separate. Origins become HTTPS service roots, and resolved endpoint paths retain the same effective request URLs, IDs, keys, methods, bodies and enabled states. Existing Autocab history import connection IDs resolve through the snapshot's canonical ID, including after future key updates. The original encrypted configuration is retained for operator-led recovery; restoring an older snapshot must account for any subsequent edits.

A failure rolls back the entire change and startup logs a non-secret status, leaving the previous configuration usable. The archive marker makes rolling restarts idempotent. No new database schema or public credential-reading endpoint is added.

## Validation

- `node --test tests/api-workspace-normalization.test.mjs tests/autocab-history-import.test.mjs`
- `npx tsx --test tests/api-workspace-policy.test.ts`
- `node tests/api-workspace-browser.mjs` uses actual components and synthetic API responses in Chromium. Covers basic/advanced forms, blank-key retention, URL preview, stable action keys, GET-only tests, enable toggle and mobile overflow.
- TypeScript, ESLint and production Next build.

Browser validation does not send real messages, create promotions, dispatch jobs or expose stored credentials.
