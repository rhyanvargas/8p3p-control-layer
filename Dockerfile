# Multi-stage image: builder compiles server + dashboard; runtime runs Fastify only.
# See docs/guides/pilot-host-deployment.md (when present) for deploy wiring.

FROM node:22-bookworm-slim AS builder
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# Server deps (compiles better-sqlite3 against linux/amd64 glibc 2.36)
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Server source (tsc emits dist/ including JSON schemas under dist/contracts/schemas/)
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Dashboard build with baked VITE_* envs (readiness-brief scope guardrail #1:
# accept bake-in for this week; do NOT redesign build-time key handling)
ARG VITE_API_BASE_URL
ARG VITE_API_KEY
ARG VITE_ORG_ID
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_API_KEY=${VITE_API_KEY} \
    VITE_ORG_ID=${VITE_ORG_ID}
COPY dashboard ./dashboard
RUN npm run build:dashboard

# Drop devDependencies so runtime stage copies a lean node_modules
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    LOG_LEVEL=info \
    DECISION_POLICY_PATH=./src/decision/policies/default.json
WORKDIR /app

# Production deps (native better-sqlite3 binary built in Stage 1)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Compiled app + dashboard + policy + schemas (see pilot-host-deployment plan TASK-002)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dashboard/dist ./dashboard/dist
COPY --from=builder /app/src/decision/policies ./src/decision/policies
COPY --from=builder /app/src/contracts/schemas ./src/contracts/schemas

# Swagger /inspect static paths (required at runtime per server path contracts)
COPY docs/api/openapi.yaml ./docs/api/openapi.yaml
COPY src/panels ./src/panels

# SQLite writes under ./data when *_DB_PATH env vars use the .env.example defaults.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
