import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { readSyncToggle, writeSyncToggle } from '@/lib/overview/sync-toggle-persistence';

const SYNC_TOGGLE_KEY = 'overview:sync-filters:v1';

describe('XFILTER-006: toggle persistence read/write', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('persists ON under the versioned key and reads it back', () => {
    expect(readSyncToggle()).toBe(false);

    writeSyncToggle(true);
    expect(localStorage.getItem(SYNC_TOGGLE_KEY)).toBe('on');
    expect(readSyncToggle()).toBe(true);
  });

  it('persists OFF and reads OFF', () => {
    writeSyncToggle(true);
    writeSyncToggle(false);
    expect(localStorage.getItem(SYNC_TOGGLE_KEY)).toBe('off');
    expect(readSyncToggle()).toBe(false);
  });

  it('does not persist filter selection — only toggle state lives in storage', () => {
    writeSyncToggle(true);
    const keys = Object.keys(localStorage);
    expect(keys).toEqual([SYNC_TOGGLE_KEY]);
    expect(localStorage.getItem(SYNC_TOGGLE_KEY)).toBe('on');
  });
});

describe('XFILTER-007: localStorage failure degrades to OFF', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('readSyncToggle returns false when getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    expect(() => readSyncToggle()).not.toThrow();
    expect(readSyncToggle()).toBe(false);
  });

  it('writeSyncToggle swallows setItem errors', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });

    expect(() => writeSyncToggle(true)).not.toThrow();
    expect(readSyncToggle()).toBe(false);
  });
});
