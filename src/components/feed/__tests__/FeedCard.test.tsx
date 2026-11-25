import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { FeedCard } from '@/components/feed/FeedCard';
import { MinTapTarget } from '@/constants/theme';
import { buildFeed } from '@/data/feed';
import { getPassages, renderPassage } from '@/data/verseStore';
import { SYSTEM_TEXT_SIZES, verseLayout } from '@/lib/verse-fit';

// Below the breakpoint the rail is sticky within its own passage (see
// lib/sticky-rail) and sits beside the text for the passage's full height, so
// the text column is narrowed by the rail's lane. Above it (lib/verse-fit) the
// rail gives way to one labelled control at the end of the passage and the verse
// runs the full width. Either way the actions come after the passage in reading
// order.

const RAIL_LABELS = ['Star', 'Save', 'Write a note', 'Repost', 'Send to a friend', 'Other versions', 'Context'];
const PHONES = [390, 375] as const;

async function renderCard(passageId: string, windowWidth: number, fontScale: number, onOpenActions = () => {}) {
  const item = buildFeed([]).find((i) => i.passage.id === passageId)!;
  const layout = verseLayout({ windowWidth, fontScale });
  // RNTL 14 renders asynchronously.
  await render(
    <FeedCard
      item={item}
      rendered={renderPassage(item.passage, 'KJV')}
      starred={false}
      saved={false}
      hasNote={false}
      layout={layout}
      selectedPhrases={new Set()}
      onTogglePhrase={() => {}}
      onAction={() => {}}
      onOpenActions={onOpenActions}
      scrollY={new Animated.Value(0)}
      pageTop={0}
      pageHeight={0}
      feedAreaHeight={658}
    />,
  );
  return layout;
}

/** Depth-first order of every host node's label/text, as a screen reader meets them. */
function readingOrder(): string[] {
  const out: string[] = [];
  const walk = (node: ReturnType<typeof screen.toJSON>): void => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node === 'string') return void out.push(node);
    const label = node.props?.accessibilityLabel;
    if (label) out.push(`[${label}]`);
    (node.children ?? []).forEach((c) => walk(c as never));
  };
  walk(screen.toJSON());
  return out;
}

/** The sizes either side of the breakpoint on a screen width. */
function aroundBreakpoint(windowWidth: number) {
  const i = SYSTEM_TEXT_SIZES.findIndex((s) => verseLayout({ windowWidth, fontScale: s.scale }).collapsed);
  return { below: SYSTEM_TEXT_SIZES[i - 1], above: SYSTEM_TEXT_SIZES[i] };
}

function expectRail() {
  const text = screen.getByTestId('feed-text');
  const rail = screen.getByTestId('feed-rail');
  for (const label of RAIL_LABELS) {
    expect(within(text).queryByLabelText(label)).toBeNull();
    expect(within(rail).getByLabelText(label)).toBeTruthy();
  }
  expect(screen.queryByTestId('feed-actions')).toBeNull();
  expect(screen.queryByText('Actions')).toBeNull();
}

function expectEndControl() {
  expect(screen.queryByTestId('feed-rail')).toBeNull();
  for (const label of RAIL_LABELS) expect(screen.queryByLabelText(label)).toBeNull();
  const control = within(screen.getByTestId('feed-end-row')).getByTestId('feed-actions');
  // A visible text label, not a glyph alone.
  expect(within(control).getByText('Actions')).toBeTruthy();
}

const PASSAGE_CASES = getPassages().map((p) => [p.reference, p.id] as const);

describe.each(PHONES)('on a %spt screen', (windowWidth) => {
  const { below, above } = aroundBreakpoint(windowWidth);

  describe.each(PASSAGE_CASES)('below the breakpoint, %s', (_ref, id) => {
    const passage = () => getPassages().find((p) => p.id === id)!;
    let layout: ReturnType<typeof verseLayout>;
    beforeEach(async () => {
      layout = await renderCard(id, windowWidth, below.scale);
    });

    it('shows the sticky seven-icon rail, outside the text, and no end control', () => {
      expect(layout.collapsed).toBe(false);
      expectRail();
    });

    it('has exactly the seven actions, each at least 44x44', () => {
      const buttons = within(screen.getByTestId('feed-rail')).getAllByRole('button');
      expect(buttons.map((b) => b.props.accessibilityLabel)).toEqual(RAIL_LABELS);
      for (const b of buttons) {
        const style = StyleSheet.flatten(b.props.style);
        expect(style.width).toBeGreaterThanOrEqual(MinTapTarget);
        expect(style.height).toBeGreaterThanOrEqual(MinTapTarget);
      }
    });

    it('narrows the text column by the rail’s lane, so no verse runs under the icons', () => {
      const textStyle = StyleSheet.flatten(screen.getByTestId('feed-text').props.style);
      const railStyle = StyleSheet.flatten(screen.getByTestId('feed-rail').props.style);
      expect(railStyle.width).toBe(layout.rail.button);
      expect(textStyle.paddingRight).toBe(layout.lane);
    });

    it('keeps the reference and the "Read" link with the text', () => {
      const text = screen.getByTestId('feed-text');
      expect(within(text).getByText(passage().reference)).toBeTruthy();
      expect(within(text).getByText(`Read ${passage().book} ${passage().chapter}`)).toBeTruthy();
    });

    it('reads the whole passage before reaching the rail', () => {
      const order = readingOrder();
      const readLink = order.findIndex((t) => t.startsWith('Read '));
      expect(readLink).toBeGreaterThan(-1);
      expect(order.indexOf('[Star]')).toBeGreaterThan(readLink);
    });
  });

  describe.each(PASSAGE_CASES)('above the breakpoint, %s', (_ref, id) => {
    const passage = () => getPassages().find((p) => p.id === id)!;
    let layout: ReturnType<typeof verseLayout>;
    beforeEach(async () => {
      layout = await renderCard(id, windowWidth, above.scale);
    });

    it('shows one labelled control at the end of the passage, and no rail', () => {
      expect(layout.collapsed).toBe(true);
      expectEndControl();
    });

    it('gives the verse the full width', () => {
      const textStyle = StyleSheet.flatten(screen.getByTestId('feed-text').props.style);
      expect(textStyle.paddingRight ?? 0).toBe(0);
      expect(layout.textWidth).toBe(windowWidth - 48);
    });

    it('puts the control on the end row with "Read …", after it in reading order', () => {
      const row = screen.getByTestId('feed-end-row');
      expect(within(row).getByText(`Read ${passage().book} ${passage().chapter}`)).toBeTruthy();
      const order = readingOrder();
      expect(order.indexOf('[Actions]')).toBeGreaterThan(order.findIndex((t) => t.startsWith('Read ')));
    });

    it('makes the control a 44pt+ button', () => {
      const control = screen.getByTestId('feed-actions');
      expect(control.props.accessibilityRole).toBe('button');
      const style = StyleSheet.flatten(control.props.style);
      expect(style.minHeight).toBeGreaterThanOrEqual(MinTapTarget);
    });
  });
});

describe.each(SYSTEM_TEXT_SIZES.map((s) => [s.name, s.scale] as const))('at %s', (_name, scale) => {
  it.each(PHONES)('caps the verse and lead-in at their measured ceilings on %spt', async (windowWidth) => {
    const layout = await renderCard(getPassages()[0].id, windowWidth, scale);
    const verse = screen.getByTestId('verse-passage');
    const leadIn = screen.getByTestId('verse-lead-in');
    expect(verse.props.maxFontSizeMultiplier).toBe(layout.verseMaxMultiplier);
    expect(leadIn.props.maxFontSizeMultiplier).toBe(layout.leadInMaxMultiplier);
    // Never a state leak: exactly one of the two action surfaces.
    expect(!!screen.queryByTestId('feed-rail')).toBe(!layout.collapsed);
    expect(!!screen.queryByTestId('feed-actions')).toBe(layout.collapsed);
  });
});

it('opens the actions from the end control', async () => {
  const onOpen = jest.fn();
  await renderCard(getPassages()[0].id, 390, 3.571, onOpen);
  fireEvent.press(screen.getByTestId('feed-actions'));
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it('grows the rail with the system text size', async () => {
  const id = getPassages()[0].id;
  const widthAt = async (scale: number) => {
    await renderCard(id, 390, scale);
    return StyleSheet.flatten(within(screen.getByTestId('feed-rail')).getAllByRole('button')[0].props.style).width;
  };
  expect(await widthAt(1.3)).toBeGreaterThan((await widthAt(1)) as number);
});
