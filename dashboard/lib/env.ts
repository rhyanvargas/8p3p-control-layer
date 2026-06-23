/** Server-only environment accessors. Do not import from client components. */

export type ServerEnv = {
  CONTROL_LAYER_API_BASE_URL: string;
  CONTROL_LAYER_API_KEY: string;
  CONTROL_LAYER_ORG_ID?: string;
  NEXT_PUBLIC_APP_NAME: string;
  DASHBOARD_ACCESS_CODE?: string;
  DASHBOARD_SESSION_TTL_HOURS: number;
  COOKIE_SECRET?: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function optionalNumberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number for environment variable ${name}: ${raw}`);
  }
  return parsed;
}

let cachedEnv: ServerEnv | null = null;

/** @internal Resets cached env for unit/integration tests only. */
export function resetServerEnvForTest(): void {
  cachedEnv = null;
}

/** Typed server-only env; throws when required control-layer vars are missing. */
export function getServerEnv(): ServerEnv {
  if (cachedEnv) return cachedEnv;

  cachedEnv = {
    CONTROL_LAYER_API_BASE_URL: requireEnv('CONTROL_LAYER_API_BASE_URL'),
    CONTROL_LAYER_API_KEY: requireEnv('CONTROL_LAYER_API_KEY'),
    CONTROL_LAYER_ORG_ID: optionalEnv('CONTROL_LAYER_ORG_ID'),
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'Decision Panel',
    DASHBOARD_ACCESS_CODE: optionalEnv('DASHBOARD_ACCESS_CODE'),
    DASHBOARD_SESSION_TTL_HOURS: optionalNumberEnv('DASHBOARD_SESSION_TTL_HOURS', 8),
    COOKIE_SECRET: optionalEnv('COOKIE_SECRET'),
  };

  return cachedEnv;
}
