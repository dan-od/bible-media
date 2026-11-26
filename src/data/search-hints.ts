/**
 * Everything the Search screen suggests: the example reference, the chip words,
 * and the copy that names them. Kept here, not in the screen, so a test can
 * prove every suggestion finds something (see search-hints.test.ts) — the
 * library grows and shrinks, and a hint must never point at a passage it no
 * longer carries.
 */
import { canonicalBookIndex, parseReference } from './search';
import type { Passage } from './types';
import { getPassages } from './verseStore';

/**
 * Chapters most readers recognise on sight, most familiar first. The hint is
 * there to show that references work, and it only does that if it names one
 * people know.
 */
export const EXAMPLE_SHORTLIST = [
  'John 3',
  'Psalm 23',
  'Romans 8',
  'Philippians 4',
  'Psalm 91',
  'Matthew 6',
  '1 Corinthians 13',
] as const;

/** Whether the library carries a passage in this chapter reference. */
function carries(passages: readonly Passage[], reference: string): boolean {
  const ref = parseReference(reference);
  if (!ref || ref.chapter === undefined) return false;
  const book = canonicalBookIndex(ref.book);
  return passages.some((p) => canonicalBookIndex(p.book) === book && p.chapter === ref.chapter);
}

/**
 * The reference to suggest. From the shortlist entries the library carries,
 * the shortest (the placeholder is tight at large text sizes), with list order
 * breaking a tie. If it carries none of them, the first passage in canonical
 * book order (then chapter, then verse) as a chapter reference, so there's
 * always a hint. Deterministic and derived from the library rather than
 * hard-coded, so it is always one the library can open. Null for an empty
 * library.
 */
export function exampleReference(passages: readonly Passage[]): string | null {
  if (passages.length === 0) return null;
  const carried = EXAMPLE_SHORTLIST.filter((ref) => carries(passages, ref));
  if (carried.length > 0) {
    // Stable sort, so list order breaks a tie in length.
    return [...carried].sort((a, b) => a.length - b.length)[0];
  }
  const first = [...passages].sort(
    (a, b) =>
      canonicalBookIndex(a.book) - canonicalBookIndex(b.book) ||
      a.chapter - b.chapter ||
      a.verseStart - b.verseStart,
  )[0];
  return `${first.book} ${first.chapter}`;
}

/** Computed once, at module load, from the bundled library. */
export const EXAMPLE_REFERENCE = exampleReference(getPassages());

/** Words offered as one-tap chips (and quoted in the hints). Each must find passages. */
export const SUGGESTED_WORDS = ['afraid', 'alone', 'thankful'] as const;

const [first, second] = SUGGESTED_WORDS;
const orReference = EXAMPLE_REFERENCE ? `, or ${EXAMPLE_REFERENCE}` : '';

export const SEARCH_COPY = {
  /** The search field's placeholder. */
  placeholder: `A feeling, a topic${orReference}`,
  /** Start state, before any history exists. */
  startBody: EXAMPLE_REFERENCE
    ? `Find Scripture by what you’re feeling, not only by reference. Try a word for how you are, or a passage like ${EXAMPLE_REFERENCE}.`
    : 'Find Scripture by what you’re feeling. Try a word for how you are.',
  /** The centred no-results state. */
  emptyBody: EXAMPLE_REFERENCE
    ? `Try a feeling (“${first}”, “${second}”), a topic, or a reference like ${EXAMPLE_REFERENCE}.`
    : `Try a feeling (“${first}”, “${second}”) or a topic.`,
  /** After "No feeling matched “x”." when a book row above can be opened. */
  noFeelingWithBook: 'Open the book above, or try a word for how you are.',
  /** After "No feeling matched “x”." when no book row can be opened. */
  noFeelingWithoutBook: `Try a word for how you are, like “${first}” or “${second}”.`,
};
