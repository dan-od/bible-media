import { buildFeed } from '@/data/feed';
import { getPassages } from '@/data/verseStore';

describe('buildFeed', () => {
  it('includes every passage exactly once', () => {
    const feed = buildFeed(['New job']);
    const ids = feed.map((i) => i.passage.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(getPassages().length);
  });

  it('leads with passages that match the situations', () => {
    const feed = buildFeed(['New job']);
    expect(feed[0].reason).not.toBeNull();
    expect(feed[0].passage.themeTags).toContain('New job');
    // the first unmatched item comes after every matched one
    const firstUnmatched = feed.findIndex((i) => i.reason === null);
    const lastMatched = feed.map((i) => i.reason !== null).lastIndexOf(true);
    expect(lastMatched).toBeLessThan(firstUnmatched);
  });

  it('cites the situation and a different theme in the reason', () => {
    const feed = buildFeed(['New job']);
    const psalm = feed.find((i) => i.passage.id === 'psalm-31-24')!;
    expect(psalm.reason?.situation).toBe('New job');
    expect(psalm.reason?.theme).not.toBe('New job');
    expect(psalm.passage.themeTags).toContain(psalm.reason?.theme);
  });

  it('is deterministic for the same input', () => {
    const a = buildFeed(['Money', 'Grief']).map((i) => i.passage.id);
    const b = buildFeed(['Money', 'Grief']).map((i) => i.passage.id);
    expect(a).toEqual(b);
  });

  it('returns the full seed order with no reason when no situations are given', () => {
    const feed = buildFeed([]);
    expect(feed.every((i) => i.reason === null)).toBe(true);
    expect(feed.map((i) => i.passage.id)).toEqual(getPassages().map((p) => p.id));
  });

  it('puts a passage that speaks to more of the situations first', () => {
    // Psalm 34:18 carries both Grief and Loneliness; it leads even though
    // Lamentations 3 comes before it in the library.
    const ids = buildFeed(['Grief', 'Loneliness']).map((i) => i.passage.id);
    expect(ids[0]).toBe('psalm-34-18');
    expect(ids.slice(0, 3)).toEqual(['psalm-34-18', 'lamentations-3-22-23', 'deuteronomy-31-6']);
  });

  // "What you open from here shapes your feed" — search engagement orders the
  // rest of the feed. Situations still lead; engagement never adds a reason.
  describe('with engaged themes from search', () => {
    it('brings passages on engaged themes up, right after the situation matches', () => {
      const feed = buildFeed(['Discipline'], ['Money']);
      const ids = feed.map((i) => i.passage.id);
      expect(ids[0]).toBe('hebrews-12-11'); // the situation match still leads
      // then every Money passage, in library order, before anything else
      expect(ids.slice(1, 4)).toEqual(['matthew-6-25-27', 'first-timothy-6-6-8', 'psalm-37-25']);
    });

    it('orders by the most-engaged theme first', () => {
      const ids = buildFeed([], ['Discipline', 'Money']).map((i) => i.passage.id);
      expect(ids[0]).toBe('hebrews-12-11');
      expect(ids.slice(1, 4)).toEqual(['matthew-6-25-27', 'first-timothy-6-6-8', 'psalm-37-25']);
    });

    it('gives engaged passages no "why" line — only situations explain a verse', () => {
      const feed = buildFeed([], ['Money']);
      expect(feed.every((i) => i.reason === null)).toBe(true);
    });

    it('still includes every passage exactly once', () => {
      const ids = buildFeed(['Grief'], ['Money', 'Grief']).map((i) => i.passage.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length).toBe(getPassages().length);
    });
  });
});
