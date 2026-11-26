/**
 * The claim engine against the real claim_records / my_records on a local Supabase
 * stack (npx supabase start), through real auth sessions and RLS. This proves the
 * client's records and the SQL agree, which the fake server can only assume.
 *
 * Needs the stack running, so it's kept out of the main suite:
 *   npm run test:claim-db
 * It reads the URL and keys from `npx supabase status -o env`, and creates throwaway
 * users through the admin API (local only).
 */
import { execSync } from 'node:child_process';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { noteList } from '@/data/collection';
import { mergeSnapshot, release, type Snapshot } from '@/sync/account-data';
import { adopt, pendingFor, runClaim, type ClaimServer } from '@/sync/claim';

import { Phone } from './phone';


function env(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of execSync('npx supabase status -o env', { encoding: 'utf8' }).split('\n')) {
    const m = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

interface User {
  id: string;
  client: SupabaseClient;
  server: ClaimServer & { snapshot(): Promise<Snapshot> };
}

describe('the claim against local Supabase', () => {
  let e: Record<string, string>;
  let admin: SupabaseClient;

  async function newUser(): Promise<User> {
    const email = `claim-${Date.now()}-${Math.random().toString(16).slice(2)}@example.test`;
    const password = `pw-${Math.random().toString(36).slice(2)}-X1`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    const client = createClient(e.API_URL, e.PUBLISHABLE_KEY ?? e.ANON_KEY, { auth: { persistSession: false } });
    const signIn = await client.auth.signInWithPassword({ email, password });
    if (signIn.error) throw signIn.error;
    const profile = await client.rpc('create_profile', { p_display_name: 'Test', p_date_of_birth: '1990-01-01' });
    if (profile.error) throw profile.error;
    const consent = await client.from('consents').insert({ user_id: data.user.id, kind: 'special_category', version: 'test' });
    if (consent.error) throw consent.error;
    return {
      id: data.user.id,
      client,
      server: {
        async claim(batch, device) {
          const r = await client.rpc('claim_records', { batch, device });
          if (r.error) throw r.error;
          return r.data;
        },
        async snapshot() {
          const r = await client.rpc('my_records');
          if (r.error) throw r.error;
          return r.data as Snapshot;
        },
      },
    };
  }

  const count = async (u: User, table: string) => {
    const { count: n, error } = await u.client.from(table).select('*', { count: 'exact', head: true }).eq('user_id', u.id);
    if (error) throw error;
    return n ?? 0;
  };

  async function signIn(phone: Phone, u: User, device: string, batchSize?: number) {
    phone.viewer = u.id;
    await phone.write((s) => adopt(s, u.id));
    return runClaim({ store: phone, server: u.server, userId: u.id, deviceId: device, batchSize });
  }

  beforeAll(() => {
    e = env();
    admin = createClient(e.API_URL, e.SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  });

  const D1 = 'd0000000-0000-4000-8000-0000000000a1';
  const D2 = 'd0000000-0000-4000-8000-0000000000a2';

  it('claims twice, survives a kill, and two phones make the union', async () => {
    const a = await newUser();
    const phone1 = new Phone();
    phone1.heart(['Anxiety'], 'I am stressed', ['Courage']);
    phone1.star('psalm-31-24');
    phone1.note('psalm-31-24', 'phone one');

    // Killed after the first batch was applied but before it was recorded.
    phone1.viewer = a.id;
    await phone1.write((s) => adopt(s, a.id));
    phone1.killAfterWrites = phone1.writes + 1;
    await expect(runClaim({ store: phone1, server: a.server, userId: a.id, deviceId: D1, batchSize: 2 })).rejects.toThrow('app killed');
    phone1.restart();
    expect(await signIn(phone1, a, D1, 2)).toEqual({ status: 'done', rejected: 0 });
    expect(await signIn(phone1, a, D1)).toEqual({ status: 'done', rejected: 0 });

    const phone2 = new Phone();
    phone2.clock = Date.parse('2026-09-01T00:00:00Z');
    phone2.heart(['Anxiety', 'Grief'], 'My dad is ill');
    phone2.star('psalm-31-24');
    phone2.note('psalm-31-24', 'phone two');
    expect(await signIn(phone2, a, D2)).toEqual({ status: 'done', rejected: 0 });

    expect(await count(a, 'stars')).toBe(1);
    expect(await count(a, 'notes')).toBe(2);
    expect(await count(a, 'situations')).toBe(4); // Anxiety, Grief, and both phones' words
    expect(await count(a, 'tuned_themes')).toBe(1);
    const star = await a.client.from('stars').select('created_at').eq('user_id', a.id).single();
    expect(star.data!.created_at.slice(0, 7)).toBe('2026-09');

    // Each phone then holds the whole account.
    const snap = await a.server.snapshot();
    await phone1.write((s) => mergeSnapshot(s, snap, a.id));
    expect(noteList(phone1.view().collection).map((n) => n.body).sort()).toEqual(['phone one', 'phone two']);
    expect([...phone1.view().profile.situations].sort()).toEqual(['Anxiety', 'Grief']);
    expect(pendingFor(phone1.read(), a.id)).toEqual([]);
  });

  it('another account is refused ids it does not own, and sees none of the first account’s rows', async () => {
    const a = await newUser();
    const b = await newUser();
    const phone = new Phone();
    phone.note('john-15-5', 'mine');
    phone.heart(['Grief'], 'said once');
    await signIn(phone, a, D1);
    await phone.write((s) => release(s, a.id));

    // A corrupted phone offers A's records as B's.
    const stolen = new Phone();
    stolen.state = {
      ...phone.state,
      collection: { ...phone.state.collection, notes: phone.read().collection.notes },
    };
    const notes = (await a.server.snapshot()).notes;
    stolen.state = {
      collection: {
        ...stolen.state.collection,
        notes: notes.map((n) => ({
          clientId: n.client_id!,
          owner: b.id,
          rev: 1,
          syncedRev: 0,
          passageId: 'john-15-5',
          body: 'overwritten',
          visibility: 'private' as const,
          createdAt: 0,
          updatedAt: Date.now(),
        })),
      },
      profile: stolen.state.profile,
    };
    expect(await runClaim({ store: stolen, server: b.server, userId: b.id, deviceId: D2 })).toEqual({ status: 'done', rejected: 1 });
    expect((await a.server.snapshot()).notes.map((n) => n.body)).toEqual(['mine']);
    expect(await count(b, 'notes')).toBe(0);
    const peek = await b.client.from('notes').select('id').eq('user_id', a.id);
    expect(peek.data).toEqual([]);
    const words = await b.client.from('situations').select('id').eq('user_id', a.id);
    expect(words.data).toEqual([]);
  });

  it('nothing local sends nothing and writes no rows', async () => {
    const a = await newUser();
    expect(await signIn(new Phone(), a, D1)).toEqual({ status: 'done', rejected: 0 });
    for (const t of ['stars', 'saves', 'notes', 'situations', 'tuned_themes']) expect(await count(a, t)).toBe(0);
  });
});
