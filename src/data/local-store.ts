/**
 * The phone's local data, held once for the whole app: the screens (through
 * use-profile and use-collection) and the claim (sync/claim) read and change the
 * same state. Every change is persisted in order; `update` resolves once its change
 * is on disk, which the claim relies on (an id stamp must land before a batch is sent).
 *
 * Who is signed in decides what the screens see: unowned records and that account's
 * own (see claimable.ts). The account is remembered locally so its data shows at
 * launch before the server session has loaded.
 */
import { useSyncExternalStore } from 'react';

import type { ChangeContext, Owner } from './claimable';
import { EMPTY_COLLECTION, type Collection } from './collection';
import { newId } from './ids';
import { EMPTY_STORED_PROFILE, type StoredProfile } from './profile';
import {
  loadAccount,
  loadCollection,
  loadDeviceId,
  loadProfile,
  saveAccount,
  saveCollection,
  saveProfile,
  type StoredAccount,
} from './storage';

export interface LocalData {
  collection: Collection;
  profile: StoredProfile;
}

interface State extends LocalData {
  account: StoredAccount | null;
  deviceId: string;
  ready: boolean;
}

let state: State = { collection: EMPTY_COLLECTION, profile: EMPTY_STORED_PROFILE, account: null, deviceId: '', ready: false };
const listeners = new Set<() => void>();
let loading: Promise<void> | null = null;
let chain: Promise<unknown> = Promise.resolve();

function set(next: State) {
  state = next;
  for (const l of listeners) l();
}

/** Load everything once (running the stored-shape migration first; see storage.ts). */
export function loadLocal(): Promise<void> {
  loading ??= (async () => {
    const [profile, collection, account, deviceId] = await Promise.all([
      loadProfile(),
      loadCollection(),
      loadAccount(),
      loadDeviceId().catch(() => ''),
    ]);
    set({ profile, collection, account, deviceId, ready: true });
  })();
  return loading;
}

export function getLocal(): State {
  return state;
}

export function subscribeLocal(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Who the screens show data for: the signed-in account, or no one. */
export function viewer(): Owner {
  return state.account?.userId ?? null;
}

export function changeContext(): ChangeContext {
  return { owner: viewer(), now: Date.now(), newId };
}

/** Apply a change now; resolves once it's persisted (rejects if the write failed). */
export function updateLocal(change: (s: LocalData) => LocalData): Promise<void> {
  const before = state;
  const next = change({ collection: state.collection, profile: state.profile });
  set({ ...state, ...next });
  const write = chain.then(async () => {
    if (next.collection !== before.collection) await saveCollection(state.collection);
    if (next.profile !== before.profile) await saveProfile(state.profile);
  });
  chain = write.catch(() => undefined);
  return write;
}

export function setAccount(account: StoredAccount | null): Promise<void> {
  set({ ...state, account });
  const write = chain.then(() => saveAccount(account));
  chain = write.catch(() => undefined);
  return write;
}

/** The claim's view of the store (see sync/claim). */
export const localStore = {
  read: (): LocalData => ({ collection: state.collection, profile: state.profile }),
  write: updateLocal,
};

export function useLocal(): State {
  return useSyncExternalStore(subscribeLocal, getLocal, getLocal);
}
