import type {StyleSpecification} from 'maplibre-gl';

export const openStreetMapStyle:StyleSpecification={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
export async function configuredMapStyle(theme:'light'|'dark',signal?:AbortSignal):Promise<StyleSpecification|string>{
 try{const response=await fetch('/api/map/config',{cache:'no-store',signal});if(!response.ok)return openStreetMapStyle;const data=await response.json() as {provider?:string;lightStyleUrl?:string|null;darkStyleUrl?:string|null};if(data.provider==='maptiler'){const style=theme==='dark'?data.darkStyleUrl:data.lightStyleUrl;if(style)return style}}catch{}
 return openStreetMapStyle;
}
