-- Deleting an account deletes the sign-in too.
--
-- delete_user removed the profile (and through it every claimed record, burning the
-- ledger ids) but left auth.users: the email address, the most directly identifying
-- thing the app holds, about someone whose account was religious and so
-- special-category. Now it removes, in one transaction:
--   * the auth user, which cascades to the profile and everything the profile owns,
--     and to auth's identities, sessions, refresh and one-time tokens and MFA rows;
--   * auth's audit log entries about the person. They have no foreign key, repeat
--     the email, and record IP addresses.
-- If any step fails, nothing is deleted. The ledger rows stay, unlinked and burned
-- (migration 5).
--
-- The project's owner role may delete from auth.users and auth.audit_log_entries in
-- Supabase today (checked on the local stack, which runs the same image). If a
-- future Supabase version takes that away, this raises and deletes nothing, and the
-- compensating step is the Admin API's deleteUser from a server holding the service
-- key, followed by the audit-log delete below.
--
-- After calling it the app signs out locally only: the user no longer exists, so a
-- server-side sign-out has nothing to end.

create or replace function delete_user(uid uuid) returns boolean
language plpgsql security definer set search_path = public, auth as $$
declare
  v_email text;
begin
  if uid is null or uid is distinct from auth.uid() then
    raise exception 'you may only delete your own account';
  end if;
  select email into v_email from auth.users where id = uid;
  delete from auth.users where id = uid;
  delete from auth.audit_log_entries a
   where a.payload ->> 'actor_id' = uid::text
      or (v_email is not null and strpos(lower(a.payload::text), lower(v_email)) > 0);
  return true;
end $$;
