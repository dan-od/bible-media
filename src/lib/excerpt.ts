/**
 * A short excerpt of a passage that ends on a whole word. `numberOfLines`
 * truncates by character ("he shall stren…"), which cuts a word of Scripture
 * in half; this keeps the first `maxLines` lines as laid out (from
 * onTextLayout) and drops the last word to make room for the ellipsis. Line
 * breaks fall between words, since no word is wider than the line (see
 * lib/sheet-fit), so the kept text already ends on a word.
 */
export function wordExcerpt(lines: readonly string[], maxLines: number): string {
  const full = lines.join('');
  if (lines.length <= maxLines) return full.trim();
  const kept = lines.slice(0, maxLines).join('').trimEnd();
  const lastSpace = kept.search(/\s+\S*$/);
  const words = lastSpace > 0 ? kept.slice(0, lastSpace) : kept;
  return `${words.replace(/[\s,;:.]+$/, '')}…`;
}
