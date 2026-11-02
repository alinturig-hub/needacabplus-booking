-- Apply through the shared database owner's migration process, before enabling eBookers.
CREATE TABLE IF NOT EXISTS public.ebookers (
 id uuid PRIMARY KEY,
 slug text NOT NULL UNIQUE,
 settings jsonb NOT NULL,
 enabled boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK (revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.ebooker_booking_origins (
 quote_id uuid PRIMARY KEY,
 ebooker_id uuid NOT NULL REFERENCES public.ebookers(id) ON DELETE RESTRICT,
 user_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ebooker_origins_source_idx ON public.ebooker_booking_origins(ebooker_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ebooker_origins_owner_idx ON public.ebooker_booking_origins(user_id,quote_id);
-- These are Need A Cab Plus-owned tables; no access is granted to public roles.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public.ebookers,public.ebooker_booking_origins TO needacabplus_shared_app;
 END IF;
END $$;
