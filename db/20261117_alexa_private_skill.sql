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
