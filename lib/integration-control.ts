import {database} from './database';
export class AutocabDisabledError extends Error{status=503;constructor(){super('Autocab integration is disabled.');this.name='AutocabDisabledError'}}
export async function autocabIntegrationEnabled(){const result=await database().query<{enabled:boolean}>("SELECT enabled FROM integration_controls WHERE provider='autocab'");return result.rows[0]?.enabled===true}
export async function requireAutocabIntegration(){if(!await autocabIntegrationEnabled())throw new AutocabDisabledError()}
