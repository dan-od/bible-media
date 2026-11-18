import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NoteSheet } from '@/components/feed/NoteSheet';
import { Screen, ThemedText } from '@/components/themed';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import { getNote, notedIds, savedIds } from '@/data/collection';
import { effectiveSituations } from '@/data/profile';
import { getPassageById, renderPassage } from '@/data/verseStore';
import { useCollection } from '@/hooks/use-collection';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';

/** A friendly, score-free "when" — never a streak or a count. */
function whenLabel(ms: number): string {
  if (!ms) return '';
  const day = 86_400_000;
  const startOfToday = new Date().setHours(0, 0, 0, 0);
  const diffDays = Math.floor((startOfToday - new Date(ms).setHours(0, 0, 0, 0)) / day);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return new Date(ms).toLocaleDateString(undefined, { weekday: 'long' });
  return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function YouScreen() {
  const insets = useSafeAreaInsets();
  const { colors, semantic } = useTheme();
  const { profile, update } = useProfile();
  const { collection, setNote } = useCollection();

  const [editing, setEditing] = useState<string | null>(null);

  const situations = useMemo(() => effectiveSituations(profile), [profile]);
  const saved = savedIds(collection);
  const noted = notedIds(collection);

  const firstLine = (passageId: string): { reference: string; text: string } | null => {
    const passage = getPassageById(passageId);
    if (!passage) return null;
    const rendered = renderPassage(passage, profile.translationId);
    return { reference: passage.reference, text: rendered.verses.map((v) => v.text).join(' ') };
  };

  const editingPassage = editing ? getPassageById(editing) : undefined;
  const nothingKept = saved.length === 0 && noted.length === 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Spacing.five, paddingBottom: insets.bottom + Spacing.six },
          nothingKept && styles.scrollEmpty,
        ]}
        showsVerticalScrollIndicator={false}>
        <ThemedText variant="display" style={styles.title}>
          You
        </ThemedText>

        {/* What I'm going through — read-only here; onboarding sets it. */}
        <View style={[styles.card, { borderColor: colors.hairline }]}>
          <Text style={[styles.caps, { color: colors.textSecondary }]}>What I&apos;m going through</Text>
          {situations.length > 0 ? (
            <View style={styles.chips}>
              {situations.map((s) => (
                <View key={s} style={[styles.chip, { borderColor: colors.hairline, backgroundColor: colors.backgroundElement }]}>
                  <Text style={[styles.chipText, { color: colors.text }]}>{s}</Text>
                </View>
              ))}
            </View>
          ) : (
            <ThemedText variant="body" muted style={styles.cardBody}>
              Nothing set yet. Your feed follows what you&apos;re carrying.
            </ThemedText>
          )}
          <ThemedText variant="body" muted style={styles.cardBody}>
            Your feed is built from these. Changing them whenever life changes arrives with the next steps.
          </ThemedText>
        </View>

        {nothingKept ? (
          <View style={styles.empty}>
            <ThemedText variant="display" style={styles.emptyTitle}>
              Nothing kept yet
            </ThemedText>
            <ThemedText variant="body" muted style={styles.emptyBody}>
              Star what strikes you, save what you want to return to, and write what a passage is
              saying to you. It all lands here, on this device.
            </ThemedText>
          </View>
        ) : (
          <>
            {saved.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.caps, { color: colors.textSecondary }]}>Saved</Text>
                {saved.map((id) => {
                  const row = firstLine(id);
                  if (!row) return null;
                  return (
                    <View key={id} style={[styles.row, { borderTopColor: colors.hairline }]}>
                      <Text style={[styles.caps, { color: colors.textSecondary }]}>{row.reference}</Text>
                      <Text style={[styles.rowVerse, { color: colors.text }]} numberOfLines={2}>
                        {row.text}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {noted.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.caps, { color: colors.textSecondary }]}>Your notes</Text>
                {noted.map((id) => {
                  const note = getNote(collection, id);
                  const passage = getPassageById(id);
                  if (!note || !passage) return null;
                  return (
                    <Pressable
                      key={id}
                      onPress={() => setEditing(id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Edit your note on ${passage.reference}`}
                      style={[styles.row, styles.noteRow, { borderTopColor: colors.hairline }]}>
                      <View style={styles.noteHead}>
                        <Text style={[styles.caps, { color: colors.textSecondary }]}>{passage.reference}</Text>
                        {!!note.updatedAt && (
                          <Text style={[styles.when, { color: colors.textSecondary }]}>{whenLabel(note.updatedAt)}</Text>
                        )}
                        <Text style={[styles.caps, styles.vis, { color: colors.textSecondary }]}>
                          {note.visibility === 'private' ? 'Private' : 'For my circle'}
                        </Text>
                      </View>
                      <Text style={[styles.noteBody, { color: colors.text }]}>{note.body}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </>
        )}

        {/* Settings — kept minimal for this step: the search-history switch.
            Off means new searches aren't written (not merely hidden). */}
        <View style={styles.section}>
          <Text style={[styles.caps, { color: colors.textSecondary }]}>Settings</Text>
          <View style={[styles.settingRow, { borderTopColor: colors.hairline }]}>
            <View style={styles.settingText}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Keep search history</Text>
              <ThemedText variant="body" muted style={styles.settingDetail}>
                Recent searches are saved on this device to tune your feed. Off means nothing new is
                written.
              </ThemedText>
            </View>
            <Switch
              value={profile.keepSearchHistory}
              onValueChange={(v) => update({ keepSearchHistory: v })}
              trackColor={{ true: semantic.finished, false: colors.hairline }}
              thumbColor={colors.background}
              accessibilityLabel="Keep search history"
            />
          </View>
        </View>
      </ScrollView>

      {editing && editingPassage && (
        <NoteSheet
          reference={editingPassage.reference}
          verseText={renderPassage(editingPassage, profile.translationId)
            .verses.map((v) => v.text)
            .join(' ')}
          initialBody={getNote(collection, editing)?.body ?? ''}
          initialVisibility={getNote(collection, editing)?.visibility ?? 'private'}
          onSave={(body, visibility) => {
            setNote(editing, body, visibility);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: Spacing.five, gap: Spacing.five },
  scrollEmpty: { flexGrow: 1 },
  title: { fontSize: 34, lineHeight: 40 },
  card: { padding: Spacing.four, borderRadius: 16, borderWidth: 1, gap: Spacing.three },
  cardBody: { fontSize: 13, lineHeight: 19 },
  caps: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1 },
  chipText: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  section: { gap: Spacing.two },
  row: { paddingTop: Spacing.three, borderTopWidth: StyleSheet.hairlineWidth, gap: 5 },
  rowVerse: { fontFamily: Fonts.serifText, fontSize: 16, lineHeight: 23 },
  noteRow: { minHeight: MinTapTarget, gap: Spacing.two },
  noteHead: { flexDirection: 'row', alignItems: 'baseline', gap: Spacing.three, flexWrap: 'wrap' },
  when: { fontFamily: Fonts.sans, fontSize: 12 },
  vis: { marginLeft: 'auto' },
  noteBody: { fontFamily: Fonts.serifText, fontSize: 16, lineHeight: 23 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.three, paddingHorizontal: Spacing.four },
  emptyTitle: { fontSize: 28, lineHeight: 34, textAlign: 'center' },
  emptyBody: { fontSize: 15, lineHeight: 22, textAlign: 'center' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
    minHeight: MinTapTarget,
  },
  settingText: { flex: 1, gap: 4 },
  settingLabel: { fontFamily: Fonts.sansMedium, fontSize: 16 },
  settingDetail: { fontSize: 13, lineHeight: 19 },
});
