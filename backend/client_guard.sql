-- Guard: nothing in the public schema can be changed without signing in, and nothing
-- lets a client past RLS. Enumerates every relation and SECURITY DEFINER function in
-- public, so a new one that forgets RLS fails here instead of shipping.
--
-- Runs straight after the migrations (scripts/rls-test.sh), before the suites create
-- their scaffolding tables, and raises if anything fails. Against bare Postgres the
-- runner first recreates Supabase's default grants (anon and authenticated get full
-- write on every new table, and execute on every new function), so this sees what a
-- real project would.
--
-- Rules:
--   rls_off        a table without row level security
--   anon_write     anon (the public key, not signed in) can insert, update, delete or
--                  truncate a table or view, or insert/update any of its columns
--   auth_truncate  signed-in users can truncate a table (truncate ignores RLS)
--   view_definer   a view that runs as its owner (not security_invoker), so it reads
--                  past RLS
--   no_rls_read    a client can read a materialized view or foreign table, which
--                  can't have RLS
--   anon_definer   anon can execute a SECURITY DEFINER function, which runs past RLS
--   auth_definer   signed-in users can call a SECURITY DEFINER function: they have
--                  USAGE on its schema and EXECUTE on it. Only deliberate client RPCs
--                  may be called; everything else runs past RLS for nobody's benefit
--                  (is_minor(uuid) would let an adult probe which accounts are minors).
--
-- Functions are checked in the schemas this project creates: public, and private,
-- where the helpers RLS policies call live. A policy needs its helpers to be
-- executable by the signed-in role, but not reachable: private grants no USAGE to
-- clients, so nobody can name them.
--
-- To let something through, add it to `allowed` below with a comment saying why. A
-- reviewer should be able to read the reason and agree, every time.

create temp table allowed (object text, rule text, why text not null, primary key (object, rule));
-- An entry for a table looks like:
--   insert into allowed values ('spatial_ref_sys', 'rls_off',
--     'PostGIS reference data: no row is personal, and anon_write still holds');

-- The client RPCs: definer functions a signed-in person calls on purpose. Each checks
-- the caller itself (auth.uid()) before touching anything.
insert into allowed (object, rule, why) values
  ('claim_records(jsonb,uuid)', 'auth_definer',
   'The app copies its local records into the account (sync/supabase-server). Writes only the caller''s rows; refuses ids another account owns.'),
  ('my_records()', 'auth_definer',
   'The app pulls the account''s records on sign-in. Returns only the caller''s rows.'),
  ('create_profile(text,date,text,text)', 'auth_definer',
   'First sign-in creates the caller''s own profile (profiles has no insert policy). 13+ enforced here.'),
  ('delete_user(uuid)', 'auth_definer',
   'Self-service erasure (DATA_MODEL.md). Refuses any id but the caller''s.'),
  ('mark_clarified(bigint)', 'auth_definer',
   'A group leader marks a reply clarified; RLS cannot protect the column, so this checks rank and raises.'),
  ('archive_group(bigint)', 'auth_definer',
   'A group leader archives their group (decisions migration). Checks rank and raises.');

create temp table guard_findings as
with rels as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity,
         coalesce('security_invoker=true' = any (c.reloptions) or 'security_invoker=on' = any (c.reloptions), false) as invoker
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
),
definers as (
  select p.oid, p.oid::regprocedure::text as sig, n.nspname
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private') and p.prosecdef
),
anon as (select exists (select 1 from pg_roles where rolname = 'anon') as here),
auth as (select exists (select 1 from pg_roles where rolname = 'authenticated') as here)
select relname as object, 'rls_off' as rule from rels where relkind in ('r', 'p') and not relrowsecurity
union all
select relname, 'anon_write' from rels, anon
  where anon.here and relkind in ('r', 'p', 'v', 'f')
    and (has_table_privilege('anon', oid, 'INSERT, UPDATE, DELETE, TRUNCATE')
         or has_any_column_privilege('anon', oid, 'INSERT, UPDATE'))
union all
select relname, 'auth_truncate' from rels, auth
  where auth.here and relkind in ('r', 'p') and has_table_privilege('authenticated', oid, 'TRUNCATE')
union all
select relname, 'view_definer' from rels where relkind = 'v' and not invoker
union all
select relname, 'no_rls_read' from rels, anon, auth
  where relkind in ('m', 'f')
    and ((anon.here and has_table_privilege('anon', oid, 'SELECT'))
         or (auth.here and has_table_privilege('authenticated', oid, 'SELECT')))
union all
select sig, 'anon_definer' from definers, anon
  where anon.here and has_function_privilege('anon', oid, 'EXECUTE')
union all
select sig, 'auth_definer' from definers, auth
  where auth.here and has_schema_privilege('authenticated', nspname, 'USAGE')
    and has_function_privilege('authenticated', oid, 'EXECUTE');

do $$
declare
  bad text;
  checked int;
  stale text;
begin
  select string_agg(format('  %s: %s', f.rule, f.object), E'\n' order by f.rule, f.object) into bad
  from guard_findings f
  where not exists (select 1 from allowed a where a.object = f.object and a.rule = f.rule);
  if bad is not null then
    raise exception E'client guard FAILED: these let a client past RLS or change data without signing in\n%\nFix them in a new migration, or allow one in backend/client_guard.sql with the reason.', bad;
  end if;
  -- An allowance for something that no longer needs it is removed, not left to rot.
  select string_agg(format('  %s: %s', a.rule, a.object), E'\n') into stale
  from allowed a where not exists (select 1 from guard_findings f where f.object = a.object and f.rule = a.rule);
  if stale is not null then
    raise exception E'client guard: these allowances match nothing; remove them\n%', stale;
  end if;
  select count(*) into checked from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f');
  raise notice 'client guard passed: % relations in public and % definer functions checked', checked,
    (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private') and p.prosecdef);
end $$;

drop table guard_findings;
drop table allowed;

-- Proof for the runner that the guard ran and passed; it fails the build without this.
create table client_guard_passed (at timestamptz not null default now());
insert into client_guard_passed default values;
