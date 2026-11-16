-- Authorization + behaviour checks for the four-question decisions (decision 3 and 4).
-- Runs in the same psql session as backend/rls_test.sql and reuses its harness
-- (results table, expect_count/expect_denied/expect_allowed). Decision 1 (region) and
-- decision 2 (prayer stays count-only) need no schema and are covered by the base suite's
-- "a member cannot see who else prayed".

-- ---- fixtures (as owner, bypassing RLS). IDs kept clear of the base suite's.
insert into auth.users (id) values
  ('55555555-5555-5555-5555-555555555555'),  -- GL  group leader (adult)
  ('66666666-6666-6666-6666-666666666666'),  -- GS  successor / member (adult)
  ('77777777-7777-7777-7777-777777777777'),  -- GM  member (adult), deleted for tombstone
  ('88888888-8888-8888-8888-888888888888'),  -- MIN minor (~14)
  ('99999999-9999-9999-9999-999999999999');  -- ADT adult

insert into profiles (id, display_name, date_of_birth) values
  ('55555555-5555-5555-5555-555555555555','GL','1990-01-01'),
  ('66666666-6666-6666-6666-666666666666','GS','1991-01-01'),
  ('77777777-7777-7777-7777-777777777777','GM','1992-01-01'),
  ('88888888-8888-8888-8888-888888888888','MIN','2012-01-01'),
  ('99999999-9999-9999-9999-999999999999','ADT','1988-01-01');

-- group 2: GL is the only leader; GS and GM are members.
insert into groups (id,name,created_by) values (2,'Decisions Group','55555555-5555-5555-5555-555555555555');
insert into group_members values
  (2,'55555555-5555-5555-5555-555555555555','leader',now()),
  (2,'66666666-6666-6666-6666-666666666666','member',now()),
  (2,'77777777-7777-7777-7777-777777777777','member',now());
insert into discussions (id,group_id,question,author_id) values (2,2,'Q2','77777777-7777-7777-7777-777777777777');
insert into discussion_replies (id,discussion_id,author_id,body) values (10,2,'77777777-7777-7777-7777-777777777777','GM reply');
insert into notes (id,user_id,passage_ref_id,body) values (10,'77777777-7777-7777-7777-777777777777',1,'GM private note');

-- group 3: for the archive test. GL leader, GM member, one existing discussion.
insert into groups (id,name,created_by) values (3,'Archive Test','55555555-5555-5555-5555-555555555555');
insert into group_members values
  (3,'55555555-5555-5555-5555-555555555555','leader',now()),
  (3,'77777777-7777-7777-7777-777777777777','member',now());
insert into discussions (id,group_id,question,author_id) values (3,3,'Q3','55555555-5555-5555-5555-555555555555');

-- unfriend test: GL <-> ADT connection and their 1:1 thread with a message.
insert into connections (user_low,user_high,status) values
  (least('55555555-5555-5555-5555-555555555555'::uuid,'99999999-9999-9999-9999-999999999999'::uuid),
   greatest('55555555-5555-5555-5555-555555555555'::uuid,'99999999-9999-9999-9999-999999999999'::uuid),'accepted');
insert into threads (id) values (10);
insert into thread_members values
  (10,'55555555-5555-5555-5555-555555555555'),(10,'99999999-9999-9999-9999-999999999999');
insert into messages (id,thread_id,sender_id,body) values (1000,10,'55555555-5555-5555-5555-555555555555','hi');

-- minor purge test: MIN <-> ADT thread, with backdated messages.
insert into threads (id) values (11);
insert into thread_members values
  (11,'88888888-8888-8888-8888-888888888888'),(11,'99999999-9999-9999-9999-999999999999');
insert into messages (id,thread_id,sender_id,body,created_at) values
  (1001,11,'88888888-8888-8888-8888-888888888888','old minor msg', now() - interval '13 months'),
  (1002,11,'88888888-8888-8888-8888-888888888888','new minor msg', now()),
  (1003,11,'99999999-9999-9999-9999-999999999999','old adult msg', now() - interval '13 months');

-- ==================================================== decision 3: last leader / archive
select expect_denied('last leader cannot leave the group',
  '55555555-5555-5555-5555-555555555555',
  'delete from group_members where group_id = 2 and user_id = ''55555555-5555-5555-5555-555555555555''');
select expect_denied('last leader cannot demote themselves',
  '55555555-5555-5555-5555-555555555555',
  'update group_members set role = ''member'' where group_id = 2 and user_id = ''55555555-5555-5555-5555-555555555555''');
select expect_denied('a member cannot archive the group',
  '77777777-7777-7777-7777-777777777777', 'select archive_group(2)');
select expect_allowed('a leader can appoint a successor',
  '55555555-5555-5555-5555-555555555555',
  'update group_members set role = ''leader'' where group_id = 2 and user_id = ''66666666-6666-6666-6666-666666666666''');
select expect_allowed('a former sole leader may leave once a successor exists',
  '55555555-5555-5555-5555-555555555555',
  'delete from group_members where group_id = 2 and user_id = ''55555555-5555-5555-5555-555555555555''');

select expect_allowed('a leader can archive a group',
  '55555555-5555-5555-5555-555555555555', 'select archive_group(3)');
select expect_denied('posting to an archived group is blocked',
  '77777777-7777-7777-7777-777777777777',
  'insert into discussions (group_id,question,author_id) values (3,''q'',''77777777-7777-7777-7777-777777777777'')');
select expect_count('an archived group is still readable',
  '77777777-7777-7777-7777-777777777777', 'select count(*) from discussions where group_id = 3', 1);
select expect_allowed('a leader may leave once the group is archived',
  '55555555-5555-5555-5555-555555555555',
  'delete from group_members where group_id = 3 and user_id = ''55555555-5555-5555-5555-555555555555''');

-- ==================================================== decision 4: retention
-- Removing a connection hard-deletes the 1:1 thread (and its messages). Done as owner;
-- the trigger is SECURITY DEFINER and fires regardless of caller.
delete from connections
  where user_low  = least('55555555-5555-5555-5555-555555555555'::uuid,'99999999-9999-9999-9999-999999999999'::uuid)
    and user_high = greatest('55555555-5555-5555-5555-555555555555'::uuid,'99999999-9999-9999-9999-999999999999'::uuid);
insert into results select 'removing a connection hard-deletes the DM thread', '0', count(*)::text, count(*) = 0
  from threads where id = 10;
insert into results select 'the DM thread''s messages are deleted with it', '0', count(*)::text, count(*) = 0
  from messages where thread_id = 10;

-- Deleting an account tombstones authored content: it survives, the identity is nulled,
-- and personal data is erased.
select expect_allowed('an account owner may delete their own account',
  '77777777-7777-7777-7777-777777777777',
  'select delete_user(''77777777-7777-7777-7777-777777777777'')');
insert into results select 'a deleted account''s reply survives with no author', '1', count(*)::text, count(*) = 1
  from discussion_replies where id = 10 and author_id is null;
insert into results select 'a deleted account''s question survives with no author', '1', count(*)::text, count(*) = 1
  from discussions where id = 2 and author_id is null;
insert into results select 'a deleted account''s private notes are erased', '0', count(*)::text, count(*) = 0
  from notes where id = 10;

-- A member may not delete someone else's account.
select expect_denied('you cannot delete another account',
  '99999999-9999-9999-9999-999999999999',
  'select delete_user(''88888888-8888-8888-8888-888888888888'')');

-- Minors' messages older than 12 months are purged; recent ones and adults' are not.
select purge_minor_messages();
insert into results select 'a minor''s message older than 12 months is purged', '0', count(*)::text, count(*) = 0
  from messages where id = 1001;
insert into results select 'a minor''s recent message is kept', '1', count(*)::text, count(*) = 1
  from messages where id = 1002;
insert into results select 'an adult''s message of the same age is kept', '1', count(*)::text, count(*) = 1
  from messages where id = 1003;

-- ---- combined report (base suite + decisions)
\echo '--- all checks (base suite + decisions) ---'
select name, expected, actual, case when pass then 'PASS' else 'FAIL' end as result from results order by ctid;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from results;
