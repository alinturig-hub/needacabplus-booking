-- Additive audit queue; canonical inserts are performed only by the explicit worker.
CREATE TABLE IF NOT EXISTS autocab_history.canonical_queue (
 original_booking_id text PRIMARY KEY,
 source_entry_id text NOT NULL REFERENCES autocab_history.entries(autocab_id),
 archive_time timestamptz, ambiguous boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN('PENDING','IMPORTED','EXISTING')),
 canonical_booking_id text, mapped_status text, review_flags jsonb,
 processed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS canonical_queue_pending_idx ON autocab_history.canonical_queue(original_booking_id) WHERE state='PENDING';
DO $$ DECLARE r text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  GRANT SELECT,INSERT,UPDATE ON autocab_history.canonical_queue TO needacabplus_shared_app;
 END IF;
 FOREACH r IN ARRAY ARRAY['needacabplus_shared_reader','taxicrm_shared_app','cabby_ro'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT ON autocab_history.canonical_queue TO %I',r);
  END IF;
 END LOOP;
END $$;
