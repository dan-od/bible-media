/**
 * Local verse-store types.
 *
 * A Passage is a RANGE — one complete thought, normally 1–3 verses — with the
 * verse immediately before it kept as a dimmed lead-in (per the spec). Passage
 * text is stored per translation so the store stays translation-agnostic:
 * public-domain translations ship in the binary now, and licensed ones (NIV,
 * NLT via YouVersion) can slot in behind the same interface later.
 */

export type TranslationId = 'KJV' | 'BSB' | 'WEB' | 'NIV' | 'NLT';

export interface Translation {
  id: TranslationId;
  /** Full display name, e.g. "King James Version". */
  name: string;
  /** Licensing note shown in the compare sheet, e.g. "Public domain". */
  licenseNote: string;
  /**
   * True when the text cannot ship in the binary and needs an external licence
   * (YouVersion Platform). Locked translations carry no text here.
   */
  locked: boolean;
}

export interface VerseText {
  /** Verse number within its chapter. */
  number: number;
  text: string;
}

/**
 * The text of a passage in a single translation. `leadIn` (the dimmed previous
 * verse) is optional on alternate translations — when absent, rendering falls
 * back to the KJV lead-in. The KJV slot always carries one (see Passage.text).
 */
export interface PassageText {
  leadIn?: VerseText;
  verses: VerseText[];
}

/** A PassageText guaranteed to carry a lead-in (used for the KJV base text). */
export interface PassageTextWithLeadIn extends PassageText {
  leadIn: VerseText;
}

export interface PassageContextFact {
  /** Short label, e.g. "Who is speaking". */
  label: string;
  body: string;
}

/** Reviewed reference material for a passage (no AI — a tagged, human set). */
export interface PassageContext {
  facts: PassageContextFact[];
  /** Related passage references to "read alongside". */
  readAlongside: string[];
}

export interface Passage {
  /** Stable, unique id, e.g. "psalm-31-24". */
  id: string;
  book: string;
  chapter: number;
  /** First verse of the range. */
  verseStart: number;
  /** Last verse of the range (equals verseStart for a single verse). */
  verseEnd: number;
  /** Human reference, e.g. "Psalm 31:24" or "Matthew 6:25–27". */
  reference: string;
  /** Theme tags used by matching and search, e.g. ["Courage", "New job"]. */
  themeTags: string[];
  /** Verse-number of the lead-in (always verseStart - 1). */
  leadInVerse: number;
  /** Text keyed by translation. KJV is guaranteed (with lead-in); others optional. */
  text: Partial<Record<TranslationId, PassageText>> & { KJV: PassageTextWithLeadIn };
  context?: PassageContext;
}

/** A passage resolved for one translation, ready for a screen to render. */
export interface RenderedPassage {
  passage: Passage;
  translation: Translation;
  leadIn: VerseText;
  verses: VerseText[];
  /** True when the requested translation had no text and we fell back. */
  fellBack: boolean;
}
