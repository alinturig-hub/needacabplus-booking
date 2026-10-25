CREATE TABLE IF NOT EXISTS public.integration_controls(provider text PRIMARY KEY CHECK(provider='autocab'),enabled boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO public.integration_controls(provider,enabled) VALUES('autocab',true) ON CONFLICT(provider) DO NOTHING;
-- Independent native pricing policy, seeded once without activating native live quotes.
INSERT INTO public.operations_settings(id,settings) VALUES('pricing','{}') ON CONFLICT(id) DO NOTHING;
UPDATE public.operations_settings SET settings=jsonb_set(settings,'{nativeQuotes}',COALESCE(settings->'liveQuotes','{}')||'{"enabled":false}'::jsonb),updated_at=now() WHERE id='pricing' AND NOT(settings?'nativeQuotes');
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN GRANT SELECT,UPDATE ON public.integration_controls TO needacabplus_shared_app;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_reader') THEN GRANT SELECT ON public.integration_controls TO needacabplus_shared_reader;END IF;
END $$;
