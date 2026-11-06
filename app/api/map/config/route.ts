import {mapTilerStyleUrl,readMapConfiguration} from '@/lib/map-settings';

import {passengerMapPresets} from '@/lib/passenger-map-preset';

export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {settings,apiKey}=await readMapConfiguration(),mapTiler=settings.mapProvider==='maptiler'&&Boolean(apiKey);
  const styles=passengerMapPresets(settings.mapTilerLightStyle,settings.mapTilerDarkStyle);
  return Response.json({provider:mapTiler?'maptiler':'openstreetmap',lightStyleUrl:mapTiler?mapTilerStyleUrl(styles.light,apiKey):null,darkStyleUrl:mapTiler?mapTilerStyleUrl(styles.dark,apiKey):null},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch{return Response.json({provider:'openstreetmap',lightStyleUrl:null,darkStyleUrl:null},{headers:{'Cache-Control':'no-store'}})}
}
