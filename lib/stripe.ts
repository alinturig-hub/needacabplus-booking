import Stripe from 'stripe';
import {database} from '@/lib/database';
import {decryptCredentials} from '@/lib/credentials';
import {validateStripeKeys} from './stripe-mode';

type StripeSettings={enabled?:boolean;mode?:'test'|'live';publishableKey?:string;currency?:string;captureMethod?:'automatic'|'manual';statementDescriptor?:string};

export async function stripeConfiguration(){
 const result=await database().query<{settings:StripeSettings;secrets_encrypted:string}>('SELECT settings,secrets_encrypted FROM operations_settings WHERE id=$1',['stripe']);
 const row=result.rows[0];if(!row?.settings.enabled||!row.secrets_encrypted)throw new Error('Card payments are not enabled yet.');
 const secrets=decryptCredentials(row.secrets_encrypted);if(!secrets.secretKey)throw new Error('Stripe secret key is not configured.');
 validateStripeKeys(row.settings.mode||'test',row.settings.publishableKey||'',secrets.secretKey);
 return{settings:row.settings,stripe:new Stripe(secrets.secretKey),webhookSecret:secrets.webhookSecret||''};
}
