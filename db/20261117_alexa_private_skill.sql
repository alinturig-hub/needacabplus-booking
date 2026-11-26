-- Apply as schema owner; grant SELECT/INSERT/UPDATE/DELETE on these tables to
-- the application runtime role. No existing booking tables are changed.
CREATE TABLE IF NOT EXISTS alexa_authorization_codes (
 code_hash text PRIMARY KEY,
 client_id text NOT NULL,
 customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 redirect_uri text NOT NULL,
 code_challenge text NOT NULL,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS alexa_grants (
 id uuid PRIMARY KEY,
 customer_id uuid NOT NULL REFERENCES customer_accounts(id) ON DELETE CASCADE,
 client_id text NOT NULL,
 access_hash text NOT NULL UNIQUE,
 access_expires_at timestamptz NOT NULL,
 refresh_hash text NOT NULL UNIQUE,
 refresh_expires_at timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alexa_grants_customer ON alexa_grants(customer_id);
CREATE TABLE IF NOT EXISTS alexa_conversations (
 id uuid PRIMARY KEY,
 grant_id uuid NOT NULL REFERENCES alexa_grants(id) ON DELETE CASCADE,
 session_hash text NOT NULL,
 request_id text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('preview','live')),
 state text NOT NULL CHECK(state IN ('quoting','quoted','confirming','preview','confirmed','cancelled','unknown')),
 quote_id uuid,
 quote_token text,
 speech text,
 result jsonb,
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(grant_id,request_id)
);
CREATE INDEX IF NOT EXISTS alexa_conversations_session ON alexa_conversations(grant_id,session_hash,created_at DESC);

-- Guest voice state does not create a customer account or an OAuth grant.
CREATE TABLE IF NOT EXISTS alexa_guest_sessions (
 id uuid PRIMARY KEY,
 principal text NOT NULL,
 session_hash text NOT NULL,
 phase text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(principal,session_hash)
);
CREATE INDEX IF NOT EXISTS alexa_guest_sessions_principal ON alexa_guest_sessions(principal,phase);
CREATE TABLE IF NOT EXISTS alexa_guest_requests (
 principal text NOT NULL,
 request_hash text NOT NULL,
 response jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(principal,request_hash)
);

CREATE INDEX IF NOT EXISTS alexa_guest_requests_created ON alexa_guest_requests(created_at);
CREATE INDEX IF NOT EXISTS alexa_guest_sessions_expiry ON alexa_guest_sessions(expires_at);

CREATE TABLE IF NOT EXISTS alexa_notification_subscriptions (
 principal text PRIMARY KEY,
 user_cipher text,
 api_origin text,
 enabled boolean NOT NULL DEFAULT false,
 consent_at timestamptz NOT NULL,
 last_polled_at timestamptz
);
CREATE TABLE IF NOT EXISTS alexa_notification_outbox (
 id text PRIMARY KEY,
 principal text NOT NULL REFERENCES alexa_notification_subscriptions(principal),
 booking_id text NOT NULL,
 fingerprint text NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','omitted')),
 attempts integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(),
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 last_error text
);
CREATE INDEX IF NOT EXISTS alexa_notifications_pending ON alexa_notification_outbox(state,next_attempt_at);

-- A per-booking spoken Yes is required in addition to Amazon subscription consent.
CREATE TABLE IF NOT EXISTS alexa_booking_updates (
 principal text NOT NULL,
 booking_id text NOT NULL CHECK(booking_id ~ '^[0-9]{1,20}$'),
 opted_in boolean NOT NULL DEFAULT false,
 decision_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(principal,booking_id)
);

CREATE TABLE IF NOT EXISTS alexa_reminder_update_tests (
 id text PRIMARY KEY,
 principal text NOT NULL,
 user_cipher text NOT NULL,
 alert_cipher text,
 api_origin text NOT NULL,
 state text NOT NULL CHECK(state IN ('creating','ready','queued','updating','updated','failed','unknown','expired')),
 scheduled_at timestamptz NOT NULL,
 send_after timestamptz NOT NULL,
 attempts integer NOT NULL DEFAULT 0,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS alexa_reminder_update_tests_due ON alexa_reminder_update_tests(state,send_after);
