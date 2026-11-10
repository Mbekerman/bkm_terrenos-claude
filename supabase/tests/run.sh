#!/usr/bin/env bash
# Sobe um Postgres 16 temporário, aplica o shim + migrations e roda os testes.
# Uso: bash supabase/tests/run.sh   (precisa de postgres 16 no PATH ou em /usr/lib/postgresql/16/bin)
set -euo pipefail
cd "$(dirname "$0")/../.."
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
export PATH="$PGBIN:$PATH"
DIR="$(mktemp -d)"
PORT="${PORT:-54329}"
if [ "$(id -u)" = "0" ]; then RUN="runuser -u postgres --"; chown postgres "$DIR"; else RUN=""; fi
cleanup() { $RUN pg_ctl -D "$DIR" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT
$RUN initdb -D "$DIR" -U postgres -A trust -E UTF8 --locale=C >/dev/null   # UTF8 como no Supabase
$RUN pg_ctl -D "$DIR" -o "-p $PORT -k /tmp" -l "$DIR/log" start -w >/dev/null
PSQL="psql -h /tmp -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"

$PSQL -f supabase/tests/shim_supabase.sql
for f in supabase/migrations/*.sql; do
  echo "migration: $(basename "$f")"
  $PSQL -f "$f"
done
$PSQL -f supabase/tests/regras.sql 2>&1 | sed "s/^psql:[^ ]* NOTICE:  //" | grep -E "^(ok |# |FALHOU|TODOS)|ERROR"

# carga da BKM: roda duas vezes (não duplica) e o primeiro login de cada um pega o papel combinado
$PSQL -f supabase/carga/bkm.sql
$PSQL -f supabase/carga/bkm.sql
$PSQL -t -A -c "
insert into auth.users values
  ('10000000-0000-0000-0000-000000000004', 'arnon.cugola@bkm.com.br', '{\"full_name\":\"Arnon\"}', now()),
  ('10000000-0000-0000-0000-000000000001', 'moises@bkm.com.br', '{\"full_name\":\"Moisés Bekerman\"}', now()),
  ('10000000-0000-0000-0000-000000000003', 'cecilia.scheydegger@bkm.com.br', '{}', now()),
  ('10000000-0000-0000-0000-000000000005', 'outra.pessoa@bkm.com.br', '{}', now());
select case when (select count(*) from app.empresas where nome = 'BKM') = 1
  and (select string_agg(u.email || ':' || m.papel || ':' || m.administrador || ':' || coalesce(s.email, '-'), ' ' order by u.email)
       from app.membros m join app.usuarios u on u.user_id = m.user_id left join app.usuarios s on s.user_id = m.superior_id
       where m.empresa_id = (select id from app.empresas where nome = 'BKM'))
     = 'arnon.cugola@bkm.com.br:analista:false:cecilia.scheydegger@bkm.com.br cecilia.scheydegger@bkm.com.br:gestor:false:moises@bkm.com.br moises@bkm.com.br:diretor:true:- outra.pessoa@bkm.com.br:basico:false:-'
  then 'CARGA DA BKM OK' else 'FALHOU: carga da BKM' end" | tee /dev/stderr | grep -q "CARGA DA BKM OK"
