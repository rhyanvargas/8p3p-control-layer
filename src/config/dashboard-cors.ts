import cors from '@fastify/cors';
import type { FastifyInstance } from 'fastify';

/** Local Next.js dev origins when `DASHBOARD_ALLOWED_ORIGINS` is unset. */
const DEFAULT_LOCAL_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
] as const;

/**
 * Allowed browser origins for the standalone dashboard (Amplify + local dev).
 * Comma-separated via `DASHBOARD_ALLOWED_ORIGINS`; defaults to localhost when unset.
 */
export function resolveDashboardAllowedOrigins(): ReadonlySet<string> {
  const raw = process.env.DASHBOARD_ALLOWED_ORIGINS?.trim();
  if (raw) {
    return new Set(
      raw
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean)
    );
  }
  return new Set(DEFAULT_LOCAL_ORIGINS);
}

/** Register `@fastify/cors` with credentials for dashboard cross-origin access. */
export async function registerDashboardCors(fastify: FastifyInstance): Promise<void> {
  const allowed = resolveDashboardAllowedOrigins();

  await fastify.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, false);
        return;
      }
      if (allowed.has(origin)) {
        callback(null, origin);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key', 'Authorization'],
  });
}
