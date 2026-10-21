# Admin home

`/admin` is the lightweight Need A Cab Plus workspace dashboard. The previous operational booking screen is retained at `/admin/live-overview`; search remains `/admin/bookings`. TaxiCRM owns detailed reporting and business intelligence.

The five cards use the authenticated, no-store `/api/admin/dashboard` summary endpoint. No passenger records or credentials are returned. The client refreshes every 30 seconds while visible, prevents overlapping requests, aborts on unmount and preserves the timestamp of previously loaded data when refreshing fails. Missing metrics are `null`/unavailable, never manufactured zeros. Each data group fails independently.

Definitions:

- **Bookings today:** canonical `Booking` rows with pickup due during the current Europe/London calendar day, including all statuses. UTC bounds respect 23/25-hour DST days and retain use of the pickup-time index.
- **Webapp bookings:** the subset identified by the existing source/`NAC-` origin convention (source contains “need a cab”/“webapp”, or external/our reference begins `NAC-`). The canonical source column is `bookingSource`, not `source`. This is pickup-day activity, not bookings created today. These definitions follow the existing booking overview origin classification.
- **Booking outcomes:** Completed, Cancelled and No Fare counts live inside the Bookings today card, each split by Cash / Account / Card. Other/unknown payment types are shown when nonzero, so subtotals reconcile. Active bookings remain in the day total but not the terminal-outcome boxes. Archived NoJob is never treated as No Fare. The displayed day runs 00:00:00–23:59:59 UK; SQL uses the next midnight as an exclusive bound to retain fractional seconds.
- **Drivers online:** distinct drivers' latest eligible Autocab vehicle states within `DRIVER_LIVE_FRESHNESS_MINUTES` (default ten), excluding inactive/suspended vehicles and timestamps more than 30 seconds ahead. Only Clear and known BusyMeter states count; unknown/NotWorking states do not. Free plus busy equals online. This card explicitly refers to the Autocab feed. The dashboard no longer shows vehicle totals.
- **Memberships:** membership records passing the existing `membershipEntitlement` rules. Counts are also broken down by each configured membership tier name (including renamed tiers such as VIP), using the same entitlement rules; tiers are not invented or renamed by the dashboard. Operator test access is explicitly shown separately; the card does not describe these as paying subscribers. Pricing policy and grace/expiry rules are reused.
- **Needs attention:** local active drivers'/vehicles' uploaded documents already expired or expiring within 30 London-local calendar days, plus an enabled Stripe connection with missing encrypted secret/public key settings. It is not a complete Autocab compliance audit. If either group is unavailable, the combined number stays unavailable.

Connections show recent Autocab receipt freshness (five-minute threshold), successful canonical storage reads, and Stripe's configured live/test/disabled/incomplete mode. They do not claim an external payment authorization or live API test was performed. No provider API calls, schema changes, ingestion settings, charges or bookings are created by dashboard reads.

`NEXT_PUBLIC_TAXICRM_APP_URL` configures the CRM shortcut; the current installation defaults to its confirmed `https://taxicrm.plymhub.ai` application URL. Other deployments must override this at build time. HTTP(S) URLs only; links open separately with noopener/noreferrer.

Validation: `node --test tests/admin-dashboard.test.mjs` covers London date bounds, the 25-hour October DST day, duplicate driver assignment, fresh/stale/future tracks and offline/unknown/suspended/inactive exclusions. TypeScript, targeted ESLint and the production build validate UI/routes. No production deployment or database mutation is part of this change.

The October 21 correction was executed successfully as read-only SQL on the shared live schema before release, including status/payment counts. Local fixtures use the canonical `bookingSource`, `status` and `paymentType` column names and cover terminal outcomes, unknown payments and archived NoJob. No live booking records were modified.
