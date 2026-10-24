ALTER TABLE public.map_zones DROP CONSTRAINT IF EXISTS map_zones_geometry_check;
ALTER TABLE public.map_zones ADD CONSTRAINT map_zones_geometry_check CHECK(geometry->>'type' IN('Polygon','MultiPolygon'));
