CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY,
  user_id text NOT NULL,
  name text NOT NULL,
  phone text NOT NULL,
  pickup text NOT NULL,
  destination text NOT NULL,
  via_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  pickup_note text NOT NULL DEFAULT '',
  vehicle text NOT NULL CHECK (vehicle IN ('saloon','estate','xl')),
  fare_pence integer NOT NULL CHECK (fare_pence >= 0),
  status text NOT NULL DEFAULT 'test_confirmed',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON bookings(created_at DESC);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS external_booking_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS original_booking_id text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS booking_type text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_type text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS priority integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS street_pickup boolean;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS passengers integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS luggage integer;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pickup_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vias_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS vehicle_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS pricing_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS timeline_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes_data jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS raw_payload jsonb;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS last_event_type text;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_external_id
  ON bookings(external_booking_id) WHERE external_booking_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS tariffs (
  id text PRIMARY KEY CHECK (id IN ('saloon','estate','xl')),
  base_pence integer NOT NULL CHECK (base_pence >= 0),
  per_mile_pence integer NOT NULL CHECK (per_mile_pence > 0),
  minimum_pence integer NOT NULL CHECK (minimum_pence > 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tariffs (id,base_pence,per_mile_pence,minimum_pence) VALUES
 ('saloon',300,180,600),('estate',400,210,750),('xl',500,260,900)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS api_connections (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  provider text NOT NULL,
  base_url text NOT NULL,
  auth_type text NOT NULL CHECK (auth_type IN ('none','api_key','bearer','basic')),
  api_key_header text NOT NULL DEFAULT 'x-api-key',
  credentials_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider,name)
);

CREATE TABLE IF NOT EXISTS api_endpoints (
  id uuid PRIMARY KEY,
  connection_id uuid NOT NULL REFERENCES api_connections(id) ON DELETE CASCADE,
  name text NOT NULL,
  action_key text NOT NULL,
  method text NOT NULL CHECK (method IN ('GET','POST','PUT','PATCH','DELETE')),
  path text NOT NULL,
  description text NOT NULL DEFAULT '',
  request_example jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id,action_key)
);

CREATE INDEX IF NOT EXISTS idx_api_endpoints_connection ON api_endpoints(connection_id);

ALTER TABLE api_endpoints ADD COLUMN IF NOT EXISTS request_example jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS autocab_drivers (
  external_id text PRIMARY KEY,
  callsign text,
  first_name text,
  last_name text,
  display_name text NOT NULL DEFAULT '',
  mobile text,
  email text,
  company text,
  status text NOT NULL DEFAULT 'Active',
  suspended boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autocab_drivers_name ON autocab_drivers(display_name);
CREATE INDEX IF NOT EXISTS idx_autocab_drivers_callsign ON autocab_drivers(callsign);

CREATE TABLE IF NOT EXISTS autocab_vehicles (
  external_id text PRIMARY KEY,
  callsign text,
  registration text,
  make text,
  model text,
  colour text,
  passenger_capacity integer,
  vehicle_type text,
  plate_number text,
  company text,
  status text NOT NULL DEFAULT 'Active',
  suspended boolean NOT NULL DEFAULT false,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autocab_vehicles_registration ON autocab_vehicles(registration);
CREATE INDEX IF NOT EXISTS idx_autocab_vehicles_callsign ON autocab_vehicles(callsign);

CREATE TABLE IF NOT EXISTS drivers (
  id text PRIMARY KEY,
  callsign text,
  forename text,
  surname text,
  badge_number text,
  licence_number text,
  active boolean NOT NULL DEFAULT true,
  first_seen timestamptz,
  last_seen timestamptz
);

CREATE TABLE IF NOT EXISTS driver_positions (
  id bigserial PRIMARY KEY,
  driver_id text REFERENCES drivers(id),
  vehicle_id text,
  vehicle_callsign text,
  registration text,
  plate_number text,
  latitude double precision,
  longitude double precision,
  vehicle_status text,
  booking_id bigint,
  recorded_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_driver_positions_driver_recorded ON driver_positions(driver_id,recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_positions_recorded ON driver_positions(recorded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_positions_track_unique
  ON driver_positions(driver_id,COALESCE(vehicle_id,''),COALESCE(booking_id,-1),COALESCE(recorded_at,'epoch'::timestamptz));

CREATE TABLE IF NOT EXISTS driver_shifts (
  driver_id text PRIMARY KEY REFERENCES drivers(id),
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz
);

CREATE TABLE IF NOT EXISTS webhook_providers (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  base_url text NOT NULL,
  api_key_header text NOT NULL DEFAULT 'x-api-key',
  api_key_encrypted text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS provider_webhooks (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES webhook_providers(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  event_url_suffix text NOT NULL,
  event_filter_recipe text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id,name),
  UNIQUE (provider_id,event_type,event_url_suffix)
);

CREATE INDEX IF NOT EXISTS idx_provider_webhooks_provider ON provider_webhooks(provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_webhooks_suffix_unique ON provider_webhooks(event_url_suffix);

CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY,
  provider_id uuid NOT NULL REFERENCES webhook_providers(id) ON DELETE CASCADE,
  webhook_id uuid NOT NULL REFERENCES provider_webhooks(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb NOT NULL,
  content_type text NOT NULL DEFAULT '',
  source_ip text NOT NULL DEFAULT '',
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE provider_webhooks ADD COLUMN IF NOT EXISTS received_count bigint NOT NULL DEFAULT 0;
ALTER TABLE provider_webhooks ADD COLUMN IF NOT EXISTS last_received_at timestamptz;

UPDATE provider_webhooks webhook SET
 received_count=history.total,
 last_received_at=history.latest
FROM (
 SELECT webhook_id,COUNT(*) AS total,MAX(received_at) AS latest
 FROM webhook_events GROUP BY webhook_id
) history
WHERE webhook.id=history.webhook_id AND webhook.received_count=0;

CREATE INDEX IF NOT EXISTS idx_webhook_events_received ON webhook_events(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_events_webhook ON webhook_events(webhook_id,received_at DESC);

CREATE TABLE IF NOT EXISTS operations_settings (
  id text PRIMARY KEY CHECK (id IN ('dispatch','pricing','stripe')),
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  secrets_encrypted text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_accounts (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  password_hash text NOT NULL,
  full_name text NOT NULL,
  phone text NOT NULL,
  stripe_customer_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_accounts_email
  ON customer_accounts(lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_accounts_stripe
  ON customer_accounts(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash text PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_sessions_customer
  ON customer_sessions(customer_id,expires_at DESC);

CREATE TABLE IF NOT EXISTS customer_places (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('home','work','favorite')),
  name text NOT NULL DEFAULT '',
  address text NOT NULL,
  full_address jsonb NOT NULL,
  place_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_places_home_work
  ON customer_places(customer_id,kind) WHERE kind IN ('home','work');
CREATE INDEX IF NOT EXISTS idx_customer_places_customer
  ON customer_places(customer_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS customer_address_history (
  id uuid PRIMARY KEY,
  customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
  address text NOT NULL,
  full_address jsonb NOT NULL,
  place_id text,
  used_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(customer_id,address)
);

CREATE INDEX IF NOT EXISTS idx_customer_address_history_customer
  ON customer_address_history(customer_id,used_at DESC);

-- Stripe customers belong to a particular sandbox/account configuration.
CREATE TABLE IF NOT EXISTS customer_stripe_profiles (
 customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 configuration_key text NOT NULL,
 stripe_customer_id text NOT NULL,
 mode text NOT NULL CHECK (mode IN ('test','live')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (customer_id,configuration_key)
);

-- Receipt history, separate from booking state. Repeated deliveries remain visible.
CREATE TABLE IF NOT EXISTS dispatch_observations (
 id bigserial PRIMARY KEY,
 event_type text NOT NULL,
 booking_id text,
 vehicle_id text,
 driver_id text,
 received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dispatch_observations_received ON dispatch_observations(received_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_observations_booking ON dispatch_observations(booking_id,received_at DESC);

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS dispatch_requirements jsonb;
ALTER TABLE dispatch_observations ADD COLUMN IF NOT EXISTS kind text;
ALTER TABLE dispatch_observations ADD COLUMN IF NOT EXISTS source_at timestamptz;
ALTER TABLE dispatch_observations ADD COLUMN IF NOT EXISTS driver_callsign text;
ALTER TABLE dispatch_observations ADD COLUMN IF NOT EXISTS vehicle_callsign text;
ALTER TABLE dispatch_observations ADD COLUMN IF NOT EXISTS customer_key text;
ALTER TABLE dispatch_observations ADD COLUMN IF NOT EXISTS dedup_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_dispatch_observations_dedup ON dispatch_observations(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS dispatch_recommendations (
 id bigserial PRIMARY KEY,
 booking_id text NOT NULL,
 vehicle_id text,
 details jsonb NOT NULL,
 minute_bucket bigint NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(booking_id,minute_bucket)
);
CREATE INDEX IF NOT EXISTS idx_dispatch_recommendations_booking ON dispatch_recommendations(booking_id,recorded_at DESC);

CREATE TABLE IF NOT EXISTS booking_modified_audit (
 id bigserial PRIMARY KEY, booking_id text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 previous_status text, resulting_status text, changed_fields text[] NOT NULL
);
CREATE OR REPLACE FUNCTION audit_booking_modified() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE changed text[];
BEGIN
 IF regexp_replace(lower(COALESCE(NEW.last_event_type,'')),'[^a-z]','','g')='bookingmodified' AND (NEW.raw_payload IS DISTINCT FROM OLD.raw_payload OR NEW.dispatch_requirements IS DISTINCT FROM OLD.dispatch_requirements) THEN
  SELECT COALESCE(array_agg(key ORDER BY key),ARRAY[]::text[]) INTO changed FROM jsonb_each(to_jsonb(NEW))
  WHERE key NOT IN ('raw_payload','updated_at','last_event_type') AND value IS DISTINCT FROM to_jsonb(OLD)->key;
  INSERT INTO booking_modified_audit(booking_id,previous_status,resulting_status,changed_fields)
  VALUES(NEW.external_booking_id,OLD.status,NEW.status,changed);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS booking_modified_audit_trigger ON bookings;
CREATE TRIGGER booking_modified_audit_trigger AFTER UPDATE ON bookings FOR EACH ROW EXECUTE FUNCTION audit_booking_modified();
CREATE TABLE IF NOT EXISTS booking_database_audits (
 id text PRIMARY KEY, started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz,
 status text NOT NULL DEFAULT 'running', total integer NOT NULL DEFAULT 0, error text
);
CREATE TABLE IF NOT EXISTS booking_database_audit_items (
 audit_id text REFERENCES booking_database_audits(id), booking_id uuid, reference text,
 local_snapshot jsonb NOT NULL, local_version text NOT NULL, checked_at timestamptz,
 result jsonb, PRIMARY KEY(audit_id,booking_id)
);
ALTER TABLE booking_database_audits ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

ALTER TABLE booking_database_audits ADD COLUMN IF NOT EXISTS time_diagnostics jsonb;

CREATE TABLE IF NOT EXISTS app_configuration(section text PRIMARY KEY CHECK(section IN ('bookings','sms','identity')),settings jsonb NOT NULL DEFAULT '{}',secrets_encrypted text NOT NULL DEFAULT '',updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS map_configuration(
 id boolean PRIMARY KEY DEFAULT true CHECK(id),
 settings jsonb NOT NULL DEFAULT '{}',
 secrets_encrypted text NOT NULL DEFAULT '',
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE customer_accounts ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS customer_auth_challenges(id text PRIMARY KEY,purpose text NOT NULL,customer_id uuid REFERENCES customer_accounts(id),phone text NOT NULL DEFAULT '',payload_encrypted text NOT NULL DEFAULT '',code_hash text,attempts int NOT NULL DEFAULT 0,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),consumed_at timestamptz);
CREATE TABLE IF NOT EXISTS customer_trusted_devices(token_hash text PRIMARY KEY,customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS customer_auth_limits(key text PRIMARY KEY,hits int NOT NULL DEFAULT 1,until_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS customer_oauth_states(state_hash text PRIMARY KEY,provider text NOT NULL,browser_hash text NOT NULL,nonce text NOT NULL,verifier text NOT NULL,expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS customer_identities(provider text NOT NULL,subject text NOT NULL,customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,PRIMARY KEY(provider,subject));

-- Safely interpret legacy timezone-less Autocab pickup times as UK local time.
CREATE OR REPLACE FUNCTION booking_pickup_day(timeline jsonb, pickup jsonb) RETURNS date LANGUAGE plpgsql STABLE AS $$
DECLARE stamp text;
BEGIN
 stamp := COALESCE(NULLIF(timeline->>'scheduledAt',''),NULLIF(pickup->>'dueTime',''));
 IF stamp IS NULL THEN RETURN NULL; END IF;
 IF stamp ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN (stamp::timestamptz AT TIME ZONE 'Europe/London')::date; END IF;
 RETURN stamp::timestamp::date;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION booking_pickup_local_time(timeline jsonb,pickup jsonb) RETURNS timestamp LANGUAGE plpgsql STABLE AS $$
DECLARE stamp text;
BEGIN
 stamp:=COALESCE(NULLIF(timeline->>'scheduledAt',''),NULLIF(pickup->>'dueTime',''));
 IF stamp IS NULL THEN RETURN NULL; END IF;
 IF stamp ~ '(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RETURN stamp::timestamptz AT TIME ZONE 'Europe/London'; END IF;
 RETURN stamp::timestamp;
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END;
$$;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_checked_at timestamptz;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS status_check_result jsonb;
CREATE INDEX IF NOT EXISTS idx_booking_status_check ON bookings(status_checked_at) WHERE external_booking_id IS NOT NULL AND status NOT IN ('Completed','Cancelled','No Fare');

CREATE TABLE IF NOT EXISTS web_booking_attempts (
 quote_id uuid PRIMARY KEY,user_id text NOT NULL,state text NOT NULL CHECK(state IN ('sending','unknown','confirmed','rejected')),
 request_body jsonb NOT NULL,external_booking_id text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_web_booking_attempt_user ON web_booking_attempts(user_id,state);
CREATE UNIQUE INDEX IF NOT EXISTS idx_web_booking_attempt_unresolved ON web_booking_attempts(user_id) WHERE state IN ('sending','unknown');
