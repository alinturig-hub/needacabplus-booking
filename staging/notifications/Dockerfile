FROM node:24-bookworm-slim AS build
WORKDIR /source
RUN npm install --prefix /build-tools esbuild@0.28.0 zod@3.25.76 --ignore-scripts --no-audit --no-fund
COPY lib/notifications ./lib/notifications
COPY lib/whatsapp-service-auth.ts ./lib/whatsapp-service-auth.ts
COPY components/shared-whatsapp/template-parameters.ts components/shared-whatsapp/template-error.ts ./components/shared-whatsapp/
COPY staging/notifications ./staging/notifications
RUN ln -s /build-tools/node_modules node_modules && /build-tools/node_modules/.bin/esbuild staging/notifications/server.ts --bundle --platform=node --format=esm --outfile=/compiled/server.mjs --external:node:*
FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000
RUN mkdir /stage-data && chown node:node /stage-data
COPY --from=build /compiled/server.mjs /server.mjs
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "/server.mjs"]
