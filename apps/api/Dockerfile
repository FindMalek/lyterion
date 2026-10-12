# Build context is the repo root: docker build -f apps/api/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo@2.11.7 prune api --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/patches ./patches
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/scripts ./scripts
# NEXT_PUBLIC_* are inlined at build time, so every environment builds its own image.
ARG NEXT_PUBLIC_LYTERION_API_URL
ARG NEXT_PUBLIC_LYTERION_DASHBOARD_URL
ARG NEXT_PUBLIC_LYTERION_ALLOWED_ORIGIN
ARG NEXT_PUBLIC_LYTERION_NODE_ENV=production
ARG TURBO_API
ARG TURBO_TEAM
ENV SKIP_ENV_VALIDATION=true
RUN --mount=type=secret,id=turbo_token,env=TURBO_TOKEN pnpm turbo build --filter=api

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3001
ARG DRIZZLE_ORM_VERSION=0.45.4
ARG PG_VERSION=8.23.1
COPY --from=builder /app/packages/db/src/migrations ./migrate/migrations
COPY --from=builder /app/packages/db/scripts/migrate.mjs ./migrate/migrate.mjs
RUN cd migrate && npm init -y >/dev/null && npm install --omit=dev --no-audit --no-fund drizzle-orm@${DRIZZLE_ORM_VERSION} pg@${PG_VERSION}
ENV LYTERION_MIGRATIONS_DIR=/app/migrate/migrations
COPY --from=builder --chown=node:node /app/apps/api/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/api/.next/static ./apps/api/.next/static
USER node
EXPOSE 3001
# Migrations on start (D-035), the database is LAN only.
CMD ["sh", "-c", "node migrate/migrate.mjs && node apps/api/server.js"]
