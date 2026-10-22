-- =====================================================================
-- BKM Terrenos · 0002 · cadastros de apoio
-- Municípios, zoneamentos, itens de infraestrutura e tipos de documento:
-- configuração comum a todas as empresas.
-- Funil (etapas, subetapas, status, pré-requisitos, checklist, motivos):
-- configuração por empresa, copiada do modelo padrão.
-- Eixos comerciais, pessoas e corretores: por empresa.
-- =====================================================================

create table app.municipios (
  id          uuid primary key default gen_random_uuid(),
  codigo_ibge char(7) not null unique,
  nome        text not null,
  uf          char(2) not null
);

create table app.zoneamentos (
  id           uuid primary key default gen_random_uuid(),
  municipio_id uuid not null references app.municipios(id),
  sigla        text not null,
  descricao    text,
  ativo        boolean not null default true,
  unique (municipio_id, sigla)
);

create table app.itens_infraestrutura (
  codigo text primary key,
  nome   text not null,
  ordem  int  not null,
  ativo  boolean not null default true
);

create table app.tipos_documento (
  codigo             text primary key,
  nome               text not null,
  categoria          text not null,
  validade_dias      int,                        -- null = não vence
  unico_por_processo boolean not null default true -- false: fotos, plantas (vários por terreno)
);

-- ---------------------------------------------------------------------
-- Configuração do funil, por empresa. Linhas com empresa_id nulo são o
-- modelo padrão: cada empresa nova recebe uma cópia (trigger em empresas)
-- e o administrador edita a sua pelo app, só por RPC (ver regras).
-- Criar ou apagar ETAPA continua sendo migration: mexe no funil inteiro.
-- ---------------------------------------------------------------------
-- Aprovação: "gestor" e "diretor" marcáveis; com os dois, em sequência
-- (primeiro o gestor) ou em paralelo (os dois ao mesmo tempo).
create table app.etapas_modelo (
  empresa_id      uuid references app.empresas(id) on delete cascade,
  tipo_processo   text not null,
  codigo          text not null,
  nome            text not null check (length(trim(nome)) > 0),
  ordem           int  not null,
  sla_dias        int  check (sla_dias > 0),
  aprova_gestor   boolean not null default false,
  aprova_diretor  boolean not null default false,
  aprovacao_modo  text not null default 'sequencia' check (aprovacao_modo in ('sequencia','paralelo')),
  unique nulls not distinct (empresa_id, tipo_processo, codigo),
  unique nulls not distinct (empresa_id, tipo_processo, ordem)
);

-- Subetapas: o card está sempre numa; dentro da etapa, livres e sem ordem
-- obrigatória (ordem = coluna do kanban). Código único no tipo de processo,
-- para servir de pré-requisito sem dizer a etapa.
create table app.subetapas_modelo (
  empresa_id      uuid references app.empresas(id) on delete cascade,
  tipo_processo   text not null,
  codigo          text not null,
  etapa           text not null,
  nome            text not null check (length(trim(nome)) > 0),
  ordem           int  not null,
  prazo_dias      int  check (prazo_dias > 0),   -- opcional: SLA e aviso de atraso
  aprova_gestor   boolean not null default false,
  aprova_diretor  boolean not null default false,
  aprovacao_modo  text not null default 'sequencia' check (aprovacao_modo in ('sequencia','paralelo')),
  ativo           boolean not null default true,  -- desativar no lugar de apagar (histórico lê o nome)
  unique nulls not distinct (empresa_id, tipo_processo, codigo),
  unique nulls not distinct (empresa_id, tipo_processo, etapa, codigo),
  foreign key (empresa_id, tipo_processo, etapa) references app.etapas_modelo(empresa_id, tipo_processo, codigo) on delete cascade
);

-- Status de encerramento e quem precisa aprovar cada um (Comprado, em geral).
create table app.status_modelo (
  empresa_id      uuid references app.empresas(id) on delete cascade,
  tipo_processo   text not null,
  status          text not null check (status in ('comprado','perdido','descartado','stand_by')),
  nome            text not null,
  aprova_gestor   boolean not null default false,
  aprova_diretor  boolean not null default false,
  aprovacao_modo  text not null default 'sequencia' check (aprovacao_modo in ('sequencia','paralelo')),
  unique nulls not distinct (empresa_id, tipo_processo, status)
);

-- Pré-requisitos: para entrar em X (etapa ou subetapa) é preciso ter passado
-- pela subetapa Y. "Passou" = há transição para Y no histórico do processo.
-- Tabela vazia = tudo livre. Ciclos e exigência de etapa posterior são recusados (regras).
create table app.prerequisitos_modelo (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid references app.empresas(id) on delete cascade,
  tipo_processo   text not null,
  alvo_tipo       text not null check (alvo_tipo in ('etapa','subetapa')),
  alvo            text not null,
  requisito       text not null,   -- sempre uma subetapa
  unique nulls not distinct (empresa_id, tipo_processo, alvo_tipo, alvo, requisito),
  foreign key (empresa_id, tipo_processo, requisito) references app.subetapas_modelo(empresa_id, tipo_processo, codigo) on delete cascade
);

create table app.checklist_modelo (
  empresa_id     uuid references app.empresas(id) on delete cascade,
  tipo_processo  text not null,
  etapa          text not null,  -- documentos exigidos para SAIR desta etapa
  tipo_documento text not null references app.tipos_documento(codigo),
  obrigatorio    boolean not null default true,
  ordem          int not null default 0,
  unique nulls not distinct (empresa_id, tipo_processo, etapa, tipo_documento),
  foreign key (empresa_id, tipo_processo, etapa) references app.etapas_modelo(empresa_id, tipo_processo, codigo) on delete cascade
);

-- Motivos de Descartado (a BKM desistiu) e de Perdido (o vendedor ou o mercado disse não).
create table app.motivos_encerramento (
  empresa_id  uuid references app.empresas(id) on delete cascade,
  status      text not null check (status in ('descartado','perdido')),
  codigo      text not null,
  nome        text not null check (length(trim(nome)) > 0),
  ordem       int  not null,
  exige_texto boolean not null default false,   -- "Outros": texto livre obrigatório
  ativo       boolean not null default true,
  unique nulls not distinct (empresa_id, status, codigo)
);

-- Categorias do entorno buscadas no Google (Places) quando o terreno é localizado.
-- Configuração: ligar ou desligar uma categoria, ou mudar o raio a pé, é migration de dados.
create table app.entorno_categorias (
  codigo       text primary key,
  nome         text not null,
  tipos_google text[] not null check (cardinality(tipos_google) > 0),
  raio_pe_m    int  not null default 1500 check (raio_pe_m between 100 and 5000),
  ordem        int  not null unique,
  ativo        boolean not null default true
);

-- ---------------------------------------------------------------------
-- Dados de configuração
-- ---------------------------------------------------------------------
insert into app.municipios (codigo_ibge, nome, uf) values ('3550308', 'São Paulo', 'SP');

-- Siglas da Lei 16.402/2016 (LPUOS). Lista inicial: conferir com a revisão vigente.
insert into app.zoneamentos (municipio_id, sigla)
select m.id, s from app.municipios m,
  unnest(array['ZEU','ZEUa','ZEUP','ZEUPa','ZEM','ZEMP','ZC','ZCa','ZC-ZEIS','ZCOR-1','ZCOR-2','ZCOR-3','ZCORa',
               'ZM','ZMa','ZMIS','ZMISa','ZEIS-1','ZEIS-2','ZEIS-3','ZEIS-4','ZEIS-5','ZDE-1','ZDE-2','ZPI-1','ZPI-2',
               'ZER-1','ZER-2','ZERa','ZPR','ZEP','ZEPAM','ZPDS','ZPDSr','ZOE','AVP-1','AVP-2','AC-1','AC-2']) s
where m.codigo_ibge = '3550308';

insert into app.entorno_categorias (codigo, nome, tipos_google, raio_pe_m, ordem) values
  ('metro_trem', 'Estação de metrô ou trem', array['subway_station','train_station','light_rail_station'], 1500, 1),
  ('shopping',   'Shopping center',          array['shopping_mall'],                                       1500, 2),
  ('hospital',   'Hospital',                 array['hospital'],                                            1500, 3);

insert into app.itens_infraestrutura (codigo, nome, ordem) values
  ('energia',     'Rede de energia na porta',  1),
  ('agua',        'Rede de água na porta',     2),
  ('esgoto',      'Rede de esgoto na porta',   3),
  ('gas',         'Gás canalizado na porta',   4),
  ('asfalto',     'Asfalto na porta',          5),
  ('drenagem',    'Drenagem pluvial',          6),
  ('iluminacao',  'Iluminação pública',        7),
  ('calcada',     'Calçada',                   8),
  ('fibra',       'Telefonia / fibra óptica',  9);

insert into app.tipos_documento (codigo, nome, categoria, validade_dias, unico_por_processo) values
  ('matricula',          'Matrícula atualizada',                 'Imóvel',    30,   true),
  ('onus_reais',         'Certidão de ônus reais',               'Imóvel',    30,   true),
  ('iptu',               'Certidão negativa de IPTU',            'Imóvel',    90,   true),
  ('certidoes_vendedor', 'Certidões pessoais do vendedor',       'Vendedor',  30,   true),
  ('planialtimetrico',   'Levantamento planialtimétrico',        'Técnico',   null, true),
  ('sondagem_spt',       'Sondagem SPT',                         'Técnico',   null, true),
  ('ambiental',          'Avaliação ambiental preliminar',       'Técnico',   null, true),
  ('minuta_promessa',    'Minuta de promessa de compra e venda', 'Contratos', null, true),
  ('proposta',           'Proposta assinada',                    'Contratos', null, false),
  ('ata_reuniao',        'Ata de reunião',                       'Reuniões',  null, false),
  ('foto',               'Foto',                                 'Mídia',     null, false),
  ('planta',             'Planta ou croqui',                     'Técnico',   null, false),
  ('outro',              'Outro documento',                      'Outros',    null, false);

-- Modelo padrão do funil (empresa_id nulo). Comprado, Perdido, Descartado e
-- Stand By não são etapas: são status do processo, que guarda a etapa e a
-- subetapa em que estava (mostra onde no funil os terrenos se perdem).
insert into app.etapas_modelo (tipo_processo, codigo, nome, ordem, sla_dias, aprova_gestor) values
  ('negociacao','triagem',    'Em Triagem',           1, 10, false),
  ('negociacao','estudos',    'Estudos Preliminares', 2, 20, false),
  ('negociacao','negociacao', 'Negociação',           3, 60, false),
  ('negociacao','contrato',   'Contrato',             4, 30, true);

insert into app.subetapas_modelo (tipo_processo, etapa, codigo, nome, ordem) values
  ('negociacao','triagem',    'aguardando_informacoes', 'Aguardando Informações',      1),
  ('negociacao','triagem',    'aguardando_documentos',  'Aguardando Documentos',       2),
  ('negociacao','triagem',    'verificacao_interna',    'Verificação Interna',         3),
  ('negociacao','estudos',    'estudo_massa',           'Estudo de Massa',             1),
  ('negociacao','estudos',    'estudo_viabilidade',     'Estudo de Viabilidade',       2),
  ('negociacao','estudos',    'analise_tecnica',        'Análise Técnica Preliminar',  3),
  ('negociacao','negociacao', 'aguardando_reuniao',     'Aguardando Primeira Reunião', 1),
  ('negociacao','negociacao', 'preparando_proposta',    'Preparando Proposta',         2),
  ('negociacao','negociacao', 'proposta_enviada',       'Proposta Enviada',            3),
  ('negociacao','negociacao', 'contra_proposta',        'Contra Proposta',             4),
  ('negociacao','contrato',   'em_elaboracao',          'Em Elaboração',               1),
  ('negociacao','contrato',   'contrato_enviado',       'Contrato Enviado',            2),
  ('negociacao','contrato',   'em_ajuste',              'Em Ajuste',                   3);

-- Compra: gestor e depois diretor. Os demais status: analista ou acima, sem aprovação.
insert into app.status_modelo (tipo_processo, status, nome, aprova_gestor, aprova_diretor, aprovacao_modo) values
  ('negociacao','comprado',   'Comprado',   true,  true,  'sequencia'),
  ('negociacao','perdido',    'Perdido',    false, false, 'sequencia'),
  ('negociacao','descartado', 'Descartado', false, false, 'sequencia'),
  ('negociacao','stand_by',   'Stand By',   false, false, 'sequencia');

-- Documentos exigidos para SAIR da etapa. A diligência do imóvel corre no
-- Contrato: só é comprado com certidões validadas e minuta.
insert into app.checklist_modelo (tipo_processo, etapa, tipo_documento, obrigatorio, ordem) values
  ('negociacao','contrato','matricula',          true,  1),
  ('negociacao','contrato','onus_reais',         true,  2),
  ('negociacao','contrato','iptu',               true,  3),
  ('negociacao','contrato','certidoes_vendedor', true,  4),
  ('negociacao','contrato','planialtimetrico',   true,  5),
  ('negociacao','contrato','sondagem_spt',       false, 6),
  ('negociacao','contrato','ambiental',          false, 7),
  ('negociacao','contrato','minuta_promessa',    true,  8);

insert into app.motivos_encerramento (status, codigo, nome, ordem, exige_texto) values
  ('descartado','tecnica',         'Inviabilidade Técnica',            1, false),
  ('descartado','financeira',      'Inviabilidade Financeira',         2, false),
  ('descartado','contratual',      'Inviabilidade Contratual',         3, false),
  ('descartado','formato_negocio', 'Inviabilidade Formato de Negócio', 4, false),
  ('descartado','garantias',       'Inviabilidade Garantias',          5, false),
  ('descartado','urbanistica',     'Inviabilidade Urbanística',        6, false),
  ('descartado','documental',      'Inviabilidade Documental',         7, false),
  ('descartado','outros',          'Outros',                           8, true),
  ('perdido',   'vendido_terceiro',   'Vendido para terceiro',                     1, false),
  ('perdido',   'desistiu_vender',    'Proprietário desistiu de vender',           2, false),
  ('perdido',   'preco_pagamento',    'Vendedor não aceitou preço ou pagamento',   3, false),
  ('perdido',   'formato',            'Vendedor não aceitou o formato (permuta etc.)', 4, false),
  ('perdido',   'garantias',          'Vendedor não aceitou as garantias',         5, false),
  ('perdido',   'sem_retorno',        'Sem retorno do proprietário',               6, false),
  ('perdido',   'outros',             'Outros',                                    7, false);

-- Empresa nova começa com uma cópia do modelo padrão.
create or replace function app.tg_copiar_configuracao()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into app.etapas_modelo (empresa_id, tipo_processo, codigo, nome, ordem, sla_dias, aprova_gestor, aprova_diretor, aprovacao_modo)
  select new.id, tipo_processo, codigo, nome, ordem, sla_dias, aprova_gestor, aprova_diretor, aprovacao_modo from app.etapas_modelo where empresa_id is null;
  insert into app.subetapas_modelo (empresa_id, tipo_processo, codigo, etapa, nome, ordem, prazo_dias, aprova_gestor, aprova_diretor, aprovacao_modo, ativo)
  select new.id, tipo_processo, codigo, etapa, nome, ordem, prazo_dias, aprova_gestor, aprova_diretor, aprovacao_modo, ativo from app.subetapas_modelo where empresa_id is null;
  insert into app.status_modelo (empresa_id, tipo_processo, status, nome, aprova_gestor, aprova_diretor, aprovacao_modo)
  select new.id, tipo_processo, status, nome, aprova_gestor, aprova_diretor, aprovacao_modo from app.status_modelo where empresa_id is null;
  insert into app.prerequisitos_modelo (empresa_id, tipo_processo, alvo_tipo, alvo, requisito)
  select new.id, tipo_processo, alvo_tipo, alvo, requisito from app.prerequisitos_modelo where empresa_id is null;
  insert into app.checklist_modelo (empresa_id, tipo_processo, etapa, tipo_documento, obrigatorio, ordem)
  select new.id, tipo_processo, etapa, tipo_documento, obrigatorio, ordem from app.checklist_modelo where empresa_id is null;
  insert into app.motivos_encerramento (empresa_id, status, codigo, nome, ordem, exige_texto, ativo)
  select new.id, status, codigo, nome, ordem, exige_texto, ativo from app.motivos_encerramento where empresa_id is null;
  -- tipos de notificação: ver notificacoes
  if to_regclass('app.tipos_notificacao') is not null then
    execute 'insert into app.tipos_notificacao (empresa_id, codigo, nome, ativo, dias_antes_padrao)
             select $1, codigo, nome, ativo, dias_antes_padrao from app.tipos_notificacao where empresa_id is null' using new.id;
  end if;
  return new;
end $$;
create trigger t_configuracao after insert on app.empresas for each row execute function app.tg_copiar_configuracao();

-- ---------------------------------------------------------------------
-- Por empresa
-- ---------------------------------------------------------------------
-- Pontos de interesse da empresa (estações, terminais, escolas, a sede...),
-- usados para medir a distância de cada terreno e traçar rotas.
-- Excluir um ponto é desligar (ativo = false): some de todos os terrenos e do mapa,
-- a exclusão fica nos logs e o ponto pode ser restaurado.
create table app.pontos_interesse (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references app.empresas(id),
  nome       text not null check (length(trim(nome)) > 0),
  categoria  text not null default 'outro' check (categoria in ('transporte','escola','saude','comercio','lazer','empresa','outro')),
  latitude   double precision not null check (latitude between -90 and 90),
  longitude  double precision not null check (longitude between -180 and 180),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);
create index on app.pontos_interesse (empresa_id) where ativo;

create table app.eixos_comerciais (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  municipio_id uuid not null references app.municipios(id),
  nome         text not null,
  descricao    text,
  ativo        boolean not null default true,
  unique (empresa_id, nome)
);

create table app.pessoas (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references app.empresas(id),
  tipo_pessoa       text not null default 'PF' check (tipo_pessoa in ('PF','PJ')),
  nome_razao_social text not null,
  cpf_cnpj          text,
  telefone          text,
  email             text,
  observacoes       text,
  criado_por        uuid default auth.uid(),
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  atualizado_por    uuid,
  -- guardado só com dígitos (normalizado por trigger)
  check (cpf_cnpj is null or (tipo_pessoa = 'PF' and cpf_cnpj ~ '^\d{11}$') or (tipo_pessoa = 'PJ' and cpf_cnpj ~ '^\d{14}$'))
);
create unique index pessoas_doc_unico on app.pessoas (empresa_id, cpf_cnpj) where cpf_cnpj is not null;

create or replace function app.tg_normalizar_pessoa()
returns trigger language plpgsql as $$
begin
  new.cpf_cnpj := nullif(regexp_replace(coalesce(new.cpf_cnpj, ''), '\D', '', 'g'), '');
  new.nome_razao_social := trim(new.nome_razao_social);
  return new;
end $$;
create trigger t_norm before insert or update on app.pessoas for each row execute function app.tg_normalizar_pessoa();

create table app.corretores (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  pessoa_id   uuid not null references app.pessoas(id),
  creci       text,
  imobiliaria text,
  observacoes text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, pessoa_id)
);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['municipios','zoneamentos','itens_infraestrutura','tipos_documento','entorno_categorias'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (true)', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
  -- configuração do funil: cada empresa vê a sua; escrita só pelas RPCs do administrador
  foreach t in array array['etapas_modelo','subetapas_modelo','status_modelo','prerequisitos_modelo','checklist_modelo','motivos_encerramento'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on app.%I for each row execute function app.tg_auditoria()', t);
  end loop;
  foreach t in array array['eixos_comerciais','pessoas','corretores','pontos_interesse'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
  end loop;
end $$;

create trigger t_aud after insert or update or delete on app.pontos_interesse for each row execute function app.tg_auditoria();
create trigger t_upd before update on app.pessoas for each row execute function app.tg_atualizado_em();
