# Isolated Notifications v2 staging

This is a dedicated protocol lab, **not** the live eBooker, passenger app, operator inbox or a production booking environment. Two separately deployed roles exercise the actual NeedACab Plus and pinned TaxiCRM v2 handler modules through HTTPS. Full Next applications, production databases, scheduled workers and provider transports are not started by this image.

## Isolation

- `STAGING_NO_SEND=true` and exact staging workspace are required at startup.
- Presence of production database/provider credentials aborts startup.
- Only `/health`, signed staging control and the role's v2 preview route exist. Send endpoints return 404.
- All network fetches are restricted to the peer NAC context-preview URL. Meta, SMS and unexpected destinations are forbidden before network I/O.
- CRM modules are generated verbatim with `scripts/sync-notifications-staging.py`; source hashes are recorded. They remain reviewed under TaxiCRM PR8; changes must be resynchronized and parity checked.
- Per-role named volumes contain SQLite WAL data: synthetic fixture selection, operator revision, nonce IDs and counters. No canonical booking table or real customer messages exist there.
- Nonces use primary-key uniqueness, ten-minute retention, durable transactions and full synchronous writes. Existing HMAC rejects signatures older than five minutes. This lab does not replace production PostgreSQL replay storage or prove the production conversation advisory-lock barrier.
- Newly generated staging service/control keys are stored as runtime-only Coolify variables. Never copy production environment variables or Meta tokens into the lab. No credentials belong in Git or reports.
- Auto-deployment is disabled. Builds are pinned to a reviewed development commit and use only the staging Dockerfile; the production Dockerfile is unchanged.

## Local verification

Node 24 is required for the staged executable. The application repository's development dependencies build the small server bundle:

```sh
node_modules/.bin/esbuild staging/notifications/server.ts --bundle --platform=node --format=esm --outfile=/tmp/notifications-stage-server.mjs --external:node:*
NOTIFICATIONS_STAGE_BUNDLE=/tmp/notifications-stage-server.mjs npx tsx --test tests/notifications-staging.test.ts
python3 scripts/sync-notifications-staging.py /path/to/taxicrm --check
```

The tests verify nonce persistence across independent connections and reopen, then launch the actual compiled NAC role, authenticate a request, restart the process and verify that replay is still rejected with persistent storage identity unchanged. No provider transport or production configuration is used.

## Remote verification

The owner-authorized lab is deployed to the separate `notifications-v2-staging` environment in Coolify. Both roles require HTTPS with certificate verification and distinct identities for each request direction. A separate signed control identity selects a predefined synthetic scenario; it cannot supply arbitrary bookings, customer values or provider commands.

The private test configuration is selected via `NOTIFICATIONS_STAGE_CONFIG`; the file contents are never printed. It contains only fresh staging identities and role targets. Run:

```sh
NODE_USE_ENV_PROXY=1 NOTIFICATIONS_STAGE_CONFIG=/secure/path/staging.private.json NOTIFICATIONS_STAGE_ARTIFACTS=/path/to/artifacts npx tsx staging/notifications/check.ts
```

`NODE_USE_ENV_PROXY` is for this managed execution environment's outbound proxy. It does not disable certificate checking.

The matrix covers 44 combinations of two events and 22 scenarios/variants, including text/template, app-account selection, suppressions, duplicate/stale/expired events, cancellation after intent, takeover during the RPC, UNKNOWN without fallback, confirmed-unavailability SMS candidates, named mappings, missing/synthetic dynamic links, required interactive refusal, rendered limits and existing sender adapter limits. Outputs are decisions only. SMS candidates are **not SMS sends**.

Durability verification is separate:

1. Run the same command with `--before-restart`. It stores private signed replay checkpoints beside the private configuration file (outside the public artifacts directory), plus persistent store instance IDs.
2. Restart **only the two named staging resources** through Coolify. Do not restart production applications, databases or shared infrastructure.
3. Run with `--after-restart` within four minutes. Both old signatures must still be inside their validity window; replay must return 401 and fresh requests must succeed with the same persistent store instance IDs.

Reports exclude keys/signatures, raw requests and actual customer data. Restart checkpoint packets remain private and must never be committed or attached as artifacts.

## Remaining limits

This validates deployed protocol modules, HTTPS routing, the synthetic fixture policy and durable staging anti-replay. It does not validate real canonical account/grant resolution, Meta catalog approval/fingerprint normalization, secure live link issuance, real provider delivery, full Next middleware routing or production PostgreSQL handoff/dispatch races. Those remain separate stages before an explicitly approved controlled real send. The live Meta webhook and single TaxiCRM sender remain unchanged.

## Recorded remote result — 2026-11-04

- NAC role health: https://g0hxzyhvzlogdilcr04jmieq.144.76.63.11.sslip.io/health
- CRM role health: https://n44gnzeyv0v2viz3j7ivswpu.144.76.63.11.sslip.io/health
- Both resources report healthy, DRY_RUN and provider_enabled=false.
- 44 HTTPS cases passed; 44 replay attempts were rejected, no provider calls or forbidden egress occurred.
- Both Coolify restart jobs finished; old signed requests were rejected within their validity window and fresh requests retained the same persistent storage identities.
- Dedicated environment and per-role volume metadata were audited; no production database/provider credentials were present. Production NeedACab Plus and TaxiCRM were checked read-only and remained healthy.
- The first image's platform health probe required curl/wget; the final pinned image includes curl for Coolify compatibility and also has a native Node image healthcheck. No production image was changed.

Sanitized evidence: `docs/notifications/evidence/remote-staging-20261104.json`. Public reports contain no signatures or credential values; private restart checkpoint packets were removed after verification. The private staging configuration remains outside Git for authorized reruns.
