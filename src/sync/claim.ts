/**
 * The claim: making this phone's local data an account's data, exactly once.
 *
 * 1. `adopt` stamps every record that belongs to no one with the account's id, and is
 *    persisted before anything is sent. From then on those records are this account's
 *    alone: never shown to, or claimed by, anyone else who signs in on this phone.
 * 2. `runClaim` sends the account's pending records in batches. The server upserts on
 *    each record's client id (claim_records), so a batch sent twice — after the app was
 *    killed, a response was lost, or the phone was offline — writes the same rows. A
 *    record is marked claimed only after the server confirms its batch, and only at the
 *    version that was sent: an edit made while the batch was in flight stays pending.
 * 3. Nothing local is ever deleted by claiming. The phone stays the read path.
 *
 * Search history and the engagement tally are never in a batch.
 */
import type { Claimable, Removal } from '@/data/claimable';
import type { Collection, Mark, Note } from '@/data/collection';
import type { LabelRecord, StoredProfile, WordsRecord } from '@/data/profile';
import { getPassageById } from '@/data/verseStore';

export interface PassageKey {
  book: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
}

export type ClaimKind = 'star' | 'save' | 'note' | 'situation' | 'words' | 'tuned';

/** One record as claim_records takes it. */
export interface ClaimRecord {
  kind: ClaimKind;
  op?: 'delete';
  client_id: string;
  created_at?: string;
  updated_at?: string;
  passage?: PassageKey;
  body?: string;
  visibility?: 'private' | 'circle';
  label?: string;
  own_words?: string;
}

export interface ClaimResult {
  accepted: string[];
  rejected: { client_id: string; reason: 'other_account' | 'invalid'; detail?: string }[];
}

export interface ClaimServer {
  /** Throws when the server can't be reached; nothing is marked then. */
  claim(batch: ClaimRecord[], deviceId: string): Promise<ClaimResult>;
}

export interface LocalState {
  collection: Collection;
  profile: StoredProfile;
}

export interface LocalStore {
  read(): LocalState;
  /** Applies a change and resolves once it is persisted. */
  write(change: (s: LocalState) => LocalState): Promise<void>;
}

const iso = (ms: number) => new Date(ms).toISOString();

export function passageKey(passageId: string): PassageKey | null {
  const p = getPassageById(passageId);
  return p ? { book: p.book, chapter: p.chapter, verse_start: p.verseStart, verse_end: p.verseEnd } : null;
}

/** Stamp every unowned record with the account. Persist this before sending anything. */
export function adopt(s: LocalState, userId: string): LocalState {
  const own = <T extends Claimable>(list: T[]) => list.map((r) => (r.owner === null ? { ...r, owner: userId } : r));
  return {
    collection: {
      ...s.collection,
      stars: own(s.collection.stars),
      saves: own(s.collection.saves),
      notes: own(s.collection.notes),
    },
    profile: {
      ...s.profile,
      situations: own(s.profile.situations),
      tuned: own(s.profile.tuned),
      words: own(s.profile.words),
    },
  };
}

/** Whether anything on this phone belongs to no account yet (what the consent line is for). */
export function hasUnclaimed(s: LocalState): boolean {
  const any = (list: Claimable[]) => list.some((r) => r.owner === null);
  return (
    any(s.collection.stars) ||
    any(s.collection.saves) ||
    any(s.collection.notes) ||
    any(s.profile.situations) ||
    any(s.profile.tuned) ||
    any(s.profile.words)
  );
}

interface Pending {
  record: ClaimRecord;
  /** The version sent; 0 for a removal. */
  rev: number;
}

const pendingRecord = (r: Claimable, userId: string) =>
  r.owner === userId && !r.rejected && r.syncedRev < r.rev;

/** Everything this account still has to send, in a stable order. */
export function pendingFor(s: LocalState, userId: string): Pending[] {
  const out: Pending[] = [];
  const marks = (list: Mark[], kind: 'star' | 'save') => {
    for (const r of list) {
      if (!pendingRecord(r, userId)) continue;
      const passage = passageKey(r.passageId);
      if (passage) out.push({ rev: r.rev, record: { kind, client_id: r.clientId, created_at: iso(r.createdAt), passage } });
    }
  };
  marks(s.collection.stars, 'star');
  marks(s.collection.saves, 'save');
  for (const n of s.collection.notes as Note[]) {
    if (!pendingRecord(n, userId)) continue;
    const passage = passageKey(n.passageId);
    if (!passage) continue;
    out.push({
      rev: n.rev,
      record: {
        kind: 'note',
        client_id: n.clientId,
        created_at: iso(n.createdAt),
        updated_at: iso(n.updatedAt || n.createdAt),
        passage,
        body: n.body,
        visibility: n.visibility,
      },
    });
  }
  const labels = (list: LabelRecord[], kind: 'situation' | 'tuned') => {
    for (const r of list) {
      if (pendingRecord(r, userId)) {
        out.push({ rev: r.rev, record: { kind, client_id: r.clientId, created_at: iso(r.createdAt), label: r.label } });
      }
    }
  };
  labels(s.profile.situations, 'situation');
  labels(s.profile.tuned, 'tuned');
  for (const w of s.profile.words as WordsRecord[]) {
    if (pendingRecord(w, userId)) {
      out.push({ rev: w.rev, record: { kind: 'words', client_id: w.clientId, created_at: iso(w.createdAt), own_words: w.text } });
    }
  }
  const removals = (list: Removal[]) => {
    for (const r of list) {
      if (r.owner !== userId) continue;
      const record: ClaimRecord = { kind: r.kind, op: 'delete', client_id: r.clientId };
      if (r.passageId) {
        const passage = passageKey(r.passageId);
        if (!passage) continue;
        record.passage = passage;
      }
      if (r.label) record.label = r.label;
      out.push({ rev: 0, record });
    }
  };
  removals(s.collection.removed);
  removals(s.profile.removed);
  return out;
}

/** Mark what the server accepted (at the version sent) or refused. */
export function applyResult(s: LocalState, sent: Pending[], result: ClaimResult): LocalState {
  const accepted = new Set(result.accepted);
  const refused = new Map(result.rejected.map((r) => [r.client_id, r.reason]));
  const revSent = new Map(sent.filter((p) => p.record.op !== 'delete').map((p) => [p.record.client_id, p.rev]));
  const deletesDone = new Set(sent.filter((p) => p.record.op === 'delete' && accepted.has(p.record.client_id)).map((p) => p.record.client_id));
  // A refused removal is dropped too: the server has nothing of this account's to remove.
  const deletesRefused = new Set(sent.filter((p) => p.record.op === 'delete' && refused.has(p.record.client_id)).map((p) => p.record.client_id));

  const mark = <T extends Claimable>(list: T[]): T[] =>
    list.map((r) => {
      const rev = revSent.get(r.clientId);
      if (rev === undefined) return r;
      if (accepted.has(r.clientId)) return { ...r, syncedRev: Math.max(r.syncedRev, rev) };
      const reason = refused.get(r.clientId);
      return reason ? { ...r, rejected: reason } : r;
    });
  const keepRemoval = (r: Removal) => !deletesDone.has(r.clientId) && !deletesRefused.has(r.clientId);

  return {
    collection: {
      ...s.collection,
      stars: mark(s.collection.stars),
      saves: mark(s.collection.saves),
      notes: mark(s.collection.notes),
      removed: s.collection.removed.filter(keepRemoval),
    },
    profile: {
      ...s.profile,
      situations: mark(s.profile.situations),
      tuned: mark(s.profile.tuned),
      words: mark(s.profile.words),
      removed: s.profile.removed.filter(keepRemoval),
    },
  };
}

export type ClaimOutcome =
  | { status: 'done'; rejected: number }
  | { status: 'offline'; remaining: number }
  | { status: 'not_durable' };

/**
 * Send this account's pending records until none are left, or the server can't be
 * reached (then they stay queued for the next run). Safe to run again at any time,
 * including concurrently with edits.
 */
export async function runClaim(opts: {
  store: LocalStore;
  server: ClaimServer;
  userId: string;
  deviceId: string;
  durable?: boolean;
  batchSize?: number;
}): Promise<ClaimOutcome> {
  const { store, server, userId, deviceId } = opts;
  if (opts.durable === false) return { status: 'not_durable' };
  const size = Math.min(opts.batchSize ?? 50, 100);
  let rejected = 0;
  // Each batch makes progress (accepted or refused), so this ends; the cap is a backstop.
  for (let round = 0; round < 1000; round++) {
    const pending = pendingFor(store.read(), userId);
    if (pending.length === 0) return { status: 'done', rejected };
    const batch = pending.slice(0, size);
    let result: ClaimResult;
    try {
      result = await server.claim(
        batch.map((p) => p.record),
        deviceId,
      );
    } catch {
      return { status: 'offline', remaining: pending.length };
    }
    rejected += result.rejected.length;
    await store.write((s) => applyResult(s, batch, result));
    // A response that settles nothing would send the same batch forever.
    if (result.accepted.length + result.rejected.length === 0) {
      return { status: 'offline', remaining: pending.length };
    }
  }
  return { status: 'offline', remaining: pendingFor(store.read(), userId).length };
}
