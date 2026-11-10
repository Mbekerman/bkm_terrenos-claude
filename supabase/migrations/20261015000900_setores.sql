-- =====================================================================
-- BKM Terrenos · 0009 · setores censitários e camadas do IBGE (renda, densidade e perfil da população)
-- Setores do Censo 2022 com os valores do IBGE como vieram (renda do
-- responsável, pessoas, domicílios) e a renda familiar ESTIMADA calculada
-- por uma metodologia versionada (pedido do Moisés, 24/out/2026):
--   renda_familiar_estimada_atual = V06004 × fator familiar × fator PNAD
-- A estimativa nunca é gravada no lugar do V06004: é uma visão sobre ele.
-- Dados públicos de referência, iguais para todas as empresas e só de
-- leitura; a carga vem de tools/setores/gerar.py (carga.sql), com a chave de
-- serviço. Mesmos valores de metodologia, faixas e cores do protótipo
-- (tools/setores/metodologia_renda.json; o teste confere).
-- =====================================================================

create table app.setores_censitarios (
  cd_setor          text primary key check (cd_setor ~ '^\d{15}$'),
  censo_ano         smallint not null default 2022,
  municipio_codigo  char(7) generated always as (left(cd_setor, 7)) stored references app.municipios(codigo_ibge),
  area_ponderacao   text check (area_ponderacao ~ '^\d{10}$'),   -- Composição das Áreas de Ponderação (IBGE, 1/set/2026)
  distrito          text,
  area_km2          numeric,                                       -- AREA_KM2 da malha do IBGE
  geom              extensions.geometry(MultiPolygon, 4326) not null,
  fonte_geometria   text not null
);
create index on app.setores_censitarios using gist (geom);
create index on app.setores_censitarios (municipio_codigo);

-- o que cada código do IBGE quer dizer e de qual arquivo veio
create table app.setor_variaveis (
  codigo     text primary key,
  descricao  text not null,
  tema       text not null,
  unidade    text not null check (unidade in ('pessoas','domicilios','reais','moradores')),
  arquivo    text not null
);
insert into app.setor_variaveis (codigo, descricao, tema, unidade, arquivo) values
  ('V0001',  'Total de pessoas', 'Básico', 'pessoas', 'SP_setores_CD2022 (malha com atributos)'),
  ('V0007',  'Total de domicílios particulares ocupados (DPPO + DPIO)', 'Básico', 'domicilios', 'SP_setores_CD2022 (malha com atributos)'),
  ('V06001', 'Pessoas responsáveis em domicílios particulares permanentes ocupados', 'Renda do responsável', 'domicilios', 'Agregados_por_setores_renda_responsavel_BR_20260508'),
  ('V06002', 'Moradores em domicílios particulares permanentes ocupados', 'Renda do responsável', 'moradores', 'Agregados_por_setores_renda_responsavel_BR_20260508'),
  ('V06004', 'Valor do rendimento nominal médio mensal das pessoas responsáveis com rendimentos por domicílios particulares permanentes ocupados', 'Renda do responsável', 'reais', 'Agregados_por_setores_renda_responsavel_BR_20260508'),
  ('V06006', 'Valor do rendimento nominal mediano mensal das pessoas responsáveis com rendimentos por domicílios particulares permanentes ocupados', 'Renda do responsável', 'reais', 'Agregados_por_setores_renda_responsavel_BR_20260508');
-- perfil da população do entorno (tools/setores/demografia.json): idade e sexo, domicílios por tamanho e espécie, vagos
insert into app.setor_variaveis (codigo, descricao, tema, unidade, arquivo) values
  ('V0008', 'Total de Domicílios Particulares  de Uso Ocasional (DPPUO)', 'Básico', 'domicilios', 'Agregados_por_setores_basico_BR_20260520'),
  ('V0009', 'Total de Domicílios Particulares Permanentes Vagos (DPPV)', 'Básico', 'domicilios', 'Agregados_por_setores_basico_BR_20260520'),
  ('V00001', 'Domicílios Particulares Permanentes Ocupados', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00002', 'Domicílios Particulares Improvisados Ocupados', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00005', 'Domicílios Particulares Permanentes Ocupados, Quantidade de moradores', 'Características do domicílio 1', 'moradores', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00006', 'Domicílios Particulares Improvisados Ocupados, Quantidade de moradores', 'Características do domicílio 1', 'moradores', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00017', 'Domicílios Particulares Permanentes Ocupados, Com 1 morador no domicílio', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00018', 'Domicílios Particulares Permanentes Ocupados, Com 2 moradores no domicílio', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00019', 'Domicílios Particulares Permanentes Ocupados, Com 3 moradores no domicílio', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00020', 'Domicílios Particulares Permanentes Ocupados, Com 4 moradores no domicílio', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00047', 'Domicílios Particulares Permanentes Ocupados, Tipo de espécie é casa', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00048', 'Domicílios Particulares Permanentes Ocupados, Tipo de espécie é casa de vila ou em condomínio', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00049', 'Domicílios Particulares Permanentes Ocupados, Tipo de espécie é apartamento', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00050', 'Domicílios Particulares Permanentes Ocupados, Tipo de espécie é habitação em casa de cômodos ou cortiço', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V00052', 'Domicílios Particulares Permanentes Ocupados, Tipo de espécie é estrutura residencial permanente degradada ou inacabada', 'Características do domicílio 1', 'domicilios', 'Agregados_por_setores_caracteristicas_domicilio1_BR_20261021'),
  ('V01007', 'Sexo masculino', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01008', 'Sexo feminino', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01009', 'Sexo masculino, 0 a 4 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01010', 'Sexo masculino, 5 a 9 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01011', 'Sexo masculino, 10 a 14 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01012', 'Sexo masculino, 15 a 19 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01013', 'Sexo masculino, 20 a 24 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01014', 'Sexo masculino, 25 a 29 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01015', 'Sexo masculino, 30 a 39 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01016', 'Sexo masculino, 40 a 49 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01017', 'Sexo masculino, 50 a 59 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01018', 'Sexo masculino, 60 a 69 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01019', 'Sexo masculino, 70 anos ou mais', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01020', 'Sexo feminino, 0 a 4 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01021', 'Sexo feminino, 5 a 9 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01022', 'Sexo feminino, 10 a 14 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01023', 'Sexo feminino, 15 a 19 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01024', 'Sexo feminino, 20 a 24 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01025', 'Sexo feminino, 25 a 29 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01026', 'Sexo feminino, 30 a 39 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01027', 'Sexo feminino, 40 a 49 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01028', 'Sexo feminino, 50 a 59 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01029', 'Sexo feminino, 60 a 69 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01030', 'Sexo feminino, 70 anos ou mais', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01031', '0 a 4 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01032', '5 a 9 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01033', '10 a 14 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01034', '15 a 19 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01035', '20 a 24 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01036', '25 a 29 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01037', '30 a 39 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01038', '40 a 49 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01039', '50 a 59 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01040', '60 a 69 anos', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR'),
  ('V01041', '70 anos ou mais', 'Demografia', 'pessoas', 'Agregados_por_setores_demografia_BR');

-- valor do IBGE como veio; sem valor divulgado fica nulo, com o motivo (nunca zero)
create table app.setor_valores (
  cd_setor  text not null references app.setores_censitarios(cd_setor) on delete cascade,
  variavel  text not null references app.setor_variaveis(codigo),
  valor     numeric,
  situacao  text not null default 'divulgado' check (situacao in ('divulgado','sigilo','sem_valor')),
  primary key (cd_setor, variavel),
  check ((valor is null) = (situacao <> 'divulgado'))
);

-- metodologia da renda familiar estimada: uma vigente; trocar a PNAD = nova versão
create table app.metodologias_renda (
  versao               int primary key,
  censo_ano            smallint not null,
  variavel_base        text not null references app.setor_variaveis(codigo),
  fator_familiar       numeric(8,4) not null check (fator_familiar > 0),
  fator_familiar_origem text not null,
  pnad_ano_base        smallint not null,
  pnad_valor_base      numeric not null check (pnad_valor_base > 0),
  pnad_ano_atual       smallint not null check (pnad_ano_atual >= pnad_ano_base),
  pnad_valor_atual     numeric not null check (pnad_valor_atual > 0),
  fator_pnad           numeric generated always as (pnad_valor_atual / pnad_valor_base) stored,
  pnad_fonte           text not null,
  distorcida_razao     numeric not null default 3,   -- média acima de N vezes a mediana: "média distorcida por poucas rendas altas"
  vigente              boolean not null default false,
  criado_em            timestamptz not null default now()
);
create unique index metodologias_renda_vigente on app.metodologias_renda (vigente) where vigente;
insert into app.metodologias_renda (versao, censo_ano, variavel_base, fator_familiar, fator_familiar_origem,
  pnad_ano_base, pnad_valor_base, pnad_ano_atual, pnad_valor_atual, pnad_fonte, distorcida_razao, vigente) values
  (1, 2022, 'V06004', 1.6,
   'Decisão do Moisés (24/out/2026): fator único de 1,6 para a capital, igual em todos os setores. Medidas de apoio: Estado de São Paulo 1,6102 nos microdados públicos da amostra do Censo 2022 (renda domiciliar média D0350 ÷ renda média do responsável P1110, P0170 = 1, peso D0110: R$ 6.156,18 ÷ R$ 3.823,32); capital estimada em 1,576 pela proporção entre capital e Estado nas tabelas oficiais (os microdados públicos não descem abaixo da UF). Aplicado do mesmo jeito a São José dos Campos (25/out/2026), sem medida própria da cidade: os microdados públicos não descem abaixo da UF',
   2022, 2148, 2025, 2956, 'PNAD Contínua, rendimento domiciliar per capita do Estado de São Paulo (Lei Complementar 143/2013)', 3, true);

-- faixas do mapa (decisão de produto, nunca quantis; R$ 13 mil = teto da Faixa 4 do MCMV 2026; cores: amarelo-claro ao vinho até 13 mil (MCMV), azuis de 13 a 22 mil e verdes acima, mais escuro = mais renda): o limite de cima entra na faixa,
-- a renda é arredondada para reais antes de classificar; a última não tem limite
create table app.renda_faixas (
  ordem   smallint primary key,
  ate     numeric unique,
  rotulo  text not null,
  cor     text not null check (cor ~ '^#[0-9a-f]{6}$'),
  check ((ate is null) = (ordem = 16))
);
insert into app.renda_faixas (ordem, ate, rotulo, cor) values
  (1, 2000, 'Até R$ 2.000', '#fff198'), (2, 3000, 'R$ 2.000 – 3.000', '#fed559'),
  (3, 4000, 'R$ 3.000 – 4.000', '#feb600'), (4, 5000, 'R$ 4.000 – 5.000', '#fa9500'),
  (5, 6000, 'R$ 5.000 – 6.000', '#f4511e'), (6, 7000, 'R$ 6.000 – 7.000', '#d32f2f'),
  (7, 8000, 'R$ 7.000 – 8.000', '#a0522d'), (8, 9000, 'R$ 8.000 – 9.000', '#7a4a26'),
  (9, 10000, 'R$ 9.000 – 10.000', '#833431'), (10, 13000, 'R$ 10.000 – 13.000', '#6e202c'),
  (11, 15000, 'R$ 13.000 – 15.000', '#97d6ff'), (12, 18000, 'R$ 15.000 – 18.000', '#70b2e7'),
  (13, 22000, 'R$ 18.000 – 22.000', '#4c8ecb'), (14, 25000, 'R$ 22.000 – 25.000', '#9ccc65'),
  (15, 30000, 'R$ 25.000 – 30.000', '#43a047'), (16, null, 'Acima de R$ 30.000', '#1b5e20');

create or replace function app.renda_faixa(p_valor numeric) returns smallint
language sql stable set search_path = '' as $$
  select f.ordem from app.renda_faixas f
  where p_valor is not null and (f.ate is null or round(p_valor) <= f.ate)
  order by f.ordem limit 1 $$;

-- faixas da densidade demográfica bruta (hab/km²; decisão de produto, nunca quantis; verde-água ao
-- verde-escuro): a 0 é "sem moradores" (zero de verdade); o limite de cima entra na faixa, sem arredondar;
-- a última não tem limite (tools/setores/metodologia_densidade.json; o teste confere)
create table app.densidade_faixas (
  ordem   smallint primary key check (ordem between 0 and 9),
  ate     numeric unique,
  rotulo  text not null,
  cor     text not null check (cor ~ '^#[0-9a-f]{6}$'),
  check ((ate is null) = (ordem = 9))
);
insert into app.densidade_faixas (ordem, ate, rotulo, cor) values
  (0, 0, 'Sem moradores', '#bdbdbd'), (1, 2500, 'Até 2.500', '#d4efe4'),
  (2, 5000, '2.500 – 5.000', '#a8dfcb'), (3, 10000, '5.000 – 10.000', '#7ccdb1'),
  (4, 15000, '10.000 – 15.000', '#54b997'), (5, 20000, '15.000 – 20.000', '#34a07f'),
  (6, 30000, '20.000 – 30.000', '#1f8668'), (7, 50000, '30.000 – 50.000', '#136b53'),
  (8, 100000, '50.000 – 100.000', '#0a5140'), (9, null, 'Acima de 100.000', '#03382c');

create or replace function app.densidade_faixa(p_valor numeric) returns smallint
language sql stable set search_path = '' as $$
  select f.ordem from app.densidade_faixas f
  where p_valor is not null and (f.ate is null or p_valor <= f.ate)
  order by f.ordem limit 1 $$;

-- um setor por linha: os valores originais e a estimativa pela metodologia vigente
create view app.setores_renda with (security_invoker = true) as
with v as (
  select cd_setor,
    max(valor) filter (where variavel = 'V0001')  as pessoas,
    max(valor) filter (where variavel = 'V0007')  as domicilios,
    max(valor) filter (where variavel = 'V06001') as responsaveis,
    max(valor) filter (where variavel = 'V06002') as moradores_dppo,
    max(valor) filter (where variavel = 'V06004') as v06004_original,
    max(situacao) filter (where variavel = 'V06004') as situacao_v06004,
    max(valor) filter (where variavel = 'V06006') as v06006_original
  from app.setor_valores group by cd_setor)
select s.cd_setor, s.municipio_codigo, s.area_ponderacao, s.distrito, s.area_km2,
  v.pessoas, v.domicilios, v.responsaveis, v.moradores_dppo,
  v.v06004_original, coalesce(v.situacao_v06004, 'sem_linha') as situacao_renda,
  v.v06004_original                                   as renda_responsavel_censo_2022,
  v.v06006_original                                   as renda_responsavel_mediana_2022,
  m.fator_familiar,
  round(v.v06004_original * m.fator_familiar, 2)      as renda_familiar_estimada_2022,
  m.fator_pnad                                        as fator_atualizacao_pnad,
  round(v.v06004_original * m.fator_familiar * m.fator_pnad, 2) as renda_familiar_estimada_atual,
  app.renda_faixa(v.v06004_original * m.fator_familiar * m.fator_pnad) as faixa,
  coalesce(v.v06004_original > m.distorcida_razao * v.v06006_original, false) as media_distorcida,
  m.versao as metodologia_versao, m.pnad_ano_atual as valores_de,
  round(v.pessoas / nullif(coalesce(s.area_km2, (extensions.st_area(s.geom::extensions.geography) / 1e6)::numeric), 0), 1) as densidade_hab_km2,
  app.densidade_faixa(v.pessoas / nullif(coalesce(s.area_km2, (extensions.st_area(s.geom::extensions.geography) / 1e6)::numeric), 0)) as faixa_densidade
from app.setores_censitarios s
left join v on v.cd_setor = s.cd_setor
cross join (select * from app.metodologias_renda where vigente) m;

-- estatísticas de uma área (raio ou poligonal). Cada setor entra pela fração da área dele que
-- cai dentro (supõe moradores espalhados por igual no setor). Renda média ponderada pelos
-- domicílios com responsável (V06001); a distribuição é dos domicílios pela faixa da MÉDIA do
-- setor (o IBGE não dá a distribuição dentro do setor).
create or replace function app.estatisticas_area(p_area extensions.geometry)
returns jsonb language sql stable set search_path = '' as $$
  with a as (select extensions.st_makevalid(extensions.st_setsrid(p_area, 4326)) as g),
  s as (
    select r.*, case when extensions.st_within(sc.geom, a.g) then 1.0
      else (extensions.st_area(extensions.st_intersection(sc.geom, a.g)::extensions.geography)
           / nullif(extensions.st_area(sc.geom::extensions.geography), 0))::numeric end as fr
    from app.setores_censitarios sc join a on extensions.st_intersects(sc.geom, a.g)
    join app.setores_renda r on r.cd_setor = sc.cd_setor),
  t as (
    select count(*) filter (where fr > 0) as setores,
      sum(coalesce(pessoas, 0) * fr) as pessoas, sum(coalesce(domicilios, 0) * fr) as domicilios,
      sum(coalesce(responsaveis, 0) * fr) as resp,
      sum(responsaveis * fr) filter (where renda_familiar_estimada_atual is not null) as resp_renda,
      sum(renda_familiar_estimada_atual * responsaveis * fr) filter (where renda_familiar_estimada_atual is not null) as soma_renda,
      count(*) filter (where fr > 0 and media_distorcida) as distorcidos
    from s),
  d as (select coalesce(jsonb_agg(jsonb_build_object('faixa', f.ordem, 'rotulo', f.rotulo, 'cor', f.cor,
           'domicilios', round(coalesce(x.dom, 0)), 'pct', round(coalesce(x.dom, 0) / nullif(t.resp_renda, 0) * 100, 1)) order by f.ordem), '[]') as dist
        from app.renda_faixas f cross join t
        left join (select faixa, sum(responsaveis * fr) as dom from s where faixa is not null group by faixa) x on x.faixa = f.ordem)
  select jsonb_build_object(
    'area_km2', round((extensions.st_area(a.g::extensions.geography) / 1e6)::numeric, 3),
    'setores', t.setores,
    'pessoas', round(t.pessoas), 'domicilios', round(t.domicilios),
    'densidade_hab_km2', round(t.pessoas / nullif(extensions.st_area(a.g::extensions.geography) / 1e6, 0)::numeric),
    'renda_familiar_media_estimada', round(t.soma_renda / nullif(t.resp_renda, 0), 2),
    'cobertura_renda_pct', round(t.resp_renda / nullif(t.resp, 0) * 100, 1),
    'setores_media_distorcida', t.distorcidos,
    'distribuicao', d.dist,
    'metodologia_versao', (select versao from app.metodologias_renda where vigente))
  from a, t, d $$;

create or replace function app.estatisticas_raio(p_lat float8, p_lng float8, p_raio_m float8)
returns jsonb language sql stable set search_path = '' as $$
  select case when p_raio_m > 0 and p_raio_m <= 10000 then app.estatisticas_area(
    extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography, p_raio_m, 32)::extensions.geometry)
  else null end $$;

-- do terreno: sem raio, a poligonal; com raio, o círculo em volta do pino (a RLS do terreno vale)
create or replace function app.estatisticas_terreno(p_terreno uuid, p_raio_m float8 default null)
returns jsonb language sql stable set search_path = '' as $$
  select case when p_raio_m is null then app.estatisticas_area(t.poligono)
              else app.estatisticas_raio(t.latitude, t.longitude, p_raio_m) end
  from app.terrenos t where t.id = p_terreno $$;

-- ---------------------------------------------------------------------
-- perfil da população do entorno (ficha do terreno; decisão do Moisés, 24/out/2026): só somas exatas das
-- variáveis do IBGE por setor, nada estimado. Grupos em tools/setores/demografia.json (o teste confere).
-- Um grupo só entra num setor quando todas as variáveis dele foram divulgadas; o resto aparece como
-- "não divulgado", nunca zero.
create table app.demografia_grupos (
  tipo      text not null check (tipo in ('idade','tamanho','especie')),
  ordem     smallint not null,
  rotulo    text not null,
  total     text[] not null,
  homens    text[],
  mulheres  text[],
  primary key (tipo, ordem),
  check ((tipo = 'idade') = (homens is not null and mulheres is not null))
);
insert into app.demografia_grupos (tipo, ordem, rotulo, total, homens, mulheres) values
  ('idade', 1, '0 a 4 anos', array['V01031'], array['V01009'], array['V01020']),
  ('idade', 2, '5 a 14 anos', array['V01032', 'V01033'], array['V01010', 'V01011'], array['V01021', 'V01022']),
  ('idade', 3, '15 a 19 anos', array['V01034'], array['V01012'], array['V01023']),
  ('idade', 4, '20 a 29 anos', array['V01035', 'V01036'], array['V01013', 'V01014'], array['V01024', 'V01025']),
  ('idade', 5, '30 a 39 anos', array['V01037'], array['V01015'], array['V01026']),
  ('idade', 6, '40 a 49 anos', array['V01038'], array['V01016'], array['V01027']),
  ('idade', 7, '50 a 59 anos', array['V01039'], array['V01017'], array['V01028']),
  ('idade', 8, '60 anos ou mais', array['V01040', 'V01041'], array['V01018', 'V01019'], array['V01029', 'V01030']),
  ('tamanho', 1, '1 morador', array['V00017'], null, null),
  ('tamanho', 2, '2 moradores', array['V00018'], null, null),
  ('tamanho', 3, '3 moradores', array['V00019'], null, null),
  ('tamanho', 4, '4 moradores', array['V00020'], null, null),
  ('especie', 1, 'Casa', array['V00047'], null, null),
  ('especie', 2, 'Casa de vila ou em condomínio', array['V00048'], null, null),
  ('especie', 3, 'Apartamento', array['V00049'], null, null),
  ('especie', 4, 'Casa de cômodos ou cortiço', array['V00050'], null, null),
  ('especie', 5, 'Estrutura degradada ou inacabada', array['V00052'], null, null);

-- soma de variáveis de um setor; nula se alguma não foi divulgada ou não existe
create or replace function app.setor_soma(p_setor text, p_vars text[]) returns numeric
language sql stable set search_path = '' as $$
  select case when count(*) = cardinality(p_vars) and bool_and(v.valor is not null) then sum(v.valor) end
  from app.setor_valores v where v.cd_setor = p_setor and v.variavel = any(p_vars) $$;

create or replace function app.perfil_area(p_area extensions.geometry)
returns jsonb language sql stable set search_path = '' as $$
  with a as (select extensions.st_makevalid(extensions.st_setsrid(p_area, 4326)) as g),
  s as (
    select sc.cd_setor, case when extensions.st_within(sc.geom, a.g) then 1.0
      else (extensions.st_area(extensions.st_intersection(sc.geom, a.g)::extensions.geography)
           / nullif(extensions.st_area(sc.geom::extensions.geography), 0))::numeric end as fr
    from app.setores_censitarios sc join a on extensions.st_intersects(sc.geom, a.g)),
  b as (
    select s.cd_setor, s.fr,
      app.setor_soma(s.cd_setor, '{V0001}') as pessoas, app.setor_soma(s.cd_setor, '{V0007}') as dom,
      app.setor_soma(s.cd_setor, '{V01007}') as homens, app.setor_soma(s.cd_setor, '{V01008}') as mulheres,
      app.setor_soma(s.cd_setor, '{V00005,V00006}') as mor, app.setor_soma(s.cd_setor, '{V00001,V00002}') as dom_mor,
      app.setor_soma(s.cd_setor, '{V00001}') as dppo,
      app.setor_soma(s.cd_setor, '{V0009}') as vagos, app.setor_soma(s.cd_setor, '{V0008}') as ocasional
    from s),
  t as (
    select count(*) filter (where fr > 0) as setores, sum(coalesce(pessoas, 0) * fr) as pessoas, sum(coalesce(dom, 0) * fr) as dom,
      sum(homens * fr) filter (where homens is not null and mulheres is not null) as homens,
      sum(mulheres * fr) filter (where homens is not null and mulheres is not null) as mulheres,
      sum(mor * fr) filter (where mor is not null and dom_mor is not null) as mor,
      sum(dom_mor * fr) filter (where mor is not null and dom_mor is not null) as dom_mor,
      sum(coalesce(dppo, 0) * fr) as dppo, sum(coalesce(vagos, 0) * fr) as vagos, sum(coalesce(ocasional, 0) * fr) as ocasional
    from b),
  g as (
    select dg.tipo, dg.ordem, dg.rotulo,
      sum(app.setor_soma(b.cd_setor, dg.total) * b.fr) as total,
      sum(app.setor_soma(b.cd_setor, dg.homens) * b.fr) as homens,
      sum(app.setor_soma(b.cd_setor, dg.mulheres) * b.fr) as mulheres
    from app.demografia_grupos dg cross join b group by dg.tipo, dg.ordem, dg.rotulo),
  -- 5 ou mais moradores: domicílios menos os de 1 a 4, só nos setores com os quatro divulgados
  cinco as (
    select sum((b.dppo - x.ate4) * b.fr) as dom
    from b cross join lateral (select sum(app.setor_soma(b.cd_setor, dg.total)) as ate4, bool_and(app.setor_soma(b.cd_setor, dg.total) is not null) as todos
                               from app.demografia_grupos dg where dg.tipo = 'tamanho') x
    where b.dppo is not null and x.todos)
  select jsonb_build_object(
    'setores', t.setores, 'pessoas', round(t.pessoas), 'domicilios', round(t.dom),
    'moradores_por_domicilio', round(t.mor / nullif(t.dom_mor, 0), 2),
    'homens', round(t.homens), 'mulheres', round(t.mulheres),
    'idade', (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'pessoas', round(coalesce(total, 0)), 'homens', round(coalesce(homens, 0)), 'mulheres', round(coalesce(mulheres, 0))) order by ordem) from g where tipo = 'idade'),
    'idade_nao_divulgada', round(greatest(t.pessoas - (select coalesce(sum(total), 0) from g where tipo = 'idade'), 0)),
    'tamanho', (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'domicilios', round(coalesce(total, 0))) order by ordem) from g where tipo = 'tamanho')
               || jsonb_build_array(jsonb_build_object('rotulo', '5 ou mais moradores', 'domicilios', round(coalesce((select dom from cinco), 0)))),
    'especie', (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'domicilios', round(coalesce(total, 0))) order by ordem) from g where tipo = 'especie'),
    'domicilios_particulares_permanentes_ocupados', round(t.dppo),
    'vagos', round(t.vagos), 'uso_ocasional', round(t.ocasional))
  from t $$;

create or replace function app.perfil_terreno(p_terreno uuid, p_raio_m float8 default null)
returns jsonb language sql stable set search_path = '' as $$
  select case when p_raio_m is null then app.perfil_area(t.poligono)
              when p_raio_m > 0 and p_raio_m <= 10000 then app.perfil_area(extensions.st_buffer(extensions.st_setsrid(extensions.st_makepoint(t.longitude, t.latitude), 4326)::extensions.geography, p_raio_m, 32)::extensions.geometry)
         end
  from app.terrenos t where t.id = p_terreno $$;

-- setores da tela para o mapa, simplificados pelo zoom (meio pixel de tolerância)
create or replace function app.setores_no_retangulo(p_oeste float8, p_sul float8, p_leste float8, p_norte float8, p_zoom int)
returns table (cd_setor text, faixa smallint, renda numeric, faixa_densidade smallint, densidade numeric, geojson jsonb)
language sql stable set search_path = '' as $$
  select r.cd_setor, r.faixa, r.renda_familiar_estimada_atual, r.faixa_densidade, r.densidade_hab_km2,
    extensions.st_asgeojson(extensions.st_simplifypreservetopology(s.geom, 360.0 / (512 * 2 ^ greatest(p_zoom, 10))), 6)::jsonb
  from app.setores_censitarios s join app.setores_renda r on r.cd_setor = s.cd_setor
  where p_zoom >= 10 and s.geom operator(extensions.&&) extensions.st_makeenvelope(p_oeste, p_sul, p_leste, p_norte, 4326) $$;

do $$
declare t text;
begin
  foreach t in array array['setores_censitarios','setor_variaveis','setor_valores','metodologias_renda','renda_faixas','densidade_faixas','demografia_grupos'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (true)', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
end $$;
grant select on app.setores_renda to authenticated;
grant execute on function app.renda_faixa(numeric), app.densidade_faixa(numeric), app.estatisticas_area(extensions.geometry), app.estatisticas_raio(float8, float8, float8),
  app.estatisticas_terreno(uuid, float8), app.setor_soma(text, text[]), app.perfil_area(extensions.geometry), app.perfil_terreno(uuid, float8), app.setores_no_retangulo(float8, float8, float8, float8, int) to authenticated;
