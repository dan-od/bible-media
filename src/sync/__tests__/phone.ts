/**
 * A phone for the claim tests: local state that persists through `write`, and can be
 * killed — `killAfterWrites` makes a write throw, losing what wasn't persisted, as
 * when the app is closed between the server applying a batch and the phone recording
 * it. `restart()` reloads what was persisted.
 */
import type { ChangeContext, Owner } from '@/data/claimable';
import {
  EMPTY_COLLECTION,
  recordEngagement,
  setNote,
  toggleSave,
  toggleStar,
  viewFor,
  type NoteVisibility,
} from '@/data/collection';
import { applyProfilePatch, EMPTY_STORED_PROFILE, profileView } from '@/data/profile';
import type { LocalState, LocalStore } from '@/sync/claim';

let seq = 0;
// A fresh prefix per run: a real database remembers every id it accepted (claim_ledger),
// so ids reused by a later run would belong to an earlier run's account.
const RUN = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, '0');
/** Valid, unique UUIDs, so ids from different phones (and runs) never collide by accident. */
export function testId(): string {
  seq++;
  const hex = seq.toString(16).padStart(12, '0');
  return `${RUN}-0000-4000-8000-${hex}`;
}

export class Phone implements LocalStore {
  state: LocalState = { collection: EMPTY_COLLECTION, profile: EMPTY_STORED_PROFILE };
  persisted: LocalState = this.state;
  writes = 0;
  killAfterWrites = Infinity;
  /** Who is signed in on this phone (null: no one). */
  viewer: Owner = null;
  clock = Date.parse('2026-10-01T00:00:00Z');

  read(): LocalState {
    return this.state;
  }

  async write(change: (s: LocalState) => LocalState): Promise<void> {
    if (this.writes >= this.killAfterWrites) throw new Error('app killed');
    this.writes++;
    this.state = change(this.state);
    this.persisted = this.state;
  }

  restart(): void {
    this.state = this.persisted;
    this.killAfterWrites = Infinity;
  }

  ctx(): ChangeContext {
    this.clock += 60_000;
    return { owner: this.viewer, now: this.clock, newId: testId };
  }

  // What the reader does in the app, through the same helpers the app uses.
  star(passageId: string) {
    this.local((s) => ({ ...s, collection: toggleStar(s.collection, passageId, this.ctx()) }));
  }
  save(passageId: string) {
    this.local((s) => ({ ...s, collection: toggleSave(s.collection, passageId, this.ctx()) }));
  }
  note(passageId: string, body: string, visibility: NoteVisibility = 'private') {
    this.local((s) => ({ ...s, collection: setNote(s.collection, passageId, body, visibility, this.ctx()) }));
  }
  /** Opening a search result: the tally of themes engaged with (never claimed). */
  engage(themes: string[]) {
    this.local((s) => ({ ...s, collection: recordEngagement(s.collection, themes) }));
  }
  heart(situations: string[], freeText: string, tunedThemes: string[] = []) {
    this.local((s) => ({ ...s, profile: applyProfilePatch(s.profile, { situations, freeText, tunedThemes }, this.ctx()) }));
  }

  /** What the reader sees on this phone. */
  view() {
    return { collection: viewFor(this.state.collection, this.viewer), profile: profileView(this.state.profile, this.viewer) };
  }

  /** Every record on the phone, visible or not. */
  allRecords() {
    const { collection: c, profile: p } = this.state;
    return [...c.stars, ...c.saves, ...c.notes, ...p.situations, ...p.tuned, ...p.words];
  }

  private local(change: (s: LocalState) => LocalState) {
    this.state = change(this.state);
    this.persisted = this.state;
  }
}
