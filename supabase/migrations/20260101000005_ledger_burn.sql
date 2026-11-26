-- What the ledger keeps when an account is deleted.
--
-- claim_ledger maps every claimed client id to its account, which is what stops one
-- account claiming another's records. It was declared ON DELETE CASCADE, so deleting
-- an account deleted its ledger rows and every one of its ids became claimable by
-- anyone (a phone still holding them, signed in to a different account, would copy
-- them in). And the link from id to person must not outlive the account: what someone
-- was going through is special-category data.
--
-- Now, when an account is deleted, each of its ledger rows stays, loses its account
-- and is marked burned. A burned id is refused exactly as another account's id is
-- ('other_account'). What remains is the random id, the kind of record, when it was
-- claimed and when it was burned: nothing that points to a person.

alter table claim_ledger drop constraint claim_ledger_user_id_fkey;
alter table claim_ledger
  alter column user_id drop not null,
  add column burned_at timestamptz,
  add constraint claim_ledger_user_id_fkey foreign key (user_id) references profiles(id) on delete set null,
  -- Every row is exactly one of: owned by an account, or burned.
  add constraint claim_ledger_owned_or_burned check ((user_id is null) = (burned_at is not null));

-- The foreign key's SET NULL runs as an update on the ledger; this marks it burned
-- before the check above sees it. An id never moves to another account, so a burned
-- row can't be given one either (and the check stops it losing its burn).
create function claim_ledger_burn() returns trigger language plpgsql as $$
begin
  if new.user_id is not null and new.user_id is distinct from old.user_id then
    raise exception 'claim_ledger: an id never moves to another account';
  end if;
  if new.user_id is null then
    new.burned_at := now();
  end if;
  return new;
end $$;
create trigger claim_ledger_burn before update on claim_ledger
  for each row execute function claim_ledger_burn();
revoke execute on function claim_ledger_burn() from public;

-- claim_records, unchanged except that a burned id is refused.
create or replace function claim_records(batch jsonb, device uuid default null) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  me       uuid := auth.uid();
  r        jsonb;
  k        text;
  op       text;
  cid      uuid;
  ref      bigint;
  th       bigint;
  ts       timestamptz;
  upd      timestamptz;
  owner    uuid;
  burned   boolean;
  words    text;
  accepted jsonb := '[]';
  rejected jsonb := '[]';
begin
  if me is null then raise exception 'claim_records: not signed in'; end if;
  if not exists (select 1 from profiles where id = me) then
    raise exception 'claim_records: no profile';
  end if;
  if not exists (select 1 from consents where user_id = me and kind = 'special_category') then
    raise exception 'claim_records: no consent recorded';
  end if;
  if batch is null or jsonb_typeof(batch) <> 'array' then
    raise exception 'claim_records: batch must be an array';
  end if;
  if jsonb_array_length(batch) > 100 then
    raise exception 'claim_records: at most 100 records per batch';
  end if;

  for r in select value from jsonb_array_elements(batch) loop
    begin
      k   := r->>'kind';
      op  := coalesce(r->>'op', 'upsert');
      cid := (r->>'client_id')::uuid;
      if cid is null then raise exception 'missing client_id'; end if;
      if op not in ('upsert', 'delete') then raise exception 'unknown op %', op; end if;
      ts := least(coalesce((r->>'created_at')::timestamptz, now()), now());

      -- An id another account owns is never touched, and neither is a burned one
      -- (its account was deleted): it can never be claimed again, by anyone.
      owner := null;
      burned := false;
      select l.user_id, l.burned_at is not null into owner, burned from claim_ledger l where l.client_id = cid;
      if coalesce(burned, false) or (owner is not null and owner <> me) then
        rejected := rejected || jsonb_build_object('client_id', cid, 'reason', 'other_account');
        continue;
      end if;

      if k = 'star' then
        ref := claim_passage_ref(r->'passage');
        if op = 'delete' then
          delete from stars where user_id = me and passage_ref_id = ref;
        else
          insert into stars as s (user_id, passage_ref_id, created_at, client_id, device_id)
          values (me, ref, ts, cid, device)
          on conflict (user_id, passage_ref_id) do update
            set client_id  = case when excluded.created_at < s.created_at then excluded.client_id else s.client_id end,
                device_id  = case when excluded.created_at < s.created_at then excluded.device_id else s.device_id end,
                created_at = least(s.created_at, excluded.created_at);
        end if;

      elsif k = 'save' then
        ref := claim_passage_ref(r->'passage');
        if op = 'delete' then
          delete from saves where user_id = me and passage_ref_id = ref;
        else
          insert into saves as s (user_id, passage_ref_id, created_at, client_id, device_id)
          values (me, ref, ts, cid, device)
          on conflict (user_id, passage_ref_id) do update
            set client_id  = case when excluded.created_at < s.created_at then excluded.client_id else s.client_id end,
                device_id  = case when excluded.created_at < s.created_at then excluded.device_id else s.device_id end,
                created_at = least(s.created_at, excluded.created_at);
        end if;

      elsif k = 'note' then
        if op = 'delete' then
          delete from notes where user_id = me and client_id = cid;
        else
          ref := claim_passage_ref(r->'passage');
          upd := least(coalesce((r->>'updated_at')::timestamptz, ts), now());
          -- Keyed on the note's own id: two phones' notes are two notes. A later edit
          -- of the same note wins; an older one arriving late is ignored.
          insert into notes as n (user_id, passage_ref_id, body, visibility, created_at, updated_at, client_id, device_id)
          values (me, ref, r->>'body', coalesce((r->>'visibility')::note_visibility, 'private'), ts, upd, cid, device)
          on conflict (client_id) do update
            set body = excluded.body, visibility = excluded.visibility, updated_at = excluded.updated_at
            where n.user_id = me and excluded.updated_at >= n.updated_at;
        end if;

      elsif k = 'situation' then
        th := claim_theme(r->>'label');
        if op = 'delete' then
          update situations set ended_at = now()
           where user_id = me and theme_id = th and ended_at is null;
        else
          insert into situations as s (user_id, theme_id, started_at, client_id, device_id)
          values (me, th, ts, cid, device)
          on conflict (user_id, theme_id) where theme_id is not null and ended_at is null
          do update set started_at = least(s.started_at, excluded.started_at);
        end if;

      elsif k = 'words' then
        if op = 'delete' then
          update situations set ended_at = now()
           where user_id = me and client_id = cid and ended_at is null;
        else
          words := btrim(r->>'own_words');
          if words is null or words = '' then raise exception 'empty words'; end if;
          if length(words) > 2000 then raise exception 'words too long'; end if;
          if exists (select 1 from situations where client_id = cid) then
            update situations set own_words = words where client_id = cid and user_id = me;
          elsif not exists (select 1 from situations
                             where user_id = me and theme_id is null and ended_at is null
                               and own_words = words) then
            insert into situations (user_id, theme_id, own_words, started_at, client_id, device_id)
            values (me, null, words, ts, cid, device);
          end if;
        end if;

      elsif k = 'tuned' then
        th := claim_theme(r->>'label');
        if op = 'delete' then
          delete from tuned_themes where user_id = me and theme_id = th;
        else
          insert into tuned_themes as t (user_id, theme_id, created_at, client_id)
          values (me, th, ts, cid)
          on conflict (user_id, theme_id) do update set created_at = least(t.created_at, excluded.created_at);
        end if;

      else
        raise exception 'unknown kind %', k;
      end if;

      if op = 'upsert' then
        insert into claim_ledger (client_id, user_id, kind) values (cid, me, k) on conflict (client_id) do nothing;
      end if;
      accepted := accepted || to_jsonb(cid::text);
    exception when others then
      rejected := rejected || jsonb_build_object('client_id', r->>'client_id', 'reason', 'invalid', 'detail', sqlerrm);
    end;
  end loop;

  return jsonb_build_object('accepted', accepted, 'rejected', rejected);
end $$;
