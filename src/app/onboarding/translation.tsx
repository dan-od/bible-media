import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { getAvailableTranslations, getPassageById } from '@/data/verseStore';
import type { TranslationId } from '@/data/types';
import { selection } from '@/lib/haptics';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

// Show the same verse in each version — the one with real alternate text.
const SAMPLE = getPassageById('psalm-31-24')!;

export default function Translation() {
  const { colors } = useTheme();
  const { profile, update } = useProfile();
  const [translationId, setTranslationId] = useState<TranslationId>(profile.translationId);

  const onContinue = () => {
    update({ translationId });
    router.push('/onboarding/tune');
  };

  return (
    <StepScaffold
      step="Step 3 of 5"
      title="Which one speaks to you?"
      subtitle="Same verse, three ways. You can read any verse in the others later."
      actions={<Button label="Continue" onPress={onContinue} />}>
      <View style={styles.options}>
        {getAvailableTranslations().map((t) => {
          const selected = t.id === translationId;
          const text = SAMPLE.text[t.id]?.verses.map((v) => v.text).join(' ') ?? SAMPLE.text.KJV.verses.map((v) => v.text).join(' ');
          return (
            <Pressable
              key={t.id}
              onPress={() => {
                selection();
                setTranslationId(t.id);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={`Choose ${t.name}`}
              style={[
                styles.card,
                {
                  borderColor: selected ? colors.text : colors.hairline,
                  borderWidth: selected ? 2 : 1,
                  padding: selected ? 17 : 18,
                },
              ]}>
              <Text style={[styles.verse, { color: colors.text }]}>{text}</Text>
              <Text style={[styles.meta, { color: colors.textSecondary }]}>
                {t.id} · {t.licenseNote}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  options: { gap: Spacing.three },
  card: { borderRadius: 16, gap: Spacing.three },
  verse: { fontFamily: Fonts.serifText, fontSize: 18, lineHeight: 26 },
  meta: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
});
