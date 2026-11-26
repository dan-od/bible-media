-- What the claim ledger keeps when an account is deleted (migration 20260101000005).
-- Each of the account's ledger rows stays, loses its account and is burned: the ids
-- can never be claimed again, by anyone, and nothing left points to the person.
-- Runs after step7_claim_test.sql and reuses its helpers (run_as, claim_as, batches).

insert into auth.users (id) values
  ('e1000000-0000-4000-8000-000000000001'),   -- E1: claims, then deletes the account
  ('e1000000-0000-4000-8000-000000000002'),   -- E2: another account on the same phone
  ('e1000000-0000-4000-8000-000000000003');   -- E3: removed by an admin (auth.users)
insert into profiles (id, display_name, date_of_birth) values
  ('e1000000-0000-4000-8000-000000000001','E1','1990-01-01'),
  ('e1000000-0000-4000-8000-000000000002','E2','1990-01-01'),
  ('e1000000-0000-4000-8000-000000000003','E3','1990-01-01');
insert into consents (user_id, kind, version) values
  ('e1000000-0000-4000-8000-000000000001','special_category','claim-1'),
  ('e1000000-0000-4000-8000-000000000002','special_category','claim-1'),
  ('e1000000-0000-4000-8000-000000000003','special_category','claim-1');

insert into batches values
('e1_phone', '[
  {"kind":"star","client_id":"e5000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z",
   "passage":{"book":"Psalm","chapter":34,"verse_start":18,"verse_end":18}},
  {"kind":"note","client_id":"e5000000-0000-4000-8000-000000000002","created_at":"2026-10-01T00:00:00Z",
   "updated_at":"2026-10-01T00:00:00Z","body":"my mum died in March","visibility":"private",
   "passage":{"book":"Psalm","chapter":34,"verse_start":18,"verse_end":18}},
  {"kind":"words","client_id":"e5000000-0000-4000-8000-000000000003","created_at":"2026-10-01T00:00:00Z",
   "own_words":"grieving my mum"}
]'),
('e3_phone', '[
  {"kind":"star","client_id":"e5000000-0000-4000-8000-000000000009","created_at":"2026-10-01T00:00:00Z",
   "passage":{"book":"Psalm","chapter":34,"verse_start":18,"verse_end":18}}
]');

create table e_ids (client_id uuid);
insert into e_ids select (e->>'client_id')::uuid from batches, jsonb_array_elements(b) e where name = 'e1_phone';

select claim_as('e1000000-0000-4000-8000-000000000001', 'e1_phone', 'd1000000-0000-4000-8000-000000000001');
select claim_as('e1000000-0000-4000-8000-000000000003', 'e3_phone', 'd1000000-0000-4000-8000-000000000003');
insert into results select 'before deletion, the ledger links each id to its account', '3', count(*)::text, count(*) = 3
  from claim_ledger where client_id in (select client_id from e_ids)
   and user_id = 'e1000000-0000-4000-8000-000000000001' and burned_at is null;

-- ---- the account deletes itself (the app's own path)
select expect_allowed('an account can delete itself',
  'e1000000-0000-4000-8000-000000000001', 'select delete_user(''e1000000-0000-4000-8000-000000000001'')');

insert into results select 'after deletion, every ledger row and id is kept', '3', count(*)::text, count(*) = 3
  from claim_ledger where client_id in (select client_id from e_ids);
insert into results select 'after deletion, no ledger row links to the account, and each is burned', '0 linked, 3 burned',
  count(user_id)||' linked, '||count(burned_at)||' burned', count(user_id) = 0 and count(burned_at) = 3
  from claim_ledger where client_id in (select client_id from e_ids);
insert into results select 'nothing else on the server links to the deleted account', '0', n::text, n = 0 from (select
    (select count(*) from profiles where id = 'e1000000-0000-4000-8000-000000000001')
  + (select count(*) from consents where user_id = 'e1000000-0000-4000-8000-000000000001')
  + (select count(*) from stars where client_id in (select client_id from e_ids))
  + (select count(*) from notes where client_id in (select client_id from e_ids))
  + (select count(*) from situations where client_id in (select client_id from e_ids))
  + (select count(*) from claim_ledger where user_id = 'e1000000-0000-4000-8000-000000000001') n) x;
-- Whatever the ledger holds must stay impersonal: a new column is a decision to review here.
insert into results select 'the ledger holds only the id, the kind, the account link and two times',
  'burned_at,claimed_at,client_id,kind,user_id', string_agg(column_name::text, ',' order by column_name),
  string_agg(column_name::text, ',' order by column_name) = 'burned_at,claimed_at,client_id,kind,user_id'
  from information_schema.columns where table_schema = 'public' and table_name = 'claim_ledger';

-- ---- refusal is unchanged: a burned id is refused like another account's id
create table e_claim as
  select claim_as('e1000000-0000-4000-8000-000000000002', 'e1_phone', 'd1000000-0000-4000-8000-000000000001') r;
insert into results select 'another account offering the burned ids is refused, as for another account', '3 other_account, 0 accepted',
  jsonb_array_length(r->'rejected')||' '||coalesce((select string_agg(distinct e->>'reason', ',') from jsonb_array_elements(r->'rejected') e), '')
  ||', '||jsonb_array_length(r->'accepted')||' accepted',
  jsonb_array_length(r->'rejected') = 3 and jsonb_array_length(r->'accepted') = 0
  and (select bool_and(e->>'reason' = 'other_account') from jsonb_array_elements(r->'rejected') e)
  from e_claim;
insert into results select 'the other account gained nothing from the burned ids', '0', n::text, n = 0 from (select
    (select count(*) from stars where user_id = 'e1000000-0000-4000-8000-000000000002')
  + (select count(*) from notes where user_id = 'e1000000-0000-4000-8000-000000000002')
  + (select count(*) from situations where user_id = 'e1000000-0000-4000-8000-000000000002') n) x;
insert into results select 'the burned ids still carry no account', '0', count(user_id)::text, count(user_id) = 0
  from claim_ledger where client_id in (select client_id from e_ids);

-- The same person signing up again gets a new profile, and the ids stay burned for them too.
select expect_allowed('the deleted person can make a new profile',
  'e1000000-0000-4000-8000-000000000001', 'select create_profile(''E1 again'', ''1990-01-01'')');
select expect_allowed('and record consent again',
  'e1000000-0000-4000-8000-000000000001',
  'insert into consents (user_id, kind, version) values (''e1000000-0000-4000-8000-000000000001'', ''special_category'', ''claim-1'')');
insert into results select 'the burned ids are refused to the same person''s new account', '3 rejected',
  jsonb_array_length(r->'rejected')||' rejected', jsonb_array_length(r->'rejected') = 3
  from (select claim_as('e1000000-0000-4000-8000-000000000001', 'e1_phone', 'd1000000-0000-4000-8000-000000000001') r) x;

-- ---- a burned row stays burned, even for the database owner
do $$
begin
  begin
    update claim_ledger set user_id = 'e1000000-0000-4000-8000-000000000002'
      where client_id = 'e5000000-0000-4000-8000-000000000001';
    insert into results values ('a burned id cannot be given to an account', 'refused', 'ALLOWED', false);
  exception when others then
    insert into results values ('a burned id cannot be given to an account', 'refused', 'refused', true);
  end;
end $$;
do $$
begin
  begin
    update claim_ledger set user_id = 'e1000000-0000-4000-8000-000000000003'
      where user_id = 'e1000000-0000-4000-8000-000000000003';
    update claim_ledger set user_id = 'e1000000-0000-4000-8000-000000000002'
      where user_id = 'e1000000-0000-4000-8000-000000000003';
    insert into results values ('an owned id cannot move to another account', 'refused', 'ALLOWED', false);
  exception when others then
    insert into results values ('an owned id cannot move to another account', 'refused', 'refused', true);
  end;
end $$;

-- ---- an account removed by an admin (deleting the auth user) is burned the same way
delete from auth.users where id = 'e1000000-0000-4000-8000-000000000003';
insert into results select 'an admin deletion burns the ledger rows too', '0 linked, 1 burned',
  count(user_id)||' linked, '||count(burned_at)||' burned', count(user_id) = 0 and count(burned_at) = 1
  from claim_ledger where client_id = 'e5000000-0000-4000-8000-000000000009';
