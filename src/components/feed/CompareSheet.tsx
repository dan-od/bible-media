/**
 * Compare versions — the same passage in every translation, honest about which
 * are licensed. Public-domain texts are real; a public-domain translation we
 * haven't ingested yet says so rather than faking it; licensed rows are inert.
 * Picking an available version switches the feed card to it.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Fonts, Spacing } from '@/constants/theme';
import { getTranslations } from '@/data/verseStore';
import type { Passage, TranslationId } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';

export function CompareSheet({
  passage,
  current,
  onSelect,
  onClose,
}: {
  passage: Passage;
  current: TranslationId;
  onSelect: (id: TranslationId) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <BottomSheet
      title={passage.reference}
      onClose={onClose}
      footer={
        <Text style={[styles.foot, { color: colors.textSecondary }]}>
          Licensed versions arrive through YouVersion Platform, free for approved apps.
        </Text>
      }>
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
              <View style={styles.rowHead}>
                <Text style={[styles.id, { color: colors.text }]}>
                  {t.id}
                  {t.id === current ? ' · current' : ''}
                </Text>
                <Text style={[styles.note, { color: colors.textSecondary }]}>{t.licenseNote}</Text>
              </View>
              {body ? <Text style={[styles.text, { color: colors.text }]}>{body}</Text> : null}
            </Pressable>
          );
        })}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  row: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: Spacing.four, gap: Spacing.two },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: Spacing.three },
  id: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  note: { fontFamily: Fonts.sans, fontSize: 12 },
  text: { fontFamily: Fonts.serifText, fontSize: 17, lineHeight: 26 },
  foot: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
});
