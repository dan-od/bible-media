import {
  clearHistory,
  EMPTY_HISTORY,
  MAX_HISTORY,
  parseHistory,
  recordSearch,
  removeSearch,
} from '@/data/search-history';

describe('recordSearch', () => {
  it('adds a search to the top, most recent first', () => {
    let h = recordSearch(EMPTY_HISTORY, 'forgiveness');
    h = recordSearch(h, 'John 3');
    expect(h.entries).toEqual(['John 3', 'forgiveness']);
  });

  it('moves a repeated search to the top instead of duplicating', () => {
    let h = recordSearch(EMPTY_HISTORY, 'hope');
    h = recordSearch(h, 'grief');
    h = recordSearch(h, 'HOPE'); // same term, different case
    expect(h.entries).toEqual(['HOPE', 'grief']);
  });

  it('ignores a blank query', () => {
    expect(recordSearch(EMPTY_HISTORY, '   ')).toBe(EMPTY_HISTORY);
  });

  it('caps the history length', () => {
    let h = EMPTY_HISTORY;
    for (let i = 0; i < MAX_HISTORY + 5; i++) h = recordSearch(h, `q${i}`);
    expect(h.entries).toHaveLength(MAX_HISTORY);
    expect(h.entries[0]).toBe(`q${MAX_HISTORY + 4}`); // newest
  });

  // The Settings switch: off means nothing is written, not merely hidden.
  it('writes nothing when history is off (keep=false)', () => {
    const seeded = recordSearch(EMPTY_HISTORY, 'anxiety');
    const after = recordSearch(seeded, 'money', false);
    expect(after).toBe(seeded);
    expect(after.entries).toEqual(['anxiety']);
  });
});

describe('removeSearch', () => {
  it('removes one entry, matched case-insensitively', () => {
    let h = recordSearch(EMPTY_HISTORY, 'peace');
    h = recordSearch(h, 'courage');
    h = removeSearch(h, 'PEACE');
    expect(h.entries).toEqual(['courage']);
  });

  it('is a no-op when the entry is absent', () => {
    const h = recordSearch(EMPTY_HISTORY, 'peace');
    expect(removeSearch(h, 'nope').entries).toEqual(['peace']);
  });
});

describe('clearHistory', () => {
  it('empties the whole history', () => {
    const h = recordSearch(recordSearch(EMPTY_HISTORY, 'a'), 'b');
    expect(h.entries).toHaveLength(2);
    expect(clearHistory().entries).toEqual([]);
  });
});

describe('parseHistory', () => {
  it('returns empty for null or garbage', () => {
    expect(parseHistory(null)).toEqual(EMPTY_HISTORY);
    expect(parseHistory('not json')).toEqual(EMPTY_HISTORY);
    expect(parseHistory('42')).toEqual(EMPTY_HISTORY);
    expect(parseHistory(JSON.stringify({ entries: 'nope' }))).toEqual(EMPTY_HISTORY);
  });

  it('keeps strings, trims, drops blanks and dupes, and caps', () => {
    const raw = JSON.stringify({ entries: ['  hope  ', 'hope', 7, '', 'grief'] });
    expect(parseHistory(raw).entries).toEqual(['hope', 'grief']);
  });
});
