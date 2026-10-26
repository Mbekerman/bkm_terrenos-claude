#!/usr/bin/env bash
# Regera tools/parametros/parametros.json a partir da carga das migrations
# (supabase/migrations/20261015000260_parametros_urbanisticos.sql), num
# Postgres 16 temporário, como supabase/tests/run.sh. Rode depois de mudar a carga.
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
export PATH="$PGBIN:$PATH"
DIR="$(mktemp -d)"
PORT="${PORT:-54330}"
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DIR"; else RUN=""; fi
cleanup() { $RUN pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$RUN initdb -D "$DIR" -U postgres -A trust -E UTF8 --locale=C >/dev/null
$RUN pg_ctl -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/log" start -w >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f supabase/tests/shim_supabase.sql
for f in supabase/migrations/*.sql; do $PSQL -f "$f" >/dev/null; done
$PSQL -At -f tools/parametros/exportar.sql > tools/parametros/parametros.json
echo "tools/parametros/parametros.json: $(grep -c '"sigla"' tools/parametros/parametros.json) linhas"
