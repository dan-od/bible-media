import { pageSnapOffsets } from '@/lib/snap';

describe('pageSnapOffsets', () => {
  it('snaps to the start of each page when every page fits the screen', () => {
    expect(pageSnapOffsets([600, 600, 600], 600)).toEqual([0, 600, 1200]);
  });

  // At the largest text sizes a passage can be taller than the screen. Fixed
  // paging would then cut through every later page; snapping to measured starts
  // keeps each following page aligned.
  it('keeps later pages aligned after a page taller than the screen', () => {
    const offsets = pageSnapOffsets([600, 900, 600], 600);
    expect(offsets).toContain(600); // start of the tall page
    expect(offsets).toContain(1500); // the next page starts flush, not at 1200
  });

  // iOS rests on the next snap point past where the finger lets go, so a single
  // "bottom of page" stop a few points down gets skipped by any normal swipe —
  // the rail's last actions would be unreachable. Instead a tall page scrolls
  // freely (a fine grid of rest points) and only page starts are hard stops.
  describe('a page taller than the screen', () => {
    // Page 2 runs 600..2000 (1400 tall); its bottom meets the screen's at 1400.
    const offsets = pageSnapOffsets([600, 1400, 600], 600);

    it('can come to rest anywhere within it, including flush with its bottom', () => {
      expect(offsets).toContain(600); // its start
      expect(offsets).toContain(1000); // part-way through
      expect(offsets).toContain(1400); // its bottom at the bottom of the screen
      const inside = offsets.filter((o) => o > 600 && o < 1400);
      expect(Math.max(...inside.map((o, i) => o - (inside[i - 1] ?? 600)))).toBeLessThanOrEqual(8);
    });

    it('has no rest point in its last screen, so swiping past its bottom reaches the next page', () => {
      expect(offsets.filter((o) => o > 1400 && o < 2000)).toEqual([]);
      expect(offsets).toContain(2000);
    });
  });

  it('ignores sub-pixel overflow from layout rounding', () => {
    expect(pageSnapOffsets([600, 600.4, 600], 600)).toEqual([0, 600, 1200]);
  });

  it('returns nothing until the screen height is known', () => {
    expect(pageSnapOffsets([600, 600], 0)).toEqual([]);
  });
});
