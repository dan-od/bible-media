/// <reference types="node" />
// Node types for this test only (it reads the screen's source); the app itself
// stays free of Node globals.
import { readFileSync } from 'fs';
import { join } from 'path';

import { findReferences, searchQuery } from '@/data/search';
import { EXAMPLE_REFERENCE, exampleReference, SEARCH_COPY, SUGGESTED_WORDS } from '@/data/search-hints';
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

  it('is the first passage in canonical book order, not random and not library order', () => {
    const passages = getPassages();
    const shuffled = [...passages].reverse();
    expect(exampleReference(shuffled)).toBe(exampleReference(passages));
    // Deuteronomy is the earliest book the seed library carries.
    expect(exampleReference(passages)).toBe('Deuteronomy 31');
  });

  it('follows the library when it changes', () => {
    const withoutDeut = getPassages().filter((p) => p.book !== 'Deuteronomy');
    expect(exampleReference(withoutDeut)).toBe('Joshua 1');
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
