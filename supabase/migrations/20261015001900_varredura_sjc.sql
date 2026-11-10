-- =====================================================================
-- Varredura noturna dos lotes de São José dos Campos (10/nov/2026)
--
-- O job tools/geosanja/varredura baixa a cidade aos poucos, direto no
-- GeoSanja, e grava nas mesmas tabelas do mapa (app.lotes_prefeitura e
-- app.quadras_prefeitura, migration 20261015001800, PR #290). Esta
-- migration não cria essas tabelas: se elas ainda não existirem, o
-- controle da varredura funciona e a gravação dos lotes recusa com
-- mensagem clara.
--
-- A regra de gravar é a mesma de app.guardar_lotes_prefeitura: atualiza
-- o lote que veio, não mexe no que está marcado da_base, e numa quadra
-- montada por inteiro apaga o lote que saiu do cadastro. Quem chama é o
-- service_role do job, não um usuário. O relatório (app.varredura_sjc_relatorio)
-- é o que o Moises consulta de manhã.
--
-- Célula concluída há menos de 90 dias não entra aqui: os 90 dias são
-- os de conferido_em / montada_em nas tabelas de lotes, iguais ao mapa.
-- =====================================================================

create table app.varredura_sjc_celulas (
  empresa_id   uuid not null references app.empresas(id) on delete cascade,
  id           text not null check (id ~ '^[a-z0-9_]+$' and length(id) <= 80),
  ordem        int not null,
  x0 numeric(12,2) not null, y0 numeric(12,2) not null,
  x1 numeric(12,2) not null, y1 numeric(12,2) not null,
  lat numeric(9,6) not null, lng numeric(9,6) not null,
  densidade numeric(12,1),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'em_andamento', 'concluida', 'vazia')),
  tentativas int not null default 0 check (tentativas >= 0),
  consultas int not null default 0 check (consultas >= 0),
  lotes int not null default 0 check (lotes >= 0),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  erro text,
  check (x0 < x1 and y0 < y1),
  primary key (empresa_id, id)
);
create index on app.varredura_sjc_celulas (empresa_id, situacao, ordem);

create table app.varredura_sjc_execucoes (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references app.empresas(id) on delete cascade,
  iniciada_em timestamptz not null default now(),
  encerrada_em timestamptz,
  motivo text check (motivo is null or motivo in ('horario', 'concluida', 'bloqueio', 'erros', 'queda')),
  consultas int not null default 0 check (consultas >= 0),
  lotes_novos int not null default 0 check (lotes_novos >= 0),
  lotes_atualizados int not null default 0 check (lotes_atualizados >= 0),
  lotes_apagados int not null default 0 check (lotes_apagados >= 0),
  quadras_montadas int not null default 0 check (quadras_montadas >= 0),
  celulas_concluidas int not null default 0 check (celulas_concluidas >= 0),
  detalhe text
);
create index on app.varredura_sjc_execucoes (empresa_id, iniciada_em desc);

alter table app.varredura_sjc_celulas enable row level security;
alter table app.varredura_sjc_execucoes enable row level security;
create policy ver on app.varredura_sjc_celulas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy ver on app.varredura_sjc_execucoes for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
grant select on app.varredura_sjc_celulas, app.varredura_sjc_execucoes to authenticated;

-- Sem auditoria linha a linha: a célula muda toda noite e a execução já é o registro.

create or replace function app._varredura_empresa(p_empresa uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_empresa is null or not exists (select 1 from app.empresas where id = p_empresa) then
    raise exception 'Empresa desconhecida' using errcode = '22023';
  end if;
end $$;

create or replace function app.varredura_sjc_tabelas_lotes()
returns boolean language sql stable security definer set search_path = '' as $$
  select to_regclass('app.lotes_prefeitura') is not null and to_regclass('app.quadras_prefeitura') is not null
$$;

-- Catálogo da grade. Célula nova entra; a que já andou não muda de lugar.
-- p_celulas: [{id, ordem, x0, y0, x1, y1, lat, lng, densidade}]
create or replace function app.varredura_sjc_garantir_celulas(p_empresa uuid, p_celulas jsonb)
returns int language plpgsql security definer set search_path = '' as $$
declare c jsonb; n int := 0;
begin
  perform app._varredura_empresa(p_empresa);
  if jsonb_typeof(coalesce(p_celulas, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_celulas) > 1000 then
    raise exception 'Lista de células inválida' using errcode = '22023';
  end if;
  for c in select * from jsonb_array_elements(p_celulas) loop
    if coalesce(c->>'id', '') !~ '^[a-z0-9_]+$' or length(c->>'id') > 80
       or jsonb_typeof(c->'ordem') <> 'number' or jsonb_typeof(c->'x0') <> 'number' or jsonb_typeof(c->'y0') <> 'number'
       or jsonb_typeof(c->'x1') <> 'number' or jsonb_typeof(c->'y1') <> 'number'
       or jsonb_typeof(c->'lat') <> 'number' or jsonb_typeof(c->'lng') <> 'number'
       or (c->>'x0')::numeric >= (c->>'x1')::numeric or (c->>'y0')::numeric >= (c->>'y1')::numeric then
      raise exception 'Célula inválida: %', coalesce(c->>'id', '?') using errcode = '22023';
    end if;
    insert into app.varredura_sjc_celulas (empresa_id, id, ordem, x0, y0, x1, y1, lat, lng, densidade)
    values (p_empresa, c->>'id', (c->>'ordem')::int, (c->>'x0')::numeric, (c->>'y0')::numeric, (c->>'x1')::numeric, (c->>'y1')::numeric,
            (c->>'lat')::numeric, (c->>'lng')::numeric, nullif(c->>'densidade', '')::numeric)
    on conflict (empresa_id, id) do update
      set ordem = excluded.ordem, densidade = excluded.densidade
      where app.varredura_sjc_celulas.situacao = 'pendente';
    n := n + 1;
  end loop;
  return n;
end $$;

-- Abre a noite. Execução que ficou aberta (o job caiu) vira "queda".
-- Célula em andamento volta para pendente, para a próxima noite retomar.
create or replace function app.varredura_sjc_abrir_execucao(p_empresa uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_id bigint;
begin
  perform app._varredura_empresa(p_empresa);
  update app.varredura_sjc_execucoes
     set encerrada_em = now(), motivo = 'queda',
         detalhe = coalesce(detalhe, 'a execução anterior não encerrou (o job caiu)')
   where empresa_id = p_empresa and encerrada_em is null;
  update app.varredura_sjc_celulas
     set situacao = 'pendente'
   where empresa_id = p_empresa and situacao = 'em_andamento';
  insert into app.varredura_sjc_execucoes (empresa_id) values (p_empresa) returning id into v_id;
  return v_id;
end $$;

create or replace function app.varredura_sjc_anotar_execucao(p_id bigint, p_consultas int, p_novos int, p_atualizados int, p_apagados int, p_quadras int, p_celulas int)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update app.varredura_sjc_execucoes
     set consultas = greatest(p_consultas, 0), lotes_novos = greatest(p_novos, 0), lotes_atualizados = greatest(p_atualizados, 0),
         lotes_apagados = greatest(p_apagados, 0), quadras_montadas = greatest(p_quadras, 0), celulas_concluidas = greatest(p_celulas, 0)
   where id = p_id and encerrada_em is null;
  if not found then raise exception 'Execução não está aberta' using errcode = 'P0002'; end if;
end $$;

create or replace function app.varredura_sjc_fechar_execucao(p_id bigint, p_motivo text, p_consultas int, p_novos int, p_atualizados int, p_apagados int, p_quadras int, p_celulas int, p_detalhe text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_motivo not in ('horario', 'concluida', 'bloqueio', 'erros', 'queda') then
    raise exception 'Motivo desconhecido' using errcode = '22023';
  end if;
  update app.varredura_sjc_execucoes
     set encerrada_em = now(), motivo = p_motivo, detalhe = nullif(trim(p_detalhe), ''),
         consultas = greatest(p_consultas, 0), lotes_novos = greatest(p_novos, 0), lotes_atualizados = greatest(p_atualizados, 0),
         lotes_apagados = greatest(p_apagados, 0), quadras_montadas = greatest(p_quadras, 0), celulas_concluidas = greatest(p_celulas, 0)
   where id = p_id and encerrada_em is null;
  if not found then raise exception 'Execução não está aberta' using errcode = 'P0002'; end if;
end $$;

-- A próxima célula pendente, da ordem menor para a maior. Trava a linha.
create or replace function app.varredura_sjc_proxima_celula(p_empresa uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r app.varredura_sjc_celulas;
begin
  perform app._varredura_empresa(p_empresa);
  select * into r from app.varredura_sjc_celulas
   where empresa_id = p_empresa and situacao = 'pendente'
   order by ordem, id
   limit 1
   for update skip locked;
  if not found then return null; end if;
  update app.varredura_sjc_celulas
     set situacao = 'em_andamento', tentativas = tentativas + 1, iniciada_em = coalesce(iniciada_em, now()), erro = null
   where empresa_id = p_empresa and id = r.id
   returning * into r;
  return jsonb_build_object('id', r.id, 'ordem', r.ordem, 'x0', r.x0, 'y0', r.y0, 'x1', r.x1, 'y1', r.y1, 'tentativas', r.tentativas);
end $$;

create or replace function app.varredura_sjc_fechar_celula(p_empresa uuid, p_id text, p_situacao text, p_consultas int, p_lotes int, p_erro text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app._varredura_empresa(p_empresa);
  if p_situacao not in ('pendente', 'concluida', 'vazia') then
    raise exception 'Situação inválida' using errcode = '22023';
  end if;
  update app.varredura_sjc_celulas
     set situacao = p_situacao,
         consultas = consultas + greatest(coalesce(p_consultas, 0), 0),
         lotes = greatest(lotes, coalesce(p_lotes, 0)),
         concluida_em = case when p_situacao in ('concluida', 'vazia') then now() else null end,
         erro = nullif(trim(p_erro), '')
   where empresa_id = p_empresa and id = p_id and situacao = 'em_andamento';
  if not found then raise exception 'Célula não está em andamento' using errcode = 'P0002'; end if;
end $$;

-- Lotes conferidos há menos de 90 dias cujo retângulo cruza a área (UTM).
create or replace function app.varredura_sjc_lotes_conhecidos(p_empresa uuid, p_base text, p_x0 numeric, p_y0 numeric, p_x1 numeric, p_y1 numeric)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform app._varredura_empresa(p_empresa);
  if to_regclass('app.lotes_prefeitura') is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('inscricao', s.inscricao_norm, 'quadra', s.quadra, 'anel', s.anel))
    from (
      select inscricao_norm, quadra, anel from app.lotes_prefeitura
       where empresa_id = p_empresa and base = p_base
         and x0 <= p_x1 and x1 >= p_x0 and y0 <= p_y1 and y1 >= p_y0
         and conferido_em >= now() - interval '90 days'
       limit 1000
    ) s
  ), '[]'::jsonb);
end $$;

-- Das quadras pedidas, as montadas há menos de 90 dias e os lotes delas.
create or replace function app.varredura_sjc_quadras_prontas(p_empresa uuid, p_base text, p_quadras text[])
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_q text[];
begin
  perform app._varredura_empresa(p_empresa);
  if to_regclass('app.quadras_prefeitura') is null or to_regclass('app.lotes_prefeitura') is null then
    return '{"prontas":[],"lotes":[]}'::jsonb;
  end if;
  select coalesce(array_agg(distinct regexp_replace(q, '\D', '', 'g')), '{}') into v_q
    from unnest(coalesce(p_quadras, '{}')) q
   where regexp_replace(q, '\D', '', 'g') <> '';
  return jsonb_build_object(
    'prontas', coalesce((
      select jsonb_agg(quadra) from app.quadras_prefeitura
       where empresa_id = p_empresa and base = p_base and quadra = any (v_q) and montada_em >= now() - interval '90 days'
    ), '[]'::jsonb),
    'lotes', coalesce((
      select jsonb_agg(jsonb_build_object('inscricao', inscricao_norm, 'quadra', quadra, 'anel', anel))
        from app.lotes_prefeitura
       where empresa_id = p_empresa and base = p_base and quadra in (
         select quadra from app.quadras_prefeitura
          where empresa_id = p_empresa and base = p_base and quadra = any (v_q) and montada_em >= now() - interval '90 days')
       limit 3000
    ), '[]'::jsonb)
  );
end $$;

-- Mesma semântica de app.guardar_lotes_prefeitura, para o service_role.
-- Devolve {"gravados","novos","atualizados","apagados"}.
create or replace function app.varredura_sjc_guardar(p_empresa uuid, p_base text, p_lotes jsonb, p_quadras text[] default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare l jsonb; n int := 0; v_novos int := 0; v_atu int := 0; v_apag int := 0; v_n int;
        v_ic text; v_q text; v_an jsonb; xs numeric[]; ys numeric[];
begin
  perform app._varredura_empresa(p_empresa);
  if to_regclass('app.lotes_prefeitura') is null or to_regclass('app.quadras_prefeitura') is null then
    raise exception 'Faltam app.lotes_prefeitura e app.quadras_prefeitura (migration do PR 290)' using errcode = '55000';
  end if;
  if not exists (select 1 from app.bases_cadastrais where codigo = p_base) then
    raise exception 'Base cadastral desconhecida' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lotes, '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_lotes, '[]'::jsonb)) > 3000 then
    raise exception 'Lista de lotes inválida' using errcode = '22023';
  end if;
  if coalesce(array_length(p_quadras, 1), 0) > 20 then
    raise exception 'Quadras demais de uma vez' using errcode = '22023';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lotes, '[]'::jsonb)) loop
    continue when coalesce(l->>'da_base', '') = 'true';
    v_ic := regexp_replace(coalesce(l->>'inscricao', ''), '\D', '', 'g');
    v_q := regexp_replace(coalesce(l->>'quadra', ''), '\D', '', 'g');
    v_an := l->'anel';
    if v_ic = '' or v_q = '' or jsonb_typeof(v_an) <> 'array' or jsonb_array_length(v_an) < 4 or jsonb_array_length(v_an) > 2000
       or exists (select 1 from jsonb_array_elements(v_an) p where jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2
                  or jsonb_typeof(p->0) <> 'number' or jsonb_typeof(p->1) <> 'number') then
      raise exception 'Lote inválido: %', coalesce(l->>'inscricao', '?') using errcode = '22023';
    end if;
    if exists (select 1 from app.lotes_prefeitura where empresa_id = p_empresa and base = p_base and inscricao_norm = v_ic) then
      v_atu := v_atu + 1;
    else
      v_novos := v_novos + 1;
    end if;
    select array_agg((p->>0)::numeric), array_agg((p->>1)::numeric) into xs, ys from jsonb_array_elements(v_an) p;
    insert into app.lotes_prefeitura (empresa_id, base, inscricao_norm, quadra, anel, x0, y0, x1, y1, area_m2)
    values (p_empresa, p_base, v_ic, v_q, v_an,
            (select min(x) from unnest(xs) x), (select min(y) from unnest(ys) y),
            (select max(x) from unnest(xs) x), (select max(y) from unnest(ys) y),
            nullif((l->>'area_m2')::numeric, 0))
    on conflict (empresa_id, base, inscricao_norm) do update
      set quadra = excluded.quadra, anel = excluded.anel, x0 = excluded.x0, y0 = excluded.y0, x1 = excluded.x1, y1 = excluded.y1,
          area_m2 = excluded.area_m2, conferido_em = now();
    n := n + 1;
  end loop;
  if coalesce(array_length(p_quadras, 1), 0) > 0 then
    delete from app.lotes_prefeitura lp
     where lp.empresa_id = p_empresa and lp.base = p_base
       and lp.quadra in (select regexp_replace(q, '\D', '', 'g') from unnest(p_quadras) q where regexp_replace(q, '\D', '', 'g') <> '')
       and lp.inscricao_norm not in (
         select regexp_replace(coalesce(e->>'inscricao', ''), '\D', '', 'g') from jsonb_array_elements(coalesce(p_lotes, '[]'::jsonb)) e);
    get diagnostics v_n = row_count;
    v_apag := v_n;
    insert into app.quadras_prefeitura (empresa_id, base, quadra, lotes)
    select p_empresa, p_base, s.qd,
           (select count(*) from app.lotes_prefeitura where empresa_id = p_empresa and base = p_base and quadra = s.qd)
      from (select distinct regexp_replace(q, '\D', '', 'g') as qd from unnest(p_quadras) q) s
     where s.qd <> ''
    on conflict (empresa_id, base, quadra) do update
      set montada_em = now(), montada_por = auth.uid(), lotes = excluded.lotes;
  end if;
  return jsonb_build_object('gravados', n, 'novos', v_novos, 'atualizados', v_atu, 'apagados', v_apag);
end $$;

-- Resumo por noite e o progresso da grade. lotes_na_base fica nulo até existirem as tabelas do PR 290.
-- Membro da empresa lê a sua; service_role (e o SQL editor) lê a empresa pedida.
create or replace function app.varredura_sjc_relatorio(p_empresa uuid)
returns table (
  execucao_id bigint,
  iniciada_em timestamptz,
  encerrada_em timestamptz,
  motivo text,
  consultas int,
  lotes_novos int,
  lotes_atualizados int,
  lotes_apagados int,
  quadras_montadas int,
  celulas_nesta_noite int,
  pct_celulas numeric,
  celulas_total int,
  celulas_feitas int,
  lotes_na_base bigint
) language plpgsql stable security definer set search_path = '' as $$
declare v_total int; v_feitas int; v_pct numeric; v_lotes bigint;
begin
  perform app._varredura_empresa(p_empresa);
  if auth.uid() is not null and p_empresa not in (select app.minhas_empresas()) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;
  select count(*)::int, (count(*) filter (where situacao in ('concluida', 'vazia')))::int
    into v_total, v_feitas
    from app.varredura_sjc_celulas where empresa_id = p_empresa;
  v_pct := case when v_total = 0 then 0 else round(100.0 * v_feitas / v_total, 1) end;
  if to_regclass('app.lotes_prefeitura') is null then
    v_lotes := null;
  else
    execute 'select count(*) from app.lotes_prefeitura where empresa_id = $1 and base = ''geosanja'''
      into v_lotes using p_empresa;
  end if;
  if not exists (select 1 from app.varredura_sjc_execucoes where empresa_id = p_empresa) then
    return query select null::bigint, null::timestamptz, null::timestamptz, null::text,
      0, 0, 0, 0, 0, 0, v_pct, v_total, v_feitas, v_lotes;
    return;
  end if;
  return query
  select e.id, e.iniciada_em, e.encerrada_em, e.motivo, e.consultas, e.lotes_novos, e.lotes_atualizados, e.lotes_apagados,
         e.quadras_montadas, e.celulas_concluidas, v_pct, v_total, v_feitas, v_lotes
    from app.varredura_sjc_execucoes e
   where e.empresa_id = p_empresa
   order by e.iniciada_em desc;
end $$;

revoke all on function app._varredura_empresa(uuid) from public;
revoke all on function app.varredura_sjc_tabelas_lotes() from public, anon, authenticated;
revoke all on function app.varredura_sjc_garantir_celulas(uuid, jsonb) from public, anon, authenticated;
revoke all on function app.varredura_sjc_abrir_execucao(uuid) from public, anon, authenticated;
revoke all on function app.varredura_sjc_anotar_execucao(bigint, int, int, int, int, int, int) from public, anon, authenticated;
revoke all on function app.varredura_sjc_fechar_execucao(bigint, text, int, int, int, int, int, int, text) from public, anon, authenticated;
revoke all on function app.varredura_sjc_proxima_celula(uuid) from public, anon, authenticated;
revoke all on function app.varredura_sjc_fechar_celula(uuid, text, text, int, int, text) from public, anon, authenticated;
revoke all on function app.varredura_sjc_lotes_conhecidos(uuid, text, numeric, numeric, numeric, numeric) from public, anon, authenticated;
revoke all on function app.varredura_sjc_quadras_prontas(uuid, text, text[]) from public, anon, authenticated;
revoke all on function app.varredura_sjc_guardar(uuid, text, jsonb, text[]) from public, anon, authenticated;
revoke all on function app.varredura_sjc_relatorio(uuid) from public, anon;

grant execute on function app.varredura_sjc_tabelas_lotes() to service_role;
grant execute on function app.varredura_sjc_garantir_celulas(uuid, jsonb) to service_role;
grant execute on function app.varredura_sjc_abrir_execucao(uuid) to service_role;
grant execute on function app.varredura_sjc_anotar_execucao(bigint, int, int, int, int, int, int) to service_role;
grant execute on function app.varredura_sjc_fechar_execucao(bigint, text, int, int, int, int, int, int, text) to service_role;
grant execute on function app.varredura_sjc_proxima_celula(uuid) to service_role;
grant execute on function app.varredura_sjc_fechar_celula(uuid, text, text, int, int, text) to service_role;
grant execute on function app.varredura_sjc_lotes_conhecidos(uuid, text, numeric, numeric, numeric, numeric) to service_role;
grant execute on function app.varredura_sjc_quadras_prontas(uuid, text, text[]) to service_role;
grant execute on function app.varredura_sjc_guardar(uuid, text, jsonb, text[]) to service_role;
grant execute on function app.varredura_sjc_relatorio(uuid) to authenticated, service_role;
