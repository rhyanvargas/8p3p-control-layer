import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { registerIngestionRoutes } from './ingestion/routes.js';
import { initIdempotencyStore } from './ingestion/idempotency.js';
import { registerSignalLogRoutes } from './signalLog/routes.js';
import { initSignalLogStore } from './signalLog/store.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Initialize idempotency store with SQLite
const dbPath = process.env.IDEMPOTENCY_DB_PATH ?? './data/idempotency.db';

// Initialize signal log store with SQLite (can use same or separate DB)
const signalLogDbPath = process.env.SIGNAL_LOG_DB_PATH ?? './data/signal-log.db';

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
  // registerDecisionRoutes(v1);  // future
}, { prefix: '/v1' });

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
