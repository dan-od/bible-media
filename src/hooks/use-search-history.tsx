/**
 * The reader's recent searches, as the Search screen uses them. Backed by the
 * shared local store (data/local-store), so signing out clears them on a screen
 * that's already open. Writes honour the Settings switch: when
 * `profile.keepSearchHistory` is off, `record` is a no-op and nothing is written
 * (see search-history.ts). Existing entries are left in place; the switch stops
 * new writes, it is not a visibility toggle.
 */
import { useCallback } from 'react';

import { clearHistory as clearStoredHistory, updateHistory, useLocal } from '@/data/local-store';
import { recordSearch, removeSearch } from '@/data/search-history';
import { useProfile } from '@/hooks/use-profile';

export function useSearchHistory() {
  const { profile } = useProfile();
  const keep = profile.keepSearchHistory;
  const { history, ready } = useLocal();

  // keep=false suppresses the write entirely (recordSearch returns unchanged).
  const record = useCallback((query: string) => void updateHistory((h) => recordSearch(h, query, keep)).catch(() => undefined), [keep]);
  const remove = useCallback((query: string) => void updateHistory((h) => removeSearch(h, query)).catch(() => undefined), []);
  const clear = useCallback(() => void clearStoredHistory().catch(() => undefined), []);

  return { history, ready, record, remove, clear };
}
