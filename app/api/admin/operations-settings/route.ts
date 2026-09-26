import {z} from 'zod';
import {database} from '@/lib/database';
import {encryptCredentials} from '@/lib/credentials';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';

export const dynamic='force-dynamic';

const dispatchDefaults={enabled:false,automaticDispatch:false,selectionStrategy:'nearest',initialRadiusMiles:2,radiusStepMiles:1,maximumRadiusMiles:8,offerTimeoutSeconds:25,maximumOffers:5,scheduledLeadMinutes:20,requireOnShift:true,excludeSuspended:true};
const pricingDefaults={enabled:false,globalAdjustmentPercent:0,rules:[] as unknown[]};
const stripeDefaults={enabled:false,mode:'test',publishableKey:'',currency:'gbp',captureMethod:'automatic',statementDescriptor:'NEED A CAB PLUS'};

const dispatchSchema=z.object({section:z.literal('dispatch'),enabled:z.boolean(),automaticDispatch:z.boolean(),selectionStrategy:z.enum(['nearest','longest_waiting','balanced']),initialRadiusMiles:z.number().min(.1).max(100),radiusStepMiles:z.number().min(.1).max(100),maximumRadiusMiles:z.number().min(.1).max(200),offerTimeoutSeconds:z.number().int().min(5).max(300),maximumOffers:z.number().int().min(1).max(100),scheduledLeadMinutes:z.number().int().min(0).max(1440),requireOnShift:z.boolean(),excludeSuspended:z.boolean()}).strict().refine(value=>value.maximumRadiusMiles>=value.initialRadiusMiles,{message:'Maximum radius must be at least the initial radius.',path:['maximumRadiusMiles']});
const priceRuleSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(80),enabled:z.boolean(),days:z.array(z.number().int().min(0).max(6)).min(1),startTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),endTime:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),adjustmentType:z.enum(['percentage','fixed']),adjustmentValue:z.number().min(-100).max(10000),priority:z.number().int().min(0).max(1000)}).strict();
const pricingSchema=z.object({section:z.literal('pricing'),enabled:z.boolean(),globalAdjustmentPercent:z.number().min(-100).max(1000),rules:z.array(priceRuleSchema).max(100)}).strict();
const stripeSchema=z.object({section:z.literal('stripe'),enabled:z.boolean(),mode:z.enum(['test','live']),publishableKey:z.string().trim().max(300),secretKey:z.string().trim().max(500).optional().default(''),webhookSecret:z.string().trim().max(500).optional().default(''),currency:z.string().trim().toLowerCase().regex(/^[a-z]{3}$/),captureMethod:z.enum(['automatic','manual']),statementDescriptor:z.string().trim().min(2).max(22).regex(/^[A-Za-z0-9 ._-]+$/)}).strict().superRefine((value,context)=>{
 if(value.enabled&&!value.publishableKey)context.addIssue({code:'custom',message:'Enter the Stripe publishable key before enabling payments.',path:['publishableKey']});
 const suffix=value.mode==='test'?'test':'live';
 if(value.publishableKey&&!value.publishableKey.startsWith(`pk_${suffix}_`))context.addIssue({code:'custom',message:`Use a Stripe ${value.mode} publishable key.`,path:['publishableKey']});
 if(value.secretKey&&!value.secretKey.startsWith(`sk_${suffix}_`))context.addIssue({code:'custom',message:`Use a Stripe ${value.mode} secret key.`,path:['secretKey']});
 if(value.webhookSecret&&!value.webhookSecret.startsWith('whsec_'))context.addIssue({code:'custom',message:'The Stripe webhook secret must start with whsec_.',path:['webhookSecret']});
});

async function rows(){return (await database().query<{id:string;settings:Record<string,unknown>;secrets_encrypted:string;updated_at:string}>('SELECT id,settings,secrets_encrypted,updated_at FROM operations_settings')).rows}

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const data=await rows(),byId=new Map(data.map(item=>[item.id,item]));
  const dispatch={...dispatchDefaults,...byId.get('dispatch')?.settings};
  const pricing={...pricingDefaults,...byId.get('pricing')?.settings};
  const stripe={...stripeDefaults,...byId.get('stripe')?.settings,secretKeyConfigured:Boolean(byId.get('stripe')?.secrets_encrypted),webhookSecretConfigured:Boolean(byId.get('stripe')?.secrets_encrypted)};
  return Response.json({dispatch,pricing,stripe,updatedAt:{dispatch:byId.get('dispatch')?.updated_at||null,pricing:byId.get('pricing')?.updated_at||null,stripe:byId.get('stripe')?.updated_at||null}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}

export async function PUT(request:Request){
 if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 let raw:unknown;try{raw=await request.json()}catch{return Response.json({error:'Invalid JSON request.'},{status:400})}
 try{
  const section=(raw as {section?:unknown})?.section;
  if(section==='dispatch'||section==='pricing'){
   const body=section==='dispatch'?dispatchSchema.parse(raw):pricingSchema.parse(raw),settings={...body} as Record<string,unknown>;
   delete settings.section;
   await database().query(`INSERT INTO operations_settings (id,settings,updated_at) VALUES ($1,$2::jsonb,now()) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`,[section,JSON.stringify(settings)]);
   return Response.json({ok:true});
  }
  if(section==='stripe'){
   const body=stripeSchema.parse(raw),current=await database().query<{secrets_encrypted:string}>('SELECT secrets_encrypted FROM operations_settings WHERE id=$1',['stripe']);
   const hasStored=Boolean(current.rows[0]?.secrets_encrypted),hasNew=Boolean(body.secretKey&&body.webhookSecret);
   if(body.enabled&&!hasStored&&!hasNew)return Response.json({error:'Enter both the Stripe secret key and webhook signing secret before enabling payments.'},{status:400});
   if(Boolean(body.secretKey)!==Boolean(body.webhookSecret))return Response.json({error:'Enter both Stripe secrets together, or leave both empty to keep the saved credentials.'},{status:400});
   const {secretKey,webhookSecret}=body,settings={...body} as Record<string,unknown>;
   delete settings.section;delete settings.secretKey;delete settings.webhookSecret;
   const encrypted=hasNew?encryptCredentials({secretKey,webhookSecret}):current.rows[0]?.secrets_encrypted||'';
   await database().query(`INSERT INTO operations_settings (id,settings,secrets_encrypted,updated_at) VALUES ('stripe',$1::jsonb,$2,now()) ON CONFLICT(id) DO UPDATE SET settings=EXCLUDED.settings,secrets_encrypted=EXCLUDED.secrets_encrypted,updated_at=now()`,[JSON.stringify(settings),encrypted]);
   return Response.json({ok:true});
  }
  return Response.json({error:'Unknown configuration section.'},{status:400});
 }catch(error){if(error instanceof z.ZodError)return Response.json({error:error.issues[0]?.message||'Check the configuration values.'},{status:400});return unavailable(error)}
}
