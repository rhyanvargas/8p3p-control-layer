import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  PAGE_URL_PARAMS,
  assertRegisteredQueryKeys,
  parseQueryKeys,
  type PageUrlParamDef,
  type PageUrlStateKind,
} from '@/lib/page-url-state';

const DASHBOARD_ROOT = join(process.cwd());

function read(relPath: string): string {
  return readFileSync(join(DASHBOARD_ROOT, relPath), 'utf8');
}

function walkSearchParamReads(source: string): string[] {
  const reads = new Set<string>();
  const pattern = /searchParams\.get\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    reads.add(match[1]!);
  }
  return [...reads];
}

function walkDrillDownHrefs(source: string): string[] {
  const hrefs = new Set<string>();
  const pattern = /href=\{?['"`]([^'"`]*\?[^'"`]*)['"`]\}?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    hrefs.add(match[1]!);
  }
  return [...hrefs];
}

const VISIBILITY_REQUIRED: PageUrlStateKind[] = ['data-filter', 'entry-context'];

describe('page-url-state registry', () => {
  it('every param has kind, routes, and visibility rules where required', () => {
    for (const [key, def] of Object.entries(PAGE_URL_PARAMS) as Array<
      [string, PageUrlParamDef]
    >) {
      expect(def.kind, key).toBeTruthy();
      expect(def.routes.length, key).toBeGreaterThan(0);

      if (VISIBILITY_REQUIRED.includes(def.kind)) {
        expect(
          def.visibleControl ?? def.allowedValues?.length,
          `${key} must declare visibleControl or allowedValues`
        ).toBeTruthy();
      }

      if (def.kind === 'entry-context') {
        for (const value of def.allowedValues ?? []) {
          expect(value.length, `${key} entry value`).toBeGreaterThan(0);
        }
      }
    }
  });

  it('KPI drill-down hrefs use only registered query keys', () => {
    const sectionCards = read('components/dashboard/section-cards.tsx');
    for (const href of walkDrillDownHrefs(sectionCards)) {
      const path = href.split('?')[0]!;
      assertRegisteredQueryKeys(href, path);
      for (const key of parseQueryKeys(href)) {
        expect(key in PAGE_URL_PARAMS).toBe(true);
      }
    }
  });

  it('client searchParams reads in dashboard routes are registered', () => {
    const files = [
      'app/(dashboard)/attention/_components/attention-queue.tsx',
      'app/(dashboard)/learners/_components/learners-roster.tsx',
      'app/(dashboard)/decisions/_components/decisions-stream.tsx',
    ];

    for (const file of files) {
      const source = read(file);
      for (const param of walkSearchParamReads(source)) {
        expect(
          param in PAGE_URL_PARAMS,
          `${file} reads unregistered param "${param}" — add to page-url-state.ts`
        ).toBe(true);
      }
    }
  });

  it('redirect-only status=pending is not a page filter pattern', () => {
    expect(PAGE_URL_PARAMS.status.kind).toBe('redirect-only');
    expect(PAGE_URL_PARAMS.status.allowedValues).toContain('pending');
  });

  it('reviewed param is a decisions review-status data filter', () => {
    expect(PAGE_URL_PARAMS.reviewed.kind).toBe('data-filter');
    expect(PAGE_URL_PARAMS.reviewed.routes).toContain('/decisions');
    expect(PAGE_URL_PARAMS.reviewed.allowedValues).toEqual(['pending', 'session']);
  });
});
