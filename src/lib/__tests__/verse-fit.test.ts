import { loadFont } from '../../../jest/font-metrics';
import { lineBreakUnits, scriptureWords } from '@/data/scripture-words';
import { getPassages } from '@/data/verseStore';
import {
  LEAD_IN_FONT_SIZE,
  SYSTEM_TEXT_SIZES,
  VERSE_FONT_SIZE,
  verseCeiling,
  verseLayout,
} from '@/lib/verse-fit';

// The reading column at every system text size: the verse grows with the text
// size until its longest word just fits the full width (the ceiling), and the
// seven-icon rail gives way to an end-of-passage control when the column beside
// it would be too narrow for that word. Widths here come from the embedded font
// files, not from the committed word-metrics.json, so a stale file shows up too.

const PHONES = [390, 375] as const;
const display = loadFont('serifDisplay');
const text = loadFont('serifText');

/** iOS's largest title size at AX5 (Large Title, 34pt at the default size). */
const IOS_AX5_TITLE = 60;

describe('the ceiling', () => {
  it(`never falls below iOS's largest title size (${IOS_AX5_TITLE}pt) on a 390pt screen`, () => {
    const ceiling = verseCeiling(390, Math.max(...SYSTEM_TEXT_SIZES.map((s) => s.scale))).verse;
    // Name every word that would pull the ceiling under the floor, so the
    // trade-off is decided per word, never by quietly shrinking every verse.
    const column = 390 - 2 * 24;
    const offenders = scriptureWords(getPassages())
      .verse.map((word) => ({ word, needs: Math.ceil(display.width(word) * IOS_AX5_TITLE) }))
      .filter((w) => w.needs * 1.02 > column)
      .map((w) => `"${w.word}" needs ${w.needs}pt at ${IOS_AX5_TITLE}pt`);
    expect(offenders).toEqual([]);
    expect(ceiling).toBeGreaterThanOrEqual(IOS_AX5_TITLE);
  });

  it('lets the verse grow linearly with the system size until the ceiling', () => {
    for (const { scale } of SYSTEM_TEXT_SIZES) {
      const layout = verseLayout({ windowWidth: 390, fontScale: scale });
      const linear = VERSE_FONT_SIZE * scale;
      const ceiling = verseCeiling(390, scale).verse;
      expect(layout.verseSize).toBeCloseTo(Math.min(linear, ceiling), 5);
    }
    // Default size is untouched.
    expect(verseLayout({ windowWidth: 390, fontScale: 1 }).verseSize).toBe(VERSE_FONT_SIZE);
  });

  it('rises with the screen width', () => {
    expect(verseCeiling(768, 3.571).verse).toBeGreaterThan(verseCeiling(390, 3.571).verse);
    expect(verseCeiling(390, 3.571).verse).toBeGreaterThan(verseCeiling(375, 3.571).verse);
  });
});

describe.each(PHONES)('on a %spt screen', (windowWidth) => {
  // Every passage, every translation, every system size: no run between spaces
  // is wider than the column it is set in, so nothing can break mid-word.
  it.each(SYSTEM_TEXT_SIZES.map((s) => [s.name, s.scale] as const))(
    'breaks no word mid-word at %s (%sx)',
    (_name, fontScale) => {
      const layout = verseLayout({ windowWidth, fontScale });
      const tooWide: string[] = [];
      for (const passage of getPassages()) {
        for (const [translation, t] of Object.entries(passage.text)) {
          if (!t) continue;
          for (const v of t.verses) {
            for (const word of lineBreakUnits(v.text)) {
              const w = display.width(word) * layout.verseSize;
              if (w > layout.textWidth) tooWide.push(`${passage.reference} ${translation} "${word}" ${w.toFixed(0)}pt`);
            }
          }
          for (const word of lineBreakUnits((t.leadIn ?? passage.text.KJV.leadIn).text)) {
            const w = text.width(word) * layout.leadInSize;
            if (w > layout.textWidth) tooWide.push(`${passage.reference} ${translation} lead-in "${word}" ${w.toFixed(0)}pt`);
          }
        }
      }
      expect({ column: Math.round(layout.textWidth), tooWide }).toEqual({
        column: Math.round(layout.textWidth),
        tooWide: [],
      });
    },
  );

  it('collapses the rail at a measured breakpoint, and stays collapsed above it', () => {
    const states = SYSTEM_TEXT_SIZES.map((s) => verseLayout({ windowWidth, fontScale: s.scale }).collapsed);
    const first = states.indexOf(true);
    expect(first).toBeGreaterThan(0); // the default sizes keep the rail
    expect(states.slice(first).every(Boolean)).toBe(true);
    expect(states.slice(0, first).some(Boolean)).toBe(false);
  });

  it('collapses exactly when the column beside the rail is too narrow for the longest word', () => {
    for (const { scale } of SYSTEM_TEXT_SIZES) {
      const layout = verseLayout({ windowWidth, fontScale: scale });
      const besideRail = Math.min(windowWidth - 48, 34 * 16 * scale + layout.lane) - layout.lane;
      const longest = Math.max(
        Math.max(...scriptureWords(getPassages()).verse.map((w) => display.width(w))) * layout.verseSize,
        Math.max(...scriptureWords(getPassages()).leadIn.map((w) => text.width(w))) * layout.leadInSize,
      );
      expect(layout.collapsed).toBe(besideRail < longest * 1.02);
      expect(layout.textWidth).toBe(layout.collapsed ? windowWidth - 48 : besideRail);
    }
  });
});

it('derives the breakpoint from the words, not from a named size', () => {
  const at = (verseEm: number) =>
    SYSTEM_TEXT_SIZES.findIndex(
      (s) =>
        verseLayout({
          windowWidth: 390,
          fontScale: s.scale,
          metrics: { verse: { word: 'x', em: verseEm }, leadIn: { word: 'x', em: 1 } },
        }).collapsed,
    );
  // A library of shorter words keeps the rail to a larger size.
  expect(at(3)).toBeGreaterThan(at(5.372));
  expect(at(5.372)).toBeGreaterThan(at(8));
});

it('keeps the rail while the window is unmeasured (web server rendering reports width 0)', () => {
  const layout = verseLayout({ windowWidth: 0, fontScale: 1 });
  expect(layout.collapsed).toBe(false);
  expect(layout.verseSize).toBe(VERSE_FONT_SIZE);
});

it('scales the lead-in linearly until its own ceiling, from the same measurement', () => {
  for (const { scale } of SYSTEM_TEXT_SIZES) {
    const layout = verseLayout({ windowWidth: 390, fontScale: scale });
    expect(layout.leadInSize).toBeCloseTo(Math.min(LEAD_IN_FONT_SIZE * scale, verseCeiling(390, scale).leadIn), 5);
  }
});
