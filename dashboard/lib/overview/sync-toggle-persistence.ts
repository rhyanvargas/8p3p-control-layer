const SYNC_TOGGLE_KEY = 'overview:sync-filters:v1';

export function readSyncToggle(): boolean {
  try {
    return localStorage.getItem(SYNC_TOGGLE_KEY) === 'on';
  } catch {
    return false;
  }
}

export function writeSyncToggle(on: boolean): void {
  try {
    localStorage.setItem(SYNC_TOGGLE_KEY, on ? 'on' : 'off');
  } catch {
    // Incognito, quota exceeded, or disabled — swallow per spec.
  }
}
