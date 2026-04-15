const KEY = '8p3p-reviewed-decisions';

export function markReviewed(decisionId: string): void {
  const set = getReviewed();
  set.add(decisionId);
  localStorage.setItem(KEY, JSON.stringify([...set]));
}

export function isReviewed(decisionId: string): boolean {
  return getReviewed().has(decisionId);
}

function getReviewed(): Set<string> {
  try {
    const raw = localStorage.getItem(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
