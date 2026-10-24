/** Generate reviewable SQL from an exported company-1 Autocab Zone inventory.
 * Usage: npx tsx scripts/import-autocab-map-zones.ts input.json output.sql
 * Imported boundaries are drafts; existing live snapshots stay unchanged.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {prepareAutocabZone,type AutocabZoneRecord} from '../lib/autocab/zone-import';
const records=JSON.parse(readFileSync(process.argv[2],'utf8')).zones as AutocabZoneRecord[];
const quote=(s:string)=>`'${s.replaceAll("'","''")}'`;
const sql=[readFileSync('scripts/migrations/20261024_autocab_map_zones.sql','utf8'),readFileSync('scripts/migrations/20261024_map_zone_deletion.sql','utf8'),'LOCK TABLE public.map_zones IN SHARE ROW EXCLUSIVE MODE;'];
const rejected:{id:string;name:string;reason:string}[]=[];
for(const record of records){
 if(record.rawPayload.companyId!==1)throw Error('Only the company-1 Autocab inventory is supported.');
 let zone;try{zone=prepareAutocabZone(record)}catch(e){rejected.push({id:record.externalId,name:record.name,reason:String(e)});continue}
 // A same-name manual zone is adopted once, with its previous version preserved.
 sql.push(`DO $import$ DECLARE current_zone public.map_zones; next_zone public.map_zones; BEGIN
 SELECT * INTO current_zone FROM public.map_zones WHERE (source_provider='AUTOCAB' AND source_external_id=${quote(record.externalId)}) OR (source_provider IS NULL AND deleted_at IS NULL AND lower(name)=lower(${quote(zone.name)})) ORDER BY source_provider NULLS LAST LIMIT 1 FOR UPDATE;
 IF current_zone.id IS NOT NULL THEN
  INSERT INTO public.map_zone_versions(zone_id,version,snapshot) VALUES(current_zone.id,current_zone.version,to_jsonb(current_zone)) ON CONFLICT DO NOTHING;
  IF current_zone.source_payload IS NOT DISTINCT FROM ${quote(JSON.stringify(record.rawPayload))}::jsonb THEN RETURN; END IF;
  UPDATE public.map_zones SET name=${quote(zone.name)},colour=${quote(zone.colour)},purpose=${quote(zone.purpose)},enabled=${zone.enabled},geometry=${quote(JSON.stringify(zone.geometry))}::jsonb,source_provider='AUTOCAB',source_external_id=${quote(record.externalId)},source_payload=${quote(JSON.stringify(record.rawPayload))}::jsonb,version=version+1,updated_at=now() WHERE id=current_zone.id RETURNING * INTO next_zone;
 ELSE
  INSERT INTO public.map_zones(id,name,colour,purpose,enabled,geometry,source_provider,source_external_id,source_payload) VALUES(${quote(randomUUID())},${quote(zone.name)},${quote(zone.colour)},${quote(zone.purpose)},${zone.enabled},${quote(JSON.stringify(zone.geometry))}::jsonb,'AUTOCAB',${quote(record.externalId)},${quote(JSON.stringify(record.rawPayload))}::jsonb) RETURNING * INTO next_zone;
 END IF;
 INSERT INTO public.map_zone_versions(zone_id,version,snapshot) VALUES(next_zone.id,next_zone.version,to_jsonb(next_zone));
END $import$;`);
}
writeFileSync(process.argv[3],sql.join('\n'));
writeFileSync(process.argv[3]+'.report.json',JSON.stringify({received:records.length,prepared:records.length-rejected.length,rejected},null,2));
console.log(JSON.stringify({received:records.length,prepared:records.length-rejected.length,rejected:rejected.map(r=>({id:r.id,name:r.name}))}));
