/**
 * A bottom sheet: scrim + a panel that rises from the bottom. Dismiss by the
 * scrim or the X. Honours reduce-motion (no travel; the scrim still fades).
 * Rendered as an absolute overlay on the screen that opened it.
 *
 * The body scrolls when it outgrows the sheet, so nothing is clipped at the
 * largest text sizes. The title is held by its measured ceiling (lib/sheet-fit,
 * at most 60pt); at the accessibility sizes the close button moves to its own
 * row above it, so the title has the full width.
 */
import { Feather } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { SHEET_TYPE, type SheetLayout } from '@/lib/sheet-fit';

export function BottomSheet({
  title,
  layout,
  onClose,
  children,
  footer,
}: {
  title: string;
  layout: SheetLayout;
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

  const close = (
    <Pressable
      testID="sheet-close"
      onPress={onClose}
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={6}
      style={styles.x}>
      <Feather name="x" size={22} color={colors.text} />
    </Pressable>
  );

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
        <View testID="sheet-head" style={layout.accessible ? styles.headStacked : styles.head}>
          {layout.accessible ? <View style={styles.closeRow}>{close}</View> : null}
          <Text
            testID="sheet-title"
            maxFontSizeMultiplier={layout.title.maxMultiplier}
            style={[styles.title, !layout.accessible && styles.titleBeside, { color: colors.text }]}>
            {title}
          </Text>
          {layout.accessible ? null : close}
        </View>
        <ScrollView testID="sheet-body" style={styles.body} bounces={false} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
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
  headStacked: { flexDirection: 'column', paddingBottom: Spacing.three },
  closeRow: { alignItems: 'flex-end' },
  // flex: 1 only in the row; in the stacked column it would collapse the title.
  titleBeside: { flex: 1 },
  title: {
    fontFamily: Fonts.serifDisplay,
    fontSize: SHEET_TYPE.title.size,
    lineHeight: SHEET_TYPE.title.lineHeight,
  },
  x: { width: MinTapTarget, height: MinTapTarget, alignItems: 'flex-end', justifyContent: 'center' },
  body: { flexGrow: 0, flexShrink: 1 },
  footer: { paddingTop: Spacing.four },
});
