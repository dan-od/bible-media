/**
 * Loads the reader's collection (stars, saves, notes) from on-device storage
 * once at startup and makes it available app-wide, persisting every change.
 * Mirrors use-profile: `ready` is false until the first load resolves.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import {
  EMPTY_COLLECTION,
  recordEngagement as recordEngagementIn,
  setNote as setNoteIn,
  toggleSave as toggleSaveIn,
  toggleStar as toggleStarIn,
  type Collection,
  type NoteVisibility,
} from '@/data/collection';
import { loadCollection, saveCollection } from '@/data/storage';

interface CollectionContextValue {
  collection: Collection;
  ready: boolean;
  toggleStar: (id: string) => void;
  toggleSave: (id: string) => void;
  setNote: (id: string, body: string, visibility: NoteVisibility) => void;
  /** Record themes the reader engaged with (opening a search result). */
  recordEngagement: (themes: string[]) => void;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const [collection, setCollection] = useState<Collection>(EMPTY_COLLECTION);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    loadCollection().then((c) => {
      if (!mounted) return;
      setCollection(c);
      setReady(true);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Persist whenever the collection changes (after the initial load).
  useEffect(() => {
    if (ready) void saveCollection(collection);
  }, [collection, ready]);

  const toggleStar = useCallback((id: string) => setCollection((c) => toggleStarIn(c, id)), []);
  const toggleSave = useCallback((id: string) => setCollection((c) => toggleSaveIn(c, id)), []);
  const setNote = useCallback(
    (id: string, body: string, visibility: NoteVisibility) =>
      setCollection((c) => setNoteIn(c, id, body, visibility)),
    [],
  );
  const recordEngagement = useCallback(
    (themes: string[]) => setCollection((c) => recordEngagementIn(c, themes)),
    [],
  );

  const value = useMemo(
    () => ({ collection, ready, toggleStar, toggleSave, setNote, recordEngagement }),
    [collection, ready, toggleStar, toggleSave, setNote, recordEngagement],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be used within a CollectionProvider');
  return ctx;
}
