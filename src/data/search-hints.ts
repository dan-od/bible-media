/**
 * Everything the Search screen suggests: the example reference, the chip words,
 * and the copy that names them. Kept here, not in the screen, so a test can
 * prove every suggestion finds something (see search-hints.test.ts) — the
 * library grows and shrinks, and a hint must never point at a passage it no
 * longer carries.
 */
import { canonicalBookIndex } from './search';
import type { Passage } from './types';
import { getPassages } from './verseStore';

/**
 * The reference to suggest: the first passage the library carries in canonical
 * book order (then chapter, then verse), as a chapter reference — "Deuteronomy
 * 31". Deterministic, never random, and derived from the library rather than
 * hard-coded, so it is always one the library can open. Null for an empty
 * library.
 */
export function exampleReference(passages: readonly Passage[]): string | null {
  if (passages.length === 0) return null;
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
