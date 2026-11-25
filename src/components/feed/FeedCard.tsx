/**
 * One passage in the feed: the reading block (lead-in + passage, tap-a-phrase),
 * the reference + version + "why this verse" line, a link into the chapter, and
 * the actions. Actions never cover the verse.
 *
 * Where the actions go depends on whether the verse still fits beside them
 * (lib/verse-fit measures this from the library's widest word):
 *
 * - Usually, a rail of seven icons beside the verse, sticky within its own
 *   passage: centred in the feed area when the passage arrives, rising with a
 *   long passage until it holds near the top, and released with the passage at
 *   its end (lib/sticky-rail; the feed drives it from the measured scroll
 *   position, as React Native has no `position: sticky`). The rail can sit
 *   anywhere along the passage, so the text column gives up the rail's lane for
 *   the passage's full height and no verse runs under the icons.
 * - At the sizes where that lane would leave the column too narrow for a word
 *   (the accessibility text sizes on a phone), one labelled "Actions" control
 *   on the end row, beside "Read …", that opens the same seven in a sheet. The
 *   verse takes the full width.
 *
 * Either way the actions come after the passage in the tree, so a screen reader
 * reads the passage as one block first. The text grows with the system text
 * size — no fixed heights.
 */
import { Feather } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionRail, type RailAction } from './ActionRail';
import { VerseBlock } from './VerseBlock';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import type { FeedItem } from '@/data/feed';
import type { RenderedPassage } from '@/data/types';
import { whyLine } from '@/data/verseStore';
import { useTheme } from '@/hooks/use-theme';
import { stickyRailRanges } from '@/lib/sticky-rail';
import type { VerseLayout } from '@/lib/verse-fit';

/** The rail holds this far below the top of the feed area while sticking. */
const STICK_INSET = Spacing.four;
/** …and its bottom stops this far above the passage's bottom when released. */
const BOTTOM_INSET = Spacing.five;

export function FeedCard({
  item,
  rendered,
  starred,
  saved,
  hasNote,
  layout,
  selectedPhrases,
  onTogglePhrase,
  onAction,
  onOpenActions,
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
  /** Column width, verse sizes and rail state for this screen and text size (lib/verse-fit). */
  layout: VerseLayout;
  selectedPhrases: ReadonlySet<string>;
  onTogglePhrase: (key: string) => void;
  onAction: (action: RailAction) => void;
  /** Opens the seven actions as a sheet (the collapsed control). */
  onOpenActions: () => void;
  /** The feed's scroll offset. */
  scrollY: Animated.Value;
  /** Where this passage starts in the feed, and its measured height (0 until measured). */
  pageTop: number;
  pageHeight: number;
  feedAreaHeight: number;
}) {
  const { colors } = useTheme();
  const { passage } = item;
  const { rail, collapsed } = layout;

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
    <View style={[styles.card, { maxWidth: layout.cardMaxWidth }]}>
      <View testID="feed-text" style={[styles.section, !collapsed && { paddingRight: layout.lane }]}>
        <VerseBlock
          leadIn={rendered.leadIn}
          verses={rendered.verses}
          verseMaxMultiplier={layout.verseMaxMultiplier}
          leadInMaxMultiplier={layout.leadInMaxMultiplier}
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

        <View testID="feed-end-row" style={[styles.readRow, { borderTopColor: colors.hairline }]}>
          <Pressable
            onPress={() => onAction('context')}
            accessibilityRole="button"
            style={styles.readLink}>
            <Text style={[styles.readText, { color: colors.text }]}>
              Read {passage.book} {passage.chapter}
            </Text>
            <Feather name="arrow-right" size={15} color={colors.text} />
          </Pressable>

          {collapsed && (
            <Pressable
              testID="feed-actions"
              onPress={onOpenActions}
              accessibilityRole="button"
              accessibilityLabel="Actions"
              style={[styles.actions, { minHeight: rail.button, borderColor: colors.hairline }]}>
              <Feather name="more-horizontal" size={rail.icon} color={colors.text} />
              <Text style={[styles.actionsText, { color: colors.text }]}>Actions</Text>
            </Pressable>
          )}
        </View>
      </View>

      {!collapsed && (
        // Positioned from the top of the passage; after the text in the tree.
        <Animated.View
          testID="feed-rail"
          style={[styles.rail, { width: rail.button, transform: [{ translateY: railTop }] }]}>
          <ActionRail starred={starred} saved={saved} hasNote={hasNote} onAction={onAction} scale={layout.railScale} />
        </Animated.View>
      )}
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
  // When the actions control joins "Read …" and the two don't fit on one line,
  // it wraps underneath, still right-aligned.
  readRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.four,
    rowGap: Spacing.two,
  },
  readLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTapTarget, flexShrink: 1 },
  readText: { fontFamily: Fonts.sansMedium, fontSize: 14, flexShrink: 1 },
  actions: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: MinTapTarget,
    paddingHorizontal: Spacing.four,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
  },
  actionsText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  rail: { position: 'absolute', top: 0, right: 0 },
});
