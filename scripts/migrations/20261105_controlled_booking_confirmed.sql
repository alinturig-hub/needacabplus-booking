-- Development migration only. Never applied automatically by request handlers.
CREATE TABLE notification_controlled_events(
 operation_key text PRIMARY KEY, request_id uuid NOT NULL UNIQUE,scope text NOT NULL,
 intent jsonb NOT NULL CHECK(intent->>'booking_id' IS NOT NULL AND intent->>'booking_id'='autocab:SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d'),
 request jsonb NOT NULL, fence bigint NOT NULL DEFAULT 0,
 result jsonb,provider_message_id text,status text NOT NULL DEFAULT 'CREATED',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION controlled_booking_fence() RETURNS trigger AS $$
DECLARE r jsonb := COALESCE(to_jsonb(NEW),to_jsonb(OLD)); o jsonb := to_jsonb(OLD);
BEGIN
 -- Only the bound synthetic booking, its associations, saved rule and recipient can invalidate this trial.
 IF TG_TABLE_NAME='Booking' THEN
  IF r->>'externalId' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' AND o->>'externalId' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='BookingLocation' THEN
  IF NOT EXISTS(SELECT 1 FROM public."Booking" WHERE id IN (r->>'bookingId',o->>'bookingId') AND "externalId"='SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d') THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='notification_rules' THEN
  IF NOT EXISTS(SELECT 1 FROM public.notification_controlled_events WHERE intent#>>'{rule,id}' IN (r->>'id',o->>'id')) THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='web_booking_attempts' THEN
  IF r->>'external_booking_id' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' AND o->>'external_booking_id' IS DISTINCT FROM 'SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='customer_accounts' THEN
  IF NOT EXISTS(SELECT 1 FROM public.web_booking_attempts WHERE external_booking_id='SYNTHETIC-BC-53fd75f0-eb4d-4042-8ee6-92ebcc845f9d' AND user_id IN (r->>'id',o->>'id')) THEN RETURN NULL; END IF;
 ELSIF TG_TABLE_NAME='WhatsAppRecipientGrant' THEN
  IF NOT EXISTS(SELECT 1 FROM public.notification_controlled_events WHERE (intent->>'recipient'=r->>'recipient' AND scope=r->>'scope') OR (intent->>'recipient'=o->>'recipient' AND scope=o->>'scope')) THEN RETURN NULL; END IF;
 ELSE RETURN NULL;
 END IF;
 UPDATE public.notification_controlled_events SET fence=fence+1 WHERE status IN ('CREATED','SENDING','UNKNOWN');
 RETURN NULL;
END; $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp;
CREATE TRIGGER controlled_booking_fence AFTER INSERT OR UPDATE OR DELETE ON "Booking" FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_locations_fence AFTER INSERT OR UPDATE OR DELETE ON "BookingLocation" FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_rules_fence AFTER INSERT OR UPDATE OR DELETE ON notification_rules FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_accounts_fence AFTER INSERT OR UPDATE OR DELETE ON customer_accounts FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_attempts_fence AFTER INSERT OR UPDATE OR DELETE ON web_booking_attempts FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
CREATE TRIGGER controlled_permissions_fence AFTER INSERT OR UPDATE OR DELETE ON "WhatsAppRecipientGrant" FOR EACH ROW EXECUTE FUNCTION controlled_booking_fence();
