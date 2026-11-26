import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type TextStyle } from 'react-native';

import { loadFont, type FONT_FILES } from '../../../../jest/font-metrics';
import { ActionSheet } from '@/components/feed/ActionSheet';
import { CompareSheet } from '@/components/feed/CompareSheet';
import { ContextDeck } from '@/components/feed/ContextDeck';
import { NoteSheet } from '@/components/feed/NoteSheet';
import { Fonts, Spacing } from '@/constants/theme';
import { lineBreakUnits } from '@/data/scripture-words';
import { getPassages, renderPassage } from '@/data/verseStore';
import type { Passage } from '@/data/types';
import { sheetLayout, type SheetLayout } from '@/lib/sheet-fit';
import { FIT_MARGIN, railMetrics, SYSTEM_TEXT_SIZES, verseLayout } from '@/lib/verse-fit';

// Every sheet, every passage, from one size below the breakpoint up to AX5, on
// 390pt and 375pt: no word is wider than the line it is set in, no row holds
// more than fits beside each other, and every title fits within its 60pt cap.
//
// The test renderer does no layout, so the font, size and size cap of each
// piece of text are read from the rendered tree, and so is the shape of each
// line it sits in: the sheet's padding, whether the close button shares the
// title's row, which rows are side by side and which of their items take their
// own width. Only paddings inside buttons are mirrored here (REGIONS). Nothing
// is taken from lib/sheet-fit, so a wrong model there can't pass by agreeing
// with itself. Text in a region this doesn't know is measured against the sheet
// body; a new row of side-by-side text needs an entry here.
//
// A word fits with the same 2% margin the ceilings are built on (FIT_MARGIN),
// so a cap that only matters within that margin is still checked.

const PHONES = [390, 375] as const;
const passages = getPassages();

/** One size below the breakpoint, the breakpoint, and every size above it. */
function sizesFromBreakpoint(windowWidth: number) {
  const i = SYSTEM_TEXT_SIZES.findIndex((s) => verseLayout({ windowWidth, fontScale: s.scale }).collapsed);
  return SYSTEM_TEXT_SIZES.slice(i - 1);
}

const FACE_BY_FAMILY = new Map<string, keyof typeof FONT_FILES>(
  (['serifDisplay', 'serifText', 'sans', 'sansMedium', 'sansSemiBold'] as const).map((k) => [Fonts[k], k]),
);

type Style = Record<string, any>;
const styleOf = (id: string): Style => StyleSheet.flatten(screen.getByTestId(id).props.style) ?? {};
const isRow = (id: string) => styleOf(id).flexDirection === 'row';

/** Width of the line a region's text is set in, from the rendered tree. */
function regionWidth(region: string, windowWidth: number, actionScale: number, fontScale: number): number {
  const head = screen.getByTestId('sheet-head');
  const sheetPadding = (StyleSheet.flatten(head.parent!.props.style) as Style).paddingHorizontal;
  const body = windowWidth - 2 * sheetPadding;
  switch (region) {
    case 'sheet-title': {
      const close = screen.getByTestId('sheet-close');
      return close.parent === head && isRow('sheet-head') ? body - styleOf('sheet-close').width : body;
    }
    case 'action-row': {
      const m = railMetrics(actionScale);
      return body - m.icon - Spacing.four;
    }
    case 'note-option':
      // Segmented control: 1pt border, 3pt padding, 3pt gap, 12pt label padding.
      return isRow('note-options') ? (body - 2 - 6 - 3) / 2 - 24 : body - 2 - 6 - 24;
    case 'note-cancel':
    case 'note-save': {
      // Ghost button: 20pt padding and a 1pt border; solid: 20pt padding.
      const inset = region === 'note-cancel' ? 42 : 40;
      if (!isRow('note-actions')) return body - inset;
      const flex = (id: string): number => styleOf(id).flex ?? 0;
      const gap = styleOf('note-actions').gap ?? 0;
      // Both grow: they share the row in proportion.
      if (flex('note-cancel') > 0 && flex('note-save') > 0)
        return ((body - gap) * flex(region)) / (flex('note-cancel') + flex('note-save')) - inset;
      // Side by side, the one that doesn't grow takes its own width.
      if (flex(region) === 0) return Infinity;
      const other = region === 'note-cancel' ? 'note-save' : 'note-cancel';
      const label = other === 'note-cancel' ? 'Cancel' : 'Save note';
      const otherWidth = loadFont('sansSemiBold').width(label) * 15 * fontScale + (other === 'note-cancel' ? 42 : 40);
      return body - gap - otherWidth - inset;
    }
    default:
      return body;
  }
}
const REGIONS = new Set(['sheet-title', 'action-row', 'note-option', 'note-cancel', 'note-save']);

type Node = { type: string; props: Record<string, any>; children: (Node | string)[] | null };

interface Problem {
  region: string;
  word: string;
  needs: number;
  width: number;
}

/** Every word too wide for its line, and the rendered title sizes. */
function measure(windowWidth: number, fontScale: number, actionScale: number) {
  const problems: Problem[] = [];
  const titleSizes: number[] = [];
  let unmeasured = 0;
  const walk = (node: Node | string | null, region: string) => {
    if (!node || typeof node === 'string') return;
    const here = REGIONS.has(node.props.testID) ? node.props.testID : region;
    if (node.type === 'Text') {
      const style = StyleSheet.flatten(node.props.style) as TextStyle;
      const text = (node.children ?? []).filter((c): c is string => typeof c === 'string').join('');
      const family = style.fontFamily!;
      const face = style.fontStyle === 'italic' && family === Fonts.serifText ? 'serifTextItalic' : FACE_BY_FAMILY.get(family);
      if (!face) {
        // Icons render as a glyph in their own font; they are fixed-size.
        if (!/feather/i.test(family)) unmeasured++;
        return;
      }
      const cap = node.props.maxFontSizeMultiplier;
      const multiplier = node.props.allowFontScaling === false ? 1 : cap ? Math.min(fontScale, cap) : fontScale;
      const size = style.fontSize! * multiplier;
      // Conservatively, letter spacing grows with the text.
      const spacing = (style.letterSpacing ?? 0) * multiplier;
      const width = regionWidth(here, windowWidth, actionScale, fontScale);
      if (here === 'sheet-title') titleSizes.push(size);
      const shown = style.textTransform === 'uppercase' ? text.toUpperCase() : text;
      for (const word of lineBreakUnits(shown)) {
        const needs = (loadFont(face).width(word) * size + spacing * [...word].length) * FIT_MARGIN;
        // A capped word fills its line, margin included, to the last decimal.
        if (needs > width + 1e-6) problems.push({ region: here, word, needs: Math.ceil(needs), width: Math.floor(width) });
      }
    }
    for (const c of node.children ?? []) walk(c, here);
  };
  walk(screen.toJSON() as unknown as Node, 'sheet-body');
  return { problems, titleSizes, unmeasured };
}

function expectFits(windowWidth: number, layout: SheetLayout, fontScale: number) {
  const { problems, titleSizes, unmeasured } = measure(windowWidth, fontScale, layout.actionScale);
  expect(problems).toEqual([]);
  expect(unmeasured).toBe(0);
  expect(titleSizes).toHaveLength(1);
  expect(titleSizes[0]).toBeLessThanOrEqual(60 + 1e-9);
}

/** The title and the close button share the head row only below the breakpoint. */
function expectHead(layout: SheetLayout) {
  const head = screen.getByTestId('sheet-head');
  const close = screen.getByTestId('sheet-close');
  const title = screen.getByTestId('sheet-title');
  expect(title.parent).toBe(head);
  const direction = StyleSheet.flatten(head.props.style).flexDirection ?? 'column';
  if (layout.accessible) {
    // Its own row above the title, which then has the full width.
    expect(close.parent).not.toBe(head);
    expect(direction).toBe('column');
  } else {
    expect(close.parent).toBe(head);
    expect(direction).toBe('row');
  }
}

const cases = PHONES.flatMap((w) =>
  sizesFromBreakpoint(w).map((s) => [w, s.name, s.scale] as const),
);

describe.each(cases)('%spt at %s (%sx)', (windowWidth, _name, fontScale) => {
  const layout = sheetLayout({ windowWidth, fontScale });

  // One test per passage: this renderer can't render again after an unmount
  // within a test, and a failure then names the passage.
  describe.each(passages.map((p) => [p.reference, p] as const))('%s', (_ref, passage) => {
    it('compare sheet: every version reads without a broken word or an overflowing row', async () => {
      await render(<CompareSheet passage={passage} current="KJV" layout={layout} onSelect={() => {}} onClose={() => {}} />);
      expectFits(windowWidth, layout, fontScale);
      expectHead(layout);
      // Each row's head (version and licence) wraps rather than running off the edge.
      for (const head of screen.getAllByTestId('compare-row-head')) {
        expect(StyleSheet.flatten(head.props.style).flexWrap).toBe('wrap');
      }
      for (const t of screen.getAllByTestId(/^compare-(id|licence)$/)) {
        expect(StyleSheet.flatten(t.props.style).flexShrink).toBe(1);
      }
      expectScrolls();
    });

    it('context sheet: every card reads without a broken word', async () => {
      await render(<ContextDeck passage={passage} layout={layout} onClose={() => {}} />);
      if (passage.context) {
        await layOutDeck(layout);
        // Every card is rendered, so every fact is measured.
        for (const fact of passage.context.facts) expect(screen.getByText(fact.body)).toBeTruthy();
      }
      expectFits(windowWidth, layout, fontScale);
      expectHead(layout);
      expectScrolls();
    });

    it('note sheet: excerpt, labels and buttons fit; the controls stack at the accessibility sizes', async () => {
      await render(
        <NoteSheet
          reference={passage.reference}
          verseText={excerpt(passage)}
          layout={layout}
          initialBody=""
          initialVisibility="private"
          onSave={() => {}}
          onClose={() => {}}
        />,
      );
      expectFits(windowWidth, layout, fontScale);
      expectHead(layout);
      expectScrolls();
      const direction = layout.accessible ? 'column' : 'row';
      expect(StyleSheet.flatten(screen.getByTestId('note-options').props.style).flexDirection).toBe(direction);
      expect(StyleSheet.flatten(screen.getByTestId('note-actions').props.style).flexDirection).toBe(direction);
    });

    it('actions sheet: every row label and the reference fit', async () => {
      await render(
        <ActionSheet
          reference={passage.reference}
          layout={layout}
          starred={false}
          saved={false}
          hasNote={false}
          onAction={() => {}}
          onClose={() => {}}
        />,
      );
      expectFits(windowWidth, layout, fontScale);
      expectHead(layout);
      expectScrolls();
    });
  });
});

/** The deck renders its cards once it knows its width (RNTL 14 fires events asynchronously). */
async function layOutDeck(layout: SheetLayout) {
  await fireEvent(screen.getByTestId('context-deck'), 'layout', {
    nativeEvent: { layout: { width: layout.bodyWidth, height: 0, x: 0, y: 0 } },
  });
}

function excerpt(passage: Passage) {
  return renderPassage(passage, 'KJV').verses.map((v) => v.text).join(' ');
}

/** A sheet that outgrows the screen scrolls rather than clipping its rows. */
function expectScrolls() {
  const body = screen.getByTestId('sheet-body');
  expect(body.type).toBe('RCTScrollView');
}

it('leaves the note body to scale like ordinary text (it is the reader’s own words)', async () => {
  const layout = sheetLayout({ windowWidth: 390, fontScale: 3.571 });
  await render(
    <NoteSheet
      reference="Psalm 23:1"
      verseText="The LORD is my shepherd; I shall not want."
      layout={layout}
      initialBody="https://example.com/a-very-long-link-someone-pasted"
      initialVisibility="private"
      onSave={() => {}}
      onClose={() => {}}
    />,
  );
  const input = screen.getByDisplayValue(/example\.com/);
  expect(input.props.maxFontSizeMultiplier).toBeUndefined();
});

it('caps the context copy where it is measured, and leaves Android hyphenation at its default', async () => {
  const passage = passages.find((p) => p.context?.facts.length)!;
  const layout = sheetLayout({ windowWidth: 390, fontScale: 3.571 });
  await render(<ContextDeck passage={passage} layout={layout} onClose={() => {}} />);
  await layOutDeck(layout);
  const body = screen.getByText(passage.context!.facts[0].body);
  expect(body.props.maxFontSizeMultiplier).toBe(layout.context.maxMultiplier);
  // Hyphenation would apply to every word on the card, on a platform not yet
  // checked; it stays off until it's been seen on an Android device.
  expect(body.props.android_hyphenationFrequency).toBeUndefined();
});

it('quotes the passage in whole words, never cut mid-word', async () => {
  const layout = sheetLayout({ windowWidth: 390, fontScale: 3.571 });
  const verse = 'Be of good courage, and he shall strengthen your heart, all ye that hope in the LORD.';
  await render(
    <NoteSheet
      reference="Psalm 31:24"
      verseText={verse}
      layout={layout}
      initialBody=""
      initialVisibility="private"
      onSave={() => {}}
      onClose={() => {}}
    />,
  );
  const excerpt = screen.getByTestId('note-excerpt');
  // No character truncation: that is what cut "strengthen" to "stren…".
  expect(excerpt.props.numberOfLines).toBeUndefined();
  await fireEvent(excerpt, 'textLayout', {
    nativeEvent: {
      lines: ['Be of good ', 'courage, and ', 'he shall ', 'strengthen your ', 'heart, all ye'].map((text) => ({ text })),
    },
  });
  expect(screen.getByTestId('note-excerpt').props.children).toBe('Be of good courage, and he…');
});
