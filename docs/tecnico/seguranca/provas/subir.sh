#!/usr/bin/env bash
# Sobe um Postgres 16 temporário persistente (porta 54340) com shim + migrations + regras.sql + carga, como o run.sh
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../../../.." && pwd)"
PGBIN=/usr/lib/postgresql/16/bin; export PATH="$PGBIN:$PATH"
DIR=/tmp/pgaudit_bkm
PORT=54340
RUN="runuser -u postgres --"
if [ -d "$DIR" ]; then $RUN pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; fi
mkdir -p "$DIR"; chown postgres "$DIR"
$RUN initdb -D "$DIR" -U postgres -A trust -E UTF8 --locale=C >/dev/null
$RUN pg_ctl -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/log" start -w >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
cd $REPO
$PSQL -f supabase/tests/shim_supabase.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f"; done
$PSQL -f supabase/tests/regras.sql 2>&1 | grep -E "FALHOU|ERROR|TODOS" || true
$PSQL -f supabase/carga/bkm.sql >/dev/null
echo pronto
