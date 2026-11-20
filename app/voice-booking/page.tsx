import type {Metadata} from 'next';
import VoiceBooking from './voice-booking';
export const metadata:Metadata={title:'Book a taxi · Need A Cab Plus',robots:{index:false,follow:false}};
export default function Page(){return <VoiceBooking/>;}
