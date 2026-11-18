/**
 * Loads the reader's recent searches from on-device storage once, and persists
 * every change — mirroring use-collection. Writes honour the Settings switch:
 * when `profile.keepSearchHistory` is off, `record` is a no-op and nothing is
 * written (see search-history.ts). Existing entries are left in place; the
 * switch stops new writes, it is not a visibility toggle.
 *
 * Search is the only screen that needs this, so it's a plain hook rather than a
 * context provider.
 */
import { useCallback, useEffect, useState } from 'react';

import {
  clearHistory as clearHistoryIn,
  EMPTY_HISTORY,
  recordSearch,
  removeSearch,
  type SearchHistory,
} from '@/data/search-history';
import { loadSearchHistory, saveSearchHistory } from '@/data/storage';
import { useProfile } from '@/hooks/use-profile';

export function useSearchHistory() {
  const { profile } = useProfile();
  const keep = profile.keepSearchHistory;

  const [history, setHistory] = useState<SearchHistory>(EMPTY_HISTORY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadSearchHistory().then((h) => {
      if (!mounted) return;
      setHistory(h);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (ready) void saveSearchHistory(history);
  }, [history, ready]);

  // keep=false suppresses the write entirely (recordSearch returns unchanged).
  const record = useCallback((query: string) => setHistory((h) => recordSearch(h, query, keep)), [keep]);
  const remove = useCallback((query: string) => setHistory((h) => removeSearch(h, query)), []);
  const clear = useCallback(() => setHistory(clearHistoryIn()), []);

  return { history, ready, record, remove, clear };
}
