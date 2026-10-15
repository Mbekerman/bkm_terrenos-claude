-- =====================================================================
-- BKM Terrenos · 0005 · views de leitura e regras de negócio (RPCs)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Views (security_invoker: a RLS das tabelas vale)
-- ---------------------------------------------------------------------

-- Todos os itens para todo terreno; o que não foi registrado aparece como "não verificado".
create view app.v_terreno_infraestrutura with (security_invoker = true) as
select t.id as terreno_id, t.empresa_id, i.codigo as item, i.nome, i.ordem,
       coalesce(ti.disponibilidade, 'nao_verificado') as disponibilidade,
       ti.data_verificacao, ti.fonte, ti.observacoes
from app.terrenos t
cross join app.itens_infraestrutura i
left join app.terreno_infraestrutura ti on ti.terreno_id = t.id and ti.item = i.codigo
where i.ativo;

-- Inscrição com os valores do exercício mais recente.
create view app.v_inscricoes with (security_invoker = true) as
select ins.*, v.exercicio, v.valor_venal, v.iptu_valor_anual, v.iptu_parcelas,
       round(v.iptu_valor_anual / nullif(v.iptu_parcelas, 0), 2) as iptu_valor_parcela,
       round(v.iptu_valor_anual / 12, 2)                       as iptu_equivalente_mensal
from app.inscricoes_municipais ins
left join lateral (
  select * from app.inscricao_valores x where x.inscricao_id = ins.id order by exercicio desc limit 1
) v on true;

-- Parâmetros urbanísticos da análise vigente, resumidos por terreno.
create view app.v_urbanismo_vigente with (security_invoker = true) as
select a.terreno_id, a.empresa_id, a.id as analise_id, a.data_verificacao, a.fonte,
       string_agg(z.sigla, ' + ' order by az.area_abrangida_m2 desc nulls last, z.sigla) as zoneamentos,
       max(az.ca_maximo) as ca_maximo,
       bool_or(az.gabarito_sem_limite) as algum_gabarito_sem_limite,
       min(az.gabarito_maximo_m) as menor_gabarito_m,
       count(*) as qtd_zonas
from app.analises_urbanisticas a
join app.analise_zoneamentos az on az.analise_id = a.id
join app.zoneamentos z on z.id = az.zoneamento_id
where a.status = 'vigente'
group by a.terreno_id, a.empresa_id, a.id, a.data_verificacao, a.fonte;

create view app.v_documentos with (security_invoker = true) as
select d.*,
       td.nome as tipo_nome, td.categoria, td.validade_dias,
       case when d.emitido_em is not null and td.validade_dias is not null then d.emitido_em + td.validade_dias end as valido_ate,
       case
         when d.situacao = 'rejeitado' then 'rejeitado'
         when td.validade_dias is not null and d.emitido_em + td.validade_dias < current_date then 'vencido'
         else d.situacao
       end as situacao_efetiva,
       v.versao as versao_atual, v.nome_arquivo, v.storage_path, v.enviado_em
from app.documentos d
join app.tipos_documento td on td.codigo = d.tipo_documento
left join lateral (
  select versao, nome_arquivo, storage_path, enviado_em from app.documento_versoes x
  where x.documento_id = d.id order by versao desc limit 1
) v on true;

create view app.v_checklist with (security_invoker = true) as
select p.id as processo_id, p.empresa_id, c.etapa, c.tipo_documento, c.obrigatorio, c.ordem,
       td.nome as tipo_nome, td.validade_dias,
       em.ordem <= ea.ordem as ativo,
       d.id as documento_id, d.emitido_em, d.valido_ate, d.versao_atual, d.nome_arquivo, d.storage_path,
       coalesce(d.situacao_efetiva, 'pendente') as situacao
from app.processos p
join app.checklist_modelo c on c.tipo_processo = p.tipo
join app.tipos_documento td on td.codigo = c.tipo_documento
join app.etapas_modelo em on em.tipo_processo = p.tipo and em.codigo = c.etapa
join app.etapas_modelo ea on ea.tipo_processo = p.tipo and ea.codigo = p.etapa_atual
left join app.v_documentos d on d.processo_id = p.id and d.tipo_documento = c.tipo_documento;

-- Linha por terreno para a listagem e o cabeçalho da ficha.
create view app.v_terrenos with (security_invoker = true) as
select t.id, t.empresa_id, t.codigo, t.nome, t.situacao_cadastral, t.prioridade, t.responsavel_id,
       t.logradouro, t.numero, t.bairro, t.zona, mu.nome as municipio, ec.nome as eixo_comercial,
       t.area_adotada_m2, t.fonte_area_adotada, t.origem_cadastro, t.data_identificacao,
       -- negociação atual (aberta, ou a última encerrada)
       p.id as processo_id, p.codigo as processo_codigo, p.status as negociacao_status,
       p.etapa_atual, e.nome as etapa_nome, e.ordem as etapa_ordem,
       (current_date - p.etapa_desde::date) as dias_na_etapa,
       n.temperatura,
       -- condições pedidas: oferta de referência, ou a mais recente ativa
       o.id as oferta_id, o.valor_pedido, o.forma_pagamento_pedida, o.aceita_permuta, o.observacao_pagamento,
       round(o.valor_pedido / nullif(t.area_adotada_m2, 0), 2) as valor_pedido_m2,
       (select count(*) from app.ofertas x where x.terreno_id = t.id) as qtd_ofertas,
       cp.nome_razao_social as corretor_principal,
       lp.valor_total as ultima_proposta_valor, lp.origem as ultima_proposta_origem, lp.status as ultima_proposta_status,
       vb.preco_max_terreno,
       (vb.preco_max_terreno is not null and lp.origem = 'bkm' and lp.valor_total > vb.preco_max_terreno) as acima_preco_max,
       u.zoneamentos, u.ca_maximo,
       nt.titulo as proxima_tarefa, nt.prazo as proxima_tarefa_prazo,
       (select count(*) from app.tarefas k where k.terreno_id = t.id and k.status not in ('concluida','cancelada') and k.prazo < current_date) as tarefas_atrasadas,
       (select count(*) from app.v_documentos d where d.terreno_id = t.id and d.processo_id = p.id and d.situacao_efetiva = 'vencido') as docs_vencidos
from app.terrenos t
join app.municipios mu on mu.id = t.municipio_id
left join app.eixos_comerciais ec on ec.id = t.eixo_comercial_id
left join lateral (
  select * from app.processos x where x.terreno_id = t.id and x.tipo = 'negociacao'
  order by (x.status in ('ativo','suspensa')) desc, x.data_inicio desc limit 1
) p on true
left join app.etapas_modelo e on e.tipo_processo = p.tipo and e.codigo = p.etapa_atual
left join app.negociacoes n on n.processo_id = p.id
left join lateral (
  select * from app.ofertas x where x.terreno_id = t.id
  order by (x.id = n.oferta_referencia_id) desc nulls last, (x.status = 'ativa') desc, x.data_oferta desc, x.criado_em desc limit 1
) o on true
left join lateral (
  select pe.nome_razao_social from app.terreno_corretores tc
  join app.corretores c on c.id = tc.corretor_id join app.pessoas pe on pe.id = c.pessoa_id
  where tc.terreno_id = t.id and tc.principal limit 1
) cp on true
left join lateral (select * from app.propostas x where x.processo_id = p.id order by versao desc limit 1) lp on true
left join app.viabilidades vb on vb.id = p.viabilidade_id
left join app.v_urbanismo_vigente u on u.terreno_id = t.id
left join lateral (
  select titulo, prazo from app.tarefas k where k.terreno_id = t.id and k.status not in ('concluida','cancelada')
  order by prazo, prazo_hora nulls last limit 1
) nt on true;

grant select on app.v_terreno_infraestrutura, app.v_inscricoes, app.v_urbanismo_vigente,
                app.v_documentos, app.v_checklist, app.v_terrenos to authenticated;

-- ---------------------------------------------------------------------
-- Duplicidade
-- ---------------------------------------------------------------------
create or replace function app.buscar_duplicados(
  p_empresa uuid, p_matricula text default null, p_cartorio text default null,
  p_inscricao text default null, p_logradouro text default null, p_numero text default null)
returns table (terreno_id uuid, codigo text, nome text, motivo text, certeza text)
language plpgsql stable security invoker set search_path = ''
as $$
declare
  v_mat text := regexp_replace(coalesce(p_matricula,''), '\D', '', 'g');
  v_ins text := regexp_replace(coalesce(p_inscricao,''), '\D', '', 'g');
begin
  perform app.exigir_membro(p_empresa);
  return query
    select t.id, t.codigo, t.nome,
           'Mesma matrícula ' || m.numero || case when m.cartorio = p_cartorio then ' no ' || m.cartorio else ' em outro cartório (' || m.cartorio || ')' end,
           case when m.cartorio = p_cartorio then 'certa' else 'provavel' end
    from app.matriculas m join app.terrenos t on t.id = m.terreno_id
    where length(v_mat) >= 3 and m.empresa_id = p_empresa and m.numero_norm = v_mat
  union all
    select t.id, t.codigo, t.nome, 'Mesma inscrição municipal ' || i.inscricao, 'certa'
    from app.inscricoes_municipais i join app.terrenos t on t.id = i.terreno_id
    where length(v_ins) >= 6 and i.empresa_id = p_empresa and i.inscricao_norm = v_ins
  union all
    select t.id, t.codigo, t.nome, 'Mesmo endereço: ' || t.logradouro || coalesce(', ' || t.numero, ''), 'possivel'
    from app.terrenos t
    where length(trim(coalesce(p_logradouro,''))) >= 4 and t.empresa_id = p_empresa
      and lower(trim(t.logradouro)) = lower(trim(p_logradouro))
      and (p_numero is null or t.numero is null or lower(trim(t.numero)) = lower(trim(p_numero)));
end $$;

-- ---------------------------------------------------------------------
-- Ofertas e abertura da negociação
-- ---------------------------------------------------------------------
create or replace function app.abrir_negociacao(p_terreno uuid, p_oferta uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_id uuid;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(t.empresa_id);
  if t.situacao_cadastral = 'arquivado' then raise exception 'Terreno arquivado: reative antes de negociar' using errcode = '22023'; end if;
  select id into v_id from app.processos where terreno_id = p_terreno and tipo = 'negociacao' and status in ('ativo','suspensa');
  if found then return v_id; end if;

  insert into app.processos (empresa_id, terreno_id, tipo, etapa_atual, responsavel_id)
  values (t.empresa_id, t.id, 'negociacao', 'recebida', t.responsavel_id) returning id into v_id;
  insert into app.negociacoes (processo_id, empresa_id, oferta_referencia_id) values (v_id, t.empresa_id, p_oferta);
  insert into app.processo_transicoes (empresa_id, processo_id, evento, para_etapa, comentario)
  values (t.empresa_id, v_id, 'abertura', 'recebida', 'Negociação aberta');
  return v_id;
end $$;

create or replace function app.registrar_oferta(
  p_terreno uuid, p_valor numeric, p_forma text default null, p_corretor uuid default null,
  p_observacao_pagamento text default null, p_aceita_permuta text default null,
  p_validade date default null, p_data date default current_date, p_comissao_pct numeric default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_of uuid; v_proc uuid; v_nova boolean;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(t.empresa_id);
  if p_corretor is not null and not exists (select 1 from app.corretores where id = p_corretor and empresa_id = t.empresa_id) then
    raise exception 'Corretor não encontrado' using errcode = 'P0002';
  end if;

  insert into app.ofertas (empresa_id, terreno_id, corretor_id, data_oferta, valor_pedido, forma_pagamento_pedida,
                           observacao_pagamento, aceita_permuta, validade, comissao_pct)
  values (t.empresa_id, t.id, p_corretor, coalesce(p_data, current_date), p_valor, p_forma,
          p_observacao_pagamento, p_aceita_permuta, p_validade, p_comissao_pct)
  returning id into v_of;

  v_nova := not exists (select 1 from app.processos where terreno_id = t.id and tipo = 'negociacao' and status in ('ativo','suspensa'));
  v_proc := app.abrir_negociacao(t.id, v_of);
  if not v_nova then
    insert into app.atividades (empresa_id, terreno_id, processo_id, tipo, resumo)
    values (t.empresa_id, t.id, v_proc, 'nota',
            'Nova oferta registrada' || coalesce(': R$ ' || to_char(p_valor, 'FM999G999G999D00'), '') || '.');
  end if;
  return jsonb_build_object('oferta_id', v_of, 'processo_id', v_proc, 'negociacao_nova', v_nova);
end $$;

create or replace function app.definir_temperatura(p_processo uuid, p_temperatura int)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; antes int;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Negociação não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if p_temperatura is not null and p_temperatura not between 1 and 5 then raise exception 'Temperatura vai de 1 a 5' using errcode = '22023'; end if;
  select temperatura into antes from app.negociacoes where processo_id = p.id;
  if antes is not distinct from p_temperatura then return; end if;
  update app.negociacoes set temperatura = p_temperatura, temperatura_em = now() where processo_id = p.id;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, comentario)
  values (p.empresa_id, p.id, 'temperatura', coalesce(antes::text, '—') || ' → ' || coalesce(p_temperatura::text, '—'));
end $$;

create or replace function app.definir_oferta_referencia(p_processo uuid, p_oferta uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Negociação não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if not exists (select 1 from app.ofertas where id = p_oferta and terreno_id = p.terreno_id) then
    raise exception 'A oferta não é deste terreno' using errcode = '22023';
  end if;
  update app.negociacoes set oferta_referencia_id = p_oferta where processo_id = p.id;
end $$;

-- ---------------------------------------------------------------------
-- Avanço de etapa
-- ---------------------------------------------------------------------
create or replace function app.checar_avanco(p_processo uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p app.processos; atual app.etapas_modelo; prox app.etapas_modelo;
  itens jsonb := '[]'::jsonb; gestor boolean; r record; lp app.propostas;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  gestor := app.eh_gestor(p.empresa_id);
  select * into atual from app.etapas_modelo where tipo_processo = p.tipo and codigo = p.etapa_atual;
  select * into prox  from app.etapas_modelo where tipo_processo = p.tipo and ordem = atual.ordem + 1;
  if p.status <> 'ativo' or prox.codigo is null then
    return jsonb_build_object('proxima', null, 'ok', false, 'pode_forcar', false, 'itens', '[]'::jsonb);
  end if;

  if p.etapa_atual = 'viabilidade' then
    itens := itens || jsonb_build_object('ok', p.viabilidade_id is not null, 'tipo', 'viabilidade', 'bloqueio_gestor', false,
      'texto', case when p.viabilidade_id is not null then 'Estudo de viabilidade vinculado' else 'Vincular um estudo de viabilidade' end);
  end if;
  for r in select c.tipo_nome, c.situacao from app.v_checklist c
           where c.processo_id = p.id and c.etapa = p.etapa_atual and c.obrigatorio order by c.ordem loop
    itens := itens || jsonb_build_object('ok', r.situacao = 'validado', 'tipo', 'documento', 'bloqueio_gestor', false,
      'texto', r.tipo_nome || case r.situacao when 'validado' then ' validado' when 'pendente' then ': não enviado'
                                              when 'recebido' then ': aguardando validação' when 'vencido' then ': vencido' else ': rejeitado' end);
  end loop;
  if p.etapa_atual = 'proposta' then
    select * into lp from app.propostas where processo_id = p.id order by versao desc limit 1;
    itens := itens || jsonb_build_object('ok', coalesce(lp.status = 'aceita', false), 'tipo', 'proposta', 'bloqueio_gestor', false,
      'texto', case when lp.status = 'aceita' then 'Proposta aceita' else 'Ter a última proposta marcada como aceita' end);
  end if;
  if prox.exige_gestor then
    itens := itens || jsonb_build_object('ok', gestor, 'tipo', 'gestor', 'bloqueio_gestor', true,
      'texto', case when gestor then 'Aprovação de gestor' else 'Somente gestores aprovam a compra e o fechamento' end);
  end if;

  return jsonb_build_object(
    'proxima', prox.codigo, 'proxima_nome', prox.nome,
    'ok', not exists (select 1 from jsonb_array_elements(itens) i where not (i->>'ok')::boolean),
    'pode_forcar', gestor
      and exists (select 1 from jsonb_array_elements(itens) i where not (i->>'ok')::boolean)
      and not exists (select 1 from jsonb_array_elements(itens) i where not (i->>'ok')::boolean and (i->>'bloqueio_gestor')::boolean),
    'itens', itens);
end $$;

create or replace function app.mover_etapa(p_processo uuid, p_forcar boolean default false, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare chk jsonb; p app.processos; v_prox text;
begin
  select * into p from app.processos where id = p_processo for update;
  chk := app.checar_avanco(p_processo);
  v_prox := chk->>'proxima';
  if v_prox is null then raise exception 'Não há próxima etapa para esta negociação' using errcode = '22023'; end if;
  if not (chk->>'ok')::boolean then
    if not p_forcar then raise exception 'Ainda há pendências para avançar' using errcode = '22023', detail = chk::text; end if;
    if not (chk->>'pode_forcar')::boolean then raise exception 'Você não pode forçar este avanço' using errcode = '42501'; end if;
    if coalesce(trim(p_comentario), '') = '' then raise exception 'Justifique o avanço forçado' using errcode = '22023'; end if;
  end if;
  update app.processos
     set etapa_atual = v_prox, etapa_desde = now(),
         status = case when v_prox = 'ganha' then 'ganha' else status end,
         data_encerramento = case when v_prox = 'ganha' then now() else data_encerramento end
   where id = p.id;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, forcado, comentario)
  values (p.empresa_id, p.id, case when v_prox = 'ganha' then 'ganho' else 'avanco' end, p.etapa_atual, v_prox,
          not (chk->>'ok')::boolean, p_comentario);
  return app.checar_avanco(p_processo);
end $$;

create or replace function app.encerrar_processo(
  p_processo uuid, p_status text, p_motivo text default null, p_detalhe text default null, p_retomar_em date default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if p.status <> 'ativo' then raise exception 'A negociação não está ativa' using errcode = '22023'; end if;
  if p_status not in ('perdida','suspensa') then raise exception 'Status inválido' using errcode = '22023'; end if;
  if p_status = 'perdida' and coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo da perda' using errcode = '22023'; end if;
  if p_status = 'suspensa' and (p_retomar_em is null or p_retomar_em <= current_date) then raise exception 'Informe uma data futura para retomar' using errcode = '22023'; end if;
  update app.processos set status = p_status, motivo_encerramento = p_motivo, detalhe_encerramento = p_detalhe,
         retomar_em = p_retomar_em, data_encerramento = now() where id = p.id;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, comentario)
  values (p.empresa_id, p.id, case p_status when 'perdida' then 'perda' else 'suspensao' end, p.etapa_atual,
          concat_ws(' · ', p_motivo, p_detalhe, case when p_retomar_em is not null then 'retomar em ' || to_char(p_retomar_em,'DD/MM/YYYY') end));
end $$;

create or replace function app.retomar_processo(p_processo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if p.status <> 'suspensa' then raise exception 'Só negociações suspensas podem ser retomadas' using errcode = '22023'; end if;
  update app.processos set status = 'ativo', retomar_em = null, data_encerramento = null,
         motivo_encerramento = null, detalhe_encerramento = null where id = p.id;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, para_etapa) values (p.empresa_id, p.id, 'retomada', p.etapa_atual);
end $$;

-- ---------------------------------------------------------------------
-- Propostas: cada nova responde à anterior.
-- Lado oposto respondendo → anterior "recusada". Mesmo lado → "substituída".
-- ---------------------------------------------------------------------
create or replace function app.registrar_proposta(
  p_processo uuid, p_origem text, p_valor numeric, p_forma text,
  p_condicoes text default null, p_data_apresentacao date default current_date,
  p_validade date default null, p_status text default 'apresentada')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; lp app.propostas; v_id uuid;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if p.status <> 'ativo' then raise exception 'A negociação não está ativa' using errcode = '22023'; end if;
  if p_status not in ('rascunho','apresentada','em_analise') then raise exception 'Uma proposta nova começa como rascunho, apresentada ou em análise' using errcode = '22023'; end if;

  select * into lp from app.propostas where processo_id = p.id order by versao desc limit 1;
  if lp.status in ('rascunho','apresentada','em_analise') then
    update app.propostas set status = case when lp.origem = p_origem then 'substituida' else 'recusada' end where id = lp.id;
  end if;

  insert into app.propostas (empresa_id, processo_id, versao, origem, proposta_anterior_id, data_apresentacao, validade,
                             valor_total, forma_pagamento, condicoes_pagamento, status, viabilidade_id)
  values (p.empresa_id, p.id, coalesce(lp.versao, 0) + 1, p_origem, lp.id, p_data_apresentacao, p_validade,
          p_valor, p_forma, p_condicoes, p_status, p.viabilidade_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.atualizar_status_proposta(p_proposta uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare x app.propostas;
begin
  select * into x from app.propostas where id = p_proposta;
  if not found then raise exception 'Proposta não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_membro(x.empresa_id);
  if exists (select 1 from app.propostas where processo_id = x.processo_id and versao > x.versao) then
    raise exception 'Só a última versão pode mudar de status' using errcode = '22023';
  end if;
  if p_status = 'substituida' then raise exception 'Substituída é definida automaticamente' using errcode = '22023'; end if;
  update app.propostas set status = p_status where id = x.id;
end $$;

-- ---------------------------------------------------------------------
-- Viabilidade
-- ---------------------------------------------------------------------
create or replace function app.vincular_viabilidade(
  p_processo uuid, p_nome text, p_vgv numeric, p_margem_pct numeric, p_preco_max numeric, p_bkm_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_id uuid;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  insert into app.viabilidades (empresa_id, terreno_id, bkm_viabilidade_id, nome, vgv, margem_pct, preco_max_terreno)
  values (p.empresa_id, p.terreno_id, p_bkm_id, p_nome, p_vgv, p_margem_pct, p_preco_max) returning id into v_id;
  update app.processos set viabilidade_id = v_id where id = p.id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Documentos
-- p_documento informado → nova versão dele. Tipo "único por processo" →
-- reaproveita o documento existente. Senão → documento novo.
-- ---------------------------------------------------------------------
create or replace function app.registrar_documento(
  p_terreno uuid, p_tipo text, p_storage_path text, p_nome_arquivo text,
  p_processo uuid default null, p_proposta uuid default null, p_documento uuid default null,
  p_nome text default null, p_tamanho bigint default null, p_emitido_em date default current_date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; td app.tipos_documento; d app.documentos; v_ver int;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(t.empresa_id);
  if split_part(p_storage_path, '/', 1) <> t.empresa_id::text then
    raise exception 'Caminho do arquivo fora da pasta da empresa' using errcode = '42501';
  end if;
  select * into td from app.tipos_documento where codigo = p_tipo;
  if not found then raise exception 'Tipo de documento inválido' using errcode = '22023'; end if;
  if p_processo is not null and not exists (select 1 from app.processos where id = p_processo and terreno_id = t.id) then
    raise exception 'A negociação informada é de outro terreno' using errcode = '22023';
  end if;
  if p_proposta is not null and not exists (select 1 from app.propostas pr join app.processos pc on pc.id = pr.processo_id
                                             where pr.id = p_proposta and pc.terreno_id = t.id) then
    raise exception 'A proposta informada é de outro terreno' using errcode = '22023';
  end if;

  if p_documento is not null then
    select * into d from app.documentos where id = p_documento and terreno_id = t.id for update;
    if not found then raise exception 'Documento não encontrado' using errcode = 'P0002'; end if;
  elsif td.unico_por_processo and p_processo is not null then
    select * into d from app.documentos where processo_id = p_processo and tipo_documento = p_tipo for update;
  end if;

  if d.id is null then
    insert into app.documentos (empresa_id, terreno_id, processo_id, proposta_id, tipo_documento, nome, emitido_em)
    values (t.empresa_id, t.id, p_processo, p_proposta, p_tipo, coalesce(nullif(trim(p_nome),''), td.nome), p_emitido_em)
    returning * into d;
  else
    update app.documentos set emitido_em = p_emitido_em, situacao = 'recebido', revisado_por = null, revisado_em = null
     where id = d.id;
  end if;

  select coalesce(max(versao), 0) + 1 into v_ver from app.documento_versoes where documento_id = d.id;
  insert into app.documento_versoes (empresa_id, documento_id, versao, storage_path, nome_arquivo, tamanho)
  values (t.empresa_id, d.id, v_ver, p_storage_path, p_nome_arquivo, p_tamanho);
  return d.id;
end $$;

create or replace function app.revisar_documento(p_documento uuid, p_aprovado boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare d app.documentos;
begin
  select * into d from app.documentos where id = p_documento for update;
  if not found then raise exception 'Documento não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(d.empresa_id);
  update app.documentos set situacao = case when p_aprovado then 'validado' else 'rejeitado' end,
         revisado_por = auth.uid(), revisado_em = now() where id = d.id;
end $$;

-- ---------------------------------------------------------------------
-- Arquivar / reativar terreno (nunca apagar)
-- ---------------------------------------------------------------------
create or replace function app.arquivar_terreno(p_terreno uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(t.empresa_id);
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do arquivamento' using errcode = '22023'; end if;
  if exists (select 1 from app.processos where terreno_id = t.id and status in ('ativo','suspensa')) then
    raise exception 'Encerre a negociação antes de arquivar o terreno' using errcode = '22023';
  end if;
  update app.terrenos set situacao_cadastral = 'arquivado', arquivado_em = now(), motivo_arquivamento = p_motivo where id = t.id;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on all functions in schema app from public;
grant execute on function
  app.minhas_empresas(), app.papel(uuid), app.eh_membro(uuid), app.eh_gestor(uuid), app.exigir_membro(uuid),
  app.criar_empresa(text, text),
  app.buscar_duplicados(uuid, text, text, text, text, text),
  app.abrir_negociacao(uuid, uuid),
  app.registrar_oferta(uuid, numeric, text, uuid, text, text, date, date, numeric),
  app.definir_temperatura(uuid, int), app.definir_oferta_referencia(uuid, uuid),
  app.checar_avanco(uuid), app.mover_etapa(uuid, boolean, text),
  app.encerrar_processo(uuid, text, text, text, date), app.retomar_processo(uuid),
  app.registrar_proposta(uuid, text, numeric, text, text, date, date, text), app.atualizar_status_proposta(uuid, text),
  app.vincular_viabilidade(uuid, text, numeric, numeric, numeric, uuid),
  app.registrar_documento(uuid, text, text, text, uuid, uuid, uuid, text, bigint, date), app.revisar_documento(uuid, boolean),
  app.arquivar_terreno(uuid, text)
to authenticated;
