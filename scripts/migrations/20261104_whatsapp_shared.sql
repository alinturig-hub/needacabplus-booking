-- Apply to the NeedACab Plus application database with the migration owner.
CREATE TABLE IF NOT EXISTS whatsapp_service_nonce (id text PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_event_inbox (event_id text PRIMARY KEY,scope text NOT NULL,event_type text NOT NULL,payload jsonb NOT NULL,request_hash text NOT NULL,received_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_notification_outbox (
 id bigserial PRIMARY KEY,operation_key text NOT NULL UNIQUE,payload jsonb NOT NULL,
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','ACCEPTED','CANCELLED','EXPIRED','BLOCKED')),
 gateway_id text,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
