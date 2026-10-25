export const endpointGroups={bookings:'Bookings',addresses:'Addresses & places',fleet:'Drivers & vehicles',accounts:'Accounts & customers',zones:'Zones',pricing:'Pricing & tariffs',other:'Other APIs'} as const;
export type EndpointGroup=keyof typeof endpointGroups;
export function endpointGroup(endpoint:{action_key:string;path:string}):EndpointGroup{
 const text=`${endpoint.action_key} ${endpoint.path}`.toLowerCase();
 if(/address|places?|geocod/.test(text))return'addresses';
 if(/zones?/.test(text))return'zones';
 if(/tariff|pricing|fare/.test(text))return'pricing';
 if(/drivers?|vehicles?|fleet|cars?\b/.test(text))return'fleet';
 if(/accounts?|customers?/.test(text))return'accounts';
 if(/booking|quotes?/.test(text))return'bookings';
 return'other';
}
