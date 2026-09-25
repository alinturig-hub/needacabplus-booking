import {NextRequest,NextResponse} from 'next/server';

const canonicalHosts:Record<string,string>={
 'www.admin.needacabplus.app':'admin.needacabplus.app',
 'www.webapp.needacabplus.app':'webapp.needacabplus.app',
 'www.webhook.needacabplus.app':'webhook.needacabplus.app',
 'www.inbound.needacabplus.app':'inbound.needacabplus.app'
};

export function proxy(request:NextRequest){
 const host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||'').split(',')[0].trim().split(':')[0].toLowerCase();
 const canonical=canonicalHosts[host];
 if(!canonical)return NextResponse.next();
 const url=request.nextUrl.clone();url.protocol='https:';url.hostname=canonical;url.port='';
 return NextResponse.redirect(url,308);
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
