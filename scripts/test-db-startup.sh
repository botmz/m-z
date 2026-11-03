#!/usr/bin/env bash
# Isolated integration test. Never uses the owner's DATABASE_URL or Telegram credentials.
set -euo pipefail
cd "$(dirname "$0")/.."

PG_BIN="$(dirname "$(command -v initdb)")"
TEST_ROOT="$(mktemp -d /tmp/mz-startup-test.XXXXXX)"
PG_PORT=55439
API_PORT=18939
API_PID=""
EXPECTED_MIGRATIONS="$(node -p 'JSON.parse(require("node:fs").readFileSync("lib/db/drizzle/meta/_journal.json","utf8")).entries.length')"

cleanup() {
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
    wait "$API_PID" 2>/dev/null || true
  fi
  "$PG_BIN/pg_ctl" -D "$TEST_ROOT/db" -m fast stop >/dev/null 2>&1 || true
}
trap cleanup EXIT

"$PG_BIN/initdb" -D "$TEST_ROOT/db" --auth=trust --username=mz_test >"$TEST_ROOT/initdb.log"
"$PG_BIN/pg_ctl" -D "$TEST_ROOT/db" -l "$TEST_ROOT/postgres.log" \
  -o "-h 127.0.0.1 -p $PG_PORT -k $TEST_ROOT" -w start >/dev/null

sql() {
  "$PG_BIN/psql" -h 127.0.0.1 -p "$PG_PORT" -U mz_test -d postgres \
    -v ON_ERROR_STOP=1 -Atc "$1"
}

start_api() {
  env -i PATH="$PATH" NODE_ENV=production PORT="$API_PORT" \
    MZ_AUTO_MIGRATE=true \
    DATABASE_URL="postgresql://mz_test@127.0.0.1:$PG_PORT/postgres" \
    SESSION_SECRET=isolated-test-only-session-secret-at-least-32-characters \
    ADMIN_INITIAL_PASSWORD=isolated-test-only-owner-password \
    node artifacts/api-server/dist/index.mjs >>"$TEST_ROOT/api.log" 2>&1 &
  API_PID=$!
  for attempt in $(seq 1 45); do
    if curl --fail --silent "http://127.0.0.1:$API_PORT/api/healthz" >/dev/null; then
      curl --fail --silent "http://127.0.0.1:$API_PORT/api/mz/auth" |
        node -e 'let s=""; process.stdin.on("data", c => s += c); process.stdin.on("end", () => { if (JSON.parse(s).configured !== true) process.exit(1); });'
      return
    fi
    if ! kill -0 "$API_PID" 2>/dev/null; then break; fi
    sleep 1
  done
  cat "$TEST_ROOT/api.log"
  return 1
}

stop_api() {
  kill "$API_PID"
  wait "$API_PID" || true
  API_PID=""
}

start_api
test "$(sql "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'")" = "13"
test "$(sql 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = "$EXPECTED_MIGRATIONS"
test "$(sql 'SELECT count(*) FROM admin_settings WHERE id=1 AND length(password_hash)>0')" = "1"
sql "INSERT INTO app_settings(key,value) VALUES ('startup_test_marker','\"preserved\"'::jsonb)" >/dev/null
original_hash="$(sql 'SELECT password_hash FROM admin_settings WHERE id=1')"
echo "PASS: fresh database migrated; 13 tables exist; admin initialization succeeded."

stop_api
start_api
test "$(sql 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = "$EXPECTED_MIGRATIONS"
test "$(sql 'SELECT password_hash FROM admin_settings WHERE id=1')" = "$original_hash"
echo "PASS: repeat startup keeps the existing admin and migration history."

# Simulate an existing database initialized by manual SQL without a Drizzle journal.
# This is exclusively the disposable local cluster created above.
stop_api
sql 'TRUNCATE drizzle.__drizzle_migrations' >/dev/null
start_api
test "$(sql 'SELECT count(*) FROM drizzle.__drizzle_migrations')" = "$EXPECTED_MIGRATIONS"
test "$(sql "SELECT value #>> '{}' FROM app_settings WHERE key='startup_test_marker'")" = "preserved"
test "$(sql 'SELECT password_hash FROM admin_settings WHERE id=1')" = "$original_hash"
echo "PASS: untracked existing schema is adopted without losing settings or replacing the admin."
grep -E 'Applying PostgreSQL migrations|migrations applied|Server listening' "$TEST_ROOT/api.log"
