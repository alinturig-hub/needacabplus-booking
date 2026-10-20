-- Additive archive staging in the operational database. No canonical row is changed.
CREATE SCHEMA IF NOT EXISTS autocab_history;
CREATE TABLE IF NOT EXISTS autocab_history.entries (
 autocab_id text PRIMARY KEY,
 company_id text, booking_type text, archive_reason text,
 pickup_due_utc timestamptz, booked_at_utc timestamptz,
 pricing jsonb, archived_booking jsonb, pickup jsonb, destination jsonb, vias jsonb,
 raw_payload jsonb NOT NULL, payload_sha256 text NOT NULL,
 first_fetched_at timestamptz NOT NULL,last_fetched_at timestamptz NOT NULL,
 original_booking_id text GENERATED ALWAYS AS (NULLIF(archived_booking->>'originalAutoID','')) STORED,
 copied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS autocab_history_original_idx ON autocab_history.entries(original_booking_id);
CREATE INDEX IF NOT EXISTS autocab_history_pickup_idx ON autocab_history.entries(pickup_due_utc);
CREATE TABLE IF NOT EXISTS autocab_history.copy_progress (
 job text PRIMARY KEY, source_database text NOT NULL,source_rows bigint NOT NULL,
 source_last_fetched_at timestamptz NOT NULL,last_id text NOT NULL DEFAULT '',
 copied_rows bigint NOT NULL DEFAULT 0,done boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW autocab_history.booking_entries AS
 SELECT e.*,b.id AS canonical_booking_id,b.status AS canonical_status
 FROM autocab_history.entries e
 LEFT JOIN public."Booking" b ON b.provider='AUTOCAB' AND b."externalId"=e.original_booking_id;
DO $$ DECLARE r text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  GRANT USAGE ON SCHEMA autocab_history TO needacabplus_shared_app;
  GRANT SELECT,INSERT ON autocab_history.entries TO needacabplus_shared_app;
  GRANT SELECT,INSERT,UPDATE ON autocab_history.copy_progress TO needacabplus_shared_app;
  GRANT SELECT ON autocab_history.booking_entries TO needacabplus_shared_app;
 END IF;
 FOREACH r IN ARRAY ARRAY['needacabplus_shared_reader','taxicrm_shared_app','cabby_ro'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT USAGE ON SCHEMA autocab_history TO %I',r);
   EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA autocab_history TO %I',r);
  END IF;
 END LOOP;
END $$;
