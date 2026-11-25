/**
 * The reading block: a dimmed lead-in verse above the passage, then the passage
 * itself in the display serif. The passage is ONE reading block so a screen
 * reader reads the lead-in then the verses without the action rail interrupting.
 *
 * Tap-a-phrase: each clause of the passage is tappable and toggles a highlight,
 * so a reader can pick out a phrase (to note or share later). Nothing here sets
 * allowFontScaling=false and there are no fixed heights — the block grows with
 * the system text size, up to the measured ceiling at which the library's
 * widest word still fits the column (lib/verse-fit), so no word of Scripture is
 * ever broken mid-word.
 */
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Fonts } from '@/constants/theme';
import { LEAD_IN_FONT_SIZE, VERSE_FONT_SIZE } from '@/lib/verse-fit';
import { useTheme } from '@/hooks/use-theme';
import type { VerseText } from '@/data/types';

export function phraseKey(verseNumber: number, phraseIndex: number) {
  return `${verseNumber}:${phraseIndex}`;
}

/** Split a verse into clauses, keeping the punctuation on the preceding clause. */
export function toPhrases(text: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const breakHere = (c === ',' || c === ';' || c === ':' || c === '—') && (i + 1 >= text.length || text[i + 1] === ' ');
    if (breakHere) {
      out.push(text.slice(start, i + 1));
      start = i + 1;
    }
  }
  if (start < text.length) out.push(text.slice(start));
  return out.filter((s) => s.length > 0);
}

export function VerseBlock({
  leadIn,
  verses,
  fontSize = VERSE_FONT_SIZE,
  verseMaxMultiplier,
  leadInMaxMultiplier,
  selected,
  onTogglePhrase,
}: {
  leadIn: VerseText;
  verses: VerseText[];
  fontSize?: number;
  /** The most the system text size may scale the verse and the lead-in (see lib/verse-fit). */
  verseMaxMultiplier?: number;
  leadInMaxMultiplier?: number;
  selected: ReadonlySet<string>;
  onTogglePhrase: (key: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.block}>
      {/* Lead-in — dimmed, smaller, serif text */}
      <Text
        testID="verse-lead-in"
        maxFontSizeMultiplier={leadInMaxMultiplier}
        style={[styles.leadIn, { color: colors.textSecondary }]}>
        <Text style={[styles.vnum, { color: colors.textSecondary }]}>{leadIn.number} </Text>
        {leadIn.text}
      </Text>

      {/* Passage — display serif, tap-a-phrase clauses */}
      <Passage
        verses={verses}
        fontSize={fontSize}
        maxMultiplier={verseMaxMultiplier}
        selected={selected}
        onTogglePhrase={onTogglePhrase}
      />
    </View>
  );
}

function Passage({
  verses,
  fontSize,
  maxMultiplier,
  selected,
  onTogglePhrase,
}: {
  verses: VerseText[];
  fontSize: number;
  maxMultiplier?: number;
  selected: ReadonlySet<string>;
  onTogglePhrase: (key: string) => void;
}) {
  const { colors } = useTheme();
  const lineHeight = Math.round(fontSize * 1.26);

  const segments = useMemo(
    () =>
      verses.map((v) => ({
        number: v.number,
        phrases: toPhrases(v.text),
      })),
    [verses],
  );

  return (
    <Text
      testID="verse-passage"
      accessibilityRole="text"
      maxFontSizeMultiplier={maxMultiplier}
      style={{ fontFamily: Fonts.serifDisplay, fontSize, lineHeight, color: colors.text }}>
      {segments.map((seg, si) => (
        <Text key={seg.number}>
          {si > 0 ? ' ' : ''}
          <Text style={[styles.vnum, { color: colors.textSecondary, fontSize: Math.round(fontSize * 0.42) }]}>
            {seg.number}{' '}
          </Text>
          {seg.phrases.map((phrase, pi) => {
            const key = phraseKey(seg.number, pi);
            const on = selected.has(key);
            return (
              <Text
                key={key}
                onPress={() => onTogglePhrase(key)}
                suppressHighlighting
                style={
                  on
                    ? { color: colors.gold, textDecorationLine: 'underline', textDecorationColor: colors.gold }
                    : undefined
                }>
                {phrase}
              </Text>
            );
          })}
        </Text>
      ))}
    </Text>
  );
}

const styles = StyleSheet.create({
  block: { gap: 20 },
  leadIn: { fontFamily: Fonts.serifText, fontSize: LEAD_IN_FONT_SIZE, lineHeight: 26 },
  vnum: { fontFamily: Fonts.sans, fontWeight: '600' },
});
