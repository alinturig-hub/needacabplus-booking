'use client';
import {BadgePoundSterling} from 'lucide-react';
import QuoteSettings from './quote-settings';
import {PricingSettings} from './operations-settings';

export default function PricingWorkspace(){
 return <article className="operations-settings pricing-workspace">
  <header className="operations-heading pricing-workspace-heading">
   <div className="config-icon"><BadgePoundSterling/></div>
   <div><h3>Fare pricing</h3><p>Manage the Autocab base fare, service additions, demand help and scheduled price changes in one place.</p></div>
  </header>
  <QuoteSettings embedded/>
  <PricingSettings embedded/>
 </article>;
}
