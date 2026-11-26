import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseLegacyCollection } from '@/data/collection';
import { parseProfile, profileView } from '@/data/profile';
import {
  isDurable,
  KEYS,
  loadAccount,
  loadCollection,
  loadDeviceId,
  loadProfile,
  loadSearchHistory,
  resetStorageStateForTests,
  saveAccount,
  saveCollection,
  saveProfile,
} from '@/data/storage';
import { getAvailableTranslations, getPassages } from '@/data/verseStore';

import iphone17 from './captured/ios-iphone-17.json';
import iphone17e from './captured/ios-iphone-17e.json';
import web from './captured/web.json';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Stores captured from the app as it shipped before step 7 (an iPhone 17e and an
// iPhone 17 simulator install, and a web install used through the UI), as
// AsyncStorage held them: key -> JSON string.
const CAPTURED: [string, Record<string, string>][] = [
  ['iPhone 17e', iphone17e],
  ['iPhone 17', iphone17],
  ['web', web],
];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function install(store: Record<string, string>) {
  await AsyncStorage.clear();
  for (const [k, v] of Object.entries(store)) await AsyncStorage.setItem(k, v);
}

beforeEach(async () => {
  await AsyncStorage.clear();
  resetStorageStateForTests();
});

describe.each(CAPTURED)('first launch after updating, from a store captured on %s', (_name, store) => {
  const legacyCollection = parseLegacyCollection(store['collection.v1'], getPassages().map((p) => p.id))!;
  const legacyProfile = parseProfile(store['profile.v1'], getAvailableTranslations().map((t) => t.id));

  beforeEach(() => install(store));

  it('gives every record a client id and loses nothing', async () => {
    const collection = await loadCollection();
    const profile = await loadProfile();
    expect(collection.stars.map((r) => r.passageId)).toEqual(legacyCollection.starred);
    expect(collection.saves.map((r) => r.passageId)).toEqual(legacyCollection.saved);
    expect(Object.fromEntries(collection.notes.map((n) => [n.passageId, { body: n.body, visibility: n.visibility, updatedAt: n.updatedAt }]))).toEqual(
      legacyCollection.notes,
    );
    expect(collection.engaged).toEqual(legacyCollection.engaged);
    const view = profileView(profile, null);
    expect({ ...view, moreWords: undefined }).toEqual({ ...legacyProfile, moreWords: undefined });
    const records = [...collection.stars, ...collection.saves, ...collection.notes, ...profile.situations, ...profile.tuned, ...profile.words];
    expect(records.length).toBe(
      legacyCollection.starred.length + legacyCollection.saved.length + Object.keys(legacyCollection.notes).length +
        legacyProfile.situations.length + legacyProfile.tunedThemes.length + (legacyProfile.freeText.trim() ? 1 : 0),
    );
    for (const r of records) {
      expect(r.clientId).toMatch(UUID);
      expect(r.owner).toBeNull();
    }
    expect(new Set(records.map((r) => r.clientId)).size).toBe(records.length);
  });

  it('persists the ids before returning, so the next launch sees the same ids', async () => {
    const first = [await loadCollection(), await loadProfile()];
    expect(await AsyncStorage.getItem(KEYS.collection)).toBe(JSON.stringify(first[0]));
    expect(await AsyncStorage.getItem(KEYS.profile)).toBe(JSON.stringify(first[1]));
    resetStorageStateForTests();
    expect([await loadCollection(), await loadProfile()]).toEqual(first);
    expect(isDurable()).toBe(true);
  });

  it('removes the old keys once the new ones are confirmed, and leaves search history alone', async () => {
    await loadCollection();
    await loadProfile();
    expect(await AsyncStorage.getItem(KEYS.collectionV1)).toBeNull();
    expect(await AsyncStorage.getItem(KEYS.profileV1)).toBeNull();
    expect(await AsyncStorage.getItem(KEYS.searchHistory)).toBe(store['searchHistory.v1']);
    expect((await loadSearchHistory()).entries).toEqual(JSON.parse(store['searchHistory.v1']).entries);
  });

  it('generates and stores one device id, even when both stores load at once', async () => {
    const [, , a, b] = await Promise.all([loadCollection(), loadProfile(), loadDeviceId(), loadDeviceId()]);
    expect(a).toMatch(UUID);
    expect(b).toBe(a);
    expect(await AsyncStorage.getItem(KEYS.device)).toBe(a);
    resetStorageStateForTests();
    expect(await loadDeviceId()).toBe(a);
  });
});

describe('when the migrated store cannot be written', () => {
  it('keeps the old data, still shows it, and marks storage not durable so the claim refuses', async () => {
    await install(web);
    const setItem = AsyncStorage.setItem as jest.Mock;
    const real = setItem.getMockImplementation()!;
    setItem.mockImplementation(async (key: string, value: string) => {
      if (key === KEYS.collection) throw new Error('disk full');
      return real(key, value);
    });
    try {
      const collection = await loadCollection();
      expect(collection.stars).toHaveLength(2);
      expect(isDurable()).toBe(false);
      expect(await AsyncStorage.getItem(KEYS.collectionV1)).toBe(web['collection.v1']);
    } finally {
      setItem.mockImplementation(real);
    }
  });
});

describe('a store with both shapes (killed between writing v2 and removing v1)', () => {
  it('trusts v2 and removes v1', async () => {
    await install(web);
    const migrated = await loadCollection();
    await AsyncStorage.setItem(KEYS.collectionV1, web['collection.v1']);
    resetStorageStateForTests();
    expect(await loadCollection()).toEqual(migrated);
    expect(await AsyncStorage.getItem(KEYS.collectionV1)).toBeNull();
  });
});

describe('round trips', () => {
  it('saves and loads the collection and profile', async () => {
    await install(web);
    const c = await loadCollection();
    const p = await loadProfile();
    await saveCollection({ ...c, engaged: { Hope: 1 } });
    await saveProfile({ ...p, settings: { ...p.settings, level: 'seasoned' } });
    resetStorageStateForTests();
    expect((await loadCollection()).engaged).toEqual({ Hope: 1 });
    expect((await loadProfile()).settings.level).toBe('seasoned');
  });

  it('nothing stored is an empty first launch, and writes nothing', async () => {
    const c = await loadCollection();
    expect(c.stars).toEqual([]);
    expect(await AsyncStorage.getItem(KEYS.collection)).toBeNull();
  });

  it('remembers and forgets the signed-in account', async () => {
    expect(await loadAccount()).toBeNull();
    await saveAccount({ userId: 'u', email: 'e@example.com' });
    expect(await loadAccount()).toEqual({ userId: 'u', email: 'e@example.com' });
    await saveAccount(null);
    expect(await loadAccount()).toBeNull();
  });
});
