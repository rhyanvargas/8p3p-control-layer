#!/usr/bin/env node
/**
 * Build dashboard/dist with VITE_* aligned to the server env (.env + .env.local).
 * Skips rebuild when the env fingerprint and dist/index.html are unchanged.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

const root = process.cwd();
const dashboardDir = resolve(root, 'dashboard');
const distIndex = resolve(dashboardDir, 'dist', 'index.html');
const stampPath = resolve(dashboardDir, '.build-env-stamp');

dotenv.config({ path: resolve(root, '.env') });
const localPath = resolve(root, '.env.local');
if (existsSync(localPath)) {
  dotenv.config({ path: localPath, override: true });
}

const viteEnv = {
  VITE_API_BASE_URL: process.env.VITE_API_BASE_URL ?? '',
  VITE_API_KEY: process.env.VITE_API_KEY ?? process.env.API_KEY ?? '',
  VITE_ORG_ID: process.env.VITE_ORG_ID ?? process.env.API_KEY_ORG_ID ?? '',
};

const fingerprint = createHash('sha256')
  .update(
    [viteEnv.VITE_API_BASE_URL, viteEnv.VITE_API_KEY, viteEnv.VITE_ORG_ID].join('\0')
  )
  .digest('hex');

if (
  existsSync(distIndex) &&
  existsSync(stampPath) &&
  readFileSync(stampPath, 'utf8').trim() === fingerprint
) {
  console.log('dashboard dist up to date (VITE_* matches server env)');
  process.exit(0);
}

if (!existsSync(resolve(dashboardDir, 'node_modules'))) {
  const ci = spawnSync('npm', ['ci', '--quiet'], { cwd: dashboardDir, stdio: 'inherit' });
  if (ci.status !== 0) process.exit(ci.status ?? 1);
}

console.log(
  'Building dashboard with VITE_ORG_ID=%s, VITE_API_KEY=%s',
  viteEnv.VITE_ORG_ID || '(empty)',
  viteEnv.VITE_API_KEY ? '(set)' : '(empty — auth off when API_KEY unset)'
);

const build = spawnSync('npm', ['run', 'build'], {
  cwd: dashboardDir,
  env: { ...process.env, ...viteEnv },
  stdio: 'inherit',
});

if (build.status !== 0) process.exit(build.status ?? 1);

writeFileSync(stampPath, fingerprint);
process.exit(0);
