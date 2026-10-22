export type AssignmentData={id:string|null;driver_data:Record<string,unknown>|null;vehicle_data:Record<string,unknown>|null};
export function bookingAssignmentPresentation(row:Record<string,unknown>):Omit<AssignmentData,'id'>&Record<string,unknown>;
export const bookingAssignmentsSql:string;

export function bookingDetailPresentation(row:Record<string,unknown>):Record<string,unknown>;
