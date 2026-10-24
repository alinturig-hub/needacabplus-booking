import {DRIVER_SERVICE_TYPES,type DriverServiceType} from '@/lib/driver-service-types';
import DriverWorkspace from '../workspace';
export const metadata={title:'Driver App · Design preview',referrer:'strict-origin' as const};
export default async function DriverPreview({searchParams}:{searchParams:Promise<{service?:string}>}){const {service}=await searchParams;const type=DRIVER_SERVICE_TYPES.includes(service as DriverServiceType)?service as DriverServiceType:'ASAP';return <DriverWorkspace preview previewService={type}/>}
