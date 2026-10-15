import {z} from 'zod';

const money=z.number().int().min(0).max(100000);
const optionalText=z.string().trim().max(100);
const hhmm=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const isoDate=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const tariffRuleSchema=z.object({
 id:z.string().uuid(),name:z.string().trim().min(2).max(80),enabled:z.boolean(),
 category:z.enum(['vehicle','distance','zone','schedule','date','waiting','custom']),
 vehicle:z.enum(['any','saloon','estate','xl']),
 pickupZone:optionalText,destinationZone:optionalText,eitherZone:optionalText,
 minMiles:z.number().min(0).max(1000).nullable(),maxMiles:z.number().min(0).max(1000).nullable(),
 startDate:isoDate.or(z.literal('')),endDate:isoDate.or(z.literal('')),
 days:z.array(z.number().int().min(0).max(6)).max(7),startTime:hhmm.or(z.literal('')),endTime:hhmm.or(z.literal('')),
 direction:z.enum(['add','subtract']),mode:z.enum(['fixed','percent']),
 target:z.enum(['start','distance','minimum','total','both','waiting']),
 value:z.number().min(0).max(100000),
}).strict().superRefine((rule,ctx)=>{
 if(rule.minMiles!==null&&rule.maxMiles!==null&&rule.maxMiles<=rule.minMiles)ctx.addIssue({code:'custom',message:'Maximum miles must exceed minimum miles.'});
 if(rule.startDate&&rule.endDate&&rule.endDate<rule.startDate)ctx.addIssue({code:'custom',message:'End date must follow start date.'});
 if(rule.mode==='percent'&&rule.value>100)ctx.addIssue({code:'custom',message:'Percentage cannot exceed 100.'});
 if(Boolean(rule.startTime)!==Boolean(rule.endTime))ctx.addIssue({code:'custom',message:'Set both start and end times.'});
 if(rule.startTime&&rule.endTime&&!rule.days.length)ctx.addIssue({code:'custom',message:'Select at least one day.'});
 if(rule.days.length===0)ctx.addIssue({code:'custom',message:'Select at least one day.'});
});

export const tariffPlanSchema=z.object({
 version:z.literal(2),name:z.string().trim().min(2).max(80),
 base:z.object({startPence:money,minimumPence:money}).strict(),
 waiting:z.object({freeMinutes:z.number().int().min(0).max(180),perMinutePence:money}).strict().default({freeMinutes:0,perMinutePence:0}),
 distanceBands:z.array(z.object({id:z.string().uuid(),toMiles:z.number().positive().max(1000).nullable(),perMilePence:money}).strict()).min(1).max(30),
 rules:z.array(tariffRuleSchema).max(150),
}).strict().superRefine((plan,ctx)=>{
 let previous=0;
 plan.distanceBands.forEach((band,index)=>{
  if(band.toMiles===null&&index!==plan.distanceBands.length-1)ctx.addIssue({code:'custom',message:'Only the last distance band may be unlimited.'});
  if(band.toMiles!==null){if(band.toMiles<=previous)ctx.addIssue({code:'custom',message:'Distance thresholds must increase.'});previous=band.toMiles}
 });
 if(plan.distanceBands.at(-1)?.toMiles!==null)ctx.addIssue({code:'custom',message:'The last distance band must be unlimited.'});
 if(new Set(plan.rules.map(rule=>rule.id)).size!==plan.rules.length)ctx.addIssue({code:'custom',message:'Rule IDs must be unique.'});
});

export type TariffPlan=z.infer<typeof tariffPlanSchema>;
export type TariffRule=z.infer<typeof tariffRuleSchema>;
export type TariffVehicle=TariffRule['vehicle'];
export const defaultTariffPlan:TariffPlan={version:2,name:'Standard',base:{startPence:300,minimumPence:600},waiting:{freeMinutes:0,perMinutePence:0},distanceBands:[{id:'00000000-0000-4000-8000-000000000001',toMiles:null,perMilePence:180}],rules:[]};

export function newTariffRule(category:TariffRule['category']):TariffRule{
 return {id:crypto.randomUUID(),name:({vehicle:'Vehicle supplement',distance:'Distance supplement',zone:'Zone supplement',schedule:'Time supplement',date:'Date supplement',waiting:'Waiting supplement',custom:'Custom adjustment'} as const)[category],enabled:true,category,vehicle:'any',pickupZone:'',destinationZone:'',eitherZone:'',minMiles:null,maxMiles:null,startDate:'',endDate:'',days:[0,1,2,3,4,5,6],startTime:'',endTime:'',direction:'add',mode:'fixed',target:category==='waiting'?'waiting':'total',value:0};
}

export type TariffQuoteInput={vehicle:TariffVehicle;miles:number;waitingMinutes:number;pickupZone:string;destinationZone:string;pickupLocal:string};
export type TariffLine={id:string;name:string;amountPence:number;affects:'fare'|'minimum'|'waiting'};

function matches(rule:TariffRule,input:TariffQuoteInput){
 const norm=(value:string)=>value.trim().toLocaleLowerCase('en-GB');
 if(rule.vehicle!=='any'&&rule.vehicle!==input.vehicle)return false;
 if(rule.pickupZone&&norm(rule.pickupZone)!==norm(input.pickupZone))return false;
 if(rule.destinationZone&&norm(rule.destinationZone)!==norm(input.destinationZone))return false;
 if(rule.eitherZone&&norm(rule.eitherZone)!==norm(input.pickupZone)&&norm(rule.eitherZone)!==norm(input.destinationZone))return false;
 if(rule.minMiles!==null&&input.miles<rule.minMiles)return false;
 if(rule.maxMiles!==null&&input.miles>=rule.maxMiles)return false;
 const local=input.pickupLocal;
 if((rule.startDate||rule.endDate||rule.startTime||rule.endTime||rule.days.length<7)&&!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(local))return false;
 if(rule.startDate&&local.slice(0,10)<rule.startDate)return false;
 if(rule.endDate&&local.slice(0,10)>rule.endDate)return false;
 if(!rule.startTime&&rule.days.length<7&&!rule.days.includes(new Date(`${local.slice(0,10)}T12:00:00Z`).getUTCDay()))return false;
 if(rule.startTime&&rule.endTime){
  const day=new Date(`${local.slice(0,10)}T12:00:00Z`).getUTCDay();
  const current=local.slice(11),overnight=rule.startTime>rule.endTime;
  if(overnight){if(!((current>=rule.startTime&&rule.days.includes(day))||(current<rule.endTime&&rule.days.includes((day+6)%7))))return false}
  else if(!(current>=rule.startTime&&current<rule.endTime&&rule.days.includes(day)))return false;
 }
 return true;
}

export function calculateTariffPlan(plan:TariffPlan,input:TariffQuoteInput){
 if(!Number.isFinite(input.miles)||input.miles<0||input.miles>1000)throw new Error('Journey miles must be between 0 and 1000.');
 if(!Number.isFinite(input.waitingMinutes)||input.waitingMinutes<0||input.waitingMinutes>10000)throw new Error('Waiting minutes must be between 0 and 10000.');
 let previous=0,distancePence=0;
 for(const band of plan.distanceBands){const used=Math.max(0,Math.min(input.miles,band.toMiles??input.miles)-previous);distancePence+=Math.round(used*band.perMilePence);previous=band.toMiles??input.miles;if(previous>=input.miles)break}
 const startPence=plan.base.startPence;
 const basePence=startPence+distancePence;
 const chargeableMinutes=Math.max(0,Math.ceil(input.waitingMinutes)-plan.waiting.freeMinutes);
 const waitingPence=chargeableMinutes*plan.waiting.perMinutePence;
 const lines:TariffLine[]=[];
 let minimumPence=plan.base.minimumPence;
 let adjustmentPence=0;
 let waitingAdjustmentPence=0;
 for(const rule of plan.rules){
  if(!rule.enabled||!matches(rule,input))continue;
  const factor=rule.mode==='percent'?rule.value/100:1;
  const fixed=rule.value;
  let amount=0;
  if(rule.target==='minimum'){
   const delta=rule.mode==='percent'?Math.round(minimumPence*factor):fixed;
   minimumPence=Math.max(0,minimumPence+(rule.direction==='add'?delta:-delta));
   lines.push({id:rule.id,name:rule.name,amountPence:rule.direction==='add'?delta:-delta,affects:'minimum'});continue;
  }
  if(rule.target==='waiting'){
   const delta=rule.mode==='percent'?Math.round(waitingPence*factor):chargeableMinutes*fixed;
   const signed=rule.direction==='add'?delta:-delta;
   waitingAdjustmentPence+=signed;
   lines.push({id:rule.id,name:rule.name,amountPence:signed,affects:'waiting'});continue;
  }
  if(rule.target==='start'||rule.target==='both')amount+=rule.mode==='percent'?Math.round(startPence*factor):fixed;
  if(rule.target==='distance'||rule.target==='both')amount+=rule.mode==='percent'?Math.round(distancePence*factor):Math.round(input.miles*fixed);
  if(rule.target==='total')amount+=rule.mode==='percent'?Math.round(basePence*factor):fixed;
  if(rule.direction==='subtract')amount=-amount;
  adjustmentPence+=amount;
  lines.push({id:rule.id,name:rule.name,amountPence:amount,affects:'fare'});
 }
 const beforeMinimum=Math.max(0,basePence+adjustmentPence);
 const minimumAdjustmentPence=Math.max(0,minimumPence-beforeMinimum);
 const waitingTotalPence=Math.max(0,waitingPence+waitingAdjustmentPence);
 return {startPence,distancePence,basePence,chargeableMinutes,waitingPence,waitingTotalPence,lines,minimumPence,minimumAdjustmentPence,totalPence:beforeMinimum+minimumAdjustmentPence+waitingTotalPence};
}
