import { router } from 'expo-router';
import { useRef, useState, type ComponentRef } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ErrorLine, Field } from '@/components/account/Field';
import { StepScaffold } from '@/components/onboarding/StepScaffold';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { useAccount } from '@/hooks/use-account';
import { useTheme } from '@/hooks/use-theme';
import { checkDateOfBirth, DOB_WHY } from '@/lib/account-copy';

/** First sign-in only: the two things an account needs (see create_profile). */
export default function AboutYou() {
  const { colors } = useTheme();
  const { createProfile, cancelSignIn } = useAccount();
  const monthRef = useRef<ComponentRef<typeof TextInput>>(null);
  const yearRef = useRef<ComponentRef<typeof TextInput>>(null);
  const dayRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [name, setName] = useState('');
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onContinue = async () => {
    if (busy) return;
    if (!name.trim()) return setError('Add a name.');
    const dob = checkDateOfBirth(day, month, year);
    if (!dob.ok) return setError(dob.message);
    setBusy(true);
    setError(null);
    try {
      await createProfile(name.trim(), dob.iso);
      router.replace('/account/copy');
    } catch {
      setError('Your account couldn’t be set up. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const onCancel = async () => {
    await cancelSignIn();
    router.dismissTo('/you');
  };

  const digits = (set: (v: string) => void, max: number) => (t: string) => set(t.replace(/\D/g, '').slice(0, max));

  return (
    <StepScaffold
      title="About you"
      subtitle="Just these two, once."
      actions={
        <View style={styles.row}>
          <Button label="Cancel" variant="ghost" size="sm" onPress={onCancel} />
          <Button label={busy ? 'Setting up…' : 'Continue'} onPress={onContinue} style={styles.flex1} />
        </View>
      }>
      <Field
        label="Your name"
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        autoFocus
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => dayRef.current?.focus()}
      />
      <View style={styles.group} accessibilityRole="none">
        <Text style={[styles.label, { color: colors.textSecondary }]}>Date of birth</Text>
        <View style={styles.dob}>
          {/* A number pad has no return key; "done" gives it one on iOS, so the keyboard
              never hides Continue with no way past it. */}
          <Field
            ref={dayRef}
            label="Day"
            value={day}
            onChangeText={digits(setDay, 2)}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => monthRef.current?.focus()}
            placeholder="DD"
            style={styles.part}
          />
          <Field
            ref={monthRef}
            label="Month"
            value={month}
            onChangeText={digits(setMonth, 2)}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => yearRef.current?.focus()}
            placeholder="MM"
            style={styles.part}
          />
          <Field
            ref={yearRef}
            label="Year"
            value={year}
            onChangeText={digits(setYear, 4)}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={onContinue}
            placeholder="YYYY"
            style={styles.year}
          />
        </View>
        <Text style={[styles.why, { color: colors.textSecondary }]}>{DOB_WHY}</Text>
      </View>
      <ErrorLine message={error} />
    </StepScaffold>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.three },
  flex1: { flex: 1 },
  group: { gap: Spacing.two },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
  // Wraps at large text sizes rather than squeezing the fields.
  dob: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  part: { flexGrow: 1, flexBasis: 72 },
  year: { flexGrow: 2, flexBasis: 104 },
  why: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 19 },
});
