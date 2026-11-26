-- Minimal stand-in for what Supabase provides, so the schema can be run locally.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
-- Supabase's auth audit log: no foreign key to users, and it repeats the email.
create table if not exists auth.audit_log_entries (
  instance_id uuid,
  id          uuid primary key default gen_random_uuid(),
  payload     json,
  created_at  timestamptz default now(),
  ip_address  varchar(64) not null default ''
);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

-- Supabase's default grants: everything the project's owner role creates in public is
-- fully writable by anon (the public key) and authenticated, and every function is
-- executable by both. Recreated here so the checks run under the same conditions as a
-- real project (backend/client_guard.sql is what catches a table that relies on them).
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public;

-- The stub checks itself: a table made now must be writable by anon, as on Supabase.
-- Without that, the client guard would pass on bare Postgres no matter what.
create table stub_canary (id int);
do $$
begin
  if not has_table_privilege('anon', 'stub_canary', 'INSERT') then
    raise exception 'stub_auth.sql no longer recreates Supabase''s default grants';
  end if;
end $$;
drop table stub_canary;
