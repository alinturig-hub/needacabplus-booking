import type {Metadata} from 'next';
import {notFound} from 'next/navigation';
import {validStreetPreview,previewExpiresAt} from '@/lib/street-manager/preview-access';
import RoadworksPreview from '../preview';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Plymouth roadworks | Need A Cab Plus',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{token:string}>}){
 const {token}=await params;if(!validStreetPreview(token))notFound();
 return <RoadworksPreview token={token} expiresAt={previewExpiresAt}/>;
}
