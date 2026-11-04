FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
FROM node:24-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN DATABASE_URL=postgresql://build_only@127.0.0.1:1/build_only NEXT_TELEMETRY_DISABLED=1 npm run build
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apk add --no-cache curl && addgroup -S -g 1001 nextjs && adduser -S -u 1001 -G nextjs nextjs
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/staging/notifications/full/schema.sql ./staging/notifications/full/schema.sql
USER nextjs
EXPOSE 3000
# Full Next application, deliberately bypassing production bootstrap/workers.
CMD ["node","server.js"]
