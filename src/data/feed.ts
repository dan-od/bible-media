/**
 * Builds the "For you" feed from the local verse store — deterministically, no
 * recommender and no randomness (per the spec). Passages whose theme tags match
 * what the reader is going through come first, each with a "why this verse"
 * reason; then passages on themes they opened from search (the Search screen
 * promises "What you open from here shapes your feed"); the rest follow so the
 * feed is never empty (the public-domain text always has something to show).
 */
import { getPassages, getPassagesByTheme } from './verseStore';
import type { Passage } from './types';

export interface FeedReason {
  /** What the reader is going through, e.g. "New job". */
  situation: string;
  /** The passage's spiritual theme cited in the why line, e.g. "Courage". */
  theme: string;
}

export interface FeedItem {
  passage: Passage;
  /** Why this passage was chosen, or null for the unmatched remainder. */
  reason: FeedReason | null;
}

/**
 * Order passages in three bands, each a plain rule over the theme tags:
 *
 *  1. Passages matching the reader's situations, each with a "why" reason. A
 *     passage that speaks to more of the situations comes first; then the
 *     earliest situation it matches; then library order.
 *  2. Passages on themes the reader engaged with in search (`engaged`, most
 *     engaged first, from the local collection). No reason: only what the
 *     reader told us they're going through explains a verse.
 *  3. Everything else, in library order, so the feed is never empty.
 */
export function buildFeed(situations: string[], engaged: string[] = []): FeedItem[] {
  const all = getPassages();
  const seed = new Map(all.map((p, i) => [p.id, i]));
  const items: FeedItem[] = [];
  const used = new Set<string>();

  // 1. Situation matches.
  const situationKeys = situations.map((s) => s.toLowerCase());
  const matched = new Map<string, { passage: Passage; hits: number; first: number }>();
  situations.forEach((situation, si) => {
    for (const passage of getPassagesByTheme(situation)) {
      const hit = matched.get(passage.id);
      if (hit) hit.hits += 1;
      else matched.set(passage.id, { passage, hits: 1, first: si });
    }
  });
  const band1 = [...matched.values()].sort(
    (a, b) => b.hits - a.hits || a.first - b.first || seed.get(a.passage.id)! - seed.get(b.passage.id)!,
  );
  for (const { passage, first } of band1) {
    used.add(passage.id);
    const situation = situations[first];
    items.push({ passage, reason: { situation, theme: pickTheme(passage, situation) } });
  }

  // 2. Engaged themes, most engaged first (skipping any already a situation).
  for (const theme of engaged) {
    if (situationKeys.includes(theme.toLowerCase())) continue;
    for (const passage of getPassagesByTheme(theme)) {
      if (used.has(passage.id)) continue;
      used.add(passage.id);
      items.push({ passage, reason: null });
    }
  }

  // 3. The rest.
  for (const passage of all) {
    if (used.has(passage.id)) continue;
    used.add(passage.id);
    items.push({ passage, reason: null });
  }

  return items;
}

/** Prefer a theme tag that isn't the situation, so the why line reads naturally. */
function pickTheme(passage: Passage, situation: string): string {
  const other = passage.themeTags.find((t) => t.toLowerCase() !== situation.toLowerCase());
  return other ?? passage.themeTags[0];
}
