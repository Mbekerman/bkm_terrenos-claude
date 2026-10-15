-- =====================================================================
-- BKM Terrenos · 0002 · domínio: terrenos, ofertas, processos,
-- propostas, documentos, tarefas, atividades
-- =====================================================================

-- ---------------------------------------------------------------------
-- Configuração (sem empresa_id: igual para todos por enquanto)
-- ---------------------------------------------------------------------
create table app.etapas_modelo (
  tipo_processo text not null,
  codigo        text not null,
  nome          text not null,
  ordem         int  not null,
  sla_dias      int,
  exige_gestor  boolean not null default false,  -- só gestor move PARA esta etapa
  primary key (tipo_processo, codigo),
  unique (tipo_processo, ordem)
);

create table app.tipos_documento (
  codigo        text primary key,
  nome          text not null,
  categoria     text not null,
  validade_dias int  -- null = não vence
);

create table app.checklist_modelo (
  tipo_processo  text not null,
  etapa          text not null,   -- documentos exigidos para SAIR desta etapa
  tipo_documento text not null references app.tipos_documento(codigo),
  obrigatorio    boolean not null default true,
  ordem          int not null default 0,
  primary key (tipo_processo, etapa, tipo_documento),
  foreign key (tipo_processo, etapa) references app.etapas_modelo(tipo_processo, codigo)
);

insert into app.etapas_modelo (tipo_processo, codigo, nome, ordem, sla_dias, exige_gestor) values
  ('negociacao','recebida',   'Recebida',          1,  5,  false),
  ('negociacao','triagem',    'Triagem',           2,  7,  false),
  ('negociacao','viabilidade','Viabilidade',       3, 15,  false),
  ('negociacao','diligencia', 'Diligência',        4, 30,  false),
  ('negociacao','proposta',   'Proposta',          5, 30,  false),
  ('negociacao','aprovacao',  'Aprovação interna', 6,  7,  false),
  ('negociacao','contrato',   'Contrato',          7, 30,  true),
  ('negociacao','ganha',      'Ganha',             8, null, true);

-- Prazos de validade são exemplos; ajuste à exigência de quem analisa.
insert into app.tipos_documento (codigo, nome, categoria, validade_dias) values
  ('matricula',          'Matrícula atualizada',                 'Imóvel',    30),
  ('onus_reais',         'Certidão de ônus reais',               'Imóvel',    30),
  ('iptu',               'Certidão negativa de IPTU',            'Imóvel',    90),
  ('certidoes_vendedor', 'Certidões pessoais do vendedor',       'Vendedor',  30),
  ('planialtimetrico',   'Levantamento planialtimétrico',        'Técnico',   null),
  ('sondagem_spt',       'Sondagem SPT',                         'Técnico',   null),
  ('ambiental',          'Avaliação ambiental preliminar',       'Técnico',   null),
  ('minuta_promessa',    'Minuta de promessa de compra e venda', 'Contratos', null);

insert into app.checklist_modelo (tipo_processo, etapa, tipo_documento, obrigatorio, ordem) values
  ('negociacao','diligencia','matricula',          true,  1),
  ('negociacao','diligencia','onus_reais',         true,  2),
  ('negociacao','diligencia','iptu',               true,  3),
  ('negociacao','diligencia','certidoes_vendedor', true,  4),
  ('negociacao','diligencia','planialtimetrico',   true,  5),
  ('negociacao','diligencia','sondagem_spt',       false, 6),
  ('negociacao','diligencia','ambiental',          false, 7),
  ('negociacao','contrato',  'minuta_promessa',    true,  1);

-- ---------------------------------------------------------------------
-- Pessoas
-- ---------------------------------------------------------------------
create table app.pessoas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  tipo          text not null default 'PF' check (tipo in ('PF','PJ')),
  nome          text not null,
  documento     text,
  email         text,
  telefone      text,
  papel         text,  -- proprietário, corretor, advogado, cartório...
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz
);

-- ---------------------------------------------------------------------
-- Terrenos
-- ---------------------------------------------------------------------
create sequence app.terreno_seq;
create table app.terrenos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  codigo        text not null default ('T-' || lpad(nextval('app.terreno_seq')::text, 4, '0')),
  endereco      text not null,
  bairro        text not null,
  cidade        text not null default 'São Paulo',
  uf            char(2) not null default 'SP',
  area_m2       numeric(12,2) check (area_m2 > 0),
  frente_m      numeric(8,2),
  zoneamento    text,
  latitude      double precision,
  longitude     double precision,
  dados         jsonb not null default '{}'::jsonb,  -- parâmetros sem filtro nem cálculo
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  excluido_em   timestamptz,
  unique (empresa_id, codigo)
);

create table app.terreno_matriculas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  terreno_id  uuid not null references app.terrenos(id) on delete cascade,
  numero      text not null,
  numero_norm text generated always as (regexp_replace(numero, '\D', '', 'g')) stored,
  cartorio    text not null,
  area_m2     numeric(12,2),
  -- mesma matrícula no mesmo cartório = mesmo terreno
  unique (empresa_id, cartorio, numero_norm)
);
create index on app.terreno_matriculas (terreno_id);

create table app.terreno_proprietarios (
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  pessoa_id        uuid not null references app.pessoas(id),
  empresa_id       uuid not null references app.empresas(id),
  participacao_pct numeric(5,2) not null default 100 check (participacao_pct > 0 and participacao_pct <= 100),
  primary key (terreno_id, pessoa_id)
);

-- ---------------------------------------------------------------------
-- Ofertas (várias por terreno)
-- ---------------------------------------------------------------------
create table app.ofertas (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  terreno_id    uuid not null references app.terrenos(id),
  origem        text not null check (origem in ('corretor','proprietario','prospeccao')),
  corretor_id   uuid references app.pessoas(id),
  contato       text,
  recebida_em   date not null default current_date,
  valor_pedido  numeric(14,2) check (valor_pedido > 0),
  exclusividade boolean not null default false,
  observacoes   text,
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now()
);
create index on app.ofertas (terreno_id, recebida_em);

-- ---------------------------------------------------------------------
-- Viabilidades vinculadas
-- TEMPORÁRIO: quando o BKM estiver no mesmo projeto, vira view sobre
-- as viabilidades do BKM e nada mais é copiado.
-- ---------------------------------------------------------------------
create table app.viabilidades (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  terreno_id         uuid not null references app.terrenos(id),
  bkm_viabilidade_id uuid,
  nome               text not null,
  vgv                numeric(16,2),
  margem_pct         numeric(6,2),
  preco_max_terreno  numeric(14,2),
  calculado_em       date not null default current_date,
  criado_em          timestamptz not null default now()
);
create index on app.viabilidades (terreno_id);

-- ---------------------------------------------------------------------
-- Processos (negociação agora; aprovação, incorporação e financiamento depois)
-- ---------------------------------------------------------------------
create sequence app.processo_seq;
create table app.processos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references app.empresas(id),
  codigo               text not null default ('N-' || lpad(nextval('app.processo_seq')::text, 3, '0')),
  tipo                 text not null default 'negociacao',
  terreno_id           uuid not null references app.terrenos(id),
  empreendimento_id    uuid,
  etapa_atual          text not null,
  etapa_desde          timestamptz not null default now(),
  status               text not null default 'ativo' check (status in ('ativo','ganha','perdida','suspensa')),
  responsavel_id       uuid references auth.users(id),
  viabilidade_id       uuid references app.viabilidades(id),
  motivo_encerramento  text,
  detalhe_encerramento text,
  retomar_em           date,
  aberto_em            timestamptz not null default now(),
  encerrado_em         timestamptz,
  criado_por           uuid default auth.uid(),
  atualizado_em        timestamptz not null default now(),
  unique (empresa_id, codigo),
  foreign key (tipo, etapa_atual) references app.etapas_modelo(tipo_processo, codigo),
  check (status <> 'perdida' or motivo_encerramento is not null),
  check (status <> 'suspensa' or retomar_em is not null)
);
create index on app.processos (empresa_id, status, etapa_atual);
create index on app.processos (terreno_id);
-- no máximo uma negociação em aberto por terreno
create unique index processos_um_aberto_por_terreno on app.processos (terreno_id, tipo)
  where status in ('ativo','suspensa');

create table app.processo_transicoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  processo_id uuid not null references app.processos(id) on delete cascade,
  evento      text not null check (evento in ('abertura','avanco','perda','suspensao','retomada','ganho')),
  de_etapa    text,
  para_etapa  text,
  forcado     boolean not null default false,
  comentario  text,
  user_id     uuid default auth.uid(),
  em          timestamptz not null default now()
);
create index on app.processo_transicoes (processo_id, em);

-- ---------------------------------------------------------------------
-- Propostas (versionadas)
-- ---------------------------------------------------------------------
create table app.propostas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  processo_id    uuid not null references app.processos(id) on delete cascade,
  versao         int  not null,
  autor          text not null check (autor in ('nos','proprietario')),
  valor_total    numeric(14,2) not null check (valor_total > 0),
  forma          text not null check (forma in ('dinheiro','permuta_fisica','permuta_financeira','misto')),
  permuta_pct    numeric(5,2) not null default 0,
  condicoes      text,
  parcelas       jsonb not null default '[]'::jsonb,
  validade       date,
  situacao       text not null check (situacao in ('em_analise','contraproposta','aceita','recusada')),
  viabilidade_id uuid references app.viabilidades(id),
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  unique (processo_id, versao)
);

-- ---------------------------------------------------------------------
-- Atividades e tarefas
-- ---------------------------------------------------------------------
create table app.atividades (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  processo_id uuid not null references app.processos(id) on delete cascade,
  tipo        text not null check (tipo in ('ligacao','visita','reuniao','email','nota')),
  ocorreu_em  timestamptz not null default now(),
  resumo      text not null,
  user_id     uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index on app.atividades (processo_id, ocorreu_em desc);

create table app.tarefas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  processo_id    uuid not null references app.processos(id) on delete cascade,
  titulo         text not null,
  responsavel_id uuid references auth.users(id),
  prazo          date not null,
  concluida_em   timestamptz,
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now()
);
create index on app.tarefas (processo_id);
create index on app.tarefas (empresa_id, prazo) where concluida_em is null;

-- ---------------------------------------------------------------------
-- Documentos (um por tipo por processo) e versões (nunca sobrescreve)
-- ---------------------------------------------------------------------
create table app.documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  processo_id    uuid references app.processos(id) on delete cascade,
  terreno_id     uuid references app.terrenos(id),
  pessoa_id      uuid references app.pessoas(id),
  tipo_documento text not null references app.tipos_documento(codigo),
  emitido_em     date,
  situacao       text not null default 'recebido' check (situacao in ('recebido','validado','rejeitado')),
  revisado_por   uuid references auth.users(id),
  revisado_em    timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check (num_nonnulls(processo_id, terreno_id, pessoa_id) = 1)
);
create unique index documentos_um_por_tipo_processo on app.documentos (processo_id, tipo_documento) where processo_id is not null;

create table app.documento_versoes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  documento_id uuid not null references app.documentos(id) on delete cascade,
  versao       int  not null,
  storage_path text not null,
  nome_arquivo text not null,
  tamanho      bigint,
  sha256       text,
  enviado_por  uuid default auth.uid(),
  enviado_em   timestamptz not null default now(),
  unique (documento_id, versao)
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger t_upd before update on app.pessoas    for each row execute function app.tg_atualizado_em();
create trigger t_upd before update on app.terrenos   for each row execute function app.tg_atualizado_em();
create trigger t_upd before update on app.processos  for each row execute function app.tg_atualizado_em();
create trigger t_upd before update on app.documentos for each row execute function app.tg_atualizado_em();

create trigger t_aud after insert or update or delete on app.terrenos   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.ofertas    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.processos  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.propostas  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.documentos for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.terreno_matriculas for each row execute function app.tg_auditoria();

-- ---------------------------------------------------------------------
-- RLS
-- Leitura: membros da empresa. Escrita direta só onde não há regra de
-- negócio; o resto passa pelas RPCs (migration 0003).
-- ---------------------------------------------------------------------
alter table app.etapas_modelo    enable row level security;
alter table app.tipos_documento  enable row level security;
alter table app.checklist_modelo enable row level security;
create policy cfg_ver on app.etapas_modelo    for select to authenticated using (true);
create policy cfg_ver on app.tipos_documento  for select to authenticated using (true);
create policy cfg_ver on app.checklist_modelo for select to authenticated using (true);
grant select on app.etapas_modelo, app.tipos_documento, app.checklist_modelo to authenticated;

do $$
declare t text;
begin
  foreach t in array array['pessoas','terrenos','terreno_matriculas','terreno_proprietarios','ofertas','viabilidades',
                           'processos','processo_transicoes','propostas','atividades','tarefas','documentos','documento_versoes']
  loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;

  -- escrita direta permitida (sem regra de etapa envolvida)
  foreach t in array array['pessoas','terrenos','terreno_matriculas','terreno_proprietarios','atividades','tarefas']
  loop
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant insert, update on app.%I to authenticated', t);
  end loop;
end $$;

-- remover só matrícula, proprietário e tarefa (o resto é soft delete)
create policy remover on app.terreno_matriculas    for delete to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy remover on app.terreno_proprietarios for delete to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy remover on app.tarefas               for delete to authenticated using (empresa_id in (select app.minhas_empresas()));
grant delete on app.terreno_matriculas, app.terreno_proprietarios, app.tarefas to authenticated;

-- empresa_id de filhos tem que bater com o do pai
create or replace function app.tg_mesma_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid;
begin
  if tg_table_name in ('terreno_matriculas','terreno_proprietarios') then
    select empresa_id into v from app.terrenos where id = new.terreno_id;
  else
    select empresa_id into v from app.processos where id = new.processo_id;
  end if;
  if v is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger t_emp before insert or update on app.terreno_matriculas    for each row execute function app.tg_mesma_empresa();
create trigger t_emp before insert or update on app.terreno_proprietarios for each row execute function app.tg_mesma_empresa();
create trigger t_emp before insert or update on app.atividades            for each row execute function app.tg_mesma_empresa();
create trigger t_emp before insert or update on app.tarefas               for each row execute function app.tg_mesma_empresa();
