import type {Metadata} from 'next';
import DriverWorkspace from './workspace';
export const metadata:Metadata={title:'Need A Cab Plus · Driver',referrer:'strict-origin',manifest:'/driver/manifest.webmanifest'};
export default async function DriverPage({searchParams}:{searchParams:Promise<{invite?:string}>}){const {invite}=await searchParams;return <DriverWorkspace invite={invite}/>}
