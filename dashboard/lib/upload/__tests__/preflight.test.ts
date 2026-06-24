import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { runPreflight, runPreflightSample } from '@/lib/upload/preflight';

describe('UPL-PRE-001: preflight client', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            verdict: 'pii_blocking',
            forbidden_pii: [{ key: 'ssn', path: 'payload.ssn' }],
            forbidden_semantic_raw: [],
            mapping_suggestions: [],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      )
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns upstream verdict for a representative sample', async () => {
    const result = await runPreflightSample([
      { source_system: 'lms-demo', payload: { ssn: '123-45-6789' } },
    ]);

    expect(result.verdict).toBe('pii_blocking');
    expect(result.forbidden_pii).toEqual([{ key: 'ssn', path: 'payload.ssn' }]);
  });

  it('posts source_system and payload to the dashboard preflight route', async () => {
    await runPreflight({ score: 0.8 }, 'lms-demo');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith('/api/preflight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ source_system: 'lms-demo', payload: { score: 0.8 } }),
    });
  });
});

describe('UPL-PRE-002: preflight client graceful degradation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns disabled when the route reports no admin key', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ disabled: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      )
    );

    const result = await runPreflight({ score: 1 }, 'lms-demo');
    expect(result).toEqual({ disabled: true });
  });

  it('returns disabled for an empty sample set', async () => {
    const result = await runPreflightSample([]);
    expect(result).toEqual({ disabled: true });
  });
});
