import {database} from '@/lib/database';
import {isAdmin,unavailable} from '@/lib/security';
import {taxiCrmWebhookIngestDisabled,withTaxiCrmReadOnly} from '@/lib/taxicrm-database';

export const dynamic='force-dynamic';

const eventRoutes=[
 ['BookingCreated','/booking_created'],['BookingModified','/booking_modified'],
 ['BookingDispatched','/booking_dispatch'],['BookingDispatchAccepted','/booking_accepted'],
 ['BookingArrived','/dap'],['BookingPOB','/pob'],['BookingComplete','/booking_done'],
 ['BookingCancelled','/booking_cancelled'],['BookingNoFare','/booking_no_fare'],
 ['BookingRejected','/booking_rejected'],['BookingRecovered','/booking_recovered'],
 ['BookingRunningLate','/running_late'],['DriverShiftStartedEnded','/driver_shift_start'],
 ['VehicleTracksChanged','/tracks_change'],
] as const;

type SourceRow={event_type:string;count:number;last_received_at:Date|string|null};
type LocalRow={event_url_suffix:string;event_type:string;active:boolean;received_count:string|number;last_received_at:Date|string|null};

export async function GET(){
 if(!await isAdmin())return Response.json({error:'Administrator access required.'},{status:403});
 try{
  const [source,hooks,positions]=await Promise.all([
   withTaxiCrmReadOnly(async client=>(await client.query<SourceRow>(`SELECT "eventType" event_type,count(*)::int count,max("receivedAt") last_received_at
    FROM public."WebhookEvent" WHERE "receivedAt">=now()-interval '24 hours'
    GROUP BY "eventType"`)).rows),
   database().query<LocalRow>(`SELECT w.event_url_suffix,w.event_type,w.enabled AND p.enabled active,w.received_count,w.last_received_at
    FROM provider_webhooks w JOIN webhook_providers p ON p.id=w.provider_id`),
   database().query<{count:number;last_received_at:Date|string|null}>(`SELECT count(*)::int count,max(received_at) last_received_at
    FROM driver_positions WHERE recorded_at>=now()-interval '24 hours'`),
  ]);
  const byEvent=new Map(source.map(row=>[row.event_type,row]));
  const byPath=new Map(hooks.rows.map(row=>[row.event_url_suffix,row]));
  const bookingIngestPaused=taxiCrmWebhookIngestDisabled();
  const rows=eventRoutes.map(([eventType,path])=>{
   const origin=byEvent.get(eventType),local=byPath.get(path);
   const isTracking=eventType==='VehicleTracksChanged';
   return {eventType,endpoint:path,sourceCount24h:origin?.count||0,sourceLastAt:origin?.last_received_at||null,
    localConfigured:Boolean(local?.active),localConfiguredName:local?.event_type||null,localReceivedTotal:Number(local?.received_count||0),localLastAt:local?.last_received_at||null,
    mode:isTracking?'live-local':bookingIngestPaused?'taxicrm-primary':'local',
   };
  });
  return Response.json({checkedAt:new Date().toISOString(),bookingIngestPaused,trackedPositions24h:positions.rows[0]?.count||0,
   latestPositionAt:positions.rows[0]?.last_received_at||null,rows},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return unavailable(error)}
}
