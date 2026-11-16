/**
 * Builds the "For you" feed from the local verse store — deterministically, no
 * recommender and no randomness (per the spec). Passages whose theme tags match
 * what the reader is going through come first, each with a "why this verse"
 * reason; the rest follow so the feed is never empty (the public-domain text
 * always has something to show).
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
 * Order passages for a reader's situations. Matched passages lead (in situation
 * order, then seed order), each tagged with a theme that isn't the situation
 * itself; the remaining passages follow in seed order with no reason.
 */
export function buildFeed(situations: string[]): FeedItem[] {
  const items: FeedItem[] = [];
  const used = new Set<string>();

  for (const situation of situations) {
    for (const passage of getPassagesByTheme(situation)) {
      if (used.has(passage.id)) continue;
      used.add(passage.id);
      items.push({ passage, reason: { situation, theme: pickTheme(passage, situation) } });
    }
  }

  for (const passage of getPassages()) {
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
