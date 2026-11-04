-- Isolated synthetic PostgreSQL only. Never applied to production.
BEGIN;
CREATE TABLE notification_stage_marker(id boolean PRIMARY KEY DEFAULT true CHECK(id),revision bigint NOT NULL DEFAULT 0);
INSERT INTO notification_stage_marker(id) VALUES(true);
CREATE TABLE customer_auth_limits(key text PRIMARY KEY,hits int NOT NULL DEFAULT 1,until_at timestamptz NOT NULL);
CREATE TABLE admin_security(id boolean PRIMARY KEY DEFAULT true CHECK(id),totp_secret_encrypted text NOT NULL DEFAULT '',sms_phone text NOT NULL DEFAULT '',session_version int NOT NULL DEFAULT 1);
INSERT INTO admin_security(id) VALUES(true);
CREATE TABLE "Booking"(id text PRIMARY KEY,provider text NOT NULL DEFAULT 'AUTOCAB' CHECK(provider='AUTOCAB'),"externalId" text NOT NULL UNIQUE CHECK("externalId" LIKE 'SYNTHETIC-%'),status text NOT NULL DEFAULT 'ACTIVE',"telephoneNumber" text,"normalCustomerId" text,"customerName" text,"pickupDueTime" timestamptz,"bookedAtTime" timestamptz,"acceptedAt" timestamptz,"arrivedAt" timestamptz,"pickedUpAt" timestamptz,"completedAt" timestamptz,"cancelledAt" timestamptz,"driverId" text,"vehicleId" text,"driverForename" text,"vehicleRegistration" text,"ourReference" text,"bookingSource" text);
CREATE TABLE "BookingLocation"(id text PRIMARY KEY,"bookingId" text REFERENCES "Booking"(id),type text CHECK(type IN ('PICKUP','DESTINATION')),address text);
CREATE TABLE customer_accounts(id text PRIMARY KEY,full_name text,phone text);
CREATE TABLE web_booking_attempts(quote_id uuid PRIMARY KEY,user_id text NOT NULL,external_booking_id text NOT NULL UNIQUE,state text NOT NULL,updated_at timestamptz DEFAULT now());
CREATE TABLE IF NOT EXISTS whatsapp_service_nonce(id text PRIMARY KEY,created_at timestamptz DEFAULT now());
CREATE TABLE notification_stage_template(id text PRIMARY KEY,definition jsonb NOT NULL);
CREATE TABLE notification_stage_intent(operation_key text PRIMARY KEY,request_id uuid NOT NULL,request jsonb NOT NULL,intent jsonb NOT NULL,result jsonb,created_at timestamptz DEFAULT now());
CREATE TABLE notification_stage_delivery(scope text NOT NULL,operation_key text NOT NULL,result jsonb NOT NULL,conversation_id text NOT NULL,created_at timestamptz DEFAULT now(),PRIMARY KEY(scope,operation_key));
CREATE TABLE notification_stage_control(key text PRIMARY KEY,value jsonb NOT NULL);
INSERT INTO notification_stage_control VALUES('delay_ms','0'),('phase','"IDLE"');
CREATE FUNCTION notification_stage_bump() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN UPDATE notification_stage_marker SET revision=revision+1 WHERE id=true;RETURN NULL;END $$;
-- Additive; no edits to existing webhook receipts or outbound claims.
CREATE TABLE "WhatsAppConversation" (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, participant TEXT NOT NULL,
 mode TEXT NOT NULL DEFAULT 'AUTOMATED' CHECK(mode IN ('AUTOMATED','OPERATOR')),
 revision INTEGER NOT NULL DEFAULT 0, "assignedUserId" TEXT,
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(scope,participant)
);
CREATE TABLE "WhatsAppMessage" (
 id BIGSERIAL PRIMARY KEY, scope TEXT NOT NULL, "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"(id),
 "providerMessageId" TEXT NOT NULL, direction TEXT NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
 content JSONB NOT NULL, status TEXT NOT NULL, "occurredAt" TIMESTAMPTZ, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(scope,"providerMessageId")
);
CREATE INDEX ON "WhatsAppMessage"("conversationId",id);
CREATE TABLE "WhatsAppSharedEvent" (
 id BIGSERIAL PRIMARY KEY, scope TEXT NOT NULL, "eventKey" TEXT NOT NULL, type TEXT NOT NULL, payload JSONB NOT NULL,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "deliveredAt" TIMESTAMPTZ,
 attempts INTEGER NOT NULL DEFAULT 0, "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(scope,"eventKey")
);
CREATE TABLE "WhatsAppServiceNonce" (id TEXT PRIMARY KEY,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE "WhatsAppHandoffCommand" (scope TEXT NOT NULL,id TEXT NOT NULL,"requestHash" TEXT NOT NULL,result JSONB NOT NULL,PRIMARY KEY(scope,id));
CREATE TABLE "WhatsAppServiceIntent" (
 id TEXT PRIMARY KEY, scope TEXT NOT NULL, "operationKey" TEXT NOT NULL,"requestHash" TEXT NOT NULL,
 "conversationId" TEXT NOT NULL REFERENCES "WhatsAppConversation"(id), payload JSONB NOT NULL,
 status TEXT NOT NULL DEFAULT 'HELD' CHECK(status IN ('HELD','CANCELLED','EXPIRED')),
 "expiresAt" TIMESTAMPTZ NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(scope,"operationKey")
);
-- Intents remain HELD until approved template bindings and provider dispatch are enabled separately.

ALTER TABLE "WhatsAppServiceIntent" DROP CONSTRAINT "WhatsAppServiceIntent_status_check";
ALTER TABLE "WhatsAppServiceIntent" ADD CONSTRAINT "WhatsAppServiceIntent_status_check" CHECK(status IN ('HELD','SENDING','ACCEPTED','UNKNOWN','REJECTED','CANCELLED','EXPIRED'));
ALTER TABLE "WhatsAppServiceIntent" ADD COLUMN "outboundId" TEXT, ADD COLUMN "lastReason" TEXT, ADD COLUMN "claimedAt" TIMESTAMPTZ;
ALTER TABLE "WhatsAppServiceIntent" ADD COLUMN "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT now(), ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "WhatsAppRecipientGrant" (
 scope TEXT NOT NULL, recipient TEXT NOT NULL, "customerId" TEXT NOT NULL,
 "serviceAllowed" BOOLEAN NOT NULL DEFAULT false, suppressed BOOLEAN NOT NULL DEFAULT false,
 "verifiedAt" TIMESTAMPTZ NOT NULL, "validUntil" TIMESTAMPTZ NOT NULL,
 "proofType" TEXT NOT NULL CHECK("proofType" IN ('OTP','OPERATOR_VERIFIED','SIGNED_ACCOUNT')),
 "proofReference" TEXT NOT NULL, "updatedBy" TEXT NOT NULL, "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(scope,recipient)
);
CREATE TABLE "WhatsAppTemplateBinding" (
 scope TEXT NOT NULL, milestone TEXT NOT NULL, name TEXT NOT NULL, language TEXT NOT NULL,
 "parameterKeys" JSONB NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false,
 "updatedBy" TEXT NOT NULL,"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(scope,milestone)
);
CREATE TABLE "WhatsAppPolicyAudit" (
 id BIGSERIAL PRIMARY KEY,scope TEXT NOT NULL,actor TEXT NOT NULL,type TEXT NOT NULL,payload JSONB NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "WhatsAppServiceIntent"(scope,status,"expiresAt");

-- DEVELOPMENT ONLY. No changes to bookings, existing outboxes or send flags.

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

CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "Booking" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "BookingLocation" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "customer_accounts" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "web_booking_attempts" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "WhatsAppRecipientGrant" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "WhatsAppConversation" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "notification_stage_template" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
CREATE TRIGGER notification_stage_revision AFTER INSERT OR UPDATE OR DELETE ON "notification_rules" FOR EACH STATEMENT EXECUTE FUNCTION notification_stage_bump();
COMMIT;
