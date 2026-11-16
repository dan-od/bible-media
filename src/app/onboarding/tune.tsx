import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { addTunedThemes, buildTuneDeck } from '@/data/profile';
import { tapLight } from '@/lib/haptics';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

const DECK = buildTuneDeck();

export default function Tune() {
  const { colors } = useTheme();
  const { profile, update } = useProfile();
  const [index, setIndex] = useState(0);
  const [tuned, setTuned] = useState<string[]>(profile.tunedThemes);

  const finish = (themes: string[]) => {
    update({ tunedThemes: themes });
    router.push('/onboarding/notify');
  };

  const decide = (likes: boolean) => {
    tapLight();
    const card = DECK[index];
    const nextTuned = likes ? addTunedThemes(tuned, card) : tuned;
    setTuned(nextTuned);
    if (index + 1 >= DECK.length) finish(nextTuned);
    else setIndex(index + 1);
  };

  const card = DECK[index];
  const firstVerse = card.passage.text.KJV.verses[0];

  return (
    <StepScaffold
      actions={
        <Button
          label="Skip the rest"
          variant="ghost"
          onPress={() => finish(tuned)}
        />
      }
      title="Swipe to tune"
      step="Step 4 of 5"
      subtitle="Tap what speaks to you. This shapes your feed — nothing is locked.">
      <View style={styles.counterRow}>
        <Text style={[styles.counter, { color: colors.textSecondary }]}>
          {index + 1} of {DECK.length}
        </Text>
      </View>

      <View style={styles.deck}>
        <View style={[styles.ghost, styles.ghost2, { borderColor: colors.hairline }]} />
        <View style={[styles.ghost, styles.ghost1, { borderColor: colors.hairline }]} />
        <View style={[styles.top, { borderColor: colors.hairline, backgroundColor: colors.background }]}>
          <Text style={[styles.verse, { color: colors.text }]}>{firstVerse.text}</Text>
          <Text style={[styles.ref, { color: colors.textSecondary }]}>{card.passage.reference}</Text>
        </View>
      </View>

      <View style={styles.decideRow}>
        <Button label="Not now" variant="ghost" onPress={() => decide(false)} style={styles.flex1} />
        <Button label="This speaks to me" onPress={() => decide(true)} style={styles.flex1} />
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  counterRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  counter: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  deck: { minHeight: 280, justifyContent: 'center' },
  ghost: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: 18, borderWidth: 1 },
  ghost1: { marginHorizontal: 3, marginBottom: 14, opacity: 0.75 },
  ghost2: { marginHorizontal: 6, marginBottom: 28, opacity: 0.5 },
  top: { borderRadius: 18, borderWidth: 1, padding: 22, gap: Spacing.three, justifyContent: 'center', minHeight: 240 },
  verse: { fontFamily: Fonts.serifDisplay, fontSize: 26, lineHeight: 33 },
  ref: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  decideRow: { flexDirection: 'row', gap: Spacing.three },
  flex1: { flex: 1 },
});
