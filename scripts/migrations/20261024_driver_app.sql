CREATE TABLE IF NOT EXISTS public.driver_app_accounts(
 id uuid PRIMARY KEY,driver_id text NOT NULL UNIQUE,email text NOT NULL,password_hash text,enabled boolean NOT NULL DEFAULT true,
 invite_hash text,invite_expires_at timestamptz,online boolean NOT NULL DEFAULT false,
 latitude double precision,longitude double precision,accuracy double precision,gps_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS driver_app_email ON public.driver_app_accounts(lower(email));
CREATE TABLE IF NOT EXISTS public.driver_app_sessions(token_hash text PRIMARY KEY,account_id uuid NOT NULL REFERENCES public.driver_app_accounts(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS public.driver_app_jobs(
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES public.driver_app_accounts(id),training boolean NOT NULL DEFAULT true CHECK(training),
 status text NOT NULL DEFAULT 'offered' CHECK(status IN('offered','accepted','arrived','pob','completed','declined')),
 pickup jsonb NOT NULL,destination jsonb NOT NULL,fare_pence integer NOT NULL CHECK(fare_pence>=0),expires_at timestamptz NOT NULL,
 accepted_at timestamptz,arrived_at timestamptz,pob_at timestamptz,completed_at timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_app_jobs_owner ON public.driver_app_jobs(account_id,created_at DESC);
CREATE TABLE IF NOT EXISTS public.driver_app_events(id uuid PRIMARY KEY,job_id uuid NOT NULL REFERENCES public.driver_app_jobs(id),account_id uuid NOT NULL REFERENCES public.driver_app_accounts(id),action text NOT NULL,occurred_at timestamptz NOT NULL DEFAULT now());
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
 GRANT SELECT,INSERT,UPDATE ON public.driver_app_accounts,public.driver_app_jobs TO needacabplus_shared_app;
 GRANT SELECT,INSERT,DELETE ON public.driver_app_sessions TO needacabplus_shared_app;
 GRANT SELECT,INSERT ON public.driver_app_events TO needacabplus_shared_app;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_reader') THEN REVOKE ALL ON public.driver_app_accounts,public.driver_app_sessions FROM needacabplus_shared_reader;GRANT SELECT(id,driver_id,email,enabled,online,latitude,longitude,accuracy,gps_at,created_at) ON public.driver_app_accounts TO needacabplus_shared_reader;GRANT SELECT ON public.driver_app_jobs,public.driver_app_events TO needacabplus_shared_reader;END IF;
IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cabby_ro') THEN REVOKE ALL ON public.driver_app_accounts,public.driver_app_sessions FROM cabby_ro;END IF;
END $$;
