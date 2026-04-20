/**
 * Pilot copy drift (TEST-007)
 *
 * Per internal-docs/pilot-operations/pilot-runbook.md internal note (2026-04-18):
 * on the backend, "pause" can still map to possible risk or decay, but in client
 * conversations it must never be explained as "do nothing" or "temporary hold."
 *
 * This test fails if forbidden phrasing appears in canonical client-facing paths.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const TEMPORARY_HOLD = /temporary hold/i;
const PAUSE_DO_NOTHING = /\bpause\b.*\bdo nothing\b/is;

function walkFiles(root: string, predicate: (abs: string) => boolean): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const abs = join(dir, ent.name);
      if (ent.isDirectory()) {
        stack.push(abs);
      } else if (ent.isFile() && predicate(abs)) {
        out.push(abs);
      }
    }
  }
  return out;
}

function collectScanTargets(): string[] {
  const targets = new Set<string>();

  const readme = join(REPO_ROOT, 'README.md');
  if (statSync(readme, { throwIfNoEntry: false })) {
    targets.add(readme);
  }

  for (const base of ['docs/foundation', 'docs/specs', 'docs/guides']) {
    const absBase = join(REPO_ROOT, base);
    if (!statSync(absBase, { throwIfNoEntry: false })) continue;
    for (const f of walkFiles(absBase, (p) => p.endsWith('.md'))) {
      targets.add(f);
    }
  }

  const openapi = join(REPO_ROOT, 'docs/api/openapi.yaml');
  if (statSync(openapi, { throwIfNoEntry: false })) {
    targets.add(openapi);
  }

  const dashSrc = join(REPO_ROOT, 'dashboard', 'src');
  if (statSync(dashSrc, { throwIfNoEntry: false })) {
    for (const f of walkFiles(dashSrc, (p) => p.endsWith('.ts') || p.endsWith('.tsx'))) {
      targets.add(f);
    }
  }

  return [...targets];
}

describe('Pilot client-facing copy (TEST-007)', () => {
  it('has no "temporary hold" or pause-as-"do nothing" phrasing in canonical paths', () => {
    const hits: { file: string; line: number; text: string }[] = [];

    for (const file of collectScanTargets()) {
      const rel = file.replace(REPO_ROOT + '/', '');
      if (rel.startsWith('.cursor/plans/')) continue;
      if (rel.startsWith('docs/reports/')) continue;
      if (/^docs\/testing\/qa-test-pocv.*\.md$/.test(rel)) continue;
      if (rel.startsWith('.agents/')) continue;

      const content = readFileSync(file, 'utf-8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (TEMPORARY_HOLD.test(line) || PAUSE_DO_NOTHING.test(line)) {
          hits.push({ file: rel, line: i + 1, text: line.trim() });
        }
      });
    }

    expect(hits).toEqual([]);
  });
});
