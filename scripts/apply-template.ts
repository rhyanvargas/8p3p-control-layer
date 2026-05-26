#!/usr/bin/env tsx
/**
 * apply-template — thin CLI wrapper for POST /v1/admin/connectors/activate
 *
 * Usage:
 *   ADMIN_API_KEY=<key> CONTROL_LAYER_URL=http://localhost:3000 \
 *     npx tsx scripts/apply-template.ts <source_system> --org-id <org_id> [--force]
 *
 * Environment variables:
 *   CONTROL_LAYER_URL  Base URL of the control layer (default: http://localhost:3000)
 *   ADMIN_API_KEY      Admin API key (required)
 *
 * Exit codes: 0 = success, 1 = error
 */

const args = process.argv.slice(2);

function parseArgs(argv: string[]): { sourceSystem: string; orgId: string; force: boolean } | null {
  let sourceSystem: string | undefined;
  let orgId: string | undefined;
  let force = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--org-id' && i + 1 < argv.length) {
      orgId = argv[++i];
    } else if (argv[i] === '--force') {
      force = true;
    } else if (!argv[i].startsWith('--')) {
      sourceSystem = argv[i];
    }
  }

  if (!sourceSystem || !orgId) return null;
  return { sourceSystem, orgId, force };
}

const parsed = parseArgs(args);

if (!parsed) {
  console.error('Usage: apply-template <source_system> --org-id <org_id> [--force]');
  process.exit(1);
}

const adminKey = process.env.ADMIN_API_KEY;
if (!adminKey) {
  console.error('Error: ADMIN_API_KEY env var is required');
  process.exit(1);
}

const baseUrl = (process.env.CONTROL_LAYER_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const body: Record<string, unknown> = {
  org_id: parsed.orgId,
  source_system: parsed.sourceSystem,
};
if (parsed.force) {
  body.force = true;
}

const url = `${baseUrl}/v1/admin/connectors/activate`;
console.log(`POST ${url}`);

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-api-key': adminKey,
  },
  body: JSON.stringify(body),
});

const responseText = await response.text();
let responseJson: unknown;
try {
  responseJson = JSON.parse(responseText);
} catch {
  responseJson = responseText;
}

if (response.ok) {
  console.log('Success:', JSON.stringify(responseJson, null, 2));
  process.exit(0);
} else {
  console.error(`Error ${response.status}:`, JSON.stringify(responseJson, null, 2));
  process.exit(1);
}
