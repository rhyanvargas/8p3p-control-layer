import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { registerIngestionRoutes } from './ingestion/routes.js';
import { initIdempotencyStore, closeIdempotencyStore } from './ingestion/idempotency.js';
import { registerSignalLogRoutes } from './signalLog/routes.js';
import { initSignalLogStore, closeSignalLogStore } from './signalLog/store.js';
import { initStateStore, closeStateStore } from './state/store.js';
import { initDecisionStore, closeDecisionStore } from './decision/store.js';
import { loadPolicy } from './decision/policy-loader.js';
import { registerDecisionRoutes } from './decision/routes.js';

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

initIdempotencyStore(dbPath);

// Ensure signal log data directory exists
try {
  mkdirSync(dirname(signalLogDbPath), { recursive: true });
} catch {
  // Directory may already exist
}

initSignalLogStore(signalLogDbPath);

// Ensure STATE store data directory exists
try {
  mkdirSync(dirname(stateStoreDbPath), { recursive: true });
} catch {
  // Directory may already exist
}

initStateStore(stateStoreDbPath);

// Initialize Decision store (Stage 4)
const decisionDbPath = process.env.DECISION_DB_PATH ?? './data/decisions.db';
try {
  mkdirSync(dirname(decisionDbPath), { recursive: true });
} catch {
  // Directory may already exist
}
initDecisionStore(decisionDbPath);

// Load decision policy (must happen after store init, before route registration)
loadPolicy();

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

const apiSpecDir = resolve(__dirname, '..', 'docs', 'api');
await server.register(swagger, {
  mode: 'static',
  specification: {
    path: join(apiSpecDir, 'openapi.yaml'),
    baseDir: apiSpecDir
  }
});

await server.register(swaggerUi, {
  routePrefix: '/docs'
});

server.get('/', async () => {
  return {
    name: '8P3P Control Layer',
    version: '0.1.0',
    endpoints: ['/health', '/v1/signals', '/v1/decisions', '/docs']
  };
});

server.get('/health', async () => {
  return { status: 'ok' };
});

// Register v1 API routes
server.register(async (v1) => {
  registerIngestionRoutes(v1);
  registerSignalLogRoutes(v1);
  registerDecisionRoutes(v1);
}, { prefix: '/v1' });

// Graceful shutdown: close stores (reverse of init order)
server.addHook('onClose', () => {
  closeDecisionStore();
  closeStateStore();
  closeSignalLogStore();
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
