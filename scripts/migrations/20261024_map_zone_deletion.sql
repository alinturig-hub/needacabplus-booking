-- Retain source links and version history so deleted imports do not reappear as references.
ALTER TABLE public.map_zones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
DROP INDEX IF EXISTS public.map_zones_name_unique;
CREATE UNIQUE INDEX map_zones_name_unique ON public.map_zones(lower(name)) WHERE deleted_at IS NULL;
