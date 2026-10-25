import {readConfiguration} from './app-configuration';
import {nativeBookingPolicySchema} from './native-booking-policy';
export async function loadNativeBookingPolicy(){return nativeBookingPolicySchema.parse((await readConfiguration('bookings_native')).settings)}
