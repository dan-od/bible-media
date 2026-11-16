import {
  getAllThemes,
  getAvailableTranslations,
  getPassageById,
  getPassages,
  getPassagesByTheme,
  getTranslation,
  getTranslations,
  renderPassage,
  whyLine,
} from '@/data/verseStore';
import type { Passage } from '@/data/types';

describe('translations', () => {
  it('ships the three public-domain translations as available', () => {
    const available = getAvailableTranslations().map((t) => t.id).sort();
    expect(available).toEqual(['BSB', 'KJV', 'WEB']);
  });

  it('keeps licensed translations listed but locked and textless', () => {
    const niv = getTranslation('NIV');
    expect(niv).toBeDefined();
    expect(niv?.locked).toBe(true);
    expect(getAvailableTranslations().some((t) => t.id === 'NIV')).toBe(false);
  });

  it('exposes every translation with a license note', () => {
    for (const t of getTranslations()) {
      expect(t.name.length).toBeGreaterThan(0);
      expect(t.licenseNote.length).toBeGreaterThan(0);
    }
  });
});

describe('passages', () => {
  const passages = getPassages();

  it('has a non-empty seed set', () => {
    expect(passages.length).toBeGreaterThanOrEqual(10);
  });

  it('gives every passage a unique id', () => {
    const ids = passages.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('looks a passage up by id', () => {
    const p = getPassageById('psalm-31-24');
    expect(p?.reference).toBe('Psalm 31:24');
    expect(getPassageById('does-not-exist')).toBeUndefined();
  });

  it('treats every passage as a complete thought of 1–3 verses', () => {
    for (const p of passages) {
      const span = p.verseEnd - p.verseStart + 1;
      expect(span).toBeGreaterThanOrEqual(1);
      expect(span).toBeLessThanOrEqual(3);
      expect(p.text.KJV.verses).toHaveLength(span);
    }
  });

  it('numbers the lead-in as the verse immediately before the range', () => {
    for (const p of passages) {
      expect(p.leadInVerse).toBe(p.verseStart - 1);
      expect(p.text.KJV.leadIn.number).toBe(p.verseStart - 1);
      expect(p.text.KJV.leadIn.text.length).toBeGreaterThan(0);
    }
  });

  it('numbers range verses consecutively from verseStart', () => {
    for (const p of passages) {
      const numbers = p.text.KJV.verses.map((v) => v.number);
      const expected = Array.from({ length: p.verseEnd - p.verseStart + 1 }, (_, i) => p.verseStart + i);
      expect(numbers).toEqual(expected);
    }
  });

  it('tags every passage with at least one theme', () => {
    for (const p of passages) {
      expect(p.themeTags.length).toBeGreaterThanOrEqual(1);
      expect(p.themeTags.every((t) => t.trim().length > 0)).toBe(true);
    }
  });

  it('keeps alternate-translation text aligned with the KJV range', () => {
    for (const p of passages) {
      for (const [, text] of Object.entries(p.text)) {
        if (!text) continue;
        expect(text.verses).toHaveLength(p.verseEnd - p.verseStart + 1);
      }
    }
  });
});

describe('themes', () => {
  it('lists themes sorted and de-duplicated', () => {
    const themes = getAllThemes();
    expect(themes).toEqual([...themes].sort());
    expect(new Set(themes).size).toBe(themes.length);
  });

  it('matches a theme case-insensitively and deterministically', () => {
    const a = getPassagesByTheme('Courage');
    const b = getPassagesByTheme('courage');
    expect(a.length).toBeGreaterThan(0);
    expect(a.map((p: Passage) => p.id)).toEqual(b.map((p) => p.id));
  });

  it('returns nothing for an unknown theme', () => {
    expect(getPassagesByTheme('Quarterly OKRs')).toEqual([]);
  });

  it('covers every onboarding heart theme with at least one passage', () => {
    const heart = ['Grief', 'Anxiety', 'New job', 'A breakup', 'Purpose', 'Discipline', 'Faith doubts', 'Money', 'Loneliness', 'Thankful'];
    for (const theme of heart) {
      expect(getPassagesByTheme(theme).length).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('renderPassage', () => {
  const psalm = getPassageById('psalm-31-24')!;

  it('renders the requested translation when it has text', () => {
    const r = renderPassage(psalm, 'BSB');
    expect(r.translation.id).toBe('BSB');
    expect(r.fellBack).toBe(false);
    expect(r.verses[0].text).toMatch(/courageous/i);
  });

  it('falls back to KJV when the translation has no text for the passage', () => {
    const joshua = getPassageById('joshua-1-9')!;
    const r = renderPassage(joshua, 'WEB');
    expect(r.fellBack).toBe(true);
    expect(r.translation.id).toBe('KJV');
    expect(r.verses).toEqual(joshua.text.KJV.verses);
  });

  it('never renders a locked translation, even if asked', () => {
    const r = renderPassage(psalm, 'NIV');
    expect(r.fellBack).toBe(true);
    expect(r.translation.locked).toBe(false);
  });
});

describe('whyLine', () => {
  it('names the situation and the theme without a counter', () => {
    const line = whyLine('New job', 'Courage');
    expect(line).toMatch(/new job/i);
    expect(line).toMatch(/courage/i);
    expect(line).not.toMatch(/\d/); // no counts anywhere a reader sees
  });
});
