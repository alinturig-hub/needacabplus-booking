/** Native routes stay available. These routes execute or configure Autocab-specific work. */
export function autocabRoute(path:string,method:string,model:string|null=null){
 if(path.startsWith('/api/admin/autocab')||path.startsWith('/api/webhooks/autocab/')||path.startsWith('/api/internal/autocab-'))return true;
 if(['/api/admin/drivers','/api/admin/vehicles','/api/admin/booking-capabilities','/api/admin/capability-quote-test','/api/admin/booking-reference-audit','/api/admin/dispatch-simulation','/api/customer/booking-payment'].includes(path))return true;
 if(path.startsWith('/api/drivers/live')||['/api/admin/dispatch-live','/api/admin/dispatch-analytics','/api/dispatch/assistant'].includes(path))return true;
 if(path==='/api/admin/quote-settings')return model!=='native';
 if(path==='/api/bookings'&&method==='POST')return true;
 if(path.startsWith('/api/addresses'))return true;
 return false;
}
