import {BookOpen, CarFront, CreditCard, Database, Settings2, Sparkles, type LucideIcon} from 'lucide-react';

export type AdminMenuItem = {label: string; href: string; description: string; categoryOnly?: boolean};
export type AdminMenuGroup = {id: string; label: string; description: string; icon: LucideIcon; items: AdminMenuItem[]};

export const adminMenuGroups: AdminMenuGroup[] = [
  {id: 'assistant', label: 'AI Assistant', description: 'Ask questions about bookings, drivers and vehicles.', icon: Sparkles, items: [
    {label: 'Ask assistant', href: '/admin/assistant', description: 'Search operational records and get concise answers.'},
  ]},
  {id: 'bookings', label: 'Booking', description: 'Monitor bookings, find trips and manage booking rules.', icon: BookOpen, items: [
    {label: 'Booking rules', href: '/admin/configuration#bookings', description: 'Configure booking sources, payment options and pickup timing.'},
    {label: 'Live overview', href: '/admin/live-overview', description: 'See current booking activity, statuses and service outcomes.'},
    {label: 'Search bookings', href: '/admin/bookings', description: 'Find trips by reference, passenger, address, driver or vehicle.'},
  ]},
  {id: 'fleet', label: 'Drivers / Vehicles', description: 'Review drivers and the vehicles in your fleet.', icon: CarFront, items: [
    {label: 'Drivers', href: '/admin/drivers', description: 'Browse driver records and synchronization status.'},
    {label: 'Fleet Management', href: '/admin/vehicles', description: 'Manage car types, vehicles and document expiry.', categoryOnly: true},
  ]},
  {id: 'general-settings', label: 'General Settings', description: 'Manage people, integrations and the Admin workspace.', icon: Settings2, items: [
    {label: 'Companies', href: '/admin/companies', description: 'Manage company records and access.'},
    {label: 'Import & Export', href: '/admin/import-export', description: 'Move supported data into and out of the system.'},
    {label: 'Maps & APIs', href: '/admin/maps-apis', description: 'Configure maps, address search and API connections.'},
    {label: 'User Interface', href: '/admin/interface', description: 'Choose appearance, display density and motion.'},
    {label: 'Users', href: '/admin/users', description: 'Create and manage Admin and Dispatcher accounts.'},
    {label: 'Webhooks', href: '/admin/configuration#webhooks', description: 'View providers, event URLs and received webhook activity.'},
  ]},
  {id: 'settings', label: 'Other Settings', description: 'Set security, dispatch and communication preferences.', icon: Database, items: [
    {label: 'Customer sign-in', href: '/admin/configuration#identity', description: 'Set up customer registration and sign-in methods.'},
    {label: 'Dispatch rules', href: '/admin/configuration#dispatch', description: 'Configure driver search and dispatch timing.'},
    {label: 'Security & 2FA', href: '/admin/configuration#general', description: 'Manage account security and two-factor authentication.'},
    {label: 'SMS gateway', href: '/admin/configuration#sms', description: 'Configure messaging and test delivery.'},
    {label: 'TaxiCRM database', href: '/admin/configuration#taxicrm', description: 'Inspect the shared TaxiCRM data connection.'},
  ]},
  {id: 'pricing', label: 'Pricing & Payments', description: 'Configure fares, promotions and payment connections.', icon: CreditCard, items: [
    {label: 'Fare sources', href: '/admin/configuration#pricing', description: 'Configure Autocab fares and the Need A Cab Plus base tariff.'},
    {label: 'Pricing rules & promotions', href: '/admin/configuration#pricing-rules', description: 'Configure shared service additions, membership, marketing and demand.'},
    {label: 'Payments', href: '/admin/configuration#payments', description: 'Configure payment providers and checkout settings.'},
  ]},
];
