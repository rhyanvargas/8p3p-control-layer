import Fastify from 'fastify';
import { registerIngestionRoutes } from './ingestion/routes.js';
import { initIdempotencyStore } from './ingestion/idempotency.js';
import { registerSignalLogRoutes } from './signalLog/routes.js';
import { initSignalLogStore } from './signalLog/store.js';

// Initialize idempotency store with SQLite
const dbPath = process.env.IDEMPOTENCY_DB_PATH ?? './data/idempotency.db';

// Initialize signal log store with SQLite (can use same or separate DB)
const signalLogDbPath = process.env.SIGNAL_LOG_DB_PATH ?? './data/signal-log.db';

// Ensure data directory exists for SQLite database
import { mkdirSync } from 'fs';
import { dirname } from 'path';
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

server.get('/', async () => {
  return { 
    name: '8P3P Control Layer',
    version: '0.1.0',
    endpoints: ['/health', '/signals', '/decisions']
  };
});

server.get('/health', async () => {
  return { status: 'ok' };
});

// Register Signal Ingestion routes
registerIngestionRoutes(server);

// Register Signal Log routes (GET /signals)
registerSignalLogRoutes(server);

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
