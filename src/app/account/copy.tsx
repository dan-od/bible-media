import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ErrorLine } from '@/components/account/Field';
import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Fonts } from '@/constants/theme';
import { useAccount } from '@/hooks/use-account';
import { useTheme } from '@/hooks/use-theme';
import { COPY_LINE } from '@/lib/account-copy';

/**
 * The moment the person's data stops being only on their phone. One honest line,
 * said before anything is copied; agreeing records consent on the server, which the
 * claim requires. Not now backs out: nothing is copied and no one is signed in.
 */
export default function CopyToAccount() {
  const { colors } = useTheme();
  const { agreeAndCopy, cancelSignIn } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCopy = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await agreeAndCopy();
      router.dismissTo('/you');
    } catch {
      setError('Couldn’t reach your account. Check your connection and try again; nothing has been copied yet.');
    } finally {
      setBusy(false);
    }
  };

  const onNotNow = async () => {
    await cancelSignIn();
    router.dismissTo('/you');
  };

  return (
    <StepScaffold
      title="Before we copy anything"
      actions={
        <>
          <Button label={busy ? 'Copying…' : 'Copy to my account'} onPress={onCopy} />
          <Button label="Not now" variant="ghost" size="sm" onPress={onNotNow} />
        </>
      }>
      <Text style={[styles.line, { color: colors.text }]}>{COPY_LINE}</Text>
      <ErrorLine message={error} />
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  line: { fontFamily: Fonts.serifText, fontSize: 19, lineHeight: 28 },
});
