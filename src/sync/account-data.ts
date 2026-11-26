/**
 * Moving an account's data onto and off this phone.
 *
 * - `mergeSnapshot` (sign-in, after the claim): what the account already holds —
 *   from another phone, or from before this phone signed out — joins the local copy,
 *   so the phone stays the read path. It follows the server's merge rules: one star
 *   or save per passage, situations and tuned themes by theme, own words and notes
 *   kept as they are. Anything this phone is still waiting to remove isn't brought back.
 * - `release` (sign-out): the local copies of what the account has confirmed are
 *   cleared, since they're on the server and phones get shared, and so is the tally. Records the server
 *   hasn't confirmed yet stay, hidden, until that account signs in again: they belong
 *   to it, so they're neither lost nor shown to anyone else.
 */
import { isSynced, type Claimable, type Removal } from '@/data/claimable';
import type { Mark, Note, NoteVisibility } from '@/data/collection';
import type { LabelRecord, WordsRecord } from '@/data/profile';
import { getPassages } from '@/data/verseStore';

import type { LocalState, PassageKey } from './claim';

export interface Snapshot {
  consented: boolean;
  profile: { display_name: string; level: string; translation_id: string | null } | null;
  stars: { client_id: string | null; created_at: string; passage: PassageKey }[];
  saves: { client_id: string | null; created_at: string; passage: PassageKey }[];
  notes: {
    client_id: string | null;
    body: string;
    visibility: NoteVisibility;
    created_at: string;
    updated_at: string;
    passage: PassageKey;
  }[];
  situations: { client_id: string | null; label: string | null; own_words: string | null; started_at: string }[];
  tuned: { client_id: string | null; label: string; created_at: string }[];
}

const keyOf = (p: PassageKey) => `${p.book}|${p.chapter}|${p.verse_start}|${p.verse_end}`;

function passageIndex(): Map<string, string> {
  return new Map(
    getPassages().map((p) => [keyOf({ book: p.book, chapter: p.chapter, verse_start: p.verseStart, verse_end: p.verseEnd }), p.id]),
  );
}

const ms = (t: string) => {
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : 0;
};

const confirmed = (clientId: string, owner: string): Claimable => ({ clientId, owner, rev: 1, syncedRev: 1 });

export function mergeSnapshot(s: LocalState, snap: Snapshot, userId: string): LocalState {
  const passages = passageIndex();
  const mine = <T extends Claimable>(r: T) => r.owner === userId;
  const removed = [...s.collection.removed, ...s.profile.removed].filter((r) => r.owner === userId);
  const removing = (pred: (r: Removal) => boolean) => removed.some(pred);
  const known = new Set(
    [
      ...s.collection.stars,
      ...s.collection.saves,
      ...s.collection.notes,
      ...s.profile.situations,
      ...s.profile.tuned,
      ...s.profile.words,
    ].map((r) => r.clientId),
  );

  const marks = (local: Mark[], rows: Snapshot['stars'], kind: 'star' | 'save'): Mark[] => {
    const out = [...local];
    for (const row of rows) {
      const passageId = passages.get(keyOf(row.passage));
      // A passage this build doesn't carry stays on the server, untouched.
      if (!row.client_id || !passageId || known.has(row.client_id)) continue;
      if (out.some((r) => mine(r) && r.passageId === passageId)) continue;
      if (removing((r) => r.kind === kind && r.passageId === passageId)) continue;
      out.push({ ...confirmed(row.client_id, userId), passageId, createdAt: ms(row.created_at) });
      known.add(row.client_id);
    }
    return out;
  };

  const notes: Note[] = [...s.collection.notes];
  for (const row of snap.notes) {
    const passageId = passages.get(keyOf(row.passage));
    if (!row.client_id || !passageId || known.has(row.client_id)) continue;
    if (removing((r) => r.kind === 'note' && r.clientId === row.client_id)) continue;
    notes.push({
      ...confirmed(row.client_id, userId),
      passageId,
      body: row.body,
      visibility: row.visibility,
      createdAt: ms(row.created_at),
      updatedAt: ms(row.updated_at),
    });
    known.add(row.client_id);
  }

  const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const labels = (local: LabelRecord[], rows: { client_id: string | null; label: string; at: string }[], kind: 'situation' | 'tuned') => {
    const out = [...local];
    for (const row of rows) {
      if (!row.client_id || known.has(row.client_id)) continue;
      if (out.some((r) => mine(r) && sameLabel(r.label, row.label))) continue;
      if (removing((r) => r.kind === kind && !!r.label && sameLabel(r.label, row.label))) continue;
      out.push({ ...confirmed(row.client_id, userId), label: row.label, createdAt: ms(row.at) });
      known.add(row.client_id);
    }
    return out;
  };

  const words: WordsRecord[] = [...s.profile.words];
  for (const row of snap.situations) {
    if (row.label !== null || !row.own_words || !row.client_id || known.has(row.client_id)) continue;
    if (removing((r) => r.kind === 'words' && r.clientId === row.client_id)) continue;
    if (words.some((w) => mine(w) && w.text.trim() === row.own_words!.trim())) continue;
    words.push({ ...confirmed(row.client_id, userId), text: row.own_words, createdAt: ms(row.started_at), updatedAt: ms(row.started_at) });
    known.add(row.client_id);
  }

  return {
    collection: {
      ...s.collection,
      stars: marks(s.collection.stars, snap.stars, 'star'),
      saves: marks(s.collection.saves, snap.saves, 'save'),
      notes,
    },
    profile: {
      ...s.profile,
      situations: labels(
        s.profile.situations,
        snap.situations.filter((r) => r.label !== null).map((r) => ({ client_id: r.client_id, label: r.label!, at: r.started_at })),
        'situation',
      ),
      tuned: labels(
        s.profile.tuned,
        snap.tuned.map((r) => ({ client_id: r.client_id, label: r.label, at: r.created_at })),
        'tuned',
      ),
      words,
    },
  };
}

/**
 * Sign-out: clear what the server has confirmed; keep (hidden) what it hasn't. The
 * tally of themes engaged with is cleared too: it's built from searches, which are
 * deleted at sign-out (see sync/account), and it's never claimed.
 */
export function release(s: LocalState, userId: string): LocalState {
  const keep = <T extends Claimable>(list: T[]) => list.filter((r) => !(r.owner === userId && isSynced(r)));
  return {
    collection: {
      ...s.collection,
      engaged: {},
      stars: keep(s.collection.stars),
      saves: keep(s.collection.saves),
      notes: keep(s.collection.notes),
    },
    profile: {
      ...s.profile,
      situations: keep(s.profile.situations),
      tuned: keep(s.profile.tuned),
      words: keep(s.profile.words),
    },
  };
}

/** Whether this account has anything the server hasn't confirmed (sign-out warns). */
export function hasUnsent(s: LocalState, userId: string): boolean {
  const any = (list: Claimable[]) => list.some((r) => r.owner === userId && !isSynced(r) && !r.rejected);
  return (
    any(s.collection.stars) ||
    any(s.collection.saves) ||
    any(s.collection.notes) ||
    any(s.profile.situations) ||
    any(s.profile.tuned) ||
    any(s.profile.words) ||
    s.collection.removed.some((r) => r.owner === userId) ||
    s.profile.removed.some((r) => r.owner === userId)
  );
}
