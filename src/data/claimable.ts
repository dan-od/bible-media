/**
 * What every claimable local record carries, so it can become an account's data
 * exactly once (see sync/claim and the claim_records migration).
 *
 * - `clientId`: a UUID made on this phone the moment the record was created. The
 *   server upserts on it, so sending a record twice can never make two rows.
 * - `owner`: null for a record made with no one signed in; the account's user id once
 *   it belongs to an account (stamped when the person agrees to copy their data, or at
 *   creation while signed in). A record owned by one account is never shown to, or
 *   claimed by, another.
 * - `rev` / `syncedRev`: every edit bumps `rev`; `syncedRev` is the last version the
 *   server confirmed. A record is pending until the server has its current version.
 * - `rejected`: the server refused it (another account owns the id, or it was
 *   invalid). It stays on the phone and is never offered again.
 */

/** A user id, or null for data that belongs to no account yet. */
export type Owner = string | null;

export interface Claimable {
  clientId: string;
  owner: Owner;
  rev: number;
  syncedRev: number;
  rejected?: 'other_account' | 'invalid';
}

/** Who is making a change, when, and how ids are made. */
export interface ChangeContext {
  owner: Owner;
  now: number;
  newId: () => string;
}

/** A claimed record that was later removed, waiting to be removed on the server. */
export interface Removal {
  kind: 'star' | 'save' | 'note' | 'situation' | 'tuned' | 'words';
  clientId: string;
  owner: string;
  /** Stars and saves are one per passage on the server, so they're removed by passage. */
  passageId?: string;
  /** Situations and tuned themes are one per theme. */
  label?: string;
}

export function created(ctx: ChangeContext): Claimable {
  return { clientId: ctx.newId(), owner: ctx.owner, rev: 1, syncedRev: 0 };
}

/** Whether a viewer (a signed-in user id, or null) may see a record. */
export function visibleTo(r: { owner: Owner }, viewer: Owner): boolean {
  return r.owner === null || r.owner === viewer;
}

/** The server has this record's current version. */
export function isSynced(r: Claimable): boolean {
  return r.owner !== null && r.syncedRev >= r.rev;
}

/** Bump the version of an edited record. */
export function edited<T extends Claimable>(r: T): T {
  return { ...r, rev: r.rev + 1 };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parse the claim fields of a stored record, or null if they're unusable. */
export function parseClaimable(o: Record<string, unknown>): Claimable | null {
  if (typeof o.clientId !== 'string' || !UUID.test(o.clientId)) return null;
  const owner = typeof o.owner === 'string' && o.owner ? o.owner : null;
  const rev = typeof o.rev === 'number' && o.rev >= 1 ? Math.floor(o.rev) : 1;
  const syncedRev = typeof o.syncedRev === 'number' && o.syncedRev >= 0 ? Math.floor(o.syncedRev) : 0;
  const out: Claimable = { clientId: o.clientId, owner, rev, syncedRev };
  if (o.rejected === 'other_account' || o.rejected === 'invalid') out.rejected = o.rejected;
  return out;
}

export function parseRemovals(v: unknown): Removal[] {
  if (!Array.isArray(v)) return [];
  const kinds: Removal['kind'][] = ['star', 'save', 'note', 'situation', 'tuned', 'words'];
  const out: Removal[] = [];
  for (const x of v) {
    if (typeof x !== 'object' || x === null) continue;
    const o = x as Record<string, unknown>;
    if (!kinds.includes(o.kind as Removal['kind'])) continue;
    if (typeof o.clientId !== 'string' || !UUID.test(o.clientId)) continue;
    if (typeof o.owner !== 'string' || !o.owner) continue;
    const r: Removal = { kind: o.kind as Removal['kind'], clientId: o.clientId, owner: o.owner };
    if (typeof o.passageId === 'string') r.passageId = o.passageId;
    if (typeof o.label === 'string') r.label = o.label;
    out.push(r);
  }
  return out;
}
