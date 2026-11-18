import {
  parseReference,
  passagesForThemes,
  resolveReference,
  resolveThemes,
  rowTag,
  searchQuery,
} from '@/data/search';
import { getPassageById } from '@/data/verseStore';

describe('parseReference', () => {
  it('parses a plain book + chapter', () => {
    expect(parseReference('John 3')).toMatchObject({ book: 'John', chapter: 3, reference: 'John 3' });
  });

  it('parses a chapter:verse and a verse range', () => {
    expect(parseReference('Psalm 31:24')).toMatchObject({ book: 'Psalms', chapter: 31, verse: 24 });
    expect(parseReference('Matthew 6:25-27')).toMatchObject({
      book: 'Matthew',
      chapter: 6,
      verse: 25,
      verseEnd: 27,
    });
  });

  // The awkward cases called out in the brief.
  it('parses a numbered book ("1 John 2")', () => {
    expect(parseReference('1 John 2')).toMatchObject({ book: '1 John', chapter: 2 });
  });

  it('parses a numbered book from an abbreviation ("1 Cor 13")', () => {
    expect(parseReference('1 Cor 13')).toMatchObject({ book: '1 Corinthians', chapter: 13 });
  });

  it('parses a multi-word book ("Song of Songs 2")', () => {
    expect(parseReference('Song of Songs 2')).toMatchObject({ book: 'Song of Songs', chapter: 2 });
  });

  it('parses a bare book with no chapter ("John")', () => {
    expect(parseReference('John')).toMatchObject({ book: 'John', chapter: undefined, reference: 'John' });
  });

  it('normalises ordinal words and casing ("second timothy", "ii tim")', () => {
    expect(parseReference('second timothy 1')).toMatchObject({ book: '2 Timothy', chapter: 1 });
    expect(parseReference('ii tim 1')).toMatchObject({ book: '2 Timothy', chapter: 1 });
    expect(parseReference('ps 31:24')).toMatchObject({ book: 'Psalms', chapter: 31, verse: 24 });
  });

  it('returns null for free text that is not a reference', () => {
    expect(parseReference('worried about money')).toBeNull();
    expect(parseReference('afraid')).toBeNull();
    expect(parseReference('new job')).toBeNull();
    expect(parseReference('')).toBeNull();
  });
});

describe('resolveReference', () => {
  it('resolves a verse to the passage whose range contains it', () => {
    const p = resolveReference(parseReference('Psalm 31:24')!);
    expect(p?.id).toBe('psalm-31-24');
  });

  it('resolves a bare book to the first passage we carry in it', () => {
    expect(resolveReference(parseReference('John')!)?.id).toBe('john-15-5');
  });

  it('returns null for a reference the library does not carry', () => {
    expect(resolveReference(parseReference('John 3')!)).toBeNull();
    expect(resolveReference(parseReference('Genesis 1')!)).toBeNull();
  });
});

describe('resolveThemes', () => {
  it('reaches anxiety from "anxious" and courage from "afraid"', () => {
    expect(resolveThemes('afraid')).toEqual(['Courage']);
    expect(resolveThemes('anxious')).toEqual(['Anxiety']);
  });

  it('matches a whole phrase over its individual words ("worried about money")', () => {
    // The phrase wins (Worry, Money); the sub-words "worried"/"money" are not
    // matched again on top, so Anxiety/Provision don't leak in.
    expect(resolveThemes('worried about money')).toEqual(['Worry', 'Money']);
  });

  it('matches the theme vocabulary itself, case-insensitively', () => {
    expect(resolveThemes('GRIEF')).toEqual(['Grief']);
    expect(resolveThemes('loneliness')).toEqual(['Loneliness']);
  });

  it('matches whole words only, ignoring punctuation', () => {
    expect(resolveThemes('I feel afraid!')).toEqual(['Courage']);
  });

  it('returns nothing for a query with no theme words', () => {
    expect(resolveThemes('xyzzy')).toEqual([]);
  });
});

describe('searchQuery', () => {
  it('returns the known 4 passages for "worried about money" with an honest heading', () => {
    const r = searchQuery('worried about money');
    expect(r.kind).toBe('theme');
    expect(r.heading).toBe('4 passages on worry and money');
    expect(r.passages.map((p) => p.id)).toEqual([
      'philippians-4-6-7',
      'matthew-6-25-27',
      'first-timothy-6-6-8',
      'psalm-37-25',
    ]);
  });

  it('uses the singular in the heading for a single result', () => {
    const r = searchQuery('discipline');
    expect(r.heading).toBe('1 passage on discipline');
    expect(r.passages).toHaveLength(1);
  });

  it('treats a reference as a reference and resolves it', () => {
    const r = searchQuery('Psalm 31:24');
    expect(r.kind).toBe('reference');
    expect(r.heading).toBe('Psalm 31:24');
    expect(r.passages.map((p) => p.id)).toEqual(['psalm-31-24']);
  });

  it('returns no passages for a reference we do not carry', () => {
    const r = searchQuery('John 3');
    expect(r.kind).toBe('reference');
    expect(r.passages).toEqual([]);
  });

  it('returns no passages for unmatched free text', () => {
    const r = searchQuery('xyzzy');
    expect(r.kind).toBe('theme');
    expect(r.passages).toEqual([]);
    expect(r.heading).toBe('');
  });

  it('is empty for a blank query (the screen shows recent searches instead)', () => {
    expect(searchQuery('   ').passages).toEqual([]);
  });
});

// A bare book name is ambiguous — every one of these is also an ordinary
// English word (and "job" is one of our own onboarding situations). It must
// never resolve to the book silently: it shows a "Read the book of X" row
// AND the theme results together, never the reference alone.
describe('searchQuery — bare book names are ambiguous', () => {
  // [query, the book(s) the row offers] — "kings" is two books (1 & 2 Kings).
  const COLLISIONS: [string, string[]][] = [
    ['Job', ['Job']],
    ['acts', ['Acts']],
    ['mark', ['Mark']],
    ['james', ['James']],
    ['judges', ['Judges']],
    ['numbers', ['Numbers']],
    ['kings', ['1 Kings', '2 Kings']],
    ['song', ['Song of Songs']],
    ['revelation', ['Revelation']],
  ];

  it.each(COLLISIONS)('shows the book row and the theme results together for "%s"', (query, books) => {
    const r = searchQuery(query);

    // Never the reference alone: it runs the theme lookup, not a silent jump.
    expect(r.kind).toBe('theme');

    // The "Read the book of X" row(s) are pinned, one per candidate book.
    expect(r.references?.map((row) => row.book)).toEqual(books);
    expect(r.references?.map((row) => row.label)).toEqual(books.map((b) => `Read the book of ${b}`));

    // And the theme results sit alongside — exactly what the word maps to
    // (the row is never in place of them).
    expect(r.passages).toEqual(passagesForThemes(resolveThemes(query)));
  });

  it('"job" reaches the New job passages, not the Book of Job', () => {
    const r = searchQuery('job');
    expect(r.references?.map((row) => row.book)).toEqual(['Job']);
    expect(r.themes).toEqual(['New job']);
    expect(r.passages.map((p) => p.id)).toEqual(['psalm-31-24', 'joshua-1-9']);
    expect(r.passages.length).toBeGreaterThan(0);
  });

  it('a reference WITH a chapter still resolves straight through (unambiguous)', () => {
    const r = searchQuery('Job 3');
    expect(r.kind).toBe('reference');
    expect(r.references).toBeUndefined();
  });
});

describe('rowTag', () => {
  it('shows the matched theme when the passage carries one', () => {
    const matthew = getPassageById('matthew-6-25-27')!;
    expect(rowTag(matthew, ['Money'])).toBe('Money');
  });

  it('falls back to the passage’s first tag when none matched', () => {
    const matthew = getPassageById('matthew-6-25-27')!;
    expect(rowTag(matthew, [])).toBe(matthew.themeTags[0]);
  });
});
