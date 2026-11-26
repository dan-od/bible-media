import {
  addTunedThemes,
  buildTuneDeck,
  canContinueHeart,
  DEFAULT_PROFILE,
  effectiveSituations,
  parseProfile,
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
