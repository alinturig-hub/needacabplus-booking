CREATE TABLE IF NOT EXISTS public.map_zones(
 id uuid PRIMARY KEY,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 colour text NOT NULL CHECK(colour ~ '^#[0-9a-fA-F]{6}$'),
 purpose text NOT NULL CHECK(purpose IN('operational','pricing','dispatch','demand')),
 enabled boolean NOT NULL DEFAULT true,
 geometry jsonb NOT NULL CHECK(geometry->>'type'='Polygon'),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS map_zones_name_unique ON public.map_zones(lower(name));
CREATE TABLE IF NOT EXISTS public.map_zone_versions(
 zone_id uuid NOT NULL REFERENCES public.map_zones(id),
 version integer NOT NULL,
 snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(zone_id,version)
);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_app') THEN
  GRANT SELECT,INSERT,UPDATE ON public.map_zones TO needacabplus_shared_app;
  GRANT SELECT,INSERT ON public.map_zone_versions TO needacabplus_shared_app;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='needacabplus_shared_reader') THEN GRANT SELECT ON public.map_zones,public.map_zone_versions TO needacabplus_shared_reader;END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='cabby_ro') THEN GRANT SELECT ON public.map_zones,public.map_zone_versions TO cabby_ro;END IF;
END $$;
