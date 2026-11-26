/**
 * The sheets (compare, context, note, actions) at any screen width and system
 * text size, by the feed's rule: no word breaks mid-word. Each measured surface
 * grows linearly with the text size until its widest word (data/word-metrics
 * .json) just fits the width it is set in, and holds there — ceilingFor from
 * lib/verse-fit, given the sheet's own width.
 *
 * Why the sheets sit below the feed. A sheet is inset (24pt each side, and a
 * title shares its row with the close button below the breakpoint), so it can
 * never reach the width the feed gives a verse, and its ceilings come out
 * lower: the compare rows hold at about 48pt on a 390pt phone, where the feed's
 * verse reaches about 62pt. That is not an accessibility regression. The feed
 * is the escape hatch, and it meets the higher bar (no ceiling under iOS's 60pt
 * AX5 title): a reader at AX5 who finds a sheet tight can switch version or
 * close the sheet and read the passage full width. The sheet is a convenience
 * over a surface that already meets that bar. Its own floor guard (tests) is
 * linear growth through iOS AX3 on a 390pt screen; titles are capped at 60pt.
 *
 * The note body is deliberately not measured: it is the reader's own text, and
 * no library can describe words that haven't been typed yet (a pasted link, a
 * long name). It scales like ordinary UI text and may break; that is not the
 * defect this rule exists to prevent. The note's excerpt is Scripture, so it is
 * measured.
 *
 * At the accessibility sizes (the feed's measured breakpoint, so the whole app
 * changes layout at one size) the sheet's close button moves above the title so
 * the title has the full width, and side-by-side controls stack.
 */
import { MinTapTarget, Spacing } from '@/constants/theme';
import WORD_METRICS from '@/data/word-metrics.json';
import { ceilingFor, maxMultiplierFor, verseLayout } from '@/lib/verse-fit';

/** BottomSheet's horizontal padding. */
export const SHEET_PADDING = Spacing.five;
/** The close button beside the title. */
export const CLOSE_BUTTON = MinTapTarget;
/** The floor guard: every measured surface grows linearly at least through iOS AX3 (390pt). */
export const SHEET_FLOOR_SCALE = 2.643;

/** Each measured surface's size at the default text size, and its hard cap. */
export const SHEET_TYPE = {
  /** Sheet titles, display serif; capped at iOS's largest title (60pt). */
  title: { size: 30, lineHeight: 34, maxScale: 2 },
  /** Compare rows: the passage in each version, text serif. */
  compare: { size: 17, lineHeight: 26, maxScale: Infinity },
  /** The passage quoted above the note field, text serif italic. */
  excerpt: { size: 15, lineHeight: 22, maxScale: Infinity },
  /** Context cards' reviewed facts, text serif. */
  context: { size: 18, lineHeight: 27, maxScale: Infinity },
  /** The reference under the actions sheet's title, sans. */
  reference: { size: 15, lineHeight: undefined, maxScale: Infinity },
  /** The context sheet's "Read all of …" button, sans semibold. */
  readAll: { size: 15, lineHeight: undefined, maxScale: Infinity },
} as const;

type Surface = keyof typeof SHEET_TYPE;
type SheetMetrics = Record<Surface, { word: string; em: number }>;

export interface SurfaceFit {
  /** Width of the line the surface is set in, in points. */
  width: number;
  /** `maxFontSizeMultiplier` for its Text. */
  maxMultiplier: number;
}

export type SheetLayout = Record<Surface, SurfaceFit> & {
  /** At or above the breakpoint: close button above the title, controls stacked. */
  accessible: boolean;
  /** Width inside the sheet's padding. */
  bodyWidth: number;
  /** The scale the actions sheet sizes its glyphs and rows by (the rail's). */
  actionScale: number;
};

export function sheetLayout({
  windowWidth,
  fontScale,
  metrics = WORD_METRICS,
}: {
  windowWidth: number;
  fontScale: number;
  metrics?: SheetMetrics;
}): SheetLayout {
  const feed = verseLayout({ windowWidth, fontScale });
  const accessible = feed.collapsed;
  const bodyWidth = Math.max(0, windowWidth - 2 * SHEET_PADDING);
  const widths: Record<Surface, number> = {
    title: accessible ? bodyWidth : Math.max(0, bodyWidth - CLOSE_BUTTON),
    compare: bodyWidth,
    excerpt: bodyWidth,
    context: bodyWidth,
    reference: bodyWidth,
    readAll: bodyWidth,
  };
  const fit = (surface: Surface): SurfaceFit => {
    const { size, maxScale } = SHEET_TYPE[surface];
    const width = widths[surface];
    return {
      width,
      maxMultiplier: Math.min(maxScale, maxMultiplierFor(ceilingFor(width, metrics[surface].em), size)),
    };
  };
  return {
    accessible,
    bodyWidth,
    actionScale: feed.railScale,
    title: fit('title'),
    compare: fit('compare'),
    excerpt: fit('excerpt'),
    context: fit('context'),
    reference: fit('reference'),
    readAll: fit('readAll'),
  };
}
