import {timingSafeEqual} from 'node:crypto';
export function workerAuthorized(request:Request){const configured=process.env.WHATSAPP_WORKER_SECRET||'',provided=request.headers.get('x-whatsapp-worker-secret')||'';return process.env.WHATSAPP_SHARED_ENABLED==='true'&&configured.length>=32&&configured.length===provided.length&&timingSafeEqual(Buffer.from(configured),Buffer.from(provided));}
