export type AssignmentData={id:string|null;driver_data:Record<string,unknown>|null;vehicle_data:Record<string,unknown>|null};
export function bookingAssignmentPresentation(row:Record<string,unknown>):Omit<AssignmentData,'id'>;
export const bookingAssignmentsSql:string;
