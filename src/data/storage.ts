/**
 * On-device persistence for the reader's profile. Uses AsyncStorage — Expo's
 * documented choice for small app-state/preferences, works on iOS, Android and
 * web with no native build. No account, no network.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { EMPTY_COLLECTION, parseCollection, type Collection } from './collection';
import { DEFAULT_PROFILE, parseProfile, type Profile } from './profile';
import { EMPTY_HISTORY, parseHistory, type SearchHistory } from './search-history';
import { getAvailableTranslations, getPassages } from './verseStore';

const PROFILE_KEY = 'profile.v1';
const COLLECTION_KEY = 'collection.v1';
const SEARCH_HISTORY_KEY = 'searchHistory.v1';

export async function loadProfile(): Promise<Profile> {
  try {
    const raw = await AsyncStorage.getItem(PROFILE_KEY);
    return parseProfile(raw, getAvailableTranslations().map((t) => t.id));
  } catch {
    return DEFAULT_PROFILE;
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

export async function clearProfile(): Promise<void> {
  await AsyncStorage.removeItem(PROFILE_KEY);
}

export async function loadCollection(): Promise<Collection> {
  try {
    const raw = await AsyncStorage.getItem(COLLECTION_KEY);
    return parseCollection(raw, getPassages().map((p) => p.id));
  } catch {
    return EMPTY_COLLECTION;
  }
}

export async function saveCollection(collection: Collection): Promise<void> {
  await AsyncStorage.setItem(COLLECTION_KEY, JSON.stringify(collection));
}

export async function clearCollection(): Promise<void> {
  await AsyncStorage.removeItem(COLLECTION_KEY);
}

export async function loadSearchHistory(): Promise<SearchHistory> {
  try {
    const raw = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    return parseHistory(raw);
  } catch {
    return EMPTY_HISTORY;
  }
}

export async function saveSearchHistory(history: SearchHistory): Promise<void> {
  await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
}

export async function clearSearchHistory(): Promise<void> {
  await AsyncStorage.removeItem(SEARCH_HISTORY_KEY);
}
