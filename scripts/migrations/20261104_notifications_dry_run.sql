-- DEVELOPMENT ONLY. No changes to bookings, existing outboxes or send flags.
BEGIN;
CREATE TABLE notification_rules (
 id text PRIMARY KEY, version integer NOT NULL CHECK(version>0), status text NOT NULL CHECK(status IN ('draft','active','disabled')),
 definition jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(), mode text NOT NULL DEFAULT 'DRY_RUN' CHECK(mode='DRY_RUN')
);
CREATE TABLE notification_rule_revisions (
 rule_id text NOT NULL REFERENCES notification_rules(id), version integer NOT NULL,
 action text NOT NULL CHECK(action IN ('save','activate','disable')), definition jsonb NOT NULL,
 changed_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(rule_id,version)
);
CREATE TABLE notification_decisions (
 id bigserial PRIMARY KEY, request_id uuid NOT NULL UNIQUE, rule_id text NOT NULL, rule_version integer NOT NULL,
 booking_id text NOT NULL CHECK(booking_id LIKE 'SYNTHETIC-%'), event text NOT NULL, channel text NOT NULL,
 result text NOT NULL, reason text NOT NULL, decision jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 mode text NOT NULL DEFAULT 'DRY_RUN' CHECK(mode='DRY_RUN')
);
CREATE INDEX notification_decisions_filter ON notification_decisions(rule_id,event,created_at DESC);
COMMIT;
