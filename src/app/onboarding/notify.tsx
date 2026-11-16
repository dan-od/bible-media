import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

export default function Notify() {
  const { colors } = useTheme();
  const { update } = useProfile();

  // NOTE: we store the preference only. Actually requesting OS permission and
  // scheduling the daily local notification is native work (expo-notifications)
  // and is UNVERIFIED until run on a device — wired in a later step.
  const choose = (morningVerse: boolean) => {
    update({ morningVerse });
    router.push('/onboarding/done');
  };

  return (
    <StepScaffold
      step="Step 5 of 5"
      title="A verse each morning?"
      subtitle="One notification a day, on your lock screen. Nothing else, and no badges."
      actions={
        <>
          <Button label="Turn on the morning verse" onPress={() => choose(true)} />
          <Button label="Not now" variant="ghost" onPress={() => choose(false)} />
        </>
      }>
      <View style={[styles.preview, { borderColor: colors.hairline }]}>
        <Feather name="bell" size={20} color={colors.gold} />
        <View style={styles.previewText}>
          <Text style={[styles.time, { color: colors.text }]}>7:00 am · Psalm 31:24</Text>
          <Text style={[styles.verse, { color: colors.textSecondary }]}>
            Be of good courage, and he shall strengthen your heart…
          </Text>
        </View>
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  preview: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start', borderWidth: 1, borderRadius: 16, padding: 16 },
  previewText: { flex: 1, gap: Spacing.one },
  time: { fontFamily: Fonts.sansSemiBold, fontSize: 15 },
  verse: { fontFamily: Fonts.serifText, fontSize: 14, lineHeight: 20 },
});
