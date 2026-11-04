/** Fail-closed guard for full Next staging. This must never enable a production path. */
export function fullStageGuard(){
 const env=process.env;
 if(env.NOTIFICATIONS_FULL_STAGE!=='true'||env.STAGING_NO_SEND!=='true'||env.WHATSAPP_WORKSPACE_ID!=='notifications-fullstage')throw Error('FULL_STAGE_DISABLED');
 const u=new URL(env.DATABASE_URL||'');if(u.pathname!=='/notifications_fullstage'||u.hostname!==env.NOTIFICATIONS_STAGE_PG_HOST)throw Error('STAGE_DATABASE_REJECTED');
 for(const key of ['TAXICRM_SHARED_DATABASE_URL','TAXICRM_DATABASE_URL','BOOKING_ATTEMPTS_DATABASE_URL']){if(!env[key])continue;const alias=new URL(env[key]!);if(alias.hostname!==u.hostname||alias.port!==u.port||alias.pathname!==u.pathname)throw Error('STAGE_DATABASE_ALIAS_REJECTED')}
 if(['META_WHATSAPP_ACCESS_TOKEN','AUTOCAB_API_KEY','SMS_API_KEY'].some(k=>Boolean(env[k]))||env.WHATSAPP_JOURNEY_SENDING_ENABLED==='true'||env.META_WHATSAPP_SENDING_ENABLED==='true')throw Error('STAGE_PROVIDER_CONFIGURATION_REJECTED');
 for(const origin of [env.APP_ORIGIN,env.NOTIFICATIONS_NAC_ORIGIN,env.WHATSAPP_GATEWAY_ORIGIN]){if(!origin)continue;const url=new URL(origin);if(!((env.NOTIFICATIONS_STAGE_LOCAL_TEST==='true'&&u.hostname==='127.0.0.1'&&url.hostname==='127.0.0.1'&&url.protocol==='http:')||(url.protocol==='https:'&&/^[a-z0-9-]+\.144\.76\.63\.11\.sslip\.io$/.test(url.hostname))))throw Error('STAGE_ORIGIN_REJECTED')}
 return {workspace:'notifications-fullstage',scope:'notifications-fullstage:META:99999999999:99999999998'};
}
