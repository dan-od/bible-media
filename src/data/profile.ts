/**
 * The reader's local profile — what onboarding captures and persists. Local-first:
 * it lives in on-device storage (see storage.ts) with or without an account.
 *
 * Screens work with `Profile`, a plain view. Underneath (`StoredProfile`), what the
 * person said they're going through — the situation chips, their own words, and the
 * tuned themes — are claimable records with client ids (see claimable.ts), so they can
 * become an account's data exactly once. Settings are plain values. The search-history
 * switch and the morning-verse choice are this phone's, never claimed.
 */
import {
  created,
  edited,
  parseClaimable,
  parseRemovals,
  visibleTo,
  type ChangeContext,
  type Claimable,
  type Owner,
  type Removal,
} from './claimable';
import { resolveThemes } from './search';
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
  /**
   * Own words written on another phone signed into the same account, kept as said
   * (never merged into `freeText`). They reach themes just like `freeText`.
   */
  moreWords?: string[];
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
 * The themes that drive the feed: the chips the reader picked, what they tuned
 * into, then whatever their own words reach — de-duplicated, order preserved.
 */
export function effectiveSituations(profile: Profile): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  // The heart step's "a few words" answer reaches themes the same way search
  // does (tags + synonyms.json, no model), after the chips and tuned themes.
  const fromWords = [profile.freeText, ...(profile.moreWords ?? [])].flatMap((w) => resolveThemes(w));
  for (const s of [...profile.situations, ...profile.tunedThemes, ...fromWords]) {
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

// ---------------------------------------------------------------- stored profile

export type ProfileSettings = Pick<Profile, 'onboarded' | 'level' | 'translationId' | 'morningVerse' | 'keepSearchHistory'>;

/** A situation chip or a tuned theme. */
export interface LabelRecord extends Claimable {
  label: string;
  createdAt: number;
}

/** The person's own words about what they're going through. */
export interface WordsRecord extends Claimable {
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface StoredProfile {
  settings: ProfileSettings;
  situations: LabelRecord[];
  tuned: LabelRecord[];
  words: WordsRecord[];
  /** Claimed records removed since, waiting to be removed on the server. */
  removed: Removal[];
}

const DEFAULT_SETTINGS: ProfileSettings = {
  onboarded: DEFAULT_PROFILE.onboarded,
  level: DEFAULT_PROFILE.level,
  translationId: DEFAULT_PROFILE.translationId,
  morningVerse: DEFAULT_PROFILE.morningVerse,
  keepSearchHistory: DEFAULT_PROFILE.keepSearchHistory,
};

export const EMPTY_STORED_PROFILE: StoredProfile = {
  settings: DEFAULT_SETTINGS,
  situations: [],
  tuned: [],
  words: [],
  removed: [],
};

const sameLabel = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What a viewer (signed-in user id, or null) sees, as the screens use it. */
export function profileView(s: StoredProfile, viewer: Owner): Profile {
  const labels = (list: LabelRecord[]) => {
    const out: string[] = [];
    for (const r of list) if (visibleTo(r, viewer) && !out.some((l) => sameLabel(l, r.label))) out.push(r.label);
    return out;
  };
  const words = s.words.filter((w) => visibleTo(w, viewer)).sort((a, b) => b.updatedAt - a.updatedAt);
  const view: Profile = {
    ...s.settings,
    situations: labels(s.situations),
    tunedThemes: labels(s.tuned),
    freeText: words[0]?.text ?? '',
  };
  if (words.length > 1) view.moreWords = words.slice(1).map((w) => w.text);
  return view;
}

/** Reconcile a list of labels with the records behind it. */
function reconcileLabels(
  list: LabelRecord[],
  next: string[],
  kind: 'situation' | 'tuned',
  ctx: ChangeContext,
  removed: Removal[],
): LabelRecord[] {
  const kept = list.filter((r) => {
    if (!visibleTo(r, ctx.owner) || next.some((l) => sameLabel(l, r.label))) return true;
    if (r.owner !== null) removed.push({ kind, clientId: r.clientId, owner: r.owner, label: r.label });
    return false;
  });
  const added: LabelRecord[] = [];
  for (const label of next) {
    const has = [...kept, ...added].some((r) => visibleTo(r, ctx.owner) && sameLabel(r.label, label));
    if (!has) added.push({ ...created(ctx), label, createdAt: ctx.now });
  }
  return [...kept, ...added];
}

/**
 * Apply a change made through the plain view. Situation and tuned-theme lists are
 * reconciled with their records (new labels get ids, removed ones are forgotten);
 * `freeText` edits the most recent words the owner can see, or starts them.
 */
export function applyProfilePatch(s: StoredProfile, patch: Partial<Profile>, ctx: ChangeContext): StoredProfile {
  const removed = [...s.removed];
  const settings = { ...s.settings };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ProfileSettings)[]) {
    if (patch[key] !== undefined) (settings as Record<string, unknown>)[key] = patch[key];
  }
  const situations = patch.situations ? reconcileLabels(s.situations, patch.situations, 'situation', ctx, removed) : s.situations;
  const tuned = patch.tunedThemes ? reconcileLabels(s.tuned, patch.tunedThemes, 'tuned', ctx, removed) : s.tuned;

  let words = s.words;
  if (patch.freeText !== undefined) {
    const text = patch.freeText;
    const latest = s.words.filter((w) => visibleTo(w, ctx.owner)).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (!latest) {
      if (text.trim()) words = [...s.words, { ...created(ctx), text, createdAt: ctx.now, updatedAt: ctx.now }];
    } else if (!text.trim()) {
      words = s.words.filter((w) => w !== latest);
      if (latest.owner !== null) removed.push({ kind: 'words', clientId: latest.clientId, owner: latest.owner });
    } else if (text !== latest.text) {
      words = s.words.map((w) => (w === latest ? { ...edited(w), text, updatedAt: ctx.now } : w));
    }
  }
  return { settings, situations, tuned, words, removed };
}

/** Parse a stored profile (profile.v2) defensively. */
export function parseStoredProfile(raw: string | null, available: TranslationId[]): StoredProfile {
  if (!raw) return EMPTY_STORED_PROFILE;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return EMPTY_STORED_PROFILE;
  }
  if (typeof data !== 'object' || data === null) return EMPTY_STORED_PROFILE;
  const o = data as Record<string, unknown>;
  const seen = new Set<string>();
  const base = <T>(x: unknown, extra: (r: Record<string, unknown>) => T | null): (Claimable & T) | null => {
    if (typeof x !== 'object' || x === null) return null;
    const r = x as Record<string, unknown>;
    const claim = parseClaimable(r);
    if (!claim || seen.has(claim.clientId)) return null;
    const rest = extra(r);
    if (!rest) return null;
    seen.add(claim.clientId);
    return { ...claim, ...rest };
  };
  const labels = (v: unknown): LabelRecord[] =>
    (Array.isArray(v) ? v : [])
      .map((x) =>
        base(x, (r) =>
          typeof r.label === 'string' && r.label.trim()
            ? { label: r.label, createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0 }
            : null,
        ),
      )
      .filter((r): r is LabelRecord => r !== null);
  const words = (Array.isArray(o.words) ? o.words : [])
    .map((x) =>
      base(x, (r) =>
        typeof r.text === 'string' && r.text.trim()
          ? {
              text: r.text,
              createdAt: typeof r.createdAt === 'number' ? r.createdAt : 0,
              updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : 0,
            }
          : null,
      ),
    )
    .filter((r): r is WordsRecord => r !== null);
  // Settings parse exactly as a pre-step-7 profile's did.
  const legacy = parseProfile(JSON.stringify(o.settings ?? {}), available);
  return {
    settings: {
      onboarded: legacy.onboarded,
      level: legacy.level,
      translationId: legacy.translationId,
      morningVerse: legacy.morningVerse,
      keepSearchHistory: legacy.keepSearchHistory,
    },
    situations: labels(o.situations),
    tuned: labels(o.tuned),
    words,
    removed: parseRemovals(o.removed),
  };
}

/**
 * Give a pre-step-7 profile (profile.v1) its records: every chip, tuned theme and the
 * own words get a client id. Nothing is dropped. They belong to no one yet.
 */
export function migrateLegacyProfile(old: Profile, ctx: Omit<ChangeContext, 'owner'>): StoredProfile {
  const c: ChangeContext = { ...ctx, owner: null };
  const labels = (list: string[]) => {
    const out: LabelRecord[] = [];
    for (const label of list) {
      if (!label.trim() || out.some((r) => sameLabel(r.label, label))) continue;
      out.push({ ...created(c), label, createdAt: ctx.now });
    }
    return out;
  };
  return {
    settings: {
      onboarded: old.onboarded,
      level: old.level,
      translationId: old.translationId,
      morningVerse: old.morningVerse,
      keepSearchHistory: old.keepSearchHistory,
    },
    situations: labels(old.situations),
    tuned: labels(old.tunedThemes),
    words: old.freeText.trim() ? [{ ...created(c), text: old.freeText, createdAt: ctx.now, updatedAt: ctx.now }] : [],
    removed: [],
  };
}
