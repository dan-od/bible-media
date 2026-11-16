/**
 * One passage in the feed: the reading block (lead-in + passage, tap-a-phrase),
 * the reference + version + "why this verse" line, a link into the chapter, and
 * the action rail. Actions are a rail beside the verse, never a sheet over it.
 *
 * Content sits toward the bottom (as in the prototype) and grows upward with the
 * text size — no fixed heights.
 */
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionRail, type RailAction } from './ActionRail';
import { VerseBlock } from './VerseBlock';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import type { FeedItem } from '@/data/feed';
import type { RenderedPassage } from '@/data/types';
import { whyLine } from '@/data/verseStore';
import { useTheme } from '@/hooks/use-theme';

export function FeedCard({
  item,
  rendered,
  starred,
  saved,
  hasNote,
  columnMaxWidth,
  selectedPhrases,
  onTogglePhrase,
  onAction,
}: {
  item: FeedItem;
  rendered: RenderedPassage;
  starred: boolean;
  saved: boolean;
  hasNote: boolean;
  /** Max width of the text column (the rail sits beside it). */
  columnMaxWidth: number;
  selectedPhrases: ReadonlySet<string>;
  onTogglePhrase: (key: string) => void;
  onAction: (action: RailAction) => void;
}) {
  const { colors } = useTheme();
  const { passage } = item;

  const why = item.reason
    ? whyLine(item.reason.situation, item.reason.theme)
    : `On ${passage.themeTags[0].toLowerCase()}`;

  return (
    <View style={[styles.row, { maxWidth: columnMaxWidth + MinTapTarget + Spacing.three }]}>
      <View style={styles.section}>
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

      <View style={styles.railWrap}>
        <ActionRail starred={starred} saved={saved} hasNote={hasNote} onAction={onAction} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // The column and rail share one centred row, so the rail always sits
  // immediately beside the text — at any viewport width.
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three, alignSelf: 'center', width: '100%' },
  section: { flex: 1, minWidth: 0, gap: 20, paddingVertical: Spacing.five },
  refArea: { gap: 9 },
  refLine: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.three, flexWrap: 'wrap' },
  ref: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  version: { fontFamily: Fonts.sans, fontSize: 12 },
  why: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  readRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 2 },
  readLink: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, minHeight: MinTapTarget },
  readText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  railWrap: { paddingBottom: Spacing.five },
});
