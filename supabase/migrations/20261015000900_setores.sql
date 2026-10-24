-- =====================================================================
-- BKM Terrenos · 0009 · setores censitários e camadas do IBGE
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
   'Decisão do Moisés (24/out/2026): fator único de 1,6 para a capital, igual em todos os setores. Medidas de apoio: Estado de São Paulo 1,6102 nos microdados públicos da amostra do Censo 2022 (renda domiciliar média D0350 ÷ renda média do responsável P1110, P0170 = 1, peso D0110: R$ 6.156,18 ÷ R$ 3.823,32); capital estimada em 1,576 pela proporção entre capital e Estado nas tabelas oficiais (os microdados públicos não descem abaixo da UF)',
   2022, 2148, 2025, 2956, 'PNAD Contínua, rendimento domiciliar per capita do Estado de São Paulo (Lei Complementar 143/2013)', 3, true);

-- faixas do mapa (decisão de produto, nunca quantis; R$ 13 mil = teto da Faixa 4 do MCMV 2026; cores: rampa do amarelo-claro ao azul-marinho, mais escuro = mais renda): o limite de cima entra na faixa,
-- a renda é arredondada para reais antes de classificar; a última não tem limite
create table app.renda_faixas (
  ordem   smallint primary key,
  ate     numeric unique,
  rotulo  text not null,
  cor     text not null check (cor ~ '^#[0-9a-f]{6}$'),
  check ((ate is null) = (ordem = 16))
);
insert into app.renda_faixas (ordem, ate, rotulo, cor) values
  (1, 2000, 'Até R$ 2.000', '#fff4a5'), (2, 3000, 'R$ 2.000 – 3.000', '#ffde81'),
  (3, 4000, 'R$ 3.000 – 4.000', '#ffc662'), (4, 5000, 'R$ 4.000 – 5.000', '#ffab4e'),
  (5, 6000, 'R$ 5.000 – 6.000', '#ff904b'), (6, 7000, 'R$ 6.000 – 7.000', '#ff7657'),
  (7, 8000, 'R$ 7.000 – 8.000', '#ff5e69'), (8, 9000, 'R$ 8.000 – 9.000', '#ed4b7b'),
  (9, 10000, 'R$ 9.000 – 10.000', '#d63f8c'), (10, 13000, 'R$ 10.000 – 13.000', '#bb3899'),
  (11, 15000, 'R$ 13.000 – 15.000', '#9d35a0'), (12, 18000, 'R$ 15.000 – 18.000', '#7e33a0'),
  (13, 22000, 'R$ 18.000 – 22.000', '#603398'), (14, 25000, 'R$ 22.000 – 25.000', '#42328a'),
  (15, 30000, 'R$ 25.000 – 30.000', '#272f76'), (16, null, 'Acima de R$ 30.000', '#0b2b5f');

create or replace function app.renda_faixa(p_valor numeric) returns smallint
language sql stable set search_path = '' as $$
  select f.ordem from app.renda_faixas f
  where p_valor is not null and (f.ate is null or round(p_valor) <= f.ate)
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
  m.versao as metodologia_versao, m.pnad_ano_atual as valores_de
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

-- setores da tela para o mapa, simplificados pelo zoom (meio pixel de tolerância)
create or replace function app.setores_no_retangulo(p_oeste float8, p_sul float8, p_leste float8, p_norte float8, p_zoom int)
returns table (cd_setor text, faixa smallint, renda numeric, geojson jsonb)
language sql stable set search_path = '' as $$
  select r.cd_setor, r.faixa, r.renda_familiar_estimada_atual,
    extensions.st_asgeojson(extensions.st_simplifypreservetopology(s.geom, 360.0 / (512 * 2 ^ greatest(p_zoom, 10))), 6)::jsonb
  from app.setores_censitarios s join app.setores_renda r on r.cd_setor = s.cd_setor
  where p_zoom >= 10 and s.geom operator(extensions.&&) extensions.st_makeenvelope(p_oeste, p_sul, p_leste, p_norte, 4326) $$;

do $$
declare t text;
begin
  foreach t in array array['setores_censitarios','setor_variaveis','setor_valores','metodologias_renda','renda_faixas'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (true)', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
end $$;
grant select on app.setores_renda to authenticated;
grant execute on function app.renda_faixa(numeric), app.estatisticas_area(extensions.geometry), app.estatisticas_raio(float8, float8, float8),
  app.estatisticas_terreno(uuid, float8), app.setores_no_retangulo(float8, float8, float8, float8, int) to authenticated;
