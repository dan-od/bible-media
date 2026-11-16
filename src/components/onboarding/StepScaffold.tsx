/**
 * Shared layout for an onboarding step: a scrollable content area (step label,
 * title, optional sub-line, then the step's body) with the actions pinned at the
 * bottom. Each step is one focal task. No counters beyond the "Step N of 5"
 * progress the spec itself shows.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/themed';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function StepScaffold({
  step,
  title,
  subtitle,
  children,
  actions,
}: {
  step?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  actions: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.five }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          {step ? <Text style={[styles.step, { color: colors.textSecondary }]}>{step}</Text> : null}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {subtitle ? <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{subtitle}</Text> : null}
        </View>
        {children}
      </ScrollView>
      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.four }]}>{actions}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.five, gap: Spacing.five, paddingBottom: Spacing.five },
  header: { gap: Spacing.two },
  step: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  title: { fontFamily: Fonts.serifDisplay, fontSize: 32, lineHeight: 36 },
  subtitle: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
  actions: { paddingHorizontal: Spacing.five, paddingTop: Spacing.three, gap: Spacing.three },
});
