-- SECURITY DEFINER helpers exist for RLS policies, and nobody else may call them.
--
-- They lived in public, executable by every signed-in account, so any of them was
-- an API call away: POST /rpc/is_minor told a stranger whether any account id
-- belonged to a minor, in an app that restricts adults messaging minors, and
-- POST /rpc/purge_minor_messages let anyone run the nightly purge.
--
-- Revoking EXECUTE alone breaks RLS: Postgres runs a policy expression as the
-- querying user and checks EXECUTE on every function it calls (the suite fails with
-- "permission denied for function is_connected"). What a policy doesn't need is to
-- name the function: it holds it by id. So the helpers a policy calls move to a
-- schema no client has USAGE on. They stay executable for the policies and can't be
-- reached by anyone. Everything else loses EXECUTE outright.
--
-- What signed-in users may still call is the client RPC allowlist in
-- backend/client_guard.sql; the guard fails on any other definer function they can
-- reach.

create schema private;
revoke all on schema private from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on schema private from anon';
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'revoke all on schema private from authenticated';
  end if;
end $$;

-- Called by policies: moved, still executable by the signed-in role, unreachable.
alter function in_group(bigint, uuid)     set schema private;
alter function group_rank(bigint, uuid)   set schema private;
alter function group_archived(bigint)     set schema private;
alter function in_thread(bigint, uuid)    set schema private;
alter function is_connected(uuid, uuid)   set schema private;
alter function may_message(uuid, uuid)    set schema private;

-- Called only from inside other definer functions (which run as their owner):
-- moved, and no client role executes it at all.
alter function is_minor(uuid) set schema private;
revoke execute on function private.is_minor(uuid) from public;

-- Functions that call the helpers by name now look in private too.
alter function private.may_message(uuid, uuid) set search_path = private, public, auth;
alter function archive_group(bigint)           set search_path = private, public, auth;
alter function mark_clarified(bigint)          set search_path = private, public, auth;

-- Triggers fire without EXECUTE being checked, and pg_cron runs the purge as its
-- owner: no client needs any of these.
revoke execute on function delete_dm_thread_on_unfriend() from public;
revoke execute on function enforce_group_has_leader()     from public;
revoke execute on function prayer_prayed_maintain_count() from public;
revoke execute on function purge_minor_messages()         from public;
do $$
declare fn text;
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    foreach fn in array array['private.is_minor(uuid)', 'delete_dm_thread_on_unfriend()',
                              'enforce_group_has_leader()', 'prayer_prayed_maintain_count()',
                              'purge_minor_messages()'] loop
      execute format('revoke execute on function %s from authenticated', fn);
    end loop;
  end if;
end $$;
