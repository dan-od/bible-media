-- Bible feed app — initial schema (Postgres / Supabase)
-- Enforcement boundary is RLS. The client is never trusted.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums
create type connection_type as enum ('friend', 'family', 'guardian');
create type connection_status as enum ('pending', 'accepted', 'blocked');
create type note_visibility as enum ('private', 'circle');
create type group_kind as enum ('group', 'family');
create type group_role as enum ('member', 'assistant', 'coleader', 'leader');
create type prayer_visibility as enum ('group', 'leaders');
create type message_kind as enum ('text', 'passage', 'note', 'voice');

-- Helpers called from RLS policies are SECURITY DEFINER on purpose: without it a
-- policy on group_members would call in_group(), which reads group_members, and
-- recurse forever. search_path is pinned so the definer right cannot be hijacked.
create function role_rank(r group_role) returns int language sql immutable as $$
  select case r when 'member' then 0 when 'assistant' then 1
                when 'coleader' then 2 when 'leader' then 3 end;
$$;

-- ---------------------------------------------------------------- scripture
create table translations (
  id              text primary key,              -- 'KJV', 'BSB', 'WEB', 'NIV'
  name            text not null,
  is_public_domain boolean not null,
  offline_allowed boolean not null default false
);

create table passage_refs (
  id          bigserial primary key,
  book        text not null,
  chapter     int  not null check (chapter > 0),
  verse_start int  not null check (verse_start > 0),
  verse_end   int  not null check (verse_end >= verse_start),
  unique (book, chapter, verse_start, verse_end)
);

create table verses (
  translation_id text not null references translations(id),
  book    text not null,
  chapter int  not null,
  verse   int  not null,
  text    text not null,
  primary key (translation_id, book, chapter, verse)
);

create table themes (
  id    bigserial primary key,
  slug  text unique not null,
  label text not null
);

create table theme_synonyms (
  theme_id bigint not null references themes(id) on delete cascade,
  term     text   not null,
  primary key (theme_id, term)
);

create table passage_themes (
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  theme_id       bigint not null references themes(id) on delete cascade,
  weight         real   not null default 1.0,
  primary key (passage_ref_id, theme_id)
);

create table context_cards (
  id             bigserial primary key,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  ord            int    not null,
  heading        text   not null,
  body           text   not null,
  unique (passage_ref_id, ord)
);

create table explained_phrases (
  id             bigserial primary key,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  phrase         text   not null,
  body           text   not null,
  unique (passage_ref_id, phrase)
);

-- ---------------------------------------------------------------- people
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  display_name   text not null,
  avatar_url     text,
  date_of_birth  date not null,
  level          text not null default 'growing',
  translation_id text references translations(id),
  created_at     timestamptz not null default now()
);

create function is_minor(u uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select age(p.date_of_birth) < interval '18 years' from profiles p where p.id = u;
$$;

create table consents (
  user_id    uuid not null references profiles(id) on delete cascade,
  kind       text not null,                   -- 'special_category', 'terms', 'privacy'
  version    text not null,
  granted_at timestamptz not null default now(),
  primary key (user_id, kind, version)
);

create table situations (
  id         bigserial primary key,
  user_id    uuid   not null references profiles(id) on delete cascade,
  theme_id   bigint not null references themes(id),
  own_words  text,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);
create index on situations (user_id) where ended_at is null;

-- ---------------------------------------------------------------- circle
create table connections (
  id         bigserial primary key,
  user_low   uuid not null references profiles(id) on delete cascade,
  user_high  uuid not null references profiles(id) on delete cascade,
  kind       connection_type   not null default 'friend',
  status     connection_status not null default 'pending',
  created_at timestamptz not null default now(),
  check (user_low < user_high),
  unique (user_low, user_high)
);

create function is_connected(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from connections c
    where c.status = 'accepted'
      and c.user_low  = least(a, b)
      and c.user_high = greatest(a, b));
$$;

create table guardian_links (
  guardian_id uuid not null references profiles(id) on delete cascade,
  minor_id    uuid not null references profiles(id) on delete cascade,
  status      connection_status not null default 'pending',
  ends_at     date not null,                 -- the minor's 18th birthday
  primary key (guardian_id, minor_id)
);

create table dm_approvals (                  -- an adult cleared to message a minor
  minor_id    uuid not null references profiles(id) on delete cascade,
  adult_id    uuid not null references profiles(id) on delete cascade,
  approved_by uuid not null references profiles(id),
  approved_at timestamptz not null default now(),
  primary key (minor_id, adult_id)
);

create table invites (
  id         bigserial primary key,
  owner_id   uuid not null references profiles(id) on delete cascade,
  group_id   bigint,
  token      text unique not null default encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz not null,
  max_uses   int not null default 1,
  uses       int not null default 0
);

-- ---------------------------------------------------------------- collection
create table stars (
  user_id        uuid   not null references profiles(id) on delete cascade,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, passage_ref_id)
);

create table saves (
  user_id        uuid   not null references profiles(id) on delete cascade,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, passage_ref_id)
);

create table notes (
  id             bigserial primary key,
  user_id        uuid   not null references profiles(id) on delete cascade,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  body           text   not null check (length(btrim(body)) > 0),
  visibility     note_visibility not null default 'private',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index on notes (user_id, created_at desc);

create table reposts (
  id             bigserial primary key,
  user_id        uuid   not null references profiles(id) on delete cascade,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  note_id        bigint references notes(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table reading_events (                -- stored, never shown as a count
  id             bigserial primary key,
  user_id        uuid   not null references profiles(id) on delete cascade,
  passage_ref_id bigint not null references passage_refs(id) on delete cascade,
  dwell_ms       int,
  created_at     timestamptz not null default now()
);
create index on reading_events (user_id, created_at desc);

-- ---------------------------------------------------------------- sunday notes
create table sunday_notes (
  id         bigserial primary key,
  user_id    uuid not null references profiles(id) on delete cascade,
  heard_on   date not null,
  speaker    text,
  title      text,
  body       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index one_active_sunday_note
  on sunday_notes (user_id) where is_active;

create table sunday_note_themes (
  sunday_note_id bigint not null references sunday_notes(id) on delete cascade,
  theme_id       bigint not null references themes(id),
  primary key (sunday_note_id, theme_id)
);

-- ---------------------------------------------------------------- groups
create table groups (
  id                  bigserial primary key,
  name                text not null,
  kind                group_kind not null default 'group',
  created_by          uuid not null references profiles(id),
  leaderboard_enabled boolean not null default false,
  family_verse_ref_id bigint references passage_refs(id),
  family_calling      text,
  created_at          timestamptz not null default now()
);

create table group_members (
  group_id  bigint not null references groups(id) on delete cascade,
  user_id   uuid   not null references profiles(id) on delete cascade,
  role      group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create function in_group(g bigint, u uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from group_members m where m.group_id = g and m.user_id = u);
$$;

create function group_rank(g bigint, u uuid) returns int
language sql stable security definer set search_path = public, auth as $$
  select coalesce((select role_rank(m.role) from group_members m
                   where m.group_id = g and m.user_id = u), -1);
$$;

create table reading_plans (
  id         bigserial primary key,
  group_id   bigint not null references groups(id) on delete cascade,
  book       text not null,
  pace       text not null default 'chapter_per_day',
  start_date date not null,
  total_days int  not null check (total_days > 0)
);

create table plan_progress (                 -- private to the member
  plan_id      bigint not null references reading_plans(id) on delete cascade,
  user_id      uuid   not null references profiles(id) on delete cascade,
  day          int    not null,
  completed_at timestamptz not null default now(),
  primary key (plan_id, user_id, day)
);

create table discussions (
  id           bigserial primary key,
  group_id     bigint not null references groups(id) on delete cascade,
  chapter      int,
  question     text not null,
  author_id    uuid not null references profiles(id),
  is_anonymous boolean not null default false,
  created_at   timestamptz not null default now()
);

create table discussion_replies (
  id            bigserial primary key,
  discussion_id bigint not null references discussions(id) on delete cascade,
  author_id     uuid not null references profiles(id),
  is_anonymous  boolean not null default false,
  body          text not null,
  clarified_by  uuid references profiles(id),
  clarified_at  timestamptz,
  created_at    timestamptz not null default now()
);

create table prayer_requests (
  id             bigserial primary key,
  group_id       bigint not null references groups(id) on delete cascade,
  author_id      uuid not null references profiles(id),
  is_anonymous   boolean not null default false,
  body           text not null,
  visibility     prayer_visibility not null default 'group',
  answered_at    timestamptz,
  testimony      text,
  last_update_at timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create table prayer_prayed (
  request_id bigint not null references prayer_requests(id) on delete cascade,
  user_id    uuid   not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (request_id, user_id)
);

-- ---------------------------------------------------------------- messages
create table threads (
  id         bigserial primary key,
  created_at timestamptz not null default now()
);

create table thread_members (
  thread_id bigint not null references threads(id) on delete cascade,
  user_id   uuid   not null references profiles(id) on delete cascade,
  primary key (thread_id, user_id)
);

create function in_thread(t bigint, u uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from thread_members m where m.thread_id = t and m.user_id = u);
$$;

-- may `sender` message `recipient`? the minor rule, enforced in the database
create function may_message(sender uuid, recipient uuid) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select is_connected(sender, recipient)
     and (
       not (is_minor(recipient) and not is_minor(sender))
       or exists (select 1 from dm_approvals a
                  where a.minor_id = recipient and a.adult_id = sender)
       or exists (select 1 from group_members a
                  join group_members b on a.group_id = b.group_id
                  where a.user_id = sender and b.user_id = recipient)
     );
$$;

create table messages (
  id             bigserial primary key,
  thread_id      bigint not null references threads(id) on delete cascade,
  sender_id      uuid   not null references profiles(id) on delete cascade,
  kind           message_kind not null default 'text',
  body           text,
  passage_ref_id bigint references passage_refs(id),
  note_id        bigint references notes(id) on delete set null,
  media_url      text,                       -- voice only; no photo or video at v1
  created_at     timestamptz not null default now(),
  check (kind <> 'voice' or media_url is not null)
);
create index on messages (thread_id, created_at desc);

create table reports (
  id          bigserial primary key,
  reporter_id uuid not null references profiles(id) on delete set null,
  target_kind text not null,
  target_id   bigint not null,
  reason      text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- views that hide authorship
create view v_discussion_replies with (security_invoker = true) as
  select r.id, r.discussion_id, r.body, r.clarified_by, r.clarified_at, r.created_at,
         r.is_anonymous,
         case when r.is_anonymous then null else r.author_id end as author_id
  from discussion_replies r;

create view v_prayer_requests with (security_invoker = true) as
  select p.id, p.group_id, p.body, p.visibility, p.answered_at, p.testimony,
         p.last_update_at, p.created_at, p.is_anonymous,
         case when p.is_anonymous then null else p.author_id end as author_id,
         (select count(*) from prayer_prayed pp where pp.request_id = p.id) as prayed_count
  from prayer_requests p;

-- ---------------------------------------------------------------- RLS
alter table profiles            enable row level security;
alter table consents            enable row level security;
alter table situations          enable row level security;
alter table connections         enable row level security;
alter table guardian_links      enable row level security;
alter table dm_approvals        enable row level security;
alter table invites             enable row level security;
alter table stars               enable row level security;
alter table saves               enable row level security;
alter table notes               enable row level security;
alter table reposts             enable row level security;
alter table reading_events      enable row level security;
alter table sunday_notes        enable row level security;
alter table sunday_note_themes  enable row level security;
alter table groups              enable row level security;
alter table group_members       enable row level security;
alter table reading_plans       enable row level security;
alter table plan_progress       enable row level security;
alter table discussions         enable row level security;
alter table discussion_replies  enable row level security;
alter table prayer_requests     enable row level security;
alter table prayer_prayed       enable row level security;
alter table threads             enable row level security;
alter table thread_members      enable row level security;
alter table messages            enable row level security;
alter table reports             enable row level security;

-- profiles: yourself, and anyone you are connected to
create policy profiles_read on profiles for select
  using (id = auth.uid() or is_connected(auth.uid(), id));
create policy profiles_write on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- everything that is only ever yours
create policy consents_own on consents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy situations_own on situations for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy stars_own on stars for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy saves_own on saves for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reading_own on reading_events for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sunday_own on sunday_notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy sunday_themes_own on sunday_note_themes for all
  using (exists (select 1 from sunday_notes n
                 where n.id = sunday_note_id and n.user_id = auth.uid()));
create policy plan_progress_own on plan_progress for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notes: yours always; a circle note to an accepted connection
create policy notes_read on notes for select
  using (user_id = auth.uid()
         or (visibility = 'circle' and is_connected(auth.uid(), user_id)));
create policy notes_write on notes for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- reposts land in a connection's feed
create policy reposts_read on reposts for select
  using (user_id = auth.uid() or is_connected(auth.uid(), user_id));
create policy reposts_write on reposts for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- connections: both sides may read; only a participant may create or change
create policy connections_read on connections for select
  using (auth.uid() in (user_low, user_high));
create policy connections_write on connections for all
  using (auth.uid() in (user_low, user_high))
  with check (auth.uid() in (user_low, user_high));

create policy guardian_read on guardian_links for select
  using (auth.uid() in (guardian_id, minor_id));
create policy dm_approvals_read on dm_approvals for select
  using (auth.uid() in (minor_id, adult_id));
create policy dm_approvals_write on dm_approvals for insert
  with check (exists (select 1 from guardian_links g
                      where g.minor_id = dm_approvals.minor_id
                        and g.guardian_id = auth.uid()
                        and g.status = 'accepted'));

create policy invites_own on invites for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- groups: members read, leaders administer
create policy groups_read on groups for select
  using (in_group(id, auth.uid()));
create policy groups_update on groups for update
  using (group_rank(id, auth.uid()) >= role_rank('leader'));
create policy members_read on group_members for select
  using (in_group(group_id, auth.uid()));
create policy members_admin on group_members for all
  using (group_rank(group_id, auth.uid()) >= role_rank('leader'))
  with check (group_rank(group_id, auth.uid()) >= role_rank('leader'));

create policy plans_read on reading_plans for select
  using (in_group(group_id, auth.uid()));
create policy plans_write on reading_plans for all
  using (group_rank(group_id, auth.uid()) >= role_rank('coleader'))
  with check (group_rank(group_id, auth.uid()) >= role_rank('coleader'));

create policy discussions_read on discussions for select
  using (in_group(group_id, auth.uid()));
create policy discussions_insert on discussions for insert
  with check (in_group(group_id, auth.uid()) and author_id = auth.uid());

create policy replies_read on discussion_replies for select
  using (exists (select 1 from discussions d
                 where d.id = discussion_id and in_group(d.group_id, auth.uid())));
create policy replies_insert on discussion_replies for insert
  with check (author_id = auth.uid()
              and exists (select 1 from discussions d
                          where d.id = discussion_id
                            and in_group(d.group_id, auth.uid())));
-- An author may edit their own reply, but clarifying is not an edit: RLS filters rows,
-- not columns, so a row policy alone would let an author set clarified_by on their own
-- reply. Column grants keep clarified_by out of reach, and mark_clarified() is the only
-- way in. Note that a denied UPDATE affects zero rows rather than raising, so the client
-- must check the returned count instead of assuming success.
create policy replies_update_own on discussion_replies for update
  using (author_id = auth.uid()) with check (author_id = auth.uid());

create function mark_clarified(reply_id bigint) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare g bigint;
begin
  select d.group_id into g from discussion_replies r
    join discussions d on d.id = r.discussion_id where r.id = reply_id;
  if g is null then raise exception 'no such reply'; end if;
  if group_rank(g, auth.uid()) < role_rank('coleader') then
    raise exception 'only a co-leader or leader may clarify a reply';
  end if;
  update discussion_replies
     set clarified_by = auth.uid(), clarified_at = now()
   where id = reply_id;
  return true;
end $$;

create policy prayer_read on prayer_requests for select
  using (in_group(group_id, auth.uid())
         and (visibility = 'group'
              or author_id = auth.uid()
              or group_rank(group_id, auth.uid()) >= role_rank('coleader')));
create policy prayer_insert on prayer_requests for insert
  with check (in_group(group_id, auth.uid()) and author_id = auth.uid());
create policy prayer_update on prayer_requests for update
  using (author_id = auth.uid()
         or group_rank(group_id, auth.uid()) >= role_rank('coleader'));

create policy prayed_insert on prayer_prayed for insert
  with check (user_id = auth.uid()
              and exists (select 1 from prayer_requests p
                          where p.id = request_id and in_group(p.group_id, auth.uid())));
-- a reader may see that they prayed, never who else did
create policy prayed_read on prayer_prayed for select
  using (user_id = auth.uid());

-- messages: thread members only, and the minor rule on insert
create policy threads_read on threads for select
  using (in_thread(id, auth.uid()));
create policy thread_members_read on thread_members for select
  using (in_thread(thread_id, auth.uid()));
create policy messages_read on messages for select
  using (in_thread(thread_id, auth.uid()));
create policy messages_insert on messages for insert
  with check (
    sender_id = auth.uid()
    and in_thread(thread_id, auth.uid())
    and not exists (
      select 1 from thread_members m
      where m.thread_id = messages.thread_id
        and m.user_id <> auth.uid()
        and not may_message(auth.uid(), m.user_id))
  );

create policy reports_insert on reports for insert
  with check (reporter_id = auth.uid());

-- ---------------------------------------------------------------- column grants
-- Applied after the policies: clarified_by and clarified_at are writable only through
-- mark_clarified(), never by a direct UPDATE from a client.
revoke update on discussion_replies from authenticated;
grant update (body) on discussion_replies to authenticated;
grant execute on function mark_clarified(bigint) to authenticated;
