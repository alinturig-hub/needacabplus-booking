import {getChatGPTUser} from '@/app/chatgpt-auth';
export const ADMIN_EMAIL='admin@needacabplus.app';
export async function isAdmin(){const user=await getChatGPTUser();return !!user&&user.email.trim().toLowerCase()===ADMIN_EMAIL;}
export function sameOrigin(request:Request){const origin=request.headers.get('origin');return !!origin&&origin===new URL(request.url).origin;}
export function unavailable(error:unknown){console.error('Booking service failure',error);return Response.json({error:'Service temporarily unavailable. Your details have been kept; please try again.'},{status:503});}
