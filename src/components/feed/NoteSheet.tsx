/**
 * Write a reflection on a passage and choose who it's for, with private as the
 * safe default. The passage stays visible above the field. Saving is local-only
 * (no account yet); "My circle" records intent — real sharing arrives with
 * accounts in a later step, which the helper line says plainly.
 *
 * The field takes focus after the sheet settles so the keyboard doesn't fight
 * the rise animation (immediately when reduced motion is on).
 *
 * The excerpt is Scripture, held by its measured ceiling (lib/sheet-fit) and
 * cut to whole words rather than truncated mid-word (lib/excerpt). The
 * note body is the reader's own words and is deliberately not: it scales like
 * any text and may break. At the accessibility sizes the visibility options
 * and the buttons stack, so each label has the full width.
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import type { NoteVisibility } from '@/data/collection';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';
import { wordExcerpt } from '@/lib/excerpt';
import { noteTitle } from '@/lib/sheet-copy';
import { SHEET_TYPE, type SheetLayout } from '@/lib/sheet-fit';

/** How many lines of the passage the note sheet quotes. */
const EXCERPT_LINES = 3;

export function NoteSheet({
  reference,
  verseText,
  layout,
  initialBody,
  initialVisibility,
  onSave,
  onClose,
}: {
  reference: string;
  verseText: string;
  layout: SheetLayout;
  initialBody: string;
  initialVisibility: NoteVisibility;
  onSave: (body: string, visibility: NoteVisibility) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const reduced = useReducedMotion();
  const [body, setBody] = useState(initialBody);
  const [visibility, setVisibility] = useState<NoteVisibility>(initialVisibility);
  const inputRef = useRef<ComponentRef<typeof TextInput>>(null);
  // The excerpt is laid out in full once, then cut to whole words (lib/excerpt).
  // Laid out again whenever the passage or the text size changes.
  const [excerpt, setExcerpt] = useState<{ for: string; text: string } | null>(null);
  const excerptKey = `${verseText}|${layout.excerpt.maxMultiplier}|${layout.bodyWidth}`;
  const shownExcerpt = excerpt?.for === excerptKey ? excerpt.text : null;

  useEffect(() => {
    const delay = reduced ? 0 : 300;
    const id = setTimeout(() => inputRef.current?.focus(), delay);
    return () => clearTimeout(id);
  }, [reduced]);

  const options: { id: NoteVisibility; label: string }[] = [
    { id: 'private', label: 'Private to me' },
    { id: 'circle', label: 'My circle' },
  ];

  const stacked = layout.accessible;
  return (
    <BottomSheet
      title={noteTitle(reference)}
      layout={layout}
      onClose={onClose}
      footer={
        // Side by side, "Cancel" takes its own width and "Save note" the rest.
        <View testID="note-actions" style={[styles.actions, stacked && styles.stacked]}>
          <Button
            testID="note-cancel"
            label="Cancel"
            variant="ghost"
            size="sm"
            onPress={onClose}
          />
          <Button
            testID="note-save"
            label="Save note"
            size="sm"
            onPress={() => onSave(body, visibility)}
            style={stacked ? undefined : { flex: 1 }}
          />
        </View>
      }>
      <View style={styles.wrap}>
        <Text
          testID="note-excerpt"
          maxFontSizeMultiplier={layout.excerpt.maxMultiplier}
          style={[styles.verse, { color: colors.textSecondary }]}
          onTextLayout={
            shownExcerpt === null
              ? (e) => {
                  const lines = e.nativeEvent.lines.map((l) => l.text);
                  setExcerpt({ for: excerptKey, text: wordExcerpt(lines, EXCERPT_LINES) });
                }
              : undefined
          }>
          {shownExcerpt ?? verseText}
        </Text>

        <View style={styles.field}>
          <Text style={[styles.caps, { color: colors.textSecondary }]}>Your note</Text>
          <TextInput
            ref={inputRef}
            value={body}
            onChangeText={setBody}
            placeholder="What is this saying to you?"
            placeholderTextColor={colors.textSecondary}
            multiline
            textAlignVertical="top"
            style={[
              styles.input,
              { color: colors.text, borderColor: colors.hairline, backgroundColor: colors.backgroundElement },
            ]}
          />
        </View>

        <View style={styles.field}>
          <Text style={[styles.caps, { color: colors.textSecondary }]}>Who can see it</Text>
          <View
            testID="note-options"
            style={[styles.seg, stacked && styles.segStacked, { borderColor: colors.hairline }]}>
            {options.map((o) => {
              const on = visibility === o.id;
              return (
                <Pressable
                  key={o.id}
                  testID="note-option"
                  onPress={() => setVisibility(o.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.segBtn, stacked && styles.segBtnStacked, on && { backgroundColor: colors.text }]}>
                  <Text style={[styles.segLabel, { color: on ? colors.background : colors.text }]}>
                    {o.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.why, { color: colors.textSecondary }]}>
            Notes stay on this device for now. Sharing with your circle arrives with accounts — a
            later step. The words stay yours.
          </Text>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.four },
  verse: {
    fontFamily: Fonts.serifText,
    fontSize: SHEET_TYPE.excerpt.size,
    lineHeight: SHEET_TYPE.excerpt.lineHeight,
    fontStyle: 'italic',
  },
  field: { gap: Spacing.two },
  caps: { fontFamily: Fonts.sansSemiBold, fontSize: 11, letterSpacing: 1.3, textTransform: 'uppercase' },
  input: {
    minHeight: 96,
    borderWidth: 1,
    borderRadius: 12,
    padding: Spacing.three,
    fontFamily: Fonts.sans,
    // 16px keeps iOS Safari from zooming the field on focus; never scale-locked.
    fontSize: Platform.OS === 'web' ? 16 : 17,
    lineHeight: 24,
  },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 999, padding: 3, gap: 3 },
  // Stacked, a pill would clip the corners of tall labels.
  segStacked: { flexDirection: 'column', borderRadius: 22 },
  segBtnStacked: { flex: 0, borderRadius: 19, paddingVertical: Spacing.two },
  segBtn: {
    flex: 1,
    minHeight: MinTapTarget - 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
  },
  segLabel: { fontFamily: Fonts.sansMedium, fontSize: 14 },
  why: { fontFamily: Fonts.sans, fontSize: 13, lineHeight: 18 },
  actions: { flexDirection: 'row', gap: Spacing.three },
  stacked: { flexDirection: 'column' },
});
