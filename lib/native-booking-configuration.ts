import {readConfiguration} from './app-configuration';
import{bookingPolicySchema}from'./booking-policy';
import {nativeBookingPolicySchema} from './native-booking-policy';
export async function loadNativeBookingPolicy(){return nativeBookingPolicySchema.parse((await readConfiguration('bookings_native')).settings)}

export async function loadActiveBookingPolicy(){const[{autocabIntegrationEnabled},{loadBookingPolicy}]=await Promise.all([import('./integration-control'),import('./app-configuration')]);return await autocabIntegrationEnabled()?loadBookingPolicy():bookingPolicySchema.parse({...await loadNativeBookingPolicy(),quietAsapRequiresPaidMembership:false})}
