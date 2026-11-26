import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearHistory,
  getLocal,
  loadLocal,
  localStore,
  resetLocalForTests,
  subscribeLocal,
  updateHistory,
} from '@/data/local-store';
import { recordSearch } from '@/data/search-history';
import { KEYS, resetStorageStateForTests } from '@/data/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// Search history lives in the shared store so sign-out can clear it on a Search
// screen that's already open (see local-store.ts).

beforeEach(async () => {
  await AsyncStorage.clear();
  resetStorageStateForTests();
  resetLocalForTests();
});

it('loads the stored history with everything else', async () => {
  await AsyncStorage.setItem(KEYS.searchHistory, JSON.stringify({ entries: ['grief', 'psalm 34'] }));
  await loadLocal();
  expect(getLocal().history.entries).toEqual(['grief', 'psalm 34']);
});

it('persists each change to the history', async () => {
  await loadLocal();
  await updateHistory((h) => recordSearch(h, 'anxiety'));
  expect(getLocal().history.entries).toEqual(['anxiety']);
  expect(JSON.parse((await AsyncStorage.getItem(KEYS.searchHistory))!)).toEqual({ entries: ['anxiety'] });
});

it('clearing deletes it from storage and tells every screen showing it', async () => {
  await AsyncStorage.setItem(KEYS.searchHistory, JSON.stringify({ entries: ['grief'] }));
  await loadLocal();
  const seen: string[][] = [];
  const unsubscribe = subscribeLocal(() => seen.push(getLocal().history.entries));
  await clearHistory();
  unsubscribe();
  expect(seen).toEqual([[]]);
  expect(getLocal().history.entries).toEqual([]);
  expect(await AsyncStorage.getItem(KEYS.searchHistory)).toBeNull();
});

it('clearing rejects when storage refuses, so sign-out can stop', async () => {
  await loadLocal();
  const spy = jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('disk full'));
  await expect(clearHistory()).rejects.toThrow('disk full');
  spy.mockRestore();
});

it('the claim’s view of the store has no history in it', async () => {
  await AsyncStorage.setItem(KEYS.searchHistory, JSON.stringify({ entries: ['grief'] }));
  await loadLocal();
  expect(Object.keys(localStore.read()).sort()).toEqual(['collection', 'profile']);
});
