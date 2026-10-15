-- =====================================================================
-- BKM Terrenos · 0003 · regras de negócio (RPCs) e views de leitura
-- Toda mudança de etapa, proposta e documento passa por aqui: valida,
-- grava e registra a transição na mesma transação.
-- =====================================================================

grant usage on sequence app.terreno_seq, app.processo_seq to authenticated;

-- ---------------------------------------------------------------------
-- Views de leitura (security_invoker: a RLS das tabelas vale)
-- ---------------------------------------------------------------------
create or replace view app.v_documentos with (security_invoker = true) as
select d.*,
       td.nome          as tipo_nome,
       td.validade_dias,
       case when d.emitido_em is not null and td.validade_dias is not null
            then d.emitido_em + td.validade_dias end as valido_ate,
       case
         when d.situacao = 'rejeitado' then 'rejeitado'
         when td.validade_dias is not null and d.emitido_em + td.validade_dias < current_date then 'vencido'
         else d.situacao
       end as situacao_efetiva,
       v.versao         as versao_atual,
       v.nome_arquivo,
       v.storage_path,
       v.enviado_em
from app.documentos d
join app.tipos_documento td on td.codigo = d.tipo_documento
left join lateral (
  select versao, nome_arquivo, storage_path, enviado_em
  from app.documento_versoes x where x.documento_id = d.id
  order by versao desc limit 1
) v on true;

-- Checklist de um processo: todos os itens do modelo, com ou sem documento.
create or replace view app.v_checklist with (security_invoker = true) as
select p.id as processo_id, p.empresa_id,
       c.etapa, c.tipo_documento, c.obrigatorio, c.ordem,
       td.nome as tipo_nome, td.validade_dias,
       em.ordem <= ea.ordem as ativo,              -- etapa do checklist já alcançada
       d.id as documento_id, d.emitido_em, d.valido_ate, d.versao_atual, d.nome_arquivo, d.storage_path,
       coalesce(d.situacao_efetiva, 'pendente') as situacao
from app.processos p
join app.checklist_modelo c on c.tipo_processo = p.tipo
join app.tipos_documento td on td.codigo = c.tipo_documento
join app.etapas_modelo em on em.tipo_processo = p.tipo and em.codigo = c.etapa
join app.etapas_modelo ea on ea.tipo_processo = p.tipo and ea.codigo = p.etapa_atual
left join app.v_documentos d on d.processo_id = p.id and d.tipo_documento = c.tipo_documento;

-- Linha por processo, com o que as listas e o quadro precisam.
create or replace view app.v_processos with (security_invoker = true) as
select p.*,
       e.nome  as etapa_nome,
       e.ordem as etapa_ordem,
       t.codigo as terreno_codigo, t.endereco, t.bairro, t.cidade, t.area_m2, t.zoneamento,
       m.nome  as responsavel_nome,
       vb.preco_max_terreno, vb.vgv, vb.margem_pct,
       lp.valor_total as ultima_proposta_valor, lp.situacao as ultima_proposta_situacao, lp.versao as ultima_proposta_versao,
       lo.valor_pedido as ultimo_valor_pedido,
       (select count(*) from app.ofertas o where o.terreno_id = p.terreno_id) as qtd_ofertas,
       coalesce(lp.valor_total, lo.valor_pedido) as valor_referencia,
       (vb.preco_max_terreno is not null and lp.valor_total > vb.preco_max_terreno) as acima_preco_max,
       (select count(*) from app.tarefas k where k.processo_id = p.id and k.concluida_em is null and k.prazo < current_date) as tarefas_atrasadas,
       (select count(*) from app.v_documentos d where d.processo_id = p.id and d.situacao_efetiva = 'vencido') as docs_vencidos,
       (current_date - p.etapa_desde::date) as dias_na_etapa
from app.processos p
join app.terrenos t on t.id = p.terreno_id
join app.etapas_modelo e on e.tipo_processo = p.tipo and e.codigo = p.etapa_atual
left join app.membros m on m.empresa_id = p.empresa_id and m.user_id = p.responsavel_id
left join app.viabilidades vb on vb.id = p.viabilidade_id
left join lateral (select valor_total, situacao, versao from app.propostas x where x.processo_id = p.id order by versao desc limit 1) lp on true
left join lateral (select valor_pedido from app.ofertas o where o.terreno_id = p.terreno_id order by recebida_em desc, criado_em desc limit 1) lo on true;

grant select on app.v_documentos, app.v_checklist, app.v_processos to authenticated;

-- ---------------------------------------------------------------------
-- Duplicidade: busca terreno já cadastrado
-- ---------------------------------------------------------------------
create or replace function app.buscar_duplicados(
  p_empresa uuid, p_matricula text default null, p_cartorio text default null, p_endereco text default null)
returns table (terreno_id uuid, codigo text, bairro text, endereco text, motivo text)
language plpgsql stable security invoker set search_path = ''
as $$
declare v_mat text := regexp_replace(coalesce(p_matricula,''), '\D', '', 'g');
begin
  perform app.exigir_membro(p_empresa);
  if length(v_mat) >= 3 then
    return query
      select t.id, t.codigo, t.bairro, t.endereco,
             case when m.cartorio = p_cartorio then 'matricula' else 'matricula_outro_cartorio' end
      from app.terreno_matriculas m join app.terrenos t on t.id = m.terreno_id
      where m.empresa_id = p_empresa and m.numero_norm = v_mat and t.excluido_em is null;
    if found then return; end if;
  end if;
  if length(trim(coalesce(p_endereco,''))) >= 6 then
    return query
      select t.id, t.codigo, t.bairro, t.endereco, 'endereco'
      from app.terrenos t
      where t.empresa_id = p_empresa and t.excluido_em is null
        and lower(split_part(t.endereco, ',', 1)) = lower(trim(split_part(p_endereco, ',', 1)))
      limit 5;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Nova oferta: cria ou reaproveita o terreno e abre/alimenta a negociação
-- ---------------------------------------------------------------------
create or replace function app.registrar_oferta(
  p_empresa     uuid,
  p_endereco    text,
  p_bairro      text,
  p_area_m2     numeric,
  p_valor       numeric,
  p_origem      text,
  p_contato     text    default null,
  p_matricula   text    default null,
  p_cartorio    text    default null,
  p_cidade      text    default 'São Paulo',
  p_terreno_id  uuid    default null   -- força anexar a um terreno existente
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_terreno uuid := p_terreno_id;
  v_novo    boolean := false;
  v_proc    app.processos;
  v_oferta  uuid;
  v_mat     text := regexp_replace(coalesce(p_matricula,''), '\D', '', 'g');
begin
  perform app.exigir_membro(p_empresa);
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor pedido' using errcode = '22023'; end if;

  if v_terreno is not null then
    if not exists (select 1 from app.terrenos where id = v_terreno and empresa_id = p_empresa) then
      raise exception 'Terreno não encontrado' using errcode = 'P0002';
    end if;
  elsif length(v_mat) >= 3 and p_cartorio is not null then
    select terreno_id into v_terreno from app.terreno_matriculas
     where empresa_id = p_empresa and cartorio = p_cartorio and numero_norm = v_mat;
  end if;

  if v_terreno is null then
    if coalesce(trim(p_endereco),'') = '' or coalesce(trim(p_bairro),'') = '' then
      raise exception 'Informe endereço e bairro' using errcode = '22023';
    end if;
    insert into app.terrenos (empresa_id, endereco, bairro, cidade, area_m2)
    values (p_empresa, trim(p_endereco), trim(p_bairro), coalesce(p_cidade,'São Paulo'), p_area_m2)
    returning id into v_terreno;
    if length(v_mat) >= 3 and p_cartorio is not null then
      insert into app.terreno_matriculas (empresa_id, terreno_id, numero, cartorio)
      values (p_empresa, v_terreno, p_matricula, p_cartorio);
    end if;
    v_novo := true;
  end if;

  insert into app.ofertas (empresa_id, terreno_id, origem, contato, valor_pedido)
  values (p_empresa, v_terreno, p_origem, nullif(trim(p_contato),''), p_valor)
  returning id into v_oferta;

  select * into v_proc from app.processos
   where terreno_id = v_terreno and tipo = 'negociacao' and status in ('ativo','suspensa');

  if not found then
    insert into app.processos (empresa_id, terreno_id, tipo, etapa_atual, responsavel_id)
    values (p_empresa, v_terreno, 'negociacao', 'recebida', auth.uid())
    returning * into v_proc;
    insert into app.processo_transicoes (empresa_id, processo_id, evento, para_etapa, comentario)
    values (p_empresa, v_proc.id, 'abertura', 'recebida', 'Negociação aberta a partir da oferta');
    insert into app.tarefas (empresa_id, processo_id, titulo, responsavel_id, prazo)
    values (p_empresa, v_proc.id, 'Triagem: localização e preço por m²', auth.uid(), current_date + 3);
  else
    insert into app.atividades (empresa_id, processo_id, tipo, resumo)
    values (p_empresa, v_proc.id, 'nota',
            format('Nova oferta de R$ %s recebida (%s%s).', to_char(p_valor, 'FM999G999G999D00'), p_origem,
                   coalesce(' · ' || nullif(trim(p_contato),''), '')));
  end if;

  return jsonb_build_object('terreno_id', v_terreno, 'processo_id', v_proc.id, 'oferta_id', v_oferta, 'terreno_novo', v_novo);
end $$;

-- ---------------------------------------------------------------------
-- Checagem de avanço: o que falta para a próxima etapa
-- ---------------------------------------------------------------------
create or replace function app.checar_avanco(p_processo uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p      app.processos;
  atual  app.etapas_modelo;
  prox   app.etapas_modelo;
  itens  jsonb := '[]'::jsonb;
  gestor boolean;
  r      record;
  lp     app.propostas;
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

  for r in
    select c.tipo_documento, c.tipo_nome, c.situacao
    from app.v_checklist c where c.processo_id = p.id and c.etapa = p.etapa_atual and c.obrigatorio
    order by c.ordem
  loop
    itens := itens || jsonb_build_object('ok', r.situacao = 'validado', 'tipo', 'documento', 'tipo_documento', r.tipo_documento, 'bloqueio_gestor', false,
      'texto', r.tipo_nome || case r.situacao when 'validado' then ' validado'
                                              when 'pendente' then ': não enviado'
                                              when 'recebido' then ': aguardando validação'
                                              when 'vencido'  then ': vencido'
                                              else ': rejeitado' end);
  end loop;

  if p.etapa_atual = 'proposta' then
    select * into lp from app.propostas where processo_id = p.id order by versao desc limit 1;
    itens := itens || jsonb_build_object('ok', coalesce(lp.situacao = 'aceita', false), 'tipo', 'proposta', 'bloqueio_gestor', false,
      'texto', case when lp.situacao = 'aceita' then 'Proposta aceita pelo vendedor' else 'Ter uma proposta marcada como aceita' end);
  end if;

  if prox.exige_gestor then
    itens := itens || jsonb_build_object('ok', gestor, 'tipo', 'gestor', 'bloqueio_gestor', true,
      'texto', case when gestor then 'Aprovação de gestor' else 'Somente gestores aprovam a compra e o fechamento' end);
  end if;

  return jsonb_build_object(
    'proxima', prox.codigo,
    'proxima_nome', prox.nome,
    'ok', not exists (select 1 from jsonb_array_elements(itens) i where not (i->>'ok')::boolean),
    'pode_forcar', gestor and exists (select 1 from jsonb_array_elements(itens) i where not (i->>'ok')::boolean)
                          and not exists (select 1 from jsonb_array_elements(itens) i where not (i->>'ok')::boolean and (i->>'bloqueio_gestor')::boolean),
    'itens', itens);
end $$;

create or replace function app.mover_etapa(p_processo uuid, p_forcar boolean default false, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  chk jsonb;
  p   app.processos;
  v_prox text;
begin
  select * into p from app.processos where id = p_processo for update;
  chk := app.checar_avanco(p_processo);   -- depois do lock: sem corrida entre dois cliques
  v_prox := chk->>'proxima';
  if v_prox is null then raise exception 'Não há próxima etapa para esta negociação' using errcode = '22023'; end if;
  if not (chk->>'ok')::boolean then
    if not p_forcar then raise exception 'Ainda há pendências para avançar' using errcode = '22023', detail = chk::text; end if;
    if not (chk->>'pode_forcar')::boolean then raise exception 'Você não pode forçar este avanço' using errcode = '42501'; end if;
  end if;

  update app.processos
     set etapa_atual = v_prox, etapa_desde = now(),
         status       = case when v_prox = 'ganha' then 'ganha' else status end,
         encerrado_em = case when v_prox = 'ganha' then now() else encerrado_em end
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
  if p_status = 'perdida' and coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo da perda' using errcode = '22023'; end if;
  if p_status = 'suspensa' and (p_retomar_em is null or p_retomar_em <= current_date) then raise exception 'Informe uma data futura para retomar' using errcode = '22023'; end if;
  if p_status not in ('perdida','suspensa') then raise exception 'Status inválido' using errcode = '22023'; end if;

  update app.processos set status = p_status, motivo_encerramento = p_motivo, detalhe_encerramento = p_detalhe,
         retomar_em = p_retomar_em, encerrado_em = now()
   where id = p.id;
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
  update app.processos set status = 'ativo', retomar_em = null, encerrado_em = null, motivo_encerramento = null, detalhe_encerramento = null
   where id = p.id;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, para_etapa)
  values (p.empresa_id, p.id, 'retomada', p.etapa_atual);
end $$;

-- ---------------------------------------------------------------------
-- Propostas
-- ---------------------------------------------------------------------
create or replace function app.registrar_proposta(
  p_processo uuid, p_autor text, p_valor numeric, p_forma text,
  p_permuta_pct numeric default 0, p_condicoes text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  p  app.processos;
  lp app.propostas;
  v_id uuid;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if p.status <> 'ativo' then raise exception 'A negociação não está ativa' using errcode = '22023'; end if;

  select * into lp from app.propostas where processo_id = p.id order by versao desc limit 1;
  -- a anterior em aberto é respondida pela nova
  if lp.situacao in ('em_analise','contraproposta') then
    update app.propostas set situacao = case when p_autor = 'nos' then 'recusada' else 'contraproposta' end where id = lp.id;
  end if;

  insert into app.propostas (empresa_id, processo_id, versao, autor, valor_total, forma, permuta_pct, condicoes, situacao, viabilidade_id)
  values (p.empresa_id, p.id, coalesce(lp.versao, 0) + 1, p_autor, p_valor, p_forma, coalesce(p_permuta_pct,0), p_condicoes,
          case when p_autor = 'nos' then 'em_analise' else 'contraproposta' end, p.viabilidade_id)
  returning id into v_id;
  return v_id;
end $$;

create or replace function app.atualizar_situacao_proposta(p_proposta uuid, p_situacao text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare x app.propostas;
begin
  select * into x from app.propostas where id = p_proposta;
  if not found then raise exception 'Proposta não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_membro(x.empresa_id);
  if exists (select 1 from app.propostas where processo_id = x.processo_id and versao > x.versao) then
    raise exception 'Só a última versão pode mudar de situação' using errcode = '22023';
  end if;
  update app.propostas set situacao = p_situacao where id = x.id;
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
  values (p.empresa_id, p.terreno_id, p_bkm_id, p_nome, p_vgv, p_margem_pct, p_preco_max)
  returning id into v_id;
  update app.processos set viabilidade_id = v_id where id = p.id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Documentos
-- ---------------------------------------------------------------------
create or replace function app.registrar_versao_documento(
  p_processo uuid, p_tipo text, p_storage_path text, p_nome_arquivo text,
  p_tamanho bigint default null, p_emitido_em date default current_date)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; d app.documentos; v_ver int;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  if split_part(p_storage_path, '/', 1) <> p.empresa_id::text then
    raise exception 'Caminho do arquivo fora da pasta da empresa' using errcode = '42501';
  end if;

  select * into d from app.documentos where processo_id = p.id and tipo_documento = p_tipo for update;
  if not found then
    insert into app.documentos (empresa_id, processo_id, tipo_documento, emitido_em, situacao)
    values (p.empresa_id, p.id, p_tipo, p_emitido_em, 'recebido') returning * into d;
  else
    update app.documentos set emitido_em = p_emitido_em, situacao = 'recebido', revisado_por = null, revisado_em = null
     where id = d.id;
  end if;

  select coalesce(max(versao),0) + 1 into v_ver from app.documento_versoes where documento_id = d.id;
  insert into app.documento_versoes (empresa_id, documento_id, versao, storage_path, nome_arquivo, tamanho)
  values (p.empresa_id, d.id, v_ver, p_storage_path, p_nome_arquivo, p_tamanho);
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
         revisado_por = auth.uid(), revisado_em = now()
   where id = d.id;
end $$;

-- ---------------------------------------------------------------------
-- Permissões das funções: nada para anon
-- ---------------------------------------------------------------------
revoke execute on all functions in schema app from public;
grant execute on function
  app.minhas_empresas(), app.papel(uuid), app.eh_membro(uuid), app.eh_gestor(uuid), app.exigir_membro(uuid),
  app.criar_empresa(text, text),
  app.buscar_duplicados(uuid, text, text, text),
  app.registrar_oferta(uuid, text, text, numeric, numeric, text, text, text, text, text, uuid),
  app.checar_avanco(uuid), app.mover_etapa(uuid, boolean, text),
  app.encerrar_processo(uuid, text, text, text, date), app.retomar_processo(uuid),
  app.registrar_proposta(uuid, text, numeric, text, numeric, text), app.atualizar_situacao_proposta(uuid, text),
  app.vincular_viabilidade(uuid, text, numeric, numeric, numeric, uuid),
  app.registrar_versao_documento(uuid, text, text, text, bigint, date), app.revisar_documento(uuid, boolean)
to authenticated;
-- triggers rodam com o dono; não precisam de grant
