\set QUIET on
\set ON_ERROR_STOP off
create or replace function pg_temp.como(p_email text) returns void language plpgsql as $$
declare v text;
begin
  reset role;
  select id::text into v from auth.users where email = p_email;
  perform set_config('request.jwt.claim.sub', v, false);
  perform set_config('role', 'authenticated', false);
end $$;
\set emp `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from app.empresas where nome='BKM Teste'"`
\set analista `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from auth.users where email='analista@bkm.test'"`
\set gestor `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from auth.users where email='gestor@bkm.test'"`
\set diretor `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from auth.users where email='diretor@bkm.test'"`
\set leitor `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from auth.users where email='leitura@bkm.test'"`
