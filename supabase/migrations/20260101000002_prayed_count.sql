-- Fix prayed_count. As authored it was a count(*) subquery inside the
-- security_invoker view v_prayer_requests, so it ran under the caller's RLS and
-- resolved to the caller's own prayer_prayed rows — always 0 or 1, never the group
-- total. Separate the two facts: a maintained counter column for "how many prayed"
-- (which everyone may see) and a per-caller "did I pray" that stays private.
--
-- prayer_prayed and its policies are left exactly as they are: identities stay
-- private (decision 2). The count is maintained by a SECURITY DEFINER trigger so a
-- member who prays can bump a prayer_requests row they have no UPDATE right on.

-- The public fact: a stored total, not a per-caller subquery.
alter table prayer_requests add column prayed_count int not null default 0;

-- Backfill any rows that already have prayers (no-op on a fresh database).
update prayer_requests p
   set prayed_count = (select count(*) from prayer_prayed pp where pp.request_id = p.id);

-- Maintain it from the one table that knows. SECURITY DEFINER (owner bypasses RLS)
-- so a plain member's INSERT into prayer_prayed can increment a prayer_requests row
-- they cannot update themselves; pinned search_path so the definer right is safe.
-- Decrement clamps at zero so the counter can never go negative.
create function prayer_prayed_maintain_count() returns trigger
language plpgsql security definer set search_path = public, auth as $$
begin
  if tg_op = 'INSERT' then
    update prayer_requests set prayed_count = prayed_count + 1
      where id = new.request_id;
  elsif tg_op = 'DELETE' then
    update prayer_requests set prayed_count = greatest(prayed_count - 1, 0)
      where id = old.request_id;
  end if;
  return null;  -- AFTER trigger: return value is ignored
end $$;

create trigger prayer_prayed_count
  after insert or delete on prayer_prayed
  for each row execute function prayer_prayed_maintain_count();

-- Rewrite the view: read the stored count, and expose i_prayed as an EXISTS against
-- prayer_prayed. The view is security_invoker, so that subquery resolves under the
-- caller's RLS to their own row only — "did I pray", with no one else's identity.
-- Dropped and recreated (not CREATE OR REPLACE) because prayed_count changes type
-- from the old bigint count(*) to the int column.
drop view v_prayer_requests;
create view v_prayer_requests with (security_invoker = true) as
  select p.id, p.group_id, p.body, p.visibility, p.answered_at, p.testimony,
         p.last_update_at, p.created_at, p.is_anonymous,
         case when p.is_anonymous then null else p.author_id end as author_id,
         p.prayed_count,
         exists (select 1 from prayer_prayed pp
                 where pp.request_id = p.id and pp.user_id = auth.uid()) as i_prayed
  from prayer_requests p;
