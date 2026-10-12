# Build context is the repo root: docker build -f apps/dashboard/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable && npm install -g turbo@2.11.7

FROM base AS pruner
WORKDIR /app
COPY . .
RUN turbo prune dashboard --docker

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
RUN --mount=type=secret,id=turbo_token,env=TURBO_TOKEN pnpm turbo build --filter=dashboard

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3002
COPY --from=builder --chown=node:node /app/apps/dashboard/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/dashboard/.next/static ./apps/dashboard/.next/static
COPY --from=builder --chown=node:node /app/apps/dashboard/public ./apps/dashboard/public
USER node
EXPOSE 3002
CMD ["node", "apps/dashboard/server.js"]
