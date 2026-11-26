/**
 * The reader's local collection — what they've starred, saved, and written notes
 * on — plus the engagement tally that shapes the feed. Local-first: the phone is
 * always the read path, with or without an account (see storage.ts and sync/).
 *
 * Star vs. save: a star is a lightweight "this one struck me" marker on the
 * passage; a save keeps it in your collection to return to. Notes are your own
 * reflection, private by default. A note's `visibility` records your intent.
 *
 * Every star, save and note is a claimable record (see claimable.ts): it has a
 * client id from the moment it's made, and an owner once it belongs to an account.
 * A passage can carry more than one note — a second phone's note on the same
 * passage is its own note, never merged into this one.
 *
 * The engagement tally is NOT claimable. It stays on this phone and is never sent
 * to the server: what someone searches for is the most revealing thing the app holds.
 *
 * Helpers that change the collection take a ChangeContext and only touch records the
 * context's owner can see; helpers that read take a view (`viewFor`) and see
 * everything in it.
 */
import {
  created,
  edited,
  parseClaimable,
  parseRemovals,
  visibleTo,
  type ChangeContext,
  type Claimable,
  type Owner,
  type Removal,
} from './claimable';

export type NoteVisibility = 'private' | 'circle';

export interface Mark extends Claimable {
  passageId: string;
  /** Epoch ms. Two phones' stars on one passage keep the earlier. */
  createdAt: number;
}

export interface Note extends Claimable {
  passageId: string;
  /** The reflection text. Never empty: an emptied note is removed. */
  body: string;
  visibility: NoteVisibility;
  createdAt: number;
  /** Epoch ms of the last edit, for ordering and "when" labels. */
  updatedAt: number;
}

export interface Collection {
  stars: Mark[];
  saves: Mark[];
  notes: Note[];
  /** Theme tally from opening search results. Local only, never claimed, never shown. */
  engaged: Record<string, number>;
  /** Claimed records removed since, waiting to be removed on the server. */
  removed: Removal[];
}

export const EMPTY_COLLECTION: Collection = { stars: [], saves: [], notes: [], engaged: {}, removed: [] };

const VISIBILITIES: NoteVisibility[] = ['private', 'circle'];

// ---------------------------------------------------------------- views

/** What a viewer (signed-in user id, or null) sees: unowned records and their own. */
export function viewFor(c: Collection, viewer: Owner): Collection {
  return {
    stars: c.stars.filter((r) => visibleTo(r, viewer)),
    saves: c.saves.filter((r) => visibleTo(r, viewer)),
    notes: c.notes.filter((r) => visibleTo(r, viewer)),
    engaged: c.engaged,
    removed: c.removed.filter((r) => r.owner === viewer),
  };
}

export function isStarred(c: Collection, passageId: string): boolean {
  return c.stars.some((r) => r.passageId === passageId);
}

export function isSaved(c: Collection, passageId: string): boolean {
  return c.saves.some((r) => r.passageId === passageId);
}

/** The most recently edited note on a passage (the one the feed's note sheet edits). */
export function getNote(c: Collection, passageId: string): Note | undefined {
  let latest: Note | undefined;
  for (const n of c.notes) if (n.passageId === passageId && (!latest || n.updatedAt > latest.updatedAt)) latest = n;
  return latest;
}

export function getNoteById(c: Collection, clientId: string): Note | undefined {
  return c.notes.find((n) => n.clientId === clientId);
}

/** Every note, most recently edited first (for the Notes list). */
export function noteList(c: Collection): Note[] {
  return [...c.notes].sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Saved passage ids, most recent first (for the Saved list). */
export function savedIds(c: Collection): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of [...c.saves].sort((a, b) => b.createdAt - a.createdAt)) {
    if (seen.has(r.passageId)) continue;
    seen.add(r.passageId);
    out.push(r.passageId);
  }
  return out;
}

/** Engaged themes, most-engaged first (for shaping the feed; no count shown). */
export function engagedThemes(c: Pick<Collection, 'engaged'>): string[] {
  return Object.keys(c.engaged).sort((a, b) => c.engaged[b] - c.engaged[a]);
}

// ---------------------------------------------------------------- changes

/** Drop records, remembering the claimed ones so the server forgets them too. */
function drop<T extends Claimable & { passageId: string }>(
  c: Collection,
  list: T[],
  gone: (r: T) => boolean,
  kind: Removal['kind'],
): { kept: T[]; removed: Removal[] } {
  const removed = [...c.removed];
  const kept = list.filter((r) => {
    if (!gone(r)) return true;
    if (r.owner !== null) removed.push({ kind, clientId: r.clientId, owner: r.owner, passageId: r.passageId });
    return false;
  });
  return { kept, removed };
}

function toggleMark(c: Collection, key: 'stars' | 'saves', passageId: string, ctx: ChangeContext): Collection {
  const mine = (r: Mark) => r.passageId === passageId && visibleTo(r, ctx.owner);
  if (c[key].some(mine)) {
    const { kept, removed } = drop(c, c[key], mine, key === 'stars' ? 'star' : 'save');
    return { ...c, [key]: kept, removed };
  }
  const mark: Mark = { ...created(ctx), passageId, createdAt: ctx.now };
  return { ...c, [key]: [...c[key], mark] };
}

export function toggleStar(c: Collection, passageId: string, ctx: ChangeContext): Collection {
  return toggleMark(c, 'stars', passageId, ctx);
}

export function toggleSave(c: Collection, passageId: string, ctx: ChangeContext): Collection {
  return toggleMark(c, 'saves', passageId, ctx);
}

/**
 * Write the note on a passage: edits the most recent one the owner can see, or
 * starts one. An empty/whitespace body removes it, so the note sheet's "Save" on an
 * emptied field clears it rather than storing blank.
 */
export function setNote(
  c: Collection,
  passageId: string,
  body: string,
  visibility: NoteVisibility,
  ctx: ChangeContext,
): Collection {
  const existing = getNote(viewFor(c, ctx.owner), passageId);
  if (existing) return editNote(c, existing.clientId, body, visibility, ctx);
  if (body.trim().length === 0) return c;
  const note: Note = { ...created(ctx), passageId, body, visibility, createdAt: ctx.now, updatedAt: ctx.now };
  return { ...c, notes: [...c.notes, note] };
}

/** Edit one note by its id. An empty body removes it. */
export function editNote(
  c: Collection,
  clientId: string,
  body: string,
  visibility: NoteVisibility,
  ctx: ChangeContext,
): Collection {
  const target = c.notes.find((n) => n.clientId === clientId && visibleTo(n, ctx.owner));
  if (!target) return c;
  if (body.trim().length === 0) {
    const { kept, removed } = drop(c, c.notes, (n) => n.clientId === clientId, 'note');
    return { ...c, notes: kept, removed };
  }
  if (target.body === body && target.visibility === visibility) return c;
  return {
    ...c,
    notes: c.notes.map((n) => (n === target ? { ...edited(n), body, visibility, updatedAt: ctx.now } : n)),
  };
}

/**
 * Record that the reader engaged with these themes (opening a search result).
 * Adds to the running tally; de-duplicates the themes within a single call so one
 * passage counts a theme once. An empty list is a no-op.
 */
export function recordEngagement(c: Collection, themes: string[]): Collection {
  const unique = [...new Set(themes)];
  if (unique.length === 0) return c;
  const engaged = { ...c.engaged };
  for (const t of unique) engaged[t] = (engaged[t] ?? 0) + 1;
  return { ...c, engaged };
}

// ---------------------------------------------------------------- storage

function parseEngaged(v: unknown): Record<string, number> {
  const engaged: Record<string, number> = {};
  if (typeof v === 'object' && v !== null) {
    for (const [theme, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) engaged[theme] = n;
    }
  }
  return engaged;
}

function parseJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const data: unknown = JSON.parse(raw);
    return typeof data === 'object' && data !== null && !Array.isArray(data) ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Parse a stored collection (collection.v2) defensively: drop anything malformed or
 * without a usable client id, and — when the valid passage ids are known — forget
 * passages that no longer exist in the verse store.
 */
export function parseCollection(raw: string | null, validIds?: string[]): Collection {
  const o = parseJson(raw);
  if (!o) return EMPTY_COLLECTION;
  const valid = validIds ? new Set(validIds) : null;
  const keep = (id: unknown): id is string => typeof id === 'string' && (valid ? valid.has(id) : true);
  const seen = new Set<string>();

  const marks = (v: unknown): Mark[] => {
    if (!Array.isArray(v)) return [];
    const out: Mark[] = [];
    for (const x of v) {
      if (typeof x !== 'object' || x === null) continue;
      const r = x as Record<string, unknown>;
      const claim = parseClaimable(r);
      if (!claim || seen.has(claim.clientId) || !keep(r.passageId)) continue;
      seen.add(claim.clientId);
      out.push({ ...claim, passageId: r.passageId, createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0 });
    }
    return out;
  };

  const notes: Note[] = [];
  if (Array.isArray(o.notes)) {
    for (const x of o.notes) {
      if (typeof x !== 'object' || x === null) continue;
      const r = x as Record<string, unknown>;
      const claim = parseClaimable(r);
      const body = typeof r.body === 'string' ? r.body : '';
      if (!claim || seen.has(claim.clientId) || !keep(r.passageId) || body.trim().length === 0) continue;
      seen.add(claim.clientId);
      const updatedAt = typeof r.updatedAt === 'number' ? r.updatedAt : 0;
      notes.push({
        ...claim,
        passageId: r.passageId,
        body,
        visibility: VISIBILITIES.includes(r.visibility as NoteVisibility) ? (r.visibility as NoteVisibility) : 'private',
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : updatedAt,
        updatedAt,
      });
    }
  }

  return {
    stars: marks(o.stars),
    saves: marks(o.saves),
    notes,
    engaged: parseEngaged(o.engaged),
    removed: parseRemovals(o.removed),
  };
}

/**
 * The collection as builds before step 7 stored it (collection.v1): passage ids for
 * stars and saves, most recent last, and one note per passage, none with an id.
 */
export interface LegacyCollection {
  starred: string[];
  saved: string[];
  notes: Record<string, { body: string; visibility: NoteVisibility; updatedAt: number }>;
  engaged: Record<string, number>;
}

export function parseLegacyCollection(raw: string | null, validIds?: string[]): LegacyCollection | null {
  const o = parseJson(raw);
  if (!o) return null;
  const valid = validIds ? new Set(validIds) : null;
  const keep = (id: string) => (valid ? valid.has(id) : true);
  const ids = (v: unknown): string[] => {
    const seen = new Set<string>();
    if (!Array.isArray(v)) return [];
    return v.filter((x): x is string => {
      if (typeof x !== 'string' || seen.has(x) || !keep(x)) return false;
      seen.add(x);
      return true;
    });
  };
  const notes: LegacyCollection['notes'] = {};
  if (typeof o.notes === 'object' && o.notes !== null) {
    for (const [id, n] of Object.entries(o.notes as Record<string, unknown>)) {
      if (!keep(id) || typeof n !== 'object' || n === null) continue;
      const note = n as Record<string, unknown>;
      const body = typeof note.body === 'string' ? note.body : '';
      if (body.trim().length === 0) continue;
      notes[id] = {
        body,
        visibility: VISIBILITIES.includes(note.visibility as NoteVisibility) ? (note.visibility as NoteVisibility) : 'private',
        updatedAt: typeof note.updatedAt === 'number' ? note.updatedAt : 0,
      };
    }
  }
  return { starred: ids(o.starred), saved: ids(o.saved), notes, engaged: parseEngaged(o.engaged) };
}

/**
 * Give every record of a pre-step-7 collection a client id. Nothing is dropped.
 * Stars and saves had no time; they get `now`, stepped back by one millisecond per
 * place so their order (most recent last) survives. Records made before accounts
 * existed belong to no one yet.
 */
export function migrateLegacyCollection(old: LegacyCollection, ctx: Omit<ChangeContext, 'owner'>): Collection {
  const ctxNoOwner: ChangeContext = { ...ctx, owner: null };
  const marks = (ids: string[]): Mark[] =>
    ids.map((passageId, i) => ({ ...created(ctxNoOwner), passageId, createdAt: ctx.now - (ids.length - 1 - i) }));
  const notes: Note[] = Object.entries(old.notes).map(([passageId, n]) => ({
    ...created(ctxNoOwner),
    passageId,
    body: n.body,
    visibility: n.visibility,
    createdAt: n.updatedAt || ctx.now,
    updatedAt: n.updatedAt,
  }));
  return { stars: marks(old.starred), saves: marks(old.saved), notes, engaged: old.engaged, removed: [] };
}
