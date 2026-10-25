import{redirect,notFound}from'next/navigation';
import{isAdmin}from'@/lib/security';
import AdminWorkspace from'../../admin-workspace';
import ModelFeatureWorkspace from'../model-feature-workspace';
import{modelFeatures,type ModelFeature}from'@/lib/model-features';
import'../configuration.css';
export const dynamic='force-dynamic';
export default async function FeaturePage({params}:{params:Promise<{feature:string}>}){if(!await isAdmin())redirect('/admin-login');const{feature}=await params;if(!Object.hasOwn(modelFeatures,feature))notFound();return <AdminWorkspace><main className="configuration-hub"><div className="configuration-panel"><ModelFeatureWorkspace feature={feature as ModelFeature}/></div></main></AdminWorkspace>}
