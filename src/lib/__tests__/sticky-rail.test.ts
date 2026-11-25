import { stickyRailRanges, stickyRailTop, type StickyRailLayout } from '@/lib/sticky-rail';

// railTop = min( max(restTop, s + stickInset), passageHeight - railHeight - bottomInset )
// where restTop = (feedAreaHeight - railHeight) / 2 and s is how far the passage's
// top has scrolled above the top of the feed area (negative while it is still
// arriving from below). Offsets are from the top of the passage.

const BASE = { feedAreaHeight: 600, railHeight: 356, stickInset: 16, bottomInset: 24 };
const REST_TOP = (600 - 356) / 2; // 122

const at = (layout: StickyRailLayout, s: number) => stickyRailTop({ ...layout, s });

describe('stickyRailTop', () => {
  it('a passage shorter than the feed area keeps its rail centred and never sticks', () => {
    // The page is padded to the feed area, so it can't be scrolled within:
    // arriving from below and at rest, the rail is centred in the feed area.
    const short = { ...BASE, passageHeight: 600 };
    for (const s of [-600, -300, -1, 0]) {
      expect(at(short, s)).toBe(REST_TOP);
      expect(at(short, s)).not.toBe(s + BASE.stickInset);
    }
  });

  it('a passage just taller than the feed area rises with its text and never reaches the stick point', () => {
    // 50pt of overflow: every resting position (s = 0..50) keeps the rail at
    // restTop within the passage, so on screen it rises with the verse.
    const justTaller = { ...BASE, passageHeight: 650 };
    for (const s of [0, 10, 25, 50]) {
      expect(at(justTaller, s)).toBe(REST_TOP);
      expect(at(justTaller, s) - s).toBe(REST_TOP - s); // on-screen top
    }
  });

  describe('a very tall passage', () => {
    const tall = { ...BASE, passageHeight: 2000 };
    const release = 2000 - 356 - 24; // 1620: the rail's bottom on the passage's bottom inset

    it('starts centred when the passage arrives', () => {
      expect(at(tall, -200)).toBe(REST_TOP);
      expect(at(tall, 0)).toBe(REST_TOP);
    });

    it('sticks once its top reaches the inset below the feed area top, then holds', () => {
      const stickAt = REST_TOP - BASE.stickInset; // s = 106
      expect(at(tall, stickAt)).toBe(REST_TOP);
      for (const s of [200, 700, 1400]) {
        expect(at(tall, s)).toBe(s + BASE.stickInset);
        expect(at(tall, s) - s).toBe(BASE.stickInset); // held on screen
      }
    });

    it('releases at the passage bottom and rides out of view with it', () => {
      expect(at(tall, release - BASE.stickInset)).toBe(release);
      for (const s of [1700, 1900, 2000]) {
        expect(at(tall, s)).toBe(release);
        expect(at(tall, s) - s).toBeLessThan(BASE.stickInset); // leaving with the passage
      }
    });

    it('never puts the rail below its own passage', () => {
      for (let s = -600; s <= 2600; s += 37) {
        expect(at(tall, s) + BASE.railHeight).toBeLessThanOrEqual(2000 - BASE.bottomInset);
      }
    });
  });

  it('lets the clamp win when the passage is too short to hold the rail below restTop', () => {
    // A feed area barely taller than the rail (largest text size on a small
    // phone): passageHeight - railHeight - bottomInset (20) < restTop (22).
    const cramped = { feedAreaHeight: 400, railHeight: 356, stickInset: 16, bottomInset: 24, passageHeight: 400 };
    const clamp = 400 - 356 - 24;
    expect(clamp).toBeLessThan((400 - 356) / 2);
    for (const s of [-400, 0, 3, 50, 300, 400]) {
      expect(at(cramped, s)).toBe(clamp);
      expect(at(cramped, s)).toBeGreaterThanOrEqual(0); // not above the passage
      expect(at(cramped, s) + cramped.railHeight).toBeLessThanOrEqual(400 - cramped.bottomInset);
    }
  });
});

// The rail is animated with an interpolation built from the formula's
// breakpoints. Linear interpolation of those ranges (clamped at both ends) must
// reproduce the formula exactly, on every platform.
describe('stickyRailRanges', () => {
  const interpolate = ({ inputRange, outputRange }: { inputRange: number[]; outputRange: number[] }, s: number) => {
    if (s <= inputRange[0]) return outputRange[0];
    const last = inputRange.length - 1;
    if (s >= inputRange[last]) return outputRange[last];
    for (let i = 0; i < last; i++) {
      const [a, b] = [inputRange[i], inputRange[i + 1]];
      if (s >= a && s <= b) return outputRange[i] + ((s - a) / (b - a)) * (outputRange[i + 1] - outputRange[i]);
    }
    throw new Error('unreachable');
  };

  const layouts: [string, StickyRailLayout][] = [
    ['short', { ...BASE, passageHeight: 600 }],
    ['just taller', { ...BASE, passageHeight: 650 }],
    ['very tall', { ...BASE, passageHeight: 2000 }],
    ['cramped', { feedAreaHeight: 400, railHeight: 356, stickInset: 16, bottomInset: 24, passageHeight: 400 }],
  ];

  it.each(layouts)('matches the formula at every scroll position (%s)', (_name, layout) => {
    const ranges = stickyRailRanges(layout);
    expect(ranges.inputRange.length).toBe(ranges.outputRange.length);
    for (let i = 1; i < ranges.inputRange.length; i++) {
      expect(ranges.inputRange[i]).toBeGreaterThan(ranges.inputRange[i - 1]); // Animated needs increasing input
    }
    for (let s = -800; s <= 2800; s += 13) {
      expect(interpolate(ranges, s)).toBeCloseTo(at(layout, s), 6);
    }
  });
});
