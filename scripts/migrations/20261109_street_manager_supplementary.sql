CREATE TABLE IF NOT EXISTS street_manager_archive_events (
 object_type text NOT NULL,
 event_reference text NOT NULL,
 object_reference text NOT NULL,
 event_type text NOT NULL,
 event_time timestamptz NOT NULL,
 event_data jsonb NOT NULL,
 source_url text NOT NULL,
 source_sha256 text NOT NULL,
 imported_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(object_type,event_reference)
);
CREATE TABLE IF NOT EXISTS street_manager_council_notices (
 id text PRIMARY KEY,
 notice_data jsonb NOT NULL,
 in_current_snapshot boolean NOT NULL DEFAULT true,
 geometry jsonb,
 location_quality text NOT NULL DEFAULT 'unmapped' CHECK(location_quality IN ('unmapped','approximate','verified')),
 location_basis text,
 location_source text,
 location_checked_at timestamptz,
 first_seen_at timestamptz NOT NULL DEFAULT now(),
 last_listed_at timestamptz NOT NULL DEFAULT now(),
 source_checked_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS street_manager_source_runs (
 source text PRIMARY KEY,
 checked_at timestamptz NOT NULL DEFAULT now(),
 last_success_at timestamptz,
 status text NOT NULL,
 item_count integer NOT NULL DEFAULT 0,
 content_hash text,
 source_url text NOT NULL,
 error_code text,
 details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE OR REPLACE VIEW street_manager_roadwork_events AS
 SELECT e.event_reference,e.object_reference,e.event_type,e.object_type,e.event_time,e.event_data,e.received_at,'webhook'::text AS source
 FROM street_manager_events e WHERE btrim(e.event_data#>>'{object_data,highway_authority_swa_code}')='1160'
 UNION ALL
 SELECT a.event_reference,a.object_reference,a.event_type,a.object_type,a.event_time,a.event_data,a.imported_at AS received_at,'archive'::text AS source
 FROM street_manager_archive_events a
 WHERE btrim(a.event_data#>>'{object_data,highway_authority_swa_code}')='1160'
 AND NOT EXISTS(SELECT 1 FROM street_manager_events e WHERE e.object_type=a.object_type AND e.event_reference=a.event_reference);
