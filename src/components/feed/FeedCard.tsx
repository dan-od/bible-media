/**
 * One passage in the feed: the reading block (lead-in + passage, tap-a-phrase),
 * the reference + version + "why this verse" line, a link into the chapter, and
 * the action rail. Actions are a rail beside the verse, never a sheet over it.
 *
 * The rail is sticky within its own passage: centred in the feed area when the
 * passage arrives, rising with a long passage until it holds near the top, and
 * released with the passage at its end (the arithmetic is lib/sticky-rail; the
 * feed drives it from the measured scroll position, as React Native has no
 * `position: sticky`). Because the rail can sit anywhere along the passage, the
 * text column is narrowed by the rail's width plus a gutter for the passage's
 * full height, so no line of verse ever runs under the icons.
 *
 * The rail comes after the passage in the tree, so a screen reader reads the
 * passage as one block before reaching the actions. The text grows with the
 * system text size — no fixed heights.
 */
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionRail, railMetrics, type RailAction } from './ActionRail';
import { VerseBlock } from './VerseBlock';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import type { FeedItem } from '@/data/feed';
import type { RenderedPassage } from '@/data/types';
import { whyLine } from '@/data/verseStore';
import { useTheme } from '@/hooks/use-theme';
import { stickyRailRanges } from '@/lib/sticky-rail';

/** Space between the text column and the rail. */
export const RAIL_GUTTER = Spacing.three;
/** The rail holds this far below the top of the feed area while sticking. */
const STICK_INSET = Spacing.four;
/** …and its bottom stops this far above the passage's bottom when released. */
const BOTTOM_INSET = Spacing.five;
/**
 * The rail grows with the system text size, but only so far: at the largest
 * accessibility sizes a full-scale column of seven buttons would be taller than
 * the screen.
 */
const RAIL_MAX_SCALE = 1.3;

export function FeedCard({
  item,
  rendered,
  starred,
  saved,
  hasNote,
  columnMaxWidth,
  fontScale,
  selectedPhrases,
  onTogglePhrase,
  onAction,
  scrollY,
  pageTop,
  pageHeight,
  feedAreaHeight,
}: {
  item: FeedItem;
  rendered: RenderedPassage;
  starred: boolean;
  saved: boolean;
  hasNote: boolean;
  /** Max width of the text column (the rail sits beside it). */
  columnMaxWidth: number;
  /** The system text-size multiplier. */
  fontScale: number;
  selectedPhrases: ReadonlySet<string>;
  onTogglePhrase: (key: string) => void;
  onAction: (action: RailAction) => void;
  /** The feed's scroll offset. */
  scrollY: Animated.Value;
  /** Where this passage starts in the feed, and its measured height (0 until measured). */
  pageTop: number;
  pageHeight: number;
  feedAreaHeight: number;
}) {
  const { colors } = useTheme();
  const { passage } = item;

  const railScale = Math.min(Math.max(fontScale, 1), RAIL_MAX_SCALE);
  const rail = railMetrics(railScale);

  // s = scrollY - pageTop, so shift the formula's ranges by pageTop. Until the
  // passage is measured, rest the rail where the formula would.
  const railTop = useMemo(() => {
    const restTop = (feedAreaHeight - rail.height) / 2;
    if (!pageHeight) return restTop;
    const { inputRange, outputRange } = stickyRailRanges({
      feedAreaHeight,
      railHeight: rail.height,
      passageHeight: pageHeight,
      stickInset: STICK_INSET,
      bottomInset: BOTTOM_INSET,
    });
    return scrollY.interpolate({
      inputRange: inputRange.map((x) => x + pageTop),
      outputRange,
      extrapolate: 'clamp',
    });
  }, [scrollY, pageTop, pageHeight, feedAreaHeight, rail.height]);

  const why = item.reason
    ? whyLine(item.reason.situation, item.reason.theme)
    : `On ${passage.themeTags[0].toLowerCase()}`;

  return (
    <View style={[styles.card, { maxWidth: columnMaxWidth + rail.button + RAIL_GUTTER }]}>
      <View testID="feed-text" style={[styles.section, { paddingRight: rail.button + RAIL_GUTTER }]}>
        <VerseBlock
          leadIn={rendered.leadIn}
          verses={rendered.verses}
          selected={selectedPhrases}
          onTogglePhrase={onTogglePhrase}
        />

        <View style={styles.refArea}>
          <View style={styles.refLine}>
            <Text style={[styles.ref, { color: colors.text }]}>{passage.reference}</Text>
            <Text style={[styles.version, { color: colors.textSecondary }]}>{rendered.translation.name}</Text>
          </View>
          <Text style={[styles.why, { color: colors.textSecondary }]}>{why}</Text>
        </View>

        <View style={[styles.readRow, { borderTopColor: colors.hairline }]}>
          <Pressable
            onPress={() => onAction('context')}
            accessibilityRole="button"
            style={styles.readLink}>
            <Text style={[styles.readText, { color: colors.text }]}>
              Read {passage.book} {passage.chapter}
            </Text>
            <Feather name="arrow-right" size={15} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Positioned from the top of the passage; after the text in the tree. */}
      <Animated.View
        testID="feed-rail"
        style={[styles.rail, { width: rail.button, transform: [{ translateY: railTop }] }]}>
        <ActionRail starred={starred} saved={saved} hasNote={hasNote} onAction={onAction} scale={railScale} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills its page (the passage), so the rail's offset is from the passage top.
  card: { flexGrow: 1, justifyContent: 'center', alignSelf: 'center', width: '100%' },
  section: { gap: 20, paddingVertical: Spacing.five },
  refArea: { gap: 9 },
  refLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.three, flexWrap: 'wrap' },
  ref: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  version: { fontFamily: Fonts.sans, fontSize: 12 },
  why: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  readRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  readLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTapTarget },
  readText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  rail: { position: 'absolute', top: 0, right: 0 },
});
