/**
 * Compare versions — the same passage in every translation, honest about which
 * are licensed. Public-domain texts are real; a public-domain translation we
 * haven't ingested yet says so rather than faking it; licensed rows are inert.
 * Picking an available version switches the feed card to it.
 *
 * The rows are Scripture, held by their measured ceiling (lib/sheet-fit). Each
 * row's head wraps, so at the largest sizes the licence drops under the version
 * rather than running off the edge.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Fonts, Spacing } from '@/constants/theme';
import { getTranslations } from '@/data/verseStore';
import type { Passage, TranslationId } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { compareTitle } from '@/lib/sheet-copy';
import { SHEET_TYPE, type SheetLayout } from '@/lib/sheet-fit';

export function CompareSheet({
  passage,
  current,
  layout,
  onSelect,
  onClose,
}: {
  passage: Passage;
  current: TranslationId;
  layout: SheetLayout;
  onSelect: (id: TranslationId) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <BottomSheet title={compareTitle(passage)} layout={layout} onClose={onClose}>
      <View>
        {getTranslations().map((t) => {
          const own = passage.text[t.id];
          const body = t.locked
            ? null
            : own
              ? own.verses.map((v) => v.text).join(' ')
              : 'Coming with the full download in this translation.';
          const disabled = t.locked || !own;
          return (
            <Pressable
              key={t.id}
              disabled={disabled}
              onPress={() => {
                onSelect(t.id);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityState={{ disabled, selected: t.id === current }}
              style={[styles.row, { borderTopColor: colors.hairline, opacity: disabled ? 0.5 : 1 }]}>
              <View testID="compare-row-head" style={styles.rowHead}>
                <Text testID="compare-id" style={[styles.id, { color: colors.text }]}>
                  {t.id}
                  {t.id === current ? ' · current' : ''}
                </Text>
                <Text testID="compare-licence" style={[styles.note, { color: colors.textSecondary }]}>
                  {t.licenseNote}
                </Text>
              </View>
              {body ? (
                <Text maxFontSizeMultiplier={layout.compare.maxMultiplier} style={[styles.text, { color: colors.text }]}>
                  {body}
                </Text>
              ) : null}
            </Pressable>
          );
        })}
        {/* In the scrolling body, not pinned: a note, not an action. */}
        <Text style={[styles.foot, { color: colors.textSecondary }]}>
          Licensed versions arrive through YouVersion Platform, free for approved apps.
        </Text>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.four, gap: Spacing.two },
  rowHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: Spacing.three,
  },
  id: { flexShrink: 1, fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  note: { flexShrink: 1, fontFamily: Fonts.sans, fontSize: 12 },
  text: { fontFamily: Fonts.serifText, fontSize: SHEET_TYPE.compare.size, lineHeight: SHEET_TYPE.compare.lineHeight },
  foot: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18, paddingTop: Spacing.four },
});
