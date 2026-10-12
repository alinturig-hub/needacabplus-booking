import {z} from 'zod';

const hhmm=z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const localTariffRulesSchema=z.object({
 zoneRules:z.array(z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(80),enabled:z.boolean(),pickupZone:z.string().trim().max(100),destinationZone:z.string().trim().max(100),amountPence:z.number().int().min(0).max(100000)}).strict().refine(rule=>Boolean(rule.pickupZone||rule.destinationZone),{message:'Select at least one zone for a zone rule.'})).max(50),
 airport:z.object({zoneNames:z.array(z.string().trim().min(1).max(100)).max(20),feePence:z.number().int().min(0).max(100000)}).strict(),
 timeRules:z.array(z.object({id:z.string().uuid(),name:z.string().trim().min(2).max(80),enabled:z.boolean(),days:z.array(z.number().int().min(0).max(6)).min(1).max(7),startTime:hhmm,endTime:hhmm,percent:z.number().min(0).max(100)}).strict()).max(30),
 waiting:z.object({freeMinutes:z.number().int().min(0).max(180),perMinutePence:z.number().int().min(0).max(10000)}).strict(),
}).strict();
export type LocalTariffRules=z.infer<typeof localTariffRulesSchema>;
export const defaultLocalTariffRules:LocalTariffRules={zoneRules:[],airport:{zoneNames:[],feePence:0},timeRules:[],waiting:{freeMinutes:0,perMinutePence:0}};
export type LocalTariffBase={basePence:number;perMilePence:number;minimumPence:number};

function timeRuleMatches(rule:LocalTariffRules['timeRules'][number],pickupLocal:string){
 if(!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(pickupLocal))return false;
 const date=new Date(`${pickupLocal.slice(0,10)}T12:00:00Z`);
 if(Number.isNaN(date.getTime()))return false;
 const day=date.getUTCDay(),minute=Number(pickupLocal.slice(11,13))*60+Number(pickupLocal.slice(14,16));
 const minutes=(value:string)=>Number(value.slice(0,2))*60+Number(value.slice(3,5));
 const start=minutes(rule.startTime),end=minutes(rule.endTime);
 return start<=end?rule.days.includes(day)&&minute>=start&&minute<end:minute>=start?rule.days.includes(day):minute<end&&rule.days.includes((day+6)%7);
}

export function calculateLocalFare(base:LocalTariffBase,rules:LocalTariffRules,input:{miles:number;pickupZone:string;destinationZone:string;pickupLocal:string;waitingMinutes:number}){
 if(!Number.isFinite(input.miles)||input.miles<0||!Number.isFinite(input.waitingMinutes)||input.waitingMinutes<0)throw new Error('Enter valid journey miles and waiting minutes.');
 const norm=(value:string)=>value.trim().toLocaleLowerCase('en-GB');
 const distancePence=Math.max(base.minimumPence,base.basePence+Math.round(input.miles*base.perMilePence));
 const zonePence=rules.zoneRules.filter(rule=>rule.enabled&&(!rule.pickupZone||norm(rule.pickupZone)===norm(input.pickupZone))&&(!rule.destinationZone||norm(rule.destinationZone)===norm(input.destinationZone))).reduce((sum,rule)=>sum+rule.amountPence,0);
 const airportPence=rules.airport.zoneNames.some(zone=>norm(zone)===norm(input.pickupZone)||norm(zone)===norm(input.destinationZone))?rules.airport.feePence:0;
 const activeTimeRules=rules.timeRules.filter(rule=>rule.enabled&&timeRuleMatches(rule,input.pickupLocal));
 const timePercent=Math.max(0,...activeTimeRules.map(rule=>rule.percent));
 const timePence=Math.round((distancePence+zonePence+airportPence)*timePercent/100);
 const waitingPence=Math.max(0,Math.ceil(input.waitingMinutes)-rules.waiting.freeMinutes)*rules.waiting.perMinutePence;
 return {distancePence,zonePence,airportPence,timePercent,timePence,waitingPence,totalPence:distancePence+zonePence+airportPence+timePence+waitingPence};
}
