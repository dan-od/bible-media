-- Step 7: claiming local data into an account.
--
-- Onboarding and everything after it happen with no account, so a phone holds the
-- reader's situations, own words, tuned themes, stars, saves and notes before anyone
-- signs in. On first sign-in that data becomes the account's, exactly once:
--
--   * Every local record carries a client-generated UUID from the moment it was created.
--     claim_records() upserts on it, so re-running a batch (after the app was killed, a
--     lost response, a retry offline) produces the same rows, never a second copy.
--   * A client id belongs to one account forever (claim_ledger). An id another account
--     already owns is rejected and its row is never touched.
--   * Merge rules: a star or save is one row per passage, keeping the earliest time;
--     situations and tuned themes are a union; own words are kept from every phone
--     (identical words once); notes never merge.
--   * Nothing is copied until the person's consent to copy it is recorded.
--
-- Search history and the engagement tally never leave the phone: there is no table for
-- them, on purpose.
--
-- This migration also makes the shared reference tables read-only to clients. They had
-- RLS off, and Supabase grants anon and authenticated full write on public tables, so
-- anyone holding the public key could delete every verse, theme and passage reference.

-- ---------------------------------------------------------------- reference data
do $$
declare t text;
begin
  foreach t in array array['translations','passage_refs','verses','themes','theme_synonyms',
                           'passage_themes','context_cards','explained_phrases'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (true)', t || '_read_all', t);
    execute format('revoke insert, update, delete, truncate on %I from public', t);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke insert, update, delete, truncate on %I from anon', t);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('revoke insert, update, delete, truncate on %I from authenticated', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- client ids
alter table stars      add column client_id uuid unique, add column device_id uuid;
alter table saves      add column client_id uuid unique, add column device_id uuid;
alter table notes      add column client_id uuid unique, add column device_id uuid;
alter table situations add column client_id uuid unique, add column device_id uuid;

-- A situation is a theme the person picked, or their own words with no theme. Words
-- are never forced into a theme: they are what the person actually said.
alter table situations alter column theme_id drop not null;
alter table situations add constraint situations_theme_or_words
  check (theme_id is not null or nullif(btrim(own_words), '') is not null);
-- The union: one open situation per theme per person.
create unique index situations_one_open_per_theme
  on situations (user_id, theme_id) where theme_id is not null and ended_at is null;

-- Themes picked up in the swipe-to-tune step. Not "what I'm going through", so kept
-- apart from situations.
create table tuned_themes (
  user_id    uuid   not null references profiles(id) on delete cascade,
  theme_id   bigint not null references themes(id),
  client_id  uuid unique,
  created_at timestamptz not null default now(),
  primary key (user_id, theme_id)
);
alter table tuned_themes enable row level security;
create policy tuned_themes_own on tuned_themes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Every client id ever accepted, and the account it belongs to. Some accepted ids are
-- not stored on any row (a later star on a passage already starred; words identical to
-- words already kept), so ownership is checked here, not on the tables. No policies:
-- only claim_records (security definer) reads or writes it.
create table claim_ledger (
  client_id  uuid primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,
  claimed_at timestamptz not null default now()
);
alter table claim_ledger enable row level security;

-- ---------------------------------------------------------------- profile
-- profiles has no insert policy, so an account creates its own row through this. The
-- date of birth is what the minor rules run on; accounts are for 13 and over.
create function create_profile(p_display_name text, p_date_of_birth date,
                               p_level text default 'growing', p_translation_id text default null)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
  nm text := btrim(p_display_name);
begin
  if me is null then raise exception 'create_profile: not signed in'; end if;
  if exists (select 1 from profiles where id = me) then return false; end if;
  if nm is null or nm = '' or length(nm) > 60 then
    raise exception 'create_profile: a name of 1 to 60 characters is needed';
  end if;
  if p_date_of_birth is null or p_date_of_birth > (current_date - interval '13 years')::date then
    raise exception 'create_profile: accounts are for people 13 and over';
  end if;
  if p_date_of_birth < date '1900-01-01' then raise exception 'create_profile: date of birth out of range'; end if;
  if coalesce(p_level, 'growing') not in ('starting', 'growing', 'seasoned') then
    raise exception 'create_profile: unknown level';
  end if;
  insert into profiles (id, display_name, date_of_birth, level, translation_id)
  values (me, nm, p_date_of_birth, coalesce(p_level, 'growing'),
          (select id from translations where id = p_translation_id));
  return true;
end $$;

-- ---------------------------------------------------------------- claim helpers
-- Internal: never callable by a client (execute revoked below).
create function claim_passage_ref(p jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  b  text := btrim(p->>'book');
  c  int  := (p->>'chapter')::int;
  vs int  := (p->>'verse_start')::int;
  ve int  := (p->>'verse_end')::int;
  rid bigint;
begin
  if b is null or b = '' or length(b) > 40 then raise exception 'bad passage book'; end if;
  insert into passage_refs (book, chapter, verse_start, verse_end) values (b, c, vs, ve)
    on conflict (book, chapter, verse_start, verse_end) do nothing;
  select r.id into rid from passage_refs r
   where r.book = b and r.chapter = c and r.verse_start = vs and r.verse_end = ve;
  return rid;
end $$;

create function claim_theme(p_label text) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  l      text := btrim(p_label);
  v_slug text;
  tid    bigint;
begin
  if l is null or l = '' or length(l) > 60 then raise exception 'bad theme label'; end if;
  v_slug := trim(both '-' from regexp_replace(lower(l), '[^a-z0-9]+', '-', 'g'));
  if v_slug = '' then raise exception 'bad theme label'; end if;
  insert into themes (slug, label) values (v_slug, l) on conflict (slug) do nothing;
  select t.id into tid from themes t where t.slug = v_slug;
  return tid;
end $$;

-- ---------------------------------------------------------------- the claim
-- Takes up to 100 records and returns {accepted: [client_id], rejected: [{client_id,
-- reason}]}. Each record is applied on its own, so one bad record cannot hold back the
-- rest or block the queue. The client marks a record claimed only once it is accepted.
--
-- Record shape: {kind, op?, client_id, created_at?, ...}
--   kind  star | save      passage {book, chapter, verse_start, verse_end}
--         note             passage, body, visibility, updated_at
--         situation        label (a theme)
--         words            own_words
--         tuned            label (a theme)
--   op    upsert (default) | delete (something removed after it was claimed)
create function claim_records(batch jsonb, device uuid default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  me       uuid := auth.uid();
  r        jsonb;
  k        text;
  op       text;
  cid      uuid;
  ref      bigint;
  th       bigint;
  ts       timestamptz;
  upd      timestamptz;
  owner    uuid;
  words    text;
  accepted jsonb := '[]';
  rejected jsonb := '[]';
begin
  if me is null then raise exception 'claim_records: not signed in'; end if;
  if not exists (select 1 from profiles where id = me) then
    raise exception 'claim_records: no profile';
  end if;
  if not exists (select 1 from consents where user_id = me and kind = 'special_category') then
    raise exception 'claim_records: no consent recorded';
  end if;
  if batch is null or jsonb_typeof(batch) <> 'array' then
    raise exception 'claim_records: batch must be an array';
  end if;
  if jsonb_array_length(batch) > 100 then
    raise exception 'claim_records: at most 100 records per batch';
  end if;

  for r in select value from jsonb_array_elements(batch) loop
    begin
      k   := r->>'kind';
      op  := coalesce(r->>'op', 'upsert');
      cid := (r->>'client_id')::uuid;
      if cid is null then raise exception 'missing client_id'; end if;
      if op not in ('upsert', 'delete') then raise exception 'unknown op %', op; end if;
      ts := least(coalesce((r->>'created_at')::timestamptz, now()), now());

      -- An id another account owns is never touched.
      select l.user_id into owner from claim_ledger l where l.client_id = cid;
      if owner is not null and owner <> me then
        rejected := rejected || jsonb_build_object('client_id', cid, 'reason', 'other_account');
        continue;
      end if;

      if k = 'star' then
        ref := claim_passage_ref(r->'passage');
        if op = 'delete' then
          delete from stars where user_id = me and passage_ref_id = ref;
        else
          insert into stars as s (user_id, passage_ref_id, created_at, client_id, device_id)
          values (me, ref, ts, cid, device)
          on conflict (user_id, passage_ref_id) do update
            set client_id  = case when excluded.created_at < s.created_at then excluded.client_id else s.client_id end,
                device_id  = case when excluded.created_at < s.created_at then excluded.device_id else s.device_id end,
                created_at = least(s.created_at, excluded.created_at);
        end if;

      elsif k = 'save' then
        ref := claim_passage_ref(r->'passage');
        if op = 'delete' then
          delete from saves where user_id = me and passage_ref_id = ref;
        else
          insert into saves as s (user_id, passage_ref_id, created_at, client_id, device_id)
          values (me, ref, ts, cid, device)
          on conflict (user_id, passage_ref_id) do update
            set client_id  = case when excluded.created_at < s.created_at then excluded.client_id else s.client_id end,
                device_id  = case when excluded.created_at < s.created_at then excluded.device_id else s.device_id end,
                created_at = least(s.created_at, excluded.created_at);
        end if;

      elsif k = 'note' then
        if op = 'delete' then
          delete from notes where user_id = me and client_id = cid;
        else
          ref := claim_passage_ref(r->'passage');
          upd := least(coalesce((r->>'updated_at')::timestamptz, ts), now());
          -- Keyed on the note's own id: two phones' notes are two notes. A later edit
          -- of the same note wins; an older one arriving late is ignored.
          insert into notes as n (user_id, passage_ref_id, body, visibility, created_at, updated_at, client_id, device_id)
          values (me, ref, r->>'body', coalesce((r->>'visibility')::note_visibility, 'private'), ts, upd, cid, device)
          on conflict (client_id) do update
            set body = excluded.body, visibility = excluded.visibility, updated_at = excluded.updated_at
            where n.user_id = me and excluded.updated_at >= n.updated_at;
        end if;

      elsif k = 'situation' then
        th := claim_theme(r->>'label');
        if op = 'delete' then
          update situations set ended_at = now()
           where user_id = me and theme_id = th and ended_at is null;
        else
          insert into situations as s (user_id, theme_id, started_at, client_id, device_id)
          values (me, th, ts, cid, device)
          on conflict (user_id, theme_id) where theme_id is not null and ended_at is null
          do update set started_at = least(s.started_at, excluded.started_at);
        end if;

      elsif k = 'words' then
        if op = 'delete' then
          update situations set ended_at = now()
           where user_id = me and client_id = cid and ended_at is null;
        else
          words := btrim(r->>'own_words');
          if words is null or words = '' then raise exception 'empty words'; end if;
          if length(words) > 2000 then raise exception 'words too long'; end if;
          if exists (select 1 from situations where client_id = cid) then
            update situations set own_words = words where client_id = cid and user_id = me;
          elsif not exists (select 1 from situations
                             where user_id = me and theme_id is null and ended_at is null
                               and own_words = words) then
            insert into situations (user_id, theme_id, own_words, started_at, client_id, device_id)
            values (me, null, words, ts, cid, device);
          end if;
        end if;

      elsif k = 'tuned' then
        th := claim_theme(r->>'label');
        if op = 'delete' then
          delete from tuned_themes where user_id = me and theme_id = th;
        else
          insert into tuned_themes as t (user_id, theme_id, created_at, client_id)
          values (me, th, ts, cid)
          on conflict (user_id, theme_id) do update set created_at = least(t.created_at, excluded.created_at);
        end if;

      else
        raise exception 'unknown kind %', k;
      end if;

      if op = 'upsert' then
        insert into claim_ledger (client_id, user_id, kind) values (cid, me, k) on conflict (client_id) do nothing;
      end if;
      accepted := accepted || to_jsonb(cid::text);
    exception when others then
      rejected := rejected || jsonb_build_object('client_id', r->>'client_id', 'reason', 'invalid', 'detail', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end $$;

-- ---------------------------------------------------------------- reading it back
-- Everything this account has claimed, for a phone signing in to fill its local copy.
-- Every subquery filters to the caller's own rows explicitly (it runs as definer, and
-- notes_read would anyway also return a connection's circle notes).
create function my_records() returns jsonb
language sql stable security definer set search_path = public, auth as $$
  select jsonb_build_object(
    'profile', (select jsonb_build_object('display_name', p.display_name, 'level', p.level,
                                          'translation_id', p.translation_id)
                  from profiles p where p.id = auth.uid()),
    'consented', exists (select 1 from consents c
                          where c.user_id = auth.uid() and c.kind = 'special_category'),
    'stars', coalesce((select jsonb_agg(jsonb_build_object('client_id', s.client_id, 'created_at', s.created_at,
               'passage', jsonb_build_object('book', r.book, 'chapter', r.chapter,
                                             'verse_start', r.verse_start, 'verse_end', r.verse_end)))
               from stars s join passage_refs r on r.id = s.passage_ref_id where s.user_id = auth.uid()), '[]'),
    'saves', coalesce((select jsonb_agg(jsonb_build_object('client_id', s.client_id, 'created_at', s.created_at,
               'passage', jsonb_build_object('book', r.book, 'chapter', r.chapter,
                                             'verse_start', r.verse_start, 'verse_end', r.verse_end)))
               from saves s join passage_refs r on r.id = s.passage_ref_id where s.user_id = auth.uid()), '[]'),
    'notes', coalesce((select jsonb_agg(jsonb_build_object('client_id', n.client_id, 'body', n.body,
               'visibility', n.visibility, 'created_at', n.created_at, 'updated_at', n.updated_at,
               'passage', jsonb_build_object('book', r.book, 'chapter', r.chapter,
                                             'verse_start', r.verse_start, 'verse_end', r.verse_end)))
               from notes n join passage_refs r on r.id = n.passage_ref_id where n.user_id = auth.uid()), '[]'),
    'situations', coalesce((select jsonb_agg(jsonb_build_object('client_id', s.client_id, 'label', t.label,
               'own_words', s.own_words, 'started_at', s.started_at))
               from situations s left join themes t on t.id = s.theme_id
              where s.user_id = auth.uid() and s.ended_at is null), '[]'),
    'tuned', coalesce((select jsonb_agg(jsonb_build_object('client_id', tt.client_id, 'label', t.label,
               'created_at', tt.created_at))
               from tuned_themes tt join themes t on t.id = tt.theme_id where tt.user_id = auth.uid()), '[]')
  );
$$;

-- ---------------------------------------------------------------- grants
-- Postgres lets PUBLIC execute every new function; the internal helpers must not be.
revoke execute on function claim_passage_ref(jsonb) from public;
revoke execute on function claim_theme(text) from public;
revoke execute on function create_profile(text, date, text, text) from public;
revoke execute on function claim_records(jsonb, uuid) from public;
revoke execute on function my_records() from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function claim_passage_ref(jsonb) from anon;
    revoke execute on function claim_theme(text) from anon;
    revoke execute on function create_profile(text, date, text, text) from anon;
    revoke execute on function claim_records(jsonb, uuid) from anon;
    revoke execute on function my_records() from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke execute on function claim_passage_ref(jsonb) from authenticated;
    revoke execute on function claim_theme(text) from authenticated;
    grant execute on function create_profile(text, date, text, text) to authenticated;
    grant execute on function claim_records(jsonb, uuid) to authenticated;
    grant execute on function my_records() to authenticated;
  end if;
end $$;
