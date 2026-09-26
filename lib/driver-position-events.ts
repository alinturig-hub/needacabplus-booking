import {EventEmitter} from 'node:events';

const shared=globalThis as unknown as {needACabDriverPositionEvents?:EventEmitter};
export const driverPositionEvents=shared.needACabDriverPositionEvents??(shared.needACabDriverPositionEvents=new EventEmitter());
driverPositionEvents.setMaxListeners(100);
