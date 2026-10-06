import {database} from './database';
import {decryptCredentials} from './credentials';
import {mapSettingsSchema} from './map-settings-schema';
export {defaultMapSettings,mapSettingsSchema,type MapSettings} from './map-settings-schema';

export async function readMapConfiguration(){
 const result=await database().query<{settings:unknown;secrets_encrypted:string}>('SELECT settings,secrets_encrypted FROM map_configuration WHERE id=true');
 const row=result.rows[0],settings=mapSettingsSchema.parse(row?.settings||{}),secrets=row?.secrets_encrypted?decryptCredentials(row.secrets_encrypted):{};
 return {settings,apiKey:secrets.mapTilerApiKey||''};
}

export function mapTilerStyleUrl(style:string,apiKey:string){return `https://api.maptiler.com/maps/${encodeURIComponent(style)}/style.json?key=${encodeURIComponent(apiKey)}`}
