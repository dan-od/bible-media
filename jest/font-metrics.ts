/// <reference types="node" />
/**
 * Reads advance widths straight from the font files the app embeds, for tests
 * that need to know how wide a word really renders. It applies the font's own
 * pair kerning (GPOS PairPos), as iOS, Android and browsers do by default.
 * Checked against Chrome rendering the same files: identical to 0.1px.
 *
 * Test-only. It uses Node's fs and is never bundled into the app.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

export interface FontMetrics {
  /** Rendered width of `text` in em (multiply by the font size for points). */
  width(text: string): number;
  /** The font's default line height (ascender − descender + line gap), in em. */
  lineHeight: number;
}

const GOOGLE_FONTS = join(__dirname, '../node_modules/@expo-google-fonts');

/** The faces the reading surfaces use, from the same files app.config.ts embeds. */
export const FONT_FILES = {
  serifDisplay: join(GOOGLE_FONTS, 'libre-caslon-display/400Regular/LibreCaslonDisplay_400Regular.ttf'),
  serifText: join(GOOGLE_FONTS, 'libre-caslon-text/400Regular/LibreCaslonText_400Regular.ttf'),
  sans: join(GOOGLE_FONTS, 'hanken-grotesk/400Regular/HankenGrotesk_400Regular.ttf'),
  sansMedium: join(GOOGLE_FONTS, 'hanken-grotesk/500Medium/HankenGrotesk_500Medium.ttf'),
  sansSemiBold: join(GOOGLE_FONTS, 'hanken-grotesk/600SemiBold/HankenGrotesk_600SemiBold.ttf'),
} as const;

const cache = new Map<string, FontMetrics>();

export function loadFont(face: keyof typeof FONT_FILES): FontMetrics {
  const path = FONT_FILES[face];
  let font = cache.get(path);
  if (!font) {
    font = parse(readFileSync(path));
    cache.set(path, font);
  }
  return font;
}

function parse(b: Buffer): FontMetrics {
  const u16 = (o: number) => b.readUInt16BE(o);
  const i16 = (o: number) => b.readInt16BE(o);
  const u32 = (o: number) => b.readUInt32BE(o);

  const tables: Record<string, number> = {};
  for (let i = 0; i < u16(4); i++) {
    const o = 12 + i * 16;
    tables[b.toString('latin1', o, o + 4)] = u32(o + 8);
  }
  const unitsPerEm = u16(tables.head + 18);
  const ascender = i16(tables.hhea + 4);
  const descender = i16(tables.hhea + 6);
  const lineGap = i16(tables.hhea + 8);
  const numberOfHMetrics = u16(tables.hhea + 34);
  const advance = (glyph: number) => u16(tables.hmtx + 4 * Math.min(glyph, numberOfHMetrics - 1));

  const glyphOf = readCmap(b, tables.cmap);
  const kerning = readPairKerning(b, tables.GPOS);

  return {
    lineHeight: (ascender - descender + lineGap) / unitsPerEm,
    width(text) {
      let w = 0;
      let prev = -1;
      for (const ch of text) {
        const g = glyphOf.get(ch.codePointAt(0)!) ?? 0;
        w += advance(g);
        if (prev >= 0) w += kerning(prev, g);
        prev = g;
      }
      return w / unitsPerEm;
    },
  };
}

/** Unicode BMP → glyph, from the Windows (3,1) format-4 subtable. */
function readCmap(b: Buffer, cmap: number): Map<number, number> {
  const u16 = (o: number) => b.readUInt16BE(o);
  const map = new Map<number, number>();
  for (let i = 0; i < u16(cmap + 2); i++) {
    const rec = cmap + 4 + i * 8;
    const s = cmap + b.readUInt32BE(rec + 4);
    if (u16(rec) !== 3 || u16(rec + 2) !== 1 || u16(s) !== 4) continue;
    const segX2 = u16(s + 6);
    const ends = s + 14;
    const starts = ends + segX2 + 2;
    const deltas = starts + segX2;
    const rangeOffsets = deltas + segX2;
    for (let k = 0; k < segX2 / 2; k++) {
      const end = u16(ends + 2 * k);
      const start = u16(starts + 2 * k);
      const delta = b.readInt16BE(deltas + 2 * k);
      const ro = u16(rangeOffsets + 2 * k);
      for (let c = start; c <= end && c !== 0xffff; c++) {
        let g: number;
        if (ro === 0) g = (c + delta) & 0xffff;
        else {
          g = u16(rangeOffsets + 2 * k + ro + 2 * (c - start));
          if (g) g = (g + delta) & 0xffff;
        }
        map.set(c, g);
      }
    }
  }
  return map;
}

/** Pair kerning (x-advance adjustments) from GPOS lookup type 2, incl. extension lookups. */
function readPairKerning(b: Buffer, gpos: number | undefined): (left: number, right: number) => number {
  if (gpos === undefined) return () => 0;
  const u16 = (o: number) => b.readUInt16BE(o);
  const i16 = (o: number) => b.readInt16BE(o);

  const coverage = (o: number) => {
    const out = new Map<number, number>();
    const count = u16(o + 2);
    if (u16(o) === 1) for (let i = 0; i < count; i++) out.set(u16(o + 4 + 2 * i), i);
    else
      for (let i = 0; i < count; i++) {
        const r = o + 4 + 6 * i;
        for (let g = u16(r); g <= u16(r + 2); g++) out.set(g, u16(r + 4) + g - u16(r));
      }
    return out;
  };
  const classDef = (o: number) => {
    const out = new Map<number, number>();
    if (u16(o) === 1) {
      const first = u16(o + 2);
      for (let i = 0; i < u16(o + 4); i++) out.set(first + i, u16(o + 6 + 2 * i));
    } else
      for (let i = 0; i < u16(o + 2); i++) {
        const r = o + 4 + 6 * i;
        for (let g = u16(r); g <= u16(r + 2); g++) out.set(g, u16(r + 4));
      }
    return out;
  };
  const valueSize = (format: number) => {
    let n = 0;
    for (let f = format; f; f >>= 1) n += f & 1;
    return n * 2;
  };
  const xAdvance = (o: number, format: number) => {
    if (!(format & 4)) return 0;
    return i16(o + (format & 1 ? 2 : 0) + (format & 2 ? 2 : 0));
  };

  const pairs = new Map<number, number>();
  const classTables: { cov: Map<number, number>; get: (left: number, right: number) => number }[] = [];

  const lookupList = gpos + u16(gpos + 8);
  for (let li = 0; li < u16(lookupList); li++) {
    const lookup = lookupList + u16(lookupList + 2 + 2 * li);
    for (let si = 0; si < u16(lookup + 4); si++) {
      let sub = lookup + u16(lookup + 6 + 2 * si);
      let type = u16(lookup);
      if (type === 9) {
        type = u16(sub + 2);
        sub += b.readUInt32BE(sub + 4);
      }
      if (type !== 2) continue;
      const cov = coverage(sub + u16(sub + 2));
      const vf1 = u16(sub + 4);
      const vf2 = u16(sub + 6);
      if (u16(sub) === 1) {
        const setCount = u16(sub + 8);
        const rec = 2 + valueSize(vf1) + valueSize(vf2);
        for (const [left, ci] of cov) {
          if (ci >= setCount) continue;
          const set = sub + u16(sub + 10 + 2 * ci);
          for (let k = 0; k < u16(set); k++) {
            const r = set + 2 + k * rec;
            const key = left * 65536 + u16(r);
            if (!pairs.has(key)) pairs.set(key, xAdvance(r + 2, vf1));
          }
        }
      } else {
        const cd1 = classDef(sub + u16(sub + 8));
        const cd2 = classDef(sub + u16(sub + 10));
        const class2Count = u16(sub + 14);
        const rec = valueSize(vf1) + valueSize(vf2);
        classTables.push({
          cov,
          get: (left, right) =>
            xAdvance(sub + 16 + ((cd1.get(left) ?? 0) * class2Count + (cd2.get(right) ?? 0)) * rec, vf1),
        });
      }
    }
  }

  return (left, right) => {
    const direct = pairs.get(left * 65536 + right);
    if (direct !== undefined) return direct;
    const table = classTables.find((t) => t.cov.has(left));
    return table ? table.get(left, right) : 0;
  };
}
