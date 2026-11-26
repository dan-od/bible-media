/**
 * How wide the reading column is, how large the verse is set, and whether the
 * seven-icon rail fits beside it — at any screen width and system text size.
 *
 * Scripture must never break mid-word, and line breaking only breaks at spaces,
 * so the rule is about the library's widest word (measured from the embedded
 * fonts into data/word-metrics.json):
 *
 * - The verse grows linearly with the system text size until that word just
 *   fits the full width of the column, and holds there (the ceiling). The
 *   lead-in, in its own face and size, gets the same treatment. On a 390pt phone
 *   the verse ceiling is about 63pt, above iOS's own 60pt title at AX5; a test
 *   fails if new content pushes it under that floor.
 * - The rail collapses when the column beside it would be too narrow for that
 *   word at the current size. Collapsed, the verse runs the full width and the
 *   actions move to a labelled control at the end of the passage.
 *
 * Both thresholds are measured, never a named text size, so they follow the
 * library, the screen width and the fonts.
 */
import { MinTapTarget, ReadingColumnEm, RootFontSize, Spacing } from '@/constants/theme';
import WORD_METRICS from '@/data/word-metrics.json';

export interface WordMetrics {
  /** Widest run in the passage verses, in the display serif, in em. */
  verse: { word: string; em: number };
  /** Widest run in the lead-in verses, in the text serif, in em. */
  leadIn: { word: string; em: number };
}

/** Verse and lead-in sizes at the default text size. */
export const VERSE_FONT_SIZE = 34;
export const LEAD_IN_FONT_SIZE = 17;
/** Horizontal padding of each feed page. */
export const PAGE_PADDING = Spacing.five;
/** Space between the text column and the rail. */
export const RAIL_GUTTER = Spacing.three;
/**
 * Headroom on every width check, for rounding and small rendering differences
 * between platforms (the measurements match a browser to 0.1px).
 */
export const FIT_MARGIN = 1.02;
/**
 * The rail grows with the system text size, but only so far: a full-scale
 * column of seven buttons would be taller than the screen.
 */
export const RAIL_MAX_SCALE = 1.3;
const RAIL_ACTION_COUNT = 7;

/**
 * Every system text size the app is checked at: the iOS content size
 * categories (React Native's multipliers) and Android's font scale steps.
 */
export const SYSTEM_TEXT_SIZES = [
  { name: 'iOS xSmall', scale: 0.823 },
  { name: 'Android Small', scale: 0.85 },
  { name: 'iOS Small', scale: 0.882 },
  { name: 'iOS Medium', scale: 0.941 },
  { name: 'iOS Large (default)', scale: 1 },
  { name: 'iOS xLarge', scale: 1.118 },
  { name: 'Android Large', scale: 1.15 },
  { name: 'iOS xxLarge', scale: 1.235 },
  { name: 'Android Larger', scale: 1.3 },
  { name: 'iOS xxxLarge', scale: 1.353 },
  { name: 'Android 150%', scale: 1.5 },
  { name: 'iOS AX1', scale: 1.786 },
  { name: 'Android 180%', scale: 1.8 },
  { name: 'Android 200%', scale: 2 },
  { name: 'iOS AX2', scale: 2.143 },
  { name: 'iOS AX3', scale: 2.643 },
  { name: 'iOS AX4', scale: 3.143 },
  { name: 'iOS AX5', scale: 3.571 },
] as const;

/** Rail geometry at a given scale (1 = default text size): 44pt buttons, 23pt glyphs, 8pt gaps. */
export function railMetrics(scale: number) {
  const button = Math.round(MinTapTarget * scale);
  const gap = Math.round(8 * scale);
  return {
    button,
    icon: Math.round(23 * scale),
    gap,
    height: RAIL_ACTION_COUNT * button + (RAIL_ACTION_COUNT - 1) * gap,
  };
}

export type RailMetrics = ReturnType<typeof railMetrics>;

export interface VerseLayout {
  /** True when the rail gives way to the end-of-passage actions control. */
  collapsed: boolean;
  /** Width of the text column, in points. */
  textWidth: number;
  /** Max width of the whole card (column plus the rail's lane when it shows). */
  cardMaxWidth: number;
  /** The rendered verse and lead-in font sizes. */
  verseSize: number;
  leadInSize: number;
  /** `maxFontSizeMultiplier` for the verse and lead-in Text (React Native reads values ≥ 1). */
  verseMaxMultiplier: number;
  leadInMaxMultiplier: number;
  railScale: number;
  rail: RailMetrics;
  /** Width the rail takes from the column: its buttons plus the gutter. */
  lane: number;
}

/** Full column width: the page minus its padding, capped at the reading measure. */
function fullWidth(windowWidth: number, fontScale: number) {
  return Math.min(Math.max(0, windowWidth - 2 * PAGE_PADDING), ReadingColumnEm * RootFontSize * fontScale);
}

/**
 * The largest font size, in points, at which a word `em` wide (see
 * data/word-metrics.json) still fits a line `textWidth` points wide. Every
 * reading surface uses this; only the width it is given differs (the feed's
 * column, a sheet's inset body, a title beside its close button).
 */
export function ceilingFor(textWidth: number, em: number): number {
  return Math.max(0, textWidth) / (em * FIT_MARGIN);
}

/**
 * `maxFontSizeMultiplier` that holds text of `baseSize` at `ceiling` points.
 * React Native ignores values under 1, which would matter only on a screen
 * narrower than any phone.
 */
export function maxMultiplierFor(ceiling: number, baseSize: number): number {
  return Math.max(1, ceiling / baseSize);
}

/**
 * The largest verse and lead-in sizes, in points, at which the widest word of
 * each still fits the full column.
 */
export function verseCeiling(
  windowWidth: number,
  fontScale: number,
  metrics: Pick<WordMetrics, 'verse' | 'leadIn'> = WORD_METRICS,
): { verse: number; leadIn: number } {
  const width = fullWidth(windowWidth, fontScale);
  return {
    verse: ceilingFor(width, metrics.verse.em),
    leadIn: ceilingFor(width, metrics.leadIn.em),
  };
}

export function verseLayout({
  windowWidth,
  fontScale,
  metrics = WORD_METRICS,
}: {
  windowWidth: number;
  fontScale: number;
  metrics?: WordMetrics;
}): VerseLayout {
  const ceiling = verseCeiling(windowWidth, fontScale, metrics);
  const verseMaxMultiplier = maxMultiplierFor(ceiling.verse, VERSE_FONT_SIZE);
  const leadInMaxMultiplier = maxMultiplierFor(ceiling.leadIn, LEAD_IN_FONT_SIZE);
  const verseSize = VERSE_FONT_SIZE * Math.min(fontScale, verseMaxMultiplier);
  const leadInSize = LEAD_IN_FONT_SIZE * Math.min(fontScale, leadInMaxMultiplier);

  const railScale = Math.min(Math.max(fontScale, 1), RAIL_MAX_SCALE);
  const rail = railMetrics(railScale);
  const lane = rail.button + RAIL_GUTTER;

  const columnMax = ReadingColumnEm * RootFontSize * fontScale;
  const available = Math.max(0, windowWidth - 2 * PAGE_PADDING);
  const besideRail = Math.min(available, columnMax + lane) - lane;
  const longestWord = Math.max(metrics.verse.em * verseSize, metrics.leadIn.em * leadInSize);
  // An unmeasured window (width 0 while the web build renders on the server)
  // keeps the default rail rather than flashing the collapsed state.
  const collapsed = windowWidth > 0 && besideRail < longestWord * FIT_MARGIN;

  return {
    collapsed,
    textWidth: collapsed ? fullWidth(windowWidth, fontScale) : besideRail,
    cardMaxWidth: collapsed ? columnMax : columnMax + lane,
    verseSize,
    leadInSize,
    verseMaxMultiplier,
    leadInMaxMultiplier,
    railScale,
    rail,
    lane,
  };
}
