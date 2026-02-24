import dotenv from 'dotenv';
import { existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Load .env then .env.local (local overrides). Ensures API_KEY etc. are set when running dev.
dotenv.config();
const localPath = join(process.cwd(), '.env.local');
if (existsSync(localPath)) {
  dotenv.config({ path: localPath });
}

import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { registerIngestionRoutes } from './ingestion/routes.js';
import { registerStateRoutes } from './state/routes.js';
import { initIdempotencyStore, closeIdempotencyStore } from './ingestion/idempotency.js';
import { initIngestionLogStore, closeIngestionLogStore } from './ingestion/ingestion-log-store.js';
import { registerSignalLogRoutes } from './signalLog/routes.js';
import { initSignalLogStore, closeSignalLogStore } from './signalLog/store.js';
import { initStateStore, closeStateStore } from './state/store.js';
import { initDecisionStore, closeDecisionStore } from './decision/store.js';
import { loadPolicy } from './decision/policy-loader.js';
import { registerDecisionRoutes } from './decision/routes.js';
import { apiKeyPreHandler } from './auth/api-key-middleware.js';
import { loadTenantFieldMappingsFromFile } from './config/tenant-field-mappings.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize idempotency store with SQLite
const dbPath = process.env.IDEMPOTENCY_DB_PATH ?? './data/idempotency.db';

// Initialize signal log store with SQLite (can use same or separate DB)
const signalLogDbPath = process.env.SIGNAL_LOG_DB_PATH ?? './data/signal-log.db';

// Initialize STATE store (learner state + applied_signals)
const stateStoreDbPath = process.env.STATE_STORE_DB_PATH ?? './data/state.db';

// Ensure data directory exists for SQLite database
import { mkdirSync } from 'fs';
try {
  mkdirSync(dirname(dbPath), { recursive: true });
} catch {
  // Directory may already exist
}

// Idempotency store (Stage 1). Phase 2: replace initIdempotencyStore(dbPath)
// with setIdempotencyRepository(new DynamoDbIdempotencyRepository(config))
// or fold into Signals table via conditional writes.
initIdempotencyStore(dbPath);

// Ensure signal log data directory exists
try {
  mkdirSync(dirname(signalLogDbPath), { recursive: true });
} catch {
  // Directory may already exist
}

// Signal Log store (Stage 2). Phase 2: replace initSignalLogStore(dbPath)
// with setSignalLogRepository(new DynamoDbSignalLogRepository(config))
initSignalLogStore(signalLogDbPath);

// Ingestion log (Inspection API)
const ingestionLogDbPath = process.env.INGESTION_LOG_DB_PATH ?? './data/ingestion-log.db';
try {
  mkdirSync(dirname(ingestionLogDbPath), { recursive: true });
} catch {
  // Directory may already exist
}
initIngestionLogStore(ingestionLogDbPath);

// Ensure STATE store data directory exists
try {
  mkdirSync(dirname(stateStoreDbPath), { recursive: true });
} catch {
  // Directory may already exist
}

// STATE store (Stage 3). Phase 2: replace initStateStore(dbPath)
// with setStateRepository(new DynamoDbStateRepository(config))
initStateStore(stateStoreDbPath);

// Decision store (Stage 4). Phase 2: replace initDecisionStore(dbPath)
// with setDecisionRepository(new DynamoDbDecisionRepository(config))
const decisionDbPath = process.env.DECISION_DB_PATH ?? './data/decisions.db';
try {
  mkdirSync(dirname(decisionDbPath), { recursive: true });
} catch {
  // Directory may already exist
}
initDecisionStore(decisionDbPath);

// Load decision policy (must happen after store init, before route registration)
loadPolicy();

// Optional: Phase 2 tenant-scoped payload mappings (DEF-DEC-006).
// When unset, ingestion behaves like Phase 1 (payload remains opaque except forbidden keys).
const tenantMappingsPath = process.env.TENANT_FIELD_MAPPINGS_PATH;
if (tenantMappingsPath && tenantMappingsPath.trim() !== '' && existsSync(tenantMappingsPath)) {
  try {
    loadTenantFieldMappingsFromFile(tenantMappingsPath);
  } catch (err) {
    // Fail-open: do not block server startup on tenant mapping misconfig.
    // Ingestion will proceed without tenant payload enforcement.
    console.warn(
      'Failed to load TENANT_FIELD_MAPPINGS_PATH; continuing without tenant payload enforcement',
      err
    );
  }
}

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

const apiSpecDir = resolve(__dirname, '..', 'docs', 'api');
const swaggerBrandThemeCss = `
  :root {
    --brand-bg: #fff;
    --brand-text: #000;
    --brand-topbar-bg: #000;
    --brand-topbar-border: rgba(249, 247, 245, 1);
    --brand-border: #e5e1dc;
    --brand-accent: #c9d5c4;
    --brand-accent-2: #e4dbc9;
  }
  body.swagger-ui {
    background: var(--brand-bg);
    color: var(--brand-text);
    font-family: Inter, sans-serif;
  }
  .swagger-ui .topbar {
    background: var(--brand-topbar-bg);
    color: rgba(228, 230, 230, 1);
    border-bottom: 1px solid var(--brand-topbar-border);
  }
  .swagger-ui .topbar .topbar-wrapper .link > * {
    display: none;
  }
  .swagger-ui .topbar .topbar-wrapper .link::after {
    content: '8P3P';
    color: #fff;
    font-family: Inter, sans-serif;
    font-size: 1.875rem;
    font-weight: 700;
    letter-spacing: -0.05em;
    line-height: 1;
  }
  .swagger-ui .topbar .download-url-wrapper .select-label select,
  .swagger-ui .topbar input[type=text] {
    border: 1px solid var(--brand-border);
    border-radius: 8px;
  }
  .swagger-ui .btn.authorize {
    background-color: rgba(62, 206, 144, 0.23);
    border-color: rgba(62, 206, 144, 1);
    color: rgba(62, 206, 144, 1);
    font-weight: 600;
  }
  .swagger-ui .btn.execute {
    background: var(--brand-accent);
    border-color: var(--brand-accent);
    color: var(--brand-text);
    font-weight: 600;
  }
  .swagger-ui .btn.authorize:hover {
    background: var(--brand-accent-2);
    border-color: var(--brand-accent-2);
  }
  .swagger-ui .btn.execute:hover {
    background: var(--brand-accent-2);
    border-color: var(--brand-accent-2);
  }
  .swagger-ui .opblock,
  .swagger-ui .scheme-container,
  .swagger-ui .information-container.wrapper {
    border-color: var(--brand-border);
    box-shadow: none;
  }
  .swagger-ui a {
    color: var(--brand-text);
  }
  .swagger-ui .auth-btn-wrapper {
    align-items: flex-start;
    gap: 10px;
    justify-content: flex-start;
  }
  /* When authorized, Swagger shows .locked / aria-label "authorization button locked"; make lock green so "you have access" is obvious */
  .swagger-ui .btn.authorize.locked svg,
  .swagger-ui .authorization__btn.locked svg,
  .swagger-ui .authorization__btn .locked svg,
  .swagger-ui .authorization__btn[aria-label="authorization button locked"] svg {
    fill: #49cc90 !important;
    opacity: 1;
  }
`;

// Inspection panels: redirect /inspect → /inspect/, then static files
server.get('/inspect', async (_request, reply) => {
  return reply.redirect('/inspect/');
});

await server.register(fastifyStatic, {
  root: resolve(process.cwd(), 'src/panels'),
  prefix: '/inspect/',
});

await server.register(swagger, {
  mode: 'static',
  specification: {
    path: join(apiSpecDir, 'openapi.yaml'),
    baseDir: apiSpecDir
  }
});

await server.register(swaggerUi, {
  routePrefix: '/docs',
  logo: null as never,
  theme: {
    title: '8P3P Control Layer API Docs',
    css: [{ filename: '8p3p-theme.css', content: swaggerBrandThemeCss }]
  }
});

server.get('/', async () => {
  return {
    name: '8P3P Control Layer',
    version: '0.1.0',
    endpoints: ['/health', '/v1/signals', '/v1/ingestion', '/v1/state', '/v1/state/list', '/v1/decisions', '/inspect', '/docs']
  };
});

server.get('/health', async () => {
  return { status: 'ok' };
});

// Register v1 API routes (api-key preHandler runs before route handlers)
server.register(async (v1) => {
  v1.addHook('preHandler', apiKeyPreHandler);
  registerIngestionRoutes(v1);
  registerStateRoutes(v1);
  registerSignalLogRoutes(v1);
  registerDecisionRoutes(v1);
}, { prefix: '/v1' });

// Graceful shutdown: close stores (reverse of init order)
server.addHook('onClose', () => {
  closeDecisionStore();
  closeStateStore();
  closeSignalLogStore();
  closeIngestionLogStore();
  closeIdempotencyStore();
});

const start = async () => {
  try {
    const port = Number(process.env.PORT) || 3000;
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`Server listening on port ${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
