import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, Field } from '@/components/account/Field';
import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/theme';
import { useAccount } from '@/hooks/use-account';
import { looksLikeCode } from '@/lib/account-copy';

export default function SignInCode() {
  const { email = '' } = useLocalSearchParams<{ email: string }>();
  const { verifyCode, sendCode, finishSignIn } = useAccount();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  const onVerify = async () => {
    if (busy) return;
    if (!looksLikeCode(code)) return setError('The code is six digits.');
    setBusy(true);
    setError(null);
    try {
      const pending = await verifyCode(email, code);
      if (pending.needsProfile) router.replace('/account/about');
      else if (pending.needsCopy) router.replace('/account/copy');
      else {
        // Nothing on this phone to copy, and this account already agreed: just sign in.
        await finishSignIn();
        router.dismissTo('/you');
      }
    } catch {
      setError('That code didn’t work. Codes last 10 minutes; you can send a new one.');
    } finally {
      setBusy(false);
    }
  };

  const onResend = async () => {
    try {
      await sendCode(email);
      setResent(true);
      setError(null);
    } catch {
      setError('A new code couldn’t be sent. Check your connection.');
    }
  };

  return (
    <StepScaffold
      title="Enter your code"
      subtitle={`We sent it to ${email}.`}
      actions={
        <View style={styles.row}>
          <Button label={resent ? 'Sent again' : 'Send again'} variant="ghost" size="sm" onPress={onResend} style={styles.flex1} />
          <Button label={busy ? 'Checking…' : 'Continue'} onPress={onVerify} style={styles.flex2} />
        </View>
      }>
      <Field
        label="Six-digit code"
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
        keyboardType="number-pad"
        autoComplete="one-time-code"
        textContentType="oneTimeCode"
        returnKeyType="done"
        onSubmitEditing={onVerify}
        autoFocus
      />
      <ErrorLine message={error} />
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  flex1: { flex: 1 },
  flex2: { flex: 2 },
});
