/** A labelled text field for the sign-in screens. The label is what a screen reader announces. */
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Field({ label, style, ...input }: TextInputProps & { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.field, style]}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, { borderColor: colors.hairline, color: colors.text }]}
        {...input}
      />
    </View>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <Text accessibilityLiveRegion="polite" style={[styles.error, { color: colors.error }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: MinTapTarget,
    fontFamily: Fonts.sans,
    fontSize: 17,
  },
  error: { fontFamily: Fonts.sans, fontSize: 14, lineHeight: 20 },
});
