'use client';
import{useState}from'react';
import{useIntegrations}from'@/components/integrations/integration-provider';
import QuoteSettings from'./quote-settings';
import TariffPlanEditor from'./tariff-plan-editor';
import './booking-rules-workspace.css';
import{modelFeatures,type ModelFeature}from'@/lib/model-features';
export default function ModelFeatureWorkspace({feature}:{feature:ModelFeature}){
 const{autocabEnabled}=useIntegrations();const[model,setModel]=useState<'native'|'autocab'>('native'),[visited,setVisited]=useState(false);const current=autocabEnabled?model:'native';const item=modelFeatures[feature];
 return <section className="booking-model-workspace"><header className="booking-model-heading"><h2>{item.title}</h2><p>Independent configuration for Need A Cab Plus (N+) and Autocab.</p></header><nav className="booking-model-tabs" aria-label="Pricing model"><button type="button" aria-pressed={current==='native'} onClick={()=>setModel('native')}><strong>Need A Cab Plus · N+</strong><span>Native model</span></button>{autocabEnabled&&<button type="button" aria-pressed={current==='autocab'} onClick={()=>{setModel('autocab');setVisited(true)}}><strong>Autocab</strong><span>External integration</span></button>}</nav><div hidden={current!=='native'}><p className="booking-native-status">N+ configuration is saved independently. Native live quotes and dispatch are not connected yet.</p>{feature==='fares'?<TariffPlanEditor/>:<QuoteSettings embedded mode="shared" model="native" feature={item.tab}/>}</div>{autocabEnabled&&visited&&<div hidden={current!=='autocab'}><QuoteSettings embedded mode={feature==='fares'?'autocab':'shared'} model="autocab" feature={feature==='fares'?undefined:item.tab}/></div>}</section>;
}
