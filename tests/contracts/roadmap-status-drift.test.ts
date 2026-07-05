/**
 * Roadmap status drift (TEST-008)
 *
 * Guards against contradictions between the Program Status Ledger and the
 * Active Sequencing table in docs/foundation/roadmap.md — a real drift shipped
 * when D1 was marked shipped in the ledger but still listed as P0 active.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROADMAP = join(REPO_ROOT, 'docs/foundation/roadmap.md');

describe('Roadmap status consistency (TEST-008)', () => {
  const content = readFileSync(ROADMAP, 'utf-8');

  it('does not list D1 inversion as active P0 when dashboard-uiux is shipped in the ledger', () => {
    const ledgerShipped = /dashboard-uiux-improvements\.plan\.md[\s\S]*?\*\*Shipped\*\* 27\/27/;
    expect(content).toMatch(ledgerShipped);

    const d1ActiveP0 =
      /\|\s*\*\*P0\*\*\s*\|\s*Decision Panel D1/i.test(content) ||
      /\|\s*\*\*P0\*\*\s*\|\s*[^|]*D1 inversion/i.test(content);
    expect(d1ActiveP0).toBe(false);
  });

  it('does not use stale "on branch" qualifiers when ledger says merged to main', () => {
    expect(content).toMatch(/Shipped rows are merged to `main`/);

    const staleOnBranch =
      /complete on branch/i.test(content) ||
      /shipped on branch/i.test(content) ||
      /tasks on branch/i.test(content);
    expect(staleOnBranch).toBe(false);
  });

  it('does not list shipped specs as "impl complete on branch" in docs/specs/README.md', () => {
    const specsIndex = readFileSync(join(REPO_ROOT, 'docs/specs/README.md'), 'utf-8');
    expect(specsIndex).not.toMatch(/impl complete on branch/i);
  });
});
