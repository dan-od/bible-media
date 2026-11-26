import { noteList } from '@/data/collection';
import { completeSignIn, signOut, type Account, type AccountDeps } from '@/sync/account';

import { FakeServer } from './fake-server';
import { Phone } from './phone';

// The order of sign-in and sign-out, on a phone, against the fake server.

const A: Account = { userId: 'aaaaaaaa-0000-4000-8000-000000000001', email: 'a@example.com' };
const B: Account = { userId: 'bbbbbbbb-0000-4000-8000-000000000002', email: 'b@example.com' };

function deps(phone: Phone, server: FakeServer, ended: { count: number } = { count: 0 }): AccountDeps {
  let account: Account | null = phone.viewer ? { userId: phone.viewer, email: '' } : null;
  return {
    read: () => phone.read(),
    write: (c) => phone.write(c),
    account: () => account,
    setAccount: async (a) => {
      account = a;
      phone.viewer = a?.userId ?? null;
    },
    get server() {
      return server.as(account?.userId ?? phone.viewer ?? '');
    },
    fetchSnapshot: () => server.as(account!.userId).snapshot(),
    endSession: async () => {
      ended.count++;
    },
    deviceId: 'd0000000-0000-4000-8000-000000000001',
    durable: true,
  };
}

function used(): Phone {
  const p = new Phone();
  p.heart(['Grief'], 'My mum died in March');
  p.star('psalm-34-18');
  p.note('psalm-34-18', 'Close to the brokenhearted.');
  return p;
}

let server: FakeServer;
beforeEach(() => {
  server = new FakeServer();
  server.account(A.userId);
  server.account(B.userId);
});

it('sign-in stamps, remembers, claims and merges, in that order', async () => {
  const phone = used();
  const d = deps(phone, server);
  // The phone is stamped before the first batch is sent.
  const claim = server.as(A.userId).claim;
  let stampedFirst = false;
  Object.defineProperty(d, 'server', {
    get: () => ({
      claim: (batch: never, device: string) => {
        stampedFirst = phone.persisted.profile.words.every((w) => w.owner === A.userId);
        return claim(batch, device);
      },
    }),
  });
  expect(await completeSignIn(d, A)).toEqual({ status: 'done', rejected: 0 });
  expect(stampedFirst).toBe(true);
  expect(phone.viewer).toBe(A.userId);
  expect(server.totalRows(A.userId)).toBe(4);
});

it('signing in with a different account remembered releases the first account’s data', async () => {
  const phone = used();
  const d = deps(phone, server);
  await completeSignIn(d, A);
  await completeSignIn(d, B);
  expect(noteList(phone.view().collection)).toEqual([]);
  // Gone from the phone, not just hidden: it's in A's account.
  expect(phone.allRecords().filter((r) => r.owner === A.userId)).toEqual([]);
  expect(server.totalRows(B.userId)).toBe(0);
  expect(server.totalRows(A.userId)).toBe(4);
});

it('sign-out clears the claimed copies and ends the session', async () => {
  const phone = used();
  const ended = { count: 0 };
  const d = deps(phone, server, ended);
  await completeSignIn(d, A);
  expect(await signOut(d)).toEqual({ status: 'signed_out' });
  expect(phone.allRecords()).toEqual([]);
  expect(phone.viewer).toBeNull();
  expect(ended.count).toBe(1);
});

it('sign-out with something unsent stops and says so, and signing out anyway keeps it hidden for the account', async () => {
  const phone = used();
  const d = deps(phone, server);
  await completeSignIn(d, A);
  server.offline = true;
  phone.note('john-15-5', 'Not sent yet.');
  expect(await signOut(d)).toEqual({ status: 'unsent' });
  expect(phone.viewer).toBe(A.userId);
  expect(await signOut(d, { anyway: true })).toEqual({ status: 'signed_out' });
  expect(phone.view().collection.notes).toEqual([]);
  expect(phone.allRecords().map((r) => r.owner)).toEqual([A.userId]);
});

it('signing in offline leaves everything queued and owned, and shows it', async () => {
  const phone = used();
  server.offline = true;
  const outcome = await completeSignIn(deps(phone, server), A);
  expect(outcome.status).toBe('offline');
  expect(phone.view().collection.notes).toHaveLength(1);
  expect(phone.allRecords().every((r) => r.owner === A.userId)).toBe(true);
});

it('refuses to claim when local storage is not durable', async () => {
  const phone = used();
  const d = { ...deps(phone, server), durable: false };
  expect(await completeSignIn(d, A)).toEqual({ status: 'not_durable' });
  expect(server.calls).toBe(0);
});
