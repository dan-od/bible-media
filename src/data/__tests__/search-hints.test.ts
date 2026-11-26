/// <reference types="node" />
// Node types for this test only (it reads the screen's source); the app itself
// stays free of Node globals.
import { readFileSync } from 'fs';
import { join } from 'path';

import { findReferences, searchQuery } from '@/data/search';
import {
  EXAMPLE_REFERENCE,
  EXAMPLE_SHORTLIST,
  exampleReference,
  SEARCH_COPY,
  SUGGESTED_WORDS,
} from '@/data/search-hints';
import type { Passage } from '@/data/types';
import { getPassageById, getPassages } from '@/data/verseStore';

// Everything the search screen suggests must find something. These tests fail
// if the library is edited and a hint is left pointing at a passage it no
// longer carries (or a theme no passage has).

/** Every piece of copy the search screen can display. */
const ALL_COPY: string[] = [
  SEARCH_COPY.placeholder,
  SEARCH_COPY.startBody,
  SEARCH_COPY.emptyBody,
  SEARCH_COPY.noFeelingWithBook,
  SEARCH_COPY.noFeelingWithoutBook,
];

const resolvesToCarriedPassage = (query: string) => {
  const r = searchQuery(query);
  return r.kind === 'reference' && r.passages.length > 0 && r.passages.every((p) => getPassageById(p.id));
};

describe('the example reference', () => {
  it('resolves to a passage the library carries', () => {
    expect(EXAMPLE_REFERENCE).toBeTruthy();
    expect(resolvesToCarriedPassage(EXAMPLE_REFERENCE!)).toBe(true);
  });

  it('is the shortlist, in this order', () => {
    expect(EXAMPLE_SHORTLIST).toEqual([
      'John 3',
      'Psalm 23',
      'Romans 8',
      'Philippians 4',
      'Psalm 91',
      'Matthew 6',
      '1 Corinthians 13',
    ]);
    // Each entry is a chapter reference the parser reads.
    for (const ref of EXAMPLE_SHORTLIST) expect(findReferences(ref)).toEqual([ref]);
  });

  it('is a well-known reference the library carries, preferring the shorter when two qualify', () => {
    // The seed library carries Philippians 4 and Matthew 6 from the shortlist;
    // Matthew 6 is the shorter, so it fits the placeholder at large text sizes.
    expect(EXAMPLE_REFERENCE).toBe('Matthew 6');
    expect(exampleReference(getPassages())).toBe('Matthew 6');
  });

  it('is deterministic: library order makes no difference', () => {
    const passages = getPassages();
    expect(exampleReference([...passages].reverse())).toBe(exampleReference(passages));
  });

  it('follows the library when it changes', () => {
    // Without Matthew 6, the only qualifying entry left is Philippians 4.
    const withoutMatthew = getPassages().filter((p) => p.book !== 'Matthew');
    expect(exampleReference(withoutMatthew)).toBe('Philippians 4');
    // Equal length: list order decides (Psalm 23 comes before Romans 8 and Psalm 91).
    const stub = (book: string, chapter: number): Passage => ({ ...getPassages()[0], id: `${book}-${chapter}`, book, chapter });
    expect(exampleReference([stub('Psalm', 91), stub('Romans', 8), stub('Psalm', 23)])).toBe('Psalm 23');
    // A carried chapter of a shortlisted book is not enough: the chapter must match.
    expect(exampleReference([stub('John', 15), stub('Psalm', 91)])).toBe('Psalm 91');
  });

  it('falls back to canonical book order when the library carries none of the shortlist', () => {
    const noneShortlisted = getPassages().filter(
      (p) => !['Matthew', 'Philippians'].includes(p.book),
    );
    expect(noneShortlisted.length).toBeGreaterThan(0);
    // Deuteronomy is the earliest book left; never an empty hint.
    expect(exampleReference(noneShortlisted)).toBe('Deuteronomy 31');
    expect(exampleReference([...noneShortlisted].reverse())).toBe('Deuteronomy 31');
    const onlyJohn = getPassages().filter((p: Passage) => p.book === 'John');
    expect(exampleReference(onlyJohn)).toBe('John 15');
  });

  it('is null when there is nothing to point at', () => {
    expect(exampleReference([])).toBeNull();
  });
});

describe('every hint the search screen can show', () => {
  it.each(ALL_COPY)('names only references the library carries: "%s"', (copy) => {
    for (const ref of findReferences(copy)) {
      expect({ ref, resolves: resolvesToCarriedPassage(ref) }).toEqual({ ref, resolves: true });
    }
  });

  it('puts the same example reference in the placeholder and the hints', () => {
    expect(SEARCH_COPY.placeholder).toContain(EXAMPLE_REFERENCE);
    expect(SEARCH_COPY.startBody).toContain(EXAMPLE_REFERENCE);
    expect(SEARCH_COPY.emptyBody).toContain(EXAMPLE_REFERENCE);
  });

  it.each(SUGGESTED_WORDS)('offers the chip "%s", which finds passages', (word) => {
    expect(searchQuery(word).passages.length).toBeGreaterThan(0);
  });

  it('only quotes example words that find passages', () => {
    const quoted = ALL_COPY.flatMap((c) => [...c.matchAll(/“([^”]+)”/g)].map((m) => m[1]));
    expect(quoted.length).toBeGreaterThan(0);
    for (const word of quoted) {
      expect({ word, found: searchQuery(word).passages.length > 0 }).toEqual({ word, found: true });
    }
  });

  // A reference typed straight into the screen would bypass all of the above.
  it('hard-codes no reference in the search screen itself', () => {
    const screen = readFileSync(join(__dirname, '../../app/(tabs)/search.tsx'), 'utf8');
    expect(findReferences(screen)).toEqual([]);
  });
});

describe('findReferences', () => {
  it('picks out chapter references inside prose', () => {
    expect(findReferences('Try a passage like John 3, Psalm 31:24 or 1 Cor 13.')).toEqual([
      'John 3',
      'Psalm 31:24',
      '1 Cor 13',
    ]);
    expect(findReferences('read Song of Songs 2 today')).toEqual(['Song of Songs 2']);
  });

  it('ignores numbers that are not references', () => {
    expect(findReferences('fontSize: 16, step 3 of 9, size={19}')).toEqual([]);
  });
});
