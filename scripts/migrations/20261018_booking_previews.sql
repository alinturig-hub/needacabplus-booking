-- Sandbox booking previews never enter the operational Booking/bookings tables.
CREATE TABLE IF NOT EXISTS web_booking_previews (
 quote_id uuid PRIMARY KEY,
 user_id text NOT NULL,
 payment_intent_id text UNIQUE,
 request_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS web_booking_previews_user ON web_booking_previews(user_id,created_at DESC);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  GRANT SELECT,INSERT ON web_booking_previews TO needacabplus_shared_app;
 END IF;
END $$;
