type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : undefined;
const field = (value: RecordValue, name: string) => Object.entries(value).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];

// Only traverse booking envelopes, never vehicle/driver/address objects whose
// capabilities describe availability rather than the booking's requirements.
export function bookingRequirements(payload: unknown): RecordValue {
 const result: RecordValue = {};
 function visit(value: unknown, depth: number) {
  const record = object(value); if (!record || depth > 4) return;
  for (const wrapper of ['data', 'metadata', 'booking']) visit(field(record, wrapper), depth + 1);
  for (const name of ['capabilities', 'passengers', 'driverConstraints', 'vehicleConstraints']) {
   const value = field(record, name);
   if (value !== undefined && value !== null) result[name] = value;
  }
 }
 visit(payload, 0);
 return result;
}
