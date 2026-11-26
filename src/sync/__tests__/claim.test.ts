import { getNote, isStarred, noteList } from '@/data/collection';
import { mergeSnapshot, release } from '@/sync/account-data';
import { adopt, hasUnclaimed, pendingFor, runClaim, type ClaimServer } from '@/sync/claim';

import { FakeServer } from './fake-server';
import { Phone } from './phone';

// The claim, end to end on the client: a phone used for weeks with no account signs
// in, and everything on it becomes the account's exactly once — through retries,
// kills, offline, a second phone, and a second person on the same phone.

const A = 'aaaaaaaa-0000-4000-8000-000000000001';
const B = 'bbbbbbbb-0000-4000-8000-000000000002';
const DEVICE1 = 'd0000000-0000-4000-8000-000000000001';
const DEVICE2 = 'd0000000-0000-4000-8000-000000000002';

/** Weeks of use with no account. */
function usedPhone(): Phone {
  const p = new Phone();
  p.heart(['Anxiety', 'Money'], 'I’m stressed and can’t afford rent', ['Courage']);
  p.star('matthew-6-25-27');
  p.star('psalm-31-24');
  p.save('matthew-6-25-27');
  p.note('matthew-6-25-27', 'Rent is due Friday.', 'circle');
  p.note('first-timothy-6-6-8', 'Contentment, not more.');
  return p;
}
const RECORDS = 9; // 2 chips, words, tuned, 2 stars, save, 2 notes

/** Sign in: the person agreed to copy their data, so it becomes theirs, then the claim runs. */
async function signIn(phone: Phone, server: FakeServer, user: string, device = DEVICE1, batchSize?: number) {
  phone.viewer = user;
  await phone.write((s) => adopt(s, user));
  return runClaim({ store: phone, server: server.as(user), userId: user, deviceId: device, batchSize });
}

async function hydrate(phone: Phone, server: FakeServer, user: string) {
  const snap = await server.as(user).snapshot();
  await phone.write((s) => mergeSnapshot(s, snap, user));
}

let server: FakeServer;
beforeEach(() => {
  server = new FakeServer();
  server.account(A);
  server.account(B);
});

describe('claim twice', () => {
  it('makes no duplicates, and the second run sends nothing', async () => {
    const phone = usedPhone();
    expect(await signIn(phone, server, A)).toEqual({ status: 'done', rejected: 0 });
    expect(server.totalRows(A)).toBe(RECORDS);
    const calls = server.calls;
    expect(await signIn(phone, server, A)).toEqual({ status: 'done', rejected: 0 });
    expect(server.calls).toBe(calls);
    expect(server.totalRows(A)).toBe(RECORDS);
  });

  it('makes no duplicates even when the phone forgot it had claimed', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    // Lose every "claimed" mark: everything is sent again.
    await phone.write((s) => ({
      ...s,
      collection: { ...s.collection, stars: s.collection.stars.map((r) => ({ ...r, syncedRev: 0 })), notes: s.collection.notes.map((r) => ({ ...r, syncedRev: 0 })) },
    }));
    await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 });
    expect(server.totalRows(A)).toBe(RECORDS);
  });
});

describe('claim interrupted halfway, then re-run', () => {
  it('completes with no duplicates after the app is killed between batches', async () => {
    const phone = usedPhone();
    phone.viewer = A;
    await phone.write((s) => adopt(s, A));
    // The server applies the second batch, but the app dies before recording it.
    phone.killAfterWrites = phone.writes + 1;
    await expect(runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1, batchSize: 3 })).rejects.toThrow('app killed');
    phone.restart();
    expect(pendingFor(phone.read(), A).length).toBe(RECORDS - 3);
    expect(await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1, batchSize: 3 })).toEqual({ status: 'done', rejected: 0 });
    expect(server.totalRows(A)).toBe(RECORDS);
    expect(pendingFor(phone.read(), A)).toEqual([]);
  });

  it('completes with no duplicates when a response is lost after the server applied it', async () => {
    const phone = usedPhone();
    server.loseResponses = 1;
    expect((await signIn(phone, server, A)).status).toBe('offline');
    expect(server.totalRows(A)).toBe(RECORDS); // applied…
    expect(pendingFor(phone.read(), A).length).toBe(RECORDS); // …but not marked
    expect(await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 })).toEqual({ status: 'done', rejected: 0 });
    expect(server.totalRows(A)).toBe(RECORDS);
  });

  it('a kill before the consent stamp was persisted leaves nothing claimed and nothing owned', async () => {
    const phone = usedPhone();
    phone.killAfterWrites = 0;
    phone.viewer = A;
    await expect(phone.write((s) => adopt(s, A))).rejects.toThrow('app killed');
    phone.restart();
    expect(hasUnclaimed(phone.read())).toBe(true);
    expect(phone.allRecords().every((r) => r.owner === null)).toBe(true);
    expect(server.totalRows(A)).toBe(0);
  });
});

describe('two phones claim into one account', () => {
  it('is the union: nothing lost, notes from both, shared items once', async () => {
    const phone1 = usedPhone();
    const phone2 = new Phone();
    phone2.clock = Date.parse('2026-09-01T00:00:00Z'); // used earlier
    phone2.heart(['Anxiety', 'Grief'], 'My dad is ill', ['Courage', 'Hope']);
    phone2.star('psalm-31-24');
    phone2.note('matthew-6-25-27', 'From the other phone.');

    await signIn(phone1, server, A, DEVICE1);
    await signIn(phone2, server, A, DEVICE2);

    const rows = server.rows(A);
    expect(rows.stars.map((r) => r.passage.book).sort()).toEqual(['Matthew', 'Psalm']);
    // The shared star keeps the earlier time (phone2's).
    expect(rows.stars.find((r) => r.passage.book === 'Psalm')!.created_at.slice(0, 7)).toBe('2026-09');
    expect(rows.notes.map((n) => n.body).sort()).toEqual(['Contentment, not more.', 'From the other phone.', 'Rent is due Friday.']);
    expect(rows.situations.map((r) => r.label).sort()).toEqual(['Anxiety', 'Grief', 'Money']);
    expect(rows.words.map((r) => r.text).sort()).toEqual(['I’m stressed and can’t afford rent', 'My dad is ill']);
    expect(rows.tuned.map((r) => r.label).sort()).toEqual(['Courage', 'Hope']);

    // Each phone then holds the whole account, with no local duplicates.
    await hydrate(phone1, server, A);
    await hydrate(phone2, server, A);
    for (const phone of [phone1, phone2]) {
      const v = phone.view();
      expect(v.collection.stars).toHaveLength(2);
      expect(noteList(v.collection).map((n) => n.body).sort()).toEqual(['Contentment, not more.', 'From the other phone.', 'Rent is due Friday.']);
      expect([...v.profile.situations].sort()).toEqual(['Anxiety', 'Grief', 'Money']);
      expect([v.profile.freeText, ...(v.profile.moreWords ?? [])].sort()).toEqual(['I’m stressed and can’t afford rent', 'My dad is ill']);
      expect([...v.profile.tunedThemes].sort()).toEqual(['Courage', 'Hope']);
      expect(pendingFor(phone.read(), A)).toEqual([]);
    }
    // Two notes on one passage are both kept; the sheet edits the latest.
    expect(noteList(phone1.view().collection).filter((n) => n.passageId === 'matthew-6-25-27')).toHaveLength(2);
    expect(getNote(phone1.view().collection, 'matthew-6-25-27')).toBeDefined();
  });
});

describe('consent comes first', () => {
  it('a claim never sends records that belong to no account yet', async () => {
    const phone = usedPhone();
    phone.viewer = A; // signed in, but the copy line hasn't been agreed to
    expect(await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 })).toEqual({ status: 'done', rejected: 0 });
    expect(server.calls).toBe(0);
    expect(server.totalRows(A)).toBe(0);
    expect(phone.allRecords().every((r) => r.owner === null)).toBe(true);
  });
});

describe('nothing local', () => {
  it('is a no-op: no call, no empty rows', async () => {
    const phone = new Phone();
    expect(await signIn(phone, server, A)).toEqual({ status: 'done', rejected: 0 });
    expect(server.calls).toBe(0);
    expect(server.totalRows(A)).toBe(0);
  });
});

describe('server already has data', () => {
  it('signing in again on a phone that already holds the account makes no duplicates', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    await hydrate(phone, server, A);
    await hydrate(phone, server, A);
    expect(phone.view().collection.stars).toHaveLength(2);
    expect(phone.view().collection.notes).toHaveLength(2);
    expect(phone.view().profile.situations).toEqual(['Anxiety', 'Money']);
    await signIn(phone, server, A);
    expect(server.totalRows(A)).toBe(RECORDS);
  });

  it('a phone with the same star as the account adds no second star', async () => {
    await signIn(usedPhone(), server, A);
    const other = new Phone();
    other.star('psalm-31-24');
    other.heart(['Money'], '');
    await signIn(other, server, A, DEVICE2);
    expect(server.rows(A).stars).toHaveLength(2);
    expect(server.rows(A).situations).toHaveLength(2);
  });
});

describe('a different person signs in on a phone with claimed data', () => {
  it('sees none of it, claims none of it, and the first account gets nothing of theirs', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    // A writes one more note offline, then signs out.
    server.offline = true;
    phone.note('john-15-5', 'Written offline, not yet copied.');
    expect((await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 })).status).toBe('offline');
    await phone.write((s) => release(s, A));
    phone.viewer = null;
    server.offline = false;

    // What A confirmed is gone from the phone; the unsent note stays, hidden.
    expect(phone.view().collection.notes).toEqual([]);
    expect(phone.view().profile.situations).toEqual([]);
    expect(phone.allRecords().map((r) => r.owner)).toEqual([A]);

    // B uses the phone and signs in.
    phone.star('joshua-1-9');
    await signIn(phone, server, B);
    expect(phone.view().collection.notes).toEqual([]);
    expect(isStarred(phone.view().collection, 'joshua-1-9')).toBe(true);
    expect(server.rows(B).stars.map((r) => r.passage.book)).toEqual(['Joshua']);
    expect(server.totalRows(B)).toBe(1);
    expect(server.rows(A).stars.map((r) => r.passage.book).sort()).toEqual(['Matthew', 'Psalm']);
    expect(server.rows(A).notes).toHaveLength(2);

    // A signs back in later: the held note is A's again, and is sent.
    await phone.write((s) => release(s, B));
    phone.viewer = A;
    expect(noteList(phone.view().collection).map((n) => n.body)).toEqual(['Written offline, not yet copied.']);
    await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 });
    expect(server.rows(A).notes).toHaveLength(3);
    expect(server.totalRows(B)).toBe(1);
  });

  it('records already owned by one account are invisible to another without a sign-out', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    phone.viewer = B; // the session switched without signing A out
    expect(phone.view().collection.stars).toEqual([]);
    expect(phone.view().profile.freeText).toBe('');
    await phone.write((s) => adopt(s, B));
    expect(pendingFor(phone.read(), B)).toEqual([]);
    expect((await runClaim({ store: phone, server: server.as(B), userId: B, deviceId: DEVICE1 })).status).toBe('done');
    expect(server.totalRows(B)).toBe(0);
  });

  it('if another account is offered an id anyway, the server refuses and the phone keeps the record', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    // A corrupted phone hands A's records to B.
    await phone.write((s) => ({
      ...s,
      collection: { ...s.collection, notes: s.collection.notes.map((n) => ({ ...n, owner: B, syncedRev: 0 })) },
    }));
    const outcome = await runClaim({ store: phone, server: server.as(B), userId: B, deviceId: DEVICE1 });
    expect(outcome).toEqual({ status: 'done', rejected: 2 });
    expect(server.totalRows(B)).toBe(0);
    expect(phone.read().collection.notes.map((n) => n.rejected)).toEqual(['other_account', 'other_account']);
    expect(pendingFor(phone.read(), B)).toEqual([]);
  });
});

describe('offline during the claim', () => {
  it('stays queued, is retried, and nothing is lost', async () => {
    const phone = usedPhone();
    const before = phone.allRecords().map((r) => r.clientId);
    server.offline = true;
    expect(await signIn(phone, server, A)).toEqual({ status: 'offline', remaining: RECORDS });
    expect(pendingFor(phone.read(), A)).toHaveLength(RECORDS);
    phone.note('john-15-5', 'Written while offline.');
    server.offline = false;
    expect(await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 })).toEqual({ status: 'done', rejected: 0 });
    expect(server.totalRows(A)).toBe(RECORDS + 1);
    expect(phone.allRecords().map((r) => r.clientId)).toEqual(expect.arrayContaining(before));
  });

  it('goes offline partway: what was confirmed stays claimed, the rest is retried', async () => {
    const phone = usedPhone();
    let n = 0;
    const flaky: ClaimServer = {
      claim: (batch, device) => (n++ === 1 ? Promise.reject(new Error('offline')) : server.as(A).claim(batch, device)),
    };
    phone.viewer = A;
    await phone.write((s) => adopt(s, A));
    expect((await runClaim({ store: phone, server: flaky, userId: A, deviceId: DEVICE1, batchSize: 4 })).status).toBe('offline');
    expect(pendingFor(phone.read(), A)).toHaveLength(RECORDS - 4);
    expect((await runClaim({ store: phone, server: flaky, userId: A, deviceId: DEVICE1, batchSize: 4 })).status).toBe('done');
    expect(server.totalRows(A)).toBe(RECORDS);
  });
});

describe('local stays the read path', () => {
  it('claiming deletes nothing local and changes only ownership and sync marks', async () => {
    const phone = usedPhone();
    const before = phone.allRecords().map(({ owner, syncedRev, ...rest }) => rest);
    await signIn(phone, server, A);
    const after = phone.allRecords().map(({ owner, syncedRev, ...rest }) => rest);
    expect(after).toEqual(before);
    expect(phone.allRecords().every((r) => r.owner === A && r.syncedRev === r.rev)).toBe(true);
  });

  it('an edit made while a batch is in flight is sent, not lost', async () => {
    const phone = usedPhone();
    phone.viewer = A;
    await phone.write((s) => adopt(s, A));
    let edited = false;
    const editing: ClaimServer = {
      claim: async (batch, device) => {
        const result = await server.as(A).claim(batch, device);
        if (!edited) {
          edited = true;
          phone.note('first-timothy-6-6-8', 'Edited mid-claim.');
        }
        return result;
      },
    };
    expect((await runClaim({ store: phone, server: editing, userId: A, deviceId: DEVICE1 })).status).toBe('done');
    expect(server.rows(A).notes.map((n) => n.body).sort()).toEqual(['Edited mid-claim.', 'Rent is due Friday.']);
  });

  it('removing a claimed star while signed in removes it from the account', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    phone.star('psalm-31-24'); // un-star
    await runClaim({ store: phone, server: server.as(A), userId: A, deviceId: DEVICE1 });
    expect(server.rows(A).stars.map((r) => r.passage.book)).toEqual(['Matthew']);
    expect(phone.read().collection.removed).toEqual([]);
    // …and signing in again doesn't bring it back.
    await hydrate(phone, server, A);
    expect(isStarred(phone.view().collection, 'psalm-31-24')).toBe(false);
  });

  it('a removal not yet sent is not undone by the account’s copy', async () => {
    const phone = usedPhone();
    await signIn(phone, server, A);
    server.offline = true;
    phone.note('first-timothy-6-6-8', '');
    server.offline = false;
    await hydrate(phone, server, A);
    expect(getNote(phone.view().collection, 'first-timothy-6-6-8')).toBeUndefined();
  });
});

describe('sign-out', () => {
  it('clears the local copies of claimed data, and keeps this phone’s settings and tally', async () => {
    const phone = usedPhone();
    await phone.write((s) => ({
      ...s,
      collection: { ...s.collection, engaged: { Worry: 2 } },
      profile: { ...s.profile, settings: { ...s.profile.settings, onboarded: true, level: 'seasoned', keepSearchHistory: false } },
    }));
    await signIn(phone, server, A);
    await phone.write((s) => release(s, A));
    phone.viewer = null;
    expect(phone.allRecords()).toEqual([]);
    expect(phone.view().profile.situations).toEqual([]);
    expect(phone.view().profile.freeText).toBe('');
    expect(phone.read().profile.settings).toMatchObject({ onboarded: true, level: 'seasoned', keepSearchHistory: false });
    expect(phone.read().collection.engaged).toEqual({ Worry: 2 });
    // Nothing was lost: it's all on the server.
    expect(server.totalRows(A)).toBe(RECORDS);
  });
});
