import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { OptionCard } from '@/components/onboarding/OptionCard';
import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/theme';
import { BIBLE_LEVELS, type BibleLevel } from '@/data/profile';
import { selection } from '@/lib/haptics';
import { useProfile } from '@/hooks/use-profile';

export default function Level() {
  const { profile, update } = useProfile();
  const [level, setLevel] = useState<BibleLevel>(profile.level);

  const onContinue = () => {
    update({ level });
    router.push('/onboarding/translation');
  };

  return (
    <StepScaffold
      step="Step 2 of 5"
      title="Where are you with the Bible?"
      actions={<Button label="Continue" onPress={onContinue} />}>
      <View style={styles.options} accessibilityRole="radiogroup">
        {BIBLE_LEVELS.map((opt) => (
          <OptionCard
            key={opt.id}
            title={opt.title}
            detail={opt.detail}
            selected={level === opt.id}
            onPress={() => {
              selection();
              setLevel(opt.id);
            }}
          />
        ))}
      </View>
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  options: { gap: Spacing.three },
});
