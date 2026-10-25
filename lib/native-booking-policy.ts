import {z} from 'zod';
// Independent native settings: Autocab account IDs and capabilities are deliberately absent.
export const nativeBookingPolicySchema=z.object({
 cashEnabled:z.boolean().default(true),cardEnabled:z.boolean().default(true),paymentMethod:z.enum(['card','cash']).default('card'),
 liveBookingsEnabled:z.literal(false).default(false),
 priorityDelayMinutes:z.number().int().min(0).max(180).default(0),minPrebookMinutes:z.number().int().min(1).max(10080).default(30),
 priorityRequiresPaidMembership:z.boolean().default(true),guaranteeRequiresPaidMembership:z.boolean().default(true),loyaltyRequiresPaidMembership:z.boolean().default(true),
}).strict();
export type NativeBookingPolicy=z.infer<typeof nativeBookingPolicySchema>;
export const defaultNativeBookingPolicy=nativeBookingPolicySchema.parse({});
