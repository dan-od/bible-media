-- Nothing in public can be changed without signing in, and nothing bypasses RLS.
--
-- Supabase's defaults grant anon (the public key, no sign-in) insert, update, delete
-- and truncate on every table created in public, and execute on every function. RLS
-- is what normally stands between those grants and the data, so a table that forgets
-- RLS is writable by anyone (migration 3 closed that on the eight reference tables).
-- This removes the grants themselves, now and for objects created later:
--   * anon: no insert, update, delete or truncate on any table or view;
--   * authenticated: no truncate (truncate ignores RLS; clients never need it);
--   * anon: no execute on SECURITY DEFINER functions, which run past RLS.
-- Signed-in access is unchanged: RLS policies still decide it.
--
-- backend/client_guard.sql checks all of this on every run, so a new table, view or
-- function that reopens it fails CI.

do $$
declare
  r       record;
  has_anon boolean := exists (select 1 from pg_roles where rolname = 'anon');
  has_auth boolean := exists (select 1 from pg_roles where rolname = 'authenticated');
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
  loop
    execute format('revoke insert, update, delete, truncate on %I from public', r.relname);
    if has_anon then
      execute format('revoke insert, update, delete, truncate on %I from anon', r.relname);
    end if;
    if has_auth then
      execute format('revoke truncate on %I from authenticated', r.relname);
    end if;
  end loop;

  for r in
    select p.oid::regprocedure as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    -- Signed-in users keep execute: Supabase grants it to authenticated directly.
    execute format('revoke execute on function %s from public', r.fn);
    if has_anon then execute format('revoke execute on function %s from anon', r.fn); end if;
  end loop;

  -- The same for whatever this role creates in public from now on.
  if has_anon then
    alter default privileges in schema public revoke insert, update, delete, truncate on tables from anon;
    alter default privileges in schema public revoke execute on functions from anon;
  end if;
  if has_auth then
    alter default privileges in schema public revoke truncate on tables from authenticated;
  end if;
end $$;
