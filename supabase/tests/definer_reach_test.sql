-- Signed-in users reach only the client RPCs (migration 20260101000007). The helpers
-- RLS policies call live in private, which grants clients no USAGE; the rest have no
-- client EXECUTE. The base suite passing at all shows the policies still reach them.

-- '33333333-…' is the base suite's minor; '11111111-…' an adult with no tie to them.
select expect_denied('a signed-in account cannot ask is_minor about another account',
  '11111111-1111-1111-1111-111111111111', 'select private.is_minor(''33333333-3333-3333-3333-333333333333'')');
select expect_denied('is_minor is no longer reachable by its old name',
  '11111111-1111-1111-1111-111111111111', 'select is_minor(''33333333-3333-3333-3333-333333333333'')');
select expect_denied('a signed-in account cannot call is_connected',
  '11111111-1111-1111-1111-111111111111', 'select private.is_connected(''11111111-1111-1111-1111-111111111111'', ''33333333-3333-3333-3333-333333333333'')');
select expect_denied('a signed-in account cannot call may_message',
  '11111111-1111-1111-1111-111111111111', 'select private.may_message(''11111111-1111-1111-1111-111111111111'', ''33333333-3333-3333-3333-333333333333'')');
select expect_denied('a signed-in account cannot call in_group',
  '11111111-1111-1111-1111-111111111111', 'select private.in_group(1, ''33333333-3333-3333-3333-333333333333'')');
select expect_denied('a signed-in account cannot run the minors'' message purge',
  '11111111-1111-1111-1111-111111111111', 'select purge_minor_messages()');
select expect_count('the private schema is not visible to a signed-in account', '11111111-1111-1111-1111-111111111111',
  'select count(*) from pg_namespace where nspname = ''private'' and has_schema_privilege(''authenticated'', oid, ''USAGE'')', 0);
-- A client RPC is still callable: my_records answers for the caller.
select expect_allowed('a client RPC is still callable', '11111111-1111-1111-1111-111111111111', 'select my_records()');
-- is_minor is the enumeration tool itself: even if private's USAGE ever leaked to
-- clients, it must still not be executable by them (only may_message calls it).
select expect_count('no client role may execute is_minor at all', '11111111-1111-1111-1111-111111111111',
  'select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = ''private'' and p.proname = ''is_minor'' and has_function_privilege(''authenticated'', p.oid, ''EXECUTE'')', 0);
