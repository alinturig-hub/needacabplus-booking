'use client';
import {BadgePoundSterling} from 'lucide-react';
import QuoteSettings from './quote-settings';

export default function PricingWorkspace(){
 return <article className="operations-settings pricing-workspace">
  <header className="operations-heading pricing-workspace-heading">
   <div className="config-icon"><BadgePoundSterling/></div>
   <div><h3>Fare pricing</h3><p>Manage the Autocab base fare, service additions and automatic demand pricing in one place.</p></div>
  </header>
  <QuoteSettings embedded/>
 </article>;
}
