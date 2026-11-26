/**
 * On-device persistence. Uses AsyncStorage — Expo's documented choice for small
 * app-state, works on iOS, Android and web with no native build.
 *
 * Step 7 changed the stored shape: every claimable record now carries a client id
 * (see claimable.ts). Builds before it stored `profile.v1` and `collection.v1` with
 * no ids. On first load the v1 data is given ids, written as v2, read back to make
 * sure it landed, and only then is v1 removed — all before anything else runs, so a
 * claim can never see ids that weren't persisted (ids that changed between launches
 * would make the server see the same star twice). If that write fails, the data is
 * still shown from memory but marked not durable, and the claim refuses to run.
 *
 * A device id is generated and stored at the same time.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  EMPTY_COLLECTION,
  migrateLegacyCollection,
  parseCollection,
  parseLegacyCollection,
  type Collection,
} from './collection';
import { newId } from './ids';
import {
  EMPTY_STORED_PROFILE,
  migrateLegacyProfile,
  parseProfile,
  parseStoredProfile,
  type StoredProfile,
} from './profile';
import { EMPTY_HISTORY, parseHistory, type SearchHistory } from './search-history';
import { getAvailableTranslations, getPassages } from './verseStore';

export const KEYS = {
  profileV1: 'profile.v1',
  profile: 'profile.v2',
  collectionV1: 'collection.v1',
  collection: 'collection.v2',
  searchHistory: 'searchHistory.v1',
  device: 'device.v1',
  account: 'account.v1',
} as const;

let durable = true;

/** False if a stored-shape migration could not be written; the claim refuses to run. */
export function isDurable(): boolean {
  return durable;
}

/** For tests: forget the module's state between cases. */
export function resetStorageStateForTests(): void {
  durable = true;
  devicePromise = null;
}

/** Write a migrated value, confirm it reads back, then drop the old key. */
async function persistMigration(newKey: string, value: string, oldKey: string): Promise<boolean> {
  try {
    await AsyncStorage.setItem(newKey, value);
    if ((await AsyncStorage.getItem(newKey)) !== value) throw new Error('read-back mismatch');
    await AsyncStorage.removeItem(oldKey);
    return true;
  } catch {
    durable = false;
    return false;
  }
}

const translationIds = () => getAvailableTranslations().map((t) => t.id);
const passageIds = () => getPassages().map((p) => p.id);

export async function loadProfile(): Promise<StoredProfile> {
  try {
    await loadDeviceId();
    const raw = await AsyncStorage.getItem(KEYS.profile);
    if (raw) {
      // A crash between writing v2 and removing v1 leaves both; v2 wins.
      await AsyncStorage.removeItem(KEYS.profileV1);
      return parseStoredProfile(raw, translationIds());
    }
    const old = await AsyncStorage.getItem(KEYS.profileV1);
    if (!old) return EMPTY_STORED_PROFILE;
    const migrated = migrateLegacyProfile(parseProfile(old, translationIds()), { now: Date.now(), newId });
    await persistMigration(KEYS.profile, JSON.stringify(migrated), KEYS.profileV1);
    return migrated;
  } catch {
    return EMPTY_STORED_PROFILE;
  }
}

export async function saveProfile(profile: StoredProfile): Promise<void> {
  await AsyncStorage.setItem(KEYS.profile, JSON.stringify(profile));
}

export async function loadCollection(): Promise<Collection> {
  try {
    await loadDeviceId();
    const raw = await AsyncStorage.getItem(KEYS.collection);
    if (raw) {
      await AsyncStorage.removeItem(KEYS.collectionV1);
      return parseCollection(raw, passageIds());
    }
    const old = parseLegacyCollection(await AsyncStorage.getItem(KEYS.collectionV1), passageIds());
    if (!old) return EMPTY_COLLECTION;
    const migrated = migrateLegacyCollection(old, { now: Date.now(), newId });
    await persistMigration(KEYS.collection, JSON.stringify(migrated), KEYS.collectionV1);
    return migrated;
  } catch {
    return EMPTY_COLLECTION;
  }
}

export async function saveCollection(collection: Collection): Promise<void> {
  await AsyncStorage.setItem(KEYS.collection, JSON.stringify(collection));
}

let devicePromise: Promise<string> | null = null;

/** This install's id, made once and kept. Concurrent first calls share one id. */
export function loadDeviceId(): Promise<string> {
  devicePromise ??= (async () => {
    const stored = await AsyncStorage.getItem(KEYS.device);
    if (stored) return stored;
    const id = newId();
    await AsyncStorage.setItem(KEYS.device, id);
    return id;
  })().catch((e) => {
    devicePromise = null;
    throw e;
  });
  return devicePromise;
}

/** The account signed in on this phone, kept so its data can be shown before the session loads. */
export interface StoredAccount {
  userId: string;
  email: string;
}

export async function loadAccount(): Promise<StoredAccount | null> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.account);
    if (!raw) return null;
    const o = JSON.parse(raw) as Record<string, unknown>;
    return typeof o.userId === 'string' && typeof o.email === 'string' ? { userId: o.userId, email: o.email } : null;
  } catch {
    return null;
  }
}

export async function saveAccount(account: StoredAccount | null): Promise<void> {
  if (account) await AsyncStorage.setItem(KEYS.account, JSON.stringify(account));
  else await AsyncStorage.removeItem(KEYS.account);
}

export async function loadSearchHistory(): Promise<SearchHistory> {
  try {
    const raw = await AsyncStorage.getItem(KEYS.searchHistory);
    return parseHistory(raw);
  } catch {
    return EMPTY_HISTORY;
  }
}

export async function saveSearchHistory(history: SearchHistory): Promise<void> {
  await AsyncStorage.setItem(KEYS.searchHistory, JSON.stringify(history));
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.searchHistory);
}
