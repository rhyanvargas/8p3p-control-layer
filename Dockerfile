# Multi-stage image: builder compiles server; runtime runs Fastify API only.
# Dashboard is a standalone Next.js app (see dashboard/); not bundled in this image.

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

# Compiled app + policy + schemas
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/decision/policies ./src/decision/policies
COPY --from=builder /app/src/contracts/schemas ./src/contracts/schemas

# Swagger OpenAPI spec
COPY docs/api/openapi.yaml ./docs/api/openapi.yaml

# SQLite writes under ./data when *_DB_PATH env vars use the .env.example defaults.
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "dist/server.js"]
