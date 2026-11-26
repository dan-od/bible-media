/**
 * The order things happen in when someone signs in or out. Each step is in
 * sync/claim or sync/account-data; this keeps them in sequence:
 *
 * Sign in (after the code is verified, the profile exists, and the person agreed to
 * the copy line, which records consent on the server):
 *   1. A different account still remembered on this phone is released first, as if
 *      it had signed out (search history and the tally go too).
 *   2. Every unowned record is stamped with this account, and that is persisted.
 *   3. The account is remembered locally (the screens now show its data).
 *   4. The claim runs. Offline, it stays queued and runs again later.
 *   5. What the account already holds elsewhere is merged in.
 *
 * Sign out:
 *   1. A last claim is attempted.
 *   2. If anything still hasn't reached the server, stop and say so, unless the person
 *      chose to sign out anyway (then it stays on the phone, hidden, for this account).
 *   3. Search history is deleted. Then the local copies of claimed data are cleared,
 *      with the tally of themes engaged with, and the session ended. History and the
 *      tally are never claimed, so nothing brings them back: on a shared phone they're
 *      the most revealing thing left, so they don't outlast the account. History goes
 *      first so a storage failure stops sign-out with the account still signed in.
 */
import { hasUnsent, mergeSnapshot, release, type Snapshot } from './account-data';
import { adopt, runClaim, type ClaimOutcome, type ClaimServer, type LocalState } from './claim';

export interface Account {
  userId: string;
  email: string;
}

export interface AccountDeps {
  read(): LocalState;
  write(change: (s: LocalState) => LocalState): Promise<void>;
  account(): Account | null;
  setAccount(account: Account | null): Promise<void>;
  server: ClaimServer;
  fetchSnapshot(): Promise<Snapshot>;
  endSession(): Promise<void>;
  /** Delete this phone's search history. */
  clearHistory(): Promise<void>;
  deviceId: string;
  durable: boolean;
}

/** Send what's pending, then merge in what the account holds. Never throws. */
export async function sync(deps: AccountDeps, userId: string): Promise<ClaimOutcome> {
  const outcome = await runClaim({
    store: { read: deps.read, write: deps.write },
    server: deps.server,
    userId,
    deviceId: deps.deviceId,
    durable: deps.durable,
  }).catch((): ClaimOutcome => ({ status: 'offline', remaining: -1 }));
  try {
    const snap = await deps.fetchSnapshot();
    await deps.write((s) => mergeSnapshot(s, snap, userId));
  } catch {
    // Offline: the account's other data arrives next time.
  }
  return outcome;
}

export async function completeSignIn(deps: AccountDeps, account: Account): Promise<ClaimOutcome> {
  const previous = deps.account();
  if (previous && previous.userId !== account.userId) {
    await deps.clearHistory();
    await deps.write((s) => release(s, previous.userId));
  }
  await deps.write((s) => adopt(s, account.userId));
  await deps.setAccount(account);
  return sync(deps, account.userId);
}

export type SignOutResult = { status: 'signed_out' } | { status: 'unsent' };

export async function signOut(deps: AccountDeps, opts: { anyway?: boolean } = {}): Promise<SignOutResult> {
  const account = deps.account();
  if (!account) return { status: 'signed_out' };
  await runClaim({
    store: { read: deps.read, write: deps.write },
    server: deps.server,
    userId: account.userId,
    deviceId: deps.deviceId,
    durable: deps.durable,
  }).catch(() => undefined);
  if (hasUnsent(deps.read(), account.userId) && !opts.anyway) return { status: 'unsent' };
  await deps.clearHistory();
  await deps.write((s) => release(s, account.userId));
  await deps.setAccount(null);
  await deps.endSession().catch(() => undefined);
  return { status: 'signed_out' };
}
