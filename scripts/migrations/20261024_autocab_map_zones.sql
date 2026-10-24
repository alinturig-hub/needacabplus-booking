ALTER TABLE public.map_zones DROP CONSTRAINT IF EXISTS map_zones_purpose_check;
ALTER TABLE public.map_zones ADD CONSTRAINT map_zones_purpose_check CHECK(purpose IN('operational','plot','system','pricing','dispatch','demand'));
ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS source_provider text;
ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS source_external_id text;
ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS source_payload jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS map_zones_source_unique ON public.map_zones(source_provider,source_external_id) WHERE source_provider IS NOT NULL AND source_external_id IS NOT NULL;
