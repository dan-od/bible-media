import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/themed';
import { Button } from '@/components/ui/Button';
import { APP_NAME } from '@/constants/app';
import { Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export default function Welcome() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <View style={styles.mid}>
        <Text style={[styles.word, { color: colors.text }]}>{APP_NAME}</Text>
        <Text style={[styles.tagline, { color: colors.textSecondary }]}>
          Scripture that meets you where you are, shared only with people you know.
        </Text>
        <Text style={[styles.verse, { color: colors.textSecondary }]}>
          &ldquo;Thy word is a lamp unto my feet, and a light unto my path.&rdquo; Psalm 119:105
        </Text>
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.four }]}>
        <Button label="Get started" onPress={() => router.push('/onboarding/heart')} />
        <Button label="I have a group invite" variant="ghost" onPress={() => router.push('/onboarding/invite')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mid: { flex: 1, alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: Spacing.six, gap: Spacing.four },
  word: { fontFamily: Fonts.serifDisplay, fontSize: 44, letterSpacing: -0.8 },
  tagline: { fontFamily: Fonts.sans, fontSize: 17, lineHeight: 24, maxWidth: 300 },
  verse: { fontFamily: Fonts.serifTextItalic, fontStyle: 'italic', fontSize: 15, lineHeight: 23, maxWidth: 300 },
  actions: { paddingHorizontal: Spacing.six, gap: Spacing.three },
});
