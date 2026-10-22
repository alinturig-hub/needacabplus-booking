SET LOCAL lock_timeout='5s';
ALTER TABLE public."Booking" ADD COLUMN IF NOT EXISTS "assignmentDetails" jsonb;
CREATE SCHEMA IF NOT EXISTS autocab_history;
CREATE TABLE IF NOT EXISTS autocab_history.assignment_repair_progress (
 job_key text PRIMARY KEY, cutoff timestamp NOT NULL, last_id text NOT NULL DEFAULT '',
 checked bigint NOT NULL DEFAULT 0, changed bigint NOT NULL DEFAULT 0, matched bigint NOT NULL DEFAULT 0,
 done boolean NOT NULL DEFAULT false, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS autocab_history.assignment_repair_audit (
 job_key text NOT NULL, booking_id text NOT NULL, before_fields jsonb NOT NULL, after_fields jsonb NOT NULL,
 sources jsonb NOT NULL, repaired_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(job_key,booking_id)
);
DO $$ DECLARE r text;BEGIN
 FOREACH r IN ARRAY ARRAY['needacabplus_shared_app'] LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT USAGE ON SCHEMA autocab_history TO %I',r);
   EXECUTE format('GRANT SELECT,INSERT,UPDATE ON autocab_history.assignment_repair_progress,autocab_history.assignment_repair_audit TO %I',r);
  END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['cabby_ro','needacabplus_shared_reader','taxicrm_shared_app'] LOOP
  IF EXISTS(SELECT FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT USAGE ON SCHEMA autocab_history TO %I',r);
   EXECUTE format('GRANT SELECT ON autocab_history.assignment_repair_progress,autocab_history.assignment_repair_audit TO %I',r);
  END IF;
 END LOOP;
END $$;
