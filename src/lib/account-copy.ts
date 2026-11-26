/**
 * Words and checks for signing in.
 *
 * COPY_LINE is said once, before anything leaves the phone. What someone is going
 * through is religious and health-adjacent information about them; this is the moment
 * it stops being only on their phone. One plain sentence, naming everything that is
 * copied (situations, own words, tuned themes, stars, saves, notes) and the one thing
 * that never is (searches). Keep it in step with sync/claim if what's claimed changes.
 */
export const COPY_LINE =
  'This copies what you’ve said you’re going through, in your own words too, the themes you picked, and your stars, saves and notes to your account on our server; your searches stay on this phone.';

export const DOB_WHY = 'We ask because some things work differently for people under 18. Accounts are for people 13 and over.';

export type DateCheck = { ok: true; iso: string } | { ok: false; message: string };

/** Validate a date of birth typed as day, month and year. Accounts are 13+. */
export function checkDateOfBirth(day: string, month: string, year: string, today: Date = new Date()): DateCheck {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (![d, m, y].every(Number.isInteger) || !day.trim() || !month.trim() || year.trim().length !== 4) {
    return { ok: false, message: 'Enter the day, month and a four-digit year.' };
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return { ok: false, message: 'That date doesn’t exist.' };
  }
  if (y < 1900 || date.getTime() > today.getTime()) return { ok: false, message: 'Check the year.' };
  const thirteenth = new Date(Date.UTC(y + 13, m - 1, d));
  if (thirteenth.getTime() > Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())) {
    return { ok: false, message: 'Accounts are for people 13 and over. You can keep using the app without one.' };
  }
  return { ok: true, iso: date.toISOString().slice(0, 10) };
}

export function looksLikeEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function looksLikeCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
