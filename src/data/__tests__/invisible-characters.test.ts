import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { getPassages } from '@/data/verseStore';

// No invisible characters anywhere in the app: not in Scripture, not in our own
// copy, not in code. A soft hyphen or a zero-width break can't be seen, so a
// person editing the copy can't know it's there to keep it, or that it's there
// at all; and how screen readers handle them hasn't been checked. A word too
// wide for its line is rewritten instead (see lib/sheet-fit).

const INVISIBLE: Record<string, string> = {
  '­': 'soft hyphen',
  '​': 'zero-width space',
  '‌': 'zero-width non-joiner',
  '‍': 'zero-width joiner',
  '⁠': 'word joiner',
  '﻿': 'zero-width no-break space',
};
const CODES = Object.keys(INVISIBLE).map((c) => c.codePointAt(0)!.toString(16));
const LITERAL = new RegExp(`[${Object.keys(INVISIBLE).join('')}]`, 'u');
/** The same characters written as escapes, as they'd appear in source or JSON. */
const ESCAPED = new RegExp(
  CODES.map((h) => `\\\\u0*${h}\\b|\\\\u\\{0*${h}\\}|\\\\x${h}\\b`).join('|') + '|&shy;',
  'i',
);

function found(text: string): string[] {
  const out = [...text].filter((c) => LITERAL.test(c)).map((c) => INVISIBLE[c]);
  const esc = text.match(ESCAPED);
  if (esc) out.push(`escape ${esc[0]}`);
  return out;
}

it('keeps them out of Scripture', () => {
  const offenders: string[] = [];
  for (const p of getPassages())
    for (const [id, t] of Object.entries(p.text)) {
      if (!t) continue;
      for (const v of [t.leadIn, ...t.verses]) if (v && found(v.text).length) offenders.push(`${p.reference} (${id})`);
    }
  expect(offenders).toEqual([]);
});

it('keeps them out of every string in the library, our own copy included', () => {
  const offenders: string[] = [];
  const walk = (value: unknown, path: string) => {
    if (typeof value === 'string') {
      if (found(value).length) offenders.push(`${path}: ${found(value).join(', ')}`);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, `${path}.${k}`);
    }
  };
  for (const p of getPassages()) walk(p, p.id);
  expect(offenders).toEqual([]);
});

it('keeps them out of every source and data file', () => {
  const root = join(__dirname, '../..');
  const offenders: string[] = [];
  const visit = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(tsx?|json|md)$/.test(name) && path !== __filename) {
        const hits = found(readFileSync(path, 'utf8'));
        if (hits.length) offenders.push(`${relative(root, path)}: ${[...new Set(hits)].join(', ')}`);
      }
    }
  };
  visit(root);
  expect(offenders).toEqual([]);
});
