# Data model brief — Bible feed app

Written before step 7, because every decision here is expensive to change once real
accounts exist. Postgres on Supabase. Row Level Security is the enforcement boundary,
not the client.

## Five decisions that shape everything

### 1. A passage is a range, not a verse

The feed's unit is one complete thought — normally 1–3 verses — addressed as a range.
`passage_refs` is translation-independent (`John 1:1-3`), and `verses` holds the text
per translation. Themes, stars, saves, notes and reposts all hang off `passage_refs`,
never off the text. This is what lets a reader star a passage in KJV and see it starred
in BSB, and it is why the lead-in verse is computable rather than stored.

### 2. "No counters" is a UI rule, not a storage rule

Store `reading_events` honestly. Leaders need "day 12 of 21", growth points need
countable activity, and you cannot add analytics later to data you never wrote. The rule
is that nothing in the reader's UI renders a streak, a feed-progress count, a follower
count or a public total. Keep the discipline in the components, not the schema.

### 3. Anonymous means hidden from members, not untraceable

`author_id` is always stored. Postgres RLS filters rows, not columns, so a policy cannot
hide one field. Anonymous content is therefore read through `v_discussion_replies` and
`v_prayer_requests`, views that null the author when `is_anonymous` is true. The base
tables stay closed to clients. This keeps abuse traceable by the service role while
members genuinely cannot see who asked.

### 4. Connections are one undirected row

A connection is stored once with `user_low < user_high` enforced by a check constraint,
not twice as a follow pair. There is no asymmetric follow in this product, and storing
it as a pair invites a bug where A sees B but not the reverse. Type is `friend`,
`family` or `guardian`.

### 5. Religious belief is special-category data

Situations, notes, prayer requests and group membership all reveal religious belief,
which is GDPR Article 9 special-category data. Three consequences you cannot bolt on:

- **Consent must be explicit and recorded** — a `consents` row with a timestamp and a
  version, captured at sign-up, not implied by use.
- **Export and erasure have to work** — one function per user that returns everything,
  and one that deletes it. Content in a group thread needs a tombstone, so deleting a
  member does not delete the group's history.
- **Private notes stay private from you too.** No admin screen reads them. If you ever
  need support access, it is an explicit, logged, time-boxed grant.

## What syncs and what stays on the phone

| Data | Where | Why |
|---|---|---|
| Public-domain verse text | Bundled in the binary | Offline from first launch, no account |
| Licensed verse text | Fetched, cached per YouVersion terms | Terms unconfirmed — assume no offline until they are |
| Themes, passage refs, context cards, explained phrases | Bundled, refreshed from server | Small, and the feed must work offline |
| Situations, level, translation choice | Both — local first, synced on sign-in | Onboarding happens before an account exists |
| Stars, saves, notes | Both — local first, synced on sign-in | Step 5 already writes these locally; migrate on first sign-in |
| Reposts, circle, messages, groups, prayer, Sunday notes | Server | Shared by definition |

The local-first path for the first five rows is not optional. Onboarding completes with
no account, so there must be a migration that claims anonymous local data into a new
user id on first sign-in.

## The hard parts

**Minor DM protection is a database policy, not a UI check.** A 13–17 account can only
exchange messages with an accepted connection, and an adult can only message a minor if
they share a group or a guardian approved it. That rule lives in the `messages` insert
policy. A client-side check is a suggestion; an RLS policy is the rule.

**Invite tokens must expire in the database.** Personal QR tokens rotate every few
minutes and invite links last 24 hours or one use. Enforce `expires_at` and `uses` in the
redeem function, not in the app.

**Group roles are hierarchical but stored flat.** `role` is an enum with an explicit
rank function, so a policy asks `role_rank(role) >= role_rank('coleader')` rather than
listing roles in every policy.

**The Sunday note that shapes the feed is a flag, not a sort.** One `is_active` note per
user at a time, enforced by a partial unique index. The feed reads the active note's
themes; it does not guess from recency.

## Decisions (resolved 2026-11-15)

1. **Region: `ca-central-1`.** App Store and Play availability is restricted to Canada
   and the US for v1, which keeps GDPR out of scope. Expanding to the EU or UK requires a
   **new EU-region project** — region is fixed at project creation and cannot be moved —
   **and an Article 27 representative**. Treat that as a migration, not a settings change.

2. **Leaders do not see who prayed — count only.** `prayer_prayed` stays as it is; no one
   reads another member's prayed row (the `prayed_read` policy already restricts to the
   caller's own row). Knowing who prayed would turn the prayer wall into an attendance
   register, the opposite of its purpose.

3. **The last leader cannot simply leave.** Enforced in the database, not the client
   (trigger `enforce_group_has_leader` + `archive_group()`): a leader who is the only
   leader of a non-archived group is blocked from leaving or demoting themselves. They must
   either appoint a successor first or explicitly archive the group. Archived groups
   (`groups.archived_at`) are read-only — members keep their history, nobody can post. No
   auto-promotion (it hands the role to someone who never agreed) and no claim-it flow (a
   takeover risk in a group containing minors).

4. **Messages are kept until deleted, with two hard rules and a minor's cap.** All
   enforced in the database:
   - Removing a connection **hard-deletes** the one-to-one thread between those two people,
     messages included (trigger `delete_dm_thread_on_unfriend`).
   - Deleting an account **tombstones** authored content: group discussions/replies/prayers
     and sent messages survive with the author/sender nulled (`ON DELETE SET NULL`), so the
     content and history remain but the identity does not (`delete_user()`).
   - For accounts **under 18**, messages older than **12 months** are purged on a schedule
     (`purge_minor_messages()`, run nightly by pg_cron) — data minimisation where the risk
     is highest.

These four live as a second migration (`20260101000001_decisions.sql`); the baseline
schema above is unchanged. Their authorization and behaviour are covered by
`supabase/tests/decisions_test.sql`, run alongside the 22-check suite.

## What testing the policies found

The schema and the 22 authorization checks were run against real Postgres 16, as a
non-superuser `authenticated` role with a JWT subject set per caller. Two things only
came out because the policies were executed rather than read.

**1. Infinite recursion in every membership helper.** `in_group()` reads
`group_members`, and the policy on `group_members` calls `in_group()`. Postgres recursed
until it gave up. This is the single most common Supabase RLS failure and it does not
show up until a non-owner role runs a query — an owner bypasses RLS and sees nothing
wrong. Fixed by making `is_minor`, `is_connected`, `in_group`, `group_rank`, `in_thread`
and `may_message` `SECURITY DEFINER` with a pinned `search_path`.

**2. A denied UPDATE is silent, and RLS cannot protect a column.** A member marking a
reply "clarified by leader" was not rejected — the row policy simply matched nothing, so
the statement succeeded and changed zero rows. Two consequences:

- Clarifying moved out of a policy and into `mark_clarified()`, a `SECURITY DEFINER`
  function that checks rank and raises. `clarified_by` and `clarified_at` are removed
  from the client's UPDATE grant, so the only way to set them is that function. An author
  keeps a plain `UPDATE (body)` grant to edit their own reply — which no policy allowed
  before, so that gap is now closed too.
- Everywhere else, the client must check the affected row count. "No error" does not mean
  "it worked" under RLS.

Run the suite with:

```
psql -f backend/stub_auth.sql -f backend/schema.sql -f backend/rls_test.sql
```

`stub_auth.sql` stands in for what Supabase provides (`auth.users`, `auth.uid()`) so the
schema runs on plain Postgres in CI. Against a real Supabase project, skip it.
