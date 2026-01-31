/**
 * Fastify Route Registration for Signal Ingestion
 */

import type { FastifyInstance } from 'fastify';
import { handleSignalIngestion } from './handler.js';

/**
 * Register the signal ingestion routes
 * 
 * Routes:
 * - POST /signals - Ingest a new signal
 */
export function registerIngestionRoutes(app: FastifyInstance): void {
  // POST /signals - Signal ingestion endpoint
  app.post('/signals', {
    // Set body size limit (1MB default, can be configured via env)
    bodyLimit: parseInt(process.env.SIGNAL_BODY_LIMIT ?? '1048576', 10),
    handler: handleSignalIngestion,
  });
}
