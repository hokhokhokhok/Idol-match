#!/usr/bin/env bash
# 마이그레이션 + [샘플] 시드 + RLS 테스트를 빈 Postgres에 적용한다.
# DATABASE_URL이 있으면 그 DB(비어 있어야 함)에, 없으면 임시 로컬 클러스터를 띄워서 실행.
set -euo pipefail
cd "$(dirname "$0")/.."

run() {
  local url="$1"
  psql "$url" -q -v ON_ERROR_STOP=1 -f supabase/tests/auth_stub.sql
  for f in supabase/migrations/*.sql; do psql "$url" -q -v ON_ERROR_STOP=1 -f "$f"; done
  psql "$url" -q -v ON_ERROR_STOP=1 -f supabase/seed.sql
  psql "$url" -q -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /'
}

if [[ -n "${DATABASE_URL:-}" ]]; then run "$DATABASE_URL"; exit; fi

PGBIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"
[[ -x "$PGBIN/initdb" ]] || { echo "Postgres가 없습니다. DATABASE_URL을 지정하세요." >&2; exit 1; }
DIR="$(mktemp -d)"; PORT=55432
AS=(); [[ "$(id -u)" == 0 ]] && { chown postgres "$DIR"; AS=(runuser -u postgres --); }
"${AS[@]}" "$PGBIN/initdb" -D "$DIR/data" -U postgres -A trust >/dev/null
"${AS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -o "-p $PORT -k $DIR -c TimeZone=UTC" -l "$DIR/log" -w start >/dev/null
trap '"${AS[@]}" "$PGBIN/pg_ctl" -D "$DIR/data" -m fast stop >/dev/null; rm -rf "$DIR"' EXIT
run "postgresql://postgres@localhost:$PORT/postgres?host=$DIR"
