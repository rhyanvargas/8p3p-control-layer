/**
 * Amplify dashboard deploy contract — build spec + env template parity with pilot runbook.
 * @see docs/guides/operators/aws-pilot-runbook.md § 3
 * @see docs/specs/nextjs-amplify-dashboard-migration.md § amplify.yml
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const amplifyYmlPath = path.join(repoRoot, 'dashboard/amplify.yml');
const amplifyEnvExamplePath = path.join(repoRoot, 'dashboard/amplify.env.example');

const RUNBOOK_REQUIRED_ENV = [
  'CONTROL_LAYER_API_BASE_URL',
  'CONTROL_LAYER_API_KEY',
  'CONTROL_LAYER_ORG_ID',
  'DASHBOARD_ACCESS_CODE',
  'COOKIE_SECRET',
];

const RUNBOOK_OPTIONAL_ENV = [
  'DASHBOARD_SESSION_TTL_HOURS',
  'CONTROL_LAYER_ADMIN_API_KEY',
  'NEXT_PUBLIC_APP_NAME',
];

describe('Amplify dashboard deploy contracts', () => {
  it('amplify.yml pins Node 22, runs next build, and artifacts baseDirectory .next', () => {
    const doc = parseYaml(readFileSync(amplifyYmlPath, 'utf8')) as {
      version: number;
      frontend: {
        phases: { preBuild: { commands: string[] }; build: { commands: string[] } };
        artifacts: { baseDirectory: string; files: string[] };
        cache: { paths: string[] };
      };
    };

    expect(doc.version).toBe(1);
    const preBuild = doc.frontend.phases.preBuild.commands.join('\n');
    expect(preBuild).toMatch(/nvm install 22/);
    expect(preBuild).toMatch(/nvm use 22/);
    expect(preBuild).toMatch(/npm ci/);

    const build = doc.frontend.phases.build.commands.join('\n');
    expect(build).toMatch(/npm run build/);

    expect(doc.frontend.artifacts.baseDirectory).toBe('.next');
    expect(doc.frontend.artifacts.files).toContain('**/*');
    expect(doc.frontend.cache.paths.some((p) => p.includes('.next/cache'))).toBe(true);
  });

  it('amplify.env.example documents all runbook § 3.2 env vars', () => {
    const example = readFileSync(amplifyEnvExamplePath, 'utf8');
    for (const key of [...RUNBOOK_REQUIRED_ENV, ...RUNBOOK_OPTIONAL_ENV]) {
      expect(example, `missing ${key} in amplify.env.example`).toContain(key);
    }
  });
});
