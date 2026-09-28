import {database} from './database';
import {bookingPolicySchema} from './booking-policy';
import {smsPolicySchema,identityPolicySchema} from './customer-security-policy';
import {decryptCredentials} from './credentials';
export async function readConfiguration(section:string){const r=await database().query('SELECT settings,secrets_encrypted FROM app_configuration WHERE section=$1',[section]);return r.rows[0]||{settings:{},secrets_encrypted:''}}
export async function loadBookingPolicy(){const row=await readConfiguration('bookings');if(Object.keys(row.settings).length)return bookingPolicySchema.parse(row.settings);const old=await database().query("SELECT settings->'liveQuotes' AS policy FROM operations_settings WHERE id='pricing'");const p=old.rows[0]?.policy||{};return bookingPolicySchema.parse({minPrebookMinutes:p.minPrebookMinutes,saloonCapabilities:p.saloonCapabilities,estateCapabilities:p.estateCapabilities,xlCapabilities:p.xlCapabilities})}
export async function loadIdentityPolicy(){return identityPolicySchema.parse((await readConfiguration('identity')).settings)}
export async function loadSmsPolicy(){const row=await readConfiguration('sms');return {settings:smsPolicySchema.parse(row.settings),secrets:row.secrets_encrypted?decryptCredentials(row.secrets_encrypted):{}}}
