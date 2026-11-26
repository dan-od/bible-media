import { loadFont, type FONT_FILES } from '../../../jest/font-metrics';
import { SOFT_HYPHEN, sheetWords } from '@/data/scripture-words';
import { getPassages } from '@/data/verseStore';
import { SHEET_FLOOR_SCALE, SHEET_TYPE, sheetLayout } from '@/lib/sheet-fit';
import { ceilingFor, SYSTEM_TEXT_SIZES, verseCeiling, verseLayout } from '@/lib/verse-fit';

// The sheets use the feed's measured ceiling at their own, narrower widths. The
// floor guard is the same kind as the feed's, at a lower bar: every measured
// surface keeps growing linearly at least through iOS AX3 on a 390pt screen
// (titles: up to their 60pt cap). Why lower is recorded in lib/sheet-fit.
// Widths come from the font files here, not word-metrics.json.

const PHONES = [390, 375] as const;
const AX3 = SYSTEM_TEXT_SIZES.find((s) => s.name === 'iOS AX3')!.scale;
const AX5 = SYSTEM_TEXT_SIZES.find((s) => s.name === 'iOS AX5')!.scale;
const words = sheetWords(getPassages());

type Surface = keyof typeof SHEET_TYPE;
const FACES: Record<Surface, keyof typeof FONT_FILES> = {
  title: 'serifDisplay',
  compare: 'serifText',
  excerpt: 'serifTextItalic',
  context: 'serifText',
  reference: 'sans',
  readAll: 'sansSemiBold',
};
const SURFACES = Object.keys(FACES) as Surface[];

it('takes the floor from AX3', () => {
  expect(SHEET_FLOOR_SCALE).toBe(AX3);
});

describe.each(SURFACES)('%s', (surface) => {
  const font = loadFont(FACES[surface]);
  const { size, maxScale } = SHEET_TYPE[surface];
  const floor = Math.min(size * maxScale, size * SHEET_FLOOR_SCALE);

  it(`grows linearly through AX3 on a 390pt screen (at least ${floor.toFixed(1)}pt)`, () => {
    const width = sheetLayout({ windowWidth: 390, fontScale: AX5 })[surface].width;
    // Name every word that would pull the ceiling under the floor, so the
    // trade-off is decided per word, never by quietly shrinking the surface.
    const offenders = words[surface]
      .map((word) => ({ word, needs: font.width(word) * floor * 1.02 }))
      .filter((w) => w.needs > width)
      .map((w) => `"${w.word}" needs ${Math.ceil(w.needs)}pt of ${width}pt at ${floor.toFixed(1)}pt`);
    expect(offenders).toEqual([]);
    const widest = Math.max(...words[surface].map((w) => font.width(w)));
    expect(ceilingFor(width, widest)).toBeGreaterThanOrEqual(floor);
  });

  it.each(PHONES)('holds every word inside its width at every size on %spt', (windowWidth) => {
    for (const { scale } of SYSTEM_TEXT_SIZES) {
      const layout = sheetLayout({ windowWidth, fontScale: scale })[surface];
      const rendered = size * Math.min(scale, layout.maxMultiplier);
      expect(rendered).toBeLessThanOrEqual(size * maxScale + 1e-9);
      const tooWide = words[surface].filter((w) => font.width(w) * rendered > layout.width);
      expect({ scale, tooWide }).toEqual({ scale, tooWide: [] });
    }
  });
});

describe('titles', () => {
  it.each(PHONES)('grow linearly to their 60pt cap at every size on %spt, the close button moving above at the breakpoint', (windowWidth) => {
    for (const { scale } of SYSTEM_TEXT_SIZES) {
      const layout = sheetLayout({ windowWidth, fontScale: scale });
      expect(layout.accessible).toBe(verseLayout({ windowWidth, fontScale: scale }).collapsed);
      expect(layout.title.width).toBe(layout.accessible ? windowWidth - 48 : windowWidth - 48 - 44);
      // No measured ceiling bites before the cap: no title shrinks for a long word.
      const rendered = SHEET_TYPE.title.size * Math.min(scale, layout.title.maxMultiplier);
      expect(rendered).toBeCloseTo(Math.min(30 * scale, 60), 9);
    }
  });
});

it('uses the same measurement as the feed, at the width it is given', () => {
  // The feed's verse ceiling is ceilingFor at the feed's full column.
  const metrics = { verse: { word: 'x', em: 5 }, leadIn: { word: 'y', em: 7 } };
  expect(verseCeiling(390, 3.571, metrics)).toEqual({ verse: ceilingFor(342, 5), leadIn: ceilingFor(342, 7) });
  // A sheet's compare rows are the sheet's inset body.
  const layout = sheetLayout({ windowWidth: 390, fontScale: AX5 });
  expect(layout.compare.width).toBe(390 - 48);
});

it('keeps soft hyphens out of Scripture (they are only for our own copy)', () => {
  for (const p of getPassages())
    for (const t of Object.values(p.text)) {
      if (!t) continue;
      for (const v of [t.leadIn, ...t.verses]) if (v) expect(v.text.includes(SOFT_HYPHEN)).toBe(false);
    }
});

it('keeps the default layout while the window is unmeasured (web server rendering)', () => {
  const layout = sheetLayout({ windowWidth: 0, fontScale: 1 });
  expect(layout.accessible).toBe(false);
  expect(layout.compare.maxMultiplier).toBe(1);
});
