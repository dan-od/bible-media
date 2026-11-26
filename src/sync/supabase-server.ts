/**
 * The claim server and account calls, over Supabase (see the claim migration).
 * Any error — offline, timeout, a refusal — throws, so the claim leaves records
 * queued and tries again later.
 */
import { supabase } from '@/lib/supabase';

import type { Snapshot } from './account-data';
import type { ClaimRecord, ClaimResult, ClaimServer } from './claim';

/** The consent a claim requires, recorded when the person agrees to the copy line. */
export const CONSENT = { kind: 'special_category', version: 'claim-2026-11' } as const;

function client() {
  if (!supabase) throw new Error('Sign-in is not set up in this build.');
  return supabase;
}

export const supabaseClaimServer: ClaimServer = {
  async claim(batch: ClaimRecord[], deviceId: string): Promise<ClaimResult> {
    const { data, error } = await client().rpc('claim_records', { batch, device: deviceId || null });
    if (error) throw error;
    return data as ClaimResult;
  },
};

export async function fetchSnapshot(): Promise<Snapshot> {
  const { data, error } = await client().rpc('my_records');
  if (error) throw error;
  return data as Snapshot;
}

export async function createProfile(input: { name: string; dateOfBirth: string; level: string; translationId: string }) {
  const { error } = await client().rpc('create_profile', {
    p_display_name: input.name,
    p_date_of_birth: input.dateOfBirth,
    p_level: input.level,
    p_translation_id: input.translationId,
  });
  if (error) throw error;
}

export async function recordConsent(userId: string) {
  const { error } = await client()
    .from('consents')
    .upsert({ user_id: userId, kind: CONSENT.kind, version: CONSENT.version }, { ignoreDuplicates: true });
  if (error) throw error;
}

export async function sendCode(email: string) {
  const { error } = await client().auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}

export async function verifyCode(email: string, token: string): Promise<{ userId: string; email: string }> {
  const { data, error } = await client().auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  if (!data.user) throw new Error('No account came back from the code.');
  return { userId: data.user.id, email: data.user.email ?? email };
}

export async function endSession() {
  if (supabase) await supabase.auth.signOut({ scope: 'local' });
}

export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
