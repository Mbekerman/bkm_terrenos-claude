-- =====================================================================
-- BKM Terrenos · 0009 · monitor de mercado
-- Estende a concorrência (empresa → empreendimento) com unidade, vigência
-- de preço e situação, e venda. Cada unidade é gravada e lida individualmente.
-- Não há agrupamento (decisão do Moisés, 24/out/2026).
--
-- Decisões de modelagem (spec definitiva do Moisés, 24/out/2026):
-- * Fonte aceita orulo_api, orulo_planilha, orulo_login e manual.
-- * Coleta única por (empresa, fonte, tipo, referencia). tipo é
--   completa_mensal ou lancamentos. bruto_caminho =
--   {empresa}/mercado/{referencia}-{tipo}.json.gz. Rodar de novo a mesma
--   chave desfaz o que aquela coleta gravou e recomeça.
-- * Venda, vínculo pendente e remoção nascem em fechar_coleta_mercado:
--   a cobertura só é conhecida ali. A importação grava cadastro, preço e
--   vigência das unidades que vieram. Incompleta não gera venda nem marca
--   remoção, e não fecha a vigência de quem faltou.
-- * A mensal completa compara a situação da mensal completa anterior com
--   a desta. Uma incompleta no meio não apaga a passagem.
-- * Preço estimado de antes_do_monitor: mediana do preço/m² das disponíveis
--   do mesmo empreendimento, mesmos dormitórios e vagas, área até 3% de
--   diferença, vezes a área da unidade. Os 3% são da regra da venda.
-- * residencial da unidade é calculado (tipo + nr_conta_como_residencial),
--   não é coluna generated: depende de outra tabela. Recalcula quando a
--   config muda.
-- * Similaridade de nome é Jaccard de trigramas (borda de dois espaços,
--   como o pg_trgm), em SQL, para o teste não depender da extensão.
-- * Empreendimento manual não é alterado. observacao e ativo não são
--   sobrescritos. Tipologia e preço lançados à mão ficam onde estão.
-- * Studio "- NR": nr_conta_como_residencial (padrão true). Ponto em aberto.
-- * tipologia_fonte guarda o texto da fonte e não entra em conta.
-- * Cobertura e a mensal completa anterior são da mesma fonte: Órulo API,
--   planilha e login são séries diferentes.
-- * A foto da passagem de venda é a última situação gravada por uma mensal
--   completa. Incompleta no meio não gera venda nem remoção, e não apaga
--   a passagem vista na mensal seguinte.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Funções de apoio
-- ---------------------------------------------------------------------
-- Maiúsculas, sem acento, sem as palavras TORRE, BLOCO, EDIFICIO e ED, sem espaço.
create or replace function app.mercado_norm_rotulo(p text)
returns text
language sql immutable parallel safe set search_path = '' as $$
  select coalesce(nullif(regexp_replace(regexp_replace(upper(translate(coalesce(p, ''),
           'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
           'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
           '\m(EDIFICIO|TORRE|BLOCO|ED)\M', '', 'g'), '[[:space:]]+', '', 'g'), ''), '')
$$;

-- Jaccard dos trigramas, com dois espaços antes e um depois (a conta do pg_trgm).
create or replace function app.similaridade_trigrama(a text, b text)
returns numeric
language sql immutable set search_path = '' as $$
  with na as (select '  ' || lower(btrim(coalesce(a, ''))) || ' ' as s),
       nb as (select '  ' || lower(btrim(coalesce(b, ''))) || ' ' as s),
       ta as (
         select substring((select s from na) from i for 3) as g
         from generate_series(1, greatest(length((select s from na)) - 2, 0)) i
       ),
       tb as (
         select substring((select s from nb) from i for 3) as g
         from generate_series(1, greatest(length((select s from nb)) - 2, 0)) i
       ),
       inter as (select count(*)::numeric as c from (select g from ta intersect select g from tb) z),
       uni as (select count(*)::numeric as c from (select g from ta union select g from tb) z)
  select case when (select c from uni) = 0 then 0 else round((select c from inter) / (select c from uni), 4) end
$$;

create or replace function app.mercado_distancia_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns numeric
language sql immutable parallel safe set search_path = '' as $$
  select (2 * 6371000 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2)
         + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::numeric
$$;

create or replace function app._mercado_pode(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select app.eh_administrador(p_empresa)
      or coalesce(current_setting('request.jwt.claim.role', true), '') = 'service_role'
$$;

-- Residencial sai do tipo cadastrado. Studio "- NR" obedece a config, não à linha do studio.
create or replace function app._mercado_residencial(p_empresa uuid, p_codigo text, p_studio_nr boolean)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_codigo is null or p_codigo = 'nao_informado' then return false; end if;
  if p_studio_nr then
    return coalesce((select nr_conta_como_residencial from app.mercado_config where empresa_id = p_empresa), true);
  end if;
  return coalesce((select residencial from app.mercado_tipos_unidade
                   where empresa_id = p_empresa and codigo = p_codigo and ativo), false);
end $$;

-- Classifica o texto da fonte. Desconhecido vira nao_informado (fora das contas).
create or replace function app._mercado_classificar_tipo(p_empresa uuid, p_tipo text)
returns table (codigo text, fonte text, studio_nr boolean, residencial boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  v text := lower(btrim(translate(coalesce(p_tipo, ''),
             'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
             'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')));
  v_esp text;
  v_chave text;
  v_codigo text;
  v_nr boolean := false;
begin
  v := regexp_replace(v, '[[:space:]]+', ' ', 'g');
  v_esp := split_part(v, ' ', 1);
  v_chave := regexp_replace(v, '[^a-z0-9]+', '', 'g');
  if v ~ 'studio' and v ~ '(^|[^a-z0-9])nr($|[^a-z0-9])' then
    v_codigo := 'studio';
    v_nr := true;
  else
    select t.codigo into v_codigo from app.mercado_tipos_unidade t
     where t.empresa_id = p_empresa and t.ativo
       and t.codigo in (v_chave, v_esp, v)
     order by case when t.codigo = v_chave then 0 when t.codigo = v then 1 else 2 end
     limit 1;
    if v_codigo is null then v_codigo := 'nao_informado'; end if;
  end if;
  codigo := v_codigo;
  fonte := nullif(btrim(coalesce(p_tipo, '')), '');
  studio_nr := v_nr;
  residencial := app._mercado_residencial(p_empresa, v_codigo, v_nr);
  return next;
end $$;

create or replace function app._mercado_passa_filtro(
  p_empresa uuid, p_tipo text, p_finalidade text, p_situacao text,
  p_lancamento date, p_entrega date, p_municipio uuid, p_referencia date,
  p_tem_lista boolean, p_tem_residencial boolean)
returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare
  v_meses_lanc int;
  v_meses_rec int;
  v_muns uuid[];
begin
  select meses_lancamento, meses_recem_entregue, municipios
    into v_meses_lanc, v_meses_rec, v_muns
    from app.mercado_config where empresa_id = p_empresa;
  if not found then return false; end if;
  if p_situacao = 'usado' or p_tipo is distinct from 'vertical' then return false; end if;
  if p_finalidade not in ('residencial', 'misto') then return false; end if;
  if p_municipio is null or not (p_municipio = any(v_muns)) then return false; end if;
  -- Sem unidade residencial fica de fora sempre, mesmo que a lista não tenha vindo.
  if not p_tem_residencial then return false; end if;
  return p_situacao in ('lancamento', 'breve_lancamento', 'em_obras')
      or (p_lancamento is not null and p_lancamento >= (p_referencia - make_interval(months => v_meses_lanc))::date)
      or (p_situacao = 'pronto' and p_entrega is not null and p_entrega <= p_referencia
          and p_entrega >= (p_referencia - make_interval(months => v_meses_rec))::date);
end $$;

-- ---------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------
create table app.mercado_config (
  id                         uuid primary key default gen_random_uuid(),
  empresa_id                 uuid not null unique references app.empresas(id),
  meses_recem_entregue       int not null default 24 check (meses_recem_entregue > 0),
  meses_lancamento           int not null default 6 check (meses_lancamento > 0),
  dias_preco_lancamento      int not null default 60 check (dias_preco_lancamento >= 0),
  dias_tabela_desatualizada  int not null default 45 check (dias_tabela_desatualizada >= 0),
  cobertura_minima_pct       numeric not null default 90 check (cobertura_minima_pct > 0 and cobertura_minima_pct <= 100),
  -- Studio "- NR": ponto em aberto. Padrão conta como residencial.
  nr_conta_como_residencial  boolean not null default true,
  municipios                 uuid[] not null default '{}'
);

create table app.mercado_tipos_unidade (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  codigo      text not null check (codigo ~ '^[a-z0-9_]+$'),
  residencial boolean not null,
  ativo       boolean not null default true,
  unique (empresa_id, codigo)
);

create table app.mercado_coletas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  fonte         text not null check (fonte in ('orulo_api','orulo_planilha','orulo_login','manual')),
  tipo          text not null check (tipo in ('completa_mensal','lancamentos')),
  referencia    date not null,
  iniciada_em   timestamptz not null default clock_timestamp(),
  concluida_em  timestamptz,
  situacao      text not null default 'rodando' check (situacao in ('rodando','completa','incompleta','falhou')),
  esperados     int check (esperados is null or esperados >= 0),
  coletados     int not null default 0 check (coletados >= 0),
  unidades      int not null default 0 check (unidades >= 0),
  falhas        jsonb not null default '[]',
  -- tipos crus que caíram em nao_informado; o relatório da coleta
  tipos_desconhecidos text[] not null default '{}',
  bruto_caminho text,
  unique (empresa_id, fonte, tipo, referencia)
);

alter table app.concorrencia_empreendimentos
  add constraint concorrencia_emp_primeira_coleta_fk foreign key (primeira_coleta_id) references app.mercado_coletas(id),
  add constraint concorrencia_emp_ultima_coleta_fk foreign key (ultima_coleta_id) references app.mercado_coletas(id);

-- Id de fora, por fonte. A unidade do Órulo logado não tem id: a linha não é criada e o casamento é torre + número.
create table app.mercado_ids_externos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  entidade    text not null check (entidade in ('concorrente','empreendimento','unidade')),
  entidade_id uuid not null,
  fonte       text not null check (fonte in ('orulo_api','orulo_planilha','orulo_login','manual')),
  id_externo  text not null check (btrim(id_externo) <> ''),
  unique (empresa_id, fonte, entidade, id_externo),
  unique (empresa_id, fonte, entidade, entidade_id)
);

create table app.mercado_empreendimento_estados (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references app.empresas(id),
  empreendimento_id    uuid not null references app.concorrencia_empreendimentos(id) on delete cascade,
  desde_coleta_id      uuid not null references app.mercado_coletas(id),
  ate_coleta_id        uuid references app.mercado_coletas(id),
  situacao             text not null check (situacao in ('lancamento','breve_lancamento','em_obras','pronto','usado','nao_informado')),
  data_lancamento      date,
  previsao_entrega     date,
  unidades_informadas  int check (unidades_informadas is null or unidades_informadas >= 0),
  estoque_informado    int check (estoque_informado is null or estoque_informado >= 0),
  tabela_atualizada_em date,
  no_filtro            boolean not null,
  marcas               text[] not null default '{}'
);
create unique index mercado_emp_estado_vigente on app.mercado_empreendimento_estados (empreendimento_id) where ate_coleta_id is null;
create index on app.mercado_empreendimento_estados (desde_coleta_id);

create table app.mercado_unidades (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references app.empresas(id),
  empreendimento_id   uuid not null references app.concorrencia_empreendimentos(id) on delete cascade,
  torre               text,
  numero              text,
  torre_norm          text not null default '',
  numero_norm         text not null default '',
  andar               smallint,
  area_privativa_m2   numeric check (area_privativa_m2 is null or area_privativa_m2 > 0),
  dormitorios         smallint check (dormitorios is null or dormitorios between 0 and 20),
  suites              smallint check (suites is null or suites >= 0),
  vagas               smallint check (vagas is null or vagas >= 0),
  tipologia_fonte     text,
  tipo_unidade        text not null default 'nao_informado',
  tipo_fonte          text,
  studio_nr           boolean not null default false,
  residencial         boolean not null default false,
  preco_primeiro      numeric check (preco_primeiro is null or preco_primeiro > 0),
  preco_primeiro_em   date,
  preco_de_lancamento boolean not null default false,
  primeira_coleta_id  uuid not null references app.mercado_coletas(id),
  ultima_coleta_id    uuid references app.mercado_coletas(id),
  removida_coleta_id  uuid references app.mercado_coletas(id),
  vinculo_pendente_id uuid references app.mercado_unidades(id) on delete set null,
  marcas              text[] not null default '{}',
  unique (empreendimento_id, torre_norm, numero_norm)
);
create index on app.mercado_unidades (empresa_id);
create index on app.mercado_unidades (ultima_coleta_id);

create table app.mercado_unidade_estados (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  unidade_id       uuid not null references app.mercado_unidades(id) on delete cascade,
  desde_coleta_id  uuid not null references app.mercado_coletas(id),
  ate_coleta_id    uuid references app.mercado_coletas(id),
  situacao         text not null check (situacao in ('disponivel','reservada','vendida','indisponivel','nao_informado')),
  preco            numeric check (preco is null or preco > 0),
  preco_original   numeric check (preco_original is null or preco_original > 0),
  marcas           text[] not null default '{}'
);
create unique index mercado_un_estado_vigente on app.mercado_unidade_estados (unidade_id) where ate_coleta_id is null;
create index on app.mercado_unidade_estados (desde_coleta_id);

create table app.mercado_vendas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  unidade_id         uuid not null references app.mercado_unidades(id) on delete cascade,
  coleta_id          uuid not null references app.mercado_coletas(id),
  vendida_de         date not null,
  vendida_ate        date not null,
  preco              numeric check (preco is null or preco > 0),
  origem_preco       text not null check (origem_preco in ('ultimo_visto','estimado')),
  antes_do_monitor   boolean not null default false,
  desfeita_coleta_id uuid references app.mercado_coletas(id)
);
create unique index mercado_vendas_aberta on app.mercado_vendas (unidade_id) where desfeita_coleta_id is null;
create index on app.mercado_vendas (coleta_id);

-- Empreendimento manual perto e com nome parecido: sugestão, sem vínculo automático.
create table app.mercado_sugestoes_vinculo (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  empreendimento_id  uuid not null references app.concorrencia_empreendimentos(id) on delete cascade,
  manual_id          uuid not null references app.concorrencia_empreendimentos(id) on delete cascade,
  similaridade       numeric not null,
  distancia_m        numeric not null,
  coleta_id          uuid not null references app.mercado_coletas(id),
  unique (empreendimento_id, manual_id)
);

-- ---------------------------------------------------------------------
-- RLS: leitura pelo membro. Escrita só pelas funções security definer.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'mercado_config','mercado_tipos_unidade','mercado_coletas','mercado_ids_externos',
    'mercado_empreendimento_estados','mercado_unidades','mercado_unidade_estados',
    'mercado_vendas','mercado_sugestoes_vinculo']
  loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on app.%I for each row execute function app.tg_auditoria()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Configuração (administrador)
-- ---------------------------------------------------------------------
create or replace function app._mercado_semear(p_empresa uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into app.mercado_config (empresa_id, municipios)
  select p_empresa, coalesce((select array_agg(id) from app.municipios where codigo_ibge in ('3550308','3549904')), '{}')
  where not exists (select 1 from app.mercado_config where empresa_id = p_empresa);

  insert into app.mercado_tipos_unidade (empresa_id, codigo, residencial)
  select p_empresa, t.codigo, t.residencial
  from (values
    ('apartamento', true), ('studio', true), ('cobertura', true), ('garden', true), ('duplex', true),
    ('loja', false), ('sala', false), ('laje', false), ('vaga', false), ('deposito', false)
  ) as t(codigo, residencial)
  where not exists (
    select 1 from app.mercado_tipos_unidade x where x.empresa_id = p_empresa and x.codigo = t.codigo);
end $$;

create or replace function app.tg_empresa_mercado()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform app._mercado_semear(new.id);
  return new;
end $$;
create trigger t_mercado after insert on app.empresas for each row execute function app.tg_empresa_mercado();

-- Empresas que já existirem quando esta migration rodar (nenhuma, enquanto não houver banco).
select app._mercado_semear(id) from app.empresas;

create or replace function app._mercado_recalcular_residencial(p_empresa uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.mercado_unidades u
     set residencial = app._mercado_residencial(u.empresa_id, u.tipo_unidade, u.studio_nr)
   where u.empresa_id = p_empresa
     and u.residencial is distinct from app._mercado_residencial(u.empresa_id, u.tipo_unidade, u.studio_nr);
end $$;

create or replace function app.salvar_config_mercado(p_empresa uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare c app.mercado_config;
begin
  if auth.uid() is null or not app.eh_administrador(p_empresa) then
    raise exception 'Só o administrador muda a configuração' using errcode = '42501';
  end if;
  perform app._mercado_semear(p_empresa);
  update app.mercado_config set
    meses_recem_entregue = coalesce((p_dados->>'meses_recem_entregue')::int, meses_recem_entregue),
    meses_lancamento = coalesce((p_dados->>'meses_lancamento')::int, meses_lancamento),
    dias_preco_lancamento = coalesce((p_dados->>'dias_preco_lancamento')::int, dias_preco_lancamento),
    dias_tabela_desatualizada = coalesce((p_dados->>'dias_tabela_desatualizada')::int, dias_tabela_desatualizada),
    cobertura_minima_pct = coalesce((p_dados->>'cobertura_minima_pct')::numeric, cobertura_minima_pct),
    nr_conta_como_residencial = coalesce((p_dados->>'nr_conta_como_residencial')::boolean, nr_conta_como_residencial),
    municipios = case when p_dados ? 'municipios' then coalesce((
                    select array_agg(x::uuid) from jsonb_array_elements_text(p_dados->'municipios') x), '{}')
                  else municipios end
  where empresa_id = p_empresa
  returning * into c;
  if p_dados ? 'nr_conta_como_residencial' then
    perform app._mercado_recalcular_residencial(p_empresa);
  end if;
  if p_dados ? 'dias_preco_lancamento' then
    update app.mercado_unidades u
       set preco_de_lancamento = u.preco_primeiro_em <= e.data_lancamento + c.dias_preco_lancamento
      from app.concorrencia_empreendimentos e
     where u.empreendimento_id = e.id and u.empresa_id = p_empresa
       and u.preco_primeiro_em is not null and e.data_lancamento is not null
       and u.preco_de_lancamento is distinct from (u.preco_primeiro_em <= e.data_lancamento + c.dias_preco_lancamento);
  end if;
end $$;

create or replace function app.salvar_tipo_unidade_mercado(p_empresa uuid, p_codigo text, p_residencial boolean, p_ativo boolean default true)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not app.eh_administrador(p_empresa) then
    raise exception 'Só o administrador muda a configuração' using errcode = '42501';
  end if;
  if p_codigo is null or p_codigo !~ '^[a-z0-9_]+$' then
    raise exception 'Código de tipo inválido' using errcode = '23514';
  end if;
  insert into app.mercado_tipos_unidade (empresa_id, codigo, residencial, ativo)
  values (p_empresa, p_codigo, p_residencial, coalesce(p_ativo, true))
  on conflict (empresa_id, codigo) do update
    set residencial = excluded.residencial, ativo = excluded.ativo;
  perform app._mercado_recalcular_residencial(p_empresa);
end $$;
-- ---------------------------------------------------------------------
-- Coleta: abrir (substitui a da mesma chave), desfazer, importar, fechar
-- ---------------------------------------------------------------------
create or replace function app._mercado_desfazer(p_coleta uuid)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_ref date;
  v_emp uuid;
begin
  select referencia, empresa_id into v_ref, v_emp from app.mercado_coletas where id = p_coleta;
  if not found then return; end if;

  if exists (
    select 1 from app.mercado_coletas o
    join app.mercado_coletas c on c.id = p_coleta
    where o.empresa_id = c.empresa_id and o.fonte = c.fonte and o.tipo = c.tipo
      and o.referencia > c.referencia)
  then
    raise exception 'Já existe coleta desta fonte e tipo depois desta data' using errcode = '23514';
  end if;

  update app.mercado_vendas set desfeita_coleta_id = null where desfeita_coleta_id = p_coleta;

  delete from app.mercado_ids_externos
   where entidade = 'unidade'
     and entidade_id in (select id from app.mercado_unidades where primeira_coleta_id = p_coleta);
  delete from app.mercado_ids_externos
   where entidade = 'empreendimento'
     and entidade_id in (select id from app.concorrencia_empreendimentos where primeira_coleta_id = p_coleta);

  delete from app.mercado_sugestoes_vinculo where coleta_id = p_coleta;

  -- Unidade nascida nesta coleta (mesmo de empreendimento que já existia) e o empreendimento nascido aqui.
  delete from app.mercado_unidades where primeira_coleta_id = p_coleta;
  delete from app.concorrencia_empreendimentos where primeira_coleta_id = p_coleta;

  delete from app.mercado_unidade_estados where desde_coleta_id = p_coleta;
  update app.mercado_unidade_estados set ate_coleta_id = null where ate_coleta_id = p_coleta;
  delete from app.mercado_empreendimento_estados where desde_coleta_id = p_coleta;
  update app.mercado_empreendimento_estados set ate_coleta_id = null where ate_coleta_id = p_coleta;

  delete from app.mercado_vendas where coleta_id = p_coleta;

  update app.mercado_unidades set removida_coleta_id = null where removida_coleta_id = p_coleta;

  update app.mercado_unidades u set ultima_coleta_id = s.desde_coleta_id
    from (
      select distinct on (e.unidade_id) e.unidade_id, e.desde_coleta_id
      from app.mercado_unidade_estados e
      join app.mercado_coletas c on c.id = e.desde_coleta_id
      order by e.unidade_id, c.referencia desc, e.id desc
    ) s
   where u.id = s.unidade_id and u.ultima_coleta_id = p_coleta;

  update app.mercado_unidades u
     set preco_primeiro = null, preco_primeiro_em = null, preco_de_lancamento = false
   where u.empresa_id = v_emp and u.preco_primeiro_em = v_ref
     and not exists (select 1 from app.mercado_unidade_estados e where e.unidade_id = u.id and e.preco is not null);

  update app.mercado_unidades u
     set preco_primeiro = x.preco, preco_primeiro_em = x.referencia
    from (
      select distinct on (e.unidade_id) e.unidade_id, e.preco, c.referencia
      from app.mercado_unidade_estados e
      join app.mercado_coletas c on c.id = e.desde_coleta_id
      where e.preco is not null and e.empresa_id = v_emp
      order by e.unidade_id, c.referencia, e.id
    ) x
   where u.id = x.unidade_id and u.empresa_id = v_emp and u.preco_primeiro_em = v_ref;

  update app.mercado_unidades u
     set preco_de_lancamento = (e.data_lancamento is not null
            and u.preco_primeiro_em <= e.data_lancamento + cfg.dias_preco_lancamento)
    from app.concorrencia_empreendimentos e
    join app.mercado_config cfg on cfg.empresa_id = e.empresa_id
   where u.empreendimento_id = e.id and u.empresa_id = v_emp and u.preco_primeiro_em = v_ref and u.preco_primeiro is not null;

  update app.concorrencia_empreendimentos e set ultima_coleta_id = s.desde_coleta_id
    from (
      select distinct on (st.empreendimento_id) st.empreendimento_id, st.desde_coleta_id
      from app.mercado_empreendimento_estados st
      join app.mercado_coletas c on c.id = st.desde_coleta_id
      order by st.empreendimento_id, c.referencia desc, st.id desc
    ) s
   where e.id = s.empreendimento_id and e.ultima_coleta_id = p_coleta;
end $$;

create or replace function app.abrir_coleta_mercado(
  p_empresa uuid, p_fonte text, p_tipo text, p_referencia date,
  p_esperados int default null, p_bruto_caminho text default null)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_caminho text;
begin
  if not app._mercado_pode(p_empresa) then
    raise exception 'Só o administrador abre a coleta do mercado' using errcode = '42501';
  end if;
  if p_fonte not in ('orulo_api','orulo_planilha','orulo_login','manual') then
    raise exception 'Fonte de mercado desconhecida' using errcode = '23514';
  end if;
  if p_tipo not in ('completa_mensal','lancamentos') then
    raise exception 'Tipo de coleta desconhecido' using errcode = '23514';
  end if;
  if p_referencia is null then
    raise exception 'A coleta precisa da data de referência' using errcode = '23514';
  end if;
  perform app._mercado_semear(p_empresa);
  v_caminho := coalesce(p_bruto_caminho,
    p_empresa::text || '/mercado/' || to_char(p_referencia, 'YYYY-MM-DD') || '-' || p_tipo || '.json.gz');

  select id into v_id from app.mercado_coletas
   where empresa_id = p_empresa and fonte = p_fonte and tipo = p_tipo and referencia = p_referencia;
  if found then
    perform app._mercado_desfazer(v_id);
    update app.mercado_coletas set
      situacao = 'rodando', iniciada_em = clock_timestamp(), concluida_em = null,
      esperados = p_esperados, coletados = 0, unidades = 0,
      falhas = '[]', tipos_desconhecidos = '{}', bruto_caminho = v_caminho
    where id = v_id;
  else
    insert into app.mercado_coletas (empresa_id, fonte, tipo, referencia, esperados, bruto_caminho)
    values (p_empresa, p_fonte, p_tipo, p_referencia, p_esperados, v_caminho)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function app._mercado_falha(p_coleta uuid, p_id text, p_motivo text, p_detalhe text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  update app.mercado_coletas c
     set falhas = c.falhas || jsonb_build_array(jsonb_build_object(
           'id_externo', coalesce(p_id, ''), 'motivo', p_motivo, 'detalhe', p_detalhe))
   where c.id = p_coleta
     and not exists (
       select 1 from jsonb_array_elements(c.falhas) e
        where e->>'id_externo' = coalesce(p_id, '') and e->>'motivo' = p_motivo);
end $$;

create or replace function app._mercado_num(p jsonb, p_chave text)
returns numeric
language sql immutable set search_path = '' as $$
  select case when p->>p_chave is null or btrim(p->>p_chave) = '' then null else (p->>p_chave)::numeric end
$$;

create or replace function app._mercado_data(p jsonb, p_chave text)
returns date
language sql immutable set search_path = '' as $$
  select case when p->>p_chave is null or btrim(p->>p_chave) = '' then null else (p->>p_chave)::date end
$$;

-- Um empreendimento da carga. O bloco de exceção de importar_mercado desfaz este item.
create or replace function app._mercado_importar_um(p_coleta uuid, p jsonb)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  col app.mercado_coletas;
  cfg app.mercado_config;
  v_inc jsonb := coalesce(p->'incorporadora', '{}');
  v_fonte_id text := nullif(btrim(coalesce(p->>'id_externo', '')), '');
  v_inc_id text := nullif(btrim(coalesce(v_inc->>'id_externo', '')), '');
  v_cnpj text;
  v_conc uuid;
  v_emp uuid;
  v_mun uuid;
  v_tipo text;
  v_fin text;
  v_sit text;
  v_prog text;
  v_lanc date;
  v_ent date;
  v_tab date;
  v_lat float8;
  v_lng float8;
  v_torres smallint;
  v_unid int;
  v_est int;
  v_marcas text[] := '{}';
  v_tem_lista boolean;
  v_tem_res boolean := false;
  v_passa boolean;
  v_ja boolean;
  u jsonb;
  cls record;
  v_norm_torre text;
  v_norm_num text;
  v_preco numeric;
  v_preco_orig numeric;
  v_marcas_u text[] ;
  v_area numeric;
  v_uid uuid;
  v_estado uuid;
  v_sit_u text;
  v_desde uuid;
  r record;
  v_unidades_vistas int := 0;
begin
  select * into col from app.mercado_coletas where id = p_coleta;
  select * into cfg from app.mercado_config where empresa_id = col.empresa_id;

  v_cnpj := regexp_replace(coalesce(v_inc->>'cnpj', ''), '\D', '', 'g');
  if length(v_cnpj) <> 14 then v_cnpj := null; end if;

  v_tipo := lower(translate(coalesce(nullif(btrim(p->>'tipo'), ''), 'nao_informado'),
             'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'));
  if v_tipo not in ('vertical','horizontal','unidade_avulsa','sobrado','loteamento','industrial','galpao','nao_informado') then
    v_tipo := 'nao_informado';
  end if;
  v_fin := lower(translate(coalesce(nullif(btrim(p->>'finalidade'), ''), 'nao_informado'),
            'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'));
  if v_fin not in ('residencial','comercial','misto','nao_informado') then v_fin := 'nao_informado'; end if;
  v_sit := coalesce(nullif(btrim(p->>'situacao'), ''), 'nao_informado');
  if v_sit not in ('lancamento','breve_lancamento','em_obras','pronto','usado','nao_informado') then
    v_sit := 'nao_informado';
  end if;
  v_prog := coalesce(nullif(btrim(p->>'programa_social'), ''), 'nao_informado');
  if v_prog not in ('sim','nao','nao_informado') then v_prog := 'nao_informado'; end if;

  v_lanc := app._mercado_data(p, 'data_lancamento');
  v_ent := app._mercado_data(p, 'previsao_entrega');
  v_tab := app._mercado_data(p, 'tabela_atualizada_em');
  v_lat := (p->>'latitude')::float8;
  v_lng := (p->>'longitude')::float8;
  if v_lat is null or v_lng is null then
    raise exception 'Empreendimento sem coordenada' using errcode = '23514';
  end if;
  v_torres := nullif(p->>'torres', '')::smallint;
  v_unid := nullif(p->>'unidades_informadas', '')::int;
  v_est := nullif(p->>'estoque_informado', '')::int;
  if v_unid is not null and v_unid <= 0 then v_unid := null; end if;
  if v_est is not null and v_unid is not null and v_est > v_unid then
    v_est := null;
    v_marcas := array['estoque_maior_que_unidades'];
  end if;

  v_mun := app.municipio_por_nome(p->>'municipio', p->>'uf');

  v_tem_lista := p ? 'unidades' and jsonb_typeof(p->'unidades') = 'array';
  if v_tem_lista then
    for u in select value from jsonb_array_elements(p->'unidades') loop
      select * into cls from app._mercado_classificar_tipo(col.empresa_id, u->>'tipo_unidade');
      if cls.residencial then v_tem_res := true; end if;
    end loop;
  end if;

  -- Casa o empreendimento por id de fora antes do filtro, para saber se já passou um dia.
  if v_fonte_id is not null then
    select entidade_id into v_emp from app.mercado_ids_externos
     where empresa_id = col.empresa_id and fonte = col.fonte and entidade = 'empreendimento' and id_externo = v_fonte_id;
  end if;

  v_passa := app._mercado_passa_filtro(col.empresa_id, v_tipo, v_fin, v_sit, v_lanc, v_ent, v_mun, col.referencia, v_tem_lista, v_tem_res);
  v_ja := v_emp is not null and exists (
    select 1 from app.mercado_empreendimento_estados s where s.empreendimento_id = v_emp and s.no_filtro);
  if not v_passa and not v_ja then
    perform app._mercado_falha(p_coleta, v_fonte_id, 'fora_do_filtro', coalesce(p->>'nome', ''));
    return;
  end if;

  -- Incorporadora: id de fora, senão CNPJ, senão nome normalizado.
  if v_inc_id is not null then
    select entidade_id into v_conc from app.mercado_ids_externos
     where empresa_id = col.empresa_id and fonte = col.fonte and entidade = 'concorrente' and id_externo = v_inc_id;
  end if;
  if v_conc is null and v_cnpj is not null then
    select id into v_conc from app.concorrentes where empresa_id = col.empresa_id and cnpj = v_cnpj;
  end if;
  if v_conc is null and nullif(btrim(coalesce(v_inc->>'nome', '')), '') is not null then
    select id into v_conc from app.concorrentes
     where empresa_id = col.empresa_id and ativo
       and app.normaliza_nome(nome) = app.normaliza_nome(v_inc->>'nome')
     limit 1;
  end if;
  if v_conc is null then
    begin
      insert into app.concorrentes (empresa_id, nome, cnpj)
      values (col.empresa_id, coalesce(nullif(btrim(v_inc->>'nome'), ''), 'Não informada'), v_cnpj)
      returning id into v_conc;
    exception when unique_violation then
      select id into v_conc from app.concorrentes
       where empresa_id = col.empresa_id and lower(btrim(nome)) = lower(btrim(coalesce(nullif(btrim(v_inc->>'nome'), ''), 'Não informada')))
       limit 1;
    end;
  end if;
  if v_inc_id is not null and not exists (
    select 1 from app.mercado_ids_externos
     where empresa_id = col.empresa_id and fonte = col.fonte and entidade = 'concorrente' and entidade_id = v_conc)
  then
    insert into app.mercado_ids_externos (empresa_id, entidade, entidade_id, fonte, id_externo)
    values (col.empresa_id, 'concorrente', v_conc, col.fonte, v_inc_id)
    on conflict do nothing;
  end if;

  if v_emp is null then
    insert into app.concorrencia_empreendimentos (
      empresa_id, concorrente_id, nome, latitude, longitude, endereco, municipio_id, bairro,
      unidades, situacao, data_lancamento, previsao_entrega, torres, programa_social, tipo, finalidade,
      origem, link_fonte, primeira_coleta_id, ultima_coleta_id)
    values (
      col.empresa_id, v_conc, coalesce(nullif(btrim(p->>'nome'), ''), 'Sem nome'), v_lat, v_lng,
      nullif(btrim(p->>'endereco'), ''), v_mun, nullif(btrim(p->>'bairro'), ''),
      case when v_unid is not null and v_unid > 0 then v_unid end, v_sit, v_lanc, v_ent, v_torres, v_prog, v_tipo, v_fin,
      'importado', nullif(btrim(p->>'link_fonte'), ''), p_coleta, p_coleta)
    returning id into v_emp;
    if v_fonte_id is not null then
      insert into app.mercado_ids_externos (empresa_id, entidade, entidade_id, fonte, id_externo)
      values (col.empresa_id, 'empreendimento', v_emp, col.fonte, v_fonte_id);
    end if;
    insert into app.mercado_sugestoes_vinculo (empresa_id, empreendimento_id, manual_id, similaridade, distancia_m, coleta_id)
    select col.empresa_id, v_emp, m.id, app.similaridade_trigrama(m.nome, p->>'nome'),
           round(app.mercado_distancia_m(m.latitude, m.longitude, v_lat, v_lng), 1), p_coleta
      from app.concorrencia_empreendimentos m
     where m.empresa_id = col.empresa_id and m.origem = 'manual' and m.ativo and m.id <> v_emp
       and app.mercado_distancia_m(m.latitude, m.longitude, v_lat, v_lng) <= 150
       and app.similaridade_trigrama(m.nome, p->>'nome') >= 0.5;
    insert into app.mercado_empreendimento_estados (
      empresa_id, empreendimento_id, desde_coleta_id, situacao, data_lancamento, previsao_entrega,
      unidades_informadas, estoque_informado, tabela_atualizada_em, no_filtro, marcas)
    values (col.empresa_id, v_emp, p_coleta, v_sit, v_lanc, v_ent, v_unid, v_est, v_tab, v_passa, v_marcas);
  else
    -- Manual encontrado por id (não deve ocorrer): não mexe no cadastro feito à mão.
    if (select origem from app.concorrencia_empreendimentos where id = v_emp) = 'importado' then
      update app.concorrencia_empreendimentos set
        concorrente_id = v_conc,
        nome = coalesce(nullif(btrim(p->>'nome'), ''), nome),
        latitude = v_lat, longitude = v_lng,
        endereco = coalesce(nullif(btrim(p->>'endereco'), ''), endereco),
        municipio_id = coalesce(v_mun, municipio_id),
        bairro = coalesce(nullif(btrim(p->>'bairro'), ''), bairro),
        unidades = case when v_unid is not null and v_unid > 0 then v_unid else unidades end,
        situacao = v_sit,
        data_lancamento = coalesce(v_lanc, data_lancamento),
        previsao_entrega = coalesce(v_ent, previsao_entrega),
        torres = coalesce(v_torres, torres),
        programa_social = v_prog,
        tipo = v_tipo,
        finalidade = v_fin,
        link_fonte = coalesce(nullif(btrim(p->>'link_fonte'), ''), link_fonte),
        ultima_coleta_id = p_coleta
      where id = v_emp;
      -- observacao e ativo ficam como estão.
    else
      update app.concorrencia_empreendimentos set ultima_coleta_id = p_coleta where id = v_emp;
    end if;

    select id, desde_coleta_id into v_estado, v_desde from app.mercado_empreendimento_estados
     where empreendimento_id = v_emp and ate_coleta_id is null;
    if v_desde = p_coleta then
      update app.mercado_empreendimento_estados set
        situacao = v_sit, data_lancamento = v_lanc, previsao_entrega = v_ent,
        unidades_informadas = v_unid, estoque_informado = v_est, tabela_atualizada_em = v_tab,
        no_filtro = v_passa, marcas = v_marcas
      where id = v_estado;
    elsif v_estado is null or exists (
      select 1 from app.mercado_empreendimento_estados s
       where s.id = v_estado and (
         s.situacao is distinct from v_sit or s.data_lancamento is distinct from v_lanc
         or s.previsao_entrega is distinct from v_ent or s.unidades_informadas is distinct from v_unid
         or s.estoque_informado is distinct from v_est or s.tabela_atualizada_em is distinct from v_tab
         or s.no_filtro is distinct from v_passa or s.marcas is distinct from v_marcas))
    then
      update app.mercado_empreendimento_estados set ate_coleta_id = p_coleta where id = v_estado;
      insert into app.mercado_empreendimento_estados (
        empresa_id, empreendimento_id, desde_coleta_id, situacao, data_lancamento, previsao_entrega,
        unidades_informadas, estoque_informado, tabela_atualizada_em, no_filtro, marcas)
      values (col.empresa_id, v_emp, p_coleta, v_sit, v_lanc, v_ent, v_unid, v_est, v_tab, v_passa, v_marcas);
    end if;
  end if;

  if not v_tem_lista then
    return;
  end if;

  for u in select value from jsonb_array_elements(p->'unidades') loop
    select * into cls from app._mercado_classificar_tipo(col.empresa_id, u->>'tipo_unidade');
    v_norm_torre := app.mercado_norm_rotulo(u->>'torre');
    v_norm_num := app.mercado_norm_rotulo(u->>'numero');
    v_preco := app._mercado_num(u, 'preco');
    v_preco_orig := app._mercado_num(u, 'preco_original');
    v_marcas_u := '{}';
    if v_preco = 0.1 then
      v_preco := null;
      v_marcas_u := v_marcas_u || array['preco_sentinela'];
    elsif v_preco is not null and v_preco <= 0 then
      v_preco := null;
    end if;
    if v_preco_orig = 0.1 then
      v_preco_orig := null;
      if not ('preco_sentinela' = any(v_marcas_u)) then v_marcas_u := v_marcas_u || array['preco_sentinela']; end if;
    elsif v_preco_orig is not null and v_preco_orig <= 0 then
      v_preco_orig := null;
    end if;
    v_area := app._mercado_num(u, 'area_privativa_m2');
    if v_area is not null and v_area <= 0 then v_area := null; end if;
    v_sit_u := coalesce(nullif(btrim(u->>'situacao'), ''), 'nao_informado');
    if v_sit_u not in ('disponivel','reservada','vendida','indisponivel','nao_informado') then
      v_sit_u := 'nao_informado';
    end if;

    v_uid := null;
    if nullif(btrim(coalesce(u->>'id_externo', '')), '') is not null then
      select entidade_id into v_uid from app.mercado_ids_externos
       where empresa_id = col.empresa_id and fonte = col.fonte and entidade = 'unidade'
         and id_externo = btrim(u->>'id_externo');
    end if;
    if v_uid is null then
      select id into v_uid from app.mercado_unidades
       where empreendimento_id = v_emp and torre_norm = v_norm_torre and numero_norm = v_norm_num;
    end if;

    if v_uid is null then
      insert into app.mercado_unidades (
        empresa_id, empreendimento_id, torre, numero, torre_norm, numero_norm, andar,
        area_privativa_m2, dormitorios, suites, vagas, tipologia_fonte,
        tipo_unidade, tipo_fonte, studio_nr, residencial,
        preco_primeiro, preco_primeiro_em, preco_de_lancamento,
        primeira_coleta_id, ultima_coleta_id, marcas)
      values (
        col.empresa_id, v_emp, nullif(btrim(u->>'torre'), ''), nullif(btrim(u->>'numero'), ''),
        v_norm_torre, v_norm_num, nullif(u->>'andar', '')::smallint,
        v_area, nullif(u->>'dormitorios', '')::smallint, nullif(u->>'suites', '')::smallint, nullif(u->>'vagas', '')::smallint,
        nullif(btrim(u->>'tipologia_fonte'), ''),
        cls.codigo, cls.fonte, cls.studio_nr, cls.residencial,
        v_preco, case when v_preco is not null then col.referencia end,
        v_preco is not null and v_lanc is not null and col.referencia <= v_lanc + cfg.dias_preco_lancamento,
        p_coleta, p_coleta,
        case when v_area is null then array['area_nula'] else '{}' end)
      returning id into v_uid;
      if nullif(btrim(coalesce(u->>'id_externo', '')), '') is not null then
        insert into app.mercado_ids_externos (empresa_id, entidade, entidade_id, fonte, id_externo)
        values (col.empresa_id, 'unidade', v_uid, col.fonte, btrim(u->>'id_externo'));
      end if;
      insert into app.mercado_unidade_estados (empresa_id, unidade_id, desde_coleta_id, situacao, preco, preco_original, marcas)
      values (col.empresa_id, v_uid, p_coleta, v_sit_u, v_preco, v_preco_orig, v_marcas_u);
    else
      update app.mercado_unidades set
        torre = coalesce(nullif(btrim(u->>'torre'), ''), torre),
        numero = coalesce(nullif(btrim(u->>'numero'), ''), numero),
        andar = coalesce(nullif(u->>'andar', '')::smallint, andar),
        area_privativa_m2 = coalesce(v_area, area_privativa_m2),
        dormitorios = coalesce(nullif(u->>'dormitorios', '')::smallint, dormitorios),
        suites = coalesce(nullif(u->>'suites', '')::smallint, suites),
        vagas = coalesce(nullif(u->>'vagas', '')::smallint, vagas),
        tipologia_fonte = coalesce(nullif(btrim(u->>'tipologia_fonte'), ''), tipologia_fonte),
        tipo_unidade = cls.codigo,
        tipo_fonte = coalesce(cls.fonte, tipo_fonte),
        studio_nr = cls.studio_nr,
        residencial = cls.residencial,
        ultima_coleta_id = p_coleta,
        removida_coleta_id = null,
        marcas = case when coalesce(v_area, area_privativa_m2) is null then array['area_nula'] else array_remove(marcas, 'area_nula') end
      where id = v_uid;

      if v_preco is not null and (select preco_primeiro is null from app.mercado_unidades where id = v_uid) then
        update app.mercado_unidades set
          preco_primeiro = v_preco,
          preco_primeiro_em = col.referencia,
          preco_de_lancamento = v_lanc is not null and col.referencia <= v_lanc + cfg.dias_preco_lancamento
        where id = v_uid;
      end if;

      if nullif(btrim(coalesce(u->>'id_externo', '')), '') is not null and not exists (
        select 1 from app.mercado_ids_externos
         where empresa_id = col.empresa_id and fonte = col.fonte and entidade = 'unidade' and entidade_id = v_uid)
      then
        insert into app.mercado_ids_externos (empresa_id, entidade, entidade_id, fonte, id_externo)
        values (col.empresa_id, 'unidade', v_uid, col.fonte, btrim(u->>'id_externo'))
        on conflict do nothing;
      end if;

      select id, desde_coleta_id into v_estado, v_desde from app.mercado_unidade_estados
       where unidade_id = v_uid and ate_coleta_id is null;
      if v_desde = p_coleta then
        update app.mercado_unidade_estados set
          situacao = v_sit_u, preco = v_preco, preco_original = v_preco_orig, marcas = v_marcas_u
        where id = v_estado;
      elsif v_estado is null or exists (
        select 1 from app.mercado_unidade_estados s where s.id = v_estado
         and (s.situacao is distinct from v_sit_u or s.preco is distinct from v_preco
              or s.preco_original is distinct from v_preco_orig or s.marcas is distinct from v_marcas_u))
      then
        update app.mercado_unidade_estados set ate_coleta_id = p_coleta where id = v_estado;
        insert into app.mercado_unidade_estados (empresa_id, unidade_id, desde_coleta_id, situacao, preco, preco_original, marcas)
        values (col.empresa_id, v_uid, p_coleta, v_sit_u, v_preco, v_preco_orig, v_marcas_u);
      end if;
    end if;
    v_unidades_vistas := v_unidades_vistas + 1;
  end loop;
end $$;

create or replace function app.importar_mercado(p_coleta uuid, p_dados jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_emp uuid;
  v_lista jsonb;
  v_item jsonb;
  v_erros int := 0;
  v_ign int := 0;
begin
  select empresa_id into v_emp from app.mercado_coletas where id = p_coleta;
  if not found then
    raise exception 'Coleta não encontrada' using errcode = 'P0002';
  end if;
  if not app._mercado_pode(v_emp) then
    raise exception 'Só o administrador importa o mercado' using errcode = '42501';
  end if;
  if (select situacao from app.mercado_coletas where id = p_coleta) <> 'rodando' then
    raise exception 'A coleta não está aberta' using errcode = '23514';
  end if;
  if jsonb_typeof(p_dados) = 'array' then
    v_lista := p_dados;
  elsif jsonb_typeof(p_dados) = 'object' then
    v_lista := jsonb_build_array(p_dados);
  else
    raise exception 'A carga do mercado é uma lista de empreendimentos' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(v_lista) loop
    begin
      perform app._mercado_importar_um(p_coleta, v_item);
    exception when others then
      v_erros := v_erros + 1;
      perform app._mercado_falha(p_coleta, v_item->>'id_externo', 'erro', sqlerrm);
    end;
  end loop;

  update app.mercado_coletas c set
    coletados = (select count(*) from app.concorrencia_empreendimentos e where e.ultima_coleta_id = p_coleta),
    unidades = (select count(*) from app.mercado_unidades u where u.ultima_coleta_id = p_coleta),
    tipos_desconhecidos = coalesce((
      select array_agg(distinct u.tipo_fonte order by u.tipo_fonte)
      from app.mercado_unidades u
      where u.ultima_coleta_id = p_coleta and u.tipo_unidade = 'nao_informado' and u.tipo_fonte is not null), '{}')
  where c.id = p_coleta;

  select count(*) into v_ign from jsonb_array_elements((select falhas from app.mercado_coletas where id = p_coleta)) e
   where e->>'motivo' = 'fora_do_filtro';
  return jsonb_build_object(
    'coletados', (select coletados from app.mercado_coletas where id = p_coleta),
    'unidades', (select unidades from app.mercado_coletas where id = p_coleta),
    'ignorados', v_ign,
    'erros', v_erros);
end $$;

create or replace function app.fechar_coleta_mercado(p_coleta uuid, p_esperados int default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  col app.mercado_coletas;
  cfg app.mercado_config;
  v_prev date;
  v_sit text;
  v_vendas int := 0;
  v_removidas int := 0;
  alu record;
  v_agora text;
  v_antes text;
  v_preco numeric;
  v_de date;
  v_med numeric;
begin
  select * into col from app.mercado_coletas where id = p_coleta;
  if not found then raise exception 'Coleta não encontrada' using errcode = 'P0002'; end if;
  if col.situacao <> 'rodando' then
    raise exception 'A coleta não está aberta' using errcode = '23514';
  end if;
  if not app._mercado_pode(col.empresa_id) then
    raise exception 'Só o administrador fecha a coleta do mercado' using errcode = '42501';
  end if;
  if p_esperados is not null then
    update app.mercado_coletas set esperados = p_esperados where id = p_coleta;
    col.esperados := p_esperados;
  end if;
  select * into cfg from app.mercado_config where empresa_id = col.empresa_id;

  select coletados into col.coletados from app.mercado_coletas where id = p_coleta;

  v_sit := 'completa';
  if col.esperados is not null and col.esperados > 0
     and col.coletados < col.esperados * cfg.cobertura_minima_pct / 100.0 then
    v_sit := 'incompleta';
  end if;
  select c.coletados into v_preco
    from app.mercado_coletas c
   where c.empresa_id = col.empresa_id and c.fonte = col.fonte and c.tipo = 'completa_mensal'
     and c.referencia < col.referencia and c.situacao in ('completa','incompleta') and c.id <> p_coleta
   order by c.referencia desc limit 1;
  if v_preco is not null and v_preco > 0 and col.tipo = 'completa_mensal'
     and col.coletados < v_preco * cfg.cobertura_minima_pct / 100.0 then
    v_sit := 'incompleta';
  end if;

  if col.tipo = 'completa_mensal' and v_sit = 'completa' then
    -- Par para confirmação: sumiu uma e apareceu outra com mesma área, andar e preço a até 5%.
    update app.mercado_unidades n set vinculo_pendente_id = par.antiga
      from (
        with novas as (
          select u.id, u.empreendimento_id, u.area_privativa_m2 as area, u.andar,
                 coalesce(e.preco, u.preco_primeiro) as preco
          from app.mercado_unidades u
          left join app.mercado_unidade_estados e on e.unidade_id = u.id and e.ate_coleta_id is null
          where u.primeira_coleta_id = p_coleta and u.vinculo_pendente_id is null
        ),
        sumidas as (
          select u.id, u.empreendimento_id, u.area_privativa_m2 as area, u.andar,
                 coalesce(e.preco, u.preco_primeiro) as preco
          from app.mercado_unidades u
          join app.concorrencia_empreendimentos emp on emp.id = u.empreendimento_id and emp.ultima_coleta_id = p_coleta
          left join app.mercado_unidade_estados e on e.unidade_id = u.id and e.ate_coleta_id is null
          where u.ultima_coleta_id is distinct from p_coleta and u.removida_coleta_id is null
            and u.primeira_coleta_id is distinct from p_coleta
        ),
        pares as (
          select n.id as nova, s.id as antiga, abs(n.preco - s.preco) / s.preco as dif
          from novas n
          join sumidas s on s.empreendimento_id = n.empreendimento_id
           and s.area is not distinct from n.area
           and s.andar is not distinct from n.andar
           and n.preco is not null and s.preco > 0
           and abs(n.preco - s.preco) / s.preco <= 0.05
        ),
        por_antiga as (
          select distinct on (antiga) nova, antiga, dif from pares order by antiga, dif, nova
        )
        select distinct on (nova) nova, antiga from por_antiga order by nova, dif, antiga
      ) par
     where n.id = par.nova and n.vinculo_pendente_id is null;

    select referencia into v_prev from app.mercado_coletas
     where empresa_id = col.empresa_id and fonte = col.fonte and tipo = 'completa_mensal' and situacao = 'completa'
       and referencia < col.referencia and id <> p_coleta
     order by referencia desc limit 1;

    for alu in
      select un.id, un.area_privativa_m2, un.dormitorios, un.vagas, un.empreendimento_id, un.empresa_id
      from app.mercado_unidades un
      where un.ultima_coleta_id = p_coleta and un.residencial and un.vinculo_pendente_id is null
    loop
      select e.situacao into v_agora from app.mercado_unidade_estados e where e.unidade_id = alu.id and e.ate_coleta_id is null;
      -- A foto anterior é a última situação gravada por uma mensal completa.
      -- Coleta incompleta muda o estado, mas não apaga a passagem.
      v_antes := null;
      if v_prev is not null then
        select e.situacao into v_antes
          from app.mercado_unidade_estados e
          join app.mercado_coletas d on d.id = e.desde_coleta_id
         where e.unidade_id = alu.id and d.fonte = col.fonte
           and d.tipo = 'completa_mensal' and d.situacao = 'completa'
           and d.referencia <= v_prev
         order by d.referencia desc, e.id desc
         limit 1;
      end if;

      if v_agora = 'vendida' and v_antes is distinct from 'vendida'
         and not exists (select 1 from app.mercado_vendas v where v.unidade_id = alu.id and v.desfeita_coleta_id is null)
         and (v_antes in ('disponivel','reservada')
              or exists (
                select 1 from app.mercado_unidade_estados e
                join app.mercado_coletas c on c.id = e.desde_coleta_id
                where e.unidade_id = alu.id and e.situacao in ('disponivel','reservada') and c.referencia < col.referencia))
      then
        select e.preco into v_preco
          from app.mercado_unidade_estados e
          join app.mercado_coletas c on c.id = e.desde_coleta_id
         where e.unidade_id = alu.id and e.preco is not null
         order by c.referencia desc, e.id desc limit 1;
        select c.referencia into v_de
          from app.mercado_unidade_estados e
          join app.mercado_coletas c on c.id = e.desde_coleta_id
         where e.unidade_id = alu.id and e.situacao in ('disponivel','reservada')
         order by c.referencia desc limit 1;
        insert into app.mercado_vendas (empresa_id, unidade_id, coleta_id, vendida_de, vendida_ate, preco, origem_preco, antes_do_monitor)
        values (alu.empresa_id, alu.id, p_coleta, coalesce(v_de, col.referencia), col.referencia, v_preco, 'ultimo_visto', false);
        v_vendas := v_vendas + 1;
      elsif v_antes is null and v_agora = 'vendida'
         and not exists (
           select 1 from app.mercado_unidade_estados e
           join app.mercado_coletas c on c.id = e.desde_coleta_id
                where e.unidade_id = alu.id and e.situacao in ('disponivel','reservada') and c.referencia < col.referencia)
         and not exists (select 1 from app.mercado_vendas v where v.unidade_id = alu.id and v.desfeita_coleta_id is null)
      then
        v_med := null;
        if alu.area_privativa_m2 is not null and alu.area_privativa_m2 > 0 then
          select percentile_cont(0.5) within group (order by e.preco / un.area_privativa_m2) into v_med
            from app.mercado_unidades un
            join app.mercado_unidade_estados e on e.unidade_id = un.id and e.ate_coleta_id is null
           where un.empreendimento_id = alu.empreendimento_id and un.id <> alu.id and un.residencial
             and e.situacao = 'disponivel' and e.preco is not null and un.area_privativa_m2 > 0
             and un.dormitorios is not distinct from alu.dormitorios
             and un.vagas is not distinct from alu.vagas
             and abs(un.area_privativa_m2 - alu.area_privativa_m2) / alu.area_privativa_m2 <= 0.03;
        end if;
        insert into app.mercado_vendas (empresa_id, unidade_id, coleta_id, vendida_de, vendida_ate, preco, origem_preco, antes_do_monitor)
        values (alu.empresa_id, alu.id, p_coleta, col.referencia, col.referencia,
                case when v_med is not null then round((v_med * alu.area_privativa_m2)::numeric, 2) end,
                'estimado', true);
        v_vendas := v_vendas + 1;
      elsif v_antes = 'vendida' and v_agora in ('disponivel','reservada') then
        update app.mercado_vendas set desfeita_coleta_id = p_coleta
         where unidade_id = alu.id and desfeita_coleta_id is null;
      end if;
    end loop;

    update app.mercado_unidades u set removida_coleta_id = p_coleta
      from app.concorrencia_empreendimentos emp
     where u.empreendimento_id = emp.id and emp.ultima_coleta_id = p_coleta
       and u.ultima_coleta_id is distinct from p_coleta
       and u.removida_coleta_id is null
       and not exists (select 1 from app.mercado_unidades n where n.vinculo_pendente_id = u.id);
    get diagnostics v_removidas = row_count;
  end if;

  update app.mercado_coletas set situacao = v_sit, concluida_em = clock_timestamp() where id = p_coleta;
  return jsonb_build_object('situacao', v_sit, 'vendas', v_vendas, 'removidas', v_removidas);
end $$;

create or replace function app.confirmar_vinculo_unidade(p_unidade uuid, p_confirmar boolean)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  n app.mercado_unidades;
  a app.mercado_unidades;
  est app.mercado_unidade_estados;
  col app.mercado_coletas;
  v_sit_antes text;
  v_preco numeric;
  v_de date;
  v_ext text;
begin
  select * into n from app.mercado_unidades where id = p_unidade;
  if not found or n.vinculo_pendente_id is null then
    raise exception 'Unidade sem vínculo pendente' using errcode = '22023';
  end if;
  if not app._mercado_pode(n.empresa_id) then
    raise exception 'Só o administrador confirma o vínculo' using errcode = '42501';
  end if;
  select * into a from app.mercado_unidades where id = n.vinculo_pendente_id;
  select * into est from app.mercado_unidade_estados where unidade_id = n.id and ate_coleta_id is null;
  select * into col from app.mercado_coletas where id = n.primeira_coleta_id;

  if not coalesce(p_confirmar, false) then
    update app.mercado_unidades set vinculo_pendente_id = null where id = n.id;
    update app.mercado_unidades set removida_coleta_id = coalesce(removida_coleta_id, n.primeira_coleta_id) where id = a.id;
    return;
  end if;

  select id_externo into v_ext from app.mercado_ids_externos
   where entidade = 'unidade' and entidade_id = n.id limit 1;

  select e.situacao into v_sit_antes from app.mercado_unidade_estados e where e.unidade_id = a.id and e.ate_coleta_id is null;

  delete from app.mercado_ids_externos where entidade = 'unidade' and entidade_id = n.id;
  delete from app.mercado_unidade_estados where unidade_id = n.id;
  delete from app.mercado_vendas where unidade_id = n.id;
  update app.mercado_unidades set vinculo_pendente_id = null where id = n.id;
  delete from app.mercado_unidades where id = n.id;

  update app.mercado_unidades set
    torre = coalesce(n.torre, torre), numero = coalesce(n.numero, numero),
    torre_norm = n.torre_norm, numero_norm = n.numero_norm,
    andar = coalesce(n.andar, andar),
    area_privativa_m2 = coalesce(n.area_privativa_m2, area_privativa_m2),
    dormitorios = coalesce(n.dormitorios, dormitorios),
    suites = coalesce(n.suites, suites),
    vagas = coalesce(n.vagas, vagas),
    tipo_unidade = n.tipo_unidade, tipo_fonte = coalesce(n.tipo_fonte, tipo_fonte),
    studio_nr = n.studio_nr, residencial = n.residencial,
    ultima_coleta_id = col.id, removida_coleta_id = null
  where id = a.id;

  -- A unidade antiga já tem id de fora nesta fonte: o da nova toma o lugar.
  if v_ext is not null then
    delete from app.mercado_ids_externos
     where empresa_id = a.empresa_id and fonte = col.fonte and entidade = 'unidade' and entidade_id = a.id
       and id_externo is distinct from v_ext;
    insert into app.mercado_ids_externos (empresa_id, entidade, entidade_id, fonte, id_externo)
    values (a.empresa_id, 'unidade', a.id, col.fonte, v_ext)
    on conflict do nothing;
  end if;

  if est.situacao is not null and exists (
    select 1 from app.mercado_unidade_estados e where e.unidade_id = a.id and e.ate_coleta_id is null
     and (e.situacao is distinct from est.situacao or e.preco is distinct from est.preco
          or e.preco_original is distinct from est.preco_original))
  then
    update app.mercado_unidade_estados set ate_coleta_id = col.id where unidade_id = a.id and ate_coleta_id is null and desde_coleta_id <> col.id;
    if not exists (select 1 from app.mercado_unidade_estados where unidade_id = a.id and ate_coleta_id is null) then
      insert into app.mercado_unidade_estados (empresa_id, unidade_id, desde_coleta_id, situacao, preco, preco_original, marcas)
      values (a.empresa_id, a.id, col.id, est.situacao, est.preco, est.preco_original, est.marcas);
    end if;
  end if;

  if col.tipo = 'completa_mensal' and col.situacao = 'completa'
     and v_sit_antes in ('disponivel','reservada') and est.situacao = 'vendida'
     and not exists (select 1 from app.mercado_vendas v where v.unidade_id = a.id and v.desfeita_coleta_id is null)
  then
    select e.preco into v_preco from app.mercado_unidade_estados e
      join app.mercado_coletas c on c.id = e.desde_coleta_id
     where e.unidade_id = a.id and e.preco is not null order by c.referencia desc limit 1;
    select max(c.referencia) into v_de from app.mercado_unidade_estados e
      join app.mercado_coletas c on c.id = e.desde_coleta_id
     where e.unidade_id = a.id and e.situacao in ('disponivel','reservada');
    insert into app.mercado_vendas (empresa_id, unidade_id, coleta_id, vendida_de, vendida_ate, preco, origem_preco, antes_do_monitor)
    values (a.empresa_id, a.id, col.id, coalesce(v_de, col.referencia), col.referencia, v_preco, 'ultimo_visto', false);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Cálculos. Só unidade residencial de empreendimento no_filtro na data.
-- Cada unidade entra sozinha. Níveis: empreendimento, incorporadora,
-- bairro, dormitorios e municipio (cidade é o mesmo que municipio).
-- ---------------------------------------------------------------------
create or replace function app.mercado_unidades_em(p_data date)
returns table (
  unidade_id uuid, empresa_id uuid, empreendimento_id uuid, concorrente_id uuid,
  municipio_id uuid, bairro text, empreendimento text, incorporadora text, municipio text,
  dormitorios smallint, vagas smallint, area_privativa_m2 numeric,
  situacao text, preco numeric, preco_original numeric,
  tabela_atualizada_em date, estoque_informado int, data_lancamento date)
language sql stable security invoker set search_path = '' as $$
  select u.id, u.empresa_id, u.empreendimento_id, e.concorrente_id, e.municipio_id, e.bairro,
         e.nome, c.nome, mu.nome, u.dormitorios, u.vagas, u.area_privativa_m2,
         s.situacao, s.preco, s.preco_original, es.tabela_atualizada_em, es.estoque_informado, es.data_lancamento
  from app.mercado_unidades u
  join app.concorrencia_empreendimentos e on e.id = u.empreendimento_id
  join app.concorrentes c on c.id = e.concorrente_id
  left join app.municipios mu on mu.id = e.municipio_id
  join app.mercado_coletas pc on pc.id = u.primeira_coleta_id
  left join app.mercado_coletas rc on rc.id = u.removida_coleta_id
  join app.mercado_unidade_estados s on s.unidade_id = u.id
  join app.mercado_coletas sd on sd.id = s.desde_coleta_id
  left join app.mercado_coletas sa on sa.id = s.ate_coleta_id
  join app.mercado_empreendimento_estados es on es.empreendimento_id = e.id
  join app.mercado_coletas ed on ed.id = es.desde_coleta_id
  left join app.mercado_coletas ea on ea.id = es.ate_coleta_id
  where u.residencial
    and pc.referencia <= p_data
    and (rc.id is null or rc.referencia > p_data)
    and sd.referencia <= p_data and (sa.id is null or sa.referencia > p_data)
    and es.no_filtro
    and ed.referencia <= p_data and (ea.id is null or ea.referencia > p_data)
$$;

create or replace function app._mercado_nivel_ok(p_nivel text)
returns text
language sql immutable set search_path = '' as $$
  select case when p_nivel = 'cidade' then 'municipio'
              when p_nivel in ('empreendimento','incorporadora','bairro','dormitorios','municipio') then p_nivel
              else null end
$$;

create or replace function app.mercado_vendas_periodo(p_de date, p_ate date, p_nivel text)
returns table (nivel text, chave text, nome text, vendidas int, vgv numeric, estimadas int, vgv_estimado numeric)
language plpgsql volatile security invoker set search_path = '' as $$
declare v_nivel text := app._mercado_nivel_ok(p_nivel);
begin
  if v_nivel is null then raise exception 'Nível de mercado desconhecido' using errcode = '22023'; end if;
  return query
  with base as (
    select v.antes_do_monitor, v.preco, u.dormitorios, e.id as empreendimento_id, e.nome as emp_nome,
           e.concorrente_id, c.nome as inc_nome, e.municipio_id, mu.nome as mun_nome, e.bairro, u.id as unidade_id
    from app.mercado_vendas v
    join app.mercado_unidades u on u.id = v.unidade_id
    join app.concorrencia_empreendimentos e on e.id = u.empreendimento_id
    join app.concorrentes c on c.id = e.concorrente_id
    left join app.municipios mu on mu.id = e.municipio_id
    where v.vendida_ate between p_de and p_ate and v.desfeita_coleta_id is null and u.residencial
      and exists (
        select 1 from app.mercado_empreendimento_estados s
        join app.mercado_coletas d on d.id = s.desde_coleta_id
        left join app.mercado_coletas a on a.id = s.ate_coleta_id
        where s.empreendimento_id = e.id and s.no_filtro
          and d.referencia <= v.vendida_ate and (a.id is null or a.referencia > v.vendida_ate))
  ),
  chaveado as (
    select b.*,
      case v_nivel
        when 'empreendimento' then b.empreendimento_id::text
        when 'incorporadora' then b.concorrente_id::text
        when 'bairro' then coalesce(b.bairro, '')
        when 'dormitorios' then coalesce(b.dormitorios::text, '-')
        else b.municipio_id::text end as ch,
      case v_nivel
        when 'empreendimento' then b.emp_nome
        when 'incorporadora' then b.inc_nome
        when 'bairro' then coalesce(b.bairro, '')
        when 'dormitorios' then coalesce(b.dormitorios::text, 'não informado')
        else coalesce(b.mun_nome, '') end as nm
    from base b
  )
  select v_nivel, c.ch, min(c.nm),
         count(*) filter (where not c.antes_do_monitor)::int,
         coalesce(sum(c.preco) filter (where not c.antes_do_monitor), 0),
         count(*) filter (where c.antes_do_monitor)::int,
         coalesce(sum(c.preco) filter (where c.antes_do_monitor), 0)
  from chaveado c
  group by c.ch;
end $$;

create or replace function app.mercado_precos(p_data date, p_nivel text)
returns table (
  nivel text, chave text, nome text,
  mediana_preco numeric, minimo_preco numeric, maximo_preco numeric,
  mediana_m2 numeric, minimo_m2 numeric, maximo_m2 numeric,
  variacao_preco numeric, variacao_m2 numeric)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_nivel text := app._mercado_nivel_ok(p_nivel);
  v_prev date;
begin
  if v_nivel is null then raise exception 'Nível de mercado desconhecido' using errcode = '22023'; end if;
  select max(c.referencia) into v_prev from app.mercado_coletas c
   where c.tipo = 'completa_mensal' and c.situacao = 'completa' and c.referencia < p_data;
  return query
  with agora as (
    select a.*, a.preco / nullif(a.area_privativa_m2, 0) as m2
    from app.mercado_unidades_em(p_data) a
    where a.situacao = 'disponivel' and a.preco is not null
  ),
  antes as (
    select b.unidade_id, b.preco, b.preco / nullif(b.area_privativa_m2, 0) as m2
    from app.mercado_unidades_em(v_prev) b
    where v_prev is not null and b.preco is not null
  ),
  ch as (
    select a.*,
      case v_nivel when 'empreendimento' then a.empreendimento_id::text
           when 'incorporadora' then a.concorrente_id::text when 'bairro' then coalesce(a.bairro,'')
           when 'dormitorios' then coalesce(a.dormitorios::text,'-') else a.municipio_id::text end as chave,
      case v_nivel when 'empreendimento' then a.empreendimento when 'incorporadora' then a.incorporadora
           when 'bairro' then coalesce(a.bairro,'') when 'dormitorios' then coalesce(a.dormitorios::text,'não informado')
           else coalesce(a.municipio,'') end as nome
    from agora a
  )
  select v_nivel, c.chave, min(c.nome),
         round((percentile_cont(0.5) within group (order by c.preco))::numeric, 2),
         round(min(c.preco), 2), round(max(c.preco), 2),
         round((percentile_cont(0.5) within group (order by c.m2))::numeric, 2),
         round(min(c.m2)::numeric, 2), round(max(c.m2)::numeric, 2),
         round(((percentile_cont(0.5) within group (order by c.preco) filter (where t.preco is not null)
               - percentile_cont(0.5) within group (order by t.preco) filter (where t.preco is not null))
               / nullif(percentile_cont(0.5) within group (order by t.preco) filter (where t.preco is not null), 0))::numeric, 4),
         round(((percentile_cont(0.5) within group (order by c.m2) filter (where t.m2 is not null)
               - percentile_cont(0.5) within group (order by t.m2) filter (where t.m2 is not null))
               / nullif(percentile_cont(0.5) within group (order by t.m2) filter (where t.m2 is not null), 0))::numeric, 4)
  from ch c
  left join antes t on t.unidade_id = c.unidade_id
  group by c.chave;
end $$;

create or replace function app.mercado_estoque(p_data date, p_nivel text)
returns table (
  nivel text, chave text, nome text,
  disponiveis int, reservadas int, estoque int, vendidas int, total int,
  pct_vendido numeric, estoque_informado int, diferenca int)
language plpgsql volatile security invoker set search_path = '' as $$
declare v_nivel text := app._mercado_nivel_ok(p_nivel);
begin
  if v_nivel is null then raise exception 'Nível de mercado desconhecido' using errcode = '22023'; end if;
  return query
  with base as (
    select a.* from app.mercado_unidades_em(p_data) a
  ),
  ch as (
    select b.*,
      case v_nivel when 'empreendimento' then b.empreendimento_id::text
           when 'incorporadora' then b.concorrente_id::text when 'bairro' then coalesce(b.bairro,'')
           when 'dormitorios' then coalesce(b.dormitorios::text,'-') else b.municipio_id::text end as chv,
      case v_nivel when 'empreendimento' then b.empreendimento when 'incorporadora' then b.incorporadora
           when 'bairro' then coalesce(b.bairro,'') when 'dormitorios' then coalesce(b.dormitorios::text,'não informado')
           else coalesce(b.municipio,'') end as nm
    from base b
  ),
  emp_info as (
    select c.chv, c.empreendimento_id, max(c.estoque_informado) as info
    from ch c group by c.chv, c.empreendimento_id
  )
  select v_nivel, c.chv, min(c.nm),
         count(*) filter (where c.situacao = 'disponivel')::int,
         count(*) filter (where c.situacao = 'reservada')::int,
         count(*) filter (where c.situacao in ('disponivel','reservada'))::int,
         count(*) filter (where c.situacao = 'vendida')::int,
         count(*)::int,
         round((count(*) filter (where c.situacao = 'vendida'))::numeric / nullif(count(*), 0), 4),
         (select sum(i.info)::int from emp_info i where i.chv = c.chv),
         count(*) filter (where c.situacao in ('disponivel','reservada'))::int
           - (select sum(i.info)::int from emp_info i where i.chv = c.chv)
  from ch c
  group by c.chv;
end $$;

create or replace function app.mercado_velocidade(p_mes date, p_nivel text)
returns table (
  nivel text, chave text, nome text,
  vendidas int, estoque_inicio int, lancadas int, vso numeric, meses_estoque numeric)
language plpgsql volatile security invoker set search_path = '' as $$
declare
  v_nivel text := app._mercado_nivel_ok(p_nivel);
  v_ini date := date_trunc('month', p_mes)::date;
  v_fim date := (date_trunc('month', p_mes) + interval '1 month' - interval '1 day')::date;
  v_vale boolean;
begin
  if v_nivel is null then raise exception 'Nível de mercado desconhecido' using errcode = '22023'; end if;
  -- Mês sem mensal completa (ou só com incompleta) não tem velocidade.
  select exists (
    select 1 from app.mercado_coletas c
    where c.tipo = 'completa_mensal' and c.situacao = 'completa' and c.referencia between v_ini and v_fim)
  into v_vale;
  if not v_vale then return; end if;

  return query
  with cfg as (
    select empresa_id, dias_tabela_desatualizada from app.mercado_config
  ),
  inicio as (
    select a.* from app.mercado_unidades_em(v_ini - 1) a
    join cfg on cfg.empresa_id = a.empresa_id
    where a.situacao in ('disponivel','reservada')
      and (a.tabela_atualizada_em is null or a.tabela_atualizada_em >= v_fim - cfg.dias_tabela_desatualizada)
  ),
  fim as (
    select a.* from app.mercado_unidades_em(v_fim) a
    join cfg on cfg.empresa_id = a.empresa_id
    where a.tabela_atualizada_em is null or a.tabela_atualizada_em >= v_fim - cfg.dias_tabela_desatualizada
  ),
  vendas_mes as (
    select v.unidade_id from app.mercado_vendas v
    join app.mercado_unidades u on u.id = v.unidade_id
    where v.vendida_ate between v_ini and v_fim and v.desfeita_coleta_id is null and not v.antes_do_monitor
      and u.residencial
      and exists (select 1 from fim f where f.unidade_id = u.id or f.empreendimento_id = u.empreendimento_id)
  ),
  lanc as (
    select u.id as unidade_id, e.empresa_id, e.id as empreendimento_id, e.concorrente_id, e.municipio_id,
           e.bairro, e.nome as empreendimento, c.nome as incorporadora, mu.nome as municipio, u.dormitorios
    from app.mercado_unidades u
    join app.concorrencia_empreendimentos e on e.id = u.empreendimento_id
    join app.concorrentes c on c.id = e.concorrente_id
    left join app.municipios mu on mu.id = e.municipio_id
    join app.mercado_coletas pc on pc.id = u.primeira_coleta_id
    left join app.mercado_coletas rc on rc.id = u.removida_coleta_id
    where u.residencial and e.data_lancamento between v_ini and v_fim
      and pc.referencia <= v_fim and (rc.id is null or rc.referencia > v_fim)
      and not exists (select 1 from inicio i where i.unidade_id = u.id)
      and exists (
        select 1 from app.mercado_empreendimento_estados s
        join app.mercado_coletas d on d.id = s.desde_coleta_id
        left join app.mercado_coletas a on a.id = s.ate_coleta_id
        where s.empreendimento_id = e.id and s.no_filtro
          and d.referencia <= v_fim and (a.id is null or a.referencia > v_fim))
  ),
  vendas_3 as (
    select v.unidade_id from app.mercado_vendas v
    join app.mercado_unidades u on u.id = v.unidade_id
    where v.vendida_ate between (v_ini - interval '2 months')::date and v_fim
      and v.desfeita_coleta_id is null and not v.antes_do_monitor and u.residencial
  ),
  uns as (
    select f.unidade_id, f.empresa_id, f.empreendimento_id, f.concorrente_id, f.municipio_id, f.bairro,
           f.empreendimento, f.incorporadora, f.municipio, f.dormitorios, f.situacao,
           exists (select 1 from inicio i where i.unidade_id = f.unidade_id) as no_inicio,
           exists (select 1 from vendas_mes vm where vm.unidade_id = f.unidade_id) as vendeu,
           exists (select 1 from lanc l where l.unidade_id = f.unidade_id) as lancada,
           exists (select 1 from vendas_3 v3 where v3.unidade_id = f.unidade_id) as vendeu_3
    from fim f
  ),
  extra as (
    -- lançada que não está no fim (já vendida no mês e saiu do recorte? continua em fim se não removida)
    select l.unidade_id, l.empresa_id, l.empreendimento_id, l.concorrente_id, l.municipio_id, l.bairro,
           l.empreendimento, l.incorporadora, l.municipio, l.dormitorios,
           false as no_inicio, false as vendeu, true as lancada, false as vendeu_3, null::text as situacao
    from lanc l
    where not exists (select 1 from uns u where u.unidade_id = l.unidade_id)
  ),
  tudo as (
    select u.unidade_id, u.empresa_id, u.empreendimento_id, u.concorrente_id, u.municipio_id, u.bairro,
           u.empreendimento, u.incorporadora, u.municipio, u.dormitorios, u.situacao,
           u.no_inicio, u.vendeu, u.lancada, u.vendeu_3
    from uns u
    union all
    select e.unidade_id, e.empresa_id, e.empreendimento_id, e.concorrente_id, e.municipio_id, e.bairro,
           e.empreendimento, e.incorporadora, e.municipio, e.dormitorios, e.situacao,
           e.no_inicio, e.vendeu, e.lancada, e.vendeu_3
    from extra e
  ),
  ch as (
    select t.*,
      case v_nivel when 'empreendimento' then t.empreendimento_id::text
           when 'incorporadora' then t.concorrente_id::text when 'bairro' then coalesce(t.bairro,'')
           when 'dormitorios' then coalesce(t.dormitorios::text,'-') else t.municipio_id::text end as chv,
      case v_nivel when 'empreendimento' then t.empreendimento when 'incorporadora' then t.incorporadora
           when 'bairro' then coalesce(t.bairro,'') when 'dormitorios' then coalesce(t.dormitorios::text,'não informado')
           else coalesce(t.municipio,'') end as nm
    from tudo t
  )
  select v_nivel, c.chv, min(c.nm),
         count(*) filter (where c.vendeu)::int,
         count(*) filter (where c.no_inicio)::int,
         count(*) filter (where c.lancada)::int,
         round((count(*) filter (where c.vendeu))::numeric
           / nullif(count(*) filter (where c.no_inicio) + count(*) filter (where c.lancada), 0), 4),
         round((count(*) filter (where c.situacao in ('disponivel','reservada')))::numeric
           / nullif((count(*) filter (where c.vendeu_3))::numeric / 3, 0), 4)
  from ch c
  group by c.chv;
end $$;

create or replace function app.mercado_lancamentos(p_de date, p_ate date)
returns table (empreendimento_id uuid, empresa_id uuid, nome text, data_lancamento date, classe text)
language sql stable security invoker set search_path = '' as $$
  with base as (
    select e.id, e.empresa_id, e.nome, es.data_lancamento, pc.referencia as primeira,
           es.situacao, es.no_filtro
    from app.concorrencia_empreendimentos e
    join app.mercado_coletas pc on pc.id = e.primeira_coleta_id
    join app.mercado_empreendimento_estados es on es.empreendimento_id = e.id and es.ate_coleta_id is null
    where es.no_filtro
  ),
  saiu as (
    select e.empreendimento_id
    from app.mercado_empreendimento_estados e
    join app.mercado_coletas d on d.id = e.desde_coleta_id
    join app.mercado_empreendimento_estados ant on ant.empreendimento_id = e.empreendimento_id and ant.ate_coleta_id = e.desde_coleta_id
    where ant.situacao = 'breve_lancamento' and e.situacao is distinct from 'breve_lancamento'
      and d.referencia between p_de and p_ate and e.no_filtro
  )
  select b.id, b.empresa_id, b.nome, b.data_lancamento,
         case when b.primeira between p_de and p_ate and (b.data_lancamento is null or b.data_lancamento < p_de) then 'entrou_na_base'
              when b.id in (select empreendimento_id from saiu) then 'saiu_breve'
              when b.data_lancamento between p_de and p_ate then 'lancamento' end
  from base b
  where (b.primeira between p_de and p_ate and (b.data_lancamento is null or b.data_lancamento < p_de))
     or b.id in (select empreendimento_id from saiu)
     or b.data_lancamento between p_de and p_ate
$$;

-- ---------------------------------------------------------------------
-- Vistas. Só unidade residencial, uma linha por unidade.
-- ---------------------------------------------------------------------
create view app.v_mercado_unidades with (security_invoker = true) as
select u.id as unidade_id, u.empresa_id, u.empreendimento_id, e.nome as empreendimento,
       c.nome as incorporadora, m.nome as municipio, m.uf, e.bairro,
       u.torre, u.numero, u.andar, u.area_privativa_m2, u.dormitorios, u.suites, u.vagas,
       u.tipo_unidade, u.tipologia_fonte, s.situacao, s.preco, s.preco_original,
       u.preco_primeiro, u.preco_de_lancamento, e.data_lancamento, e.previsao_entrega, e.programa_social,
       v.vendida_ate, v.preco as preco_venda, v.origem_preco, v.antes_do_monitor
from app.mercado_unidades u
join app.concorrencia_empreendimentos e on e.id = u.empreendimento_id
join app.concorrentes c on c.id = e.concorrente_id
left join app.municipios m on m.id = e.municipio_id
left join app.mercado_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
left join app.mercado_vendas v on v.unidade_id = u.id and v.desfeita_coleta_id is null
where u.residencial and u.removida_coleta_id is null;

create view app.v_mercado_empreendimentos with (security_invoker = true) as
select e.id, e.empresa_id, e.nome, e.concorrente_id, c.nome as incorporadora,
       e.municipio_id, m.nome as municipio, e.bairro, e.latitude, e.longitude,
       e.situacao, e.origem, es.no_filtro, e.data_lancamento, e.previsao_entrega, e.programa_social,
       (select count(*) from app.mercado_unidades u
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null)::int as unidades,
       (select count(*) from app.mercado_unidades u
         join app.mercado_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null
           and s.situacao in ('disponivel','reservada'))::int as estoque,
       (select count(*) from app.mercado_unidades u
         join app.mercado_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null
           and s.situacao = 'vendida')::int as vendidas,
       (select round(count(*) filter (where s.situacao = 'vendida')::numeric / nullif(count(*), 0), 4)
         from app.mercado_unidades u
         join app.mercado_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null) as pct_vendido,
       (select round((percentile_cont(0.5) within group (order by s.preco / u.area_privativa_m2))::numeric, 2)
         from app.mercado_unidades u
         join app.mercado_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null
           and s.situacao = 'disponivel' and s.preco is not null and u.area_privativa_m2 > 0) as preco_m2,
       (select coalesce(sum(s.preco), 0) from app.mercado_unidades u
         join app.mercado_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null
           and s.situacao = 'disponivel' and s.preco is not null) as vgv_disponivel,
       (select coalesce(sum(u.preco_primeiro), 0) from app.mercado_unidades u
         where u.empreendimento_id = e.id and u.residencial and u.removida_coleta_id is null) as vgv_lancamento,
       exists (select 1 from app.mercado_vendas v join app.mercado_unidades u on u.id = v.unidade_id
                where u.empreendimento_id = e.id and v.antes_do_monitor and v.desfeita_coleta_id is null) as vgv_lancamento_estimado,
       (select count(*) from app.mercado_vendas v join app.mercado_unidades u on u.id = v.unidade_id
         where u.empreendimento_id = e.id and u.residencial and v.desfeita_coleta_id is null and not v.antes_do_monitor
           and v.vendida_ate >= current_date - interval '3 months')::int as vendas_3m
from app.concorrencia_empreendimentos e
join app.concorrentes c on c.id = e.concorrente_id
left join app.municipios m on m.id = e.municipio_id
left join app.mercado_empreendimento_estados es on es.empreendimento_id = e.id and es.ate_coleta_id is null
where e.origem = 'importado' or e.primeira_coleta_id is not null;

grant select on app.v_mercado_unidades, app.v_mercado_empreendimentos to authenticated;

revoke all on function app._mercado_desfazer(uuid) from public;
revoke all on function app._mercado_importar_um(uuid, jsonb) from public;
revoke all on function app._mercado_falha(uuid, text, text, text) from public;
revoke all on function app._mercado_semear(uuid) from public;
revoke all on function app._mercado_recalcular_residencial(uuid) from public;
revoke all on function app._mercado_residencial(uuid, text, boolean) from public;
revoke all on function app._mercado_classificar_tipo(uuid, text) from public;
revoke all on function app._mercado_passa_filtro(uuid, text, text, text, date, date, uuid, date, boolean, boolean) from public;
revoke all on function app._mercado_pode(uuid) from public;

grant execute on function
  app.mercado_norm_rotulo(text),
  app.similaridade_trigrama(text, text),
  app.mercado_distancia_m(double precision, double precision, double precision, double precision),
  app.abrir_coleta_mercado(uuid, text, text, date, int, text),
  app.importar_mercado(uuid, jsonb),
  app.fechar_coleta_mercado(uuid, int),
  app.confirmar_vinculo_unidade(uuid, boolean),
  app.salvar_config_mercado(uuid, jsonb),
  app.salvar_tipo_unidade_mercado(uuid, text, boolean, boolean),
  app.mercado_unidades_em(date),
  app.mercado_vendas_periodo(date, date, text),
  app.mercado_precos(date, text),
  app.mercado_estoque(date, text),
  app.mercado_velocidade(date, text),
  app.mercado_lancamentos(date, date)
to authenticated, service_role;
