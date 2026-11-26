import type { ChangeContext } from '@/data/claimable';
import {
  EMPTY_COLLECTION,
  editNote,
  engagedThemes,
  getNote,
  isSaved,
  isStarred,
  migrateLegacyCollection,
  noteList,
  parseCollection,
  parseLegacyCollection,
  recordEngagement,
  savedIds,
  setNote,
  toggleSave,
  toggleStar,
  viewFor,
  type Collection,
  type Note,
} from '@/data/collection';

let n = 0;
const id = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
const at = (now: number, owner: string | null = null): ChangeContext => ({ owner, now, newId: id });
const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';

describe('collection toggles', () => {
  it('stars and un-stars a passage', () => {
    let c = toggleStar(EMPTY_COLLECTION, 'psalm-31-24', at(1));
    expect(isStarred(c, 'psalm-31-24')).toBe(true);
    c = toggleStar(c, 'psalm-31-24', at(2));
    expect(isStarred(c, 'psalm-31-24')).toBe(false);
  });

  it('saves and un-saves a passage', () => {
    let c = toggleSave(EMPTY_COLLECTION, 'joshua-1-9', at(1));
    expect(isSaved(c, 'joshua-1-9')).toBe(true);
    c = toggleSave(c, 'joshua-1-9', at(2));
    expect(isSaved(c, 'joshua-1-9')).toBe(false);
  });

  it('gives every new record a client id, the time it was made, and its owner', () => {
    const c = toggleStar(EMPTY_COLLECTION, 'psalm-31-24', at(7, A));
    expect(c.stars[0]).toEqual({ clientId: expect.stringMatching(/^[0-9a-f-]{36}$/), owner: A, rev: 1, syncedRev: 0, passageId: 'psalm-31-24', createdAt: 7 });
  });

  it('does not mutate the input collection', () => {
    const before = EMPTY_COLLECTION;
    toggleStar(before, 'x', at(1));
    expect(before.stars).toEqual([]);
  });

  it('lists saved ids most-recent-first', () => {
    let c = toggleSave(EMPTY_COLLECTION, 'a', at(1));
    c = toggleSave(c, 'b', at(2));
    expect(savedIds(c)).toEqual(['b', 'a']);
  });

  it('remembers a claimed record it removes, so the server can forget it too', () => {
    let c = toggleStar(EMPTY_COLLECTION, 'psalm-31-24', at(1, A));
    const clientId = c.stars[0].clientId;
    c = toggleStar(c, 'psalm-31-24', at(2, A));
    expect(c.removed).toEqual([{ kind: 'star', clientId, owner: A, passageId: 'psalm-31-24' }]);
  });

  it('forgets an unclaimed record without a trace', () => {
    let c = toggleStar(EMPTY_COLLECTION, 'psalm-31-24', at(1));
    c = toggleStar(c, 'psalm-31-24', at(2));
    expect(c.removed).toEqual([]);
  });

  it('never touches another account’s records', () => {
    const c = toggleStar(EMPTY_COLLECTION, 'psalm-31-24', at(1, A));
    const asB = toggleStar(c, 'psalm-31-24', at(2, B));
    expect(asB.stars.map((r) => r.owner)).toEqual([A, B]);
    expect(isStarred(viewFor(asB, B), 'psalm-31-24')).toBe(true);
    expect(viewFor(asB, null).stars).toEqual([]);
  });
});

describe('collection notes', () => {
  it('writes and reads a note', () => {
    const c = setNote(EMPTY_COLLECTION, 'john-15-5', 'Apart from Him, nothing.', 'private', at(100));
    expect(getNote(c, 'john-15-5')).toMatchObject({ body: 'Apart from Him, nothing.', visibility: 'private', updatedAt: 100, createdAt: 100 });
  });

  it('an edit keeps the id and bumps the version', () => {
    let c = setNote(EMPTY_COLLECTION, 'john-15-5', 'one', 'private', at(1));
    const before = c.notes[0];
    c = setNote(c, 'john-15-5', 'two', 'circle', at(2));
    expect(c.notes).toHaveLength(1);
    expect(c.notes[0]).toMatchObject({ clientId: before.clientId, rev: 2, body: 'two', visibility: 'circle', updatedAt: 2, createdAt: 1 });
  });

  it('an empty or whitespace body removes the note', () => {
    let c = setNote(EMPTY_COLLECTION, 'john-15-5', 'something', 'private', at(1));
    c = setNote(c, 'john-15-5', '   ', 'private', at(2));
    expect(getNote(c, 'john-15-5')).toBeUndefined();
  });

  it('an empty body with no note is a no-op', () => {
    expect(setNote(EMPTY_COLLECTION, 'john-15-5', ' ', 'private', at(1))).toBe(EMPTY_COLLECTION);
  });

  it('keeps two notes on one passage apart; the sheet edits the latest', () => {
    const older: Note = { clientId: id(), owner: A, rev: 1, syncedRev: 1, passageId: 'p', body: 'from the other phone', visibility: 'private', createdAt: 1, updatedAt: 1 };
    let c: Collection = { ...EMPTY_COLLECTION, notes: [older] };
    c = { ...c, notes: [...c.notes, { ...older, clientId: id(), body: 'from this phone', updatedAt: 5 }] };
    expect(getNote(c, 'p')!.body).toBe('from this phone');
    c = setNote(c, 'p', 'edited', 'private', at(9, A));
    expect(noteList(c).map((x) => x.body)).toEqual(['edited', 'from the other phone']);
    c = editNote(c, older.clientId, 'edited too', 'circle', at(10, A));
    expect(noteList(c).map((x) => x.body)).toEqual(['edited too', 'edited']);
  });

  it('orders notes most-recently-edited first', () => {
    let c = setNote(EMPTY_COLLECTION, 'a', 'first', 'private', at(10));
    c = setNote(c, 'b', 'second', 'private', at(30));
    c = setNote(c, 'c', 'third', 'private', at(20));
    expect(noteList(c).map((x) => x.passageId)).toEqual(['b', 'c', 'a']);
  });
});

describe('engaged themes', () => {
  it('tallies engaged themes and counts a passage’s theme once per open', () => {
    let c = recordEngagement(EMPTY_COLLECTION, ['Worry', 'Money']);
    c = recordEngagement(c, ['Worry', 'Worry']);
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

describe('parseCollection (v2)', () => {
  it('returns empty for null or garbage', () => {
    expect(parseCollection(null)).toEqual(EMPTY_COLLECTION);
    expect(parseCollection('not json')).toEqual(EMPTY_COLLECTION);
    expect(parseCollection('42')).toEqual(EMPTY_COLLECTION);
  });

  it('round-trips a collection', () => {
    let c = toggleStar(EMPTY_COLLECTION, 'a', at(1, A));
    c = toggleSave(c, 'b', at(2));
    c = setNote(c, 'b', 'note', 'circle', at(3));
    c = toggleStar(c, 'a', at(4, A));
    c = recordEngagement(c, ['Worry']);
    expect(parseCollection(JSON.stringify(c))).toEqual(c);
  });

  it('drops records without a usable client id, duplicate ids, blank notes and unknown passages', () => {
    const good = { clientId: id(), owner: null, rev: 1, syncedRev: 0, passageId: 'real', createdAt: 1 };
    const raw = JSON.stringify({
      stars: [good, { ...good }, { ...good, clientId: 'nope' }, { ...good, clientId: id(), passageId: 'gone' }],
      notes: [{ ...good, clientId: id(), body: '  ' }],
      engaged: { Worry: 3, Hope: 0, Peace: 'x' },
    });
    const c = parseCollection(raw, ['real']);
    expect(c.stars).toEqual([good]);
    expect(c.notes).toEqual([]);
    expect(c.engaged).toEqual({ Worry: 3 });
  });
});

describe('the pre-step-7 collection', () => {
  const v1 = {
    starred: ['a', 'b', 'c'],
    saved: ['b'],
    notes: { a: { body: 'kept', visibility: 'circle', updatedAt: 50 }, b: { body: 'no time' } },
    engaged: { Worry: 2 },
  };

  it('parses defensively, as before', () => {
    const raw = JSON.stringify({ starred: ['a', 7, 'a'], saved: 'nope', notes: { x: { body: '   ' }, y: { body: 'keep' } } });
    expect(parseLegacyCollection(raw)).toEqual({ starred: ['a'], saved: [], notes: { y: { body: 'keep', visibility: 'private', updatedAt: 0 } }, engaged: {} });
    expect(parseLegacyCollection('garbage')).toBeNull();
  });

  it('migrates every record, giving each a distinct id and no owner, keeping order and content', () => {
    const c = migrateLegacyCollection(parseLegacyCollection(JSON.stringify(v1))!, { now: 1000, newId: id });
    expect(c.stars.map((r) => r.passageId)).toEqual(['a', 'b', 'c']);
    expect(savedIds(c)).toEqual(['b']);
    // Order survives: most recent last, as v1 kept it.
    expect(c.stars.map((r) => r.createdAt)).toEqual([998, 999, 1000]);
    expect(getNote(c, 'a')).toMatchObject({ body: 'kept', visibility: 'circle', updatedAt: 50, createdAt: 50 });
    expect(getNote(c, 'b')).toMatchObject({ body: 'no time', visibility: 'private', createdAt: 1000 });
    expect(c.engaged).toEqual({ Worry: 2 });
    const all = [...c.stars, ...c.saves, ...c.notes];
    expect(new Set(all.map((r) => r.clientId)).size).toBe(all.length);
    expect(all.every((r) => r.owner === null && r.rev === 1 && r.syncedRev === 0)).toBe(true);
  });
});
