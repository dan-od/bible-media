-- Deleting an account leaves nothing that identifies the person (migration
-- 20260101000008): after delete_user, no row in any table of any schema holds their
-- email. Against the local Supabase stack that includes all of auth (users,
-- identities, sessions, tokens, the audit log); against bare Postgres, the stub's
-- auth.users and auth.audit_log_entries.

insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000001', 'leaving.person@example.test'),
  ('d0000000-0000-4000-8000-000000000002', 'staying.person@example.test');
insert into profiles (id, display_name, date_of_birth) values
  ('d0000000-0000-4000-8000-000000000001', 'Leaving', '1990-01-01'),
  ('d0000000-0000-4000-8000-000000000002', 'Staying', '1990-01-01');
insert into consents (user_id, kind, version) values
  ('d0000000-0000-4000-8000-000000000001', 'special_category', 'claim-1');
-- What auth writes when someone signs up and signs in, and one entry about someone else.
insert into auth.audit_log_entries (instance_id, id, payload, created_at, ip_address) values
  (null, gen_random_uuid(), '{"action":"user_signedup","actor_id":"d0000000-0000-4000-8000-000000000001","actor_username":"leaving.person@example.test","log_type":"team"}', now(), '203.0.113.7'),
  (null, gen_random_uuid(), '{"action":"login","actor_id":"d0000000-0000-4000-8000-000000000001","actor_username":"leaving.person@example.test","log_type":"account"}', now(), '203.0.113.7'),
  (null, gen_random_uuid(), '{"action":"user_invited","actor_id":"d0000000-0000-4000-8000-000000000002","actor_username":"staying.person@example.test","traits":{"user_email":"leaving.person@example.test"}}', now(), ''),
  (null, gen_random_uuid(), '{"action":"login","actor_id":"d0000000-0000-4000-8000-000000000002","actor_username":"staying.person@example.test","log_type":"account"}', now(), '');

-- Every table in every schema, read as the owner: how many rows mention the text, and
-- how many tables couldn't be read (a skipped table would make "none found" vacuous).
create or replace function rows_holding(needle text, out hits bigint, out unreadable text)
language plpgsql as $$
declare r record; n bigint;
begin
  hits := 0;
  for r in
    select ns.nspname, c.relname from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
    where c.relkind in ('r', 'p') and ns.nspname not in ('pg_catalog', 'information_schema', 'pg_toast')
  loop
    begin
      execute format('select count(*) from %I.%I t where strpos(lower(t::text), lower(%L)) > 0',
                     r.nspname, r.relname, needle) into n;
      hits := hits + n;
    exception when others then
      unreadable := coalesce(unreadable || ', ', '') || r.nspname || '.' || r.relname;
    end;
  end loop;
end $$;

insert into results select 'before deletion, the scan finds the email (it can see auth)', 'found, nothing unreadable',
  case when hits > 0 and unreadable is null then 'found, nothing unreadable' else hits || ' found, unreadable: ' || coalesce(unreadable, '-') end,
  hits > 0 and unreadable is null
  from rows_holding('leaving.person@example.test');

select expect_denied('delete_user refuses someone else''s account',
  'd0000000-0000-4000-8000-000000000002', 'select delete_user(''d0000000-0000-4000-8000-000000000001'')');
select expect_allowed('an account deletes itself',
  'd0000000-0000-4000-8000-000000000001', 'select delete_user(''d0000000-0000-4000-8000-000000000001'')');

insert into results select 'after deletion, no row in any table of any schema holds the email', '0 found, nothing unreadable',
  hits || ' found, ' || coalesce('unreadable: ' || unreadable, 'nothing unreadable'),
  hits = 0 and unreadable is null
  from rows_holding('leaving.person@example.test');
insert into results select 'after deletion, the sign-in itself is gone', '0', count(*)::text, count(*) = 0
  from auth.users where id = 'd0000000-0000-4000-8000-000000000001';
insert into results select 'after deletion, auth''s audit log keeps nothing of theirs', '0', count(*)::text, count(*) = 0
  from auth.audit_log_entries where payload ->> 'actor_id' = 'd0000000-0000-4000-8000-000000000001';
insert into results select 'the other account and its own audit entries are untouched', '1 user, 1 login',
  (select count(*) from auth.users where id = 'd0000000-0000-4000-8000-000000000002') || ' user, '
  || (select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = 'd0000000-0000-4000-8000-000000000002'
        and payload ->> 'action' = 'login') || ' login',
  (select count(*) from auth.users where id = 'd0000000-0000-4000-8000-000000000002') = 1
  and (select count(*) from auth.audit_log_entries where payload ->> 'actor_id' = 'd0000000-0000-4000-8000-000000000002'
        and payload ->> 'action' = 'login') = 1;
insert into results select 'the other account''s profile is untouched', 'Staying', display_name, display_name = 'Staying'
  from profiles where id = 'd0000000-0000-4000-8000-000000000002';
