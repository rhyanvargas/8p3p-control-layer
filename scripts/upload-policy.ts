#!/usr/bin/env tsx
/**
 * upload-policy — thin CLI wrapper for PUT /v1/admin/policies/:org_id/:policy_key
 *
 * Usage:
 *   ADMIN_API_KEY=<key> CONTROL_LAYER_URL=http://localhost:3000 \
 *     npx tsx scripts/upload-policy.ts <org_id> <policy_key> <path-to-policy.json>
 *
 * Environment variables:
 *   CONTROL_LAYER_URL  Base URL of the control layer (default: http://localhost:3000)
 *   ADMIN_API_KEY      Admin API key (required)
 *   IF_MATCH           Optional policy_version integer for optimistic locking
 *
 * Exit codes: 0 = success, 1 = error
 */

import { readFileSync } from 'fs';

const [, , orgId, policyKey, policyPath] = process.argv;

if (!orgId || !policyKey || !policyPath) {
  console.error('Usage: upload-policy <org_id> <policy_key> <path-to-policy.json>');
  process.exit(1);
}

const adminKey = process.env.ADMIN_API_KEY;
if (!adminKey) {
  console.error('Error: ADMIN_API_KEY env var is required');
  process.exit(1);
}

const baseUrl = (process.env.CONTROL_LAYER_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let policyJson: unknown;
try {
  policyJson = JSON.parse(readFileSync(policyPath, 'utf-8'));
} catch (err) {
  console.error(`Failed to read policy file: ${policyPath}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  'x-admin-api-key': adminKey,
};

const ifMatch = process.env.IF_MATCH;
if (ifMatch) {
  headers['If-Match'] = ifMatch;
}

const url = `${baseUrl}/v1/admin/policies/${encodeURIComponent(orgId)}/${encodeURIComponent(policyKey)}`;
console.log(`PUT ${url}`);

const response = await fetch(url, {
  method: 'PUT',
  headers,
  body: JSON.stringify(policyJson),
});

const body = await response.text();
let parsed: unknown;
try {
  parsed = JSON.parse(body);
} catch {
  parsed = body;
}

if (response.ok) {
  console.log('Success:', JSON.stringify(parsed, null, 2));
  process.exit(0);
} else {
  console.error(`Error ${response.status}:`, JSON.stringify(parsed, null, 2));
  process.exit(1);
}
