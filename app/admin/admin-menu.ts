import {Activity,BookOpen,CarFront,Settings2,SlidersHorizontal,UsersRound,type LucideIcon} from 'lucide-react';
export type AdminMenuItem={label:string;href:string;description:string;categoryOnly?:boolean};
export type AdminMenuGroup={id:string;label:string;description:string;icon:LucideIcon;items:AdminMenuItem[]};
export const adminMenuGroups:AdminMenuGroup[]=[
 {id:'dispatch',label:'Dispatch',description:'Configure dispatch rules, driver eligibility, offer timing and simulation. Dispatchers work in the separate Dispatch application.',icon:Activity,items:[
  {label:'Zones — Draft & Live',href:'/admin/zones',description:'Draw zone boundaries, save drafts and publish a separate live version.'},
  {label:'Rules & simulation',href:'/admin/dispatch-rules',description:'Configure driver selection and offer timing, and test dispatch rules.'},
 ]},
 {id:'customers',label:'Customers',description:'Customer access, service eligibility and membership configuration.',icon:UsersRound,items:[
  {label:'Customer access',href:'/admin/customers/access',description:'Customer registration and sign-in methods.'},
  {label:'Memberships & services',href:'/admin/customers/memberships',description:'Configure membership tiers, benefits and service eligibility.'},
 ]},
 {id:'reports',label:'Reports',description:'Search bookings, inspect trip history and review operational results.',icon:BookOpen,items:[
  {label:'Bookings',href:'/admin/bookings',description:'Search all booking statuses, inspect details and export filtered results.'},
  {label:'Booking overview',href:'/admin/live-overview',description:'Booking totals, statuses and service outcomes.'},
  {label:'Import & export',href:'/admin/import-export',description:'Supported data imports and booking exports.'},
 ]},
 {id:'operations',label:'Operations',description:'Manage the fleet, Hackney services and operational resources.',icon:CarFront,items:[
  {label:'Fleet — Drivers',href:'/admin/drivers',description:'Driver records and synchronization status.'},
  {label:'Fleet — Vehicles',href:'/admin/vehicles',description:'Vehicle types, fleet records and documents.'},
  {label:'Hackney',href:'/admin/hackney',description:'Hackney booking groups, activity and classification settings.'},
 ]},
 {id:'configuration',label:'Configuration',description:'Configure integrations, booking rules, fares and operational services.',icon:SlidersHorizontal,items:[
  {label:'Integrations',href:'/admin/configuration/integrations',description:'Independent Autocab and TaxiCRM integration workspaces.'},
  {label:'Booking rules',href:'/admin/configuration#bookings',description:'Booking sources, payment options and pickup timing.'},
  {label:'Fare sources',href:'/admin/configuration#pricing',description:'Autocab live fares and local tariffs.'},
  {label:'Pricing rules & promotions',href:'/admin/configuration#pricing-rules',description:'Service pricing, membership and demand rules.'},
  {label:'Payments',href:'/admin/configuration#payments',description:'Payment providers and checkout settings.'},
  {label:'Maps & places',href:'/admin/configuration#maps',description:'Maps, address search and GPS lookup.'},
  {label:'Communications',href:'/admin/configuration#sms',description:'Messaging connections and delivery tests.'},
 ]},
 {id:'settings',label:'Settings',description:'Manage modules, company access, users, security and workspace appearance.',icon:Settings2,items:[
  {label:'Modules',href:'/admin/settings/modules',description:'Module catalogue, submodules and configuration entry points.'},
  {label:'Companies',href:'/admin/companies',description:'Company records and access.'},
  {label:'Users & roles',href:'/admin/users',description:'Administrator and dispatcher accounts.'},
  {label:'Security & 2FA',href:'/admin/configuration#general',description:'Account security and two-factor authentication.'},
  {label:'User interface',href:'/admin/interface',description:'Appearance, density and motion.'},
 ]},
];
export const legacyAdminCategories:Record<string,string>={assistant:'/admin/configuration/integrations/taxicrm',bookings:'/admin/category/reports',fleet:'/admin/category/operations','general-settings':'/admin/category/settings',pricing:'/admin/category/configuration'};
