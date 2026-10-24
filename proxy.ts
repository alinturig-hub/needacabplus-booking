import {NextRequest,NextResponse} from 'next/server';

const canonicalHosts:Record<string,string>={
 'www.admin.needacabplus.app':'admin.needacabplus.app',
 'www.drivers.needacabplus.app':'drivers.needacabplus.app',
 'www.dispatch.needacabplus.app':'dispatch.needacabplus.app',
 'www.webapp.needacabplus.app':'webapp.needacabplus.app',
 'www.webhook.needacabplus.app':'webhook.needacabplus.app',
 'www.inbound.needacabplus.app':'inbound.needacabplus.app'
};

export function proxy(request:NextRequest){
 const host=(request.headers.get('x-forwarded-host')||request.headers.get('host')||'').split(',')[0].trim().split(':')[0].toLowerCase();
 const canonical=canonicalHosts[host];
 if(canonical){const url=request.nextUrl.clone();url.protocol='https:';url.hostname=canonical;url.port='';return NextResponse.redirect(url,308)}
 const path=request.nextUrl.pathname;
 if(host==='drivers.needacabplus.app'&&path==='/')return NextResponse.rewrite(new URL('/driver',request.url));
 if(host==='dispatch.needacabplus.app'&&path==='/')return NextResponse.redirect(new URL('/dispatch',request.url));
 if(host==='admin.needacabplus.app'||host==='webapp.needacabplus.app'){
  const destination=path==='/admin/dispatcher'?'/dispatch':path==='/admin/dispatch'?'/dispatch/analysis':path==='/admin/live-map'?'/dispatch/map':path==='/dispatch'||path.startsWith('/dispatch/')?path:null;
  if(destination){
   const dispatchHostReady=process.env.DISPATCH_DOMAIN_ENABLED==='true';
   if(!dispatchHostReady&&host==='admin.needacabplus.app'&&path===destination)return NextResponse.next();
   const url=request.nextUrl.clone();url.pathname=destination;url.protocol='https:';url.hostname=dispatchHostReady?'dispatch.needacabplus.app':'admin.needacabplus.app';url.port='';
   return NextResponse.redirect(url,308);
  }
 }
 if((host==='dispatch.needacabplus.app'||host==='drivers.needacabplus.app')&&(path==='/admin-login'||path==='/admin'||path.startsWith('/admin/'))||host==='webapp.needacabplus.app'&&(path==='/admin-login'||path==='/admin'||path.startsWith('/admin/'))){
  const url=request.nextUrl.clone();url.protocol='https:';url.hostname='admin.needacabplus.app';url.port='';return NextResponse.redirect(url,308);
 }
 return NextResponse.next();
}

export const config={matcher:['/((?!_next/static|_next/image|favicon.ico).*)']};
