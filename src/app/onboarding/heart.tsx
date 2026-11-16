import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/components/onboarding/Chip';
import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { canContinueHeart, HEART_THEMES } from '@/data/profile';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function Heart() {
  const { colors } = useTheme();
  const { profile, update } = useProfile();
  const [situations, setSituations] = useState<string[]>(profile.situations);
  const [freeText, setFreeText] = useState(profile.freeText);
  const [showHint, setShowHint] = useState(false);

  const toggle = (theme: string) =>
    setSituations((prev) => (prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]));

  const onContinue = () => {
    if (!canContinueHeart(situations, freeText)) {
      setShowHint(true);
      return;
    }
    update({ situations, freeText });
    router.push('/onboarding/level');
  };

  return (
    <StepScaffold
      step="Step 1 of 5"
      title="What's on your heart right now?"
      subtitle="Tap as many as fit. You can change these any time."
      actions={
        <View style={styles.buttonRow}>
          <Button label="Skip" variant="ghost" size="sm" onPress={() => router.push('/onboarding/level')} style={styles.flex1} />
          <Button label="Continue" onPress={onContinue} style={styles.flex2} />
        </View>
      }>
      <View style={styles.chips}>
        {HEART_THEMES.map((t) => (
          <Chip key={t} label={t} selected={situations.includes(t)} onPress={() => toggle(t)} />
        ))}
      </View>

      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.textSecondary }]}>Or say it your own way</Text>
        <TextInput
          value={freeText}
          onChangeText={setFreeText}
          multiline
          placeholder="e.g. I just moved city and I don't know anyone"
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { borderColor: colors.hairline, color: colors.text }]}
        />
        {showHint && (
          <View style={styles.hint}>
            <Feather name="alert-triangle" size={15} color={colors.error} />
            <Text style={[styles.hintText, { color: colors.error }]}>
              Pick at least one, or type a few words, so your feed has somewhere to start.
            </Text>
          </View>
        )}
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  field: { gap: Spacing.two },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    minHeight: 84,
    fontFamily: Fonts.serifText,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  hint: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center', marginTop: Spacing.one },
  hintText: { flex: 1, fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  buttonRow: { flexDirection: 'row', gap: Spacing.three },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
