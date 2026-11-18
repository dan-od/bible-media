import AsyncStorage from '@react-native-async-storage/async-storage';

import { EMPTY_COLLECTION, type Collection } from '@/data/collection';
import { DEFAULT_PROFILE, type Profile } from '@/data/profile';
import {
  clearCollection,
  clearProfile,
  loadCollection,
  loadProfile,
  saveCollection,
  saveProfile,
} from '@/data/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('profile storage', () => {
  it('returns the default profile when nothing is stored', async () => {
    expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
  });

  it('round-trips a saved profile', async () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      onboarded: true,
      situations: ['New job', 'Courage'],
      level: 'starting',
      translationId: 'BSB',
      tunedThemes: ['Grief'],
      morningVerse: true,
    };
    await saveProfile(profile);
    expect(await loadProfile()).toEqual(profile);
  });

  it('clears a stored profile back to defaults', async () => {
    await saveProfile({ ...DEFAULT_PROFILE, onboarded: true });
    await clearProfile();
    expect(await loadProfile()).toEqual(DEFAULT_PROFILE);
  });
});

describe('collection storage', () => {
  it('returns an empty collection when nothing is stored', async () => {
    expect(await loadCollection()).toEqual(EMPTY_COLLECTION);
  });

  it('round-trips a saved collection (keeping only real passage ids)', async () => {
    const collection: Collection = {
      starred: ['psalm-31-24'],
      saved: ['joshua-1-9'],
      notes: { 'john-15-5': { body: 'Apart from Him, nothing.', visibility: 'private', updatedAt: 42 } },
      engaged: { Worry: 2, Hope: 1 },
    };
    await saveCollection(collection);
    expect(await loadCollection()).toEqual(collection);
  });

  it('clears a stored collection back to empty', async () => {
    await saveCollection({ ...EMPTY_COLLECTION, saved: ['psalm-31-24'] });
    await clearCollection();
    expect(await loadCollection()).toEqual(EMPTY_COLLECTION);
  });
});
