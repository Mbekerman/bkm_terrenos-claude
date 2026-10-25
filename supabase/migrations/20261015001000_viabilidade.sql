-- =====================================================================
-- Estudo de viabilidade estática (decisão do Moisés, 25/out/2026)
-- Avaliação prévia, sem fluxo de caixa: tipologias (área privativa,
-- quantidade, quantidade em permuta, preço unitário e preço por m²) dão o
-- VGV; linhas de despesa (da lista da empresa) dão o custo; o resultado é
-- VGV líquido, lucro líquido e margem líquida.
--   VGV            = Σ quantidade × preço unitário
--   permuta        = Σ quantidade em permuta × preço unitário
--   VGV líquido    = VGV − permuta
--   linha          = base × multiplicador × quantidade (parcelas); nos tipos
--                    em %, o multiplicador é o percentual (4 = 4%)
--     % do VGV            base = VGV líquido
--     % da obra incidente base = soma das linhas de despesa marcadas "incidente"
--     % da obra total     base = soma das linhas de despesa que compõem a obra
--     verba total         base = 1
--     verba por unidade   base = total de unidades (inclusive as permutadas)
--   As linhas "% da obra" nunca entram na base da obra.
--   lucro líquido  = VGV líquido − Σ linhas;  margem = lucro ÷ VGV líquido
--   As linhas aparecem em quatro seções pelo grupo da despesa: Obra → Custo
--   de obras, Comercial → Custos comerciais, Impostos, Financeiro e Gestão e
--   administração → Taxas, o resto → Despesas (decisão do Moisés, 25/out/2026); cada seção tem o seu total.
-- O estudo é do terreno (vários por terreno); a negociação vincula um
-- (processos.viabilidade_id). O estudo externo do BKM (tipo 'externa',
-- app.vincular_viabilidade) continua.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Lista de despesas da empresa (configuração; empresa nula = padrão)
-- Mesmos itens de tools/viabilidade/despesas.json, que o protótipo lê.
-- ---------------------------------------------------------------------
create table app.viabilidade_despesas (
  empresa_id    uuid references app.empresas(id) on delete cascade,
  codigo        text not null,
  nome          text not null check (length(trim(nome)) > 0),
  grupo         text not null default 'outros'
                check (grupo in ('terreno','projetos','obra','comercial','impostos','administracao','financeiro','outros')),
  obra          text not null default 'nao' check (obra in ('nao','incidente','total')),
  tipo_padrao   text check (tipo_padrao in ('pct_vgv','pct_obra_incidente','pct_obra_total','verba_total','verba_unidade')),
  multiplicador_padrao numeric(16,4),
  ordem         int not null,
  ativo         boolean not null default true,
  unique nulls not distinct (empresa_id, codigo)
);
insert into app.viabilidade_despesas (codigo, nome, grupo, obra, tipo_padrao, multiplicador_padrao, ordem) values
  ('terreno', 'Terreno', 'terreno', 'nao', 'verba_total', null, 1),
  ('itbi_registro', 'ITBI e registro do terreno', 'terreno', 'nao', 'verba_total', null, 2),
  ('corretagem_terreno', 'Corretagem do terreno', 'terreno', 'nao', 'verba_total', null, 3),
  ('projetos', 'Projetos e consultorias', 'projetos', 'nao', 'verba_total', null, 4),
  ('aprovacoes', 'Aprovações e licenças', 'projetos', 'nao', 'verba_total', null, 5),
  ('outorga', 'Outorga onerosa e contrapartidas', 'projetos', 'nao', 'verba_total', null, 6),
  ('construcao', 'Construção (edificação)', 'obra', 'incidente', 'verba_unidade', null, 7),
  ('infra_interna', 'Infraestrutura interna', 'obra', 'incidente', 'verba_total', null, 8),
  ('infra_externa', 'Infraestrutura externa', 'obra', 'total', 'verba_total', null, 9),
  ('ligacoes', 'Ligações definitivas', 'obra', 'total', 'verba_unidade', null, 10),
  ('seguros_obra', 'Seguros e garantias da obra', 'obra', 'nao', 'pct_obra_total', 1, 11),
  ('contingencia', 'Contingência de obra', 'obra', 'nao', 'pct_obra_incidente', 3, 12),
  ('comissao', 'Comissão de vendas', 'comercial', 'nao', 'pct_vgv', 4, 13),
  ('marketing', 'Marketing e publicidade', 'comercial', 'nao', 'pct_vgv', 1.5, 14),
  ('stand', 'Stand e apartamento decorado', 'comercial', 'nao', 'verba_total', null, 15),
  ('ret', 'Impostos (RET)', 'impostos', 'nao', 'pct_vgv', 4, 16),
  ('adm_obra', 'Administração da obra', 'administracao', 'nao', 'pct_obra_total', 5, 17),
  ('adm_incorporacao', 'Administração da incorporação', 'administracao', 'nao', 'pct_vgv', 2, 18),
  ('financiamento', 'Taxas do financiamento (Caixa)', 'financeiro', 'nao', 'pct_vgv', null, 19),
  ('juridico', 'Jurídico, cartório e registro da incorporação', 'outros', 'nao', 'verba_total', null, 20),
  ('estoque', 'Condomínio e IPTU das unidades em estoque', 'outros', 'nao', 'verba_unidade', null, 21),
  ('outras', 'Outras despesas', 'outros', 'nao', 'verba_total', null, 22);

alter table app.viabilidade_despesas enable row level security;
create policy ver on app.viabilidade_despesas for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.viabilidade_despesas to authenticated;
create trigger t_aud after insert or update or delete on app.viabilidade_despesas for each row execute function app.tg_auditoria();

-- ---------------------------------------------------------------------
-- O estudo: cabeçalho em app.viabilidades (tipo 'estatica'), com os totais
-- recalculados a cada mudança nas tipologias e linhas.
-- ---------------------------------------------------------------------
alter table app.viabilidades
  add column tipo             text not null default 'externa' check (tipo in ('externa','estatica')),
  add column vgv_liquido      numeric(16,2),
  add column permuta_valor    numeric(16,2),
  add column despesas_total   numeric(16,2),          -- todas as saídas
  add column custo_obras      numeric(16,2),
  add column custos_comerciais numeric(16,2),
  add column taxas            numeric(16,2),
  add column despesas_gerais  numeric(16,2),          -- seção Despesas
  add column lucro_liquido    numeric(16,2),
  add column obra_total       numeric(16,2),
  add column obra_incidente   numeric(16,2),
  add column unidades         int,
  add column unidades_permuta int,
  add column atualizado_em    timestamptz not null default now(),
  add constraint viabilidade_estatica_do_terreno check (tipo = 'externa' or terreno_id is not null);

create table app.viabilidade_tipologias (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  viabilidade_id     uuid not null references app.viabilidades(id) on delete cascade,
  ordem              int  not null default 0,
  nome               text not null check (length(trim(nome)) > 0),
  area_privativa     numeric(10,2) check (area_privativa > 0),
  quantidade         int not null default 0 check (quantidade >= 0),
  quantidade_permuta int not null default 0 check (quantidade_permuta >= 0),
  preco_unitario     numeric(14,2) check (preco_unitario >= 0),
  preco_m2           numeric(12,2) check (preco_m2 >= 0),
  criado_em          timestamptz not null default now(),
  check (quantidade_permuta <= quantidade)
);
create index on app.viabilidade_tipologias (viabilidade_id, ordem);

create table app.viabilidade_linhas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  viabilidade_id     uuid not null references app.viabilidades(id) on delete cascade,
  ordem              int  not null default 0,
  despesa            text not null,
  tipo               text not null check (tipo in ('pct_vgv','pct_obra_incidente','pct_obra_total','verba_total','verba_unidade')),
  multiplicador      numeric(16,4),               -- nulo: linha ainda sem valor (conta zero)
  quantidade         numeric(10,2) not null default 1 check (quantidade > 0),   -- parcelas
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

-- Filhas só de estudo estático, da mesma empresa, sem trocar de estudo;
-- linha nova só com despesa ativa da lista.
create or replace function app.tg_viabilidade_filha()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v app.viabilidades;
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
    if (tg_op = 'INSERT' or to_jsonb(new)->>'despesa' <> to_jsonb(old)->>'despesa')
       and not exists (select 1 from app.viabilidade_despesas where empresa_id = new.empresa_id and codigo = to_jsonb(new)->>'despesa' and ativo) then
      raise exception 'Despesa inativa ou fora da lista da empresa' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger t_filha before insert or update on app.viabilidade_tipologias for each row execute function app.tg_viabilidade_filha();
create trigger t_filha before insert or update on app.viabilidade_linhas for each row execute function app.tg_viabilidade_filha();

-- Cálculo (o mesmo do protótipo, vbCalc). Cada linha arredondada em centavos.
create or replace function app.calcular_viabilidade(p_id uuid)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare v_vgv numeric; v_perm numeric; v_un int; v_unp int; v_liq numeric; v_ot numeric; v_oi numeric; v_desp numeric; v_linhas jsonb; v_sec jsonb;
begin
  select coalesce(sum(quantidade * preco_unitario), 0), coalesce(sum(quantidade_permuta * preco_unitario), 0),
         coalesce(sum(quantidade), 0), coalesce(sum(quantidade_permuta), 0)
    into v_vgv, v_perm, v_un, v_unp
    from app.viabilidade_tipologias where viabilidade_id = p_id;
  v_liq := v_vgv - v_perm;
  -- base da obra: linhas que compõem a obra, fora as que são % da obra
  select coalesce(sum(x.valor) filter (where x.obra in ('incidente','total')), 0), coalesce(sum(x.valor) filter (where x.obra = 'incidente'), 0)
    into v_ot, v_oi
    from (select d.obra, round(case l.tipo when 'pct_vgv' then v_liq * l.multiplicador / 100
                                           when 'verba_total' then l.multiplicador
                                           when 'verba_unidade' then v_un * l.multiplicador end * l.quantidade, 2) as valor
            from app.viabilidade_linhas l
            join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
           where l.viabilidade_id = p_id and l.tipo not in ('pct_obra_incidente','pct_obra_total')) x;
  select coalesce(jsonb_agg(jsonb_build_object('id', y.id, 'secao', y.secao, 'base', y.base, 'valor', y.valor) order by y.ordem, y.criado_em), '[]'::jsonb),
         coalesce(sum(y.valor), 0),
         jsonb_build_object('obra', coalesce(sum(y.valor) filter (where y.secao = 'obra'), 0),
                            'comercial', coalesce(sum(y.valor) filter (where y.secao = 'comercial'), 0),
                            'taxas', coalesce(sum(y.valor) filter (where y.secao = 'taxas'), 0),
                            'despesas', coalesce(sum(y.valor) filter (where y.secao = 'despesas'), 0))
    into v_linhas, v_desp, v_sec
    from (select l.id, l.ordem, l.criado_em, b.base,
                 case d.grupo when 'obra' then 'obra' when 'comercial' then 'comercial' when 'impostos' then 'taxas' when 'financeiro' then 'taxas' when 'administracao' then 'taxas' else 'despesas' end as secao,
                 round(b.base * l.multiplicador / case when l.tipo like 'pct%' then 100 else 1 end * l.quantidade, 2) as valor
            from app.viabilidade_linhas l
            join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa
            cross join lateral (select case l.tipo when 'pct_vgv' then v_liq when 'pct_obra_incidente' then v_oi
                                                   when 'pct_obra_total' then v_ot when 'verba_total' then 1 else v_un end::numeric as base) b
           where l.viabilidade_id = p_id) y;
  return jsonb_build_object(
    'vgv', v_vgv, 'permuta', v_perm, 'vgv_liquido', v_liq, 'unidades', v_un, 'unidades_permuta', v_unp,
    'obra_total', v_ot, 'obra_incidente', v_oi, 'despesas', v_desp, 'secoes', v_sec, 'lucro_liquido', v_liq - v_desp,
    'margem_pct', case when v_liq > 0 then round((v_liq - v_desp) / v_liq * 100, 2) end,
    'linhas', v_linhas);
end $$;

create or replace function app._recalcular_viabilidade(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare c jsonb := app.calcular_viabilidade(p_id);
begin
  update app.viabilidades set
    vgv = (c->>'vgv')::numeric, permuta_valor = (c->>'permuta')::numeric, vgv_liquido = (c->>'vgv_liquido')::numeric,
    unidades = (c->>'unidades')::int, unidades_permuta = (c->>'unidades_permuta')::int,
    obra_total = (c->>'obra_total')::numeric, obra_incidente = (c->>'obra_incidente')::numeric,
    despesas_total = (c->>'despesas')::numeric,
    custo_obras = (c#>>'{secoes,obra}')::numeric, custos_comerciais = (c#>>'{secoes,comercial}')::numeric, taxas = (c#>>'{secoes,taxas}')::numeric, despesas_gerais = (c#>>'{secoes,despesas}')::numeric, lucro_liquido = (c->>'lucro_liquido')::numeric,
    margem_pct = (c->>'margem_pct')::numeric, calculado_em = current_date, atualizado_em = now()
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
create trigger t_recalc after update of obra, grupo on app.viabilidade_despesas for each row execute function app.tg_viabilidade_recalcular();

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
-- Novo estudo do terreno; com p_copiar_de, duplica tipologias e despesas.
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
  insert into app.viabilidades (empresa_id, terreno_id, nome, tipo, preco_max_terreno)
  values (t.empresa_id, t.id, trim(p_nome), 'estatica', o.preco_max_terreno) returning id into v_id;
  if p_copiar_de is not null then
    insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, preco_unitario, preco_m2)
    select empresa_id, v_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, preco_unitario, preco_m2
      from app.viabilidade_tipologias where viabilidade_id = p_copiar_de order by ordem, criado_em;
    insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, multiplicador, quantidade)
    select l.empresa_id, v_id, l.ordem, l.despesa, l.tipo, l.multiplicador, l.quantidade
      from app.viabilidade_linhas l join app.viabilidade_despesas d on d.empresa_id = l.empresa_id and d.codigo = l.despesa and d.ativo
     where l.viabilidade_id = p_copiar_de order by l.ordem, l.criado_em;
  end if;
  perform app._recalcular_viabilidade(v_id);
  return v_id;
end $$;

create or replace function app.salvar_viabilidade(p_id uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades;
begin
  select * into v from app.viabilidades where id = p_id for update;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  perform app._chaves_permitidas(p_dados, array['nome','preco_max_terreno']);
  if p_dados ? 'nome' and length(trim(coalesce(p_dados->>'nome', ''))) = 0 then raise exception 'Dê um nome ao estudo' using errcode = '22023'; end if;
  update app.viabilidades set
    nome = case when p_dados ? 'nome' then trim(p_dados->>'nome') else nome end,
    preco_max_terreno = case when p_dados ? 'preco_max_terreno' then (p_dados->>'preco_max_terreno')::numeric else preco_max_terreno end,
    atualizado_em = now()
  where id = p_id;
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
-- Configurações › Viabilidade: lista de despesas (só administrador)
-- ---------------------------------------------------------------------
create or replace function app.salvar_despesa_viabilidade(p_empresa uuid, p_codigo text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['nome','grupo','obra','tipo_padrao','multiplicador_padrao','ordem','ativo']);
  update app.viabilidade_despesas set
    nome  = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    grupo = coalesce(p_dados->>'grupo', grupo),
    obra  = coalesce(p_dados->>'obra', obra),
    tipo_padrao = case when p_dados ? 'tipo_padrao' then p_dados->>'tipo_padrao' else tipo_padrao end,
    multiplicador_padrao = case when p_dados ? 'multiplicador_padrao' then (p_dados->>'multiplicador_padrao')::numeric else multiplicador_padrao end,
    ordem = coalesce((p_dados->>'ordem')::int, ordem),
    ativo = coalesce((p_dados->>'ativo')::boolean, ativo)
  where empresa_id = p_empresa and codigo = p_codigo;
  if not found then
    if p_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Código da despesa: letras minúsculas, números e _' using errcode = '22023'; end if;
    insert into app.viabilidade_despesas (empresa_id, codigo, nome, grupo, obra, tipo_padrao, multiplicador_padrao, ordem)
    values (p_empresa, p_codigo, p_dados->>'nome', coalesce(p_dados->>'grupo', 'outros'), coalesce(p_dados->>'obra', 'nao'),
            p_dados->>'tipo_padrao', (p_dados->>'multiplicador_padrao')::numeric,
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
    raise exception 'Despesa já usada em estudo: desative em vez de apagar' using errcode = '22023';
  end if;
  delete from app.viabilidade_despesas where empresa_id = p_empresa and codigo = p_codigo;
  if not found then raise exception 'Despesa não encontrada' using errcode = 'P0002'; end if;
end $$;

-- Empresa que já existia recebe a lista padrão (as novas recebem em tg_copiar_configuracao).
insert into app.viabilidade_despesas (empresa_id, codigo, nome, grupo, obra, tipo_padrao, multiplicador_padrao, ordem, ativo)
select e.id, d.codigo, d.nome, d.grupo, d.obra, d.tipo_padrao, d.multiplicador_padrao, d.ordem, d.ativo
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
