/**
 * Documentation boundary (DOC-001..DOC-004)
 *
 * Enforces committed-doc tier boundaries per docs/specs/documentation-boundary-migration.md:
 * no forbidden internal-docs hrefs, promoted foundation files present, cursor rules cite
 * committed schema paths, and specs index foundation links resolve.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const FORBIDDEN_INTERNAL_DOCS_HREF = /\]\(\.{0,2}\/internal-docs\//;

/** Files allowed to contain internal-docs href patterns (DOC-001 exception list). */
const DOC_001_HREF_EXCEPTIONS = new Set([
  'docs/foundation/documentation-boundaries.md',
  'docs/guides/internal-operations-stub.md',
  'docs/specs/documentation-boundary-migration.md',
]);

/** Promoted destinations from the migration spec Promote table (DOC-002). */
const PROMOTED_FOUNDATION_FILES = [
  'docs/foundation/api-naming-conventions.md',
  'docs/foundation/roadmap.md',
  'docs/foundation/definitive-workflow.md',
  'docs/guides/pilot-readiness-gates.md',
];

const DOC_003_RULE_FILES = [
  '.cursor/rules/project-context/RULE.md',
  '.cursor/rules/control-layer-constraints/RULE.md',
];

const POC_PLAYBOOKS_PATTERN = /internal-docs\/foundation\/poc-playbooks/;

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

function relPath(abs: string): string {
  return relative(REPO_ROOT, abs).split('\\').join('/');
}

function collectDoc001Targets(): string[] {
  const targets = new Set<string>();

  const readme = join(REPO_ROOT, 'README.md');
  if (statSync(readme, { throwIfNoEntry: false })) {
    targets.add(readme);
  }

  const docsRoot = join(REPO_ROOT, 'docs');
  if (statSync(docsRoot, { throwIfNoEntry: false })) {
    for (const f of walkFiles(docsRoot, (p) => p.endsWith('.md'))) {
      targets.add(f);
    }
  }

  return [...targets];
}

function extractMarkdownLinks(content: string): string[] {
  const hrefs: string[] = [];
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(content)) !== null) {
    hrefs.push(match[1]!.trim());
  }
  return hrefs;
}

function resolveMarkdownHref(fromFile: string, href: string): string | null {
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) {
    return null;
  }
  const withoutFragment = href.split('#')[0]!;
  if (!withoutFragment || withoutFragment.startsWith('mailto:')) {
    return null;
  }
  const abs = normalize(resolve(dirname(fromFile), withoutFragment));
  if (!abs.startsWith(REPO_ROOT)) {
    return null;
  }
  return relPath(abs);
}

describe('Documentation boundary (DOC-001)', () => {
  it('has no forbidden internal-docs hrefs in docs/ and README.md except allowed exceptions', () => {
    const hits: { file: string; line: number; text: string }[] = [];

    for (const file of collectDoc001Targets()) {
      const rel = relPath(file);
      if (DOC_001_HREF_EXCEPTIONS.has(rel)) continue;

      const content = readFileSync(file, 'utf-8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (FORBIDDEN_INTERNAL_DOCS_HREF.test(line)) {
          hits.push({ file: rel, line: i + 1, text: line.trim() });
        }
      });
    }

    expect(hits).toEqual([]);
  });
});

describe('Documentation boundary (DOC-002)', () => {
  it('promoted foundation and gate files exist and are non-empty', () => {
    const missing: string[] = [];
    const empty: string[] = [];

    for (const rel of PROMOTED_FOUNDATION_FILES) {
      const abs = join(REPO_ROOT, rel);
      if (!statSync(abs, { throwIfNoEntry: false })) {
        missing.push(rel);
        continue;
      }
      const content = readFileSync(abs, 'utf-8').trim();
      if (content.length === 0) {
        empty.push(rel);
      }
    }

    expect({ missing, empty }).toEqual({ missing: [], empty: [] });
  });
});

describe('Documentation boundary (DOC-003)', () => {
  it('cursor rules do not cite gitignored POC playbooks as SSoT', () => {
    const hits: { file: string; line: number; text: string }[] = [];

    for (const rel of DOC_003_RULE_FILES) {
      const abs = join(REPO_ROOT, rel);
      const content = readFileSync(abs, 'utf-8');
      const lines = content.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (POC_PLAYBOOKS_PATTERN.test(line)) {
          hits.push({ file: rel, line: i + 1, text: line.trim() });
        }
      });
    }

    expect(hits).toEqual([]);
  });
});

describe('Documentation boundary (DOC-004)', () => {
  it('spec index links to docs/foundation/*.md resolve', () => {
    const specsReadme = join(REPO_ROOT, 'docs/specs/README.md');
    const content = readFileSync(specsReadme, 'utf-8');
    const hrefs = extractMarkdownLinks(content);

    const foundationLinks: string[] = [];
    for (const href of hrefs) {
      const resolved = resolveMarkdownHref(specsReadme, href);
      if (resolved?.startsWith('docs/foundation/') && resolved.endsWith('.md')) {
        foundationLinks.push(resolved);
      }
    }

    expect(foundationLinks.length).toBeGreaterThan(0);

    const missing = foundationLinks.filter((rel) => !statSync(join(REPO_ROOT, rel), { throwIfNoEntry: false }));
    expect(missing).toEqual([]);
  });
});
