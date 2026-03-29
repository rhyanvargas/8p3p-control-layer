#!/usr/bin/env tsx
/**
 * validate-policy — thin CLI wrapper for POST /v1/admin/policies/validate
 *
 * Usage:
 *   ADMIN_API_KEY=<key> CONTROL_LAYER_URL=http://localhost:3000 \
 *     npx tsx scripts/validate-policy.ts <path-to-policy.json>
 *
 *   Or pipe from stdin:
 *   cat policy.json | ADMIN_API_KEY=<key> npx tsx scripts/validate-policy.ts -
 *
 * Environment variables:
 *   CONTROL_LAYER_URL  Base URL of the control layer (default: http://localhost:3000)
 *   ADMIN_API_KEY      Admin API key (required)
 *
 * Exit codes: 0 = valid, 1 = invalid or error
 */

import { readFileSync } from 'fs';

const [, , policyPath] = process.argv;

if (!policyPath) {
  console.error('Usage: validate-policy <path-to-policy.json | ->');
  process.exit(1);
}

const adminKey = process.env.ADMIN_API_KEY;
if (!adminKey) {
  console.error('Error: ADMIN_API_KEY env var is required');
  process.exit(1);
}

const baseUrl = (process.env.CONTROL_LAYER_URL ?? 'http://localhost:3000').replace(/\/$/, '');

let rawContent: string;
if (policyPath === '-') {
  rawContent = readFileSync('/dev/stdin', 'utf-8');
} else {
  try {
    rawContent = readFileSync(policyPath, 'utf-8');
  } catch (err) {
    console.error(`Failed to read policy file: ${policyPath}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

let policyJson: unknown;
try {
  policyJson = JSON.parse(rawContent);
} catch (err) {
  console.error('Failed to parse JSON:', err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const url = `${baseUrl}/v1/admin/policies/validate`;
console.log(`POST ${url}`);

const response = await fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-admin-api-key': adminKey,
  },
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
  console.log('Valid:', JSON.stringify(parsed, null, 2));
  process.exit(0);
} else {
  console.error(`Invalid (${response.status}):`, JSON.stringify(parsed, null, 2));
  process.exit(1);
}
