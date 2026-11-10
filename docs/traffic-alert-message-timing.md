# Driver traffic message timing

Traffic messages include the source's known dates and times, formatted in Europe/London, including BST. The existing driver-62 pilot, recipients, eligibility, source checks, deduplication and cooldown are unchanged.

- Street Manager uses explicit actual/proposed start values and explicit proposed end values. Planned starts and expected ends remain qualified. A date-only proposed end stays a date; the internal next-midnight eligibility boundary is not presented as a closing time.
- TomTom uses the provider's original start/end values. The transient feed's two-minute expiry is never displayed as an expected reopening time. Missing end values remain absent.
- Council uses the full published date range and explicit hours, including stated weekday restrictions, overnight ranges and 24-hour notices. The current day's active slice does not replace the full published period. Council's existing freshness and precise-position gates still apply.

Start/end timestamps spanning multiple dates describe an incident interval; they are not converted into a recurring daily schedule. Recurring hours are only shown when explicitly supplied by the Council schedule. Unknown/invalid values are omitted.

Example: `Council notice: a scheduled road closure nearby on North Road West. Check signs. 10-20 Nov 2026; 09:00-17:00 UK`.

The body remains at most 185 characters, leaving room for the 15-character `[TRAFFIC TEST] ` prefix within Autocab's 200-character limit. Only the location label is shortened; the event/source, known timing and end qualification are preserved. No previously delivered message is edited or replayed merely because formatting changed.
