-- Preserve existing enabled zones once; later runs must never publish drafts.
DO $$ DECLARE first_run boolean; BEGIN
 SELECT NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='map_zones' AND column_name='published_snapshot') INTO first_run;
 ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS published_snapshot jsonb;
 ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS published_version integer;
 ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS published_at timestamptz;
 IF first_run THEN
  UPDATE public.map_zones SET published_snapshot=jsonb_build_object('name',name,'colour',colour,'purpose',purpose,'enabled',enabled,'geometry',geometry),published_version=version,published_at=updated_at WHERE enabled;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='map_zone_publication_consistent' AND conrelid='public.map_zones'::regclass) THEN
  ALTER TABLE public.map_zones ADD CONSTRAINT map_zone_publication_consistent CHECK((published_snapshot IS NULL AND published_version IS NULL AND published_at IS NULL) OR (published_snapshot IS NOT NULL AND published_version IS NOT NULL AND published_at IS NOT NULL AND published_version<=version));
 END IF;
END $$;
