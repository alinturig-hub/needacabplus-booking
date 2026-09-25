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
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id,action_key)
);

CREATE INDEX IF NOT EXISTS idx_api_endpoints_connection ON api_endpoints(connection_id);

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
