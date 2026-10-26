-- =====================================================================
-- BKM Terrenos · 0002b · parâmetros urbanísticos por zona e tipo de empreendimento
-- O que a lei diz para cada zona do catálogo (zoneamentos): CA, TO,
-- gabarito, recuos, cota-parte, lote e frente mínimos, por tipo de
-- empreendimento (mercado, HIS, HMP) e, quando a lei separa, por uso
-- (SJC: R, RH, RV1, RV2), macrozona (SJC: MC, ME, MOC) e tamanho do lote
-- (SP: ZEIS em lote pequeno). Configuração por empresa (empresa_id nulo =
-- modelo padrão, copiado para cada empresa nova); o administrador edita a
-- da sua empresa só por RPC (app.salvar_zona_parametro), com auditoria.
-- Carga inicial: pesquisa de 25/out/2026 (relatório "Parâmetros
-- urbanísticos SP e SJC"), aceita pelo Moisés como correta até a validação.
-- Cada linha guarda a fonte e a situação (confirmado, validar, não confirmado).
-- Valor nulo = a lei não fixa ou não se aplica (nunca zero); gabarito sem
-- limite é o booleano gabarito_sem_limite. Os parâmetros do lote saem
-- daqui por app.parametros_zona (ver regras e v_lote_zonas).
-- =====================================================================

create table app.zona_parametros (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid references app.empresas(id),   -- nulo = modelo padrão
  zoneamento_id        uuid not null references app.zoneamentos(id),
  tipo                 text not null check (tipo in ('mercado','his','hmp')),  -- SP: his = EHIS (em ZEIS, EZEIS), hmp = EHMP
  uso                  text check (uso in ('R','RH','RV1','RV2')),             -- nulo = qualquer uso
  macrozona            text check (macrozona in ('MC','ME','MOC')),            -- nulo = qualquer macrozona
  lote_area_min_m2     numeric(12,2) check (lote_area_min_m2 > 0),             -- vale para lote com área >= este valor
  lote_area_max_m2     numeric(12,2) check (lote_area_max_m2 > 0),             -- e < este valor
  permitido            boolean not null default true,      -- false: o tipo não é admitido na zona (EHMP em ZMIS, vertical em ZM5...)
  ca_minimo            numeric(6,3) check (ca_minimo > 0),
  ca_basico            numeric(6,3) check (ca_basico > 0),
  ca_maximo            numeric(6,3) check (ca_maximo > 0),
  to_maximo            numeric(4,3) check (to_maximo > 0 and to_maximo <= 1),        -- lote abaixo de to_corte_m2 (ou qualquer lote, sem corte)
  to_lote_grande       numeric(4,3) check (to_lote_grande > 0 and to_lote_grande <= 1),
  to_corte_m2          numeric(10,2) check (to_corte_m2 > 0),                      -- SP: 500
  gabarito_m           numeric(6,2) check (gabarito_m > 0),
  gabarito_sem_limite  boolean not null default false,
  recuo_frente_m       numeric(5,2) check (recuo_frente_m >= 0),
  recuo_lateral_m      numeric(5,2) check (recuo_lateral_m >= 0),   -- lateral e fundo até 10 m de altura (SP) ou até o 2º pavimento (SJC)
  recuo_lateral_alto_m numeric(5,2) check (recuo_lateral_alto_m >= 0),
  cota_parte_m2        numeric(8,2) check (cota_parte_m2 > 0),      -- terreno máximo por unidade (SP, eixos)
  max_unidades         int check (max_unidades > 0),
  permeabilidade       numeric(4,3) check (permeabilidade > 0 and permeabilidade <= 1),
  lote_minimo_m2       numeric(10,2) check (lote_minimo_m2 > 0),
  frente_minima_m      numeric(6,2) check (frente_minima_m > 0),
  outorga_gratuita     boolean,                                     -- nulo = não informado
  regras               text,                                        -- o que não cabe em número: notas, exceções, H/6
  fonte_norma          text not null,
  fonte_dispositivo    text,
  fonte_url            text,
  situacao             text not null default 'confirmado' check (situacao in ('confirmado','validar','nao_confirmado')),
  ativo                boolean not null default true,
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  check (not (gabarito_sem_limite and gabarito_m is not null)),
  check ((to_lote_grande is null) = (to_corte_m2 is null)),
  check (lote_area_min_m2 is null or lote_area_max_m2 is null or lote_area_max_m2 > lote_area_min_m2),
  check (ca_basico is null or ca_maximo is null or ca_maximo >= ca_basico),
  check (ca_minimo is null or ca_basico is null or ca_basico >= ca_minimo)
);
-- uma linha ativa por zona, tipo e condição
create unique index zona_parametro_unico on app.zona_parametros
  (empresa_id, zoneamento_id, tipo, uso, macrozona, lote_area_min_m2, lote_area_max_m2) nulls not distinct where ativo;
create index on app.zona_parametros (empresa_id, zoneamento_id);

alter table app.zona_parametros enable row level security;
create policy ver on app.zona_parametros for select to authenticated
  using (empresa_id is null or empresa_id in (select app.minhas_empresas()));
grant select on app.zona_parametros to authenticated;
create trigger t_upd before update on app.zona_parametros for each row execute function app.tg_atualizado_em();

-- ---------------------------------------------------------------------
-- Carga do modelo padrão
-- ---------------------------------------------------------------------

-- São Paulo, mercado: Quadro 3 da LPUOS (Lei 16.402/2016), com a TO da ZPI-2
-- da Lei 18.081/2024 (art. 72); lote e frente do Quadro 2A; permeabilidade
-- fixa do Quadro 3A (nas outras zonas, pelo perímetro ambiental).
insert into app.zona_parametros (zoneamento_id, tipo, lote_area_min_m2, lote_area_max_m2, ca_minimo, ca_basico, ca_maximo,
  to_maximo, to_lote_grande, to_corte_m2, gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, recuo_lateral_alto_m,
  cota_parte_m2, permeabilidade, frente_minima_m, lote_minimo_m2, outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao)
select z.id, 'mercado', q.lmin, q.lmax, q.camin, q.cabas, q.camax, q.to1, q.to2, 500, q.gab, q.gab is null, q.rf, q.rl, q.rla,
       q.cota, q.perm, q.frente, q.lote, false,
       concat_ws(' ', q.regras, case when q.perm is null then 'Permeabilidade pelo perímetro ambiental do lote (Quadro 3A).' end,
                 case when q.rf is null then 'Recuo de frente dispensado com passeio de 5 m (obrigatório nos eixos; art. 67).' end),
       case when q.sigla = 'ZPI-2' then 'Lei 16.402/2016 (LPUOS) e Lei 18.081/2024' else 'Lei 16.402/2016 (LPUOS)' end,
       case when q.sigla = 'ZPI-2' then 'Quadro 3; TO pela Lei 18.081/2024, art. 72, I' else 'Quadros 3, 2A e 3A' end,
       'https://legislacao.prefeitura.sp.gov.br/leis/lei-16402-de-22-de-marco-de-2016', q.sit
from (values
  -- sigla,   lote min/max,    CA mín/bás/máx,     TO <500/≥500, gab, frente, lat ≤10/>10, cota, perm, frente mín, lote mín, regras, situação
  ('ZEU',     null::numeric, null::numeric, 0.5, 1, 4,   0.85, 0.70, null::numeric, null::numeric, null::numeric, 3, 20, null::numeric, 20, 1000,
     'Cota-parte de 20 até 30 m² com Fator Social de 1 a 2 nas unidades acima de 70 m² (PDE, art. 79 §§9º e 10). Lote em vila, rua sem saída, rua de até 10 m, APP ou risco perde a ZEU (Lei 18.081, art. 3º).', 'confirmado'),
  ('ZEUa',    null, null, null, 1, 2,   0.70, 0.50, 28,   null, null, 3, 40, null, 20, 1000, null, 'confirmado'),
  ('ZEUP',    null, null, 0.5, 1, 2,    0.85, 0.70, 28,   null, null, 3, null, null, 20, 1000, 'Ativada, vira ZEU (nota b).', 'confirmado'),
  ('ZEUPa',   null, null, null, 1, 1,   0.70, 0.50, 28,   null, null, 3, null, null, 20, 1000, 'Ativada, vira ZEUa (nota c).', 'confirmado'),
  ('ZEM',     null, null, 0.5, 1, 2,    0.85, 0.70, 28,   null, null, 3, 20, null, 20, 1000, 'CA máximo 4 sem gabarito nas condições do art. 8º §1º (nota d).', 'confirmado'),
  ('ZEMP',    null, null, 0.5, 1, 2,    0.85, 0.70, 28,   null, null, 3, 40, null, 20, 1000, 'CA máximo 4 nas condições do art. 8º §§2º e 4º (nota e).', 'validar'),
  ('ZC',      null, null, 0.3, 1, 2,    0.85, 0.70, 48,   5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZCa',     null, null, null, 1, 1,   0.70, 0.70, 20,   5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZC-ZEIS', null, null, 0.5, 1, 2,    0.85, 0.70, null, 5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZCOR-1',  null, null, 0.05, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 10, 250, null, 'confirmado'),
  ('ZCOR-2',  null, null, 0.05, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 10, 250, 'Gabarito 50% maior pelo art. 91, com recuo de fundo de 5 m (nota n).', 'confirmado'),
  ('ZCOR-3',  null, null, 0.05, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 10, 250, 'Gabarito 50% maior pelo art. 91, com recuo de fundo de 5 m (nota n).', 'confirmado'),
  ('ZCORa',   null, null, null, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 10, 250, 'Gabarito 50% maior pelo art. 91, com recuo de fundo de 5 m (nota n).', 'confirmado'),
  ('ZM',      null, null, 0.3, 1, 2,    0.85, 0.70, 28,   5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZMa',     null, null, null, 1, 1,   0.70, 0.50, 15,   5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZMIS',    null, null, 0.3, 1, 2,    0.85, 0.70, 28,   5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZMISa',   null, null, null, 1, 1,   0.70, 0.50, 15,   5, null, 3, null, null, 5, 125, null, 'confirmado'),
  ('ZEIS-1',  1000, null, 0.5, 1, 2.5,  0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote acima de 1.000 m² em ZEIS é obrigado a fazer EZEIS (PDE, art. 55).', 'confirmado'),
  ('ZEIS-1',  null, 1000, 0.5, 1, 2,    0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote menor que 1.000 m² (nota f; o decreto diz "igual ou inferior").', 'validar'),
  ('ZEIS-2',  1000, null, 0.5, 1, 4,    0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote acima de 1.000 m² em ZEIS é obrigado a fazer EZEIS (PDE, art. 55).', 'confirmado'),
  ('ZEIS-2',  null, 1000, 0.5, 1, 2,    0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote menor que 1.000 m² (nota f; o decreto diz "igual ou inferior").', 'validar'),
  ('ZEIS-3',  500, null, 0.5, 1, 4,     0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote acima de 500 m² em ZEIS-3 é obrigado a fazer EZEIS (PDE, art. 55).', 'confirmado'),
  ('ZEIS-3',  null, 500, 0.5, 1, 2,     0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote menor que 500 m² (nota g).', 'validar'),
  ('ZEIS-4',  1000, null, null, 1, 2,   0.70, 0.50, null, 5, null, 3, null, null, 5, 125, 'Área de mananciais.', 'confirmado'),
  ('ZEIS-4',  null, 1000, null, 1, 1,   0.70, 0.50, null, 5, null, 3, null, null, 5, 125, 'Lote menor que 1.000 m² (nota h).', 'validar'),
  ('ZEIS-5',  1000, null, 0.5, 1, 4,    0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote acima de 1.000 m² em ZEIS é obrigado a fazer EZEIS (PDE, art. 55).', 'confirmado'),
  ('ZEIS-5',  null, 1000, 0.5, 1, 2,    0.85, 0.70, null, 5, null, 3, null, null, 5, 125, 'Lote menor que 1.000 m² (nota f).', 'validar'),
  ('ZDE-1',   null, null, 0.5, 1, 2,    0.70, 0.70, 28,   5, null, 3, null, null, 5, 125, 'Lote máximo de 1.000 m².', 'confirmado'),
  ('ZDE-2',   null, null, 0.5, 1, 2,    0.70, 0.50, 28,   5, 3, 3, null, null, 10, 1000, 'Recuo lateral desde o térreo (art. 66).', 'confirmado'),
  ('ZPI-1',   null, null, 0.5, 1, 1.5,  0.70, 0.70, 28,   5, 3, 3, null, null, 10, 1000, null, 'confirmado'),
  ('ZPI-2',   null, null, null, 1, 1.5, 0.50, 0.50, 28,   5, 3, 3, null, null, 20, 5000, null, 'confirmado'),
  ('ZPR',     null, null, 0.05, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 5, 125, null, 'confirmado'),
  ('ZER-1',   null, null, 0.05, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 10, 250, null, 'confirmado'),
  ('ZER-2',   null, null, 0.05, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 5, 125, null, 'confirmado'),
  ('ZERa',    null, null, null, 1, 1,   0.50, 0.50, 10,   5, null, 3, null, 0.30, 10, 500, null, 'confirmado'),
  ('ZPDS',    null, null, null, 1, 1,   0.35, 0.25, 20,   5, null, 3, null, 0.50, 20, 1000, null, 'confirmado'),
  ('ZPDSr',   null, null, null, 0.2, 0.2, 0.20, 0.15, 10, 5, null, 3, null, 0.70, null, 20000, null, 'confirmado'),
  ('ZEPAM',   null, null, null, 0.1, 0.1, 0.10, 0.10, 10, 5, null, 3, null, 0.90, 20, 5000, 'Lote mínimo de 20.000 m² na zona de contenção.', 'confirmado')
) as q(sigla, lmin, lmax, camin, cabas, camax, to1, to2, gab, rf, rl, rla, cota, perm, frente, lote, regras, sit)
join app.zoneamentos z on z.sigla = q.sigla and z.municipio_id = (select id from app.municipios where codigo_ibge = '3550308');

-- Zonas de SP sem números no Quadro 3: só a regra.
insert into app.zona_parametros (zoneamento_id, tipo, regras, fonte_norma, fonte_dispositivo, fonte_url)
select z.id, 'mercado', q.regras, 'Lei 16.402/2016 (LPUOS)', q.disp, 'https://legislacao.prefeitura.sp.gov.br/leis/lei-16402-de-22-de-marco-de-2016'
from (values ('ZOE', 'Parâmetros definidos por PIU aprovado por decreto ou pela CTLU.', 'art. 15'),
             ('ZEP', 'Vale o Plano de Manejo; sem ele, a zona mais restritiva do entorno.', 'arts. 20 e 21')) as q(sigla, regras, disp)
join app.zoneamentos z on z.sigla = q.sigla and z.municipio_id = (select id from app.municipios where codigo_ibge = '3550308');

-- São Paulo, EHIS (EZEIS nas ZEIS) e EHMP: Quadro 2 do Decreto 63.728/2024,
-- alterado pelo 64.901/2026. TO, gabarito, recuos, cota-parte, lote e frente
-- seguem os de mercado; muda o CA máximo e a outorga. Zona fora do Quadro 2
-- não tem linha (vale a de mercado); EHIS proibido na ZER-1 (PDE, art. 59).
insert into app.zona_parametros (zoneamento_id, tipo, lote_area_min_m2, lote_area_max_m2, permitido, ca_minimo, ca_basico, ca_maximo,
  to_maximo, to_lote_grande, to_corte_m2, gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, recuo_lateral_alto_m,
  cota_parte_m2, permeabilidade, frente_minima_m, lote_minimo_m2, outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao)
select m.zoneamento_id, s.tipo, m.lote_area_min_m2, m.lote_area_max_m2, s.permitido, m.ca_minimo, m.ca_basico,
       case when s.permitido then s.ca end,
       case when s.sigla = 'ZPI-2' then 0.5 else m.to_maximo end, m.to_lote_grande, m.to_corte_m2, m.gabarito_m, m.gabarito_sem_limite,
       m.recuo_frente_m, m.recuo_lateral_m, m.recuo_lateral_alto_m, m.cota_parte_m2, m.permeabilidade, m.frente_minima_m, m.lote_minimo_m2,
       case when not s.permitido then null when s.tipo = 'his' then true else false end,
       case when not s.permitido then s.regras else concat_ws(' ', s.regras, case s.tipo
         when 'his' then 'EHIS: mínimo de 80% da área computável em HIS; outorga gratuita até o CA máximo para todos os usos (PDE, art. 58; decreto, art. 19). Recuos laterais e de fundo dispensados até 10 m de altura, salvo ZDE-2 e ZPI (decreto, art. 14). Cota-parte não sobe para 30 m².'
         else 'EHMP: mínimo de 80% em HMP; só a área HIS fica isenta de outorga, o HMP paga com Fs 0,4 ou 0,6 (decreto, art. 20).' end) end,
       'Decreto 63.728/2024 (alterado pelo Decreto 64.901/2026)', 'Quadro 2', 'https://legislacao.prefeitura.sp.gov.br/leis/decreto-63728-de-10-de-setembro-de-2024',
       s.sit
from (values
  -- sigla, tipo, lote min (para escolher a linha de mercado), permitido, CA máximo, regras, situação
  ('ZEU',    'his', null::numeric, true, 6::numeric, null, 'confirmado'),       ('ZEU',    'hmp', null::numeric, true, 5::numeric, null, 'confirmado'),
  ('ZEUa',   'his', null, true, 3, null, 'confirmado'),       ('ZEUa',   'hmp', null, true, 2.5, null, 'confirmado'),
  ('ZEUP',   'his', null, true, 3, null, 'confirmado'),       ('ZEUP',   'hmp', null, true, 2.5, null, 'confirmado'),
  ('ZEUPa',  'his', null, true, 1.5, null, 'confirmado'),     ('ZEUPa',  'hmp', null, true, 1.25, null, 'confirmado'),
  ('ZEM',    'his', null, true, 3, 'CA 6 nas condições do art. 8º §1º da LPUOS.', 'confirmado'),   ('ZEM',  'hmp', null, true, 2.5, 'CA 5 nas condições do art. 8º §1º da LPUOS.', 'confirmado'),
  ('ZEMP',   'his', null, true, 3, 'CA 6 nas condições do art. 8º da LPUOS.', 'confirmado'),       ('ZEMP', 'hmp', null, true, 2.5, 'CA 5 nas condições do art. 8º da LPUOS.', 'confirmado'),
  ('ZC',     'his', null, true, 3, null, 'confirmado'),       ('ZC',     'hmp', null, true, 2.5, null, 'confirmado'),
  ('ZCa',    'his', null, true, 1.5, null, 'confirmado'),     ('ZCa',    'hmp', null, true, 1.25, null, 'confirmado'),
  ('ZC-ZEIS','his', null, true, 3, 'Na ZC-ZEIS o EHIS exige no mínimo 60% de HIS.', 'confirmado'),
  ('ZC-ZEIS','hmp', null, false, null, 'EHMP proibido na ZC-ZEIS (decreto, Quadro 1).', 'confirmado'),
  ('ZCOR-1', 'his', null, true, 1.5, 'Só unifamiliar: conjunto horizontal e vertical de EHIS proibido (decreto, Quadro 1).', 'confirmado'),
  ('ZCOR-1', 'hmp', null, false, null, 'EHMP proibido na ZCOR-1 (decreto, Quadro 1).', 'confirmado'),
  ('ZCOR-2', 'his', null, true, 1.5, null, 'confirmado'),     ('ZCOR-2', 'hmp', null, true, 1.25, null, 'confirmado'),
  ('ZCOR-3', 'his', null, true, 1.5, null, 'confirmado'),     ('ZCOR-3', 'hmp', null, true, 1.25, null, 'confirmado'),
  ('ZCORa',  'his', null, true, 1.5, null, 'confirmado'),     ('ZCORa',  'hmp', null, true, 1.25, null, 'confirmado'),
  ('ZM',     'his', null, true, 3, null, 'confirmado'),       ('ZM',     'hmp', null, true, 2.5, null, 'confirmado'),
  ('ZMa',    'his', null, true, 1.5, null, 'confirmado'),     ('ZMa',    'hmp', null, true, 1.25, null, 'confirmado'),
  ('ZMIS',   'his', null, true, 3, null, 'confirmado'),       ('ZMIS',   'hmp', null, false, null, 'EHMP proibido na ZMIS (decreto, Quadro 1).', 'confirmado'),
  ('ZMISa',  'his', null, true, 1.5, null, 'confirmado'),     ('ZMISa',  'hmp', null, false, null, 'EHMP proibido na ZMISa (decreto, Quadro 1).', 'confirmado'),
  ('ZDE-1',  'his', null, true, 3, null, 'confirmado'),       ('ZDE-1',  'hmp', null, false, null, 'EHMP proibido na ZDE (decreto, Quadro 1).', 'confirmado'),
  ('ZDE-2',  'his', null, true, 3, null, 'confirmado'),       ('ZDE-2',  'hmp', null, false, null, 'EHMP proibido na ZDE (decreto, Quadro 1).', 'confirmado'),
  ('ZPI-1',  'his', null, true, 2.25, null, 'confirmado'),    ('ZPI-1',  'hmp', null, false, null, 'EHMP proibido na ZPI (decreto, Quadro 1).', 'confirmado'),
  ('ZPI-2',  'his', null, true, 2.25, 'TO 0,5 em qualquer lote no decreto.', 'confirmado'),
  ('ZPI-2',  'hmp', null, false, null, 'EHMP proibido na ZPI (decreto, Quadro 1).', 'confirmado'),
  -- ZEIS: o tipo his é o EZEIS (percentuais do Quadro 4 do PDE); EHMP só como parte de EZEIS
  ('ZEIS-1', 'his', 1000, true, 2.5, 'EZEIS: 60% de HIS 1, até 20% de HMP e outros usos (PDE, Quadro 4). CA até 4 com plano de urbanização (nota k).', 'confirmado'),
  ('ZEIS-1', 'his', null, true, 2,   'Lote menor que 1.000 m²: CA 2; volta a 2,5 se toda a área computável for HIS (decreto, nota e).', 'validar'),
  ('ZEIS-2', 'his', 1000, true, 4,   'EZEIS: 60% de HIS 1, até 20% de HMP e outros usos (PDE, Quadro 4). Bônus de 50% em eixo depende de lei específica não encontrada.', 'confirmado'),
  ('ZEIS-2', 'his', null, true, 2,   'Lote menor que 1.000 m²: CA 2; volta a 4 se toda a área computável for HIS (decreto, nota e).', 'validar'),
  ('ZEIS-3', 'his', 500,  true, 4,   'EZEIS: 60% de HIS 1, até 20% de HMP e outros usos (PDE, Quadro 4). Até 6 na Operação Urbana Centro.', 'confirmado'),
  ('ZEIS-3', 'his', null, true, 2,   'Lote menor que 500 m²: CA 2; volta a 4 se toda a área computável for HIS (decreto, nota f).', 'validar'),
  ('ZEIS-4', 'his', 1000, true, 2,   'EZEIS: 60% de HIS 1, até 20% de HMP e outros usos (PDE, Quadro 4).', 'confirmado'),
  ('ZEIS-4', 'his', null, true, 1,   'Lote menor que 1.000 m²: CA 1; volta a 2 se toda a área computável for HIS (decreto, nota g).', 'validar'),
  ('ZEIS-5', 'his', 1000, true, 4,   'EZEIS: 40% de HIS 1 e HIS 2, até 40% de outros usos (PDE, Quadro 4).', 'confirmado'),
  ('ZEIS-5', 'his', null, true, 2,   'Lote menor que 1.000 m²: CA 2; volta a 4 se toda a área computável for HIS (decreto, nota e).', 'validar'),
  ('ZEIS-1', 'hmp', 1000, false, null, 'Em ZEIS, HMP só como parte de um EZEIS.', 'confirmado'),
  ('ZEIS-2', 'hmp', 1000, false, null, 'Em ZEIS, HMP só como parte de um EZEIS.', 'confirmado'),
  ('ZEIS-3', 'hmp', 500,  false, null, 'Em ZEIS, HMP só como parte de um EZEIS.', 'confirmado'),
  ('ZEIS-4', 'hmp', 1000, false, null, 'Em ZEIS, HMP só como parte de um EZEIS.', 'confirmado'),
  ('ZEIS-5', 'hmp', 1000, false, null, 'Em ZEIS, HMP só como parte de um EZEIS.', 'confirmado'),
  ('ZER-1',  'his', null, false, null, 'EHIS proibido na ZER-1 (PDE, art. 59).', 'confirmado'),
  ('ZER-1',  'hmp', null, false, null, 'EHMP proibido na ZER-1 (PDE, art. 59).', 'confirmado')
) as s(sigla, tipo, lmin, permitido, ca, regras, sit)
join app.zoneamentos z on z.sigla = s.sigla and z.municipio_id = (select id from app.municipios where codigo_ibge = '3550308')
join app.zona_parametros m on m.zoneamento_id = z.id and m.tipo = 'mercado' and m.empresa_id is null
  and (case when s.lmin is not null then m.lote_area_min_m2 = s.lmin
            when s.sigla like 'ZEIS-%' then m.lote_area_max_m2 is not null
            else m.lote_area_min_m2 is null end);

-- São José dos Campos, mercado: Anexo VI da LC 623/2019 (tabelas da LC 667/2023,
-- ZESFX pela LC 701/2025). CA básico 1,3; CA máximo por macrozona: Consolidação
-- (MC) e Estruturação (ME). Na Ocupação Controlada (MOC) a outorga só é vendida
-- para uso não residencial (LC 612, art. 72 §2º): o residencial fica em 1,3.
-- Zona que só tem uma coluna (centralidades, ZPA, ZESFX) vale em qualquer macrozona.
insert into app.zona_parametros (zoneamento_id, tipo, uso, macrozona, permitido, ca_basico, ca_maximo, to_maximo,
  gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, max_unidades, permeabilidade, frente_minima_m, lote_minimo_m2,
  outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao)
select z.id, 'mercado', q.uso, mz.macro, q.permitido, q.cab,
       case mz.macro when 'MC' then q.mc when 'ME' then q.me when 'MOC' then least(q.me, 1.3) else coalesce(q.mc, q.me) end,
       case when q.sigla = 'ZUPI2' and mz.macro = 'MOC' then 0.65 else q.tox end,
       q.gab, q.gab is null and q.permitido, q.rf, q.rl,
       case q.uso when 'RV1' then 80 when 'RV2' then case when q.sigla in ('CMETRO-CT','CM','CM-C.EXPANDIDO') then 400 else 300 end end,
       q.perm, q.testada, q.lote, q.uso = 'R',
       concat_ws(' ', q.regras,
         case when q.permitido and q.uso in ('RV1','RV2') then 'Acima do 2º pavimento, recuos laterais e de fundo H/6 com mínimo de 3 m (art. 203); do 9º pavimento em diante, frente de 7 m.' end,
         case when q.uso = 'RV2' and q.sigla in ('CMETRO-CT','CM','CM-C.EXPANDIDO') then 'RV2 até 400 unidades com fachada ativa (art. 142).' end,
         case when q.gab is null and q.permitido then 'Altura limitada só pelo cone aeronáutico (COMAER 957/2015).' end,
         case when q.perm is null and q.permitido then 'Permeabilidade: 5% (lote de 175 a 5.000 m²), 15% (até 10.000 m²), 20% acima, mais 5% em recarga de aquífero (art. 255).' end,
         case when mz.macro = 'MOC' then 'Na Ocupação Controlada, outorga só para uso não residencial (LC 612, art. 72 §2º).' end),
       case when q.sigla = 'ZESFX' then 'LC 623/2019 (Anexo VI pela LC 701/2025)' else 'LC 623/2019 (Anexo VI pela LC 667/2023)' end,
       'Anexo VI',
       case when q.sigla = 'ZESFX' then 'https://servicos.sjc.sp.gov.br/Legislacao/Arquivos/LeisComplementares/2025/LC_2025_00000701.pdf'
            else 'https://www.sjc.sp.gov.br/media/wrqjgtkz/lc_2023_00000667.pdf' end,
       case when mz.macro = 'MOC' then 'validar' else q.sit end
from (values
  -- sigla, uso, permitido, CA básico, CAM MC, CAM ME, TO, gabarito (nulo = livre), frente, lateral até 2º pav., permeabilidade, testada, lote, regras, situação
  ('CMETRO-ED','RV1', true, 1.3::numeric, 5::numeric, null::numeric, 0.80::numeric, null::numeric, 15::numeric, 5::numeric, null::numeric, 50::numeric, 3000::numeric,
     'Residencial só em uso misto, até 50% da área computável, e só em vias locais (LC 701, art. 110, I).', 'confirmado'),
  ('CMETRO-ED','RV2', true, 1.3, 5, null, 0.80, null, 15, 5, null, 50, 3000, 'Residencial só em uso misto, até 50% da área computável, e só em vias locais (LC 701, art. 110, I).', 'confirmado'),
  ('CMETRO-CT','R',   true, 1.3, 5, null, 0.80, null, null, null, null, 5, 125, null, 'confirmado'),
  ('CMETRO-CT','RH',  true, 1.3, 5, null, 0.80, null, null, null, null, 20, 500, null, 'confirmado'),
  ('CMETRO-CT','RV1', true, 1.3, 5, null, 0.80, null, 5, 3, null, 15, null, null, 'confirmado'),
  ('CMETRO-CT','RV2', true, 1.3, 5, null, 0.80, null, 5, 3, null, 15, null, null, 'confirmado'),
  ('CM','R',          true, 1.3, 4, null, 0.65, null, 5, null, null, 7, 175, 'Aquarius: lote de 2.500 m² e testada de 50 m (nota 3).', 'confirmado'),
  ('CM','RH',         true, 1.3, 4, null, 0.65, null, 5, 1.5, null, 20, 500, null, 'confirmado'),
  ('CM','RV1',        true, 1.3, 4, null, 0.65, null, 5, 3, null, 15, null, null, 'confirmado'),
  ('CM','RV2',        true, 1.3, 4, null, 0.65, null, 5, 3, null, 20, null, null, 'confirmado'),
  ('CM-C.EXPANDIDO','R',   true, 1.3, 4, null, 0.65, null, 5, null, null, 7, 175, null, 'confirmado'),
  ('CM-C.EXPANDIDO','RH',  true, 1.3, 4, null, 0.65, null, 5, 1.5, null, 20, 500, null, 'confirmado'),
  ('CM-C.EXPANDIDO','RV1', true, 1.3, 4, null, 0.65, null, 5, 3, null, 15, null, 'Recuo de frente do multifamiliar fica em 5 m em qualquer altura.', 'confirmado'),
  ('CM-C.EXPANDIDO','RV2', true, 1.3, 4, null, 0.65, null, 5, 3, null, 20, null, 'Recuo de frente do multifamiliar fica em 5 m em qualquer altura.', 'confirmado'),
  ('CL','R',          true, 1.3, 4, 3, 0.65, null, 5, null, null, 7, 175, 'Frente de 2 m nos setores comerciais (nota 4).', 'confirmado'),
  ('CL','RH',         true, 1.3, 4, 3, 0.65, null, 5, 1.5, null, 20, 500, null, 'confirmado'),
  ('CL','RV1',        true, 1.3, 4, 3, 0.65, null, 5, 3, null, 15, null, null, 'confirmado'),
  ('CL','RV2',        true, 1.3, 4, 3, 0.65, null, 5, 3, null, 20, null, null, 'confirmado'),
  ('ZM1','R',         true, 1.3, 1.3, 1.3, 0.65, 9, 5, 1.5, null, 7, 175, null, 'confirmado'),
  ('ZM1','RH',        true, 1.3, 1.3, 1.3, 0.65, 9, 5, 1.5, null, 20, 500, 'Condomínio horizontal: 140 m² de terreno por unidade (art. 144).', 'confirmado'),
  ('ZM1','RV1',       false, 1.3, 1.3, 1.3, null, null, null, null, null, null, null, 'Sem uso vertical na ZM1.', 'confirmado'),
  ('ZM2','R',         true, 1.3, 3, 2, 0.65, null, 5, 1.5, null, 7, 175, null, 'confirmado'),
  ('ZM2','RH',        true, 1.3, 3, 2, 0.65, null, 5, 1.5, null, 20, 500, 'Condomínio horizontal: 140 m² de terreno por unidade (art. 144).', 'confirmado'),
  ('ZM2','RV1',       true, 1.3, 3, 2, 0.65, null, 5, 3, null, 15, 750, null, 'confirmado'),
  ('ZM2','RV2',       false, 1.3, 3, 2, null, null, null, null, null, null, null, 'RV2 não admitido na ZM2.', 'confirmado'),
  ('ZM3','R',         true, 1.3, 3, 2, 0.65, null, 5, null, null, 7, 175, 'Divisa com ZR: recuo de 13 m acima de 10 m de altura (art. 213).', 'confirmado'),
  ('ZM3','RH',        true, 1.3, 3, 2, 0.65, null, 5, 1.5, null, 20, 500, 'Condomínio horizontal: 140 m² de terreno por unidade (art. 144).', 'confirmado'),
  ('ZM3','RV1',       true, 1.3, 3, 2, 0.65, null, 5, 3, null, 15, 750, 'Divisa com ZR: recuo de 13 m acima de 10 m de altura (art. 213).', 'confirmado'),
  ('ZM3','RV2',       true, 1.3, 3, 2, 0.65, null, 5, 3, null, 20, 1500, 'Divisa com ZR: recuo de 13 m acima de 10 m de altura (art. 213).', 'confirmado'),
  ('ZM4','R',         true, 1.3, 2, 1.3, 0.65, null, 5, null, null, 7, 175, null, 'confirmado'),
  ('ZM4','RH',        true, 1.3, 2, 1.3, 0.65, null, 5, 1.5, null, 20, 500, 'Condomínio horizontal: 140 m² de terreno por unidade (art. 144).', 'confirmado'),
  ('ZM4','RV1',       true, 1.3, 2, 1.3, 0.65, null, 5, 3, null, 15, 750, null, 'confirmado'),
  ('ZM4','RV2',       true, 1.3, 2, 1.3, 0.65, null, 5, 3, null, 20, 1500, null, 'confirmado'),
  ('ZM5','R',         true, 1.3, 1.3, 1.3, 0.65, 9, 5, null, null, 7, 125, 'ZEIS regularizada e núcleos regularizados.', 'confirmado'),
  ('ZM5','RH',        true, 1.3, 1.3, 1.3, 0.65, 9, 5, 1.5, null, 15, 500, 'Lote e testada do RH divergem entre as fontes (250 m² × 10 m ou 500 m² × 15 m).', 'validar'),
  ('ZM5','RV1',       false, 1.3, 1.3, 1.3, null, null, null, null, null, null, null, 'Sem uso vertical na ZM5.', 'confirmado'),
  ('ZR','R',          true, 1.3, 1.3, 1.3, 0.65, 9, 5, 1.5, null, 10, 250, 'Na ZPE1: lote de 200 m² e testada de 8 m (nota 13).', 'confirmado'),
  ('ZR','RV1',        false, 1.3, 1.3, 1.3, null, null, null, null, null, null, null, 'Sem uso vertical na ZR.', 'confirmado'),
  ('ZPA2','R',        true, 1.0, null, 1.0, 0.50, 9, 5, 3, 0.30, 15, 2000, 'Lote de 4.000 m² com declividade de 30% a 40%; permeabilidade de 30% (art. 121).', 'confirmado'),
  ('ZUD',  null,      false, 1.3, 4, 2, 0.80, null, 5, null, null, null, null, 'Sem uso residencial na tabela.', 'confirmado'),
  ('ZUPI1',null,      false, 1.3, 4, 2, 0.80, null, 5, null, null, null, null, 'Sem uso residencial na tabela.', 'confirmado'),
  ('ZUPI2',null,      false, 1.3, 4, 2, 0.80, null, 5, null, null, null, null, 'Sem uso residencial na tabela.', 'confirmado'),
  ('ZPA1', null,      false, 0.005, 0.005, null, 0.005, null, 10, 10, null, 50, 20000, 'Só agropecuária.', 'confirmado'),
  ('ZESFX','R',       true, 1.3, 1.3, null, 0.65, 7, null, null, null, 7, 175, 'Gabarito de 7 m pela LC 701/2025.', 'confirmado'),
  ('ZESFX','RH',      true, 1.3, 1.3, null, 0.65, 7, null, 1.5, null, 15, 500, 'Gabarito de 7 m pela LC 701/2025.', 'confirmado')
) as q(sigla, uso, permitido, cab, mc, me, tox, gab, rf, rl, perm, testada, lote, regras, sit)
join app.zoneamentos z on z.sigla = q.sigla and z.municipio_id = (select id from app.municipios where codigo_ibge = '3549904')
cross join lateral (select unnest(case when q.me is null or q.mc is null then array[null::text] else array['MC','ME','MOC'] end) as macro) mz;

-- Zonas de SJC sem linha no Anexo VI: só a regra.
insert into app.zona_parametros (zoneamento_id, tipo, permitido, regras, fonte_norma, fonte_dispositivo, fonte_url)
select z.id, 'mercado', q.permitido, q.regras, 'LC 623/2019', q.disp, 'https://www.sjc.sp.gov.br/media/4kyf00ui/lc_0623_2019_compilada_at%C3%A9_lc701_2025.pdf'
from (values ('ZPE1', true,  'Gleba até 50.000 m² segue a ZM4 (ZM2 na Região Sul); acima disso, Plano de Ocupação.', 'arts. 122 a 124'),
             ('ZPE2', true,  'Gleba até 50.000 m² segue a ZM3; acima disso, Plano de Ocupação.', 'arts. 122 a 124'),
             ('ZA',   false, 'Zona Aeroportuária (DCTA), sem parâmetros na lei de zoneamento.', 'art. 113'),
             ('FAIXA NAED', false, 'Faixa não edificável do Talude do Banhado.', 'art. 240')) as q(sigla, permitido, regras, disp)
join app.zoneamentos z on z.sigla = q.sigla and z.municipio_id = (select id from app.municipios where codigo_ibge = '3549904');

-- São José dos Campos, HIS: mesmos índices do mercado (a lei não dá CA a mais);
-- muda a outorga, gratuita (Fip 0) para HIS de até 3 salários mínimos ligada a
-- programa habitacional (LC 612, art. 78; Decreto 20.106/2025, Anexo VIII), e o
-- condomínio horizontal, com 125 m² de terreno por unidade (LC 623, art. 144).
insert into app.zona_parametros (zoneamento_id, tipo, uso, macrozona, permitido, ca_basico, ca_maximo, to_maximo,
  gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, max_unidades, permeabilidade, frente_minima_m, lote_minimo_m2,
  outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao)
select m.zoneamento_id, 'his', m.uso, m.macrozona, m.permitido, m.ca_basico, m.ca_maximo, m.to_maximo,
       m.gabarito_m, m.gabarito_sem_limite, m.recuo_frente_m, m.recuo_lateral_m, m.max_unidades, m.permeabilidade, m.frente_minima_m, m.lote_minimo_m2,
       case when m.permitido then true end,
       concat_ws(' ', m.regras, case when m.permitido then
         'HIS: outorga gratuita (Fip 0) só para HIS de até 3 salários mínimos ligada a programa habitacional; acima disso, a lei não deixa claro (consultar a Prefeitura).' end,
         case when m.permitido and m.uso = 'RH' then 'HIS em condomínio horizontal: 125 m² de terreno por unidade.' end),
       'LC 623/2019 e LC 612/2018 (art. 78, pela LC 702/2025)', 'Anexo VI; Decreto 20.106/2025, Anexo VIII',
       'https://servicos.sjc.sp.gov.br/Legislacao/Arquivos/Decretos/2025/DE_2025_00020106.pdf', 'validar'
from app.zona_parametros m
join app.zoneamentos z on z.id = m.zoneamento_id and z.municipio_id = (select id from app.municipios where codigo_ibge = '3549904')
where m.empresa_id is null and m.tipo = 'mercado' and m.uso is not null;

-- Auditoria só depois da carga do modelo padrão.
create trigger t_aud after insert or update or delete on app.zona_parametros for each row execute function app.tg_auditoria();
