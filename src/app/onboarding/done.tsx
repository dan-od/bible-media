import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components/themed';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { BIBLE_LEVELS } from '@/data/profile';
import { resolveThemes } from '@/data/search';
import { getTranslation } from '@/data/verseStore';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function Done() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { profile, update } = useProfile();

  const levelTitle = BIBLE_LEVELS.find((l) => l.id === profile.level)?.title.toLowerCase() ?? '';
  const translationName = getTranslation(profile.translationId)?.name ?? '';
  // The chips, or — when the reader answered in their own words instead — the
  // themes those words reach (the same ones that now shape their feed).
  const named = profile.situations.length ? profile.situations : resolveThemes(profile.freeText);
  const situationText = named.length ? named.join(' and ').toLowerCase() : 'a fresh start';
  const summary = `${situationText}, ${levelTitle}, ${translationName}.`;

  const openFeed = () => {
    update({ onboarded: true });
    router.replace('/');
  };

  return (
    <Screen>
      {/* A genuine checkpoint — one of the few centred states the spec allows. */}
      <View style={styles.mid}>
        <Feather name="check" size={40} color={colors.gold} />
        <Text style={[styles.title, { color: colors.text }]}>Your feed is ready</Text>
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {capitalise(summary)} Change any of it in You › Settings.
        </Text>
      </View>
      <View style={[styles.actions, { paddingBottom: insets.bottom + Spacing.four }]}>
        <Button label="Open my feed" onPress={openFeed} />
      </View>
    </Screen>
  );
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  mid: { flex: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingHorizontal: Spacing.seven, gap: Spacing.four },
  title: { fontFamily: Fonts.serifDisplay, fontSize: 30, lineHeight: 36, textAlign: 'center' },
  body: { fontFamily: Fonts.sans, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  actions: { paddingHorizontal: Spacing.seven },
});
