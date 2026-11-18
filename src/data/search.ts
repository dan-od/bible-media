/**
 * Local search over the bundled passages. No backend, no network, no AI — a
 * query is matched two ways and only two ways:
 *
 *   1. A REFERENCE ("John 3", "Psalm 31:24", "1 Cor 13") is parsed and resolved
 *      to a passage in the library.
 *   2. Anything else is a THEME lookup: the query's words are mapped to theme
 *      tags through the tag vocabulary plus `synonyms.json` (plain data a
 *      non-technical person can extend), and the passages carrying those themes
 *      are returned.
 *
 * Everything here is pure and deterministic, so the parser and the matcher are
 * unit-tested directly.
 */
import synonymsData from './synonyms.json';
import type { Passage } from './types';
import { getAllThemes, getPassages, getPassagesByTheme } from './verseStore';

// --- Book table ------------------------------------------------------------

/**
 * The 66 books, each as `[canonical, ...aliases]`. Aliases are lower-case and
 * use the DIGIT form for numbered books ("1 john"); the parser normalises a
 * leading ordinal word ("first", "i", "1st") to that digit before matching, so
 * each numbered book needs only its "1 x" alias here. Periods in an
 * abbreviation ("Gen.") are stripped before matching, so none are listed.
 */
const BOOKS: string[][] = [
  ['Genesis', 'gen', 'ge', 'gn'],
  ['Exodus', 'exo', 'ex', 'exod'],
  ['Leviticus', 'lev', 'lv'],
  ['Numbers', 'num', 'nu', 'nm'],
  ['Deuteronomy', 'deut', 'dt', 'deu'],
  ['Joshua', 'josh', 'jos', 'jsh'],
  ['Judges', 'judg', 'jdg', 'jg'],
  ['Ruth', 'rth', 'ru'],
  ['1 Samuel', '1 sam', '1 sa', '1 sm'],
  ['2 Samuel', '2 sam', '2 sa', '2 sm'],
  ['1 Kings', '1 kgs', '1 ki', '1 kin'],
  ['2 Kings', '2 kgs', '2 ki', '2 kin'],
  ['1 Chronicles', '1 chron', '1 chr', '1 ch'],
  ['2 Chronicles', '2 chron', '2 chr', '2 ch'],
  ['Ezra', 'ezr'],
  ['Nehemiah', 'neh', 'ne'],
  ['Esther', 'esth', 'est', 'es'],
  ['Job', 'jb'],
  ['Psalms', 'psalm', 'ps', 'psa', 'psm', 'pss'],
  ['Proverbs', 'prov', 'pro', 'prv', 'pr'],
  ['Ecclesiastes', 'eccles', 'eccl', 'ecc', 'qoh'],
  ['Song of Songs', 'song of solomon', 'song', 'sos', 'canticles', 'cant'],
  ['Isaiah', 'isa', 'is'],
  ['Jeremiah', 'jer', 'je', 'jr'],
  ['Lamentations', 'lam', 'la'],
  ['Ezekiel', 'ezek', 'eze', 'ezk'],
  ['Daniel', 'dan', 'da', 'dn'],
  ['Hosea', 'hos', 'ho'],
  ['Joel', 'joe', 'jl'],
  ['Amos', 'am', 'amo'],
  ['Obadiah', 'obad', 'oba', 'ob'],
  ['Jonah', 'jon', 'jnh'],
  ['Micah', 'mic', 'mc'],
  ['Nahum', 'nah', 'na'],
  ['Habakkuk', 'hab', 'hb'],
  ['Zephaniah', 'zeph', 'zep', 'zp'],
  ['Haggai', 'hag', 'hg'],
  ['Zechariah', 'zech', 'zec', 'zc'],
  ['Malachi', 'mal', 'ml'],
  ['Matthew', 'matt', 'mt'],
  ['Mark', 'mrk', 'mk', 'mr'],
  ['Luke', 'luk', 'lk'],
  ['John', 'jhn', 'jn'],
  ['Acts', 'act', 'ac'],
  ['Romans', 'rom', 'ro', 'rm'],
  ['1 Corinthians', '1 cor', '1 co'],
  ['2 Corinthians', '2 cor', '2 co'],
  ['Galatians', 'gal', 'ga'],
  ['Ephesians', 'eph', 'ephes'],
  ['Philippians', 'phil', 'php', 'pp'],
  ['Colossians', 'col', 'cl'],
  ['1 Thessalonians', '1 thess', '1 thes', '1 th'],
  ['2 Thessalonians', '2 thess', '2 thes', '2 th'],
  ['1 Timothy', '1 tim', '1 ti'],
  ['2 Timothy', '2 tim', '2 ti'],
  ['Titus', 'tit', 'ti'],
  ['Philemon', 'philem', 'phlm', 'phm'],
  ['Hebrews', 'heb'],
  ['James', 'jas', 'jm'],
  ['1 Peter', '1 pet', '1 pe', '1 pt'],
  ['2 Peter', '2 pet', '2 pe', '2 pt'],
  ['1 John', '1 jn', '1 jhn'],
  ['2 John', '2 jn', '2 jhn'],
  ['3 John', '3 jn', '3 jhn'],
  ['Jude', 'jud', 'jde'],
  ['Revelation', 'rev', 're', 'apocalypse'],
];

/** canonical name (lower-case) and every alias → canonical name. */
const BOOK_LOOKUP: Map<string, string> = (() => {
  const m = new Map<string, string>();
  for (const [canonical, ...aliases] of BOOKS) {
    m.set(canonical.toLowerCase(), canonical);
    for (const a of aliases) m.set(a, canonical);
  }
  return m;
})();

/**
 * Bare family word → the books that share it, for numbered books only:
 * "kings" → ["1 Kings", "2 Kings"], "corinthians" → ["1 Corinthians", ...].
 * A bare word that is itself a single canonical book ("john" = the Gospel) is
 * resolved by BOOK_LOOKUP first and never reaches this map, so the Gospel wins
 * over the 1–3 John epistles.
 */
const FAMILY_LOOKUP: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>();
  for (const [canonical] of BOOKS) {
    const base = canonical.match(/^[123]\s+(.+)$/);
    if (!base) continue;
    const key = base[1].toLowerCase();
    const arr = m.get(key) ?? [];
    arr.push(canonical);
    m.set(key, arr);
  }
  return m;
})();

const ORDINALS: Record<string, string> = {
  i: '1', ii: '2', iii: '3',
  '1st': '1', '2nd': '2', '3rd': '3',
  first: '1', second: '2', third: '3',
};

/** Lower-case, strip periods, and fold a leading ordinal word to its digit. */
function normaliseBook(raw: string): string {
  const cleaned = raw.toLowerCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();
  const parts = cleaned.split(' ');
  if (parts.length > 1 && ORDINALS[parts[0]]) parts[0] = ORDINALS[parts[0]];
  return parts.join(' ');
}

// --- Reference parsing -----------------------------------------------------

export interface ParsedReference {
  /** Canonical book name, e.g. "1 John", "Psalms". */
  book: string;
  chapter?: number;
  verse?: number;
  verseEnd?: number;
  /** Canonical display string, e.g. "Psalm 31:24", "1 John", "1 Corinthians 13". */
  reference: string;
}

/**
 * Parse a query as a Scripture reference, or return null if it isn't one.
 *
 * Handles numbered books ("1 John 2"), multi-word books ("Song of Songs 2"),
 * abbreviations ("1 Cor 13", "Ps 31:24"), a bare book with no chapter ("John"),
 * and verse ranges ("Matthew 6:25-27"). The whole string must be a reference —
 * a trailing or leading word that isn't part of one ("new job") fails here and
 * falls through to the theme lookup.
 */
export function parseReference(query: string): ParsedReference | null {
  const q = query.trim().replace(/\s+/g, ' ');
  if (!q) return null;

  // Book part (minimal), then an optional "chapter(:verse(-verseEnd)?)".
  const m = q.match(/^(.+?)(?:\s+(\d+)(?::(\d+)(?:\s*[-–—]\s*(\d+))?)?)?$/);
  if (!m) return null;

  const book = BOOK_LOOKUP.get(normaliseBook(m[1]));
  if (!book) return null;

  const chapter = m[2] ? Number(m[2]) : undefined;
  const verse = m[3] ? Number(m[3]) : undefined;
  const verseEnd = m[4] ? Number(m[4]) : undefined;

  let reference = book;
  if (chapter !== undefined) reference += ` ${chapter}`;
  if (verse !== undefined) reference += `:${verse}`;
  if (verseEnd !== undefined) reference += `–${verseEnd}`;

  return { book, chapter, verse, verseEnd, reference };
}

/** The canonical book name for a passage's `book` field (seed uses "Psalm"). */
function passageBook(passage: Passage): string | undefined {
  return BOOK_LOOKUP.get(normaliseBook(passage.book));
}

/**
 * The canonical book(s) a WHOLE query names with no chapter — the ambiguous
 * case. `[]` when the query isn't a bare book word (free text, or a reference
 * with a chapter). A single book for "Job"/"Acts"/"Song"; the whole family for
 * a numbered-book word like "Kings" (1 & 2 Kings) or "Corinthians".
 */
function bareBookCandidates(query: string): string[] {
  const key = normaliseBook(query);
  const direct = BOOK_LOOKUP.get(key);
  if (direct) return [direct];
  return FAMILY_LOOKUP.get(key) ?? [];
}

/**
 * Resolve a parsed reference to a passage in the library, or null if we don't
 * carry it. With a verse, the passage whose range contains it; with a chapter
 * only, the first passage in that chapter; with neither, the first passage in
 * the book.
 */
export function resolveReference(ref: ParsedReference): Passage | null {
  const inBook = getPassages().filter((p) => passageBook(p) === ref.book);
  if (inBook.length === 0) return null;

  if (ref.chapter === undefined) return inBook[0];

  const inChapter = inBook.filter((p) => p.chapter === ref.chapter);
  if (inChapter.length === 0) return null;

  if (ref.verse === undefined) return inChapter[0];

  return inChapter.find((p) => ref.verse! >= p.verseStart && ref.verse! <= p.verseEnd) ?? null;
}

// --- Theme matching --------------------------------------------------------

const SYNONYMS: Record<string, string[]> = synonymsData.synonyms;

/**
 * phrase → themes, combining the theme vocabulary (each tag is a synonym of
 * itself) with synonyms.json. Phrases are stored as token arrays so matching is
 * whole-word, never substring ("fear" never matches inside "fearful... " only
 * as the word "fear").
 */
interface Phrase {
  tokens: string[];
  themes: string[];
}

const PHRASES: Phrase[] = (() => {
  const byKey = new Map<string, string[]>();
  const add = (phrase: string, themes: string[]) => {
    const key = tokenize(phrase).join(' ');
    if (!key) return;
    const existing = byKey.get(key) ?? [];
    for (const t of themes) if (!existing.includes(t)) existing.push(t);
    byKey.set(key, existing);
  };
  for (const theme of getAllThemes()) add(theme, [theme]);
  for (const [phrase, themes] of Object.entries(SYNONYMS)) add(phrase, themes);
  return [...byKey.entries()].map(([key, themes]) => ({ tokens: key.split(' '), themes }));
})();

/** Lower-case, drop punctuation, split into word tokens. */
function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Do `phrase` tokens appear as a contiguous run starting at `tokens[i]`? */
function matchesAt(tokens: string[], phrase: string[], i: number): boolean {
  if (i + phrase.length > tokens.length) return false;
  for (let k = 0; k < phrase.length; k++) if (tokens[i + k] !== phrase[k]) return false;
  return true;
}

/**
 * Map a free-text query to theme tags. Longer phrases win: "worried about
 * money" is matched whole (→ Worry, Money) and its sub-words "worried" and
 * "money" are not matched again on top. Themes are returned in the order their
 * phrases appear, de-duplicated.
 */
export function resolveThemes(query: string): string[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Every (phrase, start-index) hit, longest phrase first so it claims its span.
  const hits: { start: number; end: number; themes: string[] }[] = [];
  for (const phrase of PHRASES) {
    for (let i = 0; i <= tokens.length - phrase.tokens.length; i++) {
      if (matchesAt(tokens, phrase.tokens, i)) {
        hits.push({ start: i, end: i + phrase.tokens.length - 1, themes: phrase.themes });
      }
    }
  }
  hits.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);

  const covered = new Set<number>();
  const themes: string[] = [];
  for (const hit of hits) {
    let fullyCovered = true;
    for (let k = hit.start; k <= hit.end; k++) if (!covered.has(k)) fullyCovered = false;
    if (fullyCovered) continue;
    for (let k = hit.start; k <= hit.end; k++) covered.add(k);
    for (const t of hit.themes) if (!themes.includes(t)) themes.push(t);
  }
  return themes;
}

// --- The search itself -----------------------------------------------------

export type SearchKind = 'reference' | 'theme';

/**
 * A "Read the book of X" row pinned above the theme results when the query is a
 * bare book name. The book name is an ordinary word too ("Job", "Acts"), so we
 * never jump to the book silently — we offer it and let the reader choose.
 */
export interface ReferenceRow {
  /** Canonical book name, e.g. "Job", "1 Kings". */
  book: string;
  /** Row label, e.g. "Read the book of Job". */
  label: string;
  /** The first passage we carry in the book, to open — or null if we carry none. */
  passage: Passage | null;
}

export interface SearchResult {
  kind: SearchKind;
  /** Heading shown above the results, e.g. "Psalm 31:24" or "4 passages on worry and money". */
  heading: string;
  /** Themes the query matched (theme kind) — recorded on open to shape the feed. */
  themes: string[];
  passages: Passage[];
  /**
   * Book row(s) to pin above the theme results — only for a bare book name,
   * which is ambiguous. Usually one; a numbered-book family word ("Kings")
   * yields one per book (1 Kings, 2 Kings).
   */
  references?: ReferenceRow[];
}

/** Lower-case theme labels joined naturally: "worry and money". */
function joinThemes(themes: string[]): string {
  const labels = themes.map((t) => t.toLowerCase());
  if (labels.length <= 1) return labels.join('');
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

/** The book row(s) for a bare book name — "Read the book of X" per candidate. */
function bookRows(books: string[]): ReferenceRow[] {
  return books.map((book) => ({
    book,
    label: `Read the book of ${book}`,
    passage: getPassages().find((p) => passageBook(p) === book) ?? null,
  }));
}

/**
 * Run a query. Three shapes:
 *
 *  - A reference WITH a chapter ("Job 3", "1 tim 6") is unambiguous: it
 *    resolves straight through to (at most) one passage.
 *  - A bare book name ("Job", "Kings") is ambiguous — the book name is an
 *    ordinary word too — so it is NEVER resolved silently. It runs the theme
 *    lookup like any other word AND pins a "Read the book of X" row above the
 *    results, so the reader sees both.
 *  - Anything else is a plain theme lookup.
 *
 * An empty query returns an empty theme result (the screen shows recent
 * searches instead). No scores, no counts beyond the heading.
 */
export function searchQuery(query: string): SearchResult {
  const q = query.trim();
  if (!q) return { kind: 'theme', heading: '', themes: [], passages: [] };

  const ref = parseReference(q);
  if (ref && ref.chapter !== undefined) {
    const passage = resolveReference(ref);
    return {
      kind: 'reference',
      // Prefer the passage's own reference when it resolves (what the row shows);
      // otherwise the canonical parse, so a miss still reads back cleanly.
      heading: passage ? passage.reference : ref.reference,
      themes: passage ? passage.themeTags : [],
      passages: passage ? [passage] : [],
    };
  }

  const themes = resolveThemes(q);
  const passages = passagesForThemes(themes);
  // Only name themes that actually produced a passage, so the heading is honest.
  const effective = themes.filter((t) => getPassagesByTheme(t).length > 0);
  const n = passages.length;
  const heading = n === 0 ? '' : `${n} ${n === 1 ? 'passage' : 'passages'} on ${joinThemes(effective)}`;

  // A bare book name pins its "Read the book of X" row(s) above the themes.
  const candidates = bareBookCandidates(q);
  const references = candidates.length > 0 ? bookRows(candidates) : undefined;

  return { kind: 'theme', heading, themes, passages, ...(references ? { references } : {}) };
}

/** Union of passages tagged with any of `themes`, in stable seed order. */
export function passagesForThemes(themes: string[]): Passage[] {
  const seen = new Set<string>();
  const out: Passage[] = [];
  for (const theme of themes) {
    for (const p of getPassagesByTheme(theme)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      out.push(p);
    }
  }
  // Stable seed order regardless of theme order.
  const order = new Map(getPassages().map((p, i) => [p.id, i]));
  return out.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
}

/**
 * The single theme tag to show on a result row: the first of the passage's tags
 * that the query actually matched, otherwise its first tag.
 */
export function rowTag(passage: Passage, matched: string[]): string {
  const lower = new Set(matched.map((t) => t.toLowerCase()));
  return passage.themeTags.find((t) => lower.has(t.toLowerCase())) ?? passage.themeTags[0];
}
