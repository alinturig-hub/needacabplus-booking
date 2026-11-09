-- Apply with the schema owner; runtime requires SELECT/INSERT/UPDATE only.
CREATE TABLE IF NOT EXISTS street_manager_driver_alert_clock (
 driver_id text PRIMARY KEY,
 last_attempt_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS street_manager_driver_alerts (
 id text PRIMARY KEY,
 driver_id text NOT NULL,
 vehicle_id text NOT NULL,
 closure_key text NOT NULL,
 alert_day date NOT NULL,
 fix_at timestamptz NOT NULL,
 message text NOT NULL,
 distance_metres integer NOT NULL CHECK(distance_metres>=0),
 status text NOT NULL CHECK(status IN ('SENDING','ACCEPTED','REJECTED','UNKNOWN','SUPPRESSED')),
 http_status integer,
 created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz,
 UNIQUE(driver_id,closure_key,alert_day)
);
CREATE INDEX IF NOT EXISTS street_manager_driver_alerts_created ON street_manager_driver_alerts(created_at DESC);
