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
--                     unidades vendidas, Produto Caixa)
--   Custo de obras, em camadas:
--     obra incidente (típico) = valor unitário (R$/m²) × área privativa total
--     itens atípicos          bases: área privativa, % do típico, % do VGV, verba
--     obra raso    = incidente + atípicos
--     obra não incidente      + % do raso
--     obra total   = raso + não incidente
--     projetos e pós-obra     + % da obra total
--   Custo do terreno: permuta financeira = % × VGV líquido, nunca abaixo do
--     mínimo garantido; + pagamento em dinheiro + comissão em dinheiro. A
--     permuta física e as unidades da comissão já saíram do VGV vendido.
--   Despesas gerais (Terreno, Incorporação, CEF, Administrativo e
--     financeiro) e Taxas: % do VGV, % da obra total, % do lucro líquido ou
--     verba. O % do lucro é circular: lucro = L0 ÷ (1 + Σ%), onde L0 é o
--     lucro antes desses itens; sem lucro (L0 ≤ 0), eles valem zero.
--   Despesas comerciais: % do VGV, verba total, verba por unidade (× unidades
--     líquidas: total − permuta − comissão; decisão do Moisés, 26/out/2026)
--     ou verba mensal (× meses).
--   lucro líquido = VGV líquido − terreno − obras − despesas gerais − taxas
--                   − despesas comerciais não deduzidas
--   margem líquida = lucro ÷ VGV líquido
-- O grupo do item define a seção, as bases aceitas e se é fixo (Taxas e
-- Despesas comerciais aparecem sempre no estudo). Mesmos grupos e itens de
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
    else array['pct_vgv','pct_obra_total','pct_lucro','verba'] end
$$;
create or replace function app.viab_secao(p_grupo text)
returns text language sql immutable set search_path = '' as $$
  select case when p_grupo in ('obra_atipica','obra_nao_incidente','projetos','pos_obra') then 'obra'
              when p_grupo in ('taxas','comercial') then p_grupo else 'despesas' end
$$;
create or replace function app.viab_fixo(p_grupo text)
returns boolean language sql immutable set search_path = '' as $$ select p_grupo in ('taxas','comercial') $$;

-- ---------------------------------------------------------------------
-- Lista de itens da empresa (configuração; empresa nula = padrão)
-- ---------------------------------------------------------------------
create table app.viabilidade_despesas (
  empresa_id    uuid references app.empresas(id) on delete cascade,
  codigo        text not null,
  nome          text not null check (length(trim(nome)) > 0),
  grupo         text not null check (grupo in ('obra_atipica','obra_nao_incidente','projetos','pos_obra',
                                               'terreno','incorporacao','cef','adm_financeiro','taxas','comercial')),
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
  ('estoque', 'Condomínio e IPTU das unidades em estoque', 'pos_obra', 'verba', false, 11),
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
  ('impostos', 'Impostos', 'taxas', 'pct_vgv', false, 22),
  ('taxa_desenvolvimento', 'Taxa de desenvolvimento', 'taxas', 'pct_lucro', false, 23),
  ('taxa_gestao_obra', 'Taxa de gestão de obra', 'taxas', 'pct_obra_total', false, 24),
  ('taxa_contingencias', 'Taxa de contingências', 'taxas', 'pct_obra_total', false, 25),
  ('custo_financeiro', 'Custo financeiro', 'taxas', 'verba', false, 26),
  ('custo_alavancagem', 'Custo de alavancagem', 'taxas', 'verba', false, 27),
  ('construcao_pdv', 'Construção do PDV', 'comercial', 'verba', false, 28),
  ('custo_fixo_comercial', 'Custo fixo comercial', 'comercial', 'verba_mensal', false, 29),
  ('marketing', 'Marketing', 'comercial', 'pct_vgv', false, 30),
  ('comissao', 'Comissão', 'comercial', 'pct_vgv', false, 31),
  ('itbi_vendas', 'ITBI de unidades vendidas', 'comercial', 'pct_vgv', true, 32),
  ('registro_vendas', 'Registro de unidades vendidas', 'comercial', 'pct_vgv', true, 33),
  ('contratos_cef', 'Taxa de emissão de contratos CEF', 'comercial', 'verba', false, 34),
  ('produto_caixa', 'Produto Caixa', 'comercial', 'pct_vgv', true, 35),
  ('outros_comercial', 'Outros', 'comercial', 'verba', false, 36);

alter table app.viabilidade_despesas enable row level security;
create policy ver on app.viabilidade_despesas for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.viabilidade_despesas to authenticated;
create trigger t_aud after insert or update or delete on app.viabilidade_despesas for each row execute function app.tg_auditoria();

-- ---------------------------------------------------------------------
-- O estudo: cabeçalho em app.viabilidades (tipo 'estatica'), com os dados
-- digitados do terreno e da obra incidente e os totais recalculados a cada
-- mudança nas tipologias, nas linhas e nos dados.
-- ---------------------------------------------------------------------
alter table app.viabilidades
  add column tipo               text not null default 'externa' check (tipo in ('externa','estatica')),
  -- digitados
  add column custo_m2           numeric(12,2) check (custo_m2 >= 0),             -- obra incidente: valor unitário (R$/m²)
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
  tipo               text not null check (tipo in ('area','pct_obra_tipica','pct_obra_raso','pct_obra_total','pct_vgv','pct_lucro','verba','verba_unidade','verba_mensal')),
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
  end if;
  return new;
end $$;
create trigger t_filha before insert or update on app.viabilidade_tipologias for each row execute function app.tg_viabilidade_filha();
create trigger t_filha before insert or update on app.viabilidade_linhas for each row execute function app.tg_viabilidade_filha();

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
create or replace function app.calcular_viabilidade(p_id uuid)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  v app.viabilidades; b jsonb;
  v_area numeric; v_un int; v_unp int; v_unc int; v_ap numeric; v_ac numeric;
  v_vgv numeric; v_vp numeric; v_vc numeric; v_vv numeric;
  v_com numeric; v_dedc numeric; v_dedp numeric; v_liq numeric;
  v_oi numeric; v_raso numeric; v_ot numeric; v_obras numeric;
  v_pfc numeric; v_pf numeric; v_terr numeric; v_pl numeric; v_l0 numeric; v_lb numeric;
  v_linhas jsonb; v_sec jsonb; v_lucro numeric;
  DG constant text[] := array['terreno','incorporacao','cef','adm_financeiro'];
begin
  select * into v from app.viabilidades where id = p_id;
  select coalesce(sum(quantidade * area_privativa), 0), coalesce(sum(quantidade), 0), coalesce(sum(quantidade_permuta), 0), coalesce(sum(quantidade_comissao), 0),
         coalesce(sum(quantidade_permuta * area_privativa), 0), coalesce(sum(quantidade_comissao * area_privativa), 0),
         coalesce(sum(quantidade * preco_unitario), 0), coalesce(sum(quantidade_permuta * preco_unitario), 0), coalesce(sum(quantidade_comissao * preco_unitario), 0)
    into v_area, v_un, v_unp, v_unc, v_ap, v_ac, v_vgv, v_vp, v_vc
    from app.viabilidade_tipologias where viabilidade_id = p_id;
  v_vv := v_vgv - v_vp - v_vc;
  b := jsonb_build_object('area', v_area, 'unidades', v_un - v_unp - v_unc, 'pct_vgv', v_vv);
  -- VGV líquido: dedução em % e as despesas comerciais marcadas para deduzir
  v_com := app._viab_soma(p_id, array['comercial'], b);
  select coalesce(sum(app._viab_valor(l.tipo, l.valor, l.quantidade, b)), 0) into v_dedc
    from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
   where l.viabilidade_id = p_id and d.grupo = 'comercial' and d.deduz_vgv and l.despesa = any (v.deduz_vgv);
  v_dedp := round(v_vv * coalesce(v.deducao_vgv_pct, 0) / 100, 2);
  v_liq := v_vv - v_dedp - v_dedc;
  -- obra em camadas
  v_oi := round(coalesce(v.custo_m2, 0) * v_area, 2);
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
  -- % do lucro líquido (circular): lucro antes desses itens ÷ (1 + Σ%)
  select coalesce(sum(l.valor), 0) into v_pl
    from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
   where l.viabilidade_id = p_id and l.tipo = 'pct_lucro' and d.grupo = any (DG || array['taxas']);
  v_l0 := v_liq - v_terr - v_obras - (v_com - v_dedc) - app._viab_soma(p_id, DG || array['taxas'], b, true);
  v_lb := case when v_l0 > 0 then round(v_l0 / (1 + v_pl / 100), 2) else 0 end;
  b := b || jsonb_build_object('pct_lucro', v_lb);
  select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'grupo', y.grupo, 'secao', y.secao, 'base', y.base, 'valor', y.valor) order by y.ordem, y.criado_em), '[]'::jsonb),
         jsonb_build_object('obra', v_obras, 'terreno', v_terr,
                            'despesas', coalesce(sum(y.valor) filter (where y.secao = 'despesas'), 0),
                            'taxas', coalesce(sum(y.valor) filter (where y.secao = 'taxas'), 0),
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
    'area_privativa', v_area, 'unidades', v_un, 'unidades_permuta', v_unp, 'unidades_comissao', v_unc,
    'area_permuta', v_ap, 'area_comissao', v_ac,
    'vgv', v_vgv, 'permuta', v_vp, 'comissao', v_vc, 'vgv_vendido', v_vv,
    'deducao_pct', v_dedp, 'deducao_comercial', v_dedc, 'deducoes', v_dedp + v_dedc, 'vgv_liquido', v_liq,
    'obra_incidente', v_oi, 'obra_raso', v_raso, 'obra_total', v_ot,
    'permuta_financeira_calculada', v_pfc, 'permuta_financeira', v_pf, 'minimo_aplicado', v_pf > v_pfc,
    'secoes', v_sec, 'despesas', v_terr + v_obras + v_com + (v_sec->>'despesas')::numeric + (v_sec->>'taxas')::numeric,
    'lucro_liquido', v_lucro,
    'margem_pct', case when v_liq > 0 then round(v_lucro / v_liq * 100, 2) end,
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

-- ---------------------------------------------------------------------
-- RPCs do estudo
-- ---------------------------------------------------------------------
-- Novo estudo do terreno, já com os itens fixos (Taxas e Despesas
-- comerciais) da lista; com p_copiar_de, duplica dados, tipologias e linhas.
create or replace function app.criar_viabilidade(p_terreno uuid, p_nome text, p_copiar_de uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; o app.viabilidades; v_id uuid;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if length(trim(coalesce(p_nome, ''))) = 0 then raise exception 'Dê um nome ao estudo' using errcode = '22023'; end if;
  if p_copiar_de is not null then
    select * into o from app.viabilidades where id = p_copiar_de and empresa_id = t.empresa_id and tipo = 'estatica';
    if not found then raise exception 'Estudo de origem não encontrado' using errcode = 'P0002'; end if;
  end if;
  insert into app.viabilidades (empresa_id, terreno_id, nome, tipo, preco_max_terreno, custo_m2, permuta_fin_pct, deducao_vgv_pct,
                                minimo_garantido, deduz_vgv, pagamento_dinheiro, comissao_dinheiro)
  values (t.empresa_id, t.id, trim(p_nome), 'estatica', o.preco_max_terreno, o.custo_m2, o.permuta_fin_pct, o.deducao_vgv_pct,
          o.minimo_garantido, coalesce(o.deduz_vgv, '{}'), o.pagamento_dinheiro, o.comissao_dinheiro) returning id into v_id;
  if p_copiar_de is not null then
    insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, quantidade_comissao, preco_unitario, preco_m2)
    select empresa_id, v_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, quantidade_comissao, preco_unitario, preco_m2
      from app.viabilidade_tipologias where viabilidade_id = p_copiar_de order by ordem, criado_em;
    insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, valor, quantidade)
    select l.empresa_id, v_id, l.ordem, l.despesa, l.tipo, l.valor, l.quantidade
      from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa and d.ativo
     where l.viabilidade_id = p_copiar_de order by l.ordem, l.criado_em;
  end if;
  insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, valor)
  select d.empresa_id, v_id, d.ordem, d.codigo, coalesce(d.tipo_padrao, (app.viab_tipos(d.grupo))[1]), d.valor_padrao
    from app.viabilidade_despesas d
   where d.empresa_id = t.empresa_id and d.ativo and app.viab_fixo(d.grupo)
     and not exists (select 1 from app.viabilidade_linhas l where l.viabilidade_id = v_id and l.despesa = d.codigo)
   order by d.ordem;
  perform app._recalcular_viabilidade(v_id);
  return v_id;
end $$;

-- Nome, preço máximo e os dados digitados da obra incidente e do terreno.
create or replace function app.salvar_viabilidade(p_id uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades; v_ded text[];
begin
  select * into v from app.viabilidades where id = p_id for update;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  perform app._chaves_permitidas(p_dados, array['nome','preco_max_terreno','custo_m2','permuta_fin_pct','deducao_vgv_pct',
                                                'minimo_garantido','deduz_vgv','pagamento_dinheiro','comissao_dinheiro']);
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
    preco_max_terreno  = case when p_dados ? 'preco_max_terreno'  then (p_dados->>'preco_max_terreno')::numeric  else preco_max_terreno end,
    custo_m2           = case when p_dados ? 'custo_m2'           then (p_dados->>'custo_m2')::numeric           else custo_m2 end,
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

-- A negociação usa o estudo (VGV, margem e preço máximo vêm dele).
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

revoke execute on function app.tg_viabilidade_tipologia(), app.tg_viabilidade_filha(), app.tg_viabilidade_recalcular(),
  app._recalcular_viabilidade(uuid) from public;
revoke execute on function app.calcular_viabilidade(uuid), app.criar_viabilidade(uuid, text, uuid), app.salvar_viabilidade(uuid, jsonb),
  app.apagar_viabilidade(uuid), app.vincular_estudo(uuid, uuid), app.salvar_despesa_viabilidade(uuid, text, jsonb),
  app.apagar_despesa_viabilidade(uuid, text) from public;
grant execute on function app.calcular_viabilidade(uuid), app.criar_viabilidade(uuid, text, uuid), app.salvar_viabilidade(uuid, jsonb),
  app.apagar_viabilidade(uuid), app.vincular_estudo(uuid, uuid), app.salvar_despesa_viabilidade(uuid, text, jsonb),
  app.apagar_despesa_viabilidade(uuid, text) to authenticated;
