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
