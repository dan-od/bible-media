/**
 * The seven passage actions as a sheet, opened from the collapsed "Actions"
 * control at the end of a passage (see FeedCard). Same actions, same order and
 * same toggled states as the rail, but every row has a text label beside its
 * glyph: at the accessibility text sizes nobody should have to identify an icon.
 * Rows grow with the text size and the sheet's body scrolls if they outgrow it.
 */
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { isActionOn, isToggleAction, RAIL_ITEMS, type RailAction } from './ActionRail';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ACTIONS_TITLE } from '@/lib/sheet-copy';
import { SHEET_TYPE, type SheetLayout } from '@/lib/sheet-fit';
import { railMetrics } from '@/lib/verse-fit';

export function ActionSheet({
  reference,
  starred,
  saved,
  hasNote,
  layout,
  onAction,
  onClose,
}: {
  /** The passage the actions apply to, shown under the title. */
  reference: string;
  starred: boolean;
  saved: boolean;
  hasNote: boolean;
  layout: SheetLayout;
  onAction: (action: RailAction) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const m = railMetrics(layout.actionScale);
  return (
    <BottomSheet title={ACTIONS_TITLE} layout={layout} onClose={onClose}>
      <Text
        maxFontSizeMultiplier={layout.reference.maxMultiplier}
        style={[styles.reference, { color: colors.textSecondary }]}>
        {reference}
      </Text>
      <View>
        {RAIL_ITEMS.map(({ action, icon, label }) => {
          const on = isActionOn(action, { starred, saved, hasNote });
          return (
            <Pressable
              key={action}
              testID="action-row"
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
      </View>
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
  reference: { fontFamily: Fonts.sans, fontSize: SHEET_TYPE.reference.size, paddingBottom: Spacing.two },
  label: { flex: 1, fontFamily: Fonts.sansMedium, fontSize: 17 },
});
