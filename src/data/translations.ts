import type { Translation } from './types';

/**
 * Translation catalogue. The three public-domain translations ship in the
 * binary (locked: false); licensed ones are listed so the compare sheet can be
 * honest about the boundary, but carry no text and come later via YouVersion.
 */
export const TRANSLATIONS: Translation[] = [
  { id: 'KJV', name: 'King James Version', licenseNote: 'Public domain', locked: false },
  { id: 'BSB', name: 'Berean Standard Bible', licenseNote: 'Public domain', locked: false },
  { id: 'WEB', name: 'World English Bible', licenseNote: 'Public domain', locked: false },
  { id: 'NIV', name: 'New International Version', licenseNote: 'Licensed — needs YouVersion', locked: true },
  { id: 'NLT', name: 'New Living Translation', licenseNote: 'Licensed — needs YouVersion', locked: true },
];

/** The default translation used for fallback. Public domain, ships offline. */
export const DEFAULT_TRANSLATION_ID = 'KJV' as const;
