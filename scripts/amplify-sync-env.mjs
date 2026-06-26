#!/usr/bin/env node
/**
 * Push dashboard runtime env vars to an Amplify branch (SSR compute).
 *
 * Usage:
 *   AMPLIFY_APP_ID=d1234567890 npm run amplify:sync-env
 *   AMPLIFY_APP_ID=d1234567890 AMPLIFY_ENV_FILE=dashboard/.env.pilot npm run amplify:sync-env
 *
 * Reads AMPLIFY_ENV_FILE (default dashboard/amplify.env.local) or process.env for:
 *   CONTROL_LAYER_API_BASE_URL, CONTROL_LAYER_API_KEY, CONTROL_LAYER_ORG_ID,
 *   DASHBOARD_ACCESS_CODE, COOKIE_SECRET, DASHBOARD_SESSION_TTL_HOURS,
 *   CONTROL_LAYER_ADMIN_API_KEY, NEXT_PUBLIC_APP_NAME
 *
 * @see docs/guides/aws-pilot-runbook.md § 3.2
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..');

const AMPLIFY_KEYS = [
  'CONTROL_LAYER_API_BASE_URL',
  'CONTROL_LAYER_API_KEY',
  'CONTROL_LAYER_ORG_ID',
  'DASHBOARD_ACCESS_CODE',
  'COOKIE_SECRET',
  'DASHBOARD_SESSION_TTL_HOURS',
  'CONTROL_LAYER_ADMIN_API_KEY',
  'NEXT_PUBLIC_APP_NAME',
];

const REQUIRED_FOR_PILOT = [
  'CONTROL_LAYER_API_BASE_URL',
  'CONTROL_LAYER_API_KEY',
  'CONTROL_LAYER_ORG_ID',
  'DASHBOARD_ACCESS_CODE',
  'COOKIE_SECRET',
];

function parseEnvFile(filePath) {
  const values = {};
  if (!existsSync(filePath)) {
    return values;
  }
  const text = readFileSync(filePath, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function fail(message) {
  console.error(`amplify-sync-env: ${message}`);
  process.exit(1);
}

const appId = process.env.AMPLIFY_APP_ID?.trim();
if (!appId) {
  fail('Set AMPLIFY_APP_ID (Amplify Console → App settings → General).');
}

const branchName = process.env.AMPLIFY_BRANCH?.trim() || 'main';
const region = process.env.AWS_REGION?.trim() || 'us-east-1';
const envFile = resolve(
  repoRoot,
  process.env.AMPLIFY_ENV_FILE?.trim() || 'dashboard/amplify.env.local',
);

const fileValues = parseEnvFile(envFile);
const merged = {};
for (const key of AMPLIFY_KEYS) {
  const fromEnv = process.env[key]?.trim();
  const fromFile = fileValues[key]?.trim();
  const value = fromEnv || fromFile;
  if (value) {
    merged[key] = value;
  }
}

const missing = REQUIRED_FOR_PILOT.filter((key) => !merged[key]);
if (missing.length > 0) {
  fail(
    `Missing required vars: ${missing.join(', ')}. ` +
      `Set in ${envFile} (see dashboard/amplify.env.example) or export them.`,
  );
}

if (merged.COOKIE_SECRET.length < 32) {
  fail('COOKIE_SECRET must be at least 32 characters (openssl rand -hex 32).');
}

const envPairs = Object.entries(merged).map(([k, v]) => `${k}=${v}`).join(',');

console.log(`Updating Amplify app ${appId} branch ${branchName} (${region})…`);
console.log(`Keys: ${Object.keys(merged).join(', ')}`);

const result = spawnSync(
  'aws',
  [
    'amplify',
    'update-branch',
    '--app-id',
    appId,
    '--branch-name',
    branchName,
    '--environment-variables',
    envPairs,
    '--region',
    region,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('');
console.log('Done. Trigger a redeploy if the branch was already live:');
console.log(`  aws amplify start-job --app-id ${appId} --branch-name ${branchName} --job-type RELEASE --region ${region}`);
