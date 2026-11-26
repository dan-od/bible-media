/**
 * The You tab's account row: sign in, or who's signed in and sign out. Signing out
 * clears this phone's copies of what's in the account (it's on the server). If
 * something hasn't reached the account yet, it says so and asks first.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ThemedText } from '@/components/themed';
import { Button } from '@/components/ui/Button';
import { Fonts, Spacing } from '@/constants/theme';
import { useAccount } from '@/hooks/use-account';
import { useTheme } from '@/hooks/use-theme';

export function AccountSection() {
  const { colors } = useTheme();
  const { available, account, signOut } = useAccount();
  const [unsent, setUnsent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!available) return null;

  const onSignOut = async (anyway = false) => {
    if (busy) return;
    setBusy(true);
    try {
      setUnsent((await signOut(anyway)) === 'unsent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.caps, { color: colors.textSecondary }]}>Account</Text>
      {account ? (
        <View style={[styles.body, { borderTopColor: colors.hairline }]}>
          <ThemedText variant="body" style={styles.line}>
            Signed in as {account.email}
          </ThemedText>
          {unsent ? (
            <>
              <ThemedText variant="body" muted style={styles.detail}>
                Some changes haven’t reached your account yet. If you sign out now they stay on this phone, hidden, until you
                sign in again.
              </ThemedText>
              <View style={styles.row}>
                <Button label="Stay signed in" variant="ghost" size="sm" onPress={() => setUnsent(false)} />
                <Button label="Sign out anyway" size="sm" onPress={() => onSignOut(true)} style={styles.flex1} />
              </View>
            </>
          ) : (
            <>
              <ThemedText variant="body" muted style={styles.detail}>
                Signing out removes your stars, saves, notes and what you’re going through from this phone. They stay in your
                account.
              </ThemedText>
              <Button label={busy ? 'Signing out…' : 'Sign out'} variant="ghost" size="sm" onPress={() => onSignOut()} />
            </>
          )}
        </View>
      ) : (
        <View style={[styles.body, { borderTopColor: colors.hairline }]}>
          <ThemedText variant="body" muted style={styles.detail}>
            Everything here is on this phone only. Sign in to keep it if you change or lose your phone.
          </ThemedText>
          <Button label="Sign in" variant="ghost" size="sm" onPress={() => router.push('/account')} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  caps: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  body: { paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing.three },
  line: { fontSize: 16, lineHeight: 22 },
  detail: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  flex1: { flexGrow: 1 },
});
