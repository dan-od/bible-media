-- Authorization smoke test. Every check exercises a real caller role through RLS.
\set ON_ERROR_STOP on
set client_min_messages = warning;

do $$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end $$;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke update on discussion_replies from authenticated;
grant update (body) on discussion_replies to authenticated;
grant execute on function mark_clarified(bigint) to authenticated;

-- ---- fixtures (as owner, bypassing RLS)
insert into translations values ('KJV','King James Version',true,true);
insert into passage_refs (book,chapter,verse_start,verse_end) values ('Psalm',31,24,24);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),  -- A  adult
  ('22222222-2222-2222-2222-222222222222'),  -- B  adult, co-leader of G
  ('33333333-3333-3333-3333-333333333333'),  -- T  teen, 15
  ('44444444-4444-4444-4444-444444444444');  -- S  stranger adult

insert into profiles (id, display_name, date_of_birth) values
  ('11111111-1111-1111-1111-111111111111','A','1996-01-01'),
  ('22222222-2222-2222-2222-222222222222','B','1995-01-01'),
  ('33333333-3333-3333-3333-333333333333','T','2011-01-01'),
  ('44444444-4444-4444-4444-444444444444','S','1990-01-01');

-- A–B, A–T, B–T all accepted connections
insert into connections (user_low,user_high,status) values
  (least('11111111-1111-1111-1111-111111111111'::uuid,'22222222-2222-2222-2222-222222222222'::uuid),
   greatest('11111111-1111-1111-1111-111111111111'::uuid,'22222222-2222-2222-2222-222222222222'::uuid),'accepted'),
  (least('11111111-1111-1111-1111-111111111111'::uuid,'33333333-3333-3333-3333-333333333333'::uuid),
   greatest('11111111-1111-1111-1111-111111111111'::uuid,'33333333-3333-3333-3333-333333333333'::uuid),'accepted'),
  (least('22222222-2222-2222-2222-222222222222'::uuid,'33333333-3333-3333-3333-333333333333'::uuid),
   greatest('22222222-2222-2222-2222-222222222222'::uuid,'33333333-3333-3333-3333-333333333333'::uuid),'accepted');

-- group G: B is co-leader, T is member. A and S are not members.
insert into groups (id,name,created_by) values (1,'Youth Group','22222222-2222-2222-2222-222222222222');
insert into group_members values
  (1,'22222222-2222-2222-2222-222222222222','coleader',now()),
  (1,'33333333-3333-3333-3333-333333333333','member',now());

insert into discussions (id,group_id,question,author_id,is_anonymous)
  values (1,1,'Why did Mary anoint his feet?','33333333-3333-3333-3333-333333333333',true);
insert into discussion_replies (id,discussion_id,author_id,is_anonymous,body)
  values (1,1,'22222222-2222-2222-2222-222222222222',false,'Because…');
insert into prayer_requests (id,group_id,author_id,is_anonymous,body)
  values (1,1,'33333333-3333-3333-3333-333333333333',true,'Pray for my exams');

-- A's notes
insert into notes (id,user_id,passage_ref_id,body,visibility) values
  (1,'11111111-1111-1111-1111-111111111111',1,'my private thought','private'),
  (2,'11111111-1111-1111-1111-111111111111',1,'shared with circle','circle');

-- threads: A↔T, B↔T, A↔S
insert into threads (id) values (1),(2),(3);
insert into thread_members values
  (1,'11111111-1111-1111-1111-111111111111'),(1,'33333333-3333-3333-3333-333333333333'),
  (2,'22222222-2222-2222-2222-222222222222'),(2,'33333333-3333-3333-3333-333333333333'),
  (3,'11111111-1111-1111-1111-111111111111'),(3,'44444444-4444-4444-4444-444444444444');

-- ---- harness
create table results (name text, expected text, actual text, pass boolean);

create or replace function expect_count(nm text, uid text, q text, want int)
returns void language plpgsql as $$
declare got int;
begin
  execute format('set local role authenticated');
  execute format('set local request.jwt.claim.sub = %L', uid);
  execute q into got;
  reset role;
  insert into results values (nm, want::text, got::text, got = want);
end $$;

create or replace function expect_denied(nm text, uid text, q text)
returns void language plpgsql as $$
begin
  begin
    execute format('set local role authenticated');
    execute format('set local request.jwt.claim.sub = %L', uid);
    execute q;
    reset role;
    insert into results values (nm, 'denied', 'ALLOWED', false);
  exception when others then
    reset role;
    insert into results values (nm, 'denied', 'denied', true);
  end;
end $$;

create or replace function expect_allowed(nm text, uid text, q text)
returns void language plpgsql as $$
begin
  begin
    execute format('set local role authenticated');
    execute format('set local request.jwt.claim.sub = %L', uid);
    execute q;
    reset role;
    insert into results values (nm, 'allowed', 'allowed', true);
  exception when others then
    reset role;
    insert into results values (nm, 'allowed', 'DENIED: '||sqlerrm, false);
  end;
end $$;

-- ---- notes
select expect_count('private note hidden from a connection',
  '22222222-2222-2222-2222-222222222222', 'select count(*) from notes where id = 1', 0);
select expect_count('circle note visible to a connection',
  '22222222-2222-2222-2222-222222222222', 'select count(*) from notes where id = 2', 1);
select expect_count('circle note hidden from a stranger',
  '44444444-4444-4444-4444-444444444444', 'select count(*) from notes where id = 2', 0);
select expect_count('own private note visible to its author',
  '11111111-1111-1111-1111-111111111111', 'select count(*) from notes where id = 1', 1);

-- ---- groups
select expect_count('non-member cannot read a group discussion',
  '11111111-1111-1111-1111-111111111111', 'select count(*) from discussions', 0);
select expect_count('member can read a group discussion',
  '33333333-3333-3333-3333-333333333333', 'select count(*) from discussions', 1);
select expect_denied('member cannot clarify a reply',
  '33333333-3333-3333-3333-333333333333', 'select mark_clarified(1)');
select expect_count('the failed clarify left no mark',
  '22222222-2222-2222-2222-222222222222',
  'select count(*) from discussion_replies where id = 1 and clarified_by is not null', 0);
select expect_denied('member cannot write clarified_by directly',
  '33333333-3333-3333-3333-333333333333',
  'update discussion_replies set clarified_by = ''33333333-3333-3333-3333-333333333333'' where id = 1');
select expect_allowed('co-leader can clarify a reply',
  '22222222-2222-2222-2222-222222222222', 'select mark_clarified(1)');
select expect_count('the clarify was recorded',
  '22222222-2222-2222-2222-222222222222',
  'select count(*) from discussion_replies where id = 1 and clarified_by is not null', 1);
select expect_allowed('an author may edit their own reply body',
  '22222222-2222-2222-2222-222222222222',
  'update discussion_replies set body = ''Because, in short…'' where id = 1');

-- ---- anonymity
select expect_count('anonymous prayer hides its author from a member',
  '22222222-2222-2222-2222-222222222222',
  'select count(*) from v_prayer_requests where id = 1 and author_id is null', 1);
select expect_count('anonymous question hides its author from a member',
  '22222222-2222-2222-2222-222222222222',
  'select count(*) from discussions where id = 1 and is_anonymous', 1);

-- ---- who prayed stays private
select expect_allowed('a member can record that they prayed',
  '22222222-2222-2222-2222-222222222222',
  'insert into prayer_prayed (request_id,user_id) values (1,''22222222-2222-2222-2222-222222222222'')');
select expect_count('a member cannot see who else prayed',
  '33333333-3333-3333-3333-333333333333', 'select count(*) from prayer_prayed', 0);

-- ---- the minor rule
select expect_denied('unconnected adult cannot message anyone',
  '44444444-4444-4444-4444-444444444444',
  'insert into messages (thread_id,sender_id,body) values (3,''44444444-4444-4444-4444-444444444444'',''hi'')');
select expect_denied('connected adult cannot DM a minor without a shared group or approval',
  '11111111-1111-1111-1111-111111111111',
  'insert into messages (thread_id,sender_id,body) values (1,''11111111-1111-1111-1111-111111111111'',''hi'')');
select expect_allowed('adult sharing a group may DM a minor',
  '22222222-2222-2222-2222-222222222222',
  'insert into messages (thread_id,sender_id,body) values (2,''22222222-2222-2222-2222-222222222222'',''hi'')');
select expect_allowed('a minor may reply',
  '33333333-3333-3333-3333-333333333333',
  'insert into messages (thread_id,sender_id,body) values (2,''33333333-3333-3333-3333-333333333333'',''hey'')');
select expect_count('a stranger cannot read someone else''s thread',
  '44444444-4444-4444-4444-444444444444', 'select count(*) from messages where thread_id = 2', 0);

-- after a guardian approves A, the A→T DM is allowed
insert into guardian_links values
  ('22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','accepted','2029-01-01');
insert into dm_approvals values
  ('33333333-3333-3333-3333-333333333333','11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222',now());
select expect_allowed('adult may DM a minor once a guardian approves',
  '11111111-1111-1111-1111-111111111111',
  'insert into messages (thread_id,sender_id,body) values (1,''11111111-1111-1111-1111-111111111111'',''hi'')');

-- ---- report
select name, expected, actual, case when pass then 'PASS' else 'FAIL' end as result from results;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from results;
