# Admin home

`/admin` is the lightweight Need A Cab Plus workspace dashboard. The previous operational booking screen is retained at `/admin/live-overview`; search remains `/admin/bookings`. TaxiCRM owns detailed reporting and business intelligence.

The six cards use the authenticated, no-store `/api/admin/dashboard` summary endpoint. No passenger records or credentials are returned. The client refreshes every 30 seconds while visible, prevents overlapping requests, aborts on unmount and preserves the timestamp of previously loaded data when refreshing fails. Missing metrics are `null`/unavailable, never manufactured zeros. Each data group fails independently.

Definitions:

- **Bookings today:** canonical `Booking` rows with pickup due during the current Europe/London calendar day, including all statuses. UTC bounds respect 23/25-hour DST days and retain use of the pickup-time index.
- **Webapp bookings:** the subset identified by the existing source/`NAC-` origin convention (source contains “need a cab”/“webapp”, or external/our reference begins `NAC-`). This is pickup-day activity, not bookings created today. These definitions follow the existing booking overview origin classification.
- **Drivers online:** distinct drivers' latest eligible Autocab vehicle states within `DRIVER_LIVE_FRESHNESS_MINUTES` (default ten), excluding inactive/suspended vehicles and timestamps more than 30 seconds ahead. Only Clear and known BusyMeter states count; unknown/NotWorking states do not. Free plus busy equals online. This card explicitly refers to the Autocab feed, even when fleet management uses local vehicle records.
- **Vehicles:** active nonsuspended Autocab vehicles, or active local vehicles according to `fleet_data_source`.
- **Memberships:** membership records passing the existing `membershipEntitlement` rules. Operator test access is explicitly shown separately; the card does not describe these as paying subscribers. Pricing policy and grace/expiry rules are reused.
- **Needs attention:** local active drivers'/vehicles' uploaded documents already expired or expiring within 30 London-local calendar days, plus an enabled Stripe connection with missing encrypted secret/public key settings. It is not a complete Autocab compliance audit. If either group is unavailable, the combined number stays unavailable.

Connections show recent Autocab receipt freshness (five-minute threshold), successful canonical storage reads, and Stripe's configured live/test/disabled/incomplete mode. They do not claim an external payment authorization or live API test was performed. No provider API calls, schema changes, ingestion settings, charges or bookings are created by dashboard reads.

`NEXT_PUBLIC_TAXICRM_APP_URL` configures the CRM shortcut; the current installation defaults to its confirmed `https://taxicrm.plymhub.ai` application URL. Other deployments must override this at build time. HTTP(S) URLs only; links open separately with noopener/noreferrer.

Validation: `node --test tests/admin-dashboard.test.mjs` covers London date bounds, the 25-hour October DST day, duplicate driver assignment, fresh/stale/future tracks and offline/unknown/suspended/inactive exclusions. TypeScript, targeted ESLint and the production build validate UI/routes. No production deployment or database mutation is part of this change.
