/** Application ownership convention, separate from Meta's UTILITY/MARKETING category. */
export function isBookingTemplate(name:unknown):boolean {
 return typeof name==='string' && /^nac_(booking|driver|journey)_[a-z0-9_]+$/.test(name);
}
export const bookingTemplatesUrl='https://admin.needacabplus.app/admin/notifications?tab=Templates';
