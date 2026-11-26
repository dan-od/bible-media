import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorLine, Field } from '@/components/account/Field';
import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Spacing } from '@/constants/theme';
import { useAccount } from '@/hooks/use-account';
import { looksLikeEmail } from '@/lib/account-copy';

export default function SignInEmail() {
  const { sendCode } = useAccount();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSend = async () => {
    if (busy) return;
    if (!looksLikeEmail(email)) return setError('Enter an email address, like name@example.com.');
    setBusy(true);
    setError(null);
    try {
      await sendCode(email);
      router.push({ pathname: '/account/code', params: { email: email.trim() } });
    } catch {
      setError('The code couldn’t be sent. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <StepScaffold
      title="Sign in"
      subtitle="We’ll email you a six-digit code. No password."
      actions={
        <View style={styles.row}>
          <Button label="Not now" variant="ghost" size="sm" onPress={() => router.back()} style={styles.flex1} />
          <Button label={busy ? 'Sending…' : 'Send code'} onPress={onSend} style={styles.flex2} />
        </View>
      }>
      <Field
        label="Email"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={onSend}
        placeholder="name@example.com"
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
