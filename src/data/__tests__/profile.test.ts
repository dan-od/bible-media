import {
  addTunedThemes,
  applyProfilePatch,
  buildTuneDeck,
  canContinueHeart,
  DEFAULT_PROFILE,
  effectiveSituations,
  EMPTY_STORED_PROFILE,
  migrateLegacyProfile,
  parseProfile,
  parseStoredProfile,
  profileView,
  type Profile,
} from '@/data/profile';

const AVAILABLE = ['KJV', 'BSB', 'WEB'] as const;

describe('parseProfile', () => {
  it('returns defaults for null or unparseable input', () => {
    expect(parseProfile(null, [...AVAILABLE])).toEqual(DEFAULT_PROFILE);
    expect(parseProfile('not json', [...AVAILABLE])).toEqual(DEFAULT_PROFILE);
    expect(parseProfile('"a string"', [...AVAILABLE])).toEqual(DEFAULT_PROFILE);
  });

  it('merges a partial profile over the defaults', () => {
    const p = parseProfile(JSON.stringify({ onboarded: true, situations: ['Grief'] }), [...AVAILABLE]);
    expect(p.onboarded).toBe(true);
    expect(p.situations).toEqual(['Grief']);
    expect(p.level).toBe(DEFAULT_PROFILE.level);
    expect(p.translationId).toBe(DEFAULT_PROFILE.translationId);
  });

  it('coerces invalid level and unavailable translation back to defaults', () => {
    const p = parseProfile(JSON.stringify({ level: 'wizard', translationId: 'NIV' }), [...AVAILABLE]);
    expect(p.level).toBe('growing');
    expect(p.translationId).toBe('KJV');
  });

  it('keeps a valid, available translation', () => {
    const p = parseProfile(JSON.stringify({ translationId: 'BSB' }), [...AVAILABLE]);
    expect(p.translationId).toBe('BSB');
  });

  it('drops non-string items from string arrays', () => {
    const p = parseProfile(JSON.stringify({ situations: ['Money', 3, null, 'Grief'] }), [...AVAILABLE]);
    expect(p.situations).toEqual(['Money', 'Grief']);
  });

  it('keeps search history on by default and only an explicit false turns it off', () => {
    expect(parseProfile(JSON.stringify({}), [...AVAILABLE]).keepSearchHistory).toBe(true);
    expect(parseProfile(JSON.stringify({ keepSearchHistory: 'nope' }), [...AVAILABLE]).keepSearchHistory).toBe(true);
    expect(parseProfile(JSON.stringify({ keepSearchHistory: false }), [...AVAILABLE]).keepSearchHistory).toBe(false);
  });
});

describe('effectiveSituations', () => {
  it('unions situations and tuned themes, de-duplicated, order preserved', () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      situations: ['New job', 'Courage'],
      tunedThemes: ['courage', 'Grief'],
    };
    expect(effectiveSituations(profile)).toEqual(['New job', 'Courage', 'Grief']);
  });

  // The heart step accepts "a few words" instead of chips. Those words were
  // stored and never read; now they reach themes the same way search does.
  it('reads the free-text answer through the same theme matching as search', () => {
    const profile: Profile = { ...DEFAULT_PROFILE, situations: [], freeText: 'I’m worried about money' };
    expect(effectiveSituations(profile)).toEqual(['Worry', 'Money']);
  });

  it('puts chips and tuned themes before free-text themes, without duplicates', () => {
    const profile: Profile = {
      ...DEFAULT_PROFILE,
      situations: ['Money'],
      tunedThemes: ['Grief'],
      freeText: 'so tired and worried about money',
    };
    expect(effectiveSituations(profile)).toEqual(['Money', 'Grief', 'Weariness', 'Worry']);
  });
});

describe('canContinueHeart', () => {
  it('needs at least one chip or a few words', () => {
    expect(canContinueHeart([], '')).toBe(false);
    expect(canContinueHeart([], '   ')).toBe(false);
    expect(canContinueHeart(['Grief'], '')).toBe(true);
    expect(canContinueHeart([], 'I just moved city')).toBe(true);
  });
});

describe('tune deck', () => {
  it('is a fixed, deterministic deck', () => {
    const a = buildTuneDeck();
    const b = buildTuneDeck();
    expect(a).toHaveLength(9);
    expect(a.map((c) => c.passage.id)).toEqual(b.map((c) => c.passage.id));
    expect(a[0].themes.length).toBeGreaterThan(0);
  });

  it('adds a card’s themes without duplicating', () => {
    const [card] = buildTuneDeck();
    const once = addTunedThemes([], card);
    const twice = addTunedThemes(once, card);
    expect(twice).toEqual(once);
  });
});

describe('stored profile records (step 7)', () => {
  let n = 0;
  const newId = () => `00000000-0000-4000-8000-${(++n).toString(16).padStart(12, '0')}`;
  const A = 'aaaaaaaa-0000-4000-8000-000000000001';
  const ctx = (now: number, owner: string | null = null) => ({ owner, now, newId });

  it('gives each chip, tuned theme and the own words an id, and shows them as before', () => {
    const s = applyProfilePatch(EMPTY_STORED_PROFILE, { situations: ['Grief', 'Money'], freeText: 'my words', tunedThemes: ['Hope'], level: 'starting' }, ctx(5));
    expect(s.situations.map((r) => r.label)).toEqual(['Grief', 'Money']);
    expect(new Set([...s.situations, ...s.tuned, ...s.words].map((r) => r.clientId)).size).toBe(4);
    expect(profileView(s, null)).toMatchObject({ situations: ['Grief', 'Money'], freeText: 'my words', tunedThemes: ['Hope'], level: 'starting' });
  });

  it('keeps a chip’s id when the list is re-saved, and edits the words in place', () => {
    let s = applyProfilePatch(EMPTY_STORED_PROFILE, { situations: ['Grief'], freeText: 'one' }, ctx(1));
    const chip = s.situations[0].clientId;
    const words = s.words[0].clientId;
    s = applyProfilePatch(s, { situations: ['grief', 'Money'], freeText: 'two' }, ctx(2));
    expect(s.situations.map((r) => r.clientId)[0]).toBe(chip);
    expect(s.situations).toHaveLength(2);
    expect(s.words).toEqual([expect.objectContaining({ clientId: words, text: 'two', rev: 2, updatedAt: 2 })]);
  });

  it('remembers claimed chips and words it removes; forgets unclaimed ones', () => {
    let s = applyProfilePatch(EMPTY_STORED_PROFILE, { situations: ['Grief', 'Money'], freeText: 'mine' }, ctx(1, A));
    s = applyProfilePatch(s, { situations: ['Money'], freeText: '' }, ctx(2, A));
    expect(s.removed.map((r) => [r.kind, r.label ?? null])).toEqual([['situation', 'Grief'], ['words', null]]);
    let u = applyProfilePatch(EMPTY_STORED_PROFILE, { situations: ['Grief'] }, ctx(1));
    u = applyProfilePatch(u, { situations: [] }, ctx(2));
    expect(u.removed).toEqual([]);
  });

  it('shows another phone’s own words alongside, and lets them reach themes', () => {
    const s = {
      ...EMPTY_STORED_PROFILE,
      words: [
        { clientId: newId(), owner: A, rev: 1, syncedRev: 1, text: 'can’t afford rent', createdAt: 1, updatedAt: 1 },
        { clientId: newId(), owner: A, rev: 1, syncedRev: 0, text: 'written here', createdAt: 2, updatedAt: 2 },
      ],
    };
    const view = profileView(s, A);
    expect(view.freeText).toBe('written here');
    expect(view.moreWords).toEqual(['can’t afford rent']);
    expect(effectiveSituations(view)).toEqual(effectiveSituations({ ...view, freeText: 'can’t afford rent', moreWords: [] }));
    expect(profileView(s, null).freeText).toBe('');
  });

  it('migrates a pre-step-7 profile without losing a word', () => {
    const old = parseProfile(JSON.stringify({ onboarded: true, situations: ['Anxiety', 'anxiety'], freeText: 'I’m stressed', tunedThemes: ['Courage'], translationId: 'KJV' }), ['KJV', 'BSB', 'WEB']);
    const s = migrateLegacyProfile(old, { now: 9, newId });
    expect(profileView(s, null)).toEqual({ ...old, situations: ['Anxiety'] });
    expect([...s.situations, ...s.tuned, ...s.words].every((r) => r.owner === null)).toBe(true);
    expect(parseStoredProfile(JSON.stringify(s), ['KJV', 'BSB', 'WEB'])).toEqual(s);
  });
});
