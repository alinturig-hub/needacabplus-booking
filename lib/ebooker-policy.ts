import {z} from 'zod';

export const ebookerAddressSchema=z.object({text:z.string().trim().min(5).max(250),coordinate:z.object({latitude:z.number().finite().min(-90).max(90),longitude:z.number().finite().min(-180).max(180)}).passthrough(),zoneId:z.number().int().nonnegative()}).passthrough();
const logo=z.string().trim().max(1000).refine(value=>{if(!value)return true;try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password}catch{return false}},'Use an HTTPS logo URL.');
export const ebookerInputSchema=z.object({
 name:z.string().trim().min(2).max(80),slug:z.string().trim().regex(/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/,'Use 3–80 lowercase letters, numbers or hyphens.'),
 enabled:z.boolean().default(false),logoUrl:logo.default(''),supportPhone:z.string().trim().regex(/^\+?[0-9 ()-]{7,25}$/),
 pickupMode:z.enum(['none','preset','fixed']),pickup:ebookerAddressSchema.nullable(),maxPassengers:z.number().int().min(1).max(4).default(4),
}).strict().superRefine((value,ctx)=>{if(value.pickupMode!=='none'&&!value.pickup)ctx.addIssue({code:'custom',path:['pickup'],message:'Select a resolved pickup address.'})});
export type EbookerInput=z.infer<typeof ebookerInputSchema>;
export type EbookerConfig=EbookerInput&{id:string;revision:number};
export type EbookerClaim={id:string;slug:string;name:string;revision:number;passengers:number};

export class EbookerPolicyError extends Error{}

export function ebookerJourney(config:EbookerConfig,input:{pickup:z.infer<typeof ebookerAddressSchema>;passengers:number;revision:number}){
 if(!config.enabled)throw new EbookerPolicyError('This eBooker is currently unavailable.');
 if(input.revision!==config.revision)throw new EbookerPolicyError('This booking link changed. Reload the page before requesting a fare.');
 if(!Number.isInteger(input.passengers)||input.passengers<1||input.passengers>config.maxPassengers)throw new EbookerPolicyError(`Choose between 1 and ${config.maxPassengers} passengers.`);
 return {pickup:config.pickupMode==='fixed'?ebookerAddressSchema.parse(config.pickup):input.pickup};
}
export function validateEbookerClaim(config:EbookerConfig|null,claim:EbookerClaim,pickup:string,passengers:number){
 if(!config||!config.enabled||config.id!==claim.id||config.slug!==claim.slug||config.revision!==claim.revision)throw new EbookerPolicyError('This eBooker changed or was disabled. Request a new fare.');
 if(passengers!==claim.passengers||passengers>config.maxPassengers)throw new EbookerPolicyError('Passenger details changed. Request a new fare.');
 if(config.pickupMode==='fixed'&&pickup!==config.pickup?.text)throw new EbookerPolicyError('The pickup is fixed for this eBooker.');
}
