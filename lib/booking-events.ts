import {EventEmitter} from 'node:events';

const shared=globalThis as unknown as {needACabBookingEvents?:EventEmitter};
export const bookingEvents=shared.needACabBookingEvents??(shared.needACabBookingEvents=new EventEmitter());
bookingEvents.setMaxListeners(100);
