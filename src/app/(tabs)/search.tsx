import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ThemedText } from '@/components/themed';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { rowTag, searchQuery } from '@/data/search';
import type { Passage } from '@/data/types';
import { renderPassage } from '@/data/verseStore';
import { useCollection } from '@/hooks/use-collection';
import { useOnline } from '@/hooks/use-online';
import { useProfile } from '@/hooks/use-profile';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useSearchHistory } from '@/hooks/use-search-history';
import { useTheme } from '@/hooks/use-theme';
import { tapLight } from '@/lib/haptics';

const SUGGESTIONS = ['afraid', 'alone', 'thankful'];

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const { colors, semantic } = useTheme();
  const { profile } = useProfile();
  const { recordEngagement } = useCollection();
  const { history, record, remove, clear } = useSearchHistory();
  const online = useOnline();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const result = useMemo(() => searchQuery(query), [query]);

  const openingLine = (passage: Passage): string =>
    renderPassage(passage, profile.translationId)
      .verses.map((v) => v.text)
      .join(' ');

  // Opening a result remembers the search and records the themes engaged with
  // (the local signal that shapes the feed — no count is ever shown), then
  // jumps to the feed. The feed can't yet scroll to a specific passage, so a
  // reference lands on the feed rather than on the verse itself.
  const open = (passage: Passage) => {
    if (trimmed) record(trimmed);
    recordEngagement(passage.themeTags);
    tapLight();
    setQuery('');
    router.navigate('/');
  };

  const runRecent = (q: string) => setQuery(q);
  const removeOne = (q: string) => {
    tapLight();
    remove(q);
  };

  const showResults = trimmed !== '' && result.passages.length > 0;
  const showEmpty = trimmed !== '' && result.passages.length === 0;
  const showRecent = trimmed === '' && history.entries.length > 0;

  // Live-region text: the honest heading (no scores), announced on change.
  const announce = showResults ? result.heading : showEmpty ? 'Nothing matched that' : '';

  return (
    <Screen>
      <View style={{ paddingTop: insets.top + Spacing.four, paddingHorizontal: Spacing.five }}>
        <ThemedText variant="display" style={styles.title}>
          Search
        </ThemedText>
      </View>

      {/* Field — pinned under the title; never centred. */}
      <View style={styles.fieldWrap}>
        <View style={[styles.field, { borderColor: colors.hairline }]}>
          <Feather name="search" size={19} color={colors.textSecondary} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => {
              if (trimmed) record(trimmed);
            }}
            placeholder="A feeling, a topic, or John 3"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, fontFamily: Fonts.sans }]}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityLabel="Search Scripture"
            // RNW maps this to <input type="search"> for a native clear button.
            {...(Platform.OS === 'web' ? { inputMode: 'search' } : {})}
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={8}>
              <Feather name="x" size={18} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      {!online && (
        <Text style={[styles.offline, { color: colors.textSecondary, borderColor: colors.hairline }]}>
          Searching your downloaded King James text. Licensed versions need a connection.
        </Text>
      )}

      <Text accessibilityLiveRegion="polite" style={styles.srOnly}>
        {announce}
      </Text>

      {showResults ? (
        <ResultsFade heading={result.heading}>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.caps, { color: colors.textSecondary }]}>{result.heading}</Text>
            {result.passages.map((p) => {
              const tag = rowTag(p, result.themes);
              return (
                <Pressable
                  key={p.id}
                  onPress={() => open(p)}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${p.reference}`}
                  style={[styles.resultRow, { borderTopColor: colors.hairline }]}>
                  <View style={styles.resultText}>
                    <Text style={[styles.caps, { color: colors.textSecondary }]}>{p.reference}</Text>
                    <Text style={[styles.opening, { color: colors.text }]} numberOfLines={2}>
                      {openingLine(p)}
                    </Text>
                    <Text style={[styles.tag, { color: semantic.starred }]}>{tag}</Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textSecondary} style={styles.chev} />
                </Pressable>
              );
            })}
            <ThemedText variant="body" muted style={styles.footerNote}>
              What you open from here shapes your feed.
            </ThemedText>
          </ScrollView>
        </ResultsFade>
      ) : showEmpty ? (
        <View style={styles.centre}>
          <Feather name="search" size={34} color={colors.textSecondary} />
          <ThemedText variant="display" style={styles.emptyTitle}>
            Nothing matched that
          </ThemedText>
          <ThemedText variant="body" muted style={styles.emptyBody}>
            Try a feeling (“afraid”, “alone”), a topic, or a reference like John 3.
          </ThemedText>
          <View style={styles.chips}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} onPress={() => setQuery(s)} />
            ))}
          </View>
        </View>
      ) : showRecent ? (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.recentHead}>
            <Text style={[styles.caps, { color: colors.textSecondary }]}>Recent</Text>
            <Pressable
              onPress={() => {
                tapLight();
                clear();
              }}
              accessibilityRole="button"
              accessibilityLabel="Clear all recent searches"
              hitSlop={8}
              style={styles.clearAll}>
              <Text style={[styles.clearAllText, { color: colors.textSecondary }]}>Clear all</Text>
            </Pressable>
          </View>
          {history.entries.map((q) => (
            <RecentRow key={q} query={q} onRun={() => runRecent(q)} onRemove={() => removeOne(q)} />
          ))}
          <ThemedText variant="body" muted style={styles.footerNote}>
            {profile.keepSearchHistory
              ? 'Swipe a search left to remove it, or turn history off in Settings, on the You tab.'
              : 'History is off, so new searches aren’t saved. Turn it back on in Settings, on the You tab.'}
          </ThemedText>
        </ScrollView>
      ) : (
        // Start state: empty field, no history yet. Pinned to the top, not
        // centred (only the no-results state centres).
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <ThemedText variant="body" muted style={styles.startBody}>
            Find Scripture by what you’re feeling, not only by reference. Try a word for how you are,
            or a passage like John 3.
          </ThemedText>
          <View style={[styles.chips, styles.chipsStart]}>
            {SUGGESTIONS.map((s) => (
              <Chip key={s} label={s} onPress={() => setQuery(s)} />
            ))}
          </View>
        </ScrollView>
      )}
    </Screen>
  );
}

/** A recent-search row: tap the term to re-run it; a visible trash button (and,
 * on native, swipe-left) removes it. The delete action names the term. */
function RecentRow({ query, onRun, onRemove }: { query: string; onRun: () => void; onRemove: () => void }) {
  const { colors, semantic } = useTheme();

  const row = (
    <View style={[styles.recentRow, { borderTopColor: colors.hairline, backgroundColor: colors.background }]}>
      <Pressable onPress={onRun} accessibilityRole="button" accessibilityLabel={`Search ${query} again`} style={styles.recentTerm}>
        <Text style={[styles.recentText, { color: colors.text }]} numberOfLines={1}>
          {query}
        </Text>
      </Pressable>
      <Pressable
        onPress={onRemove}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${query} from history`}
        hitSlop={8}
        style={styles.trash}>
        <Feather name="trash-2" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );

  // Native: swipe left to reveal a delete action. Web: the visible trash button
  // is the affordance (swipe gestures aren't wired for the browser preview).
  if (Platform.OS === 'web') return row;

  return (
    <ReanimatedSwipeable
      friction={2}
      rightThreshold={40}
      renderRightActions={() => (
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${query} from history`}
          style={[styles.swipeDelete, { backgroundColor: semantic.prayer }]}>
          <Feather name="trash-2" size={18} color={colors.onInk} />
          <Text style={[styles.swipeDeleteText, { color: colors.onInk }]}>Delete</Text>
        </Pressable>
      )}>
      {row}
    </ReanimatedSwipeable>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Search ${label}`}
      style={[styles.chip, { borderColor: colors.hairline, backgroundColor: colors.backgroundElement }]}>
      <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Fades the results in as a group (180ms ease-out), no per-row stagger. A new
 * heading remounts it, so each fresh result set fades once. Honours reduce-motion. */
function ResultsFade({ heading, children }: { heading: string; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(reduced ? 1 : 0));

  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    opacity.setValue(0);
    Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [heading, reduced, opacity]);

  return <Animated.View style={[styles.fade, { opacity }]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  title: { fontSize: 34, lineHeight: 40 },
  fieldWrap: { paddingHorizontal: Spacing.five, paddingTop: Spacing.three, paddingBottom: Spacing.three },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.four,
    minHeight: 48,
  },
  input: { flex: 1, fontSize: 16, paddingVertical: Spacing.two },
  offline: {
    marginHorizontal: Spacing.five,
    marginBottom: Spacing.two,
    paddingVertical: Spacing.two,
    fontFamily: Fonts.sans,
    fontSize: 13,
    lineHeight: 18,
  },
  srOnly: { position: 'absolute', width: 1, height: 1, overflow: 'hidden', opacity: 0 },
  fade: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.seven, gap: Spacing.one },
  caps: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },

  // Result rows
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: MinTapTarget,
  },
  resultText: { flex: 1, gap: 5 },
  opening: { fontFamily: Fonts.serifText, fontSize: 16, lineHeight: 23 },
  tag: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  chev: { marginTop: Spacing.one },
  footerNote: { fontSize: 13, lineHeight: 19, paddingTop: Spacing.four },

  // Empty (no-results) — the one centred state
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.five },
  emptyTitle: { fontSize: 28, lineHeight: 34, textAlign: 'center' },
  emptyBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  chips: { flexDirection: 'row', gap: Spacing.two, flexWrap: 'wrap', justifyContent: 'center' },
  chipsStart: { justifyContent: 'flex-start', paddingTop: Spacing.three },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, minHeight: MinTapTarget, justifyContent: 'center' },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 14 },

  // Recent
  recentHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  clearAll: { minHeight: MinTapTarget, justifyContent: 'center' },
  clearAllText: { fontFamily: Fonts.sansMedium, fontSize: 13 },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recentTerm: { flex: 1, minHeight: MinTapTarget, justifyContent: 'center' },
  recentText: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  trash: { width: MinTapTarget, height: MinTapTarget, alignItems: 'center', justifyContent: 'center' },
  swipeDelete: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.two, paddingHorizontal: Spacing.five },
  swipeDeleteText: { fontFamily: Fonts.sansSemiBold, fontSize: 13 },

  startBody: { fontSize: 15, lineHeight: 22, paddingTop: Spacing.two },
});
