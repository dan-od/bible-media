-- Claiming local data into an account (migration 20260101000003): profile creation,
-- consent before anything is copied, idempotent upserts keyed on client ids, the merge
-- rules (stars keep the earliest, situations union, notes never merge), ids owned by
-- another account never touched, RLS on every claimed table, and the reference tables
-- read-only to clients. Runs in the same psql session as the base suite and reuses its
-- harness (results, expect_count, expect_denied, expect_allowed).

-- ---- fixtures (as owner)
insert into auth.users (id) values
  ('c1000000-0000-4000-8000-000000000001'),   -- C1: claims from two phones
  ('c1000000-0000-4000-8000-000000000002'),   -- C2: another account
  ('c1000000-0000-4000-8000-000000000003'),   -- C3: signs up during the test
  ('c1000000-0000-4000-8000-000000000004');   -- C4: twelve years old
insert into profiles (id, display_name, date_of_birth) values
  ('c1000000-0000-4000-8000-000000000001','C1','1990-01-01'),
  ('c1000000-0000-4000-8000-000000000002','C2','1990-01-01');

-- The base suite inserts notes with explicit ids and leaves the sequence behind them.
select setval(pg_get_serial_sequence('notes', 'id'), (select max(id) from notes));

-- Runs a query as a signed-in user and returns its single jsonb value.
create or replace function run_as(uid text, q text) returns jsonb
language plpgsql as $$
declare got jsonb;
begin
  execute 'set local role authenticated';
  execute format('set local request.jwt.claim.sub = %L', uid);
  execute q into got;
  reset role;
  return got;
end $$;

-- Batches the phones send, kept in a table so the queries stay readable.
create table batches (name text primary key, b jsonb not null);
grant select on batches to authenticated;

insert into batches values
('phone1', '[
  {"kind":"star","client_id":"a1000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}},
  {"kind":"save","client_id":"a2000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}},
  {"kind":"note","client_id":"a3000000-0000-4000-8000-000000000001","created_at":"2026-10-02T00:00:00Z",
   "updated_at":"2026-10-02T00:00:00Z","body":"from the first phone","visibility":"private",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}},
  {"kind":"situation","client_id":"a4000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z","label":"Anxiety"},
  {"kind":"words","client_id":"a5000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z",
   "own_words":"I am stressed and cannot afford rent"},
  {"kind":"tuned","client_id":"a6000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z","label":"Courage"}
]'),
-- The first three records of phone1: the app was killed after this batch.
('phone1_half', '[]'),
-- A second phone signed into the same account, with its own local data.
('phone2', '[
  {"kind":"star","client_id":"a1000000-0000-4000-8000-000000000002","created_at":"2026-09-01T00:00:00Z",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}},
  {"kind":"star","client_id":"a1000000-0000-4000-8000-000000000003","created_at":"2026-09-05T00:00:00Z",
   "passage":{"book":"Matthew","chapter":6,"verse_start":25,"verse_end":27}},
  {"kind":"note","client_id":"a3000000-0000-4000-8000-000000000002","created_at":"2026-09-03T00:00:00Z",
   "updated_at":"2026-09-03T00:00:00Z","body":"from the second phone","visibility":"circle",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}},
  {"kind":"situation","client_id":"a4000000-0000-4000-8000-000000000002","created_at":"2026-09-01T00:00:00Z","label":"Anxiety"},
  {"kind":"situation","client_id":"a4000000-0000-4000-8000-000000000003","created_at":"2026-09-01T00:00:00Z","label":"Grief"},
  {"kind":"words","client_id":"a5000000-0000-4000-8000-000000000002","created_at":"2026-09-01T00:00:00Z",
   "own_words":"My dad is ill"},
  {"kind":"words","client_id":"a5000000-0000-4000-8000-000000000003","created_at":"2026-09-01T00:00:00Z",
   "own_words":"I am stressed and cannot afford rent"},
  {"kind":"tuned","client_id":"a6000000-0000-4000-8000-000000000002","created_at":"2026-09-01T00:00:00Z","label":"Courage"}
]'),
-- One bad record must not hold back the rest of its batch.
('mixed', '[
  {"kind":"note","client_id":"a3000000-0000-4000-8000-000000000009","body":"   ",
   "passage":{"book":"Psalm","chapter":23,"verse_start":1,"verse_end":1}},
  {"kind":"save","client_id":"a2000000-0000-4000-8000-000000000009","created_at":"2026-10-03T00:00:00Z",
   "passage":{"book":"Psalm","chapter":23,"verse_start":1,"verse_end":1}}
]'),
-- An older edit of phone1's note arriving late must not overwrite the newer one.
('stale_edit', '[
  {"kind":"note","client_id":"a3000000-0000-4000-8000-000000000001","created_at":"2026-10-02T00:00:00Z",
   "updated_at":"2026-10-01T00:00:00Z","body":"an older draft","visibility":"private",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}}
]'),
-- A timestamp from the future is clamped to now.
('future', '[
  {"kind":"save","client_id":"a2000000-0000-4000-8000-000000000008","created_at":"2099-01-01T00:00:00Z",
   "passage":{"book":"John","chapter":3,"verse_start":16,"verse_end":16}}
]'),
-- Unstarring Matthew 6 on a phone after it was claimed.
('unstar', '[
  {"kind":"star","op":"delete","client_id":"a1000000-0000-4000-8000-000000000003",
   "passage":{"book":"Matthew","chapter":6,"verse_start":25,"verse_end":27}}
]'),
-- Another account offering ids C1 already owns (the record a shared phone must never hand over).
('stolen', '[
  {"kind":"note","client_id":"a3000000-0000-4000-8000-000000000001","created_at":"2026-10-02T00:00:00Z",
   "updated_at":"2026-12-01T00:00:00Z","body":"overwritten by C2","visibility":"private",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}},
  {"kind":"words","client_id":"a5000000-0000-4000-8000-000000000001","own_words":"taken"},
  {"kind":"words","client_id":"a5000000-0000-4000-8000-000000000003","own_words":"kept apart"},
  {"kind":"star","client_id":"a1000000-0000-4000-8000-000000000001","created_at":"2026-10-01T00:00:00Z",
   "passage":{"book":"Psalm","chapter":31,"verse_start":24,"verse_end":24}}
]'),
('empty', '[]');
update batches set b = (select jsonb_agg(e) from (select e from jsonb_array_elements((select b from batches where name = 'phone1')) with ordinality as x(e, i) where i <= 3) s)
  where name = 'phone1_half';

create or replace function claim_as(uid text, batch text, device text) returns jsonb
language sql as $$
  select run_as(uid, format('select claim_records((select b from batches where name = %L), %L::uuid)', batch, device));
$$;

-- ---- profiles: an account is created by the person, for themselves, at 13 or over
select expect_allowed('a new account can create its own profile',
  'c1000000-0000-4000-8000-000000000003',
  'select create_profile(''C3'', ''2000-05-01'', ''starting'', ''KJV'')');
select expect_allowed('creating the profile again is a no-op',
  'c1000000-0000-4000-8000-000000000003',
  'select create_profile(''C3 again'', ''2000-05-01'')');
insert into results select 'the second create kept the first profile', 'C3', display_name, display_name = 'C3'
  from profiles where id = 'c1000000-0000-4000-8000-000000000003';
select expect_denied('an account under 13 cannot be created',
  'c1000000-0000-4000-8000-000000000004',
  format('select create_profile(''C4'', %L)', (current_date - interval '12 years')::date));
select expect_denied('a profile cannot be inserted for someone else',
  'c1000000-0000-4000-8000-000000000002',
  'insert into profiles (id, display_name, date_of_birth) values (''c1000000-0000-4000-8000-000000000004'',''X'',''1990-01-01'')');

-- ---- nothing is copied before consent is recorded, and never without a signed-in user
select expect_denied('claiming before consent is refused',
  'c1000000-0000-4000-8000-000000000001',
  'select claim_records((select b from batches where name = ''phone1''), null)');
insert into results select 'the refused claim wrote nothing', '0', count(*)::text, count(*) = 0
  from stars where user_id = 'c1000000-0000-4000-8000-000000000001';
select expect_denied('claiming without signing in is refused', '',
  'select claim_records(''[]''::jsonb, null)');
select expect_allowed('the person records their consent',
  'c1000000-0000-4000-8000-000000000001',
  'insert into consents (user_id, kind, version) values (''c1000000-0000-4000-8000-000000000001'', ''special_category'', ''claim-1'')');
select expect_allowed('the other account records its consent',
  'c1000000-0000-4000-8000-000000000002',
  'insert into consents (user_id, kind, version) values (''c1000000-0000-4000-8000-000000000002'', ''special_category'', ''claim-1'')');

-- ---- nothing local: a no-op that writes no rows
insert into results select 'an empty claim accepts nothing', '0',
  jsonb_array_length(r->'accepted')::text, jsonb_array_length(r->'accepted') = 0
  from (select claim_as('c1000000-0000-4000-8000-000000000001', 'empty', 'd1000000-0000-4000-8000-000000000001') r) x;
insert into results select 'an empty claim leaves the account empty', '0', n::text, n = 0 from (select
  (select count(*) from stars where user_id = 'c1000000-0000-4000-8000-000000000001')
  + (select count(*) from notes where user_id = 'c1000000-0000-4000-8000-000000000001')
  + (select count(*) from situations where user_id = 'c1000000-0000-4000-8000-000000000001') n) x;

-- ---- killed after the first batch, then run again from the start, then again
select claim_as('c1000000-0000-4000-8000-000000000001', 'phone1_half', 'd1000000-0000-4000-8000-000000000001');
insert into results select 'the whole first phone is accepted on the re-run', '6',
  jsonb_array_length(r->'accepted')::text, jsonb_array_length(r->'accepted') = 6
  from (select claim_as('c1000000-0000-4000-8000-000000000001', 'phone1', 'd1000000-0000-4000-8000-000000000001') r) x;
select claim_as('c1000000-0000-4000-8000-000000000001', 'phone1', 'd1000000-0000-4000-8000-000000000001');
insert into results select 'claimed three times: one star, one save, one note', '1/1/1', s||'/'||v||'/'||n,
  (s, v, n) = (1, 1, 1) from (select
  (select count(*) from stars where user_id = 'c1000000-0000-4000-8000-000000000001') s,
  (select count(*) from saves where user_id = 'c1000000-0000-4000-8000-000000000001') v,
  (select count(*) from notes where user_id = 'c1000000-0000-4000-8000-000000000001') n) x;
insert into results select 'claimed three times: one situation, one set of words, one tuned theme', '1/1/1',
  c||'/'||w||'/'||t, (c, w, t) = (1, 1, 1) from (select
  (select count(*) from situations where user_id = 'c1000000-0000-4000-8000-000000000001' and theme_id is not null) c,
  (select count(*) from situations where user_id = 'c1000000-0000-4000-8000-000000000001' and theme_id is null) w,
  (select count(*) from tuned_themes where user_id = 'c1000000-0000-4000-8000-000000000001') t) x;

-- ---- a second phone with its own data claims into the same account
select claim_as('c1000000-0000-4000-8000-000000000001', 'phone2', 'd1000000-0000-4000-8000-000000000002');
select claim_as('c1000000-0000-4000-8000-000000000001', 'phone2', 'd1000000-0000-4000-8000-000000000002');
insert into results select 'two phones: the shared star is one row with the earlier time', '1 2026-09-01',
  count(*)||' '||min(s.created_at)::date, count(*) = 1 and min(s.created_at)::date = '2026-09-01'
  from stars s join passage_refs r on r.id = s.passage_ref_id
  where s.user_id = 'c1000000-0000-4000-8000-000000000001' and r.book = 'Psalm' and r.chapter = 31;
insert into results select 'two phones: each phone''s other stars are kept', '2', count(*)::text, count(*) = 2
  from stars where user_id = 'c1000000-0000-4000-8000-000000000001';
insert into results select 'two phones: notes from both phones, neither merged', 'from the first phone|from the second phone',
  string_agg(body, '|' order by body), string_agg(body, '|' order by body) = 'from the first phone|from the second phone'
  from notes where user_id = 'c1000000-0000-4000-8000-000000000001';
insert into results select 'two phones: situations are the union, Anxiety once', 'Anxiety,Grief',
  string_agg(t.label, ',' order by t.label), string_agg(t.label, ',' order by t.label) = 'Anxiety,Grief'
  from situations s join themes t on t.id = s.theme_id
  where s.user_id = 'c1000000-0000-4000-8000-000000000001' and s.ended_at is null;
insert into results select 'two phones: both phones'' own words kept, the identical words once', '2', count(*)::text, count(*) = 2
  from situations where user_id = 'c1000000-0000-4000-8000-000000000001' and theme_id is null;
insert into results select 'two phones: the shared tuned theme is one row', '1', count(*)::text, count(*) = 1
  from tuned_themes where user_id = 'c1000000-0000-4000-8000-000000000001';
insert into results select 'the claiming phone is recorded on its note', 'd1000000-0000-4000-8000-000000000002',
  device_id::text, device_id = 'd1000000-0000-4000-8000-000000000002'
  from notes where client_id = 'a3000000-0000-4000-8000-000000000002';

-- ---- per-record rules
-- (Claim first, check after: a statement does not see its own function's writes.)
create table last_claim as
  select claim_as('c1000000-0000-4000-8000-000000000001', 'mixed', 'd1000000-0000-4000-8000-000000000001') r;
insert into results select 'one bad record is rejected, the rest of its batch is kept', 'saved, note rejected',
  (select case when count(*) = 1 then 'saved' else 'not saved' end from saves
     where client_id = 'a2000000-0000-4000-8000-000000000009')
  || ', note ' || case when r->'rejected'->0->>'client_id' = 'a3000000-0000-4000-8000-000000000009' then 'rejected' else 'kept' end,
  (select count(*) = 1 from saves where client_id = 'a2000000-0000-4000-8000-000000000009')
  and r->'rejected'->0->>'client_id' = 'a3000000-0000-4000-8000-000000000009'
  from last_claim;
select claim_as('c1000000-0000-4000-8000-000000000001', 'stale_edit', 'd1000000-0000-4000-8000-000000000001');
insert into results select 'an older edit arriving late does not overwrite the newer note', 'from the first phone', body,
  body = 'from the first phone' from notes where client_id = 'a3000000-0000-4000-8000-000000000001';
select claim_as('c1000000-0000-4000-8000-000000000001', 'future', 'd1000000-0000-4000-8000-000000000001');
insert into results select 'a timestamp from the future is clamped to now', 'not in the future',
  case when created_at <= now() then 'not in the future' else created_at::text end, created_at <= now()
  from saves where client_id = 'a2000000-0000-4000-8000-000000000008';
select claim_as('c1000000-0000-4000-8000-000000000001', 'unstar', 'd1000000-0000-4000-8000-000000000001');
insert into results select 'unstarring after the claim removes the star', '1', count(*)::text, count(*) = 1
  from stars where user_id = 'c1000000-0000-4000-8000-000000000001';

-- ---- a record one account owns is never handed to another
-- (The last two ids were accepted from C1's phones but merged into other rows, so no
-- row carries them; they are still C1's.)
insert into results select 'ids owned by another account are rejected, stored on a row or not', '4 rejected, 0 accepted',
  jsonb_array_length(r->'rejected')||' rejected, '||jsonb_array_length(r->'accepted')||' accepted',
  jsonb_array_length(r->'rejected') = 4 and jsonb_array_length(r->'accepted') = 0
  and (select bool_and(e->>'reason' = 'other_account') from jsonb_array_elements(r->'rejected') e)
  from (select claim_as('c1000000-0000-4000-8000-000000000002', 'stolen', 'd1000000-0000-4000-8000-000000000001') r) x;
insert into results select 'the owner''s note is untouched', 'from the first phone', body, body = 'from the first phone'
  from notes where client_id = 'a3000000-0000-4000-8000-000000000001';
insert into results select 'the owner''s words are untouched', 'I am stressed and cannot afford rent', own_words,
  own_words = 'I am stressed and cannot afford rent' and user_id = 'c1000000-0000-4000-8000-000000000001'
  from situations where client_id = 'a5000000-0000-4000-8000-000000000001';
insert into results select 'the other account gained nothing', '0', n::text, n = 0 from (select
  (select count(*) from notes where user_id = 'c1000000-0000-4000-8000-000000000002')
  + (select count(*) from situations where user_id = 'c1000000-0000-4000-8000-000000000002') n) x;

-- ---- RLS: claimed rows are visible only to their owner
select expect_count('C2 cannot read C1''s stars', 'c1000000-0000-4000-8000-000000000002',
  'select count(*) from stars where user_id = ''c1000000-0000-4000-8000-000000000001''', 0);
select expect_count('C2 cannot read C1''s saves', 'c1000000-0000-4000-8000-000000000002',
  'select count(*) from saves where user_id = ''c1000000-0000-4000-8000-000000000001''', 0);
select expect_count('C2 cannot read C1''s notes (C2 is not connected)', 'c1000000-0000-4000-8000-000000000002',
  'select count(*) from notes where user_id = ''c1000000-0000-4000-8000-000000000001''', 0);
select expect_count('C2 cannot read C1''s situations or own words', 'c1000000-0000-4000-8000-000000000002',
  'select count(*) from situations where user_id = ''c1000000-0000-4000-8000-000000000001''', 0);
select expect_count('C2 cannot read C1''s tuned themes', 'c1000000-0000-4000-8000-000000000002',
  'select count(*) from tuned_themes where user_id = ''c1000000-0000-4000-8000-000000000001''', 0);
select expect_count('C2 cannot read C1''s consent', 'c1000000-0000-4000-8000-000000000002',
  'select count(*) from consents where user_id = ''c1000000-0000-4000-8000-000000000001''', 0);
select expect_count('C1 reads all of its own situations', 'c1000000-0000-4000-8000-000000000001',
  'select count(*) from situations', 4);
select expect_denied('C2 cannot write a tuned theme into C1''s account', 'c1000000-0000-4000-8000-000000000002',
  'insert into tuned_themes (user_id, theme_id) select ''c1000000-0000-4000-8000-000000000001'', id from themes limit 1');
insert into results select 'my_records gives C1 its own data', '1 stars, 2 notes',
  jsonb_array_length(r->'stars')||' stars, '||jsonb_array_length(r->'notes')||' notes',
  jsonb_array_length(r->'stars') = 1 and jsonb_array_length(r->'notes') = 2
  from (select run_as('c1000000-0000-4000-8000-000000000001', 'select my_records()') r) x;
insert into results select 'my_records gives C2 none of C1''s data', '0', n::text, n = 0 from (select
  jsonb_array_length(r->'stars') + jsonb_array_length(r->'saves') + jsonb_array_length(r->'notes')
  + jsonb_array_length(r->'situations') + jsonb_array_length(r->'tuned') n
  from (select run_as('c1000000-0000-4000-8000-000000000002', 'select my_records()') r) y) x;

-- ---- reference data is read-only to clients (it was writable before this migration)
select expect_denied('a client cannot add a theme', 'c1000000-0000-4000-8000-000000000001',
  'insert into themes (slug, label) values (''junk'', ''Junk'')');
select run_as('c1000000-0000-4000-8000-000000000001', 'with d as (delete from passage_refs returning 1) select to_jsonb(count(*)) from d');
insert into results select 'a client cannot delete passage references', 'kept', case when count(*) > 0 then 'kept' else 'deleted' end,
  count(*) > 0 from passage_refs;
select expect_count('a client can still read passage references', 'c1000000-0000-4000-8000-000000000001',
  'select least(count(*), 1) from passage_refs', 1);
select expect_count('a client cannot read the claim ledger', 'c1000000-0000-4000-8000-000000000001',
  'select count(*) from claim_ledger', 0);
select expect_denied('the internal passage helper is not callable by clients', 'c1000000-0000-4000-8000-000000000001',
  'select claim_passage_ref(''{"book":"X","chapter":1,"verse_start":1,"verse_end":1}''::jsonb)');
