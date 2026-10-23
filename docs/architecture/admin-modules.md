# Admin modules — initial structure

Seven top-level workspaces: Overview, Dispatch, Customers, Reports,
Operations, Configuration and Settings.

- Dispatch in Admin owns rules, driver eligibility, offer timing and simulation only.
  Dispatchers use https://dispatch.needacabplus.app/; the Admin header opens this separate application.
- Reports owns booking search/history and the booking overview.
- Operations owns Fleet (Drivers and Vehicles) and Hackney.
- Configuration owns booking/dispatch rules, fares, payments, maps,
  communications and Integrations.
- Integrations has independent Autocab and TaxiCRM card-based workspaces.
- Settings owns Modules, companies, users/roles, security and appearance.
- The original category URLs redirect to the corresponding new workspaces.

## Autocab

Connection & API opens the existing configured connection editor.
Webhook links & receiver opens the existing operational webhook generator
and provider/event editor. URLs originate in this platform and are copied
into Autocab. No URL or secret rotation is performed by this navigation change.
Existing authenticated receivers and worker processing remain unchanged.

## TaxiCRM

Data access opens the existing read-only data configuration. AI workspace
opens the existing assistant; this does not assert that TaxiCRM is already
its configured AI provider. The existing external TaxiCRM link is retained
when configured.

## Configuration to agree next

Settings → Modules is currently a catalogue and entry point, not a runtime
feature switch. No enable/disable state is claimed or persisted by it.
Next agree module activation, submodule dependencies and permissions.
Runtime switches must enforce both UI and server-side access and retain
stored data/configuration. Integration visibility and event synchronization
must have distinct controls, so hiding a module does not stop ingestion.
Do not tie incoming webhook acceptance to a cosmetic navigation setting.
