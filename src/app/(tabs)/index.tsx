import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet } from '@/components/feed/ActionSheet';
import { CompareSheet } from '@/components/feed/CompareSheet';
import { ContextDeck } from '@/components/feed/ContextDeck';
import { FeedCard } from '@/components/feed/FeedCard';
import { FeedHeader, type FeedTab } from '@/components/feed/FeedHeader';
import { NoteSheet } from '@/components/feed/NoteSheet';
import { type RailAction } from '@/components/feed/ActionRail';
import { Toast } from '@/components/feed/Toast';
import { Screen, ThemedText } from '@/components/themed';
import { Fonts, Spacing } from '@/constants/theme';
import { engagedThemes, getNote, isSaved, isStarred } from '@/data/collection';
import { buildFeed } from '@/data/feed';
import { effectiveSituations } from '@/data/profile';
import type { TranslationId } from '@/data/types';
import { renderPassage } from '@/data/verseStore';
import { selection, tapLight } from '@/lib/haptics';
import { pageSnapOffsets } from '@/lib/snap';
import { PAGE_PADDING, verseLayout } from '@/lib/verse-fit';
import { useCollection } from '@/hooks/use-collection';
import { useProfile } from '@/hooks/use-profile';
import { useSheetLayout } from '@/hooks/use-sheet-layout';

type Sheet = { type: 'actions' | 'compare' | 'context' | 'note'; passageId: string } | null;

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { collection, toggleStar, toggleSave, setNote } = useCollection();

  // Window dimensions are available on first render (no onLayout, no blank
  // frame). The column, the verse size and whether the rail fits beside it all
  // follow the width and the system text size (see lib/verse-fit).
  const { width: windowWidth, height: windowHeight, fontScale } = useWindowDimensions();
  const layout = useMemo(() => verseLayout({ windowWidth, fontScale }), [windowWidth, fontScale]);
  const sheetFit = useSheetLayout();

  // Situations lead; themes opened from search come next. `engaged` keeps its
  // identity across star/save/note changes, so only a search open reorders.
  const engaged = collection.engaged;
  const feed = useMemo(
    () => buildFeed(effectiveSituations(profile), engagedThemes({ engaged })),
    [profile, engaged],
  );

  const [tab, setTab] = useState<FeedTab>('foryou');

  // Jump to a passage opened from Search (`/?passage=<id>&at=<time>`). Pages
  // aren't a fixed height (they grow with the text), so the offset is the sum
  // of the measured heights before it. Heights are kept per passage, so they
  // stay right when the feed reorders.
  const { passage: target, at } = useLocalSearchParams<{ passage?: string; at?: string }>();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const heights = useRef(new Map<string, number>());

  // A page is at least one screen of the FEED AREA (between the header and the
  // tab bar), not of the whole window — otherwise the rail's last actions sit
  // under the tab bar and pages drift off their snap points. Until the area is
  // measured, the window height stands in, so there's never a blank frame.
  const [viewport, setViewport] = useState(0);
  const pageMinHeight = viewport || windowHeight;

  // Native: snap to measured page starts (see pageSnapOffsets) so a passage that
  // grows past the screen at large text sizes doesn't misalign the rest. Web:
  // RNW's pagingEnabled is CSS scroll-snap, which already lets a tall page
  // scroll inside itself, so it keeps paging.
  const [pageHeights, setPageHeights] = useState<Record<string, number>>({});
  const snapOffsets = useMemo(() => {
    if (Platform.OS === 'web' || !viewport) return undefined;
    const list = feed.map((item) => pageHeights[item.passage.id]);
    if (list.some((h) => h === undefined)) return undefined;
    return pageSnapOffsets(list as number[], viewport);
  }, [feed, pageHeights, viewport]);

  // Each passage's sticky rail is driven from the feed's scroll offset (on the
  // native thread where there is one) and where that passage starts in the feed.
  const [scrollY] = useState(() => new Animated.Value(0));
  const lastY = useRef(0);
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: Platform.OS !== 'web',
      }),
    [scrollY],
  );
  const pageTops = useMemo(() => {
    const tops: Record<string, number> = {};
    let y = 0;
    for (const item of feed) {
      tops[item.passage.id] = y;
      y += pageHeights[item.passage.id] ?? pageMinHeight;
    }
    return tops;
  }, [feed, pageHeights, pageMinHeight]);
  const pending = useRef<string | null>(null);
  const handledAt = useRef<string | undefined>(undefined);

  const scrollToPending = useCallback(() => {
    const id = pending.current;
    // No scroll view while the Circle tab shows: keep the jump pending until
    // the feed mounts and its pages report their layout.
    if (!id || !scrollRef.current) return;
    let y = 0;
    for (const item of feed) {
      if (item.passage.id === id) {
        scrollRef.current?.scrollTo({ y, animated: false });
        pending.current = null;
        return;
      }
      const h = heights.current.get(item.passage.id);
      if (h === undefined) return; // not measured yet — a page's onLayout retries
      y += h;
    }
    pending.current = null; // not in the feed
  }, [feed]);

  useEffect(() => {
    if (!target || !at || handledAt.current === at) return;
    handledAt.current = at;
    pending.current = target;
    setTab('foryou');
    scrollToPending();
  }, [target, at, scrollToPending]);
  const [translation, setTranslation] = useState<Record<string, TranslationId>>({});
  const [phrases, setPhrases] = useState<Record<string, Set<string>>>({});
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(id);
  }, [toast]);

  const activeSheetPassage = sheet ? feed.find((i) => i.passage.id === sheet.passageId)?.passage : undefined;

  const togglePhrase = (passageId: string, key: string) =>
    setPhrases((prev) => {
      const next = new Set(prev[passageId]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [passageId]: next };
    });

  const handleAction = (passageId: string, action: RailAction) => {
    switch (action) {
      case 'star':
        tapLight();
        toggleStar(passageId);
        break;
      case 'save':
        tapLight();
        setToast(isSaved(collection, passageId) ? 'Removed from saved' : 'Saved to your collection');
        toggleSave(passageId);
        break;
      case 'note':
        setSheet({ type: 'note', passageId });
        break;
      case 'repost':
        setToast('Reposting to your circle comes with accounts');
        break;
      case 'send':
        setToast('Sending to a friend comes with messaging');
        break;
      case 'versions':
        setSheet({ type: 'compare', passageId });
        break;
      case 'context':
        setSheet({ type: 'context', passageId });
        break;
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: insets.top }}>
        <FeedHeader active={tab} onChange={setTab} />
      </View>

      {tab === 'circle' ? (
        <View style={styles.circle}>
          <ThemedText variant="display" style={styles.circleTitle}>
            Your circle is quiet
          </ThemedText>
          <ThemedText variant="body" muted style={styles.circleBody}>
            When you connect with people you know, their notes on today&apos;s passage show up here.
            Circles are mutual-accept only — the app never suggests people.
          </ThemedText>
        </View>
      ) : (
        <Animated.ScrollView
          ref={scrollRef}
          style={styles.feedArea}
          onLayout={(e) => setViewport(Math.round(e.nativeEvent.layout.height))}
          onScroll={onScroll}
          // A text-size change re-lays out every passage under a resting scroll
          // position, and the rails only follow scroll events: nudge the offset
          // so they re-read it.
          onContentSizeChange={() => {
            const y = lastY.current;
            scrollRef.current?.scrollTo({ y: y + 1, animated: false });
            requestAnimationFrame(() => scrollRef.current?.scrollTo({ y, animated: false }));
          }}
          onMomentumScrollEnd={(e) => {
            lastY.current = e.nativeEvent.contentOffset.y;
          }}
          onScrollEndDrag={(e) => {
            lastY.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          // Until every page is measured, plain paging (pages are one feed area
          // tall unless the text is very large, so it lines up).
          pagingEnabled={!snapOffsets}
          snapToOffsets={snapOffsets}
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          decelerationRate="fast">
          {feed.map((item) => {
            const id = item.passage.id;
            const rendered = renderPassage(item.passage, translation[id] ?? profile.translationId);
            return (
              <View
                key={id}
                onLayout={(e) => {
                  const h = Math.round(e.nativeEvent.layout.height);
                  heights.current.set(id, h);
                  setPageHeights((prev) => (prev[id] === h ? prev : { ...prev, [id]: h }));
                  scrollToPending();
                }}
                style={[styles.page, { minHeight: pageMinHeight }]}>
                <FeedCard
                  item={item}
                  rendered={rendered}
                  starred={isStarred(collection, id)}
                  saved={isSaved(collection, id)}
                  hasNote={!!getNote(collection, id)}
                  layout={layout}
                  selectedPhrases={phrases[id] ?? EMPTY}
                  onTogglePhrase={(key) => togglePhrase(id, key)}
                  onAction={(action) => handleAction(id, action)}
                  onOpenActions={() => setSheet({ type: 'actions', passageId: id })}
                  scrollY={scrollY}
                  pageTop={pageTops[id] ?? 0}
                  pageHeight={pageHeights[id] ?? 0}
                  feedAreaHeight={pageMinHeight}
                />
              </View>
            );
          })}
        </Animated.ScrollView>
      )}

      {sheet && activeSheetPassage && sheet.type === 'actions' && (
        <ActionSheet
          reference={activeSheetPassage.reference}
          starred={isStarred(collection, activeSheetPassage.id)}
          saved={isSaved(collection, activeSheetPassage.id)}
          hasNote={!!getNote(collection, activeSheetPassage.id)}
          layout={sheetFit}
          onAction={(action) => handleAction(activeSheetPassage.id, action)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && activeSheetPassage && sheet.type === 'compare' && (
        <CompareSheet
          passage={activeSheetPassage}
          current={translation[activeSheetPassage.id] ?? profile.translationId}
          layout={sheetFit}
          onSelect={(id) => {
            selection();
            setTranslation((p) => ({ ...p, [activeSheetPassage.id]: id }));
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && activeSheetPassage && sheet.type === 'context' && (
        <ContextDeck passage={activeSheetPassage} layout={sheetFit} onClose={() => setSheet(null)} />
      )}
      {sheet && activeSheetPassage && sheet.type === 'note' && (
        <NoteSheet
          reference={activeSheetPassage.reference}
          verseText={renderPassage(
            activeSheetPassage,
            translation[activeSheetPassage.id] ?? profile.translationId,
          ).verses
            .map((v) => v.text)
            .join(' ')}
          layout={sheetFit}
          initialBody={getNote(collection, activeSheetPassage.id)?.body ?? ''}
          initialVisibility={getNote(collection, activeSheetPassage.id)?.visibility ?? 'private'}
          onSave={(body, visibility) => {
            tapLight();
            setNote(activeSheetPassage.id, body, visibility);
            setToast(body.trim() ? 'Note saved' : 'Note removed');
            setSheet(null);
          }}
          onClose={() => setSheet(null)}
        />
      )}

      {toast && <Toast message={toast} />}
    </Screen>
  );
}

const EMPTY: ReadonlySet<string> = new Set();

const styles = StyleSheet.create({
  feedArea: { flex: 1 },
  // Each passage fills the feed area (minHeight, so it still grows with the
  // text) and its column is vertically centred at every width.
  page: { justifyContent: 'center', paddingHorizontal: PAGE_PADDING },
  circle: { flex: 1, paddingHorizontal: Spacing.five, justifyContent: 'center', gap: Spacing.three },
  circleTitle: { fontSize: 30, lineHeight: 36 },
  circleBody: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.sans },
});
