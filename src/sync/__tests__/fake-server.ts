/**
 * An in-memory stand-in for claim_records / my_records, following the same rules as
 * the migration (20260101000003_claim.sql), with the failures a phone meets: offline,
 * a response lost after the server applied the batch. The SQL itself is proven in the
 * Postgres suite; supabase-claim.integration.test runs the same engine against it.
 */
import type { Snapshot } from '@/sync/account-data';
import type { ClaimRecord, ClaimResult, ClaimServer, PassageKey } from '@/sync/claim';

const pkey = (p: PassageKey) => `${p.book}|${p.chapter}|${p.verse_start}|${p.verse_end}`;
const lower = (s: string) => s.trim().toLowerCase();

interface Row {
  client_id: string;
  created_at: string;
  device?: string;
}

interface Account {
  consented: boolean;
  stars: Map<string, Row & { passage: PassageKey }>;
  saves: Map<string, Row & { passage: PassageKey }>;
  notes: Map<string, Row & { passage: PassageKey; body: string; visibility: 'private' | 'circle'; updated_at: string }>;
  situations: Map<string, Row & { label: string }>;
  words: Map<string, Row & { text: string }>;
  tuned: Map<string, Row & { label: string }>;
}

export class FakeServer {
  private accounts = new Map<string, Account>();
  /** client id -> owning account, for every id accepted (claim_ledger). */
  private owners = new Map<string, string>();
  offline = false;
  /** Apply the next N batches, then fail as if the response never arrived. */
  loseResponses = 0;
  calls = 0;

  account(userId: string, opts: { consented?: boolean } = {}): void {
    this.accounts.set(userId, {
      consented: opts.consented ?? true,
      stars: new Map(),
      saves: new Map(),
      notes: new Map(),
      situations: new Map(),
      words: new Map(),
      tuned: new Map(),
    });
  }

  as(userId: string): ClaimServer & { snapshot(): Promise<Snapshot> } {
    return {
      claim: (batch, deviceId) => this.claim(userId, batch, deviceId),
      snapshot: async () => {
        if (this.offline) throw new Error('offline');
        return this.snapshot(userId);
      },
    };
  }

  /** Rows by kind, for assertions. */
  rows(userId: string) {
    const a = this.accounts.get(userId)!;
    return {
      stars: [...a.stars.values()],
      saves: [...a.saves.values()],
      notes: [...a.notes.values()],
      situations: [...a.situations.values()],
      words: [...a.words.values()],
      tuned: [...a.tuned.values()],
    };
  }

  totalRows(userId: string): number {
    return Object.values(this.rows(userId)).reduce((n, list) => n + list.length, 0);
  }

  private async claim(me: string, batch: ClaimRecord[], device: string): Promise<ClaimResult> {
    this.calls++;
    if (this.offline) throw new Error('offline');
    const a = this.accounts.get(me);
    if (!a) throw new Error('no profile');
    if (!a.consented) throw new Error('no consent recorded');
    if (batch.length > 100) throw new Error('batch too large');
    const now = new Date().toISOString();
    const clamp = (t?: string) => (t && t < now ? t : now);
    const result: ClaimResult = { accepted: [], rejected: [] };

    for (const r of batch) {
      const owner = this.owners.get(r.client_id);
      if (owner && owner !== me) {
        result.rejected.push({ client_id: r.client_id, reason: 'other_account' });
        continue;
      }
      try {
        this.apply(a, r, clamp(r.created_at), clamp, device);
        // Accepted ids are the account's even when merged into another row (claim_ledger).
        if (r.op !== 'delete') this.owners.set(r.client_id, me);
        result.accepted.push(r.client_id);
      } catch (e) {
        result.rejected.push({ client_id: r.client_id, reason: 'invalid', detail: String(e) });
      }
    }
    if (this.loseResponses > 0) {
      this.loseResponses--;
      throw new Error('response lost');
    }
    return result;
  }

  private apply(a: Account, r: ClaimRecord, ts: string, clamp: (t?: string) => string, device: string) {
    const del = r.op === 'delete';
    switch (r.kind) {
      case 'star':
      case 'save': {
        if (!r.passage?.book) throw new Error('bad passage');
        const table = r.kind === 'star' ? a.stars : a.saves;
        const k = pkey(r.passage);
        if (del) {
          table.delete(k);
          return;
        }
        const row = table.get(k);
        if (!row) {
          table.set(k, { client_id: r.client_id, created_at: ts, passage: r.passage, device });
        } else if (ts < row.created_at) {
          table.set(k, { ...row, client_id: r.client_id, created_at: ts, device });
        }
        return;
      }
      case 'note': {
        if (del) {
          a.notes.delete(r.client_id);
          return;
        }
        if (!r.passage?.book) throw new Error('bad passage');
        if (!r.body || !r.body.trim()) throw new Error('notes_body_check');
        const upd = clamp(r.updated_at ?? ts);
        const row = a.notes.get(r.client_id);
        if (!row) {
          a.notes.set(r.client_id, {
            client_id: r.client_id,
            created_at: ts,
            updated_at: upd,
            passage: r.passage,
            body: r.body,
            visibility: r.visibility ?? 'private',
            device,
          });
        } else if (upd >= row.updated_at) {
          a.notes.set(r.client_id, { ...row, body: r.body, visibility: r.visibility ?? 'private', updated_at: upd });
        }
        return;
      }
      case 'situation':
      case 'tuned': {
        if (!r.label || !r.label.trim()) throw new Error('bad theme label');
        const table = r.kind === 'situation' ? a.situations : a.tuned;
        const k = lower(r.label);
        if (del) {
          table.delete(k);
          return;
        }
        const row = table.get(k);
        if (!row) {
          table.set(k, { client_id: r.client_id, created_at: ts, label: r.label.trim(), device });
        } else if (ts < row.created_at) {
          table.set(k, { ...row, created_at: ts });
        }
        return;
      }
      case 'words': {
        if (del) {
          a.words.delete(r.client_id);
          return;
        }
        const text = r.own_words?.trim();
        if (!text) throw new Error('empty words');
        const row = a.words.get(r.client_id);
        if (row) a.words.set(r.client_id, { ...row, text });
        else if (![...a.words.values()].some((w) => w.text === text)) {
          a.words.set(r.client_id, { client_id: r.client_id, created_at: ts, text, device });
        }
        return;
      }
      default:
        throw new Error(`unknown kind ${r.kind as string}`);
    }
  }

  private snapshot(me: string): Snapshot {
    const a = this.accounts.get(me);
    if (!a) return { consented: false, profile: null, stars: [], saves: [], notes: [], situations: [], tuned: [] };
    return {
      consented: a.consented,
      profile: { display_name: 'Test', level: 'growing', translation_id: null },
      stars: [...a.stars.values()].map((r) => ({ client_id: r.client_id, created_at: r.created_at, passage: r.passage })),
      saves: [...a.saves.values()].map((r) => ({ client_id: r.client_id, created_at: r.created_at, passage: r.passage })),
      notes: [...a.notes.values()].map((r) => ({
        client_id: r.client_id,
        body: r.body,
        visibility: r.visibility,
        created_at: r.created_at,
        updated_at: r.updated_at,
        passage: r.passage,
      })),
      situations: [
        ...[...a.situations.values()].map((r) => ({ client_id: r.client_id, label: r.label, own_words: null, started_at: r.created_at })),
        ...[...a.words.values()].map((r) => ({ client_id: r.client_id, label: null, own_words: r.text, started_at: r.created_at })),
      ],
      tuned: [...a.tuned.values()].map((r) => ({ client_id: r.client_id, label: r.label, created_at: r.created_at })),
    };
  }
}
