import {z} from 'zod';
import {database} from '@/lib/database';
import {loadNativeBookingPolicy} from '@/lib/native-booking-configuration';
import {isAdmin,sameOrigin,unavailable} from '@/lib/security';
import {nativeDispatchRulesSchema,effectiveNativeRules,startRound,type NativeState} from '@/lib/native-dispatch-engine';
export const dynamic='force-dynamic';
async function configuration(){const [saved,booking]=await Promise.all([database().query("SELECT settings->'nativeRules' rules FROM operations_settings WHERE id='dispatch'"),loadNativeBookingPolicy()]);const rules=nativeDispatchRulesSchema.parse(saved.rows[0]?.rules??{});return{rules,cashEnabled:booking.cashEnabled,effectiveRules:effectiveNativeRules(rules,booking.cashEnabled),liveDeliveryReady:false}}
export async function GET(){if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{return Response.json(await configuration(),{headers:{'Cache-Control':'no-store'}})}catch(e){return unavailable(e)}}
export async function PUT(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{const rules=nativeDispatchRulesSchema.parse(await request.json());await database().query("INSERT INTO operations_settings(id,settings,updated_at) VALUES('dispatch',jsonb_build_object('nativeRules',$1::jsonb),now()) ON CONFLICT(id) DO UPDATE SET settings=jsonb_set(operations_settings.settings,'{nativeRules}',$1::jsonb),updated_at=now()",[JSON.stringify(rules)]);return Response.json({ok:true,...await configuration()})}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Check dispatch rule values.'},{status:400});return unavailable(e)}}
const scenarioSchema=z.object({driverCount:z.number().int().min(1).max(20).default(5)}).strict();
export async function POST(request:Request){if(!sameOrigin(request)||!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});try{
 const {driverCount}=scenarioSchema.parse(await request.json()),config=await configuration(),now=Date.now();
 const state:NativeState={cashEnabled:config.cashEnabled,drivers:Array.from({length:driverCount},(_,i)=>({id:`Example driver ${i+1}`,zoneId:'example-zone',enteredAt:now-60000+i*1000,queuedAt:now-60000+i*1000,gpsAt:now,latitude:50.3755,longitude:-4.1427+i*.001,available:true,noFare:false,bookingId:null})),jobs:[{id:'example-booking',zoneId:'example-zone',driverId:null,pob:false,status:'waiting',latitude:50.3755,longitude:-4.1427}],rounds:[],eventIds:[]};
 const round=startRound(state,'example-booking',config.effectiveRules,now);return Response.json({simulationOnly:true,round,offers:round.offers.map(o=>({...o,opensAfterSeconds:(o.opensAt-now)/1000,expiresAfterSeconds:(o.expiresAt-now)/1000}))});
 }catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:'Invalid simulation request.'},{status:400});return unavailable(e)}}
