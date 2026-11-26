/**
 * A geometric model of the feed, for tests that need heights React Native's
 * test renderer can't give (it does no layout). Line breaking is modelled with
 * the real advance widths of the embedded fonts (jest/font-metrics); the boxes,
 * paddings and gaps mirror FeedCard, VerseBlock, FeedHeader and the tab bar.
 * It is a model, not a device: it errs on the tall side (greedy wrapping, the
 * end row's two items on separate lines whenever they can't share one), and it
 * was checked against the iOS simulator (see the PR).
 *
 * Test-only.
 */
import { loadFont, type FontMetrics } from './font-metrics';
import { MinTapTarget, Spacing } from '@/constants/theme';
import type { Passage, PassageText } from '@/data/types';
import { lineBreakUnits } from '@/data/scripture-words';
import { VERSE_FONT_SIZE, type VerseLayout } from '@/lib/verse-fit';

export interface Device {
  name: string;
  width: number;
  height: number;
  insetTop: number;
  insetBottom: number;
}

/** A 390pt iPhone (iPhone 17e) and the 375pt iPhone SE. */
export const DEVICES: Record<390 | 375, Device> = {
  390: { name: 'iPhone 17e', width: 390, height: 844, insetTop: 47, insetBottom: 34 },
  375: { name: 'iPhone SE', width: 375, height: 667, insetTop: 20, insetBottom: 0 },
};

/** The bottom tab bar's height above the home indicator (React Navigation's iOS default). */
const TAB_BAR = 49;

type Run = { text: string; font: FontMetrics; size: number; letterSpacing?: number };

const runWidth = ({ text, font, size, letterSpacing = 0 }: Run) =>
  font.width(text) * size + letterSpacing * [...text].length;

/** Lines needed to set `runs` (each an unbreakable unit) greedily in `width`. */
export function lineCount(runs: Run[], width: number): number {
  let lines = 1;
  let x = 0;
  for (const run of runs) {
    const w = runWidth(run);
    const space = run.font.width(' ') * run.size;
    if (x > 0 && x + space + w > width) {
      lines++;
      x = 0;
    }
    // A unit wider than the line would be broken mid-word; count the lines it takes.
    if (w > width) {
      lines += Math.ceil(w / width) - 1;
      x = w % width;
    } else x += (x > 0 ? space : 0) + w;
  }
  return lines;
}

const words = (text: string, font: FontMetrics, size: number, letterSpacing?: number): Run[] =>
  lineBreakUnits(text).map((t) => ({ text: t, font, size, letterSpacing }));

/** The height of the feed area between the header and the tab bar. */
export function feedViewport(device: Device, fontScale: number): number {
  const display = loadFont('serifDisplay');
  const sans = loadFont('sans');
  const wordmark = 28 * fontScale * display.lineHeight;
  const tab = Math.max(MinTapTarget, 15 * fontScale * sans.lineHeight);
  const header = Spacing.three + Math.max(wordmark, tab);
  return device.height - device.insetTop - header - TAB_BAR - device.insetBottom;
}

/** The end row: "Read Book N →" and, collapsed, the "Actions" control. */
export function endRowHeight(layout: VerseLayout, passage: Passage, fontScale: number): number {
  const medium = loadFont('sansMedium');
  const size = 14 * fontScale;
  const lh = medium.lineHeight * size;
  const arrow = 15 + Spacing.two;
  const label = `Read ${passage.book} ${passage.chapter}`;
  const readLines = lineCount(words(label, medium, size), layout.textWidth - arrow);
  const read = Math.max(MinTapTarget, readLines * lh);
  const readWidth = medium.width(label) * size + arrow;
  if (!layout.collapsed) return read + 2;

  const actionsWidth = Spacing.four * 2 + layout.rail.icon + Spacing.two + medium.width('Actions') * size;
  const actions = Math.max(layout.rail.button, lh);
  const oneLine = readLines === 1 && readWidth + Spacing.four + actionsWidth <= layout.textWidth;
  return 2 + (oneLine ? Math.max(read, actions) : read + Spacing.two + actions);
}

/** Height of one passage's content (FeedCard's text section) at a layout. */
export function passageContentHeight(
  layout: VerseLayout,
  passage: Passage,
  text: PassageText,
  fontScale: number,
): number {
  const display = loadFont('serifDisplay');
  const serif = loadFont('serifText');
  const sans = loadFont('sans');
  const semi = loadFont('sansSemiBold');
  const width = layout.textWidth;

  const leadIn = text.leadIn ?? passage.text.KJV.leadIn;
  const leadInScale = layout.leadInSize / 17;
  const leadInLines = lineCount(
    [{ text: String(leadIn.number), font: semi, size: layout.leadInSize }, ...words(leadIn.text, serif, layout.leadInSize)],
    width,
  );
  const leadInHeight = leadInLines * 26 * leadInScale;

  const verseScale = layout.verseSize / VERSE_FONT_SIZE;
  const verseRuns = text.verses.flatMap((v) => [
    { text: String(v.number), font: semi, size: Math.round(VERSE_FONT_SIZE * 0.42) * verseScale },
    ...words(v.text, display, layout.verseSize),
  ]);
  const verseHeight = lineCount(verseRuns, width) * Math.round(VERSE_FONT_SIZE * 1.26) * verseScale;

  const refLine =
    lineCount(
      [
        ...words(passage.reference.toUpperCase(), semi, 11 * fontScale, 1.3),
        ...words('World English Bible', sans, 12 * fontScale),
      ],
      width,
    ) *
    semi.lineHeight *
    12 *
    fontScale;
  const why = lineCount(words('On a theme for what you are going through today', sans, 13 * fontScale), width) * 18 * fontScale;

  const gap = 20;
  return (
    Spacing.five * 2 +
    leadInHeight +
    gap +
    verseHeight +
    gap +
    (refLine + 9 + why) +
    gap +
    endRowHeight(layout, passage, fontScale)
  );
}
