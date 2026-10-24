import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {mapZoneInputSchema} from '../lib/map-zone-schema';
const feature=JSON.parse(readFileSync('scripts/data/uk-operating-area.geojson','utf8'));
const zone=mapZoneInputSchema.parse({name:'United Kingdom',colour:'#b38a39',purpose:'operational',enabled:true,geometry:feature.geometry});
const q=(v:unknown)=>`'${JSON.stringify(v).replaceAll("'","''")}'::jsonb`;
const sql=readFileSync('scripts/migrations/20261024_multipart_map_zones.sql','utf8')+`
WITH imported AS (
 INSERT INTO public.map_zones(id,name,colour,purpose,enabled,geometry,source_provider,source_external_id,source_payload)
 VALUES('${randomUUID()}','United Kingdom','${zone.colour}','operational',true,${q(zone.geometry)},'NATURAL_EARTH','GBR',${q(feature.properties)})
 ON CONFLICT(source_provider,source_external_id) WHERE source_provider IS NOT NULL AND source_external_id IS NOT NULL DO NOTHING RETURNING *
) INSERT INTO public.map_zone_versions(zone_id,version,snapshot) SELECT id,version,to_jsonb(imported) FROM imported;
`;
writeFileSync(process.argv[2],sql);
console.log('Validated United Kingdom operating area: '+feature.geometry.coordinates.length+' polygon parts. Draft only.');
