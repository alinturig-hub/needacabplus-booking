'use client';
import {useState} from 'react';
import {BadgePoundSterling,Cloud,Wallet} from 'lucide-react';
import QuoteSettings from './quote-settings';
import LocalTariffs from './local-tariffs';

export default function PricingWorkspace(){
 const [source,setSource]=useState<'autocab'|'local'>('autocab');
 return <article className="operations-settings pricing-workspace">
  <header className="operations-heading pricing-workspace-heading">
   <div className="config-icon"><BadgePoundSterling/></div>
   <div><h3>Fares & promotions</h3><p>Manage Autocab live fares and Need A Cab Plus local tariffs separately.</p></div>
  </header>
  <div className="tariff-source-tabs" role="tablist" aria-label="Tariff source"><button id="tariff-source-autocab" type="button" role="tab" aria-controls="tariff-panel-autocab" aria-selected={source==='autocab'} onClick={()=>setSource('autocab')}><Cloud size={18}/><span><strong>Autocab live fares</strong><small>Current customer quote source</small></span></button><button id="tariff-source-local" type="button" role="tab" aria-controls="tariff-panel-local" aria-selected={source==='local'} onClick={()=>setSource('local')}><Wallet size={18}/><span><strong>Need A Cab Plus local</strong><small>Own tariff rules and preview</small></span></button></div>
  <div id="tariff-panel-autocab" role="tabpanel" aria-labelledby="tariff-source-autocab" hidden={source!=='autocab'}><p className="tariff-source-note">Autocab supplies the live fare for each route through its quote API. Use “Test fare” below to see the returned price and tariff identifier.</p><QuoteSettings embedded/></div>
  <div id="tariff-panel-local" role="tabpanel" aria-labelledby="tariff-source-local" hidden={source!=='local'}><LocalTariffs/></div>
 </article>;
}
