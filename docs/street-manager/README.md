# Street Manager open-data receiver

Implemented route: `POST /api/webhooks/street-manager`.
Proposed public endpoint after deployment: `https://webhook.needacabplus.app/api/webhooks/street-manager`.
This change is prepared in development, not deployed, registered or subscribed.

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
- Persist all subscribed official events initially. Plymouth/authority filtering and mapping are downstream work; no authority SWA code is guessed.
- Append delayed events without overwriting a latest-state projection. Future projections must order by event_time and handle equal-time/reverted/cancelled events explicitly.

WKT strings such as POINT/LINESTRING are retained as source geometry, not incorrectly treated as GeoJSON longitude/latitude. Confirm the source CRS before converting (the documented examples use British grid-style coordinates). Section 58 is a restriction on subsequent street works, not automatically a current road closure. Null *_time remains unspecified; it is not converted to midnight. This receiver does not modify route calculation, booking ETAs, live car displays or notifications.

## Schema and runtime grants (not executed)

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
