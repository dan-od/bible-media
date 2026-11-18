import {
  EMPTY_COLLECTION,
  engagedThemes,
  getNote,
  isSaved,
  isStarred,
  notedIds,
  parseCollection,
  recordEngagement,
  removeNote,
  savedIds,
  setNote,
  toggleSave,
  toggleStar,
  type Collection,
} from '@/data/collection';

describe('collection toggles', () => {
  it('stars and un-stars a passage', () => {
    let c = toggleStar(EMPTY_COLLECTION, 'psalm-31-24');
    expect(isStarred(c, 'psalm-31-24')).toBe(true);
    c = toggleStar(c, 'psalm-31-24');
    expect(isStarred(c, 'psalm-31-24')).toBe(false);
  });

  it('saves and un-saves a passage', () => {
    let c = toggleSave(EMPTY_COLLECTION, 'joshua-1-9');
    expect(isSaved(c, 'joshua-1-9')).toBe(true);
    c = toggleSave(c, 'joshua-1-9');
    expect(isSaved(c, 'joshua-1-9')).toBe(false);
  });

  it('does not mutate the input collection', () => {
    const before = EMPTY_COLLECTION;
    toggleStar(before, 'x');
    expect(before.starred).toEqual([]);
  });

  it('lists saved ids most-recent-first', () => {
    let c = toggleSave(EMPTY_COLLECTION, 'a');
    c = toggleSave(c, 'b');
    expect(savedIds(c)).toEqual(['b', 'a']);
  });
});

describe('collection notes', () => {
  it('writes and reads a note, defaulting to private', () => {
    const c = setNote(EMPTY_COLLECTION, 'john-15-5', 'Apart from Him, nothing.', 'private', 100);
    expect(getNote(c, 'john-15-5')).toEqual({
      body: 'Apart from Him, nothing.',
      visibility: 'private',
      updatedAt: 100,
    });
  });

  it('an empty or whitespace body removes the note', () => {
    let c = setNote(EMPTY_COLLECTION, 'john-15-5', 'something', 'private', 1);
    c = setNote(c, 'john-15-5', '   ', 'private', 2);
    expect(getNote(c, 'john-15-5')).toBeUndefined();
  });

  it('removeNote is a no-op when there is no note', () => {
    expect(removeNote(EMPTY_COLLECTION, 'nope')).toEqual(EMPTY_COLLECTION);
  });

  it('orders notes most-recently-edited first', () => {
    let c = setNote(EMPTY_COLLECTION, 'a', 'first', 'private', 10);
    c = setNote(c, 'b', 'second', 'private', 30);
    c = setNote(c, 'c', 'third', 'private', 20);
    expect(notedIds(c)).toEqual(['b', 'c', 'a']);
  });
});

describe('engaged themes', () => {
  it('tallies engaged themes and counts a passage’s theme once per open', () => {
    let c = recordEngagement(EMPTY_COLLECTION, ['Worry', 'Money']);
    c = recordEngagement(c, ['Worry', 'Worry']); // one open, duplicate in the list
    expect(c.engaged).toEqual({ Worry: 2, Money: 1 });
  });

  it('orders engaged themes most-engaged first', () => {
    let c = recordEngagement(EMPTY_COLLECTION, ['Hope']);
    c = recordEngagement(c, ['Worry']);
    c = recordEngagement(c, ['Worry']);
    expect(engagedThemes(c)).toEqual(['Worry', 'Hope']);
  });

  it('is a no-op for an empty theme list and does not mutate the input', () => {
    const before = EMPTY_COLLECTION;
    expect(recordEngagement(before, [])).toBe(before);
    recordEngagement({ ...EMPTY_COLLECTION, engaged: { Worry: 1 } }, ['Worry']);
    expect(before.engaged).toEqual({});
  });
});

describe('parseCollection', () => {
  it('returns empty for null or garbage', () => {
    expect(parseCollection(null)).toEqual(EMPTY_COLLECTION);
    expect(parseCollection('not json')).toEqual(EMPTY_COLLECTION);
    expect(parseCollection('42')).toEqual(EMPTY_COLLECTION);
  });

  it('parses an engaged tally, dropping non-positive or non-numeric values', () => {
    const raw = JSON.stringify({ engaged: { Worry: 3, Hope: 0, Grief: -1, Peace: 'x' } });
    expect(parseCollection(raw).engaged).toEqual({ Worry: 3 });
  });

  it('round-trips a real collection', () => {
    const c: Collection = {
      starred: ['a'],
      saved: ['b', 'c'],
      notes: { b: { body: 'note', visibility: 'circle', updatedAt: 5 } },
      engaged: { Worry: 3 },
    };
    expect(parseCollection(JSON.stringify(c))).toEqual(c);
  });

  it('drops malformed entries and blank notes', () => {
    const raw = JSON.stringify({
      starred: ['a', 7, 'a'],
      saved: 'nope',
      notes: { x: { body: '   ', visibility: 'private' }, y: { body: 'keep' } },
    });
    const c = parseCollection(raw);
    expect(c.starred).toEqual(['a']);
    expect(c.saved).toEqual([]);
    expect(getNote(c, 'x')).toBeUndefined();
    expect(getNote(c, 'y')).toEqual({ body: 'keep', visibility: 'private', updatedAt: 0 });
  });

  it('forgets ids that are not in the valid set', () => {
    const raw = JSON.stringify({
      starred: ['real', 'gone'],
      saved: ['gone'],
      notes: { gone: { body: 'x', visibility: 'private', updatedAt: 1 } },
    });
    const c = parseCollection(raw, ['real']);
    expect(c.starred).toEqual(['real']);
    expect(c.saved).toEqual([]);
    expect(c.notes).toEqual({});
  });
});
