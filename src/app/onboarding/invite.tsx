import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/themed';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Group-invite entry point. Joining a group inherits a reading plan and needs
 * accounts + the closed-circle model, which arrive in a later step. For now this
 * is an honest placeholder that lets the reader start on their own.
 */
export default function Invite() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <View style={[styles.body, { paddingTop: insets.top + Spacing.six }]}>
        <Text style={[styles.title, { color: colors.text }]}>Group invites are coming</Text>
        <Text style={[styles.text, { color: colors.textSecondary }]}>
          Joining a group lets you inherit its reading plan and share notes inside a closed circle.
          That arrives with accounts — a later step. You can start on your own now and join a group
          when it&apos;s ready.
        </Text>
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.four }]}>
        <Button label="Start on your own" onPress={() => router.replace('/onboarding/heart')} />
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, paddingHorizontal: Spacing.five, gap: Spacing.four },
  title: { fontFamily: Fonts.serifDisplay, fontSize: 32, lineHeight: 36 },
  text: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22 },
  actions: { paddingHorizontal: Spacing.five, gap: Spacing.three },
});
