import {notFound} from 'next/navigation';
import {loadEbooker} from '@/lib/ebookers';
import {isAdmin} from '@/lib/security';
import Ebooker from './workspace';
import './ebooker.css';
export const dynamic='force-dynamic';
export default async function Page({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<{preview?:string}>}){
 const preview=(await searchParams).preview==='1'&&await isAdmin();
 const config=await loadEbooker((await params).slug,preview);if(!config)notFound();
 return <Ebooker config={config} preview={preview}/>;
}
