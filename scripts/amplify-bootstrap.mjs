#!/usr/bin/env node
/**
 * Bootstrap Amplify Hosting for the Decision Panel (WEB_COMPUTE / Next.js 15 SSR).
 *
 * Creates the app + main branch if they do not exist. GitHub connection must be
 * completed in Amplify Console (OAuth) unless AMPLIFY_GITHUB_TOKEN is set.
 *
 * Usage:
 *   npm run amplify:bootstrap
 *   AMPLIFY_GITHUB_TOKEN=ghp_... npm run amplify:bootstrap   # optional Git connect
 *
 * After bootstrap:
 *   1. Set app root to `dashboard` in Console if not connected via this script
 *   2. Copy dashboard/amplify.env.example → dashboard/amplify.env.local (vault values)
 *   3. AMPLIFY_APP_ID=<id> npm run amplify:sync-env
 *   4. DASHBOARD_URL=... DASHBOARD_ACCESS_CODE=... npm run amplify:verify-dashboard
 *
 * @see docs/guides/aws-pilot-runbook.md § 3
 */
import { spawnSync } from 'node:child_process';

const region = process.env.AWS_REGION?.trim() || 'us-east-1';
const appName = process.env.AMPLIFY_APP_NAME?.trim() || '8p3p-decision-panel-pilot';
const branchName = process.env.AMPLIFY_BRANCH?.trim() || 'main';
const githubToken = process.env.AMPLIFY_GITHUB_TOKEN?.trim();
const repository =
  process.env.AMPLIFY_REPOSITORY?.trim() ||
  'https://github.com/rhyanvargas/8p3p-control-layer';

function runAws(args, { capture = false } = {}) {
  const result = spawnSync('aws', [...args, '--region', region, '--output', 'json'], {
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.status !== 0) {
    if (capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }
  return capture ? JSON.parse(result.stdout || '{}') : null;
}

function fail(message) {
  console.error(`amplify-bootstrap: ${message}`);
  process.exit(1);
}

console.log(`Region: ${region}`);
console.log(`App name: ${appName}`);

const list = runAws(['amplify', 'list-apps'], { capture: true });
const existing = (list.apps ?? []).find((a) => a.name === appName);

let appId = existing?.appId;

if (appId) {
  console.log(`Found existing app ${appName} (${appId})`);
} else {
  console.log(`Creating Amplify app ${appName} (platform WEB_COMPUTE)…`);
  const createArgs = [
    'amplify',
    'create-app',
    '--name',
    appName,
    '--platform',
    'WEB_COMPUTE',
  ];

  if (githubToken) {
    createArgs.push('--repository', repository, '--oauth-token', githubToken);
  }

  const created = runAws(createArgs, { capture: true });
  appId = created.app?.appId;
  if (!appId) {
    fail('create-app did not return appId');
  }
  console.log(`Created app ${appId}`);
  console.log('');
  console.log('Console follow-up (if GitHub not connected):');
  console.log('  Amplify → App → Hosting → Connect branch → set App root = dashboard');
}

const branches = runAws(['amplify', 'list-branches', '--app-id', appId], { capture: true });
const hasBranch = (branches.branches ?? []).some((b) => b.branchName === branchName);

if (!hasBranch) {
  console.log(`Creating branch ${branchName}…`);
  runAws(['amplify', 'create-branch', '--app-id', appId, '--branch-name', branchName]);
} else {
  console.log(`Branch ${branchName} already exists`);
}

const defaultDomain = `https://${branchName}.${appId}.amplifyapp.com`;

console.log('');
console.log('Bootstrap complete.');
console.log(`  AMPLIFY_APP_ID=${appId}`);
console.log(`  Dashboard URL (after first deploy): ${defaultDomain}`);
console.log('');
console.log('Next steps:');
console.log('  1. Connect GitHub + set monorepo app root to dashboard (if not done)');
console.log('  2. Fill dashboard/amplify.env.local from pilot vault (see amplify.env.example)');
console.log(`  3. AMPLIFY_APP_ID=${appId} npm run amplify:sync-env`);
console.log('  4. After deploy: DASHBOARD_URL=... DASHBOARD_ACCESS_CODE=... npm run amplify:verify-dashboard');
