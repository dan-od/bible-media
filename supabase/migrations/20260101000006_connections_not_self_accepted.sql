-- No client can make a connection accepted.
--
-- is_connected() is what opens circle notes, profiles and reposts to another account,
-- and it trusts any row with status 'accepted'. connections_write let either person
-- write that row, so anyone signed in could insert (themselves, anyone, 'accepted')
-- and read that person's circle notes, with no say from them. Step 7 copies notes
-- marked "My circle" to the server, so this was live, not waiting for circles to ship.
--
-- Clients can still ask (pending), block, and remove a connection. Accepting has no
-- client path until circles ship. That work must add it as a function where only the
-- person asked can accept, and first build the confirmation in
-- backend/DATA_MODEL.md ("Before circles ship"): notes already marked "My circle" are
-- shown to their author and confirmed before any become visible.

drop policy connections_write on connections;

create policy connections_ask on connections for insert
  with check (auth.uid() in (user_low, user_high) and status in ('pending', 'blocked'));
create policy connections_change on connections for update
  using (auth.uid() in (user_low, user_high))
  with check (auth.uid() in (user_low, user_high) and status in ('pending', 'blocked'));
create policy connections_remove on connections for delete
  using (auth.uid() in (user_low, user_high));
