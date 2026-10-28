-- =====================================================================
-- BKM Terrenos · 0002 · cadastros de apoio
-- Municípios, zoneamentos, itens de infraestrutura e tipos de documento:
-- configuração comum a todas as empresas.
-- Funil (etapas, subetapas, status, pré-requisitos, checklist, motivos) e
-- parâmetros urbanísticos por zona (zona_parametros, em 0002b):
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

-- Base da prefeitura consultada pela inscrição municipal (lote, poligonal,
-- zona e restrições). Uma por município; o front tem um adaptador por código
-- e abre o campo com a máscara daqui. Cidade sem base: inscrição digitada.
create table app.bases_cadastrais (
  codigo       text primary key,  -- geosampa, geosanja
  municipio_id uuid not null unique references app.municipios(id),
  nome         text not null,     -- nome do portal (GeoSampa, GeoSanja)
  rotulo       text not null,     -- como a prefeitura chama a inscrição (SQL, Inscrição imobiliária)
  mascara      text not null check (mascara ~ '^[0.\-]+$'),  -- 0 = dígito
  ordem        int  not null
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
-- e o administrador edita a sua pelo app, só por RPC (ver regras): fases,
-- etapas, subetapas, status, dependências, pré-requisitos e checklist.
-- ---------------------------------------------------------------------
-- Fase: o grande momento do terreno (Novos Negócios, Aprovação de Projetos,
-- Registro de Incorporação, Contratação Caixa, Lançamento, Obras). Cada fase
-- é um processo próprio do terreno, com etapas, status e histórico; a fase de
-- entrada (uma por empresa) é a que a oferta abre e a que tem negociação
-- (temperatura, propostas). As demais abrem quando as dependências se cumprem.
create table app.fases_modelo (
  empresa_id  uuid references app.empresas(id) on delete cascade,
  codigo      text not null,
  nome        text not null check (length(trim(nome)) > 0),
  ordem       int  not null,                                  -- ordem de exibição
  prefixo     text not null check (prefixo ~ '^[A-Z]{2,5}$'), -- código do processo: NEG-00012
  entrada     boolean not null default false,
  ativo       boolean not null default true,
  -- só na fase de entrada: a partir desta etapa, terreno com duas ou mais
  -- partes (donos que negociam separado) tem uma negociação por parte; nulo = nunca divide
  etapa_partes text,
  check (etapa_partes is null or entrada),
  unique nulls not distinct (empresa_id, codigo),
  unique nulls not distinct (empresa_id, prefixo)
);
create unique index fases_uma_entrada on app.fases_modelo (empresa_id) nulls not distinct where entrada;

-- Dependências entre fases: a fase abre quando, no mesmo terreno, a fase
-- requisito foi concluída (conclusao) ou passou pela etapa ou subetapa
-- indicada. Todas precisam valer. Fase sem dependência (fora a de entrada)
-- só abre à mão.
create table app.fase_dependencias (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid references app.empresas(id) on delete cascade,
  fase            text not null,
  requisito_fase  text not null,
  requisito_tipo  text not null check (requisito_tipo in ('conclusao','etapa','subetapa')),
  requisito       text,     -- etapa ou subetapa da fase requisito; nulo na conclusão
  check ((requisito_tipo = 'conclusao') = (requisito is null)),
  check (fase <> requisito_fase),
  unique nulls not distinct (empresa_id, fase, requisito_fase, requisito_tipo, requisito),
  foreign key (empresa_id, fase) references app.fases_modelo(empresa_id, codigo) on delete cascade,
  foreign key (empresa_id, requisito_fase) references app.fases_modelo(empresa_id, codigo) on delete cascade
);

-- Aprovação: "gestor" e "diretor" marcáveis; com os dois, em sequência
-- (primeiro o gestor) ou em paralelo (os dois ao mesmo tempo).
create table app.etapas_modelo (
  empresa_id      uuid references app.empresas(id) on delete cascade,
  fase            text not null,
  codigo          text not null,
  nome            text not null check (length(trim(nome)) > 0),
  ordem           int  not null,
  sla_dias        int  check (sla_dias > 0),
  aprova_gestor   boolean not null default false,
  aprova_diretor  boolean not null default false,
  aprovacao_modo  text not null default 'sequencia' check (aprovacao_modo in ('sequencia','paralelo')),
  unique nulls not distinct (empresa_id, fase, codigo),
  unique nulls not distinct (empresa_id, fase, ordem) deferrable initially deferred,
  foreign key (empresa_id, fase) references app.fases_modelo(empresa_id, codigo) on delete cascade
);

-- Subetapas: o card está sempre numa; dentro da etapa, livres e sem ordem
-- obrigatória (ordem = coluna do kanban). Código único na fase,
-- para servir de pré-requisito sem dizer a etapa.
create table app.subetapas_modelo (
  empresa_id      uuid references app.empresas(id) on delete cascade,
  fase            text not null,
  codigo          text not null,
  etapa           text not null,
  nome            text not null check (length(trim(nome)) > 0),
  ordem           int  not null,
  prazo_dias      int  check (prazo_dias > 0),   -- opcional: SLA e aviso de atraso
  aprova_gestor   boolean not null default false,
  aprova_diretor  boolean not null default false,
  aprovacao_modo  text not null default 'sequencia' check (aprovacao_modo in ('sequencia','paralelo')),
  ativo           boolean not null default true,  -- desativar no lugar de apagar (histórico lê o nome)
  unique nulls not distinct (empresa_id, fase, codigo),
  unique nulls not distinct (empresa_id, fase, etapa, codigo),
  foreign key (empresa_id, fase, etapa) references app.etapas_modelo(empresa_id, fase, codigo) on delete cascade
);

-- Status de encerramento da fase e quem precisa aprovar cada um. Concluído
-- tem o nome da fase (Comprado, Aprovado, Obra entregue...). Status sem
-- linha não existe na fase (Perdido só em Novos Negócios).
create table app.status_modelo (
  empresa_id      uuid references app.empresas(id) on delete cascade,
  fase            text not null,
  status          text not null check (status in ('concluido','perdido','descartado','stand_by')),
  nome            text not null,
  aprova_gestor   boolean not null default false,
  aprova_diretor  boolean not null default false,
  aprovacao_modo  text not null default 'sequencia' check (aprovacao_modo in ('sequencia','paralelo')),
  unique nulls not distinct (empresa_id, fase, status),
  foreign key (empresa_id, fase) references app.fases_modelo(empresa_id, codigo) on delete cascade
);

-- Pré-requisitos: para entrar em X (etapa ou subetapa) é preciso ter passado
-- pela subetapa Y. "Passou" = há transição para Y no histórico do processo.
-- Tabela vazia = tudo livre. Ciclos e exigência de etapa posterior são recusados (regras).
create table app.prerequisitos_modelo (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid references app.empresas(id) on delete cascade,
  fase            text not null,
  alvo_tipo       text not null check (alvo_tipo in ('etapa','subetapa')),
  alvo            text not null,
  requisito       text not null,   -- sempre uma subetapa
  unique nulls not distinct (empresa_id, fase, alvo_tipo, alvo, requisito),
  foreign key (empresa_id, fase, requisito) references app.subetapas_modelo(empresa_id, fase, codigo) on delete cascade
);

create table app.checklist_modelo (
  empresa_id     uuid references app.empresas(id) on delete cascade,
  fase            text not null,
  etapa          text not null,  -- documentos exigidos para SAIR desta etapa
  tipo_documento text not null references app.tipos_documento(codigo),
  obrigatorio    boolean not null default true,
  ordem          int not null default 0,
  unique nulls not distinct (empresa_id, fase, etapa, tipo_documento),
  foreign key (empresa_id, fase, etapa) references app.etapas_modelo(empresa_id, fase, codigo) on delete cascade
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
  ('hospital',   'Hospital',                 array['hospital'],                                            1500, 3),
  ('escola',     'Escola ou creche',         array['school','preschool','primary_school','secondary_school'], 1500, 4),
  ('supermercado','Supermercado',            array['supermarket'],                                         1500, 5),
  ('parque',     'Parque',                   array['park'],                                                1500, 6);

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
  ('lote_pdf',           'Planta do lote da prefeitura (PDF)',   'Técnico',   null, false),
  ('lote_dxf',           'Desenho do lote da prefeitura (DXF)',  'Técnico',   null, false),
  ('topo_pdf',           'Topográfico preliminar (PDF)',         'Técnico',   null, false),
  ('topo_dxf',           'Topográfico preliminar (DXF + imagem)', 'Técnico',  null, false),
  ('outro',              'Outro documento',                      'Outros',    null, false);

-- Modelo padrão do funil (empresa_id nulo). Concluído, Perdido, Descartado e
-- Stand By não são etapas: são status do processo da fase, que guarda a etapa
-- e a subetapa em que estava (mostra onde no funil os terrenos se perdem).
-- As etapas das fases depois de Novos Negócios são um ponto de partida: o
-- administrador ajusta em Configurações › Funil.
insert into app.fases_modelo (codigo, nome, ordem, prefixo, entrada) values
  ('novos_negocios', 'Novos Negócios',           1, 'NEG', true),
  ('aprovacao',      'Aprovação de Projetos',    2, 'APR', false),
  ('incorporacao',   'Registro de Incorporação', 3, 'INC', false),
  ('caixa',          'Contratação Caixa',        4, 'CEF', false),
  ('lancamento',     'Lançamento',               5, 'LAN', false),
  ('obras',          'Obras',                    6, 'OBR', false),
  ('entregue',       'Entregue',                 7, 'ENT', false);

-- Cada fase abre quando a anterior é concluída.
insert into app.fase_dependencias (fase, requisito_fase, requisito_tipo) values
  ('aprovacao',    'novos_negocios', 'conclusao'),
  ('incorporacao', 'aprovacao',      'conclusao'),
  ('caixa',        'incorporacao',   'conclusao'),
  ('lancamento',   'caixa',          'conclusao'),
  ('obras',        'lancamento',     'conclusao'),
  ('entregue',     'obras',          'conclusao');

insert into app.etapas_modelo (fase, codigo, nome, ordem, sla_dias, aprova_gestor) values
  ('novos_negocios','triagem',     'Em Triagem',            1, 10,  false),
  ('novos_negocios','estudos',     'Estudos Preliminares',  2, 20,  false),
  ('novos_negocios','negociacao',  'Negociação',            3, 60,  false),
  ('novos_negocios','contrato',    'Contrato',              4, 30,  true),
  ('aprovacao',     'projeto',     'Projeto',               1, 60,  false),
  ('aprovacao',     'prefeitura',  'Análise na Prefeitura', 2, 120, false),
  ('aprovacao',     'alvaras',     'Alvarás',               3, 30,  false),
  ('incorporacao',  'memorial',    'Memorial e Certidões',  1, 30,  false),
  ('incorporacao',  'cartorio',    'Cartório',              2, 45,  false),
  ('caixa',         'analise',     'Análise Caixa',         1, 60,  false),
  ('caixa',         'contratacao', 'Contratação',           2, 30,  true),
  ('lancamento',    'preparacao',  'Preparação',            1, 60,  false),
  ('lancamento',    'vendas',      'Vendas Iniciais',       2, 60,  false),
  ('obras',         'inicio',      'Início',                1, 60,  false),
  ('obras',         'execucao',    'Execução',              2, 540, false),
  ('obras',         'entrega',     'Entrega',               3, 60,  false),
  ('entregue',      'pos_entrega', 'Pós-entrega',           1, null, false);

insert into app.subetapas_modelo (fase, etapa, codigo, nome, ordem) values
  ('novos_negocios','triagem',     'aguardando_informacoes', 'Aguardando Informações',      1),
  ('novos_negocios','triagem',     'aguardando_documentos',  'Aguardando Documentos',       2),
  ('novos_negocios','triagem',     'verificacao_interna',    'Verificação Interna',         3),
  ('novos_negocios','estudos',     'estudo_massa',           'Estudo de Massa',             1),
  ('novos_negocios','estudos',     'estudo_viabilidade',     'Estudo de Viabilidade',       2),
  ('novos_negocios','estudos',     'analise_tecnica',        'Análise Técnica Preliminar',  3),
  ('novos_negocios','negociacao',  'aguardando_reuniao',     'Aguardando Primeira Reunião', 1),
  ('novos_negocios','negociacao',  'preparando_proposta',    'Preparando Proposta',         2),
  ('novos_negocios','negociacao',  'proposta_enviada',       'Proposta Enviada',            3),
  ('novos_negocios','negociacao',  'contra_proposta',        'Contra Proposta',             4),
  ('novos_negocios','contrato',    'em_elaboracao',          'Em Elaboração',               1),
  ('novos_negocios','contrato',    'contrato_enviado',       'Contrato Enviado',            2),
  ('novos_negocios','contrato',    'em_ajuste',              'Em Ajuste',                   3),
  ('aprovacao',     'projeto',     'estudo_implantacao',     'Estudo de Implantação',       1),
  ('aprovacao',     'projeto',     'projeto_legal',          'Projeto Legal',               2),
  ('aprovacao',     'prefeitura',  'protocolado',            'Protocolado',                 1),
  ('aprovacao',     'prefeitura',  'comunique_se',           'Comunique-se',                2),
  ('aprovacao',     'alvaras',     'alvara_aprovacao',       'Alvará de Aprovação',         1),
  ('aprovacao',     'alvaras',     'alvara_execucao',        'Alvará de Execução',          2),
  ('incorporacao',  'memorial',    'memorial_incorporacao',  'Memorial de Incorporação',    1),
  ('incorporacao',  'memorial',    'certidoes',              'Certidões',                   2),
  ('incorporacao',  'cartorio',    'prenotado',              'Prenotado',                   1),
  ('incorporacao',  'cartorio',    'exigencias',             'Exigências do Cartório',      2),
  ('caixa',         'analise',     'engenharia',             'Engenharia',                  1),
  ('caixa',         'analise',     'juridico',               'Jurídico',                    2),
  ('caixa',         'analise',     'risco',                  'Risco',                       3),
  ('caixa',         'contratacao', 'demanda_minima',         'Demanda Mínima',              1),
  ('caixa',         'contratacao', 'assinatura',             'Assinatura',                  2),
  ('lancamento',    'preparacao',  'produto',                'Produto e Tabela',            1),
  ('lancamento',    'preparacao',  'stand',                  'Stand e Decorado',            2),
  ('lancamento',    'vendas',      'evento',                 'Evento de Lançamento',        1),
  ('lancamento',    'vendas',      'vendas_iniciais',        'Vendas Iniciais',             2),
  ('obras',         'inicio',      'mobilizacao',            'Mobilização',                 1),
  ('obras',         'inicio',      'fundacao',               'Fundação',                    2),
  ('obras',         'execucao',    'estrutura',              'Estrutura',                   1),
  ('obras',         'execucao',    'vedacoes',               'Vedações e Instalações',      2),
  ('obras',         'execucao',    'acabamento',             'Acabamento',                  3),
  ('obras',         'entrega',     'habite_se',              'Vistoria e Habite-se',        1),
  ('obras',         'entrega',     'entrega_chaves',         'Entrega das Chaves',          2),
  ('entregue',      'pos_entrega', 'assistencia_tecnica',    'Assistência Técnica',         1),
  ('entregue',      'pos_entrega', 'garantia',               'Em Garantia',                 2);

-- Terreno com vários donos: cada parte negocia separado a partir da Negociação.
update app.fases_modelo set etapa_partes = 'negociacao' where empresa_id is null and codigo = 'novos_negocios';

-- Concluir: em Novos Negócios é a compra (gestor e depois diretor); nas
-- demais, sem aprovação. Perdido (o vendedor disse não) só em Novos Negócios.
insert into app.status_modelo (fase, status, nome, aprova_gestor, aprova_diretor, aprovacao_modo) values
  ('novos_negocios','concluido',  'Comprado',             true,  true,  'sequencia'),
  ('novos_negocios','perdido',    'Perdido',              false, false, 'sequencia'),
  ('novos_negocios','descartado', 'Descartado',           false, false, 'sequencia'),
  ('novos_negocios','stand_by',   'Stand By',             false, false, 'sequencia'),
  ('aprovacao',     'concluido',  'Aprovado',             false, false, 'sequencia'),
  ('incorporacao',  'concluido',  'Incorporação registrada', false, false, 'sequencia'),
  ('caixa',         'concluido',  'Contratado',           false, false, 'sequencia'),
  ('lancamento',    'concluido',  'Lançado',              false, false, 'sequencia'),
  ('obras',         'concluido',  'Obra entregue',        false, false, 'sequencia'),
  ('entregue',      'concluido',  'Garantia encerrada',   false, false, 'sequencia');
insert into app.status_modelo (fase, status, nome)
select f, s, n from unnest(array['aprovacao','incorporacao','caixa','lancamento','obras','entregue']) f,
  (values ('descartado','Descartado'), ('stand_by','Stand By')) v(s, n)
where f <> 'entregue' or s = 'stand_by';

-- Documentos exigidos para SAIR da etapa. A diligência do imóvel corre no
-- Contrato: só é comprado com certidões validadas e minuta.
insert into app.checklist_modelo (fase, etapa, tipo_documento, obrigatorio, ordem) values
  ('novos_negocios','contrato','matricula',          true,  1),
  ('novos_negocios','contrato','onus_reais',         true,  2),
  ('novos_negocios','contrato','iptu',               true,  3),
  ('novos_negocios','contrato','certidoes_vendedor', true,  4),
  ('novos_negocios','contrato','planialtimetrico',   true,  5),
  ('novos_negocios','contrato','sondagem_spt',       false, 6),
  ('novos_negocios','contrato','ambiental',          false, 7),
  ('novos_negocios','contrato','minuta_promessa',    true,  8);

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
  insert into app.fases_modelo (empresa_id, codigo, nome, ordem, prefixo, entrada, ativo, etapa_partes)
  select new.id, codigo, nome, ordem, prefixo, entrada, ativo, etapa_partes from app.fases_modelo where empresa_id is null;
  insert into app.fase_dependencias (empresa_id, fase, requisito_fase, requisito_tipo, requisito)
  select new.id, fase, requisito_fase, requisito_tipo, requisito from app.fase_dependencias where empresa_id is null;
  insert into app.etapas_modelo (empresa_id, fase, codigo, nome, ordem, sla_dias, aprova_gestor, aprova_diretor, aprovacao_modo)
  select new.id, fase, codigo, nome, ordem, sla_dias, aprova_gestor, aprova_diretor, aprovacao_modo from app.etapas_modelo where empresa_id is null;
  insert into app.subetapas_modelo (empresa_id, fase, codigo, etapa, nome, ordem, prazo_dias, aprova_gestor, aprova_diretor, aprovacao_modo, ativo)
  select new.id, fase, codigo, etapa, nome, ordem, prazo_dias, aprova_gestor, aprova_diretor, aprovacao_modo, ativo from app.subetapas_modelo where empresa_id is null;
  insert into app.status_modelo (empresa_id, fase, status, nome, aprova_gestor, aprova_diretor, aprovacao_modo)
  select new.id, fase, status, nome, aprova_gestor, aprova_diretor, aprovacao_modo from app.status_modelo where empresa_id is null;
  insert into app.prerequisitos_modelo (empresa_id, fase, alvo_tipo, alvo, requisito)
  select new.id, fase, alvo_tipo, alvo, requisito from app.prerequisitos_modelo where empresa_id is null;
  insert into app.checklist_modelo (empresa_id, fase, etapa, tipo_documento, obrigatorio, ordem)
  select new.id, fase, etapa, tipo_documento, obrigatorio, ordem from app.checklist_modelo where empresa_id is null;
  insert into app.motivos_encerramento (empresa_id, status, codigo, nome, ordem, exige_texto, ativo)
  select new.id, status, codigo, nome, ordem, exige_texto, ativo from app.motivos_encerramento where empresa_id is null;
  insert into app.zona_parametros (empresa_id, zoneamento_id, tipo, uso, macrozona, lote_area_min_m2, lote_area_max_m2, permitido,
    ca_minimo, ca_basico, ca_maximo, to_maximo, to_lote_grande, to_corte_m2, gabarito_m, gabarito_sem_limite, recuo_frente_m,
    recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m,
    outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao)
  select new.id, zoneamento_id, tipo, uso, macrozona, lote_area_min_m2, lote_area_max_m2, permitido,
    ca_minimo, ca_basico, ca_maximo, to_maximo, to_lote_grande, to_corte_m2, gabarito_m, gabarito_sem_limite, recuo_frente_m,
    recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m,
    outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao
  from app.zona_parametros where empresa_id is null and ativo;
  -- tipos de notificação: ver notificacoes
  if to_regclass('app.tipos_notificacao') is not null then
    execute 'insert into app.tipos_notificacao (empresa_id, codigo, nome, ativo, dias_antes_padrao)
             select $1, codigo, nome, ativo, dias_antes_padrao from app.tipos_notificacao where empresa_id is null' using new.id;
  end if;
  -- lista de despesas do estudo de viabilidade: ver viabilidade
  if to_regclass('app.viabilidade_despesas') is not null then
    execute 'insert into app.viabilidade_despesas (empresa_id, codigo, nome, grupo, tipo_padrao, valor_padrao, deduz_vgv, ordem, ativo)
             select $1, codigo, nome, grupo, tipo_padrao, valor_padrao, deduz_vgv, ordem, ativo from app.viabilidade_despesas where empresa_id is null' using new.id;
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
  foreach t in array array['municipios','zoneamentos','bases_cadastrais','itens_infraestrutura','tipos_documento','entorno_categorias'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (true)', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
  -- configuração do funil: cada empresa vê a sua; escrita só pelas RPCs do administrador
  foreach t in array array['fases_modelo','fase_dependencias','etapas_modelo','subetapas_modelo','status_modelo','prerequisitos_modelo','checklist_modelo','motivos_encerramento'] loop
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
