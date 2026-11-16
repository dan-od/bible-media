/**
 * Write a reflection on a passage and choose who it's for, with private as the
 * safe default. The passage stays visible above the field. Saving is local-only
 * (no account yet); "My circle" records intent — real sharing arrives with
 * accounts in a later step, which the helper line says plainly.
 *
 * The field takes focus after the sheet settles so the keyboard doesn't fight
 * the rise animation (immediately when reduced motion is on).
 */
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BottomSheet } from './BottomSheet';
import { Button } from '@/components/ui/Button';
import { Fonts, MinTapTarget, Spacing } from '@/constants/theme';
import type { NoteVisibility } from '@/data/collection';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { useTheme } from '@/hooks/use-theme';

export function NoteSheet({
  reference,
  verseText,
  initialBody,
  initialVisibility,
  onSave,
  onClose,
}: {
  reference: string;
  verseText: string;
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

  useEffect(() => {
    const delay = reduced ? 0 : 300;
    const id = setTimeout(() => inputRef.current?.focus(), delay);
    return () => clearTimeout(id);
  }, [reduced]);

  const options: { id: NoteVisibility; label: string }[] = [
    { id: 'private', label: 'Private to me' },
    { id: 'circle', label: 'My circle' },
  ];

  return (
    <BottomSheet
      title={`Note on ${reference}`}
      onClose={onClose}
      footer={
        <View style={styles.actions}>
          <Button label="Cancel" variant="ghost" size="sm" onPress={onClose} style={{ flex: 1 }} />
          <Button
            label="Save note"
            size="sm"
            onPress={() => onSave(body, visibility)}
            style={{ flex: 2 }}
          />
        </View>
      }>
      <View style={styles.wrap}>
        <Text style={[styles.verse, { color: colors.textSecondary }]} numberOfLines={3}>
          {verseText}
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
          <View style={[styles.seg, { borderColor: colors.hairline }]}>
            {options.map((o) => {
              const on = visibility === o.id;
              return (
                <Pressable
                  key={o.id}
                  onPress={() => setVisibility(o.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.segBtn, on && { backgroundColor: colors.text }]}>
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
  verse: { fontFamily: Fonts.serifText, fontSize: 15, lineHeight: 22, fontStyle: 'italic' },
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
});
