/**
 * A bottom sheet: scrim + a panel that rises from the bottom. Dismiss by the
 * scrim or the X. Honours reduce-motion (no travel; the scrim still fades).
 * Rendered as an absolute overlay on the screen that opened it.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

export function BottomSheet({
  title,
  titleMaxFontSizeMultiplier,
  onClose,
  children,
  footer,
}: {
  title: string;
  /** Caps how far the system text size scales the title (unset: no cap). */
  titleMaxFontSizeMultiplier?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { colors, scheme } = useTheme();
  const reduced = useReducedMotion();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  const scrimOpacity = anim;
  const translateY = reduced
    ? 0
    : anim.interpolate({ inputRange: [0, 1], outputRange: [600, 0] });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: scheme === 'dark' ? 'rgba(0,0,0,0.55)' : 'rgba(20,20,19,0.38)', opacity: scrimOpacity },
        ]}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Close" onPress={onClose} />
      </Animated.View>

      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.sheet,
          { backgroundColor: colors.background, transform: [{ translateY }] },
        ]}>
        <View style={[styles.grab, { backgroundColor: colors.hairline }]} />
        <View style={styles.head}>
          <Text maxFontSizeMultiplier={titleMaxFontSizeMultiplier} style={[styles.title, { color: colors.text }]}>
            {title}
          </Text>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={6}
            style={styles.x}>
            <Feather name="x" size={22} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.body}>{children}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '88%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: Spacing.five,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.six,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -12 },
    shadowOpacity: 0.18,
    shadowRadius: 40,
    elevation: 24,
  },
  grab: { alignSelf: 'center', width: 36, height: 4, borderRadius: 999, marginBottom: Spacing.four },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingBottom: Spacing.three },
  title: { flex: 1, fontFamily: Fonts.serifDisplay, fontSize: 30, lineHeight: 34 },
  x: { width: MinTapTarget, height: MinTapTarget, alignItems: 'flex-end', justifyContent: 'center' },
  body: { flexShrink: 1 },
  footer: { paddingTop: Spacing.four },
});
