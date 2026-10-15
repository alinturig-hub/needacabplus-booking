FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/scripts/start-production.mjs ./scripts/start-production.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrate-local-drivers.mjs ./scripts/migrate-local-drivers.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/migrations/20261015_local_drivers.sql ./scripts/migrations/20261015_local_drivers.sql
COPY --from=builder --chown=nextjs:nodejs /app/scripts/bootstrap-taxicrm-reader.mjs ./scripts/bootstrap-taxicrm-reader.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-bookings.mjs ./scripts/audit-bookings.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/compare-booking.mjs ./scripts/compare-booking.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/booking-migration-preflight.mjs ./scripts/booking-migration-preflight.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/booking-restore-verify.mjs ./scripts/booking-restore-verify.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/operational-data-inventory.mjs ./scripts/operational-data-inventory.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-booking-recovery.mjs ./scripts/audit-booking-recovery.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-fetch.mjs ./scripts/audit-fetch.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-reference.mjs ./scripts/audit-reference.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-time-evidence.mjs ./scripts/audit-time-evidence.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/tracking-status.mjs ./scripts/tracking-status.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/audit-webhook-correspondence.mjs ./scripts/audit-webhook-correspondence.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/ensure-tracking-webhook.mjs ./scripts/ensure-tracking-webhook.mjs
COPY --from=builder --chown=nextjs:nodejs /app/db/init.sql ./db/init.sql
COPY --from=builder --chown=nextjs:nodejs /app/lib/autocab-time.mjs ./lib/autocab-time.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/reconcile-bookings.mjs ./scripts/reconcile-bookings.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/reconcile-booking-status.mjs ./scripts/reconcile-booking-status.mjs
COPY --from=builder --chown=nextjs:nodejs /app/scripts/reconcile-taxicrm-delta.mjs /app/scripts/reconcile-needacabplus-delta.mjs /app/scripts/reconcile-taxicrm-no-key.mjs /app/scripts/verify-migration-data.mjs /app/scripts/verify-migration-booking-links.mjs /app/scripts/verify-shared-database-roles.mjs /app/scripts/align-migration-sequences.mjs /app/scripts/provision-shared-database-roles.mjs ./scripts/
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http:'+'//127.0.0.1:3000/api/health',{cache:'no-store'}).then((response)=>{if(!response.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","scripts/start-production.mjs"]
