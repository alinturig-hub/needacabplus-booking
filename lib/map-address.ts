import {readMapConfiguration} from './map-settings';
import {reverseOpenMapAddress} from './open-map-address';
import {reverseMapTiler} from './maptiler-geocoding';

export async function reverseConfiguredMapAddress(latitude:number,longitude:number){
 const {settings,apiKey}=await readMapConfiguration();
 if(settings.searchProvider!=='maptiler'||!apiKey)return{address:await reverseOpenMapAddress(latitude,longitude),source:'OpenStreetMap' as const};
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
 try{const features=await reverseMapTiler(latitude,longitude,apiKey,settings,controller.signal),address=features[0]?.label;if(!address)throw new Error('MapTiler returned no address.');return{address,source:'MapTiler' as const}}finally{clearTimeout(timer)}
}
