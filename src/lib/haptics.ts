/**
 * Thin haptics wrapper. Native only — we no-op on web so the browser preview
 * never buzzes. Per the spec's haptic notes: light tap on star, selection on a
 * version change. NOTE: native haptics are UNVERIFIED until run on a real device
 * (a browser/simulator cannot prove them).
 */
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light impact — e.g. toggling star on. */
export function tapLight() {
  if (enabled) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

/** Selection change — e.g. switching translation. */
export function selection() {
  if (enabled) void Haptics.selectionAsync();
}
