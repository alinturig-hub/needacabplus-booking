# Street Manager open-data receiver

Implemented route: `POST /api/webhooks/street-manager`.
Public endpoint: `https://webhook.needacabplus.app/api/webhooks/street-manager`.
The endpoint is live and all three production SNS subscriptions are confirmed.

## Source contracts

- https://department-for-transport-streetmanager.github.io/street-manager-docs/open-data/
- https://department-for-transport-streetmanager.github.io/street-manager-docs/api-documentation/json/event-notifier-message.json
- Registration: https://www.gov.uk/guidance/find-and-use-roadworks-data

Street Manager pushes production events using AWS SNS; this is not a polling API and there is no Street Manager API key needed by this receiver. DfT registration/terms acceptance is required separately. The documented confirmation token lasts three days. Public HTTPS must be reachable by SNS; any edge firewall must allow the relevant AWS source addresses without weakening signature checks.

## Processing

- Accept SNS JSON envelopes delivered as text/plain as well as application/json, bounded to 300,000 bytes.
- Strict allowlist for the documented activity/permit/section-58 production topics in AWS account 287813576808, eu-west-2.
- SNS signing versions 1 (RSA/SHA1) and 2 (RSA/SHA256), including optional Subject and confirmation canonical fields.
- Certificate retrieval restricted to HTTPS sns.eu-west-2.amazonaws.com/SimpleNotificationService-*.pem, with verified transport, no redirects, 5s deadline, 16KiB limit, RSA/validity checks and a bounded in-memory cache. Request fields never select arbitrary hosts.
- Confirmation uses the verified token/topic to construct the AWS ConfirmSubscription request, rather than following a supplied URL. No client registration, message send, unsubscribe request or other AWS operation is performed.
- Check the subscription table exists before confirmation; record returned subscription ARN. UnsubscribeConfirmation is authenticated but does not auto-resubscribe.
- Verify first, then validate the documented event core while retaining unknown fields for forward compatibility. Store full event JSON and source UTC timestamps.
- Acknowledge notifications only after successful durable INSERT; duplicates are ignored by both (topic,message_id) and (topic,event_reference). Storage failures and temporary certificate/confirmation failures return 503 so SNS can retry. Bad envelopes/signatures return 400/403.
- After signature and event validation, persist only events whose object_data.highway_authority_swa_code is 1160 (Plymouth City Council), verified against production receipts on 2026-11-09. Town text and nearby Devon addresses do not qualify. Missing/other codes are acknowledged with 200 and ignored without a database write; the documented event contract requires this authority code. Confirmation handling remains unchanged for all three topics.
- Historical national rows are retained; the admin status totals and topic counts use the same Plymouth authority filter. This does not add a map overlay or alter routing.
- Append delayed events without overwriting a latest-state projection. Future projections must order by event_time and handle equal-time/reverted/cancelled events explicitly.

WKT strings such as POINT/LINESTRING are retained as source geometry, not incorrectly treated as GeoJSON longitude/latitude. Confirm the source CRS before converting (the documented examples use British grid-style coordinates). Section 58 is a restriction on subsequent street works, not automatically a current road closure. Null *_time remains unspecified; it is not converted to midnight. This receiver does not modify route calculation, booking ETAs, live car displays or notifications.

## Schema and runtime grants

Apply `scripts/migrations/20261108_street_manager_inbox.sql` to the approved database with the schema-owner connection. Do not use a migration-wide runtime owner or print connection secrets.

```sh
psql "$MIGRATION_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/20261108_street_manager_inbox.sql
```

Then, with the approved actual runtime role name supplied as psql variable runtime_role:

```sql
GRANT SELECT, INSERT ON street_manager_events TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE ON street_manager_subscriptions TO :"runtime_role";
```

No sequence grants are needed. Schema USAGE must already be granted to the runtime role according to deployment policy. Keep these tables out of anonymous/customer grants. Define retention/capacity before subscribing to the national feed; no periodic cleanup or map worker is included here. Do not add the migration to automatic app startup without review.

## Verification and launch

```sh
npx tsx --test tests/street-manager.test.ts
npx eslint lib/street-manager/sns.ts app/api/webhooks/street-manager/route.ts tests/street-manager.test.ts
npx prisma generate
npx tsc --noEmit
DATABASE_URL=postgresql://synthetic:synthetic@127.0.0.1:1/synthetic npx next build --webpack
```

Tests use synthetic RSA keys/certificate and isolated embedded PostgreSQL (PGlite); no production database, real SNS subscription, messages or credentials. Covers valid/tampered signatures, topic/certificate-host restrictions, confirmation URL construction, payload limit, route failure without durable storage, schema replay, duplicate delivery and out-of-order persistence. They do not establish real AWS delivery or multi-client PostgreSQL performance.

After schema/grant review and deployment, register the exact HTTPS URL with DfT. Observe signed SubscriptionConfirmation for each desired topic, verify ARN storage, then test real notification receipt and duplicate delivery without changing production bookings. Monitor fixed outcome codes/HTTP status and receipt counts; do not log raw request bodies, signatures, tokens, confirmation URLs or database credentials. If the confirmation succeeds upstream but its response/storage fails, treat local subscription state as unconfirmed and reconcile it with DfT/AWS; this is not a fully transactional cross-service operation.

## Temporary map preview

`/roadworks-preview/<capability>` and its read-only JSON endpoint `/api/street-manager/preview/<capability>` show only Plymouth public roadworks fields. A random 256-bit capability is checked against a server-side SHA-256 digest and a fixed 48-hour expiry in `preview-access.ts`; rotate the digest to revoke the link. No admin session access is granted. Both invalid and expired capabilities return 404 before querying the database. The page is noindex and uses no-referrer; JSON responses are private/no-store.

The page refreshes our stored receipts every minute; it does not poll DfT. It selects the latest source timestamp per object type/reference, retains cancellations in the list, flags equal-time ambiguity and reverted work updates, and lists missing/invalid geometry without inventing a position. This is a preview of received notifications, not a full initial inventory or a routing input. Permit records for the same work can still have separate references. Section 58 does not imply a road closure.

BNG EPSG:27700 GeoJSON/WKT points, lines and areas are converted to WGS84 with the standard seven-parameter Helmert transform (approximate map positions, not survey-grade OSTN15). Unknown payload fields and SNS envelopes are never returned. Missing source times remain unspecified; dates and timestamps are labelled separately and displayed in Europe/London.

Preview checks: `npx tsx --test tests/street-manager.test.ts tests/street-manager-preview.test.ts`. Browser verification covers map loading, list/marker selection, search, filters and mobile layout; synthetic fixtures are explicitly labelled in local screenshots.

## Driver closure warnings

The prepared detector is driven by stored Autocab tracking webhooks and current Street Manager snapshots. It does not poll either provider. `GET /api/admin/street-manager/driver-alerts` is an authenticated, read-only plan showing active closure/eligible driver counts and candidate messages; it never sends or reserves a message. The internal worker requires `x-booking-writer-secret` and the existing `BOOKING_WRITER_JOB_SECRET`. `ROAD_CLOSURE_ALERTS_MODE` defaults to `off`; `observe` evaluates without writes/sends, and `live` enables attempts only after a configured transport is available.

Eligibility is conservative:

- Plymouth authority 1160; latest source event per work reference (or object reference), so a cancelled replacement permit suppresses the older snapshot. Reverted/equal-time ambiguous updates and Section 58 are excluded.
- A permit must be reported in progress, have an actual start (or WORK_START), report road-closure traffic management, and be within its current window. Explicit current management overrides the proposed management. A future proposed clock narrows the window; it cannot start a planned permit. End date without a supplied clock includes the London calendar day; this is not presented as an exact reopening time. No end bound means no alert. Activities require explicit start/end clocks.
- Current canonical driver/vehicle pairing, active correlated shift, neither suspended/archived, and a committed matching GPS fix no older than 90 seconds and no more than 5 seconds ahead of server time. Two fixes on the same driver/vehicle must show at least 10 m of approach. Implausible movement above 180 km/h is discarded.
- Within 300 m of the actual converted point/segment/polygon, including polygon holes. This is proximity, not a route or a statement that the driver's chosen road is blocked. The nearest qualifying closure per driver is considered. Example wording: `North Rd West is reported closed nearby.`

The worker rechecks status, time, GPS and driver identity immediately before each reservation. Unique `(driver_id,closure_key,alert_day)` prevents repeats for the same USRN/street per London day. A transactional driver clock enforces a two-minute gap across different closures. A PostgreSQL advisory lock prevents overlapping workers. Up to three candidates are attempted per pass. Provider 2xx means accepted, not verified delivery/read in Driver Companion. Timeout/5xx/crash outcomes are not automatically replayed because an unconfirmed provider write could already have delivered the message. `SENDING` rows after a crash require reconciliation; no expiry retries them.

### Transport contract required before activation

The live configuration audit on 2026-11-09 found fresh identified tracking positions but no saved message/Companion endpoint. No driver message has been sent or API payload guessed. A documented POST endpoint and recipient/payload contract are still required. The transport adapter uses an explicitly configured API action `driver.road-closure-message` on an Autocab connection. Its request example is an exact JSON template containing one `{{driverId}}` (string) or `{{driverId:number}}` (numeric ID) and one `{{message}}`. This is a mapping contract, not a proposed Autocab request schema. Verify the real API's recipient semantics, required fields and acceptance/error response before enabling it. Only same-origin HTTPS POST and configured authenticated connections are accepted; redirects are rejected. Do not paste API keys into chat or logs.

Before setting live mode, apply `scripts/migrations/20261109_road_closure_alerts.sql` as the schema owner and grant the approved runtime role SELECT/INSERT/UPDATE on `street_manager_driver_alert_clock` and `street_manager_driver_alerts`. This migration is prepared and tested, not automatically applied at startup. Live mode must not be enabled without these tables and the verified transport. No WhatsApp/SMS settings are changed.

Checks: `npx tsx --test tests/street-manager-alerts.test.ts tests/street-manager.test.ts tests/street-manager-preview.test.ts`. Tests use synthetic data and isolated embedded PostgreSQL; they do not establish real Driver Companion delivery.
