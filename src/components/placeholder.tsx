import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ThemedText } from '@/components/themed';
import { Spacing } from '@/constants/theme';

/**
 * Step-1 placeholder screen. Left-aligned (per spec), display serif title.
 * Real screen content arrives in later build steps.
 */
export function Placeholder({ title, note }: { title: string; note: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Screen style={{ paddingHorizontal: Spacing.five, paddingTop: insets.top + Spacing.five }}>
      <ThemedText variant="display" style={{ fontSize: 34, lineHeight: 40 }}>
        {title}
      </ThemedText>
      <ThemedText variant="body" muted style={{ fontSize: 15, lineHeight: 22, marginTop: Spacing.three }}>
        {note}
      </ThemedText>
    </Screen>
  );
}
