#!/usr/bin/env bash
#
# Runs the RLS authorization suite (backend/rls_test.sql) against a Postgres
# database, applying the wired-in Supabase migration first. Used by CI (against a
# plain postgres:16 service) and runnable locally.
#
# The authored schema lives at backend/schema.sql and is copied verbatim into the
# first Supabase migration; this script asserts they have not drifted, then runs
# the 22 authorization checks and FAILS if any did not pass.
#
# Against plain Postgres (no Supabase auth schema) it loads backend/stub_auth.sql
# to stand in for auth.users / auth.uid(), then applies the migration itself.
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

# 2. The schema's final GRANTs target the 'authenticated' role. Supabase provides
#    it; a bare Postgres does not, so create it first (idempotent).
psql_run -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if; end \$\$;"

# 3. Apply the auth stub and all migrations in order (bare Postgres only), then the
#    base suite, then any extra test files (decision checks).
args=()
[[ $use_stub -eq 1 ]] && args+=(-f "$STUB")
if [[ $apply_migration -eq 1 ]]; then
  for m in "$ROOT"/supabase/migrations/*.sql; do args+=(-f "$m"); done
fi
args+=(-f "$SUITE")
for t in "$ROOT"/supabase/tests/*.sql; do [[ -e "$t" ]] && args+=(-f "$t"); done
psql_run "${args[@]}"

# 4. Fail the build if any check failed. The suite leaves its verdicts in the
#    'results' table; a denied write is silent under RLS, so we assert explicitly.
psql_run -c "do \$\$ begin if exists (select 1 from results where not pass) then raise exception 'RLS authorization checks FAILED'; end if; end \$\$;"
echo "All RLS authorization checks passed (base suite + decision checks)."
