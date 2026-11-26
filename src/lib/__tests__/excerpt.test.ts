import { wordExcerpt } from '@/lib/excerpt';

// The note sheet quotes the passage in a few lines. Truncating by character
// cuts a word of Scripture in half; the excerpt ends on a whole word instead.

const LINES = ['Be of good courage, and ', 'he shall strengthen your ', 'heart, all ye that hope ', 'in the LORD.'];

it('keeps whole words from the first lines and ends with an ellipsis', () => {
  expect(wordExcerpt(LINES, 3)).toBe('Be of good courage, and he shall strengthen your heart, all ye that…');
});

it('never ends on part of a word', () => {
  const verse = LINES.join('');
  const words = new Set(verse.split(/\s+/).map((w) => w.replace(/[,;:.]$/, '')));
  for (let n = 1; n < LINES.length; n++) {
    const shown = wordExcerpt(LINES, n).replace(/…$/, '');
    for (const w of shown.split(/\s+/)) expect(words.has(w.replace(/[,;:.]$/, ''))).toBe(true);
  }
});

it('drops trailing punctuation before the ellipsis', () => {
  expect(wordExcerpt(['Be of good courage, ', 'and he shall ', 'more'], 1)).toBe('Be of good…');
  expect(wordExcerpt(['Be of good ', 'courage, and he ', 'more'], 2)).toBe('Be of good courage, and…');
});

it('shows the whole passage when it fits', () => {
  expect(wordExcerpt(LINES, 4)).toBe(LINES.join('').trim());
});
