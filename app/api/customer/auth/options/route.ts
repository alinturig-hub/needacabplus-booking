import {loadIdentityPolicy} from '@/lib/app-configuration';
export async function GET(){try{const p=await loadIdentityPolicy();return Response.json({google:p.googleEnabled,apple:p.appleEnabled},{headers:{'Cache-Control':'no-store'}})}catch{return Response.json({google:false,apple:false})}}
