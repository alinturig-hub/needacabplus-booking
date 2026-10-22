import {database} from './database';
import {defaultHackneyPolicy,validateHackneyPolicy} from './hackney-policy.mjs';
export async function loadHackneyPolicy(){
 const result=await database().query('SELECT settings FROM public.hackney_configuration WHERE id=true');
 return validateHackneyPolicy(result.rows[0]?.settings??defaultHackneyPolicy);
}
