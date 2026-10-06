import {mapTilerStyleUrl,readMapConfiguration} from '@/lib/map-settings';

export const dynamic='force-dynamic';
export async function GET(){
 try{
  const {settings,apiKey}=await readMapConfiguration(),mapTiler=settings.mapProvider==='maptiler'&&Boolean(apiKey);
  return Response.json({provider:mapTiler?'maptiler':'openstreetmap',lightStyleUrl:mapTiler?mapTilerStyleUrl(settings.mapTilerLightStyle,apiKey):null,darkStyleUrl:mapTiler?mapTilerStyleUrl(settings.mapTilerDarkStyle,apiKey):null},{headers:{'Cache-Control':'private, max-age=60'}});
 }catch{return Response.json({provider:'openstreetmap',lightStyleUrl:null,darkStyleUrl:null},{headers:{'Cache-Control':'no-store'}})}
}
