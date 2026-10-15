-- =====================================================================
-- BKM Terrenos · 0003 · terreno e tudo que descreve o imóvel
-- Regra: "não informado" é null (números) ou 'nao_informado' (seleções),
-- nunca zero nem "não".
-- =====================================================================

create sequence app.terreno_seq;

create table app.terrenos (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references app.empresas(id),
  codigo                text not null default ('TER-' || lpad(nextval('app.terreno_seq')::text, 6, '0')),

  -- 1. Identificação e gestão
  nome                  text not null check (length(trim(nome)) > 0),
  descricao             text,
  situacao_cadastral    text not null default 'ativo' check (situacao_cadastral in ('ativo','arquivado')),
  prioridade            text check (prioridade in ('baixa','media','alta','estrategica')),
  responsavel_id        uuid not null references auth.users(id),
  origem_cadastro       text not null check (origem_cadastro in ('prospeccao','corretor','indicacao','portal','proprietario','outro')),
  url_origem            text,
  data_identificacao    date not null default current_date,
  observacoes           text,
  arquivado_em          timestamptz,
  motivo_arquivamento   text,

  -- 2. Endereço e localização
  cep                   text check (cep is null or cep ~ '^\d{5}-?\d{3}$'),
  logradouro            text,
  numero                text,
  complemento           text,
  bairro                text,
  municipio_id          uuid not null references app.municipios(id),
  zona                  text check (zona in ('leste','oeste','norte','sul','sudeste','sudoeste','nordeste','noroeste')),
  eixo_comercial_id     uuid references app.eixos_comerciais(id),
  referencia_localizacao text,
  latitude              double precision check (latitude between -90 and 90),
  longitude             double precision check (longitude between -180 and 180),
  poligono_geojson      jsonb,
  precisao_localizacao  text not null default 'nao_informada' check (precisao_localizacao in ('nao_informada','aproximada','conferida')),

  -- 3. Áreas e características físicas
  area_documental_m2    numeric(12,2) check (area_documental_m2 > 0),
  area_cadastral_m2     numeric(12,2) check (area_cadastral_m2 > 0),
  area_levantamento_m2  numeric(12,2) check (area_levantamento_m2 > 0),
  area_adotada_m2       numeric(12,2) check (area_adotada_m2 > 0),
  fonte_area_adotada    text check (fonte_area_adotada in ('documental','cadastral','levantamento','estimativa')),
  testada_principal_m   numeric(8,2) check (testada_principal_m > 0),
  topografia            text not null default 'nao_informado' check (topografia in ('nao_informado','plano','aclive','declive','irregular')),
  desnivel_estimado_m   numeric(6,2),
  posicao_quadra        text not null default 'nao_informado' check (posicao_quadra in ('nao_informado','meio_quadra','esquina','duas_frentes','quadra_inteira')),
  formato               text not null default 'nao_informado' check (formato in ('nao_informado','regular','irregular')),
  situacao_ocupacao     text not null default 'nao_informado' check (situacao_ocupacao in ('nao_informado','vazio','ocupado','parcialmente_ocupado')),
  uso_atual             text,
  area_construida_existente_m2 numeric(12,2) check (area_construida_existente_m2 >= 0),
  area_construida_demolir_m2   numeric(12,2) check (area_construida_demolir_m2 >= 0),
  necessidade_demolicao text not null default 'nao_avaliada' check (necessidade_demolicao in ('nao_avaliada','provavel','confirmada','dispensada')),
  observacoes_fisicas   text,

  criado_por            uuid default auth.uid(),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  atualizado_por        uuid,
  unique (empresa_id, codigo),
  check ((latitude is null) = (longitude is null)),
  check (area_adotada_m2 is null or fonte_area_adotada is not null),
  check (situacao_cadastral = 'ativo' or (arquivado_em is not null and motivo_arquivamento is not null)),
  check (area_construida_demolir_m2 is null or area_construida_existente_m2 is null
         or area_construida_demolir_m2 <= area_construida_existente_m2),
  -- localização mínima para cadastrar: bairro ou ponto no mapa ou logradouro
  check (coalesce(bairro, logradouro) is not null or latitude is not null)
);
create index on app.terrenos (empresa_id, situacao_cadastral);

create table app.matriculas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  terreno_id         uuid not null references app.terrenos(id) on delete cascade,
  numero             text not null,
  numero_norm        text generated always as (regexp_replace(numero, '\D', '', 'g')) stored,
  cartorio           text not null,
  area_registrada_m2 numeric(12,2),
  data_certidao      date,
  unique (empresa_id, cartorio, numero_norm)  -- mesma matrícula no mesmo cartório = mesmo terreno
);
create index on app.matriculas (terreno_id);

create table app.inscricoes_municipais (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references app.empresas(id),
  terreno_id        uuid not null references app.terrenos(id) on delete cascade,
  inscricao         text not null,  -- SQL em São Paulo
  inscricao_norm    text generated always as (regexp_replace(inscricao, '\D', '', 'g')) stored,
  area_cadastral_m2 numeric(12,2),
  unique (empresa_id, inscricao_norm)
);
create index on app.inscricoes_municipais (terreno_id);

-- Valor venal e IPTU mudam todo ano e são por inscrição.
create table app.inscricao_valores (
  inscricao_id      uuid not null references app.inscricoes_municipais(id) on delete cascade,
  empresa_id        uuid not null references app.empresas(id),
  exercicio         int  not null check (exercicio between 1990 and 2100),
  valor_venal       numeric(14,2) check (valor_venal >= 0),
  iptu_valor_anual  numeric(12,2) check (iptu_valor_anual >= 0),
  iptu_parcelas     int  check (iptu_parcelas between 1 and 12),
  fonte             text,
  primary key (inscricao_id, exercicio)
);

create table app.terreno_pessoas (
  id                      uuid primary key default gen_random_uuid(),
  empresa_id              uuid not null references app.empresas(id),
  terreno_id              uuid not null references app.terrenos(id) on delete cascade,
  pessoa_id               uuid not null references app.pessoas(id),
  papel                   text not null default 'proprietario' check (papel in ('proprietario','representante','procurador','contato')),
  percentual_participacao numeric(5,2) check (percentual_participacao > 0 and percentual_participacao <= 100),
  observacoes             text,
  unique (terreno_id, pessoa_id, papel),
  check (papel = 'proprietario' or percentual_participacao is null)
);

create table app.terreno_corretores (
  terreno_id  uuid not null references app.terrenos(id) on delete cascade,
  corretor_id uuid not null references app.corretores(id),
  empresa_id  uuid not null references app.empresas(id),
  principal   boolean not null default false,
  observacoes text,
  primary key (terreno_id, corretor_id)
);
create unique index terreno_corretor_principal_unico on app.terreno_corretores (terreno_id) where principal;

create table app.terreno_infraestrutura (
  terreno_id      uuid not null references app.terrenos(id) on delete cascade,
  item            text not null references app.itens_infraestrutura(codigo),
  empresa_id      uuid not null references app.empresas(id),
  disponibilidade text not null default 'nao_verificado' check (disponibilidade in ('nao_verificado','sim','nao')),
  data_verificacao date,
  fonte           text,
  observacoes     text,
  primary key (terreno_id, item),
  check (disponibilidade = 'nao_verificado' or data_verificacao is not null)
);

-- Análise urbanística: uma vigente por terreno; as anteriores ficam como histórico.
create table app.analises_urbanisticas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  responsavel_id   uuid references auth.users(id),
  data_verificacao date not null default current_date,
  fonte            text,  -- GeoSampa, certidão de uso do solo, consulta prévia...
  status           text not null default 'vigente' check (status in ('vigente','substituida')),
  observacoes      text,
  criado_em        timestamptz not null default now()
);
create unique index analise_vigente_unica on app.analises_urbanisticas (terreno_id) where status = 'vigente';

create table app.analise_zoneamentos (
  id                         uuid primary key default gen_random_uuid(),
  empresa_id                 uuid not null references app.empresas(id),
  analise_id                 uuid not null references app.analises_urbanisticas(id) on delete cascade,
  zoneamento_id              uuid not null references app.zoneamentos(id),
  area_abrangida_m2          numeric(12,2),
  gabarito_sem_limite        boolean not null default false,
  gabarito_maximo_m          numeric(6,2),
  gabarito_maximo_pavimentos int,
  ca_maximo                  numeric(5,2) check (ca_maximo >= 0),
  restricoes_observacoes     text,
  unique (analise_id, zoneamento_id),
  -- "sem limite" é explícito: nunca zero
  check (not gabarito_sem_limite or (gabarito_maximo_m is null and gabarito_maximo_pavimentos is null)),
  check (gabarito_maximo_m is null or gabarito_maximo_m > 0),
  check (gabarito_maximo_pavimentos is null or gabarito_maximo_pavimentos > 0)
);

-- Nova análise vigente aposenta a anterior.
create or replace function app.tg_analise_vigente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vigente' then
    update app.analises_urbanisticas set status = 'substituida'
     where terreno_id = new.terreno_id and status = 'vigente' and id <> new.id;
  end if;
  return new;
end $$;
create trigger t_vigente before insert on app.analises_urbanisticas for each row execute function app.tg_analise_vigente();

-- Composição de áreas: terrenos vizinhos estudados em conjunto.
create table app.areas_interesse (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  nome        text not null,
  descricao   text,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, nome)
);
create table app.area_interesse_terrenos (
  area_interesse_id uuid not null references app.areas_interesse(id) on delete cascade,
  terreno_id        uuid not null references app.terrenos(id) on delete cascade,
  empresa_id        uuid not null references app.empresas(id),
  primary key (area_interesse_id, terreno_id)
);

-- ---------------------------------------------------------------------
-- Integridade: filho na mesma empresa do pai
-- ---------------------------------------------------------------------
create or replace function app.tg_mesma_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid; j jsonb := to_jsonb(new);
begin
  if j ? 'terreno_id' and j->>'terreno_id' is not null then
    select empresa_id into v from app.terrenos where id = (j->>'terreno_id')::uuid;
  elsif j ? 'processo_id' and j->>'processo_id' is not null then
    select empresa_id into v from app.processos where id = (j->>'processo_id')::uuid;
  elsif j ? 'inscricao_id' then
    select empresa_id into v from app.inscricoes_municipais where id = (j->>'inscricao_id')::uuid;
  elsif j ? 'analise_id' then
    select empresa_id into v from app.analises_urbanisticas where id = (j->>'analise_id')::uuid;
  else
    return new;
  end if;
  if v is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  -- processo informado tem que ser do mesmo terreno
  if j->>'processo_id' is not null and j->>'terreno_id' is not null and not exists (
       select 1 from app.processos where id = (j->>'processo_id')::uuid and terreno_id = (j->>'terreno_id')::uuid) then
    raise exception 'A negociação informada é de outro terreno' using errcode = '23514';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['terrenos','matriculas','inscricoes_municipais','inscricao_valores','terreno_pessoas','terreno_corretores',
                           'terreno_infraestrutura','analises_urbanisticas','analise_zoneamentos','areas_interesse','area_interesse_terrenos'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
    if t <> 'terrenos' and t <> 'areas_interesse' then
      execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_mesma_empresa()', t);
    end if;
  end loop;
  -- remover vínculos é permitido; terreno e análise nunca são apagados (arquivar / substituir)
  foreach t in array array['matriculas','inscricoes_municipais','inscricao_valores','terreno_pessoas','terreno_corretores','area_interesse_terrenos','analise_zoneamentos'] loop
    execute format('create policy remover on app.%I for delete to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant delete on app.%I to authenticated', t);
  end loop;
end $$;
grant usage on sequence app.terreno_seq to authenticated;

create trigger t_upd before update on app.terrenos for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.terrenos    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.matriculas  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.inscricoes_municipais for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.analise_zoneamentos  for each row execute function app.tg_auditoria();
