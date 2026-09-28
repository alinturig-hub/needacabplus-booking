import {z} from 'zod';
const ids=z.array(z.number().int().positive()).max(30).transform(v=>[...new Set(v)]);
// Ignore obsolete service capabilities in settings saved before vehicle-only matching.
export const bookingPolicySchema=z.preprocess(value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const settings={...value} as Record<string,unknown>;
 delete settings.priorityCapabilities;delete settings.guaranteeCapabilities;
 return settings;
},z.object({accountName:z.string().trim().max(100).default('Web Booker Card'),cashAccountName:z.string().trim().max(100).default(''),bookingCapabilities:ids.default([]),companyId:z.number().int().positive().default(1),accountCustomerId:z.number().int().positive().nullable().default(2155),cashAccountCustomerId:z.number().int().positive().nullable().default(null),paymentMethod:z.enum(['card','cash']).default('card'),priorityDelayMinutes:z.number().int().min(0).max(180).default(0),minPrebookMinutes:z.number().int().min(1).max(10080).default(30),saloonCapabilities:ids.default([]),estateCapabilities:ids.default([]),xlCapabilities:ids.default([])}).strict());
export type BookingPolicy=z.infer<typeof bookingPolicySchema>;
export const defaultBookingPolicy=bookingPolicySchema.parse({});
