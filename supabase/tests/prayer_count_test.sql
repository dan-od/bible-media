-- prayed_count (migration 20260101000002): the count is a real group total, "did I
-- pray" is per-caller, and no one can see who else prayed. Runs in the same psql
-- session as the base suite and reuses its harness.

-- ---- fixtures (as owner). Group 4: P1 leader/author, P2 and P3 members.
insert into auth.users (id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),   -- P1 author / leader
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),   -- P2 member
  ('cccccccc-cccc-cccc-cccc-cccccccccccc');   -- P3 member
insert into profiles (id, display_name, date_of_birth) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','P1','1990-01-01'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','P2','1990-01-01'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc','P3','1990-01-01');
insert into groups (id,name,created_by) values (4,'Prayer Group','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
insert into group_members values
  (4,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','leader',now()),
  (4,'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','member',now()),
  (4,'cccccccc-cccc-cccc-cccc-cccccccccccc','member',now());
insert into prayer_requests (id,group_id,author_id,body) values
  (20,4,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Pray for my exams');

-- ---- two different members pray (the trigger bumps the count via SECURITY DEFINER)
select expect_allowed('a member can pray (P2)',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'insert into prayer_prayed (request_id,user_id) values (20,''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'')');
select expect_allowed('a member can pray (P3)',
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'insert into prayer_prayed (request_id,user_id) values (20,''cccccccc-cccc-cccc-cccc-cccccccccccc'')');

-- ---- a third member (the author) sees the true total, not their own 0/1
select expect_count('a third member sees prayed_count = 2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'select prayed_count from v_prayer_requests where id = 20', 2);
select expect_count('i_prayed is false for a member who has not prayed',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'select count(*) from v_prayer_requests where id = 20 and i_prayed = false', 1);
select expect_count('i_prayed is true for a member who prayed',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'select count(*) from v_prayer_requests where id = 20 and i_prayed = true', 1);

-- ---- identities stay private: the author sees the count but not a single prayed row
select expect_count('a member still cannot read anyone else''s prayed rows',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'select count(*) from prayer_prayed where request_id = 20', 0);

-- ---- un-praying brings the count back to 1.
-- prayer_prayed has no DELETE policy (decision 2 keeps it that way), so this un-pray is
-- done as owner; the real app would expose a SECURITY DEFINER RPC. What matters here is
-- the AFTER DELETE trigger's decrement.
delete from prayer_prayed where request_id = 20 and user_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
insert into results select 'un-praying decrements the count back to 1', '1', prayed_count::text, prayed_count = 1
  from prayer_requests where id = 20;

-- ---- the decrement clamps at zero (force a stale 0, then delete the last prayer)
update prayer_requests set prayed_count = 0 where id = 20;
delete from prayer_prayed where request_id = 20 and user_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
insert into results select 'the decrement clamps at zero', '0', prayed_count::text, prayed_count = 0
  from prayer_requests where id = 20;

-- ---- combined report (base suite + decisions + prayed_count)
\echo '--- all checks (base suite + decisions + prayed_count) ---'
select name, expected, actual, case when pass then 'PASS' else 'FAIL' end as result from results order by ctid;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from results;
