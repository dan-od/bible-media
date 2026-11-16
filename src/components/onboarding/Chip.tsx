/**
 * A toggle chip (aria-pressed), used on the "what's on your heart" step. Min
 * height 44. Selected fills with ink.
 */
import { Pressable, StyleSheet, Text } from 'react-native';

import { Fonts, MinTapTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        { borderColor: selected ? colors.text : colors.hairline, backgroundColor: selected ? colors.text : 'transparent' },
      ]}>
      <Text style={[styles.label, { color: selected ? colors.background : colors.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: MinTapTarget,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontFamily: Fonts.sans, fontSize: 14 },
});
