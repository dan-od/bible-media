/**
 * A selectable option card (radio semantics): a bordered card whose border
 * thickens to 2px and shows a tick when chosen. Used for Bible level and the
 * translation choice.
 */
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function OptionCard({
  title,
  detail,
  selected,
  onPress,
  accessibilityLabel,
  serifDetail = false,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Render the detail in the text serif (used for showing a verse). */
  serifDetail?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={accessibilityLabel ?? title}
      style={[
        styles.card,
        {
          borderColor: selected ? colors.text : colors.hairline,
          borderWidth: selected ? 2 : 1,
          padding: selected ? 17 : 18,
        },
      ]}>
      <View style={styles.text}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text
          style={[
            serifDetail
              ? { fontFamily: Fonts.serifText, fontSize: 18, lineHeight: 26, color: colors.text }
              : { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19, color: colors.textSecondary },
          ]}>
          {detail}
        </Text>
      </View>
      {selected ? <Feather name="check" size={20} color={colors.text} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start', borderRadius: 16 },
  text: { flex: 1, gap: Spacing.one },
  title: { fontFamily: Fonts.sansSemiBold, fontSize: 16 },
});
