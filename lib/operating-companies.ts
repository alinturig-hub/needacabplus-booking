import {z} from 'zod';

export const companyFields=z.object({code:z.string().trim().min(2).max(24).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/).transform(value=>value.toUpperCase()),name:z.string().trim().min(2).max(120),email:z.union([z.literal(''),z.string().trim().email().max(254)]).default(''),phone:z.string().trim().max(40).default(''),active:z.boolean().default(true)}).strict();
export type Company={id:string;code:string;name:string;email:string;phone:string;active:boolean;created_at:string;updated_at:string};
