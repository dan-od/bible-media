/// <reference types="node" />
import { writeFileSync } from 'fs';
import { join } from 'path';

import { FONT_FILES, loadFont } from '../../../jest/font-metrics';
import { scriptureWords, sheetWords } from '@/data/scripture-words';
import WORD_METRICS from '@/data/word-metrics.json';
import { getPassages } from '@/data/verseStore';

// The app sizes each reading surface from the widest word it can show (see
// lib/verse-fit and lib/sheet-fit), but it can't read font files at runtime, so the widths are
// measured here from the embedded fonts and committed as word-metrics.json.
// This test fails when the library changes and the file wasn't regenerated:
//
//   npm run measure:words

type FontFace = keyof typeof FONT_FILES;

/** Rounded up, so the stored width never under-states the real one. */
const ceil4 = (n: number) => Math.ceil(n * 10000) / 10000;

function widest(words: string[], face: FontFace) {
  const font = loadFont(face);
  let best = { word: '', em: 0 };
  for (const word of words) {
    const em = font.width(word);
    if (em > best.em) best = { word, em };
  }
  return { word: best.word, em: ceil4(best.em) };
}

function measure() {
  const { verse, leadIn } = scriptureWords(getPassages());
  const sheet = sheetWords(getPassages());
  // Each surface in the face it is set in (see the components).
  return {
    verse: widest(verse, 'serifDisplay'),
    leadIn: widest(leadIn, 'serifText'),
    compare: widest(sheet.compare, 'serifText'),
    excerpt: widest(sheet.excerpt, 'serifTextItalic'),
    context: widest(sheet.context, 'serifText'),
    title: widest(sheet.title, 'serifDisplay'),
    reference: widest(sheet.reference, 'sans'),
    readAll: widest(sheet.readAll, 'sansSemiBold'),
  };
}

it('word-metrics.json matches the library and the embedded fonts', () => {
  const measured = measure();
  if (process.env.WRITE_WORD_METRICS) {
    writeFileSync(join(__dirname, '../word-metrics.json'), JSON.stringify(measured, null, 2) + '\n');
    return; // the import above still holds the old file
  }
  expect(WORD_METRICS).toEqual(measured);
});

it('measures with the font’s own kerning', () => {
  // Checked against Chrome rendering the same file at 100px: 537.2px and 757.1px.
  expect(loadFont('serifDisplay').width('understanding,') * 100).toBeCloseTo(537.2, 1);
  expect(loadFont('serifText').width('commandments') * 100).toBeCloseTo(757.1, 1);
});
