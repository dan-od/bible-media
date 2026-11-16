/**
 * A brief status toast (e.g. "Saved to your collection"). Appears above the tab
 * bar, announced politely to screen readers.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Toast({ message }: { message: string }) {
  const { colors } = useTheme();
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={[styles.toast, { backgroundColor: colors.text }]} accessibilityLiveRegion="polite" accessibilityRole="alert">
        <Text style={[styles.text, { color: colors.background }]}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.five, right: Spacing.five, bottom: Spacing.six },
  toast: { borderRadius: 12, paddingVertical: Spacing.three, paddingHorizontal: Spacing.four },
  text: { fontFamily: Fonts.sansMedium, fontSize: 14 },
});
