CREATE TABLE IF NOT EXISTS fleet_data_source (
 id boolean PRIMARY KEY DEFAULT true CHECK (id),
 source text NOT NULL DEFAULT 'autocab' CHECK (source IN ('autocab','local')),
 updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO fleet_data_source(id) VALUES (true) ON CONFLICT (id) DO NOTHING;
CREATE TABLE IF NOT EXISTS driver_field_definitions (
 id uuid PRIMARY KEY,
 label text NOT NULL,
 field_type text NOT NULL CHECK (field_type IN ('text','date','file')),
 required boolean NOT NULL DEFAULT false,
 check_expiration boolean NOT NULL DEFAULT false,
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS driver_templates (
 id uuid PRIMARY KEY,
 name text NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '',
 field_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_drivers (
 id uuid PRIMARY KEY,
 callsign text NOT NULL UNIQUE,
 first_name text NOT NULL,
 last_name text NOT NULL,
 mobile text NOT NULL,
 email text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','suspended')),
 template_id uuid REFERENCES driver_templates(id) ON DELETE SET NULL,
 profile jsonb NOT NULL DEFAULT '{}',
 field_values jsonb NOT NULL DEFAULT '{}',
 bank_encrypted text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_drivers_name ON local_drivers(last_name,first_name);
CREATE TABLE IF NOT EXISTS local_driver_documents (
 id uuid PRIMARY KEY,
 driver_id uuid NOT NULL REFERENCES local_drivers(id) ON DELETE CASCADE,
 field_id uuid REFERENCES driver_field_definitions(id) ON DELETE SET NULL,
 kind text NOT NULL,
 filename text NOT NULL,
 mime_type text NOT NULL,
 encrypted_data bytea NOT NULL,
 expires_on date,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 review_reason text NOT NULL DEFAULT '',
 uploaded_at timestamptz NOT NULL DEFAULT now(),
 reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_local_driver_documents_driver ON local_driver_documents(driver_id);
CREATE TABLE IF NOT EXISTS local_driver_audit (
 id uuid PRIMARY KEY,
 driver_id uuid NOT NULL REFERENCES local_drivers(id) ON DELETE CASCADE,
 action text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_driver_audit_driver ON local_driver_audit(driver_id,created_at DESC);
DO $$
DECLARE table_name text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  FOREACH table_name IN ARRAY ARRAY['fleet_data_source','driver_field_definitions','driver_templates','local_drivers','local_driver_documents','local_driver_audit'] LOOP
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO needacabplus_shared_app',table_name);
  END LOOP;
 END IF;
END $$;
CREATE TABLE IF NOT EXISTS local_car_types (
 id uuid PRIMARY KEY,
 name text NOT NULL UNIQUE,
 description text NOT NULL DEFAULT '',
 seats integer NOT NULL CHECK (seats BETWEEN 1 AND 100),
 hand_luggage integer NOT NULL DEFAULT 0 CHECK (hand_luggage BETWEEN 0 AND 100),
 checkin_luggage integer NOT NULL DEFAULT 0 CHECK (checkin_luggage BETWEEN 0 AND 100),
 rank integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_vehicles (
 id uuid PRIMARY KEY,
 car_type_id uuid NOT NULL REFERENCES local_car_types(id),
 make text NOT NULL,
 model text NOT NULL,
 color text NOT NULL,
 plate text NOT NULL UNIQUE,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','archived')),
 co2_gkm numeric(10,2),
 owner_name text NOT NULL DEFAULT '',
 description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_vehicles_type ON local_vehicles(car_type_id);
CREATE TABLE IF NOT EXISTS local_vehicle_documents (
 id uuid PRIMARY KEY,
 vehicle_id uuid NOT NULL REFERENCES local_vehicles(id) ON DELETE CASCADE,
 kind text NOT NULL,
 reference_number text NOT NULL DEFAULT '',
 filename text NOT NULL,
 mime_type text NOT NULL,
 encrypted_data bytea NOT NULL,
 expires_on date,
 uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_local_vehicle_documents_vehicle ON local_vehicle_documents(vehicle_id);
DO $$
DECLARE table_name text;
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  FOREACH table_name IN ARRAY ARRAY['local_car_types','local_vehicles','local_vehicle_documents'] LOOP
   EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO needacabplus_shared_app',table_name);
  END LOOP;
 END IF;
END $$;
