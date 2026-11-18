/**
 * The reader's recent searches — local only, like everything else in these
 * steps (see storage.ts). Pure helpers here are unit-tested; the storage/React
 * wiring lives in use-search-history.
 *
 * The one rule worth stating: when history is turned OFF in Settings, nothing
 * is written. `recordSearch` with `keep=false` returns the history untouched —
 * the switch suppresses writes, it does not merely hide what was already there.
 */

export interface SearchHistory {
  /** Queries, most recent first, de-duplicated case-insensitively. */
  entries: string[];
}

export const EMPTY_HISTORY: SearchHistory = { entries: [] };

/** How many recent searches we keep. Old ones fall off the end. */
export const MAX_HISTORY = 20;

/**
 * Record a search at the top of the list. A blank query is ignored; a repeat
 * moves to the top rather than duplicating. When `keep` is false (history off)
 * the history is returned unchanged — nothing is written.
 */
export function recordSearch(history: SearchHistory, query: string, keep: boolean = true): SearchHistory {
  if (!keep) return history;
  const q = query.trim();
  if (!q) return history;
  const lower = q.toLowerCase();
  const rest = history.entries.filter((e) => e.toLowerCase() !== lower);
  return { entries: [q, ...rest].slice(0, MAX_HISTORY) };
}

/** Remove one entry (matched case-insensitively). */
export function removeSearch(history: SearchHistory, query: string): SearchHistory {
  const lower = query.trim().toLowerCase();
  return { entries: history.entries.filter((e) => e.toLowerCase() !== lower) };
}

/** Clear the whole history. */
export function clearHistory(): SearchHistory {
  return EMPTY_HISTORY;
}

/** Parse a stored history defensively: tolerate garbage, de-dupe, cap. */
export function parseHistory(raw: string | null): SearchHistory {
  if (!raw) return EMPTY_HISTORY;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_HISTORY;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_HISTORY;
  const list = (data as Record<string, unknown>).entries;
  if (!Array.isArray(list)) return EMPTY_HISTORY;

  const seen = new Set<string>();
  const entries: string[] = [];
  for (const x of list) {
    if (typeof x !== 'string') continue;
    const q = x.trim();
    if (!q) continue;
    const lower = q.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    entries.push(q);
    if (entries.length >= MAX_HISTORY) break;
  }
  return { entries };
}
