/**
 * The reader's local collection — what they've starred, saved, and written
 * notes on. Like the profile, this lives only in on-device storage (see
 * storage.ts): no account, no network. Pure helpers here are unit-tested; the
 * React/storage wiring lives elsewhere.
 *
 * Star vs. save: a star is a lightweight "this one struck me" marker on the
 * passage; a save keeps it in your collection to return to. Notes are your own
 * reflection, private by default. A note's `visibility` records your intent —
 * actually sharing with a circle needs accounts, which arrive in a later step.
 */

export type NoteVisibility = 'private' | 'circle';

export interface PassageNote {
  /** The reflection text. An empty body means the note is removed. */
  body: string;
  /** Who the reader means this for. Sharing isn't wired yet; this records intent. */
  visibility: NoteVisibility;
  /** Epoch ms of the last edit, for ordering and "when" labels. */
  updatedAt: number;
}

export interface Collection {
  /** Passage ids the reader has starred, most recent last. */
  starred: string[];
  /** Passage ids the reader has saved, most recent last. */
  saved: string[];
  /** Notes keyed by passage id. */
  notes: Record<string, PassageNote>;
}

export const EMPTY_COLLECTION: Collection = { starred: [], saved: [], notes: {} };

const VISIBILITIES: NoteVisibility[] = ['private', 'circle'];

/**
 * Parse a stored collection defensively: tolerate a blob written by an older
 * build (missing keys), drop anything malformed, and — when the set of valid
 * passage ids is known — forget ids that no longer exist in the verse store.
 */
export function parseCollection(raw: string | null, validIds?: string[]): Collection {
  if (!raw) return EMPTY_COLLECTION;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_COLLECTION;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_COLLECTION;
  const o = data as Record<string, unknown>;

  const valid = validIds ? new Set(validIds) : null;
  const keep = (id: string) => (valid ? valid.has(id) : true);

  const ids = (v: unknown): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    if (!Array.isArray(v)) return out;
    for (const x of v) {
      if (typeof x !== 'string' || seen.has(x) || !keep(x)) continue;
      seen.add(x);
      out.push(x);
    }
    return out;
  };

  const notes: Record<string, PassageNote> = {};
  if (typeof o.notes === 'object' && o.notes !== null) {
    for (const [id, n] of Object.entries(o.notes as Record<string, unknown>)) {
      if (!keep(id) || typeof n !== 'object' || n === null) continue;
      const note = n as Record<string, unknown>;
      const body = typeof note.body === 'string' ? note.body : '';
      if (body.trim().length === 0) continue;
      notes[id] = {
        body,
        visibility: VISIBILITIES.includes(note.visibility as NoteVisibility)
          ? (note.visibility as NoteVisibility)
          : 'private',
        updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : 0,
      };
    }
  }

  return { starred: ids(o.starred), saved: ids(o.saved), notes };
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function toggleStar(c: Collection, id: string): Collection {
  return { ...c, starred: toggle(c.starred, id) };
}

export function toggleSave(c: Collection, id: string): Collection {
  return { ...c, saved: toggle(c.saved, id) };
}

export function isStarred(c: Collection, id: string): boolean {
  return c.starred.includes(id);
}

export function isSaved(c: Collection, id: string): boolean {
  return c.saved.includes(id);
}

export function getNote(c: Collection, id: string): PassageNote | undefined {
  return c.notes[id];
}

/**
 * Write (or update) a note. An empty/whitespace body removes the note, so the
 * note sheet's "Save" on an emptied field clears it rather than storing blank.
 */
export function setNote(
  c: Collection,
  id: string,
  body: string,
  visibility: NoteVisibility,
  now: number = Date.now(),
): Collection {
  if (body.trim().length === 0) return removeNote(c, id);
  return { ...c, notes: { ...c.notes, [id]: { body, visibility, updatedAt: now } } };
}

export function removeNote(c: Collection, id: string): Collection {
  if (!(id in c.notes)) return c;
  const notes = { ...c.notes };
  delete notes[id];
  return { ...c, notes };
}

/** Saved passage ids, most recent first (for the Saved list). */
export function savedIds(c: Collection): string[] {
  return [...c.saved].reverse();
}

/** Noted passage ids, most recently edited first (for the Notes list). */
export function notedIds(c: Collection): string[] {
  return Object.keys(c.notes).sort((a, b) => c.notes[b].updatedAt - c.notes[a].updatedAt);
}
