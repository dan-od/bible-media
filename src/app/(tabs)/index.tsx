import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompareSheet } from '@/components/feed/CompareSheet';
import { ContextDeck } from '@/components/feed/ContextDeck';
import { FeedCard } from '@/components/feed/FeedCard';
import { FeedHeader, type FeedTab } from '@/components/feed/FeedHeader';
import { NoteSheet } from '@/components/feed/NoteSheet';
import { type RailAction } from '@/components/feed/ActionRail';
import { Toast } from '@/components/feed/Toast';
import { Screen, ThemedText } from '@/components/themed';
import { Fonts, ReadingColumnEm, RootFontSize, Spacing } from '@/constants/theme';
import { getNote, isSaved, isStarred } from '@/data/collection';
import { buildFeed } from '@/data/feed';
import { effectiveSituations } from '@/data/profile';
import type { TranslationId } from '@/data/types';
import { renderPassage } from '@/data/verseStore';
import { selection, tapLight } from '@/lib/haptics';
import { useCollection } from '@/hooks/use-collection';
import { useProfile } from '@/hooks/use-profile';

type Sheet = { type: 'compare' | 'context' | 'note'; passageId: string } | null;

export default function FeedScreen() {
  const insets = useSafeAreaInsets();
  const { profile } = useProfile();
  const { collection, toggleStar, toggleSave, setNote } = useCollection();

  // Window dimensions are available on first render (no onLayout, no blank
  // frame). fontScale makes the reading measure grow with the system text size.
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const columnMaxWidth = ReadingColumnEm * RootFontSize * fontScale;

  const feed = useMemo(() => buildFeed(effectiveSituations(profile)), [profile]);

  const [tab, setTab] = useState<FeedTab>('foryou');
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
        <ScrollView
          style={styles.feedArea}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          decelerationRate="fast">
          {feed.map((item) => {
            const id = item.passage.id;
            const rendered = renderPassage(item.passage, translation[id] ?? profile.translationId);
            return (
              <View key={id} style={[styles.page, { minHeight: windowHeight }]}>
                <FeedCard
                  item={item}
                  rendered={rendered}
                  starred={isStarred(collection, id)}
                  saved={isSaved(collection, id)}
                  hasNote={!!getNote(collection, id)}
                  columnMaxWidth={columnMaxWidth}
                  selectedPhrases={phrases[id] ?? EMPTY}
                  onTogglePhrase={(key) => togglePhrase(id, key)}
                  onAction={(action) => handleAction(id, action)}
                />
              </View>
            );
          })}
        </ScrollView>
      )}

      {sheet && activeSheetPassage && sheet.type === 'compare' && (
        <CompareSheet
          passage={activeSheetPassage}
          current={translation[activeSheetPassage.id] ?? profile.translationId}
          onSelect={(id) => {
            selection();
            setTranslation((p) => ({ ...p, [activeSheetPassage.id]: id }));
          }}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet && activeSheetPassage && sheet.type === 'context' && (
        <ContextDeck passage={activeSheetPassage} onClose={() => setSheet(null)} />
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
  // Each passage fills a screenful (minHeight, so it still grows with the text)
  // and its column is vertically centred at every width.
  page: { justifyContent: 'center', paddingHorizontal: Spacing.five },
  circle: { flex: 1, paddingHorizontal: Spacing.five, justifyContent: 'center', gap: Spacing.three },
  circleTitle: { fontSize: 30, lineHeight: 36 },
  circleBody: { fontSize: 15, lineHeight: 22, fontFamily: Fonts.sans },
});
