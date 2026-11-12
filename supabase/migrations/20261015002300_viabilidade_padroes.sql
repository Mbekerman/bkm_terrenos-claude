-- =====================================================================
-- Valores padrão de Taxas e Despesas financeiras do estudo de viabilidade
-- (pedido do Moises, 12/nov/2026)
--
-- Enquanto Configurações › Viabilidade não existe no sistema real, os padrões ficam fixos aqui:
-- todo estudo novo nasce com eles (app.criar_viabilidade lê tipo_padrao e valor_padrao dos itens
-- fixos). Estudos que já existem não mudam.
--
--   Taxa de desenvolvimento              4%   do VGV
--   Taxa de gestão de obra              10%   do custo de obra total
--   Taxa de contingências                 —   % do VGV (sem valor)
--   Custo de alavancagem                20%   do lucro líquido (antes: verba)
--   Custo de juros PJ                  0,2%   do custo de obra total
--   Custo financeiro                      —   verba total (sem valor)
--   Impostos                             4%   do VGV
--   Custo de capital permuta financeira 10%   do aporte
--   Custo de capital pagamento terreno  20%   do aporte
--
-- Vale para o modelo (empresa nula, copiado para empresa nova) e para as empresas que existem;
-- nestas, só onde o administrador ainda não deu valor (valor_padrao nulo).
-- Feito para rodar também no SQL Editor do Supabase (idempotente).
-- =====================================================================

with p(codigo, tipo, valor) as (values
  ('taxa_desenvolvimento', 'pct_vgv',              4.0),
  ('taxa_gestao_obra',     'pct_obra_total',      10.0),
  ('taxa_contingencias',   'pct_vgv',             null::numeric),
  ('custo_alavancagem',    'pct_lucro',           20.0),
  ('juros_pj',             'pct_obra_total',       0.2),
  ('custo_financeiro',     'verba',               null),
  ('impostos',             'pct_vgv',              4.0),
  ('capital_permuta',      'pct_aporte_permuta',  10.0),
  ('capital_pagamento',    'pct_aporte_pagamento',20.0))
update app.viabilidade_despesas d
   set tipo_padrao = p.tipo, valor_padrao = p.valor
  from p
 where d.codigo = p.codigo
   and (d.empresa_id is null or d.valor_padrao is null);
