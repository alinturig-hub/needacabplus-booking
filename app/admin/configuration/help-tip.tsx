import {Info} from 'lucide-react';

export default function HelpTip({text}:{text:string}){
 return <span className="help-tip">
  <button type="button" aria-label={`Help: ${text}`}><Info aria-hidden="true"/></button>
  <span className="help-tip-content" role="tooltip">{text}</span>
 </span>;
}
