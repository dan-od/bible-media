-- Decisions on the four open questions (DATA_MODEL.md, resolved 2026-11-15).
-- Layered as a second migration; the baseline schema (first migration) is unchanged.
-- Decision 1 (region ca-central-1) and decision 2 (leaders never see who prayed —
-- prayer_prayed stays as authored) need no schema change. This migration implements
-- decisions 3 (last leader cannot leave; archive is read-only) and 4 (message
-- retention: unfriend hard-deletes the thread, account deletion tombstones, minors'
-- messages expire after 12 months).

-- ================================================================ decision 3
-- A group must always have a leader, unless it has been deliberately archived.

alter table groups add column archived_at timestamptz;

create function group_archived(g bigint) returns boolean
language sql stable security definer set search_path = public, auth as $$
  select exists (select 1 from groups where id = g and archived_at is not null);
$$;

-- Enforced in the database, not the client: block a leader from leaving or demoting
-- themselves when they are the last leader of a non-archived group. No auto-promotion
-- and no claim-it flow — the only ways forward are to appoint a successor first or to
-- archive the group. A trigger covers every path (direct DELETE, role UPDATE), which a
-- client check or a single RPC could not.
create function enforce_group_has_leader() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare remaining int; g bigint; losing_leader boolean;
begin
  if tg_op = 'DELETE' then
    g := old.group_id;
    losing_leader := (old.role = 'leader');
  else -- UPDATE OF role
    g := old.group_id;
    losing_leader := (old.role = 'leader' and new.role <> 'leader');
  end if;

  if not losing_leader then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- An archived group is allowed to have no leader.
  if exists (select 1 from groups where id = g and archived_at is not null) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*) into remaining
  from group_members
  where group_id = g and role = 'leader' and user_id <> old.user_id;

  if remaining = 0 then
    raise exception
      'a group must keep at least one leader: appoint a successor or archive the group first';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

create trigger group_members_keep_leader
  before delete or update of role on group_members
  for each row execute function enforce_group_has_leader();

-- Archiving is a leader-only act. An archived group is read-only (see the amended
-- insert policies below); members keep their history.
create function archive_group(g bigint) returns boolean
language plpgsql security definer set search_path = public, auth as $$
begin
  if group_rank(g, auth.uid()) < role_rank('leader') then
    raise exception 'only a leader may archive a group';
  end if;
  update groups set archived_at = now() where id = g and archived_at is null;
  return true;
end $$;

-- Read-only once archived: nobody can post. Reads are untouched, so members keep
-- their history. Re-create each group-content insert policy with an archived guard.
drop policy discussions_insert on discussions;
create policy discussions_insert on discussions for insert
  with check (in_group(group_id, auth.uid())
              and author_id = auth.uid()
              and not group_archived(group_id));

drop policy replies_insert on discussion_replies;
create policy replies_insert on discussion_replies for insert
  with check (author_id = auth.uid()
              and exists (select 1 from discussions d
                          where d.id = discussion_id
                            and in_group(d.group_id, auth.uid())
                            and not group_archived(d.group_id)));

drop policy prayer_insert on prayer_requests;
create policy prayer_insert on prayer_requests for insert
  with check (in_group(group_id, auth.uid())
              and author_id = auth.uid()
              and not group_archived(group_id));

drop policy prayed_insert on prayer_prayed;
create policy prayed_insert on prayer_prayed for insert
  with check (user_id = auth.uid()
              and exists (select 1 from prayer_requests p
                          where p.id = request_id
                            and in_group(p.group_id, auth.uid())
                            and not group_archived(p.group_id)));

drop policy plans_write on reading_plans;
create policy plans_write on reading_plans for all
  using (group_rank(group_id, auth.uid()) >= role_rank('coleader'))
  with check (group_rank(group_id, auth.uid()) >= role_rank('coleader')
              and not group_archived(group_id));

grant execute on function archive_group(bigint) to authenticated;
grant execute on function group_archived(bigint) to authenticated;

-- ================================================================ decision 4
-- Messages are kept until deleted, with two hard rules and a minor's cap.

-- Rule 1 — removing a connection hard-deletes the one-to-one thread between those two
-- people (messages cascade). A group thread (3+ members) is never touched.
create function delete_dm_thread_on_unfriend() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  delete from threads t
  where (select count(*) from thread_members m where m.thread_id = t.id) = 2
    and exists (select 1 from thread_members m where m.thread_id = t.id and m.user_id = old.user_low)
    and exists (select 1 from thread_members m where m.thread_id = t.id and m.user_id = old.user_high);
  return old;
end $$;

create trigger connections_drop_dm_thread
  after delete on connections
  for each row execute function delete_dm_thread_on_unfriend();

-- Rule 2 — deleting an account tombstones authored content: the content survives, the
-- identity does not. Flip the authorship foreign keys from "block / cascade" to
-- SET NULL so group history and sent messages remain with a null author/sender.
-- Personal-only tables (stars, saves, notes, situations, reading_events, …) already
-- cascade from profiles, so they are erased.
alter table discussions        alter column author_id   drop not null;
alter table discussion_replies alter column author_id   drop not null;
alter table prayer_requests     alter column author_id   drop not null;
alter table messages            alter column sender_id   drop not null;
alter table groups              alter column created_by  drop not null;
alter table dm_approvals        alter column approved_by drop not null;

alter table discussions        drop constraint discussions_author_id_fkey,
  add constraint discussions_author_id_fkey        foreign key (author_id)   references profiles(id) on delete set null;
alter table discussion_replies drop constraint discussion_replies_author_id_fkey,
  add constraint discussion_replies_author_id_fkey foreign key (author_id)   references profiles(id) on delete set null;
alter table discussion_replies drop constraint discussion_replies_clarified_by_fkey,
  add constraint discussion_replies_clarified_by_fkey foreign key (clarified_by) references profiles(id) on delete set null;
alter table prayer_requests     drop constraint prayer_requests_author_id_fkey,
  add constraint prayer_requests_author_id_fkey    foreign key (author_id)   references profiles(id) on delete set null;
alter table messages            drop constraint messages_sender_id_fkey,
  add constraint messages_sender_id_fkey           foreign key (sender_id)   references profiles(id) on delete set null;
alter table groups              drop constraint groups_created_by_fkey,
  add constraint groups_created_by_fkey            foreign key (created_by)  references profiles(id) on delete set null;
alter table dm_approvals        drop constraint dm_approvals_approved_by_fkey,
  add constraint dm_approvals_approved_by_fkey     foreign key (approved_by) references profiles(id) on delete set null;

-- Self-service erasure. SECURITY DEFINER so it can reach past RLS to delete the row,
-- but it may only delete the caller's own account. Deleting the profile cascades the
-- personal data and SET NULLs the shared authorship — the tombstone.
create function delete_user(uid uuid) returns boolean
language plpgsql security definer set search_path = public, auth as $$
begin
  if uid is distinct from auth.uid() then
    raise exception 'you may only delete your own account';
  end if;
  delete from profiles where id = uid;
  return true;
end $$;
grant execute on function delete_user(uuid) to authenticated;

-- Rule 3 — minors' messages expire. Purge messages older than 12 months sent by an
-- account that is currently under 18. Returns the number removed (callers that need
-- "did it work" get a count, since a no-op is indistinguishable from a denial otherwise).
create function purge_minor_messages() returns int
language plpgsql security definer set search_path = public, auth as $$
declare removed int;
begin
  with gone as (
    delete from messages m
    using profiles p
    where m.sender_id = p.id
      and age(p.date_of_birth) < interval '18 years'
      and m.created_at < now() - interval '12 months'
    returning m.id)
  select count(*) into removed from gone;
  return removed;
end $$;

-- Schedule it nightly. pg_cron exists on Supabase but not on a bare Postgres (CI), so
-- guard it: the untaken branch is never planned, and the function above is still
-- testable directly. On Supabase this registers the job; on plain Postgres it is a no-op.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('purge-minor-messages', '17 3 * * *',
                          'select public.purge_minor_messages()');
  end if;
end $$;
