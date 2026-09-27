# Multi-stage build for [APP_NAME].
#   docker build --target api     -t app-api .      # Node API (non-root)
#   docker build --target web     -t app-web .      # nginx serving the SPA, proxying /api
#   docker build --target migrate -t app-migrate .  # one-shot: prisma migrate deploy
# No secrets are baked into any image: supply AUTH_SECRET, DATABASE_URL etc. at runtime.

FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY tests/package.json tests/
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# `prisma generate` validates DATABASE_URL presence only; a placeholder is fine at build time.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm run build

FROM build AS migrate
ENV NODE_ENV=production
WORKDIR /app/server
# Uses the Prisma CLI; in egress-restricted networks use: node scripts/offline-migrate.mjs deploy
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:22-bookworm-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
COPY tests/package.json tests/
RUN npm ci --omit=dev --workspace server --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
 && npm cache clean --force \
 && mkdir -p /app/var/storage && chown -R node:node /app/var
COPY --from=build /app/server/dist server/dist
USER node
WORKDIR /app/server
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]

FROM nginx:1.27-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client/dist /usr/share/nginx/html
EXPOSE 8080
