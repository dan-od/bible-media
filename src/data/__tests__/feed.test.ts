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
});
