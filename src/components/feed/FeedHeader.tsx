/**
 * Feed header: the wordmark (display serif) and the For you / Circle top tabs.
 * The wordmark uses APP_NAME — the product name is still a single constant.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { APP_NAME } from '@/constants/app';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type FeedTab = 'foryou' | 'circle';

const TABS: { id: FeedTab; label: string }[] = [
  { id: 'foryou', label: 'For you' },
  { id: 'circle', label: 'Circle' },
];

export function FeedHeader({ active, onChange }: { active: FeedTab; onChange: (t: FeedTab) => void }) {
  const { colors } = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[styles.word, { color: colors.text }]}>{APP_NAME}</Text>
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map((t) => {
          const on = t.id === active;
          return (
            <Pressable
              key={t.id}
              onPress={() => onChange(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={styles.tab}>
              <Text
                style={[
                  styles.tabLabel,
                  { color: on ? colors.text : colors.textSecondary },
                  on && { fontFamily: Fonts.sansSemiBold, textDecorationLine: 'underline' },
                ]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
  },
  word: { fontFamily: Fonts.serifDisplay, fontSize: 28, letterSpacing: -0.3 },
  tabs: { flexDirection: 'row', gap: Spacing.five },
  tab: { minHeight: MinTapTarget, justifyContent: 'center' },
  tabLabel: { fontFamily: Fonts.sans, fontSize: 15 },
});
