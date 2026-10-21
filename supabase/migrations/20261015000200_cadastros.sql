-- =====================================================================
-- BKM Terrenos · 0002 · cadastros de apoio
-- Municípios, zoneamentos, itens de infraestrutura, tipos de documento,
-- etapas e checklist: configuração comum a todas as empresas.
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

create table app.etapas_modelo (
  tipo_processo text not null,
  codigo        text not null,
  nome          text not null,
  ordem         int  not null,
  sla_dias      int,
  exige_gestor  boolean not null default false,
  primary key (tipo_processo, codigo),
  unique (tipo_processo, ordem)
);

create table app.checklist_modelo (
  tipo_processo  text not null,
  etapa          text not null,  -- documentos exigidos para SAIR desta etapa
  tipo_documento text not null references app.tipos_documento(codigo),
  obrigatorio    boolean not null default true,
  ordem          int not null default 0,
  primary key (tipo_processo, etapa, tipo_documento),
  foreign key (tipo_processo, etapa) references app.etapas_modelo(tipo_processo, codigo)
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

-- Etapas da negociação. Ganha, Perdida e Stand By não são etapas: são status
-- do processo (guardam a etapa em que estava). Dentro de "Negociação", a fase
-- (proposta enviada, contraproposta, negociações finais) vem das propostas.
insert into app.etapas_modelo (tipo_processo, codigo, nome, ordem, sla_dias, exige_gestor) values
  ('negociacao','recebido',            'Recebido',            1,  5, false),
  ('negociacao','viabilidade_inicial', 'Viabilidade inicial', 2, 10, false),
  ('negociacao','negociacao',          'Negociação',          3, 60, false),
  ('negociacao','minutagem',           'Minutagem',           4, 30, true);

-- Documentos exigidos para SAIR da etapa. A diligência do imóvel corre na
-- Minutagem: só é ganha com certidões validadas e minuta.
insert into app.checklist_modelo (tipo_processo, etapa, tipo_documento, obrigatorio, ordem) values
  ('negociacao','minutagem','matricula',          true,  1),
  ('negociacao','minutagem','onus_reais',         true,  2),
  ('negociacao','minutagem','iptu',               true,  3),
  ('negociacao','minutagem','certidoes_vendedor', true,  4),
  ('negociacao','minutagem','planialtimetrico',   true,  5),
  ('negociacao','minutagem','sondagem_spt',       false, 6),
  ('negociacao','minutagem','ambiental',          false, 7),
  ('negociacao','minutagem','minuta_promessa',    true,  8);

-- ---------------------------------------------------------------------
-- Por empresa
-- ---------------------------------------------------------------------
-- Pontos de interesse da empresa (estações, terminais, escolas, a sede...),
-- usados para medir a distância de cada terreno e traçar rotas.
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
  foreach t in array array['municipios','zoneamentos','itens_infraestrutura','tipos_documento','etapas_modelo','checklist_modelo','entorno_categorias'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (true)', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
  foreach t in array array['eixos_comerciais','pessoas','corretores','pontos_interesse'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
  end loop;
end $$;

create trigger t_upd before update on app.pessoas for each row execute function app.tg_atualizado_em();
