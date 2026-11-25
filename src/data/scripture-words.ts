/**
 * The words of Scripture as line breaking sees them. Word wrap only breaks at
 * spaces, so a "word" here is a whole run between spaces, punctuation and all
 * ("understanding,"). A run that is wider than its line can only be broken
 * mid-word, which is what the reading column is sized to prevent (see
 * lib/verse-fit).
 */
import type { Passage } from './types';

/** The unbreakable runs in a piece of text. */
export function lineBreakUnits(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/**
 * Every distinct run in the library, in every translation it carries: the
 * passage verses (set in the display serif) and the lead-in verses (the text
 * serif), kept apart because they are set in different faces and sizes.
 */
export function scriptureWords(passages: readonly Passage[]): { verse: string[]; leadIn: string[] } {
  const verse = new Set<string>();
  const leadIn = new Set<string>();
  for (const p of passages) {
    for (const text of Object.values(p.text)) {
      if (!text) continue;
      for (const v of text.verses) for (const w of lineBreakUnits(v.text)) verse.add(w);
      if (text.leadIn) for (const w of lineBreakUnits(text.leadIn.text)) leadIn.add(w);
    }
  }
  return { verse: [...verse], leadIn: [...leadIn] };
}
