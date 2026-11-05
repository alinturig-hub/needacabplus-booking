# PR31 publication review — NeedACab Plus

Scope: publish only `codex/notifications-stage-one` and keep PR31 draft. No PR/base merge, reset, force-push, deployment, SQL execution, settings change or customer message is part of this publication.

## Verified source and history

- Original local commit found: `903b6c0077d83715815c40ab94ac8fa63816c1bc`.
- Original parent: `17f4365d72a58ff4e600375dbdfabd7805b529ad`.
- PR head before publication: `dc50f7b4e6efd2d4b236d9046afdddc612ab735e`.
- Applied code commit: `984c745a7ce4a1d32cf80b8e461407695c19f7ac` (real `git cherry-pick -x` of that existing source).
- Original-parent tree equals prior-PR-head tree. The histories differ because earlier publication used separate commit objects, not because these source commits are missing.
- Applied code tree and stable patch-id exactly equal the existing local source commit. The original clones/branches are untouched. A separate documentation-only commit adds this review pack and the unexecuted grants.
- The branch update is an ordinary fast-forward from the prior PR head. Commit IDs change under cherry-pick; these are explicitly not claimed to be identical Git objects. See [machine-readable checks](release/publication-verification.json).

## Difference from live

Read-only Coolify deployment metadata reports:

| App | Finished live commit | Deploy branch |
|---|---|---|
| NeedACab Plus | `7ee61b4aeb30a212859026017c9ccfe7102e92f8` | main |
| TaxiCRM | `79e9fa23f96fd1fbe304c0c9b42dfb0157534e63` | codex/taxicrm |

This PR adds the controlled Booking confirmed application handler, signed canonical context callback, single-attempt TaxiCRM dispatcher, common receipt/status correlation, new narrowly scoped persistence/fence SQL and offline approval/launch tooling. The entire PR also includes the earlier Notifications v2/staging work; the source commit above is only its latest increment. The exact direct tree comparison against live is in [live-tree-diff.txt](release/live-tree-diff.txt). It is a comparison, not a deployment replacement plan.

**TaxiCRM compatibility gate:** live includes `79e9fa23f96fd1fbe304c0c9b42dfb0157534e63` (inbox recency/phone search/pagination), which is absent from the current PR8 ancestry. Direct tree comparison therefore also reports those live-only conversation-list/UI changes. They were not removed or overwritten on live and were not automatically integrated here. Before any merge or deployment, reconcile this independently newer live change and rerun affected tests. Do not deploy this draft branch as a replacement for live without that review.

Production auto-deploy tracks main/codex/taxicrm, not these PR branches. Production preview deployments are disabled. The existing Notifications staging apps that track these PR branches have pinned commits and auto-deploy/preview disabled. These settings were read only, never changed. No deployment endpoint was invoked.

## Runtime observations and SQL review limits

Configured main DB roles are `needacabplus_shared_app` and `taxicrm_shared_app`; the two main URLs identify the same physical database. Role names were observed from secure runtime configuration without printing passwords. This is not a successful private-PostgreSQL connection or an ACL/table-presence assertion. The grant script checks expected roles and relations and fails closed if absent.

NAC live does not currently explicitly configure the three general sending flags or a `TAXICRM_SHARED_DATABASE_URL` alias; CRM's three sending flags are false. Future activation must explicitly keep all three flags false in both apps and configure the reviewed canonical alias to the same physical database. Nothing was changed during publication.

The SQL below is copied verbatim from the reviewed files; all remains **unexecuted in this publication task**. Existing schema prerequisites, migration ownership/pending migrations, nonce/shared tables and existing canonical/outbox privileges must be checked in an authorized runtime. No new broad Booking/customer write privileges are granted. The new grants are additive and do not revoke existing privileges. They do not create roles, change logins, or permit deleting/resetting claims.

Use an approved transaction with stop-on-error for reviewed SQL files (for example `psql --single-transaction --set ON_ERROR_STOP=1 --file <reviewed-file.sql>` in the authorized runtime; **not run here**). Apply the foundation only if it is pending/required, then both new table/fence migrations through the approved migration process, and the grant file once to the shared database. Stop on any unexpected pending migration or incompatible pre-existing schema; do not blindly replay all historical migrations. Preserve the reviewed SECURITY DEFINER function owner/search path and audit its narrow fence-only writes. This is a plan for later approval, not execution authorization.

### NAC Notifications foundation (already in draft PR31)

SHA-256: `8982988b3da86ca2b4db6d6c34732bd9ef8ec8726cce5fc99a7c475a40f5de41`

```sql
-- DEVELOPMENT ONLY. No changes to bookings, existing outboxes or send flags.
BEGIN;
CREATE TABLE notification_rules (
 id text PRIMARY KEY, version integer NOT NULL CHECK(version>0), status text NOT NULL CHECK(status IN ('draft','active','disabled')),
 definition jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), mode text NOT NULL DEFAULT 'DRY_RUN' CHECK(mode='DRY_RUN')
);
CREATE TABLE notification_rule_revisions (
 rule_id text NOT NULL REFERENCES notification_rules(id), version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('save','activate','disable')), definition jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(rule_id,version)
);
CREATE TABLE notification_decisions (
 id bigserial PRIMARY KEY, request_id uuid NOT NULL UNIQUE, rule_id text NOT NULL, rule_version integer NOT NULL,
 booking_id text NOT NULL CHECK(booking_id LIKE 'SYNTHETIC-%'), event text NOT NULL, channel text NOT NULL,
 result text NOT NULL, reason text NOT NULL, decision jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 mode text NOT NULL DEFAULT 'DRY_RUN' CHECK(mode='DRY_RUN')
);
CREATE INDEX notification_decisions_filter ON notification_decisions(rule_id,event,created_at DESC);
COMMIT;
```

### NAC bounded event/fence migration

SHA-256: `a5371d5b2a6527bc663ee5e45e1c25bae6725952475e51c91e05da7aa5717bf6`

```sql
-- Development migration only. Never applied automatically by request handlers.
CREATE TABLE notification_controlled_events(
 operation_key text PRIMARY KEY, request_id uuid NOT NULL UNIQUE,scope text NOT NULL,
 intent jsonb NOT NULL CHECK(intent->>'booking_id' IS NOT NULL AND intent->>'booking_id'='autocab:SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d'),
 request jsonb NOT NULL, fence bigint NOT NULL DEFAULT 0,
 result jsonb,provider_message_id text,status text NOT NULL DEFAULT 'CREATED',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION controlled_booking_fence() RETURNS trigger AS $$
DECLARE r jsonb := COALESCE(to_jsonb(NEW),to_jsonb(OLD)); o jsonb := to_jsonb(OLD);
BEGIN
 -- Only the bound synthetic booking, its associations, saved rule and recipient can invalidate this trial.
 IF TG_TABLE_NAME='Booking' THEN
  IF r->>'externalId' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' AND o->>'externalId' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='BookingLocation' THEN
  IF NOT EXISTS(SELECT 1 FROM public."Booking" WHERE id IN (r->>'bookingId',o->>'bookingId') AND "externalId"='SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d') THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='notification_rules' THEN
  IF NOT EXISTS(SELECT 1 FROM public.notification_controlled_events WHERE intent#>>'{rule,id}' IN (r->>'id',o->>'id')) THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='web_booking_attempts' THEN
  IF r->>'external_booking_id' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' AND o->>'external_booking_id' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='customer_accounts' THEN
  IF NOT EXISTS(SELECT 1 FROM public.web_booking_attempts WHERE external_booking_id='SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' AND user_id IN (r->>'id',o->>'id')) THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='WhatsAppRecipientGrant' THEN
  IF NOT EXISTS(SELECT 1 FROM public.notification_controlled_events WHERE (intent->>'recipient'=r->>'recipient' AND scope=r->>'scope') OR (intent->>'recipient'=o->>'recipient' AND scope=o->>'scope')) THEN RETURN NULL; END IF;
 ELSE RETURN NULL;
 END IF;
 UPDATE public.notification_controlled_events SET fence=fence+1 WHERE status IN ('CREATED','SENDING','UNKNOWN');
 RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp;
CREATE TRIGGER controlled_booking_fence AFTER INSERT OR UPDATE OR DELETE ON "Booking" FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_locations_fence AFTER INSERT OR UPDATE OR DELETE ON "BookingLocation" FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_rules_fence AFTER INSERT OR UPDATE OR DELETE ON notification_rules FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_accounts_fence AFTER INSERT OR UPDATE OR DELETE ON customer_accounts FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_attempts_fence AFTER INSERT OR UPDATE OR DELETE ON web_booking_attempts FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_permissions_fence AFTER INSERT OR UPDATE OR DELETE ON "WhatsAppRecipientGrant" FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
```

### CRM bounded dispatch ledger

SHA-256: `d802823f93aebfc39f58b03ac48baae798e5eefbce88213c3fd6393f59d6cf60`

```sql
-- Prepared only: never applied automatically by the controlled request handler.
CREATE TABLE "WhatsAppControlledDispatch"(
 scope text NOT NULL,operation_key text NOT NULL,request_hash text NOT NULL,intent jsonb NOT NULL CHECK(intent->>'booking_id' IS NOT NULL AND intent->>'booking_id'='autocab:SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d'),
 status text NOT NULL DEFAULT 'VALIDATING' CHECK(status IN ('VALIDATING','SENDING','BLOCKED','UNKNOWN','REJECTED','ACCEPTED','SENT','DELIVERED','READ','FAILED')),result jsonb,provider_message_id text,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(scope,operation_key)
);
```

### Manual additive grants; same shared database, apply once only after review

SHA-256: `e529279c4509fae7d90dc079d191e38f4f49b574269ebac1b5c1c0377417c2a2`

```sql
-- REVIEW ONLY. Apply once to the approved shared database after both table migrations.
-- Additive ACL delta; does not create roles, change logins/owners, grant DELETE or touch bookings.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  RAISE EXCEPTION 'Expected NAC runtime role is missing';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='taxicrm_shared_app') THEN
  RAISE EXCEPTION 'Expected TaxiCRM runtime role is missing';
 END IF;
 IF to_regclass('public.notification_rules') IS NULL
 OR to_regclass('public.notification_rule_revisions') IS NULL
 OR to_regclass('public.notification_decisions') IS NULL
 OR to_regclass('public.notification_decisions_id_seq') IS NULL
 OR to_regclass('public.notification_controlled_events') IS NULL
 OR to_regclass('public."WhatsAppControlledDispatch"') IS NULL
 OR to_regclass('public."WhatsAppOutboundMessage"') IS NULL THEN
  RAISE EXCEPTION 'Required reviewed notification tables/sequence are missing';
 END IF;
END $$;

GRANT USAGE ON SCHEMA public TO needacabplus_shared_app, taxicrm_shared_app;

-- NAC Notifications rule/preview persistence introduced earlier in draft PR31.
GRANT SELECT, INSERT, UPDATE ON TABLE public.notification_rules TO needacabplus_shared_app;
GRANT SELECT, INSERT ON TABLE public.notification_rule_revisions TO needacabplus_shared_app;
GRANT SELECT, INSERT ON TABLE public.notification_decisions TO needacabplus_shared_app;
GRANT USAGE, SELECT ON SEQUENCE public.notification_decisions_id_seq TO needacabplus_shared_app;

-- NAC owns event registration and status projection, but cannot delete/re-key it through these grants.
GRANT SELECT, INSERT ON TABLE public.notification_controlled_events TO needacabplus_shared_app;
GRANT UPDATE (status, result, provider_message_id)
 ON TABLE public.notification_controlled_events TO needacabplus_shared_app;

-- CRM reads/locks the canonical fence. FOR UPDATE requires an UPDATE privilege on at least one column.
GRANT SELECT (operation_key, fence), UPDATE (fence)
 ON TABLE public.notification_controlled_events TO taxicrm_shared_app;

-- CRM owns only the new controlled dispatch registration and its outcomes.
GRANT SELECT, INSERT ON TABLE public."WhatsAppControlledDispatch" TO taxicrm_shared_app;
GRANT UPDATE (status, result, provider_message_id)
 ON TABLE public."WhatsAppControlledDispatch" TO taxicrm_shared_app;

-- NAC's read-only activation preflight checks existence, not message bodies or recipient data.
GRANT SELECT (scope, operation_key)
 ON TABLE public."WhatsAppControlledDispatch" TO needacabplus_shared_app;
GRANT SELECT ("connectionKey", "operationKey")
 ON TABLE public."WhatsAppOutboundMessage" TO needacabplus_shared_app;

-- Existing shared nonce/inbox/event/outbox privileges are prerequisites, not broadened here.
-- In particular, this script grants no UPDATE on Booking/BookingLocation/customer records,
-- no CRM role access to NAC rule editing, and no permission to resend/reset prior operations.
```

## Activation/deactivation commands — not run

The exact profile and prerequisites are in [CONTROLLED_BC_IMPLEMENTATION.md](CONTROLLED_BC_IMPLEMENTATION.md). Bind the fixed booking, private one-number allowlist, active stored rule/version, current approved template fingerprint, canonical/gateway DB identities and explicit expiry. Both profiles start with `CONTROLLED_BC_MODE=DISABLED`. All general flags stay false:

```text
META_WHATSAPP_SENDING_ENABLED=false
WHATSAPP_JOURNEY_SENDING_ENABLED=false
META_WHATSAPP_TEST_SEND_ENABLED=false
```

NAC and CRM roles differ: each process pins its own DB identity; NAC read-only preparation also receives the CRM gateway identity via `CONTROLLED_BC_GATEWAY_DATABASE_IDENTITY`. Credentials stay in secure runtime configuration and never in an approval artifact. The common Meta account/webhook and single transport are unchanged.

After separately approved publication/migration work and fresh canonical/template/permission/suppression/operator/claim checks, prepare without side effects:

```sh
# Authorized NAC runtime, control mode disabled; SELECT-only descriptor preparation.
npx tsx scripts/notifications/prepare-controlled-event.ts /secure/new-controlled-descriptor.json
# Reviewed CRM checkout; offline, no DB/network.
npx tsx scripts/notifications/prepare-controlled-approval.ts /secure/new-controlled-descriptor.json /secure/new-controlled-approval.json
```

The packet must be newly approved for this controlled trigger. Configure its exact `approval_sha256` as `CONTROLLED_BC_APPROVAL_SHA256` in both bounded profiles, configure the private `CONTROLLED_BC_PACKET_FILE` for the launcher and only then set `CONTROLLED_BC_MODE=LIVE` in those profiles. Do not probe the live trigger with a dummy hash: a registration/claim is terminal and cannot be reset to retry.

```sh
# These are future commands only. No --execute command was run in this publication task.
npx tsx scripts/notifications/run-controlled-booking-event.ts --inspect
npx tsx scripts/notifications/run-controlled-booking-event.ts --execute
npx tsx scripts/notifications/run-controlled-booking-event.ts --status
```

After the one attempt, disable the scoped mode in both runtime configurations:

```text
CONTROLLED_BC_MODE=DISABLED
```

Keep all general flags false and retain the existing shared receipt worker/configuration so DELIVERED/READ can synchronize after deactivation. `--status` is read-only and remains available through existing service authentication. Keep all registrations/outbox claims; never delete/re-key them. UNKNOWN means stop, inspect/reconcile, no retry/SMS.

**Current activation blockers:** the earlier rehearsal event expired at 2026-11-05 07:24:29.611 London; its timestamp/TTL was not extended. The private PostgreSQL runtime access, current canonical event, actual grant/table/role state and fresh live Meta approval must be verified again in the authorized runtime. If the bound event is still expired or missing, stop; this review does not authorize inventing/refreshed event timestamps, reusing the completed owner-transport-v1 test, or sending from QA.

## Test evidence and preservation checks

- 26 end-to-end cases passed on complete local production Next builds with fresh isolated PostgreSQL and simulated provider only, including duplicate/concurrent dispatch, both operator lock orderings, suppression/cancellation/expiry, unknown response counts and lost-response reconciliation, post-acceptance persistence failure and signed receipt READ synchronization.
- 4 profile guard tests, 26 CRM regressions, 9 existing dispatcher PostgreSQL tests and 6 NAC regressions passed. Both builds, TypeScript, targeted lint and Prisma validation passed.
- [Machine-readable evidence](evidence/controlled-bc-implementation/verification.json) and [full redacted case results](evidence/controlled-bc-implementation/production-next-simulated.json) are versioned. Redacted evidence cannot authorize an execution.
- The verified cherry-pick preserves all tested runtime code byte-for-byte. Additional publication changes contain review documentation/grant SQL only; grant SQL was not executed or claimed as live-verified.
- Original source commits remain in their existing local worktrees; no branch reset or history rewriting was performed. Both PRs remain draft. No merge, deploy, migration, flag activation or message send was performed.
