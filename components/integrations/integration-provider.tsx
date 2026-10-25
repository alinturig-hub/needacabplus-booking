'use client';
import{createContext,useCallback,useContext,useEffect,useState,type ReactNode}from'react';
const Context=createContext({autocabEnabled:false,loading:true,refresh:async()=>{}});
export function IntegrationProvider({children}:{children:ReactNode}){
 const[state,setState]=useState({autocabEnabled:false,loading:true});
 const refresh=useCallback(async()=>{try{const response=await fetch('/api/integrations/status',{cache:'no-store'});const data=await response.json() as {autocabEnabled:boolean};setState({autocabEnabled:response.ok&&data.autocabEnabled===true,loading:false})}catch{setState({autocabEnabled:false,loading:false})}},[]);
 useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),10000);const changed=()=>void refresh();window.addEventListener('nac-integrations-changed',changed);window.addEventListener('storage',changed);return()=>{clearTimeout(initial);clearInterval(timer);window.removeEventListener('nac-integrations-changed',changed);window.removeEventListener('storage',changed)}},[refresh]);
 return <Context.Provider value={{...state,refresh}}>{children}</Context.Provider>;
}
export const useIntegrations=()=>useContext(Context);
