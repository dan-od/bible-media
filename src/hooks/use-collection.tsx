/**
 * The reader's collection (stars, saves, notes) and engagement tally, app-wide.
 * Backed by the shared local store (data/local-store), every change persisted.
 * `collection` is what the signed-in account (or no one) may see.
 */
import { createContext, useCallback, useContext, useMemo } from 'react';

import {
  editNote as editNoteIn,
  recordEngagement as recordEngagementIn,
  setNote as setNoteIn,
  toggleSave as toggleSaveIn,
  toggleStar as toggleStarIn,
  viewFor,
  type Collection,
  type NoteVisibility,
} from '@/data/collection';
import { changeContext, updateLocal, useLocal } from '@/data/local-store';

interface CollectionContextValue {
  collection: Collection;
  ready: boolean;
  toggleStar: (passageId: string) => void;
  toggleSave: (passageId: string) => void;
  /** Write the note on a passage (edits its most recent note). Empty removes it. */
  setNote: (passageId: string, body: string, visibility: NoteVisibility) => void;
  /** Edit one note by id. Empty removes it. */
  editNote: (clientId: string, body: string, visibility: NoteVisibility) => void;
  /** Record themes the reader engaged with (opening a search result). Never leaves the phone. */
  recordEngagement: (themes: string[]) => void;
}

const CollectionContext = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: React.ReactNode }) {
  const local = useLocal();
  const viewer = local.account?.userId ?? null;
  const collection = useMemo(() => viewFor(local.collection, viewer), [local.collection, viewer]);

  const change = useCallback((fn: (c: Collection) => Collection) => {
    void updateLocal((s) => ({ ...s, collection: fn(s.collection) }));
  }, []);

  const toggleStar = useCallback((id: string) => change((c) => toggleStarIn(c, id, changeContext())), [change]);
  const toggleSave = useCallback((id: string) => change((c) => toggleSaveIn(c, id, changeContext())), [change]);
  const setNote = useCallback(
    (id: string, body: string, visibility: NoteVisibility) => change((c) => setNoteIn(c, id, body, visibility, changeContext())),
    [change],
  );
  const editNote = useCallback(
    (clientId: string, body: string, visibility: NoteVisibility) =>
      change((c) => editNoteIn(c, clientId, body, visibility, changeContext())),
    [change],
  );
  const recordEngagement = useCallback((themes: string[]) => change((c) => recordEngagementIn(c, themes)), [change]);

  const value = useMemo(
    () => ({ collection, ready: local.ready, toggleStar, toggleSave, setNote, editNote, recordEngagement }),
    [collection, local.ready, toggleStar, toggleSave, setNote, editNote, recordEngagement],
  );

  return <CollectionContext.Provider value={value}>{children}</CollectionContext.Provider>;
}

export function useCollection(): CollectionContextValue {
  const ctx = useContext(CollectionContext);
  if (!ctx) throw new Error('useCollection must be used within a CollectionProvider');
  return ctx;
}
