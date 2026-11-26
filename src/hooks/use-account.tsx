/**
 * The account on this phone: signing in by email code, the copy step, background
 * claiming while signed in, and signing out. The order of steps lives in
 * sync/account; this wires it to the local store, Supabase and the screens.
 *
 * While signed in, changes are claimed a few seconds after they're made and when the
 * app comes back to the foreground. Offline, they wait.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clearHistory, getLocal, localStore, setAccount, subscribeLocal, useLocal } from '@/data/local-store';
import { isDurable } from '@/data/storage';
import { supabase } from '@/lib/supabase';
import { completeSignIn, signOut as signOutSteps, sync, type Account, type AccountDeps } from '@/sync/account';
import { hasUnclaimed } from '@/sync/claim';
import {
  createProfile as createProfileOnServer,
  currentUserId,
  endSession,
  fetchSnapshot,
  recordConsent,
  sendCode as sendCodeToEmail,
  supabaseClaimServer,
  verifyCode as verifyEmailCode,
} from '@/sync/supabase-server';

/** Where a sign-in stands between the code and the copy step. */
export interface PendingSignIn extends Account {
  needsProfile: boolean;
  /**
   * The copy line must be shown: this phone holds data that belongs to no account
   * yet, or this account has never agreed to it. Otherwise sign-in finishes directly.
   */
  needsCopy: boolean;
}

interface AccountContextValue {
  /** Whether this build has sign-in configured at all. */
  available: boolean;
  account: Account | null;
  pending: PendingSignIn | null;
  sendCode: (email: string) => Promise<void>;
  verifyCode: (email: string, code: string) => Promise<PendingSignIn>;
  createProfile: (name: string, dateOfBirth: string) => Promise<void>;
  /** The person agreed to the copy line: record consent, then claim. */
  agreeAndCopy: () => Promise<void>;
  /** Nothing to copy and consent already given: finish signing in. */
  finishSignIn: () => Promise<void>;
  /** Back out before anything was copied. */
  cancelSignIn: () => Promise<void>;
  /** 'unsent' means something hasn't reached the account yet; call again with anyway. */
  signOut: (anyway?: boolean) => Promise<'signed_out' | 'unsent'>;
  /** Anything on this phone that belongs to no account yet. */
  hasLocalData: boolean;
}

const AccountContext = createContext<AccountContextValue | null>(null);

function deps(): AccountDeps {
  const local = getLocal();
  return {
    read: localStore.read,
    write: localStore.write,
    account: () => getLocal().account,
    setAccount,
    server: supabaseClaimServer,
    fetchSnapshot,
    endSession,
    clearHistory,
    deviceId: local.deviceId,
    durable: isDurable(),
  };
}

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const local = useLocal();
  const [pending, setPendingState] = useState<PendingSignIn | null>(null);
  // Also kept in a ref: a screen may finish the sign-in in the same tick it verified.
  const pendingRef = useRef<PendingSignIn | null>(null);
  const setPending = useCallback((next: PendingSignIn | null | ((p: PendingSignIn | null) => PendingSignIn | null)) => {
    pendingRef.current = typeof next === 'function' ? next(pendingRef.current) : next;
    setPendingState(pendingRef.current);
  }, []);
  const syncing = useRef(false);
  const account = local.account;

  const syncNow = useCallback(async () => {
    const a = getLocal().account;
    if (!a || syncing.current || !supabase) return;
    syncing.current = true;
    try {
      // A session for someone else (or none) means this account must sign in again first.
      if ((await currentUserId()) !== a.userId) return;
      await sync(deps(), a.userId);
    } finally {
      syncing.current = false;
    }
  }, []);

  // A session left behind by a sign-in that never finished is ended at launch.
  useEffect(() => {
    if (!local.ready || !supabase || local.account) return;
    void currentUserId().then((id) => {
      if (id && !getLocal().account && !pending) void endSession();
    });
  }, [local.ready, local.account, pending]);

  // Claim shortly after changes, and when the app returns to the foreground.
  useEffect(() => {
    if (!account) return;
    void syncNow();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = getLocal();
    const unsubscribe = subscribeLocal(() => {
      const now = getLocal();
      if (now.collection === last.collection && now.profile === last.profile) return;
      last = now;
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), 3000);
    });
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void syncNow();
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
      sub.remove();
    };
  }, [account, syncNow]);

  const sendCode = useCallback((email: string) => sendCodeToEmail(email.trim()), []);

  const verifyCode = useCallback(async (email: string, code: string) => {
    const user = await verifyEmailCode(email.trim(), code.trim());
    const snap = await fetchSnapshot();
    const local = getLocal();
    const next = {
      ...user,
      needsProfile: snap.profile === null,
      needsCopy: !snap.consented || hasUnclaimed({ collection: local.collection, profile: local.profile }),
    };
    setPending(next);
    return next;
  }, [setPending]);

  const createProfile = useCallback(
    async (name: string, dateOfBirth: string) => {
      const settings = getLocal().profile.settings;
      await createProfileOnServer({ name, dateOfBirth, level: settings.level, translationId: settings.translationId });
      setPending((p) => (p ? { ...p, needsProfile: false, needsCopy: true } : p));
    },
    [setPending],
  );

  const agreeAndCopy = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) throw new Error('No sign-in in progress.');
    await recordConsent(p.userId);
    await completeSignIn(deps(), { userId: p.userId, email: p.email });
    setPending(null);
  }, [setPending]);

  const finishSignIn = useCallback(async () => {
    const p = pendingRef.current;
    if (!p) throw new Error('No sign-in in progress.');
    if (p.needsCopy) throw new Error('The copy line has to be agreed to first.');
    await completeSignIn(deps(), { userId: p.userId, email: p.email });
    setPending(null);
  }, [setPending]);

  const cancelSignIn = useCallback(async () => {
    setPending(null);
    if (!getLocal().account) await endSession();
  }, [setPending]);

  const signOut = useCallback(async (anyway?: boolean) => (await signOutSteps(deps(), { anyway })).status, []);

  const hasLocalData = useMemo(
    () => hasUnclaimed({ collection: local.collection, profile: local.profile }),
    [local.collection, local.profile],
  );

  const value = useMemo(
    () => ({
      available: supabase !== null,
      account,
      pending,
      sendCode,
      verifyCode,
      createProfile,
      agreeAndCopy,
      finishSignIn,
      cancelSignIn,
      signOut,
      hasLocalData,
    }),
    [account, pending, sendCode, verifyCode, createProfile, agreeAndCopy, finishSignIn, cancelSignIn, signOut, hasLocalData],
  );

  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount(): AccountContextValue {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error('useAccount must be used within an AccountProvider');
  return ctx;
}
