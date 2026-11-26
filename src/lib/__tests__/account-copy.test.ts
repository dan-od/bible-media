import { checkDateOfBirth, COPY_LINE, looksLikeCode, looksLikeEmail } from '@/lib/account-copy';

describe('the copy line', () => {
  it('is one sentence', () => {
    expect(COPY_LINE.split(/[.!?](\s|$)/).filter((s) => s && s.trim()).length).toBe(1);
  });

  it('names everything the claim copies, and that searches never leave', () => {
    for (const word of ['going through', 'own words', 'themes', 'stars', 'saves', 'notes', 'server', 'searches never leave this phone']) {
      expect(COPY_LINE).toContain(word);
    }
  });
});

describe('date of birth', () => {
  const today = new Date(Date.UTC(2026, 10, 25));

  it('accepts a real date for someone 13 or over', () => {
    expect(checkDateOfBirth('25', '11', '2013', today)).toEqual({ ok: true, iso: '2013-11-25' });
    expect(checkDateOfBirth('1', '2', '1990', today)).toEqual({ ok: true, iso: '1990-02-01' });
  });

  it('refuses under 13, by a day', () => {
    expect(checkDateOfBirth('26', '11', '2013', today).ok).toBe(false);
  });

  it('refuses dates that do not exist, the future, and partial input', () => {
    expect(checkDateOfBirth('31', '2', '2000', today).ok).toBe(false);
    expect(checkDateOfBirth('1', '1', '2030', today).ok).toBe(false);
    expect(checkDateOfBirth('', '1', '2000', today).ok).toBe(false);
    expect(checkDateOfBirth('1', '1', '99', today).ok).toBe(false);
  });
});

it('checks email and code shapes', () => {
  expect(looksLikeEmail(' a@b.co ')).toBe(true);
  expect(looksLikeEmail('a@b')).toBe(false);
  expect(looksLikeCode('123456')).toBe(true);
  expect(looksLikeCode('12345')).toBe(false);
});
