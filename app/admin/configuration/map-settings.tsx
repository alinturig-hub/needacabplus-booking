'use client';

import {useEffect, useState, type FormEvent} from 'react';
import {CheckCircle2, Map, Search} from 'lucide-react';
import {defaultMapSettings, type MapSettings as MapSettingsValue} from '@/lib/map-settings-schema';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';

const mapStyles = [
  {id: 'streets-v4', label: 'Streets'},
  {id: 'basic-v2', label: 'Basic'},
  {id: 'bright-v2', label: 'Bright'},
  {id: 'outdoor-v2', label: 'Outdoor'},
  {id: 'topo-v2', label: 'Topographic'},
  {id: 'satellite', label: 'Satellite'},
  {id: 'hybrid', label: 'Hybrid'},
  {id: 'dark', label: 'Dark'},
] as const;

type StyleField = 'mapTilerLightStyle' | 'mapTilerDarkStyle';

function MapStyleField({label, value, onChange}: {label: string; value: string; onChange: (style: string) => void}) {
  const custom = !mapStyles.some(style => style.id === value);
  const fieldId = label === 'Light map style' ? 'map-style-light' : 'map-style-dark';
  return <div className="customer-setting-field">
    <label htmlFor={fieldId}>{label}</label>
    <select id={fieldId} value={custom ? 'custom' : value} onChange={event => onChange(event.target.value === 'custom' ? '' : event.target.value)}>
      {mapStyles.map(style => <option key={style.id} value={style.id}>{style.label} ({style.id})</option>)}
      <option value="custom">Custom style ID…</option>
    </select>
    {custom && <label className="customer-setting-field">Custom MapTiler style ID
      <Input required maxLength={80} pattern="[a-z0-9-]{1,80}" placeholder="my-style-id" value={value} onChange={event => onChange(event.target.value)}/>
    </label>}
  </div>;
}

export default function MapSettings() {
  const [value, setValue] = useState<MapSettingsValue>(defaultMapSettings);
  const [apiKey, setApiKey] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/admin/map-settings', {cache: 'no-store'}).then(async response => {
      const data = await response.json() as {settings?: MapSettingsValue; apiKeyConfigured?: boolean; error?: string};
      if (!response.ok || !data.settings) throw new Error(data.error || 'Unable to load map settings.');
      if (active) {setValue(data.settings); setApiKeyConfigured(Boolean(data.apiKeyConfigured)); setLoaded(true);}
    }).catch(reason => {if (active) setError(reason instanceof Error ? reason.message : 'Unable to load map settings.');});
    return () => {active = false;};
  }, []);

  const update = <K extends keyof MapSettingsValue>(key: K, next: MapSettingsValue[K]) => {
    setValue(current => ({...current, [key]: next}));
    setError(''); setMessage('');
  };
  const updateStyle = (key: StyleField, style: string) => update(key, style);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/map-settings', {method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({settings: value, apiKey})});
      const data = await response.json() as {error?: string; apiKeyConfigured?: boolean};
      if (!response.ok) throw new Error(data.error || 'Unable to save map settings.');
      setApiKey(''); setApiKeyConfigured(Boolean(data.apiKeyConfigured));
      setMessage('Map settings saved. Refresh the webapp to use them.');
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'Unable to save map settings.');}
    finally {setBusy(false);}
  }

  async function test() {
    setTesting(true); setError(''); setMessage('');
    try {
      const response = await fetch('/api/admin/map-settings/test', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({apiKey, style: value.mapTilerLightStyle, darkStyle: value.mapTilerDarkStyle})});
      const data = await response.json() as {message?: string; error?: string};
      if (!response.ok) throw new Error(data.error || 'MapTiler connection failed.');
      setMessage(data.message || 'MapTiler connection is working.');
    } catch (reason) {setError(reason instanceof Error ? reason.message : 'MapTiler connection failed.');}
    finally {setTesting(false);}
  }

  return <section className="operations-settings customer-settings map-settings-panel">
    <header className="customer-settings-heading"><h3>Maps & address search</h3><p>Choose the map customers see and the service used for address, place and GPS searches.</p></header>
    <form onSubmit={save}><fieldset disabled={!loaded || busy}>
      <div className="customer-provider-grid">
        <section className="customer-settings-group">
          <header><span className="map-settings-icon"><Map/></span><div><h4>Map display</h4><p>Controls the basemap. Live cars, route guidance and pickup markers stay in our application.</p></div></header>
          <label className="customer-setting-field"><span>Map provider</span><select value={value.mapProvider} onChange={event => update('mapProvider', event.target.value as MapSettingsValue['mapProvider'])}><option value="openstreetmap">OpenStreetMap</option><option value="maptiler">MapTiler Cloud</option></select></label>
          {value.mapProvider === 'maptiler' && <div className="settings-grid customer-fields-grid">
            <MapStyleField label="Light map style" value={value.mapTilerLightStyle} onChange={style => updateStyle('mapTilerLightStyle', style)}/>
            <MapStyleField label="Dark map style" value={value.mapTilerDarkStyle} onChange={style => updateStyle('mapTilerDarkStyle', style)}/>
          </div>}
        </section>
        <section className="customer-settings-group">
          <header><span className="map-settings-icon"><Search/></span><div><h4>Addresses & places</h4><p>Controls autocomplete, the fast GPS address preview and nearby named places.</p></div></header>
          <label className="customer-setting-field"><span>Search provider</span><select value={value.searchProvider} onChange={event => update('searchProvider', event.target.value as MapSettingsValue['searchProvider'])}><option value="openstreetmap">Current open map search</option><option value="maptiler">MapTiler Geocoding</option></select></label>
          <div className="settings-grid customer-fields-grid"><label className="customer-setting-field"><span>Country</span><Input maxLength={2} value={value.country} onChange={event => update('country', event.target.value.toLowerCase())}/></label><label className="customer-setting-field"><span>Language</span><Input maxLength={2} value={value.language} onChange={event => update('language', event.target.value.toLowerCase())}/></label><label className="customer-setting-field"><span>Nearby place radius (metres)</span><Input type="number" min={10} max={250} value={value.nearbyPlaceRadiusMetres} onChange={event => update('nearbyPlaceRadiusMetres', Number(event.target.value))}/></label></div>
        </section>
      </div>
      <section className="customer-settings-group maptiler-key-group"><header><h4>MapTiler Cloud key</h4><p>The key is encrypted at rest. Map rendering exposes it to the browser as required by MapTiler, so keep Allowed HTTP Origins enabled in MapTiler Cloud.</p></header>
        <label className="customer-setting-field"><span className="customer-secret-title">API key{apiKeyConfigured && <span className="customer-secret-saved"><CheckCircle2/>Saved securely</span>}</span><Input type="password" autoComplete="new-password" placeholder={apiKeyConfigured ? 'Saved — enter a new key only to replace it' : 'Paste the MapTiler API key'} value={apiKey} onChange={event => {setApiKey(event.target.value); setError(''); setMessage('');}}/><small>Leave blank to retain the saved key. The key is never returned by the admin API.</small></label>
        <div className="customer-settings-actions"><Button type="button" variant="outline" disabled={testing || (!apiKeyConfigured && !apiKey.trim()) || !value.mapTilerLightStyle || !value.mapTilerDarkStyle} onClick={test}>{testing ? 'Testing…' : 'Test MapTiler connection'}</Button><span>Tests both selected map styles and a Plymouth address search.</span></div>
      </section>
      <p className="customer-settings-hint">Autocab still validates the selected address and booking zone before quotes or bookings are created. Changing the map provider does not change fares.</p>
      <footer className="customer-settings-actions"><Button type="submit">{busy ? 'Saving…' : 'Save map settings'}</Button><span>Provider changes apply after saving and refreshing the webapp.</span></footer>
    </fieldset>{error && <p className="error-message" role="alert">{error}</p>}{message && <p className="customer-settings-success" role="status">{message}</p>}</form>
  </section>;
}
