-- =====================================================================
-- BKM Terrenos · 0003 · terreno e tudo que descreve o imóvel
-- Regra: "não informado" é null (números) ou 'nao_informado' (seleções),
-- nunca zero nem "não".
-- =====================================================================

create sequence app.terreno_seq;

-- GeoJSON Polygon válido: anéis fechados, ≥ 4 posições, lon/lat dentro dos limites.
create or replace function app.geojson_poligono_valido(g jsonb)
returns boolean language sql immutable as $$
  select g->>'type' = 'Polygon'
     and jsonb_typeof(g->'coordinates') = 'array'
     and jsonb_array_length(g->'coordinates') >= 1
     and not exists (
       select 1 from jsonb_array_elements(g->'coordinates') anel
       where jsonb_typeof(anel) <> 'array' or jsonb_array_length(anel) < 4
          or anel->0 <> anel->-1
          or exists (select 1 from jsonb_array_elements(anel) pt
                     where jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) < 2
                        or jsonb_typeof(pt->0) <> 'number' or jsonb_typeof(pt->1) <> 'number'
                        or (pt->>0)::float8 not between -180 and 180 or (pt->>1)::float8 not between -90 and 90))
$$;

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
  cep                   text check (cep is null or cep ~ '^\d{8}$'),  -- só dígitos (trigger normaliza)
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
  poligono_geojson      jsonb check (poligono_geojson is null or app.geojson_poligono_valido(poligono_geojson)),
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
  versao                int not null default 1,  -- sobe a cada alteração; protege edição simultânea
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

-- Valor venal e IPTU: por inscrição e exercício. Corrigir um valor cria
-- uma nova revisão; a anterior fica preservada e deixa de ser a vigente.
create table app.inscricao_valores (
  id                     uuid primary key default gen_random_uuid(),
  inscricao_id           uuid not null references app.inscricoes_municipais(id) on delete cascade,
  empresa_id             uuid not null references app.empresas(id),
  exercicio              int  not null check (exercicio between 1990 and 2100),
  revisao                int  not null default 1 check (revisao > 0),
  vigente                boolean not null default true,
  valor_venal_terreno    numeric(14,2) check (valor_venal_terreno >= 0),
  valor_venal_construcao numeric(14,2) check (valor_venal_construcao >= 0),
  valor_venal_imovel     numeric(14,2) check (valor_venal_imovel >= 0),
  situacao_iptu          text not null default 'nao_informada' check (situacao_iptu in ('nao_informada','tributado','isento')),
  iptu_valor_anual       numeric(12,2) check (iptu_valor_anual >= 0),
  iptu_parcelas          int  check (iptu_parcelas between 1 and 12),
  iptu_mensal_informado  numeric(12,2) check (iptu_mensal_informado >= 0),  -- quando a fonte só traz o mensal
  data_verificacao       date,
  fonte                  text,  -- carnê, certidão de dados cadastrais, portal da prefeitura...
  observacoes            text,
  criado_por             uuid default auth.uid(),
  criado_em              timestamptz not null default now(),
  unique (inscricao_id, exercicio, revisao),
  check (situacao_iptu <> 'isento' or (coalesce(iptu_valor_anual, 0) = 0 and coalesce(iptu_mensal_informado, 0) = 0)),
  check (valor_venal_imovel is null or valor_venal_terreno is null or valor_venal_construcao is null
         or valor_venal_imovel = valor_venal_terreno + valor_venal_construcao)
);
create unique index inscricao_valor_vigente on app.inscricao_valores (inscricao_id, exercicio) where vigente;

-- Nova linha do mesmo exercício vira a próxima revisão e aposenta a anterior.
-- Linha gravada não muda (só deixa de ser vigente).
create or replace function app.tg_inscricao_valor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(max(revisao), 0) + 1 into new.revisao from app.inscricao_valores
     where inscricao_id = new.inscricao_id and exercicio = new.exercicio;
    if new.valor_venal_imovel is null and new.valor_venal_terreno is not null and new.valor_venal_construcao is not null then
      new.valor_venal_imovel := new.valor_venal_terreno + new.valor_venal_construcao;
    end if;
    update app.inscricao_valores set vigente = false
     where inscricao_id = new.inscricao_id and exercicio = new.exercicio and vigente;
    new.vigente := true;
    return new;
  end if;
  if (to_jsonb(old) - 'vigente') is distinct from (to_jsonb(new) - 'vigente') then
    raise exception 'Valores de um exercício não são alterados: lance uma nova revisão' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_revisao before insert or update on app.inscricao_valores for each row execute function app.tg_inscricao_valor();

-- Medidas de terrenos irregulares: um segmento por linha.
create table app.confrontacoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  terreno_id    uuid not null references app.terrenos(id) on delete cascade,
  ordem         int  not null check (ordem > 0),
  tipo          text not null default 'outro' check (tipo in ('frente','lateral_direita','lateral_esquerda','fundos','outro')),
  comprimento_m numeric(8,2) check (comprimento_m > 0),
  confrontante  text,  -- rua, lote vizinho, matrícula confrontante
  fonte         text,
  observacoes   text,
  unique (terreno_id, ordem)
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

-- Participações conhecidas dos proprietários somam no máximo 100%.
create or replace function app.tg_soma_participacao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare total numeric;
begin
  if new.papel = 'proprietario' and new.percentual_participacao is not null then
    perform 1 from app.terrenos where id = new.terreno_id for update;
    select coalesce(sum(percentual_participacao), 0) into total from app.terreno_pessoas
     where terreno_id = new.terreno_id and papel = 'proprietario' and id <> new.id;
    if total + new.percentual_participacao > 100 then
      raise exception '%', format('A soma das participações passaria de 100%% (já há %s%% informado)', total) using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger t_soma after insert or update on app.terreno_pessoas for each row execute function app.tg_soma_participacao();

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
  -- cada parâmetro tem estado próprio: não informado, limitado (com valor) ou sem limite identificado
  gabarito_m_status          text not null default 'nao_informado' check (gabarito_m_status in ('nao_informado','limitado','sem_limite_identificado')),
  gabarito_maximo_m          numeric(6,2) check (gabarito_maximo_m > 0),
  gabarito_pav_status        text not null default 'nao_informado' check (gabarito_pav_status in ('nao_informado','limitado','sem_limite_identificado')),
  gabarito_maximo_pavimentos int check (gabarito_maximo_pavimentos > 0),
  ca_status                  text not null default 'nao_informado' check (ca_status in ('nao_informado','limitado','sem_limite_identificado')),
  ca_maximo                  numeric(5,2) check (ca_maximo > 0),
  restricoes_observacoes     text,
  unique (analise_id, zoneamento_id),
  check ((gabarito_m_status = 'limitado') = (gabarito_maximo_m is not null)),
  check ((gabarito_pav_status = 'limitado') = (gabarito_maximo_pavimentos is not null)),
  check ((ca_status = 'limitado') = (ca_maximo is not null))
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
  elsif j ? 'reuniao_id' and j->>'reuniao_id' is not null then
    select empresa_id into v from app.reunioes where id = (j->>'reuniao_id')::uuid;
  elsif j ? 'analise_id' then
    select empresa_id into v from app.analises_urbanisticas where id = (j->>'analise_id')::uuid;
  else
    return new;
  end if;
  if v is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  -- registro existente não muda de terreno nem de empresa
  if tg_op = 'UPDATE' and (to_jsonb(old)->'terreno_id' is distinct from j->'terreno_id' or old.empresa_id is distinct from new.empresa_id) then
    raise exception 'Um registro não pode ser transferido para outro terreno' using errcode = '23514';
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
  foreach t in array array['terrenos','matriculas','inscricoes_municipais','inscricao_valores','confrontacoes','terreno_pessoas','terreno_corretores',
                           'terreno_infraestrutura','analises_urbanisticas','analise_zoneamentos','areas_interesse','area_interesse_terrenos'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
    if t <> 'terrenos' and t <> 'areas_interesse' then
      execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_mesma_empresa()', t);
    end if;
  end loop;
  -- remover vínculos é permitido; terreno e análise nunca são apagados (arquivar / substituir)
  foreach t in array array['matriculas','inscricoes_municipais','confrontacoes','terreno_pessoas','terreno_corretores','area_interesse_terrenos','analise_zoneamentos'] loop
    execute format('create policy remover on app.%I for delete to authenticated using (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant delete on app.%I to authenticated', t);
  end loop;
end $$;
grant usage on sequence app.terreno_seq to authenticated;

-- Terreno é alterado só por app.salvar_terreno (confere a versão); inserir continua direto.
drop policy alterar on app.terrenos;
revoke update on app.terrenos from authenticated;
-- Valores de IPTU não são apagados nem editados pelo app: nova revisão.
revoke update on app.inscricao_valores from authenticated;
drop policy alterar on app.inscricao_valores;

create or replace function app.tg_normalizar_terreno()
returns trigger language plpgsql as $$
begin
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  new.nome := trim(new.nome);
  return new;
end $$;
create trigger t_norm before insert or update on app.terrenos for each row execute function app.tg_normalizar_terreno();

create trigger t_upd before update on app.terrenos for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.terrenos    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.matriculas  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.inscricoes_municipais for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.analise_zoneamentos  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.inscricao_valores    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.terreno_pessoas      for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.confrontacoes        for each row execute function app.tg_auditoria();
