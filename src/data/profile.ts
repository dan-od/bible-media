/**
 * The reader's local profile — what onboarding captures and persists. No
 * account; this all lives in on-device storage (see storage.ts). Pure helpers
 * here are unit-tested; the React/storage wiring lives elsewhere.
 */
import { getPassages } from './verseStore';
import type { Passage, TranslationId } from './types';
import { DEFAULT_TRANSLATION_ID } from './translations';

export type BibleLevel = 'starting' | 'growing' | 'seasoned';

export const BIBLE_LEVELS: { id: BibleLevel; title: string; detail: string }[] = [
  { id: 'starting', title: 'Just starting', detail: 'Gospels, Psalms and Proverbs first, with context cards on by default' },
  { id: 'growing', title: 'Growing', detail: 'A wider mix, with the harder books introduced as you go' },
  { id: 'seasoned', title: 'Been reading for years', detail: 'Everything, including the prophets and the letters' },
];

export interface Profile {
  /** True once the five-step onboarding has been completed. Gates routing. */
  onboarded: boolean;
  /** What the reader is going through (chips from "what's on your heart"). */
  situations: string[];
  /** Their own words, matched to themes by the tag index later (no AI). */
  freeText: string;
  level: BibleLevel;
  /** Default translation for the feed. */
  translationId: TranslationId;
  /** Extra themes picked up from the swipe-to-tune step. */
  tunedThemes: string[];
  /** Whether the reader opted into the one daily "morning verse" notification. */
  morningVerse: boolean;
  /**
   * Whether recent searches are kept. On by default; when off, nothing is
   * written to search history (the switch suppresses writes, see
   * search-history.ts), it does not merely hide existing entries.
   */
  keepSearchHistory: boolean;
}

export const DEFAULT_PROFILE: Profile = {
  onboarded: false,
  situations: [],
  freeText: '',
  level: 'growing',
  translationId: DEFAULT_TRANSLATION_ID,
  tunedThemes: [],
  morningVerse: false,
  keepSearchHistory: true,
};

const LEVEL_IDS = BIBLE_LEVELS.map((l) => l.id);

/**
 * Parse a stored profile defensively: merge over defaults so a profile written
 * by an older build (missing keys) still loads, and coerce bad values back to
 * their defaults rather than trusting the blob.
 */
export function parseProfile(raw: string | null, available: TranslationId[]): Profile {
  if (!raw) return DEFAULT_PROFILE;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_PROFILE;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_PROFILE;
  const o = data as Record<string, unknown>;

  const strings = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const level = LEVEL_IDS.includes(o.level as BibleLevel) ? (o.level as BibleLevel) : DEFAULT_PROFILE.level;
  const translationId = available.includes(o.translationId as TranslationId)
    ? (o.translationId as TranslationId)
    : DEFAULT_PROFILE.translationId;

  return {
    onboarded: o.onboarded === true,
    situations: strings(o.situations),
    freeText: typeof o.freeText === 'string' ? o.freeText : '',
    level,
    translationId,
    tunedThemes: strings(o.tunedThemes),
    morningVerse: o.morningVerse === true,
    // Default on: only an explicit false turns history off.
    keepSearchHistory: o.keepSearchHistory !== false,
  };
}

/**
 * The themes that drive the feed: what the reader said they're going through,
 * plus what they tuned into — de-duplicated, order preserved.
 */
export function effectiveSituations(profile: Profile): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of [...profile.situations, ...profile.tunedThemes]) {
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** The "what's on your heart" step needs at least one chip or a few words. */
export function canContinueHeart(situations: string[], freeText: string): boolean {
  return situations.length > 0 || freeText.trim().length > 0;
}

/** Chips offered on the "what's on your heart" step. */
export const HEART_THEMES = [
  'Grief',
  'Anxiety',
  'New job',
  'A breakup',
  'Purpose',
  'Discipline',
  'Faith doubts',
  'Money',
  'Loneliness',
  'Thankful',
];

export interface TuneCard {
  passage: Passage;
  /** Themes added to tunedThemes when the reader says this one speaks to them. */
  themes: string[];
}

/** A fixed deck of passages for swipe-to-tune — reuses verified store text. */
export function buildTuneDeck(): TuneCard[] {
  return getPassages()
    .slice(0, 9)
    .map((passage) => ({ passage, themes: passage.themeTags }));
}

/** Add a tune card's themes to the running set, de-duplicated. */
export function addTunedThemes(current: string[], card: TuneCard): string[] {
  const seen = new Set(current.map((t) => t.toLowerCase()));
  const out = [...current];
  for (const t of card.themes) {
    if (!seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}
