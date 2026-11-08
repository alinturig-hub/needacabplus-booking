BEGIN;
CREATE TABLE IF NOT EXISTS street_manager_events (
 topic_arn text NOT NULL,
 message_id text NOT NULL,
 event_reference text NOT NULL,
 event_type text NOT NULL,
 object_type text NOT NULL,
 object_reference text NOT NULL,
 event_time timestamptz NOT NULL,
 sns_timestamp timestamptz NOT NULL,
 schema_version integer NOT NULL,
 event_data jsonb NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(topic_arn,message_id),
 UNIQUE(topic_arn,event_reference)
);
CREATE INDEX IF NOT EXISTS street_manager_object_events_idx ON street_manager_events(object_type,object_reference,event_time DESC);
CREATE TABLE IF NOT EXISTS street_manager_subscriptions (
 topic_arn text PRIMARY KEY,
 subscription_arn text NOT NULL,
 confirmed_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
-- Run as the approved schema owner. Runtime role requires INSERT/SELECT on these
-- two tables and UPDATE on street_manager_subscriptions. No broad grants or runtime DDL.
