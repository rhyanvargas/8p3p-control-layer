#!/usr/bin/env node
/**
 * Generate a cryptographically secure API key for pilot/production.
 * Use for API_KEY in .env. Re-run to generate a new key (rotate as needed).
 *
 * Usage: npm run generate:api-key   or   node scripts/generate-api-key.mjs
 */

import { randomBytes } from 'crypto';

const key = randomBytes(32).toString('hex');

console.log('Generated API key (add to .env as API_KEY=...):');
console.log('');
console.log(`API_KEY=${key}`);
console.log('');
console.log('Optional: set API_KEY_ORG_ID to override client org_id (e.g. API_KEY_ORG_ID=org_pilot).');
console.log('Do not commit .env. Rotate keys by re-running: npm run generate:api-key');
