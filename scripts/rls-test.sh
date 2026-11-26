#!/usr/bin/env bash
#
# Runs the RLS authorization suite (backend/rls_test.sql) against a Postgres
# database, applying the wired-in Supabase migration first. Used by CI (against a
# plain postgres:16 service) and runnable locally.
#
# The authored schema lives at backend/schema.sql and is copied verbatim into the
# first Supabase migration; this script asserts they have not drifted, runs the client
# guard (backend/client_guard.sql: no table without RLS, nothing writable without
# signing in), then every authorization check, and FAILS if any did not pass.
#
# Against plain Postgres (no Supabase auth schema) it loads backend/stub_auth.sql
# to stand in for auth.users / auth.uid() and Supabase's default grants, then applies
# the migrations itself.
# Against a real Supabase database — where the schema is already applied by
# `supabase db reset` and auth.users / auth.uid() exist — pass --supabase to skip
# both the stub and the migration and run the suite alone.
#
# Connection: set DATABASE_URL, or the standard PG* env vars (PGHOST, PGUSER, …).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MIGRATION="$ROOT/supabase/migrations/20260101000000_initial_schema.sql"
STUB="$ROOT/backend/stub_auth.sql"
SCHEMA_SRC="$ROOT/backend/schema.sql"
SUITE="$ROOT/backend/rls_test.sql"

CONN=()
[[ -n "${DATABASE_URL:-}" ]] && CONN=("$DATABASE_URL")
psql_run() { psql -v ON_ERROR_STOP=1 --no-psqlrc "${CONN[@]}" "$@"; }

# On Supabase the schema is already migrated and the stub is unneeded; on a bare
# Postgres we apply both the stub and the migration ourselves.
use_stub=1
apply_migration=1
if [[ "${1:-}" == "--supabase" ]]; then use_stub=0; apply_migration=0; fi

# 1. Drift guard: the migration must be the authored schema, verbatim.
if ! diff -q "$SCHEMA_SRC" "$MIGRATION" >/dev/null; then
  echo "ERROR: the Supabase migration has drifted from backend/schema.sql." >&2
  echo "       Re-copy backend/schema.sql into the migration, deliberately." >&2
  diff "$SCHEMA_SRC" "$MIGRATION" >&2 || true
  exit 1
fi

# 2. The schema's grants target Supabase's roles. Supabase provides them; a bare
#    Postgres does not, so create them first (idempotent).
psql_run -c "do \$\$ declare r text; begin foreach r in array array['anon','authenticated','service_role'] loop if not exists (select 1 from pg_roles where rolname = r) then execute format('create role %I', r); end if; end loop; end \$\$;"

# 3. Apply the auth stub and all migrations in order (bare Postgres only), then the
#    client guard (every table, view and definer function in public; it raises on a
#    failure), then the base suite, then any extra test files (decision checks).
args=()
[[ $use_stub -eq 1 ]] && args+=(-f "$STUB")
if [[ $apply_migration -eq 1 ]]; then
  for m in "$ROOT"/supabase/migrations/*.sql; do args+=(-f "$m"); done
fi
# The client guard runs before the suites, which add scaffolding tables of their own.
args+=(-f "$ROOT/backend/client_guard.sql")
args+=(-f "$SUITE")
for t in "$ROOT"/supabase/tests/*.sql; do [[ -e "$t" ]] && args+=(-f "$t"); done
psql_run "${args[@]}"

# 4. One report for every check, from the base suite and every file in supabase/tests.
echo '--- all checks ---'
psql_run -c "select name, expected, actual, case when pass then 'PASS' else 'FAIL' end as result from results order by ctid" \
         -c "select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from results"

# 5. Fail the build if any check failed. The suite leaves its verdicts in the
#    'results' table; a denied write is silent under RLS, so we assert explicitly.
psql_run -c "do \$\$ begin if exists (select 1 from results where not pass) then raise exception 'RLS authorization checks FAILED'; end if; end \$\$;"
psql_run -c "do \$\$ begin if to_regclass('public.client_guard_passed') is null then raise exception 'the client guard did not run (backend/client_guard.sql)'; end if; end \$\$;"
echo "Client guard and all RLS authorization checks passed (base suite + every file in supabase/tests)."
