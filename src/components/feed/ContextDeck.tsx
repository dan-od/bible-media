/**
 * Context deck — who, where and when, as a swipeable deck of cards rather than a
 * wall of text. Each reviewed fact is a card; the last card lists passages to
 * read alongside. Pager dots sit below: each is a 44x44 tap target (the spec
 * calls these out specifically) even though the dot itself looks small. No AI —
 * this is a tagged, human-reviewed reference set.
 *
 * The facts are held by their measured ceiling (lib/sheet-fit). A word in our
 * own copy too long for that may carry soft hyphens, placed by hand; Android
 * ignores those unless hyphenation is on, so it is on for the facts.
 */
import { type ComponentRef, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import type { Passage } from '@/data/types';
import { useTheme } from '@/hooks/use-theme';
import { contextTitle, readAllLabel } from '@/lib/sheet-copy';
import { SHEET_TYPE, type SheetLayout } from '@/lib/sheet-fit';

export function ContextDeck({
  passage,
  layout,
  onClose,
}: {
  passage: Passage;
  layout: SheetLayout;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState(0);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);

  const context = passage.context;
  const cards: { label: string; body: React.ReactNode }[] = context
    ? [
        ...context.facts.map((f) => ({ label: f.label, body: f.body })),
        ...(context.readAlongside.length
          ? [
              {
                label: 'Read alongside',
                body: (
                  <View style={styles.alongside}>
                    {context.readAlongside.map((ref) => (
                      <Text key={ref} style={[styles.alongsideRef, { color: colors.text }]}>
                        {ref}
                      </Text>
                    ))}
                  </View>
                ),
              },
            ]
          : []),
      ]
    : [];

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setActive(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setActive(i);
  };

  return (
    <BottomSheet
      title={contextTitle(passage)}
      layout={layout}
      onClose={onClose}
      footer={
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={[styles.readAll, { backgroundColor: colors.text }]}>
          <Text
            maxFontSizeMultiplier={layout.readAll.maxMultiplier}
            style={[styles.readAllText, { color: colors.background }]}>
            {readAllLabel(passage)}
          </Text>
        </Pressable>
      }>
      {cards.length === 0 ? (
        <Text style={[styles.empty, { color: colors.textSecondary }]}>
          Context for this passage is coming — reviewed by a person, no AI.
        </Text>
      ) : (
        <View testID="context-deck" onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <ScrollView
              ref={scroller}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}>
              {cards.map((card, i) => (
                <View key={i} style={{ width }}>
                  <View style={styles.card}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>{card.label}</Text>
                    {typeof card.body === 'string' ? (
                      <Text
                        maxFontSizeMultiplier={layout.context.maxMultiplier}
                        android_hyphenationFrequency="normal"
                        style={[styles.body, { color: colors.text }]}>
                        {card.body}
                      </Text>
                    ) : (
                      card.body
                    )}
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {cards.length > 1 && (
            <View style={styles.dots} accessibilityRole="tablist">
              {cards.map((_, i) => (
                <Pressable
                  key={i}
                  onPress={() => goTo(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Card ${i + 1} of ${cards.length}`}
                  accessibilityState={{ selected: i === active }}
                  style={styles.dotTap}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: i === active ? colors.text : colors.hairline },
                    ]}
                  />
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: Spacing.three, gap: Spacing.two, minHeight: 150 },
  label: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  body: { fontFamily: Fonts.serifText, fontSize: SHEET_TYPE.context.size, lineHeight: SHEET_TYPE.context.lineHeight },
  alongside: { flexDirection: 'row', gap: Spacing.five, flexWrap: 'wrap' },
  alongsideRef: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  dotTap: { width: MinTapTarget, height: MinTapTarget, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 999 },
  empty: { fontFamily: Fonts.serifText, fontSize: 16, lineHeight: 24, paddingVertical: Spacing.four },
  readAll: { minHeight: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  readAllText: { fontFamily: Fonts.sansSemiBold, fontSize: SHEET_TYPE.readAll.size, textAlign: 'center' },
});
