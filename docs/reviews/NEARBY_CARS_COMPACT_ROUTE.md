# Nearby cars and compact route

The count and connection text are removed. Free cars appears only with a connected stream, a known pickup/GPS anchor and fresh nearby vehicles. Without a location anchor, vehicle markers are withheld. The existing radius remains three miles (about 4.8km), freshness two minutes and maximum seven visible cars; these are product choices, not a claim about Uber's private implementation.

Before a route is selected, the initial camera includes the anchor and up to three closest cars once per anchor. User gestures suppress subsequent automatic framing. Vehicle position updates do not repeatedly move the camera. Selected routes retain whole-route framing, so long journeys necessarily render nearby cars closer together; no invented positions or artificial separation is introduced.

The address bar becomes a compact two-line summary with truncation and title text, a pickup dot, and retained 44px close/add-stop controls.

Validation: TypeScript and targeted ESLint; five existing radius/freshness/timing tests; actual-component browser GPS, system theme and modal/manual-entry checks; production build. A race in the browser test was corrected by awaiting the automatically opened GPS dialog rather than clicking an underlying location control while it was opening.
