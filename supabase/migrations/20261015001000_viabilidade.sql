-- =====================================================================
-- Estudo de viabilidade estática (decisões do Moisés, 25 e 26/out/2026)
-- Avaliação prévia, sem fluxo de caixa. O cálculo, na ordem:
--   Tipologias: área privativa, quantidade, em permuta (física), da
--   comissão (unidades dadas na comissão do terreno), preço unitário e
--   preço por m².
--     VGV           = Σ quantidade × preço unitário
--     VGV vendido   = VGV − unidades em permuta − unidades da comissão
--                     (o "VGV" das bases % do VGV)
--     VGV líquido   = VGV vendido − % de dedução × VGV vendido − as despesas
--                     comerciais marcadas para deduzir (ITBI e registro de
--                     unidades vendidas). Só a base da permuta financeira: a
--                     receita é o VGV vendido, e as despesas marcadas continuam
--                     nas comerciais (decisão do Moises, 11/nov/2026)
--   Custo de obras, em camadas:
--     obra incidente (típico) = valor unitário (R$/m²) × área privativa total,
--                     ou × área construída total (obra_base 'construida'; decisão
--                     do Moisés, 3/nov/2026, lote 4 da ficha em abas)
--     itens atípicos          bases: área privativa, % do típico, % do VGV, verba
--     obra raso    = incidente + atípicos
--     obra não incidente      + % do raso
--     obra total   = raso + não incidente
--     projetos e pós-obra     + % da obra total
--   Custo do terreno: permuta financeira = % × VGV líquido, nunca abaixo do
--     mínimo garantido; + pagamento em dinheiro + comissão em dinheiro. A
--     permuta física e as unidades da comissão já saíram do VGV vendido.
--   Despesas gerais (Terreno, Incorporação, CEF, Administrativo e
--     financeiro), Despesas financeiras e Taxas: % do VGV, % da obra total,
--     % do lucro líquido ou verba. Despesas financeiras (Alavancagem, Juros
--     PJ, Custo financeiro, Impostos) e Taxas: decisões do Moisés de
--     26/out/2026; o estudo nasce com o valor padrão da empresa e só a
--     diretoria ou o administrador muda (app.eh_diretoria). Custo de capital da
--     permuta financeira e do pagamento do terreno (decisão do Moisés,
--     28/out/2026): um grupo cada, dentro de Despesas financeiras, com uma base
--     só, o Aporte, em %: a permuta financeira em dinheiro (com o mínimo
--     garantido, quando ele vale) e o pagamento em dinheiro do terreno. O % do lucro é % × L0, onde L0 é o
--     lucro antes desses itens (decisão do Moises, 11/nov/2026; antes, L0 ÷ (1 + Σ%)); sem lucro (L0 ≤ 0), eles valem zero.
--   Despesas comerciais: % do VGV, verba total, verba por unidade (× unidades
--     líquidas: total − permuta − comissão; decisão do Moisés, 26/out/2026)
--     ou verba mensal (× meses).
--   EBITDA = VGV vendido − terreno − obras − despesas gerais
--            − despesas comerciais (todas)
--   resultado sem taxas = EBITDA − despesas financeiras
--   lucro líquido = resultado sem taxas − taxas (as taxas saem por último)
--   margem líquida = lucro ÷ VGV vendido
-- O grupo do item define a seção, as bases aceitas e se é fixo (Taxas,
-- Despesas financeiras e Despesas comerciais aparecem sempre no estudo). Mesmos grupos e itens de
-- tools/viabilidade/despesas.json, que o protótipo lê.
-- O estudo é do terreno (vários por terreno); a negociação vincula um
-- (processos.viabilidade_id). O estudo externo do BKM (tipo 'externa',
-- app.vincular_viabilidade) continua.
-- =====================================================================

-- Grupos: bases de cálculo aceitas, seção e se o item é fixo no estudo.
create or replace function app.viab_tipos(p_grupo text)
returns text[] language sql immutable set search_path = '' as $$
  select case p_grupo
    when 'obra_atipica'       then array['area','pct_obra_tipica','pct_vgv','verba']
    when 'obra_nao_incidente' then array['area','pct_obra_tipica','pct_vgv','verba','pct_obra_raso']
    when 'projetos'           then array['area','pct_obra_tipica','pct_vgv','verba','pct_obra_raso','pct_obra_total']
    when 'pos_obra'           then array['area','pct_obra_tipica','pct_vgv','verba','pct_obra_raso','pct_obra_total']
    when 'comercial'          then array['pct_vgv','verba','verba_unidade','verba_mensal']
    when 'capital_permuta'    then array['pct_aporte_permuta']
    when 'capital_pagamento'  then array['pct_aporte_pagamento']
    else array['pct_vgv','pct_obra_total','pct_lucro','verba'] end
$$;
create or replace function app.viab_secao(p_grupo text)
returns text language sql immutable set search_path = '' as $$
  select case when p_grupo in ('obra_atipica','obra_nao_incidente','projetos','pos_obra') then 'obra'
              when p_grupo in ('capital_permuta','capital_pagamento') then 'financeiro'
              when p_grupo in ('taxas','financeiro','comercial') then p_grupo else 'despesas' end
$$;
create or replace function app.viab_fixo(p_grupo text)
returns boolean language sql immutable set search_path = '' as $$ select p_grupo in ('taxas','financeiro','capital_permuta','capital_pagamento','comercial') $$;
-- Taxas e Despesas financeiras: o estudo nasce com o valor padrão da empresa e só a
-- diretoria ou o administrador muda (decisão do Moisés, 26/out/2026).
create or replace function app.viab_restrito(p_grupo text)
returns boolean language sql immutable set search_path = '' as $$ select p_grupo in ('taxas','financeiro','capital_permuta','capital_pagamento') $$;

-- ---------------------------------------------------------------------
-- Lista de itens da empresa (configuração; empresa nula = padrão)
-- ---------------------------------------------------------------------
create table app.viabilidade_despesas (
  empresa_id    uuid references app.empresas(id) on delete cascade,
  codigo        text not null,
  nome          text not null check (length(trim(nome)) > 0),
  grupo         text not null check (grupo in ('obra_atipica','obra_nao_incidente','projetos','pos_obra',
                                               'terreno','incorporacao','cef','adm_financeiro','taxas','financeiro',
                                               'capital_permuta','capital_pagamento','comercial')),
  tipo_padrao   text check (tipo_padrao = any (app.viab_tipos(grupo))),
  valor_padrao  numeric(16,4),
  deduz_vgv     boolean not null default false check (not deduz_vgv or grupo = 'comercial'),  -- pode sair do VGV líquido
  ordem         int not null,
  ativo         boolean not null default true,
  unique nulls not distinct (empresa_id, codigo)
);
insert into app.viabilidade_despesas (codigo, nome, grupo, tipo_padrao, deduz_vgv, ordem) values
  ('fundacoes_especiais', 'Fundações especiais', 'obra_atipica', 'verba', false, 1),
  ('contencoes', 'Contenções', 'obra_atipica', 'verba', false, 2),
  ('demolicao', 'Demolição e limpeza do terreno', 'obra_atipica', 'verba', false, 3),
  ('infra_externa', 'Infraestrutura externa', 'obra_nao_incidente', 'verba', false, 4),
  ('ligacoes', 'Ligações definitivas (água, esgoto, energia)', 'obra_nao_incidente', 'verba', false, 5),
  ('areas_comuns', 'Equipamentos e decoração das áreas comuns', 'obra_nao_incidente', 'verba', false, 6),
  ('projetos', 'Projetos e consultorias', 'projetos', 'pct_obra_total', false, 7),
  ('aprovacoes', 'Aprovações e licenças', 'projetos', 'verba', false, 8),
  ('outorga', 'Outorga onerosa e contrapartidas', 'projetos', 'verba', false, 9),
  ('assistencia_tecnica', 'Assistência técnica pós-obra', 'pos_obra', 'pct_obra_total', false, 10),
  ('estoque', 'Manutenção e taxas de unidades em estoque', 'pos_obra', 'verba', false, 11),
  ('itbi_terreno', 'ITBI do terreno', 'terreno', 'verba', false, 12),
  ('registro_terreno', 'Escritura e registro do terreno', 'terreno', 'verba', false, 13),
  ('certidoes', 'Diligência e certidões', 'terreno', 'verba', false, 14),
  ('registro_incorporacao', 'Registro da incorporação', 'incorporacao', 'verba', false, 15),
  ('juridico', 'Jurídico', 'incorporacao', 'verba', false, 16),
  ('seguros', 'Seguros e garantias', 'incorporacao', 'pct_obra_total', false, 17),
  ('taxas_cef', 'Taxas e avaliações da CEF', 'cef', 'verba', false, 18),
  ('adm_central', 'Administração central', 'adm_financeiro', 'pct_vgv', false, 19),
  ('contabilidade', 'Contabilidade e auditoria', 'adm_financeiro', 'verba', false, 20),
  ('iptu_obra', 'IPTU durante a obra', 'adm_financeiro', 'verba', false, 21),
  ('taxa_desenvolvimento', 'Taxa de desenvolvimento', 'taxas', 'pct_lucro', false, 22),
  ('taxa_gestao_obra', 'Taxa de gestão de obra', 'taxas', 'pct_obra_total', false, 23),
  ('taxa_contingencias', 'Taxa de contingências', 'taxas', 'pct_obra_total', false, 24),
  ('custo_alavancagem', 'Custo de alavancagem', 'financeiro', 'verba', false, 25),
  ('juros_pj', 'Custo de juros PJ', 'financeiro', 'pct_obra_total', false, 26),
  ('custo_financeiro', 'Custo financeiro', 'financeiro', 'verba', false, 27),
  ('impostos', 'Impostos', 'financeiro', 'pct_vgv', false, 28),
  ('capital_permuta', 'Custo de capital permuta financeira', 'capital_permuta', 'pct_aporte_permuta', false, 29),
  ('capital_pagamento', 'Custo de capital pagamento terreno', 'capital_pagamento', 'pct_aporte_pagamento', false, 30),
  ('construcao_pdv', 'Construção do PDV', 'comercial', 'verba', false, 31),
  ('custo_fixo_comercial', 'Custo fixo comercial', 'comercial', 'verba_mensal', false, 32),
  ('marketing', 'Marketing', 'comercial', 'pct_vgv', false, 33),
  ('comissao', 'Comissão', 'comercial', 'pct_vgv', false, 34),
  ('itbi_vendas', 'ITBI de unidades vendidas', 'comercial', 'pct_vgv', true, 35),
  ('registro_vendas', 'Registro de unidades vendidas', 'comercial', 'pct_vgv', true, 36),
  ('contratos_cef', 'Taxa de emissão de contratos CEF', 'comercial', 'verba', false, 37),
  ('produto_caixa', 'Produto Caixa', 'comercial', 'pct_vgv', false, 38),
  ('outros_comercial', 'Outros', 'comercial', 'verba', false, 39);

alter table app.viabilidade_despesas enable row level security;
create policy ver on app.viabilidade_despesas for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.viabilidade_despesas to authenticated;
create trigger t_aud after insert or update or delete on app.viabilidade_despesas for each row execute function app.tg_auditoria();

-- rentabilidade mínima da empresa (tabela em 20261015000400_negociacao.sql, lida por v_terrenos)
alter table app.viabilidade_config enable row level security;
create policy ver on app.viabilidade_config for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.viabilidade_config to authenticated;
create trigger t_aud after insert or update or delete on app.viabilidade_config for each row execute function app.tg_auditoria();

create or replace function app.salvar_margem_minima(p_empresa uuid, p_pct numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  insert into app.viabilidade_config (empresa_id, margem_minima_pct) values (p_empresa, p_pct)
  on conflict (empresa_id) do update set margem_minima_pct = excluded.margem_minima_pct;
end $$;

-- ---------------------------------------------------------------------
-- O estudo: cabeçalho em app.viabilidades (tipo 'estatica'), com os dados
-- digitados do terreno e da obra incidente e os totais recalculados a cada
-- mudança nas tipologias, nas linhas e nos dados.
-- ---------------------------------------------------------------------
alter table app.viabilidades
  add column tipo               text not null default 'externa' check (tipo in ('externa','estatica')),
  -- digitados
  add column custo_m2           numeric(12,2) check (custo_m2 >= 0),             -- obra incidente: valor unitário (R$/m²)
  add column obra_base          text not null default 'privativa' check (obra_base in ('privativa','construida')),  -- o R$/m² multiplica qual área
  add column area_construida    numeric(14,2) check (area_construida > 0),       -- digitada; com estudo de massa, vem dele
  add column permuta_fin_pct    numeric(7,4) check (permuta_fin_pct between 0 and 100),
  add column deducao_vgv_pct    numeric(7,4) check (deducao_vgv_pct between 0 and 100),
  add column minimo_garantido   numeric(16,2) check (minimo_garantido >= 0),
  add column deduz_vgv          text[] not null default '{}',                    -- despesas comerciais que saem do VGV líquido
  add column pagamento_dinheiro numeric(16,2) check (pagamento_dinheiro >= 0),
  add column comissao_dinheiro  numeric(16,2) check (comissao_dinheiro >= 0),
  -- calculados
  add column area_privativa     numeric(14,2),
  add column unidades           int,
  add column unidades_permuta   int,
  add column unidades_comissao  int,
  add column permuta_valor      numeric(16,2),          -- VGV das unidades em permuta física
  add column comissao_valor     numeric(16,2),          -- VGV das unidades dadas na comissão
  add column vgv_vendido        numeric(16,2),
  add column deducoes           numeric(16,2),
  add column vgv_liquido        numeric(16,2),
  add column obra_incidente     numeric(16,2),
  add column obra_raso          numeric(16,2),
  add column obra_total         numeric(16,2),
  add column permuta_financeira numeric(16,2),
  add column custo_terreno      numeric(16,2),
  add column custo_obras        numeric(16,2),
  add column despesas_gerais    numeric(16,2),
  add column taxas              numeric(16,2),
  add column ebitda             numeric(16,2),
  add column despesas_financeiras numeric(16,2),
  add column lucro_sem_taxas    numeric(16,2),          -- resultado antes das taxas (que saem por último)
  add column custos_comerciais  numeric(16,2),
  add column despesas_total     numeric(16,2),          -- todas as saídas, inclusive as deduzidas do VGV
  add column lucro_liquido      numeric(16,2),
  add column atualizado_em      timestamptz not null default now(),
  add constraint viabilidade_estatica_do_terreno check (tipo = 'externa' or terreno_id is not null);

create table app.viabilidade_tipologias (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references app.empresas(id),
  viabilidade_id      uuid not null references app.viabilidades(id) on delete cascade,
  ordem               int  not null default 0,
  nome                text not null check (length(trim(nome)) > 0),
  area_privativa      numeric(10,2) check (area_privativa > 0),
  quantidade          int not null default 0 check (quantidade >= 0),
  quantidade_permuta  int not null default 0 check (quantidade_permuta >= 0),
  quantidade_comissao int not null default 0 check (quantidade_comissao >= 0),   -- dadas na comissão do terreno
  preco_unitario      numeric(14,2) check (preco_unitario >= 0),
  preco_m2            numeric(12,2) check (preco_m2 >= 0),
  criado_em           timestamptz not null default now(),
  check (quantidade_permuta + quantidade_comissao <= quantidade)
);
create index on app.viabilidade_tipologias (viabilidade_id, ordem);

create table app.viabilidade_linhas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  viabilidade_id     uuid not null references app.viabilidades(id) on delete cascade,
  ordem              int  not null default 0,
  despesa            text not null,
  tipo               text not null check (tipo in ('area','pct_obra_tipica','pct_obra_raso','pct_obra_total','pct_vgv','pct_lucro','verba','verba_unidade','verba_mensal',
                                         'pct_aporte_permuta','pct_aporte_pagamento')),
  valor              numeric(16,4),               -- nos tipos em %, o percentual (4 = 4%); nulo: ainda sem valor (conta zero)
  quantidade         numeric(10,2) not null default 1 check (quantidade > 0),   -- meses, só na verba mensal
  criado_em          timestamptz not null default now(),
  foreign key (empresa_id, despesa) references app.viabilidade_despesas (empresa_id, codigo) on update cascade
);
create index on app.viabilidade_linhas (viabilidade_id, ordem);

-- Preço unitário, preço por m² e área privativa ligados (o mesmo que o
-- protótipo faz em vbNorm): com a área, mudar o preço unitário refaz o m² e
-- mudar o m² refaz o unitário; mudar a área refaz o m² quando há os dois
-- preços e completa o que falta quando há um só. Apagar um preço não refaz.
create or replace function app.tg_viabilidade_tipologia()
returns trigger language plpgsql set search_path = '' as $$
declare campo text := 'area';
begin
  if tg_op = 'UPDATE' then
    if new.preco_unitario is distinct from old.preco_unitario then campo := 'unitario';
    elsif new.preco_m2 is distinct from old.preco_m2 then campo := 'm2'; end if;
  elsif new.preco_unitario is null and new.preco_m2 is not null then campo := 'm2';
  end if;
  if new.area_privativa is null then return new; end if;
  if campo = 'm2' then
    if new.preco_m2 is not null then new.preco_unitario := round(new.preco_m2 * new.area_privativa, 2); end if;
  elsif campo = 'unitario' then
    if new.preco_unitario is not null then new.preco_m2 := round(new.preco_unitario / new.area_privativa, 2); end if;
  elsif new.preco_unitario is not null then new.preco_m2 := round(new.preco_unitario / new.area_privativa, 2);
  elsif new.preco_m2 is not null then new.preco_unitario := round(new.preco_m2 * new.area_privativa, 2);
  end if;
  return new;
end $$;
create trigger t_precos before insert or update on app.viabilidade_tipologias for each row execute function app.tg_viabilidade_tipologia();

-- Filhas só de estudo estático, da mesma empresa, sem trocar de estudo.
-- Linha: item ativo da lista (ao entrar ou trocar), base aceita pelo grupo
-- do item e, nos grupos fixos, uma linha só por item.
create or replace function app.tg_viabilidade_filha()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v app.viabilidades; d app.viabilidade_despesas; j jsonb := to_jsonb(new);
begin
  select * into v from app.viabilidades where id = new.viabilidade_id;
  if v.empresa_id is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do estudo' using errcode = '42501';
  end if;
  if v.tipo <> 'estatica' then raise exception 'Estudo externo (do BKM) não tem tipologias nem despesas' using errcode = '23514'; end if;
  if tg_op = 'UPDATE' and new.viabilidade_id <> old.viabilidade_id then
    raise exception 'Uma linha não muda de estudo' using errcode = '23514';
  end if;
  if tg_table_name = 'viabilidade_linhas' then
    select * into d from app.viabilidade_despesas where empresa_id = new.empresa_id and codigo = j->>'despesa';
    if (tg_op = 'INSERT' or j->>'despesa' <> to_jsonb(old)->>'despesa') and not coalesce(d.ativo, false) then
      raise exception 'Item inativo ou fora da lista da empresa' using errcode = '23514';
    end if;
    if not (j->>'tipo' = any (app.viab_tipos(d.grupo))) then
      raise exception 'Base de cálculo % não vale para o grupo do item', j->>'tipo' using errcode = '23514';
    end if;
    if app.viab_fixo(d.grupo) and exists (select 1 from app.viabilidade_linhas l where l.viabilidade_id = new.viabilidade_id
                                            and l.despesa = j->>'despesa' and l.id <> (j->>'id')::uuid) then
      raise exception 'Item fixo já está no estudo' using errcode = '23505';
    end if;
    -- criar_viabilidade (padrão da empresa ou cópia de outro estudo) liga app.viab_criando.
    -- Vale também para a linha que era restrita e mudaria de item (trocar a taxa
    -- por outra despesa e zerar o valor).
    if (app.viab_restrito(d.grupo)
        or (tg_op = 'UPDATE' and exists (select 1 from app.viabilidade_despesas o where o.empresa_id = old.empresa_id
                                           and o.codigo = old.despesa and app.viab_restrito(o.grupo))))
       and coalesce(current_setting('app.viab_criando', true), '') <> 'on'
       and not app.eh_diretoria(new.empresa_id)
       and (tg_op = 'INSERT' or (new.despesa, new.tipo, new.valor, new.quantidade) is distinct from (old.despesa, old.tipo, old.valor, old.quantidade)) then
      raise exception 'Taxas e despesas financeiras: só a diretoria ou o administrador muda' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create or replace function app.tg_viabilidade_linha_apagar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- apagar o estudo inteiro (cascata) pode; tirar uma taxa do estudo, só a diretoria
  if exists (select 1 from app.viabilidades v where v.id = old.viabilidade_id)
     and exists (select 1 from app.viabilidade_despesas d where d.empresa_id = old.empresa_id and d.codigo = old.despesa and app.viab_restrito(d.grupo))
     and not app.eh_diretoria(old.empresa_id) then
    raise exception 'Taxas e despesas financeiras: só a diretoria ou o administrador muda' using errcode = '42501';
  end if;
  return old;
end $$;
create trigger t_filha before insert or update on app.viabilidade_tipologias for each row execute function app.tg_viabilidade_filha();
create trigger t_filha before insert or update on app.viabilidade_linhas for each row execute function app.tg_viabilidade_filha();
create trigger t_apagar before delete on app.viabilidade_linhas for each row execute function app.tg_viabilidade_linha_apagar();

-- Valor de uma linha com as bases do estudo (b: área, unidades vendidas, VGV vendido, obras, lucro).
create or replace function app._viab_valor(p_tipo text, p_valor numeric, p_qtd numeric, b jsonb)
returns numeric language sql immutable set search_path = '' as $$
  select round(case p_tipo when 'verba' then p_valor
                           when 'verba_mensal' then p_valor * p_qtd
                           when 'verba_unidade' then (b->>'unidades')::numeric * p_valor
                           when 'area' then (b->>'area')::numeric * p_valor
                           else (b->>p_tipo)::numeric * p_valor / 100 end, 2)
$$;
create or replace function app._viab_soma(p_id uuid, p_grupos text[], b jsonb, p_sem_lucro boolean default false)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(app._viab_valor(l.tipo, l.valor, l.quantidade, b)), 0)
    from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
   where l.viabilidade_id = p_id and d.grupo = any (p_grupos) and not (p_sem_lucro and l.tipo = 'pct_lucro')
$$;

-- Cálculo (o mesmo do protótipo, vbCalc). Cada linha arredondada em centavos.
-- Roda com todas as linhas (Taxas e Financeiras entram no total de quem não é
-- da diretoria), mas só devolve o detalhe das linhas que quem pergunta vê.
create or replace function app.calcular_viabilidade(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v app.viabilidades; b jsonb;
  v_area numeric; v_un int; v_unp int; v_unc int; v_ap numeric; v_ac numeric;
  v_vgv numeric; v_vp numeric; v_vc numeric; v_vv numeric;
  v_com numeric; v_dedc numeric; v_dedp numeric; v_liq numeric;
  v_oi numeric; v_raso numeric; v_ot numeric; v_obras numeric;
  v_pfc numeric; v_pf numeric; v_terr numeric; v_l0 numeric; v_lb numeric;
  v_linhas jsonb; v_sec jsonb; v_lucro numeric;
  DT constant text[] := array['terreno','incorporacao','cef','adm_financeiro','taxas','financeiro','capital_permuta','capital_pagamento'];
begin
  select * into v from app.viabilidades where id = p_id;
  if auth.uid() is not null and v.id is not null and v.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Estudo não encontrado' using errcode = 'P0002';
  end if;
  select coalesce(sum(quantidade * area_privativa), 0), coalesce(sum(quantidade), 0), coalesce(sum(quantidade_permuta), 0), coalesce(sum(quantidade_comissao), 0),
         coalesce(sum(quantidade_permuta * area_privativa), 0), coalesce(sum(quantidade_comissao * area_privativa), 0),
         coalesce(sum(quantidade * preco_unitario), 0), coalesce(sum(quantidade_permuta * preco_unitario), 0), coalesce(sum(quantidade_comissao * preco_unitario), 0)
    into v_area, v_un, v_unp, v_unc, v_ap, v_ac, v_vgv, v_vp, v_vc
    from app.viabilidade_tipologias where viabilidade_id = p_id;
  v_vv := v_vgv - v_vp - v_vc;
  b := jsonb_build_object('area', v_area, 'unidades', v_un - v_unp - v_unc, 'pct_vgv', v_vv);
  -- VGV líquido: dedução em % e as despesas comerciais marcadas para deduzir. Só a base da permuta financeira:
  -- a receita é o VGV vendido e as despesas marcadas continuam nas comerciais (decisão do Moises, 11/nov/2026)
  v_com := app._viab_soma(p_id, array['comercial'], b);
  select coalesce(sum(app._viab_valor(l.tipo, l.valor, l.quantidade, b)), 0) into v_dedc
    from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
   where l.viabilidade_id = p_id and d.grupo = 'comercial' and d.deduz_vgv and l.despesa = any (v.deduz_vgv);
  v_dedp := round(v_vv * coalesce(v.deducao_vgv_pct, 0) / 100, 2);
  v_liq := v_vv - v_dedp - v_dedc;
  -- obra em camadas
  v_oi := round(coalesce(v.custo_m2, 0) * case when v.obra_base = 'construida' then coalesce(v.area_construida, 0) else v_area end, 2);
  b := b || jsonb_build_object('pct_obra_tipica', v_oi);
  v_raso := v_oi + app._viab_soma(p_id, array['obra_atipica'], b);
  b := b || jsonb_build_object('pct_obra_raso', v_raso);
  v_ot := v_raso + app._viab_soma(p_id, array['obra_nao_incidente'], b);
  b := b || jsonb_build_object('pct_obra_total', v_ot);
  v_obras := v_ot + app._viab_soma(p_id, array['projetos','pos_obra'], b);
  -- terreno
  v_pfc := round(v_liq * coalesce(v.permuta_fin_pct, 0) / 100, 2);
  v_pf := greatest(v_pfc, coalesce(v.minimo_garantido, 0));
  v_terr := v_pf + coalesce(v.pagamento_dinheiro, 0) + coalesce(v.comissao_dinheiro, 0);
  -- Aporte do custo de capital: a permuta financeira em dinheiro e o pagamento em dinheiro do terreno
  b := b || jsonb_build_object('pct_aporte_permuta', v_pf, 'pct_aporte_pagamento', coalesce(v.pagamento_dinheiro, 0));
  -- % do lucro líquido: % × o lucro antes desses itens (decisão do Moises, 11/nov/2026)
  v_l0 := v_vv - v_terr - v_obras - v_com - app._viab_soma(p_id, DT, b, true);
  v_lb := case when v_l0 > 0 then round(v_l0, 2) else 0 end;
  b := b || jsonb_build_object('pct_lucro', v_lb);
  select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'grupo', y.grupo, 'secao', y.secao, 'base', y.base, 'valor', y.valor) order by y.ordem, y.criado_em)
                    filter (where auth.uid() is null or not app.viab_restrito(y.grupo) or app.eh_diretoria(v.empresa_id)), '[]'::jsonb),
         jsonb_build_object('obra', v_obras, 'terreno', v_terr,
                            'despesas', coalesce(sum(y.valor) filter (where y.secao = 'despesas'), 0),
                            'taxas', coalesce(sum(y.valor) filter (where y.secao = 'taxas'), 0),
                            'financeiro', coalesce(sum(y.valor) filter (where y.secao = 'financeiro'), 0),
                            'comercial', v_com),
         coalesce(sum(y.valor) filter (where y.tipo = 'pct_lucro'), 0)
    into v_linhas, v_sec, v_lucro
    from (select l.id, l.ordem, l.criado_em, l.tipo, d.grupo, app.viab_secao(d.grupo) as secao,
                 case when l.tipo like 'pct%' or l.tipo = 'area' then (b->>l.tipo)::numeric when l.tipo = 'verba_unidade' then (b->>'unidades')::numeric end as base,
                 app._viab_valor(l.tipo, l.valor, l.quantidade, b) as valor
            from app.viabilidade_linhas l
            join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
           where l.viabilidade_id = p_id) y;
  v_lucro := v_l0 - v_lucro;
  return jsonb_build_object(
    'area_privativa', v_area, 'area_construida', v.area_construida, 'obra_base', v.obra_base, 'unidades', v_un, 'unidades_permuta', v_unp, 'unidades_comissao', v_unc,
    'area_permuta', v_ap, 'area_comissao', v_ac,
    'vgv', v_vgv, 'permuta', v_vp, 'comissao', v_vc, 'vgv_vendido', v_vv,
    'deducao_pct', v_dedp, 'deducao_comercial', v_dedc, 'deducoes', v_dedp + v_dedc, 'vgv_liquido', v_liq,
    'obra_incidente', v_oi, 'obra_raso', v_raso, 'obra_total', v_ot,
    'permuta_financeira_calculada', v_pfc, 'permuta_financeira', v_pf, 'minimo_aplicado', v_pf > v_pfc,
    'secoes', v_sec, 'despesas', v_terr + v_obras + v_com + (v_sec->>'despesas')::numeric + (v_sec->>'taxas')::numeric + (v_sec->>'financeiro')::numeric,
    'ebitda', v_lucro + (v_sec->>'taxas')::numeric + (v_sec->>'financeiro')::numeric,
    'lucro_sem_taxas', v_lucro + (v_sec->>'taxas')::numeric, 'lucro_liquido', v_lucro,
    'margem_pct', case when v_vv > 0 then round(v_lucro / v_vv * 100, 2) end,
    'linhas', v_linhas);
end $$;

create or replace function app._recalcular_viabilidade(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c jsonb := app.calcular_viabilidade(p_id);
begin
  update app.viabilidades set
    area_privativa = (c->>'area_privativa')::numeric, unidades = (c->>'unidades')::int,
    unidades_permuta = (c->>'unidades_permuta')::int, unidades_comissao = (c->>'unidades_comissao')::int,
    vgv = (c->>'vgv')::numeric, permuta_valor = (c->>'permuta')::numeric, comissao_valor = (c->>'comissao')::numeric,
    vgv_vendido = (c->>'vgv_vendido')::numeric, deducoes = (c->>'deducoes')::numeric, vgv_liquido = (c->>'vgv_liquido')::numeric,
    obra_incidente = (c->>'obra_incidente')::numeric, obra_raso = (c->>'obra_raso')::numeric, obra_total = (c->>'obra_total')::numeric,
    permuta_financeira = (c->>'permuta_financeira')::numeric,
    custo_obras = (c#>>'{secoes,obra}')::numeric, custo_terreno = (c#>>'{secoes,terreno}')::numeric,
    despesas_gerais = (c#>>'{secoes,despesas}')::numeric, taxas = (c#>>'{secoes,taxas}')::numeric,
    ebitda = (c->>'ebitda')::numeric, despesas_financeiras = (c#>>'{secoes,financeiro}')::numeric, lucro_sem_taxas = (c->>'lucro_sem_taxas')::numeric,
    custos_comerciais = (c#>>'{secoes,comercial}')::numeric, despesas_total = (c->>'despesas')::numeric,
    lucro_liquido = (c->>'lucro_liquido')::numeric, margem_pct = (c->>'margem_pct')::numeric,
    calculado_em = current_date, atualizado_em = now()
  where id = p_id and tipo = 'estatica';
end $$;

create or replace function app.tg_viabilidade_recalcular()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'viabilidade_despesas' then
    perform app._recalcular_viabilidade(v.id) from app.viabilidades v
     where v.tipo = 'estatica' and exists (select 1 from app.viabilidade_linhas l where l.viabilidade_id = v.id and l.empresa_id = new.empresa_id and l.despesa = new.codigo);
    return null;
  end if;
  perform app._recalcular_viabilidade(coalesce(new.viabilidade_id, old.viabilidade_id));
  if tg_op = 'UPDATE' and new.viabilidade_id <> old.viabilidade_id then perform app._recalcular_viabilidade(old.viabilidade_id); end if;
  return null;
end $$;
create trigger t_recalc after insert or update or delete on app.viabilidade_tipologias for each row execute function app.tg_viabilidade_recalcular();
create trigger t_recalc after insert or update or delete on app.viabilidade_linhas for each row execute function app.tg_viabilidade_recalcular();
create trigger t_recalc after update of deduz_vgv on app.viabilidade_despesas for each row execute function app.tg_viabilidade_recalcular();

-- Tipologias e linhas: escrita direta (sem regra de funil); o cálculo é do banco.
do $$
declare t text;
begin
  foreach t in array array['viabilidade_tipologias','viabilidade_linhas'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy remover on app.%I for delete to authenticated using (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update, delete on app.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on app.%I for each row execute function app.tg_auditoria()', t);
  end loop;
end $$;

-- Taxas e Despesas financeiras: fora da diretoria, só o total (que fica em
-- app.viabilidades); cada linha, o valor e o log dela, só a diretoria vê.
create or replace function app.viab_linha_visivel(p_empresa uuid, p_despesa text)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.eh_diretoria(p_empresa)
      or not exists (select 1 from app.viabilidade_despesas d
                      where d.empresa_id = p_empresa and d.codigo = p_despesa and app.viab_restrito(d.grupo))
$$;
revoke all on function app.viab_linha_visivel(uuid, text) from public;
grant execute on function app.viab_linha_visivel(uuid, text) to authenticated;
drop policy ver on app.viabilidade_linhas;
create policy ver on app.viabilidade_linhas for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and app.viab_linha_visivel(empresa_id, despesa));
-- (o log de cada linha segue a mesma regra: ver a política da auditoria depois dos modelos)

-- ---------------------------------------------------------------------
-- Modelos de estudo (decisão do Moisés, 26/out/2026): valores e bases de
-- cálculo guardados para o estudo novo já nascer com eles. Modelo da
-- empresa (user_id nulo; só o administrador grava, e um deles pode ser o
-- padrão, que o estudo novo usa quando ninguém escolhe outro) ou do
-- usuário (só ele vê e usa). Guarda o valor unitário da obra, a dedução
-- do VGV, as despesas que saem do VGV líquido e as linhas (item, base,
-- valor, meses); tipologias e as condições do terreno (permuta, mínimo
-- garantido, pagamento e comissão em dinheiro) são de cada terreno e
-- ficam fora. Taxas e Despesas financeiras só entram no modelo gravado
-- pela diretoria ou pelo administrador e só são aplicadas a partir de
-- modelo da empresa ou para quem é da diretoria; fora disso, valem os
-- valores padrão da lista.
-- ---------------------------------------------------------------------
create table app.viabilidade_modelos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete cascade,   -- nulo: modelo da empresa
  nome          text not null check (length(trim(nome)) > 0),
  padrao        boolean not null default false check (not padrao or user_id is null),
  dados         jsonb not null check (jsonb_typeof(dados) = 'object'),
  criado_por    uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique nulls not distinct (empresa_id, user_id, nome)
);
create unique index viabilidade_modelo_padrao on app.viabilidade_modelos (empresa_id) where padrao;
create trigger t_upd before update on app.viabilidade_modelos for each row execute function app.tg_atualizado_em();
alter table app.viabilidade_modelos enable row level security;
create policy ver on app.viabilidade_modelos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and (user_id is null or user_id = auth.uid()));
create trigger t_aud after insert or update or delete on app.viabilidade_modelos for each row execute function app.tg_auditoria();

-- Leitura dos modelos só por esta função (revisão de 2/nov/2026): o modelo da
-- empresa salvo pela diretoria guarda Taxas e Despesas financeiras, e fora da
-- diretoria essas linhas saem de `dados`, como no estudo.
create or replace function app.modelos_viabilidade(p_empresa uuid)
returns table (id uuid, empresa_id uuid, user_id uuid, nome text, padrao boolean, dados jsonb,
               criado_por uuid, criado_em timestamptz, atualizado_em timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.id, m.empresa_id, m.user_id, m.nome, m.padrao,
         jsonb_set(m.dados, '{linhas}', coalesce((select jsonb_agg(l order by n) from jsonb_array_elements(m.dados->'linhas') with ordinality x(l, n)
                                                  where app.viab_linha_visivel(m.empresa_id, l->>'despesa')), '[]'::jsonb)),
         m.criado_por, m.criado_em, m.atualizado_em
  from app.viabilidade_modelos m
  where m.empresa_id = p_empresa and p_empresa in (select app.minhas_empresas())
    and (m.user_id is null or m.user_id = auth.uid())
  order by m.user_id is not null, m.nome $$;
revoke all on function app.modelos_viabilidade(uuid) from public;
grant execute on function app.modelos_viabilidade(uuid) to authenticated;
-- e o log do modelo, que leva os mesmos dados, só a diretoria vê
grant execute on function app.eh_diretoria(uuid) to authenticated;
drop policy auditoria_ver on app.auditoria;
create policy auditoria_ver on app.auditoria for select to authenticated
  using (empresa_id in (select app.minhas_empresas())
         and (fluxo.tarefa_do_log(tabela, registro_id, antes, depois) is null
              or fluxo.papel_tarefa(fluxo.tarefa_do_log(tabela, registro_id, antes, depois)) is not null)
         and (tabela <> 'viabilidade_linhas'
              or (app.viab_linha_visivel(empresa_id, antes->>'despesa') and app.viab_linha_visivel(empresa_id, depois->>'despesa')))
         and (tabela <> 'viabilidade_modelos' or app.eh_diretoria(empresa_id)));

-- Grava o estudo como modelo: novo (p_modelo nulo) ou por cima de um modelo
-- existente (o dono, ou o administrador no da empresa).
create or replace function app.salvar_modelo_viabilidade(p_viab uuid, p_nome text, p_da_empresa boolean default false, p_modelo uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades; m app.viabilidade_modelos; v_dados jsonb; v_id uuid;
begin
  select * into v from app.viabilidades where id = p_viab and tipo = 'estatica';
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  if length(trim(coalesce(p_nome, ''))) = 0 then raise exception 'Dê um nome ao modelo' using errcode = '22023'; end if;
  if p_modelo is not null then
    select * into m from app.viabilidade_modelos where id = p_modelo and empresa_id = v.empresa_id for update;
    if not found or (m.user_id is not null and m.user_id <> auth.uid()) then
      raise exception 'Modelo não encontrado' using errcode = 'P0002';
    end if;
    p_da_empresa := m.user_id is null;
  end if;
  if p_da_empresa then perform app.exigir_administrador(v.empresa_id); end if;
  select jsonb_build_object(
           'custo_m2', v.custo_m2, 'obra_base', v.obra_base, 'deducao_vgv_pct', v.deducao_vgv_pct, 'deduz_vgv', to_jsonb(v.deduz_vgv),
           'linhas', coalesce(jsonb_agg(jsonb_build_object('despesa', l.despesa, 'tipo', l.tipo, 'valor', l.valor, 'quantidade', l.quantidade)
                                        order by l.ordem, l.criado_em), '[]'::jsonb))
    into v_dados
    from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
   where l.viabilidade_id = v.id and (not app.viab_restrito(d.grupo) or app.eh_diretoria(v.empresa_id));
  if p_modelo is not null then
    update app.viabilidade_modelos set nome = trim(p_nome), dados = v_dados where id = p_modelo;
    return p_modelo;
  end if;
  insert into app.viabilidade_modelos (empresa_id, user_id, nome, dados)
  values (v.empresa_id, case when p_da_empresa then null else auth.uid() end, trim(p_nome), v_dados)
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe um modelo com esse nome' using errcode = '23505';
end $$;

create or replace function app.apagar_modelo_viabilidade(p_modelo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare m app.viabilidade_modelos;
begin
  select * into m from app.viabilidade_modelos where id = p_modelo for update;
  if not found or (m.user_id is not null and m.user_id is distinct from auth.uid()) then
    raise exception 'Modelo não encontrado' using errcode = 'P0002';
  end if;
  if m.user_id is null then perform app.exigir_administrador(m.empresa_id); else perform app.exigir_editor(m.empresa_id); end if;
  delete from app.viabilidade_modelos where id = p_modelo;
end $$;

-- O padrão da empresa (só modelo da empresa; nulo tira o padrão).
create or replace function app.marcar_modelo_padrao(p_empresa uuid, p_modelo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  if p_modelo is not null and not exists (select 1 from app.viabilidade_modelos
                                           where id = p_modelo and empresa_id = p_empresa and user_id is null) then
    raise exception 'Só modelo da empresa pode ser o padrão' using errcode = 'P0002';
  end if;
  update app.viabilidade_modelos set padrao = false where empresa_id = p_empresa and padrao and id is distinct from p_modelo;
  update app.viabilidade_modelos set padrao = true where id = p_modelo and not padrao;
end $$;

-- ---------------------------------------------------------------------
-- RPCs do estudo
-- ---------------------------------------------------------------------
-- Novo estudo do terreno, já com os itens fixos (Taxas, Despesas financeiras e Despesas
-- comerciais) da lista; com p_copiar_de, duplica dados, tipologias e linhas; senão,
-- usa o modelo escolhido (p_modelo) ou, sem escolha, o padrão da empresa
-- (p_sem_modelo = true: só a lista).
create or replace function app.criar_viabilidade(p_terreno uuid, p_nome text, p_copiar_de uuid default null,
                                                 p_modelo uuid default null, p_sem_modelo boolean default false)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; o app.viabilidades; m app.viabilidade_modelos; v_id uuid;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if length(trim(coalesce(p_nome, ''))) = 0 then raise exception 'Dê um nome ao estudo' using errcode = '22023'; end if;
  if p_copiar_de is not null then
    select * into o from app.viabilidades where id = p_copiar_de and empresa_id = t.empresa_id and tipo = 'estatica';
    if not found then raise exception 'Estudo de origem não encontrado' using errcode = 'P0002'; end if;
  elsif p_modelo is not null then
    select * into m from app.viabilidade_modelos
     where id = p_modelo and empresa_id = t.empresa_id and (user_id is null or user_id = auth.uid());
    if not found then raise exception 'Modelo não encontrado' using errcode = 'P0002'; end if;
  elsif not p_sem_modelo then
    select * into m from app.viabilidade_modelos where empresa_id = t.empresa_id and padrao;
  end if;
  if m.id is not null then
    o.custo_m2 := (m.dados->>'custo_m2')::numeric;
    o.obra_base := coalesce(m.dados->>'obra_base', 'privativa');
    o.deducao_vgv_pct := (m.dados->>'deducao_vgv_pct')::numeric;
    select coalesce(array_agg(x), '{}') into o.deduz_vgv from jsonb_array_elements_text(coalesce(m.dados->'deduz_vgv', '[]')) x
     where exists (select 1 from app.viabilidade_despesas d where d.empresa_id = t.empresa_id and d.codigo = x and d.deduz_vgv);
  end if;
  -- a cópia leva o vínculo com o estudo de massa (e as tipologias presas a ele)
  insert into app.viabilidades (empresa_id, terreno_id, nome, tipo, custo_m2, obra_base, area_construida, permuta_fin_pct, deducao_vgv_pct,
                                minimo_garantido, deduz_vgv, pagamento_dinheiro, comissao_dinheiro, estudo_massa_id, segue_massa_valido)
  values (t.empresa_id, t.id, trim(p_nome), 'estatica', o.custo_m2, coalesce(o.obra_base, 'privativa'), o.area_construida, o.permuta_fin_pct, o.deducao_vgv_pct,
          o.minimo_garantido, coalesce(o.deduz_vgv, '{}'), o.pagamento_dinheiro, o.comissao_dinheiro,
          o.estudo_massa_id, coalesce(o.segue_massa_valido, false)) returning id into v_id;
  perform set_config('app.viab_criando', 'on', true);
  if p_copiar_de is not null then
    perform set_config('app.massa_sync', 'on', true);
    insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, quantidade_comissao, preco_unitario, preco_m2, massa_tipologia_id)
    select empresa_id, v_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, quantidade_comissao, preco_unitario, preco_m2, massa_tipologia_id
      from app.viabilidade_tipologias where viabilidade_id = p_copiar_de order by ordem, criado_em;
    perform set_config('app.massa_sync', '', true);
    insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, valor, quantidade)
    select l.empresa_id, v_id, l.ordem, l.despesa, l.tipo, l.valor, l.quantidade
      from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa and d.ativo
     where l.viabilidade_id = p_copiar_de order by l.ordem, l.criado_em;
  elsif m.id is not null then
    -- só itens ativos, com base ainda aceita pelo grupo, uma linha por item fixo;
    -- Taxas e Despesas financeiras só de modelo da empresa ou para a diretoria
    insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, valor, quantidade)
    select t.empresa_id, v_id, x.n, d.codigo, x.l->>'tipo', (x.l->>'valor')::numeric, coalesce((x.l->>'quantidade')::numeric, 1)
      from jsonb_array_elements(coalesce(m.dados->'linhas', '[]')) with ordinality x(l, n)
      join app.viabilidade_despesas d on d.empresa_id = t.empresa_id and d.codigo = x.l->>'despesa' and d.ativo
     where x.l->>'tipo' = any (app.viab_tipos(d.grupo))
       and (not app.viab_restrito(d.grupo) or m.user_id is null or app.eh_diretoria(t.empresa_id))
       and (not app.viab_fixo(d.grupo) or x.n = (select min(y.n) from jsonb_array_elements(m.dados->'linhas') with ordinality y(l, n)
                                                  where y.l->>'despesa' = d.codigo))
     order by x.n;
  end if;
  insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, valor)
  select d.empresa_id, v_id, d.ordem, d.codigo, coalesce(d.tipo_padrao, (app.viab_tipos(d.grupo))[1]), d.valor_padrao
    from app.viabilidade_despesas d
   where d.empresa_id = t.empresa_id and d.ativo and app.viab_fixo(d.grupo)
     and not exists (select 1 from app.viabilidade_linhas l where l.viabilidade_id = v_id and l.despesa = d.codigo)
   order by d.ordem;
  perform set_config('app.viab_criando', '', true);
  perform app._recalcular_viabilidade(v_id);
  return v_id;
end $$;

-- Nome e os dados digitados da obra incidente e do terreno.
create or replace function app.salvar_viabilidade(p_id uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades; v_ded text[];
begin
  select * into v from app.viabilidades where id = p_id for update;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  perform app._chaves_permitidas(p_dados, array['nome','custo_m2','obra_base','area_construida','permuta_fin_pct','deducao_vgv_pct',
                                                'minimo_garantido','deduz_vgv','pagamento_dinheiro','comissao_dinheiro']);
  if p_dados ? 'area_construida' and v.estudo_massa_id is not null then
    raise exception 'A área construída vem do estudo de massa' using errcode = '23514';
  end if;
  if p_dados ? 'nome' and length(trim(coalesce(p_dados->>'nome', ''))) = 0 then raise exception 'Dê um nome ao estudo' using errcode = '22023'; end if;
  if p_dados ? 'deduz_vgv' then
    select coalesce(array_agg(distinct x), '{}') into v_ded from jsonb_array_elements_text(p_dados->'deduz_vgv') x;
    if exists (select 1 from unnest(v_ded) x where not exists (select 1 from app.viabilidade_despesas d
                 where d.empresa_id = v.empresa_id and d.codigo = x and d.deduz_vgv)) then
      raise exception 'Só as despesas comerciais marcadas como dedutíveis saem do VGV líquido' using errcode = '23514';
    end if;
  end if;
  update app.viabilidades set
    nome = case when p_dados ? 'nome' then trim(p_dados->>'nome') else nome end,
    custo_m2           = case when p_dados ? 'custo_m2'           then (p_dados->>'custo_m2')::numeric           else custo_m2 end,
    obra_base          = case when p_dados ? 'obra_base'          then p_dados->>'obra_base'                     else obra_base end,
    area_construida    = case when p_dados ? 'area_construida'    then (p_dados->>'area_construida')::numeric    else area_construida end,
    permuta_fin_pct    = case when p_dados ? 'permuta_fin_pct'    then (p_dados->>'permuta_fin_pct')::numeric    else permuta_fin_pct end,
    deducao_vgv_pct    = case when p_dados ? 'deducao_vgv_pct'    then (p_dados->>'deducao_vgv_pct')::numeric    else deducao_vgv_pct end,
    minimo_garantido   = case when p_dados ? 'minimo_garantido'   then (p_dados->>'minimo_garantido')::numeric   else minimo_garantido end,
    pagamento_dinheiro = case when p_dados ? 'pagamento_dinheiro' then (p_dados->>'pagamento_dinheiro')::numeric else pagamento_dinheiro end,
    comissao_dinheiro  = case when p_dados ? 'comissao_dinheiro'  then (p_dados->>'comissao_dinheiro')::numeric  else comissao_dinheiro end,
    deduz_vgv = case when p_dados ? 'deduz_vgv' then v_ded else deduz_vgv end,
    atualizado_em = now()
  where id = p_id;
  perform app._recalcular_viabilidade(p_id);
end $$;

-- Estudo vinculado a uma negociação ou usado numa proposta não se apaga.
create or replace function app.apagar_viabilidade(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades;
begin
  select * into v from app.viabilidades where id = p_id for update;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  if exists (select 1 from app.processos where viabilidade_id = p_id) or exists (select 1 from app.propostas where viabilidade_id = p_id) then
    raise exception 'Estudo vinculado à negociação ou usado numa proposta: não se apaga' using errcode = '23503';
  end if;
  delete from app.viabilidades where id = p_id;
end $$;

-- A negociação usa o estudo (VGV e margem vêm dele; a margem abaixo da mínima da empresa acende o aviso).
create or replace function app.vincular_estudo(p_processo uuid, p_viabilidade uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v app.viabilidades;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if p.fase is distinct from app._fase_entrada(p.empresa_id) then
    raise exception 'Estudo de viabilidade é da negociação (fase de entrada)' using errcode = '23514';
  end if;
  select * into v from app.viabilidades where id = p_viabilidade and empresa_id = p.empresa_id;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  if v.terreno_id is distinct from p.terreno_id then raise exception 'O estudo é de outro terreno' using errcode = '23514'; end if;
  update app.processos set viabilidade_id = v.id where id = p.id;
end $$;

-- ---------------------------------------------------------------------
-- Configurações › Viabilidade: lista de itens (só administrador). O grupo
-- de um item já usado em estudo não muda (as bases e a seção vêm dele).
-- ---------------------------------------------------------------------
create or replace function app.salvar_despesa_viabilidade(p_empresa uuid, p_codigo text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare d app.viabilidade_despesas;
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['nome','grupo','tipo_padrao','valor_padrao','deduz_vgv','ordem','ativo']);
  select * into d from app.viabilidade_despesas where empresa_id = p_empresa and codigo = p_codigo for update;
  if found then
    if p_dados ? 'grupo' and p_dados->>'grupo' <> d.grupo
       and exists (select 1 from app.viabilidade_linhas where empresa_id = p_empresa and despesa = p_codigo) then
      raise exception 'Item já usado em estudo não muda de grupo' using errcode = '23514';
    end if;
    update app.viabilidade_despesas set
      nome  = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
      grupo = coalesce(p_dados->>'grupo', grupo),
      tipo_padrao = case when p_dados ? 'tipo_padrao' then p_dados->>'tipo_padrao'
                         when p_dados ? 'grupo' and not (tipo_padrao = any (app.viab_tipos(p_dados->>'grupo'))) then null else tipo_padrao end,
      valor_padrao = case when p_dados ? 'valor_padrao' then (p_dados->>'valor_padrao')::numeric else valor_padrao end,
      deduz_vgv = coalesce((p_dados->>'deduz_vgv')::boolean, deduz_vgv),
      ordem = coalesce((p_dados->>'ordem')::int, ordem),
      ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
    where empresa_id = p_empresa and codigo = p_codigo;
  else
    if p_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Código do item: letras minúsculas, números e _' using errcode = '22023'; end if;
    insert into app.viabilidade_despesas (empresa_id, codigo, nome, grupo, tipo_padrao, valor_padrao, deduz_vgv, ordem)
    values (p_empresa, p_codigo, p_dados->>'nome', p_dados->>'grupo', p_dados->>'tipo_padrao', (p_dados->>'valor_padrao')::numeric,
            coalesce((p_dados->>'deduz_vgv')::boolean, false),
            coalesce((p_dados->>'ordem')::int, (select coalesce(max(ordem), 0) + 1 from app.viabilidade_despesas where empresa_id = p_empresa)));
  end if;
end $$;

create or replace function app.apagar_despesa_viabilidade(p_empresa uuid, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  if exists (select 1 from app.viabilidade_linhas where empresa_id = p_empresa and despesa = p_codigo) then
    raise exception 'Item já usado em estudo: desative em vez de apagar' using errcode = '22023';
  end if;
  delete from app.viabilidade_despesas where empresa_id = p_empresa and codigo = p_codigo;
  if not found then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
end $$;

-- Empresa que já existia recebe a lista padrão (as novas recebem em tg_copiar_configuracao).
insert into app.viabilidade_despesas (empresa_id, codigo, nome, grupo, tipo_padrao, valor_padrao, deduz_vgv, ordem, ativo)
select e.id, d.codigo, d.nome, d.grupo, d.tipo_padrao, d.valor_padrao, d.deduz_vgv, d.ordem, d.ativo
  from app.empresas e cross join app.viabilidade_despesas d where d.empresa_id is null
on conflict do nothing;

revoke execute on function app.tg_viabilidade_tipologia(), app.tg_viabilidade_filha(), app.tg_viabilidade_linha_apagar(), app.tg_viabilidade_recalcular(),
  app._recalcular_viabilidade(uuid) from public;
revoke execute on function app.calcular_viabilidade(uuid), app.criar_viabilidade(uuid, text, uuid, uuid, boolean), app.salvar_viabilidade(uuid, jsonb),
  app.apagar_viabilidade(uuid), app.vincular_estudo(uuid, uuid), app.salvar_despesa_viabilidade(uuid, text, jsonb),
  app.apagar_despesa_viabilidade(uuid, text), app.salvar_margem_minima(uuid, numeric),
  app.salvar_modelo_viabilidade(uuid, text, boolean, uuid), app.apagar_modelo_viabilidade(uuid), app.marcar_modelo_padrao(uuid, uuid) from public;
grant execute on function app.calcular_viabilidade(uuid), app.criar_viabilidade(uuid, text, uuid, uuid, boolean), app.salvar_viabilidade(uuid, jsonb),
  app.apagar_viabilidade(uuid), app.vincular_estudo(uuid, uuid), app.salvar_despesa_viabilidade(uuid, text, jsonb),
  app.apagar_despesa_viabilidade(uuid, text), app.salvar_margem_minima(uuid, numeric),
  app.salvar_modelo_viabilidade(uuid, text, boolean, uuid), app.apagar_modelo_viabilidade(uuid), app.marcar_modelo_padrao(uuid, uuid) to authenticated;
