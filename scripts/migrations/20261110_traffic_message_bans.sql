CREATE TABLE IF NOT EXISTS street_manager_message_bans (
 id text PRIMARY KEY,
 callsign text NOT NULL,
 driver_id text NOT NULL,
 driver_name text NOT NULL,
 vehicle_id text NOT NULL,
 vehicle_callsign text,
 registration text,
 association_source text NOT NULL,
 association_at timestamptz,
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS street_manager_message_bans_callsign ON street_manager_message_bans(callsign) WHERE active;
CREATE INDEX IF NOT EXISTS street_manager_message_bans_vehicle ON street_manager_message_bans(vehicle_id) WHERE active;
CREATE INDEX IF NOT EXISTS street_manager_message_bans_driver ON street_manager_message_bans(driver_id) WHERE active;
CREATE TABLE IF NOT EXISTS street_manager_message_ban_audit (
 id text PRIMARY KEY,
 entry_id text NOT NULL REFERENCES street_manager_message_bans(id),
 action text NOT NULL CHECK(action IN ('add','edit','remove')),
 before_data jsonb,
 after_data jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
