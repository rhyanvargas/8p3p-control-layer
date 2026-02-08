/**
 * Validate all JSON Schemas in src/contracts/schemas/
 * Compiles each with Ajv to ensure they are well-formed and usable.
 */

import Ajv from 'ajv';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const AjvClass = (Ajv as Record<string, unknown>).default ?? Ajv;
const ajv = new (AjvClass as typeof Ajv)({
  allErrors: true,
  strict: true,
  strictSchema: true,
});

const schemasDir = join(process.cwd(), 'src', 'contracts', 'schemas');
const files = readdirSync(schemasDir).filter((f) => f.endsWith('.json'));

if (files.length === 0) {
  console.log('No JSON schema files found in src/contracts/schemas/');
  process.exit(0);
}

let failed = false;

for (const file of files) {
  const filePath = join(schemasDir, file);
  try {
    const schema = JSON.parse(readFileSync(filePath, 'utf-8'));
    ajv.compile(schema);
    console.log(`✓ ${file}`);
  } catch (err) {
    console.error(`✗ ${file}: ${(err as Error).message}`);
    failed = true;
  }
}

if (failed) {
  console.error('\nSchema validation failed.');
  process.exit(1);
} else {
  console.log(`\nAll ${files.length} schema(s) valid.`);
  process.exit(0);
}
