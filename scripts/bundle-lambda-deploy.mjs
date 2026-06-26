#!/usr/bin/env node
/**
 * Stage dist/ + production node_modules for CDK Lambda fromAsset.
 * Run after `npm run build` and before `cdk deploy`.
 */
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(root, '.lambda-deploy');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(join(root, 'dist'), join(out, 'dist'), { recursive: true });
cpSync(join(root, 'package.json'), join(out, 'package.json'));
cpSync(join(root, 'package-lock.json'), join(out, 'package-lock.json'));

const explanationSrc = join(root, 'services', 'explanation');
if (existsSync(explanationSrc)) {
  mkdirSync(join(out, 'services'), { recursive: true });
  cpSync(explanationSrc, join(out, 'services', 'explanation'), { recursive: true });
}

execSync('npm ci --omit=dev --ignore-scripts', { cwd: out, stdio: 'inherit' });

console.log('Lambda deploy bundle ready at .lambda-deploy');
