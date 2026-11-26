/**
 * The words the sheets set in their titles and labels, in one place so the
 * sheets and the word measurement (data/word-metrics.json) can't drift apart.
 */
import type { Passage } from '@/data/types';

export const ACTIONS_TITLE = 'Actions';
export const compareTitle = (p: Pick<Passage, 'reference'>) => p.reference;
export const contextTitle = (p: Pick<Passage, 'book' | 'chapter'>) => `${p.book} ${p.chapter}`;
export const noteTitle = (reference: string) => `Note on ${reference}`;
export const readAllLabel = (p: Pick<Passage, 'book' | 'chapter'>) => `Read all of ${p.book} ${p.chapter}`;

/** Every title a sheet can show for a passage. */
export function sheetTitles(p: Passage): string[] {
  return [ACTIONS_TITLE, compareTitle(p), contextTitle(p), noteTitle(p.reference)];
}
