/**
 * The seven passage actions as a sheet, opened from the collapsed "Actions"
 * control at the end of a passage (see FeedCard). Same actions, same order and
 * same toggled states as the rail, but every row has a text label beside its
 * glyph: at the accessibility text sizes nobody should have to identify an icon.
 * Rows grow with the text size and the list scrolls if it outgrows the sheet.
 */
import { Feather } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { isActionOn, isToggleAction, RAIL_ITEMS, type RailAction } from './ActionRail';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { railMetrics } from '@/lib/verse-fit';

export function ActionSheet({
  reference,
  starred,
  saved,
  hasNote,
  scale,
  onAction,
  onClose,
}: {
  /** The passage the actions apply to, shown under the title. */
  reference: string;
  starred: boolean;
  saved: boolean;
  hasNote: boolean;
  /** The rail's scale at this text size (sizes the glyphs and rows). */
  scale: number;
  onAction: (action: RailAction) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const m = railMetrics(scale);
  return (
    // The title is set in the display serif. At AX5 a book name there would
    // break mid-word, so it is a short word, capped at iOS's largest title
    // (60pt); the passage is named underneath in the sans, which fits.
    <BottomSheet title="Actions" titleMaxFontSizeMultiplier={2} onClose={onClose}>
      <Text style={[styles.reference, { color: colors.textSecondary }]}>{reference}</Text>
      <ScrollView bounces={false}>
        {RAIL_ITEMS.map(({ action, icon, label }) => {
          const on = isActionOn(action, { starred, saved, hasNote });
          return (
            <Pressable
              key={action}
              onPress={() => {
                // Close first: some actions open a sheet of their own.
                onClose();
                onAction(action);
              }}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityState={isToggleAction(action) ? { selected: on } : undefined}
              style={[styles.row, { minHeight: Math.max(m.button, MinTapTarget), borderBottomColor: colors.hairline }]}>
              <Feather name={icon} size={m.icon} color={on ? colors.gold : colors.text} />
              <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  reference: { fontFamily: Fonts.sans, fontSize: 15, paddingBottom: Spacing.two },
  label: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 17 },
});
