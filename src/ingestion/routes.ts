/**
 * Fastify Route Registration for Signal Ingestion
 */

import type { FastifyInstance } from 'fastify';
import { handleSignalIngestion } from './handler.js';
import { handleIngestionLogQuery } from './ingestion-log-handler.js';

/**
 * Register the signal ingestion routes
 *
 * Routes:
 * - POST /signals - Ingest a new signal
 * - GET /ingestion - Query ingestion outcomes (accepted/rejected/duplicate)
 */
export function registerIngestionRoutes(app: FastifyInstance): void {
  // POST /signals - Signal ingestion endpoint
  app.post('/signals', {
    // Set body size limit (1MB default, can be configured via env)
    bodyLimit: parseInt(process.env.SIGNAL_BODY_LIMIT ?? '1048576', 10),
    handler: handleSignalIngestion,
  });

  // GET /ingestion - Ingestion outcome log (Inspection API)
  app.get('/ingestion', handleIngestionLogQuery);
}
