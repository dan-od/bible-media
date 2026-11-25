/**
 * The action rail — a vertical column beside the verse, so nothing covers the
 * passage (the spec keeps actions a rail, not a sheet). Every button is 44x44.
 * Star is a toggle (gold when on); the rest open sheets or fire a toast.
 */
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { MinTapTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type RailAction = 'star' | 'save' | 'note' | 'repost' | 'send' | 'versions' | 'context';

const ITEMS: { action: RailAction; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { action: 'star', icon: 'star', label: 'Star' },
  { action: 'save', icon: 'bookmark', label: 'Save' },
  { action: 'note', icon: 'edit-3', label: 'Write a note' },
  { action: 'repost', icon: 'repeat', label: 'Repost' },
  { action: 'send', icon: 'send', label: 'Send to a friend' },
  { action: 'versions', icon: 'layers', label: 'Other versions' },
  { action: 'context', icon: 'info', label: 'Context' },
];

/** Rail geometry at a given scale (1 = default text size): 44pt buttons, 23pt glyphs, 8pt gaps. */
export function railMetrics(scale: number) {
  const button = Math.round(MinTapTarget * scale);
  const gap = Math.round(8 * scale);
  return { button, icon: Math.round(23 * scale), gap, height: ITEMS.length * button + (ITEMS.length - 1) * gap };
}

export function ActionRail({
  starred,
  saved,
  hasNote,
  onAction,
  scale = 1,
}: {
  starred: boolean;
  saved: boolean;
  hasNote: boolean;
  onAction: (action: RailAction) => void;
  /** Grows the buttons and glyphs with the system text size (never below 44pt). */
  scale?: number;
}) {
  const m = railMetrics(scale);
  const { colors } = useTheme();
  const activeFor = (action: RailAction) =>
    (action === 'star' && starred) || (action === 'save' && saved) || (action === 'note' && hasNote);
  return (
    <View style={[styles.rail, { gap: m.gap }]}>
      {ITEMS.map(({ action, icon, label }) => {
        const on = activeFor(action);
        const toggleState = action === 'star' || action === 'save' || action === 'note';
        return (
          <Pressable
            key={action}
            onPress={() => onAction(action)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={toggleState ? { selected: on } : undefined}
            hitSlop={6}
            style={[styles.button, { width: m.button, height: m.button }]}>
            {/* Gold colour marks the active state (glyph-font icons have no fill). */}
            <Feather name={icon} size={m.icon} color={on ? colors.gold : colors.text} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: { alignItems: 'center' },
  button: {
    width: MinTapTarget,
    height: MinTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
  },
});
