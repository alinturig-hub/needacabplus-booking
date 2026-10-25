-- Preserve each connection's own state while the master integration is off.
ALTER TABLE public.integration_controls ADD COLUMN IF NOT EXISTS suspended_states jsonb;
CREATE OR REPLACE FUNCTION public.apply_autocab_master_control() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE api_states jsonb='{}'; webhook_states jsonb='{}';
BEGIN
 IF OLD.enabled=NEW.enabled THEN RETURN NEW; END IF;
 IF NOT NEW.enabled THEN
  IF to_regclass('public."AutocabApiConfiguration"') IS NOT NULL THEN
   SELECT COALESCE(jsonb_object_agg(id,"isEnabled"),'{}') INTO api_states FROM public."AutocabApiConfiguration" WHERE provider='AUTOCAB';
   UPDATE public."AutocabApiConfiguration" SET "isEnabled"=false WHERE provider='AUTOCAB';
  END IF;
  IF to_regclass('public."WebhookProvider"') IS NOT NULL THEN
   SELECT COALESCE(jsonb_object_agg(id,"isEnabled"),'{}') INTO webhook_states FROM public."WebhookProvider" WHERE id='autocab';
   UPDATE public."WebhookProvider" SET "isEnabled"=false WHERE id='autocab';
  END IF;
  UPDATE public.integration_controls SET suspended_states=jsonb_build_object('api',api_states,'webhook',webhook_states) WHERE provider=NEW.provider;
 ELSE
  IF to_regclass('public."AutocabApiConfiguration"') IS NOT NULL THEN
  UPDATE public."AutocabApiConfiguration" a SET "isEnabled"=(OLD.suspended_states->'api'->>a.id)::boolean WHERE OLD.suspended_states->'api' ? a.id; END IF;
  IF to_regclass('public."WebhookProvider"') IS NOT NULL THEN
  UPDATE public."WebhookProvider" w SET "isEnabled"=(OLD.suspended_states->'webhook'->>w.id)::boolean WHERE OLD.suspended_states->'webhook' ? w.id; END IF;
  UPDATE public.integration_controls SET suspended_states=NULL WHERE provider=NEW.provider;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS autocab_master_control ON public.integration_controls;
CREATE TRIGGER autocab_master_control AFTER UPDATE OF enabled ON public.integration_controls FOR EACH ROW EXECUTE FUNCTION public.apply_autocab_master_control();
CREATE OR REPLACE FUNCTION public.guard_autocab_provider_enable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW."isEnabled" AND EXISTS(SELECT 1 FROM public.integration_controls WHERE provider='autocab' AND NOT enabled) THEN
  IF (TG_TABLE_NAME='AutocabApiConfiguration' AND to_jsonb(NEW)->>'provider'='AUTOCAB') OR (TG_TABLE_NAME='WebhookProvider' AND NEW.id='autocab') THEN
   RAISE EXCEPTION 'Autocab master integration is disabled';
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF to_regclass('public."AutocabApiConfiguration"') IS NOT NULL THEN
  DROP TRIGGER IF EXISTS autocab_enable_guard ON public."AutocabApiConfiguration";
  CREATE TRIGGER autocab_enable_guard BEFORE INSERT OR UPDATE OF "isEnabled" ON public."AutocabApiConfiguration" FOR EACH ROW EXECUTE FUNCTION public.guard_autocab_provider_enable();
 END IF;
 IF to_regclass('public."WebhookProvider"') IS NOT NULL THEN
  DROP TRIGGER IF EXISTS autocab_enable_guard ON public."WebhookProvider";
  CREATE TRIGGER autocab_enable_guard BEFORE INSERT OR UPDATE OF "isEnabled" ON public."WebhookProvider" FOR EACH ROW EXECUTE FUNCTION public.guard_autocab_provider_enable();
 END IF;
END $$;
