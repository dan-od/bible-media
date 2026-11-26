/**
 * The words of Scripture (and of the copy around it) as line breaking sees
 * them. Word wrap only breaks at spaces, so a "word" here is a whole run
 * between spaces, punctuation and all ("understanding,"). A run that is wider
 * than its line can only be broken mid-word, which is what the reading
 * surfaces are sized to prevent (see lib/verse-fit and lib/sheet-fit). A word
 * of our own copy that is too wide is rewritten, never hyphenated by hand.
 */
import type { Passage } from './types';
import { readAllLabel, sheetTitles } from '@/lib/sheet-copy';

/** The unbreakable runs in a piece of text. */
export function lineBreakUnits(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

const distinct = (texts: Iterable<string>) => {
  const out = new Set<string>();
  for (const t of texts) for (const w of lineBreakUnits(t)) out.add(w);
  return [...out];
};

/** Every verse text in the library, in every translation it carries. */
function* verseTexts(passages: readonly Passage[]) {
  for (const p of passages) for (const t of Object.values(p.text)) if (t) for (const v of t.verses) yield v.text;
}

/**
 * Every distinct run in the library, in every translation it carries: the
 * passage verses (set in the display serif) and the lead-in verses (the text
 * serif), kept apart because they are set in different faces and sizes.
 */
export function scriptureWords(passages: readonly Passage[]): { verse: string[]; leadIn: string[] } {
  const leadIns = function* () {
    for (const p of passages) for (const t of Object.values(p.text)) if (t?.leadIn) yield t.leadIn.text;
  };
  return { verse: distinct(verseTexts(passages)), leadIn: distinct(leadIns()) };
}

/**
 * The runs each sheet surface can show, for measuring its ceiling. The note
 * body is not here on purpose: it is the reader's own text, which no library
 * can describe, so it scales like ordinary UI text (see lib/sheet-fit).
 */
export function sheetWords(passages: readonly Passage[]) {
  return {
    /** Compare rows: every passage verse, every translation. */
    compare: distinct(verseTexts(passages)),
    /** Note excerpt: the same verses, quoted in the note sheet. */
    excerpt: distinct(verseTexts(passages)),
    /** Context cards: the reviewed facts. */
    context: distinct(passages.flatMap((p) => p.context?.facts.map((f) => f.body) ?? [])),
    /** Every sheet title. */
    title: distinct(passages.flatMap(sheetTitles)),
    /** The reference under the actions sheet's title. */
    reference: distinct(passages.map((p) => p.reference)),
    /** The context sheet's "Read all of …" button. */
    readAll: distinct(passages.map(readAllLabel)),
  };
}
