FROM alpine:3.22 AS download
RUN apk add --no-cache curl ca-certificates
RUN mkdir /data && curl --fail --location --retry 3 https://download.geofabrik.de/europe/united-kingdom/england/devon-latest.osm.pbf --output /data/devon-latest.osm.pbf
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124 AS graph
COPY --from=download /data /data
RUN osrm-extract --threads 2 -p /opt/car.lua /data/devon-latest.osm.pbf && osrm-partition --threads 2 /data/devon-latest.osrm && osrm-customize --threads 2 /data/devon-latest.osrm && rm /data/devon-latest.osm.pbf
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124
COPY --from=graph /data /data
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--threads", "2", "--max-alternatives", "3", "/data/devon-latest.osrm"]
