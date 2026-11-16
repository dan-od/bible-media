/**
 * Primary / ghost button in the product's language. Min height 52 (44 for the
 * small variant), pill shape, Hanken semibold.
 */
import { Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Fonts, MinTapTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  size?: 'lg' | 'sm';
  style?: ViewStyle;
}) {
  const { colors } = useTheme();
  const ghost = variant === 'ghost';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.base,
        size === 'sm' ? styles.sm : styles.lg,
        ghost
          ? { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.hairline }
          : { backgroundColor: colors.text },
        pressed && { opacity: 0.85 },
        style,
      ]}>
      <Text style={[styles.label, { color: ghost ? colors.text : colors.background }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: 999 },
  lg: { minHeight: 52, paddingHorizontal: 20 },
  sm: { minHeight: MinTapTarget, paddingHorizontal: 20 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
});
