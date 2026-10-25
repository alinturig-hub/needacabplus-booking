'use client';
import type{ReactNode}from'react';
import{useIntegrations}from'./integration-provider';
export default function AutocabOnly({children}:{children:ReactNode}){return useIntegrations().autocabEnabled?<>{children}</>:null}
