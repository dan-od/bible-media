/**
 * Design tokens — two palettes from one set, plus type and spacing.
 *
 * Palette values come from the build spec (BUILD_PROMPT) Design-tokens section,
 * which reads as the intended production palette. The prototype's inline CSS
 * carries a different, explicitly swappable "Option A" placeholder set; where
 * the two disagree on raw palette values we follow the spec here.
 *
 * Semantic colours each mean exactly one thing (see `Semantic`). Their
 * dark-mode variants are derived for legibility on the dark background and are
 * PROVISIONAL — reconcile against the prototype when wiring the real screens.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    background: '#FAF8F3',
    text: '#17150F', // "ink"
    textSecondary: '#6B6355', // "muted"
    hairline: '#E4DDCE', // "hair"
    backgroundElement: '#F1ECE1', // "raised"
    gold: '#8A6A2E',
    onInk: '#FAF8F3',
    error: '#B4232A',
  },
  dark: {
    background: '#15130F',
    text: '#F3EEE3', // "ink"
    textSecondary: '#9C9385', // "muted"
    hairline: '#2C2821', // "hair"
    backgroundElement: '#1E1B16', // "raised"
    gold: '#CFA863',
    onInk: '#15130F',
    error: '#FF9A93',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Four semantic colours, each tied to a single meaning. Light values are from
 * the spec; dark values are lightened for contrast on the dark background.
 */
export const Semantic = {
  light: {
    sending: '#1C5A60', // teal
    prayer: '#7A3B4E', // plum
    finished: '#2C5A38', // forest — also "verified"
    starred: '#8A6A2E', // gold — also labels
  },
  dark: {
    sending: '#4FA3AA',
    prayer: '#C98BA0',
    finished: '#6FA77E',
    starred: '#CFA863',
  },
} as const;

/**
 * Font family strings.
 *
 * Native (iOS/Android) uses the fonts embedded by the expo-font config plugin.
 * On iOS a font is referenced by its PostScript name; on Android we declared
 * each face as a family with that same PostScript name, so one string works on
 * both. On web we fall back to the real Google family names (loaded via an
 * @import in global.css), plus the generic fallbacks the spec requires.
 */
export const Fonts = Platform.select({
  web: {
    serifDisplay: '"Libre Caslon Display", Georgia, serif',
    serifText: '"Libre Caslon Text", Georgia, serif',
    serifTextItalic: '"Libre Caslon Text", Georgia, serif',
    sans: '"Hanken Grotesk", system-ui, sans-serif',
    sansMedium: '"Hanken Grotesk", system-ui, sans-serif',
    sansSemiBold: '"Hanken Grotesk", system-ui, sans-serif',
  },
  default: {
    serifDisplay: 'LibreCaslonDisplay-Regular',
    serifText: 'LibreCaslonText-Regular',
    serifTextItalic: 'LibreCaslonText-Italic',
    sans: 'HankenGrotesk-Regular',
    sansMedium: 'HankenGrotesk-Medium',
    sansSemiBold: 'HankenGrotesk-SemiBold',
  },
}) as {
  serifDisplay: string;
  serifText: string;
  serifTextItalic: string;
  sans: string;
  sansMedium: string;
  sansSemiBold: string;
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 12,
  four: 16,
  five: 24,
  six: 32,
  seven: 48,
} as const;

/** Minimum tap target the spec requires everywhere. */
export const MinTapTarget = 44;

export const MaxContentWidth = 640;

/**
 * The reading measure for the passage column, in em so it grows with the system
 * text size instead of fighting it. ~34em is a comfortable line length; below
 * that the column is full width minus padding, so phones are unchanged.
 * Resolve to px with `ReadingColumnEm * RootFontSize * fontScale`.
 */
export const ReadingColumnEm = 34;
/** Reference root font size the em measures are based on. */
export const RootFontSize = 16;

/** Max content width for the bottom tab bar, so items don't spread on tablets. */
export const TabBarMaxWidth = 560;
