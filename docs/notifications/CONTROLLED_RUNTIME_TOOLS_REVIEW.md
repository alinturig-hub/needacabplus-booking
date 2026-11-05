# Runtime tooling and live Inbox preservation

These changes prepare draft PRs only. No deployment, migration, live activation or provider request is authorized by this document.

The TaxiCRM candidate now includes the already-live Inbox fix from 79e9fa2 (phone search, recency and keyset pagination). It is not a direct rollback of the live UI.

Both Docker builder stages generate `dist/notification-tools` using an explicit pinned build-time esbuild dependency. Their final stages copy only the generated tools into `/app/notification-tools`. Each artifact is a self-contained CommonJS Node file; no tsx, application checkout or node_modules are needed to run it. `manifest.json` records SHA-256 hashes. No build step imports runtime credentials or calls DB/Meta. Scripts are manual only and are never launched by startup, workers, cron or health checks. Optional pg-native is not packaged; the standard JavaScript PostgreSQL driver is bundled.

NAC commands after an approved deployment:

```sh
node /app/notification-tools/prepare-controlled-event.cjs /secure/new-controlled-descriptor.json
node /app/notification-tools/run-controlled-booking-event.cjs --inspect
node /app/notification-tools/run-controlled-booking-event.cjs --status
```

CRM offline preparation after an approved deployment:

```sh
node /app/notification-tools/prepare-controlled-approval.cjs /secure/new-controlled-descriptor.json /secure/new-controlled-approval.json
```

These command paths supersede the previous source-checkout `npx tsx` paths. All existing profile/expiry/hash/permissions remain required. No execute command was run. The expired canonical test event was not refreshed. The separate live approval and schema/ACL review gates remain unchanged.

The NAC preparation CLI now closes its reader and optional booking-attempt pools as well as the main pool, so a successful read-only command exits promptly.

## Artifact verification

A tools-only node:22-alpine image contains the exact generated artifacts, their manifests and synthetic fixture/test data. It contains no application source or node_modules. A fresh, disposable PostgreSQL 17 database is used. No production addresses, runtime secrets or Meta token are passed in. Its fixed recipient selector is exercised only in SIMULATED mode, never against a provider.

Passed: all three artifact hashes, launcher inspect, status GET against a local fake endpoint with authentication headers, read-only canonical descriptor, CRM offline approval, disabled-mode rejection and rejection of execute in simulation. End state: zero HTTP POSTs, zero event/dispatch/outbound registrations, zero provider POSTs. This is artifact packaging verification, not a full two-application production-image end-to-end test.

Reproduce from the two reviewed checkouts:

```sh
# In each checkout:
node scripts/notifications/build-tools.mjs
# In NAC checkout, with TAXICRM_CHECKOUT pointing to the CRM checkout:
node staging/notifications/controlled/runtime-tools-context.mjs
# The command prints a disposable context directory. Build that directory with Docker.
# Run the image in the network namespace of a disposable PostgreSQL container listening
# on 127.0.0.1:55439, with synthetic whatsapp_qa role; never use host networking/live DB.
```

The reproducible test driver is `staging/notifications/controlled/runtime-tools-check.ts` in NAC. Existing 26 two-application integration scenarios remain separate evidence and are not claimed rerun by this packaging check.

## Build compatibility

The Next 16 build exposed two pre-existing optional GET Request signatures in admin quote-settings/zones. Their exported types now require Request, as expected by the route validator; existing runtime guards, authentication and business logic remain unchanged. All nine targeted ecosystem/map-zone tests passed. Both full Next builds pass using synthetic configuration (NAC with webpack), and TypeScript/targeted lint pass. No production Docker application image build is claimed by this artifact-only test.

## Read-only production readiness preflight

The identical reviewed file `scripts/notifications/controlled-preflight.sql` is supplied in both checkouts. It runs one `BEGIN READ ONLY` transaction with statement/lock limits and ends in ROLLBACK. It reports DB/user identity, role flags, prerequisite/new relation presence, controlled trigger/function ownership/settings and both table and column ACLs. It does not select customer records or refresh the test event. It was verified on an empty synthetic database and after the exact reviewed migrations/grants in a disposable database. That does not establish production schema/ACL readiness.

Run only from an authorized database administration context, against the owner-confirmed shared database, using `psql --set ON_ERROR_STOP=1 --file scripts/notifications/controlled-preflight.sql`. The file is a reviewed administrative input from the checkout, not a new app startup step. Its output must be reviewed before any separately approved production schema change. Existing unexpected tables/triggers/migrations stop the release.

## Private runtime file ownership

NAC runs as UID/GID 1001 (`nextjs`). Privately mounted template/descriptor/approval inputs must be readable by that user; private output directories must be writable by that user. Use owner/group and 0600/0700 appropriately; do not make private files world-readable. A root-owned 0600 file copied with docker cp is not readable by nextjs. The preparation CLI now reports only a safe validation code or EACCES/ENOENT/ENOSPC, never raw SQL errors, connection strings or credentials.

## Subsequent complete production-image verification

Both complete production Dockerfiles now build successfully in the managed environment with the session CA mounted only during networked build steps and synthetic build DB configuration. Both final images booted against a disposable PostgreSQL 17 database with external schema management and general sending/workers disabled; both health endpoints returned 200. Runtime tool hashes matched their manifests. The actual NAC final image, running as UID 1001 with an owner-readable 0600 template file, prepared the canonical descriptor read-only and ran inspect with execution=false. The actual CRM final image generated the offline approval from that descriptor with execution_enabled=false. Workflow ledger/outbound counts remained zero. No execute command or Meta request was performed.

The machine-readable record is `evidence/runtime-tools/runtime-image-check.json`. This supersedes the earlier packaging-phase limitation that final application images had not yet been built; that earlier evidence file remains a historical record. No two-application 26-case suite or production database verification is newly claimed here.
