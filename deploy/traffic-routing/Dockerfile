FROM alpine:3.22 AS download
RUN apk add --no-cache curl ca-certificates
RUN mkdir /data && curl --fail --location --retry 3 https://download.geofabrik.de/europe/united-kingdom/england/devon-latest.osm.pbf --output /data/devon-latest.osm.pbf
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124 AS graph
COPY --from=download /data /data
RUN osrm-extract --threads 2 -p /opt/car.lua /data/devon-latest.osm.pbf && osrm-partition --threads 2 /data/devon-latest.osrm && osrm-customize --threads 2 /data/devon-latest.osrm && rm /data/devon-latest.osm.pbf
FROM golang:1.25-alpine AS health
RUN printf '%s\n' 'package main' 'import ("net/http"; "os"; "time")' 'func main() { c:=http.Client{Timeout:3*time.Second}; r,e:=c.Get("http://127.0.0.1:5000/nearest/v1/driving/-4.142,50.375"); if e!=nil {os.Exit(1)}; defer r.Body.Close(); if r.StatusCode!=200 {os.Exit(1)} }' > /health.go && CGO_ENABLED=0 GOMAXPROCS=2 go build -p 2 -ldflags="-s -w" -o /healthcheck /health.go
FROM ghcr.io/project-osrm/osrm-backend:v5.27.1@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124
COPY --from=health /healthcheck /usr/local/bin/healthcheck
COPY --from=graph /data /data
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 CMD ["/usr/local/bin/healthcheck"]
EXPOSE 5000
CMD ["osrm-routed", "--algorithm", "mld", "--threads", "2", "--max-alternatives", "3", "/data/devon-latest.osrm"]
