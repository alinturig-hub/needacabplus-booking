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
