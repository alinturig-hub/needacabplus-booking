import {captureJourneyNotifications} from '../lib/whatsapp-journey-producer';
import {database} from '../lib/database';
import {captureConfirmedNotifications,flushNotifications} from '../lib/whatsapp-gateway';
async function main(){const db=database();try{console.log('WHATSAPP_NOTIFICATION_WORKER',{captured:await captureConfirmedNotifications(db),journeyCaptured:await captureJourneyNotifications(db),accepted:await flushNotifications(db)});await db.query("DELETE FROM whatsapp_service_nonce WHERE created_at<now()-interval '1 day'");}catch{console.error('WHATSAPP_NOTIFICATION_WORKER_FAILED');process.exitCode=1;}finally{await db.end();}}void main();
