export const DRIVER_SERVICE_TYPES=['ASAP','Priority','Prebook','Guarantee'] as const;
export type DriverServiceType=typeof DRIVER_SERVICE_TYPES[number];
