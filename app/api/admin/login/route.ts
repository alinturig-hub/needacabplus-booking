import {z} from 'zod';
import {setAdminSession,validCredentials} from '@/lib/security';

const credentials=z.object({email:z.string().email(),password:z.string().min(1).max(200)}).strict();

export async function POST(request:Request){
 let body;
 try{body=credentials.parse(await request.json())}
 catch{return Response.json({error:'Enter your admin email and password.'},{status:400})}
 if(!validCredentials(body.email,body.password))return Response.json({error:'Incorrect email or password.'},{status:401});
 await setAdminSession();
 return Response.json({ok:true});
}
