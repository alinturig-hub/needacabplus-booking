'use client';
import {BadgePoundSterling} from 'lucide-react';
import QuoteSettings from './quote-settings';

export default function PricingWorkspace(){
 return <article className="operations-settings pricing-workspace">
  <header className="operations-heading pricing-workspace-heading">
   <div className="config-icon"><BadgePoundSterling/></div>
   <div><h3>Fares & promotions</h3><p>Manage service additions, paid membership, loyalty, promotions and automatic demand pricing.</p></div>
  </header>
  <QuoteSettings embedded/>
 </article>;
}
