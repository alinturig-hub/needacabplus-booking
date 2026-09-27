export function validateStripeKeys(mode:'test'|'live',publishableKey:string,secretKey:string){
 if(!publishableKey.startsWith(`pk_${mode}_`)||!secretKey.startsWith(`sk_${mode}_`))throw new Error(`Configure matching Stripe ${mode} publishable and secret keys.`);
}
export function mergeStripeSecrets(mode:'test'|'live',previousMode:string|undefined,stored:Record<string,string>,supplied:{secretKey?:string;webhookSecret?:string}){
 const retained=mode===previousMode?stored:{};
 return {secretKey:supplied.secretKey||retained.secretKey||'',webhookSecret:supplied.webhookSecret||retained.webhookSecret||''};
}
