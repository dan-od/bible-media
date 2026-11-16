/**
 * Local verse store — the single, translation-agnostic interface the rest of
 * the app reads passages through. Everything here is deterministic (no
 * randomness, per the spec) and works offline from bundled public-domain text.
 *
 * Licensed translations slot in later behind this same interface: they appear
 * in the catalogue as locked, and until their text is available the store falls
 * back to a bundled public-domain translation rather than showing nothing.
 */
import { PASSAGES } from './passages';
import { DEFAULT_TRANSLATION_ID, TRANSLATIONS } from './translations';
import type { Passage, RenderedPassage, Translation, TranslationId } from './types';

// --- Translations ----------------------------------------------------------

export function getTranslations(): Translation[] {
  return TRANSLATIONS;
}

/** Translations whose text ships in the binary (not licence-locked). */
export function getAvailableTranslations(): Translation[] {
  return TRANSLATIONS.filter((t) => !t.locked);
}

export function getTranslation(id: TranslationId): Translation | undefined {
  return TRANSLATIONS.find((t) => t.id === id);
}

// --- Passages --------------------------------------------------------------

export function getPassages(): Passage[] {
  return PASSAGES;
}

export function getPassageById(id: string): Passage | undefined {
  return PASSAGES.find((p) => p.id === id);
}

// --- Themes ----------------------------------------------------------------

/** All theme tags across the seed set, de-duplicated and sorted. */
export function getAllThemes(): string[] {
  const seen = new Set<string>();
  for (const p of PASSAGES) for (const t of p.themeTags) seen.add(t);
  return [...seen].sort();
}

/**
 * Passages tagged with `theme`, matched case-insensitively. Order follows the
 * seed order, so results are stable. (Synonym expansion is a later step; this
 * is exact-tag matching.)
 */
export function getPassagesByTheme(theme: string): Passage[] {
  const needle = theme.trim().toLowerCase();
  if (!needle) return [];
  return PASSAGES.filter((p) => p.themeTags.some((t) => t.toLowerCase() === needle));
}

// --- Rendering -------------------------------------------------------------

/**
 * Resolve a passage for a given translation, ready for a screen to render.
 *
 * Falls back to the default public-domain translation when the requested one is
 * locked or has no text for this passage. `fellBack` says whether that happened,
 * so the UI can show which version is actually on screen. The lead-in line comes
 * from the requested translation when present, otherwise from the KJV base.
 */
export function renderPassage(passage: Passage, translationId: TranslationId): RenderedPassage {
  const requested = getTranslation(translationId);
  const requestedText = requested && !requested.locked ? passage.text[translationId] : undefined;

  if (requested && requestedText) {
    return {
      passage,
      translation: requested,
      leadIn: requestedText.leadIn ?? passage.text.KJV.leadIn,
      verses: requestedText.verses,
      fellBack: false,
    };
  }

  const fallback = getTranslation(DEFAULT_TRANSLATION_ID)!;
  return {
    passage,
    translation: fallback,
    leadIn: passage.text.KJV.leadIn,
    verses: passage.text.KJV.verses,
    fellBack: true,
  };
}

// --- Why line --------------------------------------------------------------

/**
 * The "why this verse" line shown under the reference, e.g.
 * "Chosen for your new job, on courage". No counters — just the match.
 */
export function whyLine(situation: string, theme: string): string {
  return `Chosen for your ${situation.toLowerCase()}, on ${theme.toLowerCase()}`;
}
