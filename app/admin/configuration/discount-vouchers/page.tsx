import{redirect}from'next/navigation';
import{isAdmin}from'@/lib/security';
import AdminWorkspace from'../../admin-workspace';
import TaxiMilesWorkspace from'../taxi-miles/workspace';
import'../configuration.css';
export const dynamic='force-dynamic';
export default async function Page(){if(!await isAdmin())redirect('/admin-login');return <AdminWorkspace><TaxiMilesWorkspace initialPanel="vouchers"/></AdminWorkspace>}
