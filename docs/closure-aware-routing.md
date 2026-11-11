# Closure-aware routing preview

Internal pilot: `/admin/traffic/route-preview` and authenticated, same-origin POST
`/api/admin/traffic/route-preview`. Body: `{ "points": [{"latitude":50.389,"longitude":-4.137},{"latitude":50.375,"longitude":-4.142}] }`.

The current customer route and Autocab fare remain unchanged. This preview is not
connected to live quotes, driver messages, dispatch assignment, or fare signing.
It supports 2–5 ordered Plymouth stops and departure now. It selects the fastest
static-time verified candidate found, not a proven globally fastest live route.

## Algorithm

For each ordered leg request up to three OSRM alternatives, check the full route
geometry against closed-road geometries, and reject every conflicting candidate.
If necessary propose waypoints 150/400 m outside the first conflict's extent and
recheck the returned geometry against ALL closures. Never assume a waypoint
proves avoidance. Reject snaps more than 40m from a mandatory stop. Preserve vias
and advance the departure clock by completed leg durations. Use at most nine
provider calls per leg, 24 total, and a 20-second request deadline. Exhaustion
returns no verified route; there is no unchecked straight-line/old-route fallback.

A 25m corridor plus 5m sampling margin conservatively catches thin crossings
between samples. Near parallel roads can be excluded. This is not road-graph
edge blocking and does not prove the reported closure is exact. Arrival clocks
are estimates from static OSRM times, not live speeds. Known/precise geometry
and verified road associations are required before customer activation.

## Sources and gaps

- Latest signed Plymouth Street Manager records, suppressing archive, ambiguous,
  revoked/cancelled/completed updates. Existing active-event eligibility reused.
  Future activities with explicit clocks are checked if they fall in travel time;
  planned permits lacking confirmed work start are excluded.
- Council: current successful publication younger than 12 hours, verified junction
  or segment geometry, explicitly understood active schedules only. Daily windows
  sampled over a 12h horizon, current and overnight windows retained. Approximate
  and unmapped notices never block a route.
- TomTom is **not** used: the existing driver62 feed is transient, not a general
  stored routing feed. No additional Traffic/Routing API requests are made by
  this preview. Do not turn the driver62 cache into a fleet cache without checking
  permitted use. Coverage is returned explicitly, never described as all sources.
- Works/congestion are not assigned invented delays. No live-speed guarantee.

## Own OSRM service

Neither `TRAFFIC_ROUTING_OSRM_URL` nor `DISPATCH_OSRM_URL` is configured in the
production application (checked 11 Nov 2026). Preview returns 503 until the former
is set. It never adds production traffic to the public demo service automatically.
The existing customer's public-OSRM route is unchanged.

`deploy/traffic-routing/compose.yaml` is a deployment recipe, not an installed
service. Prepare graph files in `deploy/traffic-routing/data` on a host with spare
CPU, RAM, and storage; do not run extraction in the booking application's process.
Example graph preparation (resource limits should be tested before deployment):

```sh
cd deploy/traffic-routing
mkdir -p data
curl --fail --location https://download.geofabrik.de/europe/united-kingdom/england/devon-latest.osm.pbf --output data/devon-latest.osm.pbf
docker run --rm --cpus 2 --memory 4g -v "$PWD/data:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-extract -p /opt/car.lua /data/devon-latest.osm.pbf
docker run --rm --cpus 2 --memory 4g -v "$PWD/data:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-partition /data/devon-latest.osrm
docker run --rm --cpus 2 --memory 4g -v "$PWD/data:/data" ghcr.io/project-osrm/osrm-backend:v5.27.1 osrm-customize /data/devon-latest.osrm
docker compose up -d
```

Container image/graph preparation commands are provided for deployment review;
they have NOT been executed or validated in this task. Keep the service on a
private container network or behind authenticated private ingress. localhost in
the compose recipe is host-only; from the app container use an approved internal
network address, not its own localhost. Set `TRAFFIC_ROUTING_OSRM_URL` at runtime.
OSM attribution is required in the eventual route presentation. Graph updates
must be built in a separate directory and switched after health checks.

## Before customer activation

Validate a known real closure and safe detour on a prepared local road graph;
verify source coverage, parallel-road false positives and time windows. Establish
an acceptable shared OSRM capacity/rate policy. Confirm how Autocab accepts the
chosen detour distance/path before changing a fare: changing only the map would
leave quoted distance and price inconsistent. No artificial passenger vias are
inserted into Autocab bookings. Future prebooks, taxi bus-lane access, route
changes after accepted fares, and full source integration remain separate work.
