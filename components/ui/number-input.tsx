'use client';
import {useState,type ComponentProps} from 'react';
import {Input} from './input';
type Props=Omit<ComponentProps<typeof Input>,'type'|'value'|'onChange'>&{value:number;onValueChange:(value:number)=>void;onEdit?:()=>void};
/** Keep unfinished text local; only send finite, nonempty numbers to settings. */
export function NumberInput({value,onValueChange,onEdit,onBlur,required=true,...props}:Props){
 const [draft,setDraft]=useState<{source:number;text:string}|null>(null);
 return <Input {...props} type="number" required={required} value={draft?.source===value?draft.text:String(value)} onChange={event=>{
  const text=event.currentTarget.value,next=event.currentTarget.valueAsNumber;
  setDraft({source:text!==''&&Number.isFinite(next)?next:value,text});onEdit?.();
  if(text!==''&&Number.isFinite(next))onValueChange(next);
 }} onBlur={event=>{if(event.currentTarget.value!==''&&event.currentTarget.validity.valid)setDraft(null);onBlur?.(event)}}/>;
}
