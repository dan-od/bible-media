import { render, screen, within } from '@testing-library/react-native';
import { Animated, StyleSheet } from 'react-native';

import { FeedCard, RAIL_GUTTER } from '@/components/feed/FeedCard';
import { MinTapTarget } from '@/constants/theme';
import { buildFeed } from '@/data/feed';
import { getPassages, renderPassage } from '@/data/verseStore';

// The rail is sticky within its own passage (see lib/sticky-rail for where it
// sits). Structurally: it is beside the text for the passage's full height, so
// the text column is narrowed by the rail's width plus a gutter at every text
// size, and it comes after the passage in reading order.

const RAIL_LABELS = ['Star', 'Save', 'Write a note', 'Repost', 'Send to a friend', 'Other versions', 'Context'];
/** Default and the largest iOS accessibility text size (AX5 ≈ 3.1x). */
const FONT_SCALES = [1, 3.1];

async function renderCard(passageId: string, fontScale: number) {
  const item = buildFeed([]).find((i) => i.passage.id === passageId)!;
  // RNTL 14 renders asynchronously.
  await render(
    <FeedCard
      item={item}
      rendered={renderPassage(item.passage, 'KJV')}
      starred={false}
      saved={false}
      hasNote={false}
      columnMaxWidth={34 * 16 * fontScale}
      fontScale={fontScale}
      selectedPhrases={new Set()}
      onTogglePhrase={() => {}}
      onAction={() => {}}
      scrollY={new Animated.Value(0)}
      pageTop={0}
      pageHeight={0}
      feedAreaHeight={658}
    />,
  );
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

const CASES = getPassages().flatMap((p) => FONT_SCALES.map((scale) => [p.reference, scale, p.id] as const));

describe.each(CASES)('FeedCard for %s at text scale %sx', (_ref, fontScale, id) => {
  const passage = () => getPassages().find((p) => p.id === id)!;
  beforeEach(async () => {
    await renderCard(id, fontScale);
  });

  it('keeps the rail out of the text block', () => {
    const text = screen.getByTestId('feed-text');
    const rail = screen.getByTestId('feed-rail');
    for (const label of RAIL_LABELS) {
      expect(within(text).queryByLabelText(label)).toBeNull();
      expect(within(rail).getByLabelText(label)).toBeTruthy();
    }
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

  it('narrows the text column by the rail width plus a gutter, so no verse runs under the icons', () => {
    const textStyle = StyleSheet.flatten(screen.getByTestId('feed-text').props.style);
    const railStyle = StyleSheet.flatten(screen.getByTestId('feed-rail').props.style);
    const buttonWidth = StyleSheet.flatten(
      within(screen.getByTestId('feed-rail')).getAllByRole('button')[0].props.style,
    ).width as number;
    expect(railStyle.width).toBeGreaterThanOrEqual(buttonWidth);
    expect(textStyle.paddingRight).toBeGreaterThanOrEqual((railStyle.width as number) + RAIL_GUTTER);
  });

  it('keeps the reference and the "Read" link with the text', () => {
    const text = screen.getByTestId('feed-text');
    expect(within(text).getByText(passage().reference)).toBeTruthy();
    expect(within(text).getByText(`Read ${passage().book} ${passage().chapter}`)).toBeTruthy();
  });

  it('reads the whole passage before reaching the rail', () => {
    const order = readingOrder();
    const readLink = order.findIndex((t) => t.startsWith('Read '));
    const firstAction = order.indexOf('[Star]');
    expect(readLink).toBeGreaterThan(-1);
    expect(firstAction).toBeGreaterThan(readLink);
  });
});

it('grows the rail with the system text size', async () => {
  const id = getPassages()[0].id;
  const widthAt = async (scale: number) => {
    await renderCard(id, scale);
    return StyleSheet.flatten(within(screen.getByTestId('feed-rail')).getAllByRole('button')[0].props.style).width;
  };
  expect(await widthAt(3.1)).toBeGreaterThan((await widthAt(1)) as number);
});
