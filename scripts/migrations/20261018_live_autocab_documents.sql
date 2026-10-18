-- Additive read model. Canonical ownership remains public."Booking".
CREATE TABLE IF NOT EXISTS public.autocab_bookings (
 autocab_id text PRIMARY KEY,
 company_id text, booking_type text, archive_reason text,
 pickup_due_utc timestamptz, booked_at_utc timestamptz,
 pricing jsonb, archived_booking jsonb, pickup jsonb, destination jsonb, vias jsonb,
 raw_payload jsonb NOT NULL, payload_sha256 text NOT NULL,
 first_fetched_at timestamptz NOT NULL DEFAULT now(),
 last_fetched_at timestamptz NOT NULL DEFAULT now(),
 booking_id text NOT NULL UNIQUE REFERENCES public."Booking"(id) ON DELETE CASCADE,
 payload_origin text NOT NULL DEFAULT 'WEBHOOK_PROJECTION',
 projection_version integer NOT NULL DEFAULT 1,
 raw_webhook_payload jsonb NOT NULL,
 last_webhook_event_id text REFERENCES public."WebhookEvent"(id) ON DELETE SET NULL,
 last_event_type text NOT NULL,
 last_event_occurred_at timestamptz NOT NULL,
 last_received_at timestamptz NOT NULL,
 operational_status text NOT NULL,
 webhook_event_count bigint NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS live_autocab_pickup_idx ON public.autocab_bookings(pickup_due_utc);
CREATE INDEX IF NOT EXISTS live_autocab_received_idx ON public.autocab_bookings(last_received_at);
CREATE TABLE IF NOT EXISTS public.autocab_booking_document_events (
 webhook_event_id text PRIMARY KEY REFERENCES public."WebhookEvent"(id) ON DELETE CASCADE,
 autocab_id text NOT NULL REFERENCES public.autocab_bookings(autocab_id) ON DELETE CASCADE,
 occurred_at timestamptz NOT NULL,
 projected_at timestamptz NOT NULL DEFAULT now()
);
DO $$ DECLARE r text; BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public.autocab_bookings TO needacabplus_shared_app;
  GRANT SELECT,INSERT ON public.autocab_booking_document_events TO needacabplus_shared_app;
 END IF;
 FOREACH r IN ARRAY ARRAY['needacabplus_shared_reader','taxicrm_shared_app','cabby_ro'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('GRANT SELECT ON public.autocab_bookings,public.autocab_booking_document_events TO %I',r);
  END IF;
 END LOOP;
END $$;
