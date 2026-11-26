-- Circle notes are copied to the server by the claim (step 7), but circles haven't
-- shipped: nobody may become someone's connection by their own hand (migration
-- 20260101000006). When circles ship these checks change, and the confirmation step in
-- backend/DATA_MODEL.md ("Before circles ship") must already be built.

insert into auth.users (id) values
  ('f1000000-0000-4000-8000-000000000001'),   -- F1: has a claimed circle note
  ('f1000000-0000-4000-8000-000000000002');   -- F2: a stranger
insert into profiles (id, display_name, date_of_birth) values
  ('f1000000-0000-4000-8000-000000000001','F1','1995-01-01'),
  ('f1000000-0000-4000-8000-000000000002','F2','1995-01-01');
select setval(pg_get_serial_sequence('notes', 'id'), (select max(id) from notes));
insert into notes (user_id, passage_ref_id, body, visibility)
  select 'f1000000-0000-4000-8000-000000000001', min(id), 'circle note from the phone', 'circle' from passage_refs;

select expect_denied('a stranger cannot make themselves an accepted connection',
  'f1000000-0000-4000-8000-000000000002',
  'insert into connections (user_low, user_high, status) values (''f1000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000002'', ''accepted'')');
select expect_allowed('a stranger can still ask (pending)',
  'f1000000-0000-4000-8000-000000000002',
  'insert into connections (user_low, user_high) values (''f1000000-0000-4000-8000-000000000001'', ''f1000000-0000-4000-8000-000000000002'')');
select expect_denied('the one who asked cannot accept their own request',
  'f1000000-0000-4000-8000-000000000002',
  'update connections set status = ''accepted'' where user_low = ''f1000000-0000-4000-8000-000000000001''');
select expect_denied('the one asked cannot accept either, until circles ship with confirmation',
  'f1000000-0000-4000-8000-000000000001',
  'update connections set status = ''accepted'' where user_low = ''f1000000-0000-4000-8000-000000000001''');
select expect_count('the request is still pending', 'f1000000-0000-4000-8000-000000000001',
  'select count(*) from connections where user_low = ''f1000000-0000-4000-8000-000000000001'' and status = ''pending''', 1);
select expect_count('the stranger still cannot read the circle note', 'f1000000-0000-4000-8000-000000000002',
  'select count(*) from notes where user_id = ''f1000000-0000-4000-8000-000000000001''', 0);
select expect_allowed('either person can block', 'f1000000-0000-4000-8000-000000000001',
  'update connections set status = ''blocked'' where user_low = ''f1000000-0000-4000-8000-000000000001''');
select expect_allowed('either person can remove the connection', 'f1000000-0000-4000-8000-000000000001',
  'delete from connections where user_low = ''f1000000-0000-4000-8000-000000000001''');
select expect_count('removed', 'f1000000-0000-4000-8000-000000000001',
  'select count(*) from connections where user_low = ''f1000000-0000-4000-8000-000000000001''', 0);
