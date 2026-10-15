'use client';
import {useState} from 'react';
import {BadgePoundSterling,Cloud,Wallet} from 'lucide-react';
import Link from 'next/link';
import QuoteSettings from './quote-settings';
import TariffPlanEditor from './tariff-plan-editor';

export default function PricingWorkspace(){
 const [source,setSource]=useState<'autocab'|'local'>('autocab');
 return <article className="operations-settings pricing-workspace">
  <header className="operations-heading pricing-workspace-heading">
   <div className="config-icon"><BadgePoundSterling/></div>
   <div><h3>Fare sources</h3><p>Configure the base fare supplied by Autocab or calculated by Need A Cab Plus. <Link href="/admin/configuration#pricing-rules">Pricing rules & promotions</Link> are managed separately.</p></div>
  </header>
  <div className="tariff-source-tabs" role="tablist" aria-label="Tariff source"><button id="tariff-source-autocab" type="button" role="tab" aria-controls="tariff-panel-autocab" aria-selected={source==='autocab'} onClick={()=>setSource('autocab')}><Cloud size={18}/><span><strong>Autocab live fares</strong><small>Current customer quote source</small></span></button><button id="tariff-source-local" type="button" role="tab" aria-controls="tariff-panel-local" aria-selected={source==='local'} onClick={()=>setSource('local')}><Wallet size={18}/><span><strong>Need A Cab Plus local</strong><small>Own tariff rules and preview</small></span></button></div>
  <div id="tariff-panel-autocab" role="tabpanel" aria-labelledby="tariff-source-autocab" hidden={source!=='autocab'}><p className="tariff-source-note">Autocab supplies the live base fare for each route. Shared adjustments are configured in Pricing rules & promotions.</p><QuoteSettings embedded mode="autocab"/></div>
  <div id="tariff-panel-local" role="tabpanel" aria-labelledby="tariff-source-local" hidden={source!=='local'}><TariffPlanEditor/></div>
 </article>;
}
