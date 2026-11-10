# Combined Plymouth traffic map

Admin → Operations → Live traffic map (`/admin/traffic`) reads Street Manager's stored Plymouth records and requests TomTom Incident Details v5 for bounding box `-4.25,50.32,-4.02,50.46` (Plymouth and surrounding area). Both the page and `/api/admin/traffic` require an existing Admin session. The API key is server-only, in runtime environment variable `TOMTOM_API_KEY`.

Each visible map requests an update every 120 seconds. This is an Admin inspection map, not a shared fleet traffic distribution cache: there is no permanent TomTom archive, background ingestion or cross-user result cache. A second open map makes its own provider requests. Respect the account's request allowance; validate fleet redistribution and storage rights before connecting this source to Driver App delivery. A provider 429 pauses refresh for its numeric Retry-After interval (default 120 seconds, maximum one day).

Street Manager webhook, historical archive and Council records retain their original source and verification warnings. Current/review is the default view; planned, ended and archive records are accessible through filters. Section 58 does not mean a road is closed. Overlapping records from different providers are kept separately; counts are provider records, not unique physical incidents. Missing geometries remain in the list. The existing Street Manager 1,500-record preview bound is disclosed when reached.

If a source fails, the other source still updates. This browser tab may retain its last successful display, explicitly marked stale with its original fetch time. A successful empty response removes previous incidents. No API error body, credentials, SNS subscription data or raw provider envelopes are returned to the browser. No TomTom record participates in automatic driver messages, dispatch, fares or routing; the single-driver Street Manager pilot is unchanged.

The map uses OpenFreeMap / MapLibre and retains map attribution, with separate TomTom traffic credit. Closing the map stops requests; reopening after a service restart fetches a fresh response. Source data availability does not guarantee that every current event has been reported.
