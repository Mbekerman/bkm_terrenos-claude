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

-- Viabilidades técnicas: todo serviço do catálogo para todo terreno; o que não foi registrado é "não solicitada".
-- Vencida: retorno viável ou condicionado com a validade já passada.
create view app.v_terreno_viabilidades_tecnicas with (security_invoker = true) as
select t.id as terreno_id, t.empresa_id, i.codigo as servico, i.nome, i.ordem,
       coalesce(v.situacao, 'nao_solicitada') as situacao, v.concessionaria, v.solicitada_em, v.emitida_em, v.validade, v.condicoes,
       coalesce(v.situacao in ('viavel','condicionada') and v.validade < current_date, false) as vencida
from app.terrenos t
cross join app.itens_infraestrutura i
left join app.terreno_viabilidades_tecnicas v on v.terreno_id = t.id and v.servico = i.codigo
where i.ativo and i.viabilidade_tecnica;

-- Inscrição com a revisão vigente do exercício mais recente.
create view app.v_inscricoes with (security_invoker = true) as
select ins.*, v.id as valor_id, v.exercicio, v.revisao, v.valor_venal_terreno, v.valor_venal_construcao, v.valor_venal_imovel,
       v.situacao_iptu, v.iptu_valor_anual, v.iptu_parcelas, v.iptu_mensal_informado, v.data_verificacao, v.fonte,
       round(v.iptu_valor_anual / nullif(v.iptu_parcelas, 0), 2)                      as iptu_valor_parcela,
       coalesce(v.iptu_mensal_informado, round(v.iptu_valor_anual / 12, 2))           as iptu_mensal,
       case when v.iptu_mensal_informado is not null then 'informado'
            when v.iptu_valor_anual is not null then 'anual_dividido_por_12' end      as iptu_mensal_origem
from app.inscricoes_municipais ins
left join lateral (
  select * from app.inscricao_valores x where x.inscricao_id = ins.id and x.vigente order by exercicio desc limit 1
) v on true;

-- Parâmetros do catálogo (zona_parametros) para uma zona do lote: a linha do
-- tipo de empreendimento pedido ou, se a zona não tem regra própria para ele,
-- a de mercado (o campo tipo da linha diz qual valeu). A linha mais específica
-- ganha: macrozona, depois o uso pedido; sem uso, a permitida, preferindo o
-- vertical (RV2, RV1), depois RH e R. A condição de tamanho de lote (ZEIS em
-- SP) usa a área do terreno, que é o lote do empreendimento; sem área, vale a
-- linha de lote grande.
create or replace function app.parametros_zona(p_empresa uuid, p_zoneamento uuid, p_tipo text,
  p_macrozona text default null, p_lote_area numeric default null, p_uso text default null)
returns setof app.zona_parametros
language sql stable set search_path = ''
as $$
  select z.* from app.zona_parametros z
   where z.empresa_id = p_empresa and z.zoneamento_id = p_zoneamento and z.ativo and z.tipo in (p_tipo, 'mercado')
     and (z.macrozona is null or z.macrozona = p_macrozona)
     and (z.uso is null or p_uso is null or z.uso = p_uso)
     and (z.lote_area_min_m2 is null or coalesce(p_lote_area, 'infinity'::numeric) >= z.lote_area_min_m2)
     and (z.lote_area_max_m2 is null or coalesce(p_lote_area, 'infinity'::numeric) < z.lote_area_max_m2)
   order by (z.tipo = p_tipo) desc, (z.macrozona is not null) desc, (z.uso is not distinct from p_uso) desc,
            z.permitido desc, array_position(array['RV2','RV1','RH','R'], z.uso) nulls first
   limit 1
$$;

-- Zonas de cada lote na análise vigente, com os parâmetros do catálogo para
-- cada tipo de empreendimento (mercado, his, hmp) e as exceções do lote por
-- cima. Potencial construtivo = área da zona no lote × CA.
create view app.v_lote_zonas with (security_invoker = true) as
select a.terreno_id, a.empresa_id, a.id as analise_id, az.id, az.inscricao_id, i.inscricao,
       az.zoneamento_id, zo.sigla, zo.descricao as zona_nome, az.macrozona, az.area_abrangida_m2,
       tp.tipo, p.id as parametro_id, p.tipo as tipo_regra, p.permitido,
       coalesce(az.ca_minimo, p.ca_minimo) as ca_minimo, coalesce(az.ca_basico, p.ca_basico) as ca_basico, coalesce(az.ca_maximo, p.ca_maximo) as ca_maximo,
       coalesce(az.to_maximo, case when p.to_corte_m2 is not null and t.area_adotada_m2 >= p.to_corte_m2 then p.to_lote_grande else p.to_maximo end) as to_maximo,
       case when az.gabarito_m is not null or az.gabarito_sem_limite is not null then az.gabarito_m else p.gabarito_m end as gabarito_m,
       case when az.gabarito_m is not null or az.gabarito_sem_limite is not null then coalesce(az.gabarito_sem_limite, false)
            else p.gabarito_sem_limite end as gabarito_sem_limite,
       coalesce(az.recuo_frente_m, p.recuo_frente_m) as recuo_frente_m, coalesce(az.recuo_lateral_m, p.recuo_lateral_m) as recuo_lateral_m,
       coalesce(az.recuo_lateral_alto_m, p.recuo_lateral_alto_m) as recuo_lateral_alto_m, coalesce(az.cota_parte_m2, p.cota_parte_m2) as cota_parte_m2,
       coalesce(az.max_unidades, p.max_unidades) as max_unidades, coalesce(az.permeabilidade, p.permeabilidade) as permeabilidade,
       coalesce(az.lote_minimo_m2, p.lote_minimo_m2) as lote_minimo_m2, coalesce(az.frente_minima_m, p.frente_minima_m) as frente_minima_m,
       coalesce(az.outorga_gratuita, p.outorga_gratuita) as outorga_gratuita, p.regras, p.fonte_norma, p.fonte_dispositivo, p.fonte_url, p.situacao,
       num_nonnulls(az.ca_minimo, az.ca_basico, az.ca_maximo, az.to_maximo, az.gabarito_m, az.gabarito_sem_limite, az.recuo_frente_m, az.recuo_lateral_m, az.recuo_lateral_alto_m, az.cota_parte_m2, az.max_unidades, az.permeabilidade, az.lote_minimo_m2, az.frente_minima_m, az.outorga_gratuita) > 0 as tem_excecao,
       az.excecao_fonte, az.restricoes_observacoes,
       case when p.permitido then round(az.area_abrangida_m2 * coalesce(az.ca_basico, p.ca_basico), 2) end as potencial_basico_m2,
       case when p.permitido then round(az.area_abrangida_m2 * coalesce(az.ca_maximo, p.ca_maximo), 2) end as potencial_maximo_m2
from app.analises_urbanisticas a
join app.analise_zoneamentos az on az.analise_id = a.id
join app.zoneamentos zo on zo.id = az.zoneamento_id
join app.terrenos t on t.id = a.terreno_id
left join app.inscricoes_municipais i on i.id = az.inscricao_id
cross join (values ('mercado'), ('his'), ('hmp')) as tp(tipo)
left join lateral app.parametros_zona(a.empresa_id, az.zoneamento_id, tp.tipo, az.macrozona, t.area_adotada_m2) p on true
where a.status = 'vigente';

-- Parâmetros urbanísticos da análise vigente, resumidos por terreno: todas as
-- zonas da área (da maior para a menor), o maior CA de mercado e o potencial
-- construtivo por tipo de empreendimento (nulo se algum pedaço não tem CA ou
-- não admite o tipo).
create view app.v_urbanismo_vigente with (security_invoker = true) as
select u.*
from (
select l.terreno_id, l.empresa_id, l.analise_id, a.data_verificacao, a.fonte,
       (select string_agg(x.sigla, ' / ' order by x.area desc nulls last, x.sigla)
          from (select y.sigla, sum(y.area_abrangida_m2) as area from app.v_lote_zonas y
                 where y.analise_id = l.analise_id and y.tipo = 'mercado' group by y.sigla) x) as zoneamentos,
       max(l.ca_maximo) filter (where l.tipo = 'mercado') as ca_maximo,
       bool_or(l.ca_maximo is null) filter (where l.tipo = 'mercado') as ca_incompleto,
       min(l.gabarito_m) filter (where l.tipo = 'mercado') as menor_gabarito_m,
       bool_or(l.gabarito_sem_limite) filter (where l.tipo = 'mercado') as algum_gabarito_sem_limite,
       count(distinct l.zoneamento_id) as qtd_zonas,
       array_agg(distinct l.sigla order by l.sigla) as zonas_siglas,  -- filtro por zoneamento
       count(distinct l.inscricao_id) as qtd_lotes,
       coalesce(bool_or(l.inscricao_id is null), false) as tem_area_sem_inscricao,
       sum(l.area_abrangida_m2) filter (where l.tipo = 'mercado') as area_zoneada_m2,
       case when bool_and(l.potencial_basico_m2 is not null) filter (where l.tipo = 'mercado')
            then sum(l.potencial_basico_m2) filter (where l.tipo = 'mercado') end as potencial_basico_m2,
       case when bool_and(l.potencial_maximo_m2 is not null) filter (where l.tipo = 'mercado')
            then sum(l.potencial_maximo_m2) filter (where l.tipo = 'mercado') end as potencial_mercado_m2,
       case when bool_and(l.potencial_maximo_m2 is not null) filter (where l.tipo = 'his')
            then sum(l.potencial_maximo_m2) filter (where l.tipo = 'his') end as potencial_his_m2,
       case when bool_and(l.potencial_maximo_m2 is not null) filter (where l.tipo = 'hmp')
            then sum(l.potencial_maximo_m2) filter (where l.tipo = 'hmp') end as potencial_hmp_m2,
       bool_or(l.situacao <> 'confirmado') as tem_parametro_a_validar
from app.v_lote_zonas l
join app.analises_urbanisticas a on a.id = l.analise_id
group by l.terreno_id, l.empresa_id, l.analise_id, a.data_verificacao, a.fonte
) u;

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

-- A condição "Vale quando" vale para o terreno? (31/out/2026; as regras moram em
-- app.avaliar_condicao, 001200). Sem condição, vale. Quem não vê o terreno não pergunta.
create or replace function app.condicao_aplica(p_terreno uuid, p_cond jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_cond is null then return true; end if;
  if auth.uid() is not null and not app.ve_terreno(p_terreno) then return null; end if;
  return app.avaliar_condicao(p_terreno, p_cond);
end $$;
grant execute on function app.condicao_aplica(uuid, jsonb) to authenticated;

-- Regra em branco de um item (jornada, 1/nov/2026): a primeira regra condicional
-- cuja condição vale para o terreno decide; nenhuma vale (ou não há) = a regra única.
create or replace function app._regra_branco(p_terreno uuid, p_regra text, p_cond jsonb)
returns text language plpgsql stable security definer set search_path = '' as $$
declare e jsonb;
begin
  if p_cond is not null and jsonb_typeof(p_cond) = 'array' then
    for e in select * from jsonb_array_elements(p_cond) loop
      if app.avaliar_condicao(p_terreno, e->'condicao') then return e->>'regra'; end if;
    end loop;
  end if;
  return p_regra;
end $$;
revoke all on function app._regra_branco(uuid, text, jsonb) from public;

-- aplica: a condição do documento vale para o terreno agora (sem condição, sempre)
create view app.v_checklist with (security_invoker = true) as
select p.id as processo_id, p.empresa_id, c.etapa, c.tipo_documento, c.obrigatorio, c.regra, c.ordem, c.condicao, c.regra_cond,
       app._regra_branco(p.terreno_id, c.regra, c.regra_cond) as regra_efetiva,
       coalesce(app.condicao_aplica(p.terreno_id, c.condicao), false) as aplica,
       td.nome as tipo_nome, td.validade_dias,
       em.ordem <= ea.ordem as ativo,
       d.id as documento_id, d.emitido_em, d.valido_ate, d.versao_atual, d.nome_arquivo, d.storage_path,
       coalesce(d.situacao_efetiva, 'pendente') as situacao
from app.processos p
join app.checklist_modelo c on c.empresa_id = p.empresa_id and c.fase = p.fase
join app.tipos_documento td on td.codigo = c.tipo_documento
join app.etapas_modelo em on em.empresa_id = p.empresa_id and em.fase = p.fase and em.codigo = c.etapa
join app.etapas_modelo ea on ea.empresa_id = p.empresa_id and ea.fase = p.fase and ea.codigo = p.etapa_atual
left join app.v_documentos d on d.processo_id = p.id and d.tipo_documento = c.tipo_documento;

-- Reunião com a ata atual e os participantes, para a linha do tempo da negociação.
create view app.v_reunioes with (security_invoker = true) as
select m.*,
       a.id as ata_documento_id, a.versao_atual as ata_versao, a.nome_arquivo as ata_arquivo, a.storage_path as ata_storage_path,
       coalesce(pp.participantes, '[]'::jsonb) as participantes
from app.reunioes m
left join app.v_documentos a on a.reuniao_id = m.id and a.tipo_documento = 'ata_reuniao'
left join lateral (
  select jsonb_agg(jsonb_build_object('lado', x.lado, 'user_id', x.user_id, 'pessoa_id', x.pessoa_id,
                                      'nome', coalesce(pe.nome_razao_social, x.nome)) order by x.lado) as participantes
  from app.reuniao_participantes x left join app.pessoas pe on pe.id = x.pessoa_id
  where x.reuniao_id = m.id
) pp on true;

-- Linha por terreno para a listagem e o cabeçalho da ficha.
create view app.v_terrenos with (security_invoker = true) as
select t.id, t.empresa_id, t.codigo, t.nome, t.situacao_cadastral, t.prioridade, t.responsavel_id,
       t.logradouro, t.numero, t.bairro, t.zona, mu.nome as municipio, ec.nome as eixo_comercial,
       t.area_adotada_m2, t.fonte_area_adotada, t.origem_cadastro, t.data_identificacao, t.versao,
       -- processo atual: a fase aberta mais adiante (ou, sem nenhuma aberta, a
       -- última encerrada); fases_abertas lista as que correm juntas
       p.id as processo_id, p.codigo as processo_codigo, p.status as processo_status, stm.nome as processo_status_nome,
       p.fase, fa.nome as fase_nome, fa.ordem as fase_ordem,
       (select array_agg(x.fase order by f2.ordem) from app.processos x join app.fases_modelo f2 on f2.empresa_id = x.empresa_id and f2.codigo = x.fase
         where x.terreno_id = t.id and x.parte_id is null and x.status in ('ativo','stand_by')) as fases_abertas,
       p.etapa_atual, e.nome as etapa_nome, e.ordem as etapa_ordem,
       (current_date - p.etapa_desde::date) as dias_na_etapa,
       p.subetapa_atual, se.nome as subetapa_nome, se.ordem as subetapa_ordem,
       (current_date - p.subetapa_desde::date) as dias_na_subetapa,
       coalesce(p.status = 'ativo' and now() - p.subetapa_desde > make_interval(days => se.prazo_dias), false) as subetapa_atrasada,
       p.motivo_encerramento, mo.nome as motivo_encerramento_nome, p.retomar_em, p.data_encerramento,
       -- pedido de aprovação aberto: para onde e de qual nível se espera agora
       ap.destino_tipo as aprovacao_destino_tipo, ap.destino as aprovacao_destino, ap.nivel as aprovacao_aguardando,
       -- da negociação (processo da fase de entrada): temperatura, propostas, viabilidade
       pn.id as negociacao_id, pn.status as negociacao_status, n.temperatura,
       -- condições pedidas: oferta de referência, ou a mais recente ativa
       o.id as oferta_id, o.valor_pedido, o.forma_pagamento_pedida, o.aceita_permuta, o.observacao_pagamento,
       round(o.valor_pedido / nullif(t.area_adotada_m2, 0), 2) as valor_pedido_m2,
       (select count(*) from app.ofertas x where x.terreno_id = t.id) as qtd_ofertas,
       cp.nome_razao_social as corretor_principal,
       lp.valor_total as ultima_proposta_valor, lp.origem as ultima_proposta_origem, lp.status as ultima_proposta_status,
       vc.margem_minima_pct,
       coalesce(vb.margem_pct < vc.margem_minima_pct, false) as abaixo_margem_min,
       u.zoneamentos, u.ca_maximo,
       nt.titulo as proxima_tarefa, nt.prazo as proxima_tarefa_prazo,
       (select count(*) from fluxo.tarefas k join fluxo.quadros q on q.id = k.quadro_id where q.objeto_tipo = 'terreno' and q.objeto_id = t.id
          and k.concluida_em is null and k.arquivada_em is null and k.prazo < current_date
          and not exists (select 1 from fluxo.listas l where l.id = k.lista_id and l.tipo = 'pausa')) as tarefas_atrasadas,
       (select count(*) from app.v_documentos d where d.terreno_id = t.id and d.processo_id = p.id and d.situacao_efetiva = 'vencido') as docs_vencidos,
       (select count(*) from app.diligencias g where g.terreno_id = t.id and g.situacao not in ('resolvida')) as diligencias_abertas,
       (select count(*) from app.diligencias g where g.terreno_id = t.id and g.situacao = 'impeditiva') as diligencias_impeditivas,
       (select count(*) from app.reunioes m where m.terreno_id = t.id and m.status = 'realizada') as reunioes_realizadas,
       (select max(m.inicio) from app.reunioes m where m.terreno_id = t.id and m.status = 'realizada') as ultima_reuniao_em,
       (select min(m.inicio) from app.reunioes m where m.terreno_id = t.id and m.status = 'agendada' and m.inicio >= now()) as proxima_reuniao_em,
       -- para os filtros (Terrenos, Mapa e Fases)
       mu.uf, t.municipio_id, vb.vgv, vb.margem_pct,
       -- todos os corretores do terreno; ligar um corretor a uma parte também o põe aqui
       (select array_agg(tc.corretor_id order by tc.principal desc, tc.corretor_id) from app.terreno_corretores tc where tc.terreno_id = t.id) as corretor_ids,
       -- última proposta ativa (apresentada, em análise ou aceita); dividido em partes, a soma das partes em aberto
       coalesce(pa.valor_total,
         (select sum(y.valor_total) from app.processos c
            cross join lateral (select x.valor_total from app.propostas x where x.processo_id = c.id
                                and x.status in ('apresentada','em_analise','aceita') order by x.versao desc limit 1) y
           where c.principal_id = pn.id and c.status in ('ativo','stand_by','concluido'))) as proposta_ativa_valor,
       exists (select 1 from app.terreno_partes x where x.terreno_id = t.id and x.ativa) as tem_partes,
       u.zonas_siglas,
       -- parado há quanto tempo: última atividade, reunião realizada ou passagem do funil
       greatest((select max(a.ocorreu_em) from app.atividades a where a.terreno_id = t.id),
                (select max(m.inicio) from app.reunioes m where m.terreno_id = t.id and m.status = 'realizada'),
                (select max(x.em) from app.processo_transicoes x join app.processos c on c.id = x.processo_id where c.terreno_id = t.id),
                t.criado_em) as ultima_movimentacao_em
from app.terrenos t
join app.municipios mu on mu.id = t.municipio_id
left join app.eixos_comerciais ec on ec.id = t.eixo_comercial_id
left join lateral (
  select x.* from app.processos x join app.fases_modelo f on f.empresa_id = x.empresa_id and f.codigo = x.fase
  where x.terreno_id = t.id and x.parte_id is null
  order by (x.status in ('ativo','stand_by')) desc, f.ordem desc, x.data_inicio desc limit 1
) p on true
left join app.fases_modelo fa on fa.empresa_id = p.empresa_id and fa.codigo = p.fase
left join app.status_modelo stm on stm.empresa_id = p.empresa_id and stm.fase = p.fase and stm.status = p.status
left join lateral (
  select x.* from app.processos x join app.fases_modelo f on f.empresa_id = x.empresa_id and f.codigo = x.fase and f.entrada
  where x.terreno_id = t.id and x.parte_id is null
  order by (x.status in ('ativo','stand_by')) desc, x.data_inicio desc limit 1
) pn on true
left join app.etapas_modelo e on e.empresa_id = p.empresa_id and e.fase = p.fase and e.codigo = p.etapa_atual
left join app.subetapas_modelo se on se.empresa_id = p.empresa_id and se.fase = p.fase and se.codigo = p.subetapa_atual
left join app.motivos_encerramento mo on mo.empresa_id = p.empresa_id and mo.status = p.status and mo.codigo = p.motivo_encerramento
left join lateral (
  select a.destino_tipo, a.destino, a.nivel from app.aprovacoes a
  where a.processo_id = p.id and a.status = 'pendente' order by a.ordem, a.nivel limit 1
) ap on true
left join app.negociacoes n on n.processo_id = pn.id
left join lateral (
  select * from app.ofertas x where x.terreno_id = t.id
  order by (x.id = n.oferta_referencia_id) desc nulls last, (x.status = 'ativa') desc, x.data_oferta desc, x.criado_em desc limit 1
) o on true
left join lateral (
  select pe.nome_razao_social from app.terreno_corretores tc
  join app.corretores c on c.id = tc.corretor_id join app.pessoas pe on pe.id = c.pessoa_id
  where tc.terreno_id = t.id and tc.principal limit 1
) cp on true
left join lateral (select * from app.propostas x where x.processo_id = pn.id order by versao desc limit 1) lp on true
left join lateral (select x.valor_total from app.propostas x where x.processo_id = pn.id
                   and x.status in ('apresentada','em_analise','aceita') order by versao desc limit 1) pa on true
left join app.viabilidades vb on vb.id = pn.viabilidade_id
left join app.viabilidade_config vc on vc.empresa_id = t.empresa_id
left join app.v_urbanismo_vigente u on u.terreno_id = t.id
left join lateral (
  select k.titulo, k.prazo from fluxo.tarefas k join fluxo.quadros q on q.id = k.quadro_id
  where q.objeto_tipo = 'terreno' and q.objeto_id = t.id and k.concluida_em is null and k.arquivada_em is null and k.prazo is not null
  order by k.prazo, k.prazo_hora nulls last limit 1
) nt on true;

-- Distância em linha reta (haversine). Rota de verdade é com o serviço de mapas.
create or replace function app.distancia_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns numeric language sql immutable parallel safe set search_path = '' as $$
  select round((2 * 6371 * asin(sqrt(
           power(sin(radians(lat2 - lat1) / 2), 2) +
           cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2))))::numeric, 2)
$$;

-- Pins do mapa: fase atual (filtro) e situação que dá a cor (etapa do processo
-- ativo, ou o status: concluido, perdido, descartado, stand_by).
create view app.v_mapa with (security_invoker = true) as
select v.id, v.empresa_id, v.codigo, v.nome, v.bairro, v.zona, v.municipio, v.corretor_principal,
       t.latitude, t.longitude, t.precisao_localizacao, t.poligono_geojson,
       v.area_adotada_m2, v.valor_pedido, v.temperatura, v.fase, v.fase_nome, v.fase_ordem, v.fases_abertas,
       v.etapa_nome, v.subetapa_atual, v.subetapa_nome,
       case when v.processo_id is null then 'sem_negociacao'
            when v.processo_status = 'ativo' then v.etapa_atual
            else v.processo_status end as situacao_mapa
from app.v_terrenos v
join app.terrenos t on t.id = v.id
where v.situacao_cadastral = 'ativo';

-- Todos os pontos de interesse da empresa para cada terreno localizado, menos os
-- excluídos daquele terreno: linha reta sempre; a pé (a ficha mostra só a pé, decisão
-- do Moisés de 4/nov/2026) e de carro quando medidos para a coordenada atual do terreno.
create view app.v_terreno_pontos with (security_invoker = true) as
select t.id as terreno_id, t.empresa_id, p.id as ponto_id, p.nome, p.categoria, p.latitude, p.longitude,
       app.distancia_km(t.latitude, t.longitude, p.latitude, p.longitude) as distancia_km,
       case when em_dia then d.distancia_pe_m end as distancia_pe_m,
       case when em_dia then d.duracao_pe_s end as duracao_pe_s,
       case when em_dia then d.distancia_carro_m end as distancia_carro_m,
       case when em_dia then d.duracao_carro_s end as duracao_carro_s,
       not coalesce(em_dia, false) as precisa_medir
from app.terrenos t
join app.pontos_interesse p on p.empresa_id = t.empresa_id and p.ativo
left join app.terreno_ponto_distancias d on d.terreno_id = t.id and d.ponto_id = p.id
cross join lateral (select d.terreno_id is not null and d.latitude = t.latitude and d.longitude = t.longitude as em_dia) x
where t.latitude is not null
  and not exists (select 1 from app.terreno_pontos_excluidos e where e.terreno_id = t.id and e.ponto_id = p.id);

-- Entorno do terreno (Google), com o aviso de busca feita para outra coordenada.
-- Lugares excluídos neste terreno não aparecem (a lista deles sai de terreno_entorno.excluido_em).
create view app.v_terreno_entorno with (security_invoker = true) as
select e.id, e.empresa_id, e.terreno_id, e.categoria, c.nome as categoria_nome, c.ordem as categoria_ordem,
       e.google_place_id, e.nome, e.latitude, e.longitude, e.distancia_pe_m, e.duracao_pe_s, e.distancia_reta_m,
       b.rota_a_pe, b.buscado_em,
       (b.latitude is distinct from t.latitude or b.longitude is distinct from t.longitude) as desatualizado
from app.terreno_entorno e
join app.entorno_categorias c on c.codigo = e.categoria
join app.terreno_entorno_buscas b on b.terreno_id = e.terreno_id
join app.terrenos t on t.id = e.terreno_id
where e.excluido_em is null;

-- Situação da busca por terreno localizado: nunca buscado (null), em dia ou desatualizado.
create view app.v_entorno_buscas with (security_invoker = true) as
select t.id as terreno_id, t.empresa_id, b.buscado_em, b.rota_a_pe,
       (b.terreno_id is not null and (b.latitude is distinct from t.latitude or b.longitude is distinct from t.longitude)) as desatualizado,
       (b.terreno_id is null or b.latitude is distinct from t.latitude or b.longitude is distinct from t.longitude) as precisa_buscar
from app.terrenos t
left join app.terreno_entorno_buscas b on b.terreno_id = t.id
where t.latitude is not null;

-- Tarefas dos quadros dos terrenos: o cartão (fluxo.v_tarefas, com lista,
-- atraso e checklist) com o código e o nome do terreno.
create view app.v_tarefas with (security_invoker = true) as
select k.*, t.id as terreno_id, t.codigo as terreno_codigo, t.nome as terreno_nome
from fluxo.v_tarefas k
join app.terrenos t on t.id = k.objeto_id
where k.objeto_tipo = 'terreno';

-- Períodos do processo, lidos só do histórico: cada transição que muda a
-- posição ou o status abre um período que dura até a seguinte. Stand by
-- fica em período próprio, para não inflar o tempo da etapa onde parou.
create view app.v_periodos_processo with (security_invoker = true) as
select x.empresa_id, x.processo_id, x.para_etapa as etapa, x.para_subetapa as subetapa, x.situacao,
       x.em as inicio, x.fim,
       case when x.situacao in ('ativo','stand_by') then coalesce(x.fim, now()) - x.em end as duracao,
       x.fim is null as atual
from (
  select t.empresa_id, t.processo_id, t.para_etapa, t.para_subetapa, t.em,
         case t.evento when 'stand_by' then 'stand_by' when 'conclusao' then 'concluido' when 'perda' then 'perdido'
                       when 'descarte' then 'descartado' else 'ativo' end as situacao,
         lead(t.em) over (partition by t.processo_id order by t.em, t.id) as fim
  from app.processo_transicoes t
  where t.evento <> 'temperatura'
) x;

-- Tempo em cada etapa e subetapa, pronto para os KPIs de SLA e para a ficha
-- (Estudos Preliminares como "quase checklist": entrada, saída, atual).
create view app.v_tempo_subetapas with (security_invoker = true) as
select pr.empresa_id, pr.processo_id, pr.etapa, e.nome as etapa_nome, e.ordem as etapa_ordem,
       pr.subetapa, s.nome as subetapa_nome, s.ordem as subetapa_ordem, s.prazo_dias,
       min(pr.inicio) as primeira_entrada,
       case when bool_or(pr.atual and pr.situacao in ('ativo','stand_by')) then null else max(pr.fim) end as ultima_saida,
       count(*) filter (where pr.situacao = 'ativo') as passagens,
       coalesce(sum(pr.duracao) filter (where pr.situacao = 'ativo'), interval '0') as tempo_ativo,
       coalesce(sum(pr.duracao) filter (where pr.situacao = 'stand_by'), interval '0') as tempo_stand_by,
       bool_or(pr.atual and pr.situacao in ('ativo','stand_by')) as atual
from app.v_periodos_processo pr
join app.processos p on p.id = pr.processo_id
left join app.etapas_modelo e on e.empresa_id = p.empresa_id and e.fase = p.fase and e.codigo = pr.etapa
left join app.subetapas_modelo s on s.empresa_id = p.empresa_id and s.fase = p.fase and s.codigo = pr.subetapa
where pr.subetapa is not null
group by pr.empresa_id, pr.processo_id, pr.etapa, e.nome, e.ordem, pr.subetapa, s.nome, s.ordem, s.prazo_dias;

-- Pedidos de aprovação com nomes, para a caixa do aprovador e o histórico.
create view app.v_aprovacoes with (security_invoker = true) as
select a.*, p.codigo as processo_codigo, p.terreno_id, t.nome as terreno_nome,
       coalesce(e.nome, s.nome, st.nome) as destino_nome,
       mp.nome as pedido_por_nome, mv.nome as aprovador_previsto_nome, md.nome as decidido_por_nome,
       -- vez desta linha: em sequência, o diretor espera o gestor
       (a.status = 'pendente' and not exists (
          select 1 from app.aprovacoes o where o.pedido_id = a.pedido_id and o.status = 'pendente' and o.ordem < a.ordem)) as na_vez
from app.aprovacoes a
join app.processos p on p.id = a.processo_id
join app.terrenos t on t.id = p.terreno_id
left join app.etapas_modelo e    on a.destino_tipo = 'etapa'    and e.empresa_id = a.empresa_id and e.fase = p.fase and e.codigo = a.destino
left join app.subetapas_modelo s on a.destino_tipo = 'subetapa' and s.empresa_id = a.empresa_id and s.fase = p.fase and s.codigo = a.destino
left join app.status_modelo st   on a.destino_tipo = 'status'   and st.empresa_id = a.empresa_id and st.fase = p.fase and st.status = a.destino
left join app.membros mp on mp.empresa_id = a.empresa_id and mp.user_id = a.pedido_por
left join app.membros mv on mv.empresa_id = a.empresa_id and mv.user_id = a.aprovador_previsto
left join app.membros md on md.empresa_id = a.empresa_id and md.user_id = a.decidido_por;

grant select on app.v_terreno_viabilidades_tecnicas to authenticated;
grant select on app.v_terreno_infraestrutura, app.v_inscricoes, app.v_urbanismo_vigente, app.v_lote_zonas,
                app.v_documentos, app.v_checklist, app.v_reunioes, app.v_terrenos,
                app.v_mapa, app.v_terreno_pontos, app.v_tarefas, app.v_terreno_entorno, app.v_entorno_buscas,
                app.v_periodos_processo, app.v_tempo_subetapas, app.v_aprovacoes to authenticated;

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
           'Mesma matrícula ' || m.numero || case when m.cartorio = p_cartorio then ' no ' || m.cartorio
                                                   when m.cartorio is null or nullif(trim(p_cartorio), '') is null then ' (cartório não informado)'
                                                   else ' em outro cartório (' || m.cartorio || ')' end,
           case when m.cartorio = p_cartorio or m.cartorio is null or nullif(trim(p_cartorio), '') is null then 'certa' else 'provavel' end
    from app.matriculas m join app.terrenos t on t.id = m.terreno_id
    where length(v_mat) >= 3 and m.empresa_id = p_empresa and m.numero_norm = v_mat
  union all
    select t.id, t.codigo, t.nome, 'Mesma inscrição municipal ' || i.inscricao, 'certa'
    from app.inscricoes_municipais i join app.terrenos t on t.id = i.terreno_id
    where length(v_ins) >= 6 and i.empresa_id = p_empresa and i.inscricao_norm = v_ins
  union all
    -- SQL de São Paulo: setor (3) . quadra (3) . lote (4) - dígito; inscrição de São José
    -- dos Campos: setor (2) . quadra (4) . lote (4) . sublote (4). Nos dois, os 6 primeiros
    -- dígitos são a quadra. Mesma quadra = vizinho ou outra parte da mesma área: não é
    -- duplicata, mas vale saber (composição de áreas).
    select distinct t.id, t.codigo, t.nome, 'Na mesma quadra (inscrição ' || i.inscricao || ')', 'mesma_quadra'
    from app.inscricoes_municipais i join app.terrenos t on t.id = i.terreno_id
    where length(v_ins) in (11, 14) and i.empresa_id = p_empresa and length(i.inscricao_norm) = length(v_ins)
      and left(i.inscricao_norm, 6) = left(v_ins, 6) and i.inscricao_norm <> v_ins
      and t.situacao_cadastral = 'ativo'
  union all
    select t.id, t.codigo, t.nome, 'Mesmo endereço: ' || t.logradouro || coalesce(', ' || t.numero, ''), 'possivel'
    from app.terrenos t
    where length(trim(coalesce(p_logradouro,''))) >= 4 and t.empresa_id = p_empresa
      and lower(trim(t.logradouro)) = lower(trim(p_logradouro))
      and (p_numero is null or t.numero is null or lower(trim(t.numero)) = lower(trim(p_numero)));
end $$;

-- Primeiro passo do cadastro: a poligonal. Antes de criar o terreno, procura os
-- que já ocupam parte dela (critério em app.sobreposicao: a faixa de até 5 m na
-- divisa, imprecisão do desenho, não conta). Quem decide é o usuário: registrar
-- a oferta no existente (ampliando a poligonal dele, se a área nova for maior)
-- ou confirmar que é outro terreno. p_ignorar tira um terreno da busca (o que está sendo editado).
create or replace function app.terrenos_sobrepostos(p_empresa uuid, p_poligono jsonb, p_ignorar uuid default null)
returns table (terreno_id uuid, codigo text, nome text, situacao text, motivo text,
               area_sobreposta_m2 numeric, largura_m numeric, pct_da_nova numeric, pct_do_existente numeric)
language plpgsql stable security invoker set search_path = ''
as $$
declare g extensions.geometry;
begin
  perform app.exigir_membro(p_empresa);
  if p_poligono is null or not app.geojson_poligono_valido(p_poligono) then
    raise exception 'Poligonal inválida: precisa ser um polígono GeoJSON fechado' using errcode = '22023';
  end if;
  g := extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(p_poligono::text), 4326));
  if extensions.st_area(g::extensions.geography) < 1 then raise exception 'Poligonal sem área' using errcode = '22023'; end if;
  return query
    select t.id, t.codigo, t.nome,
           case when t.situacao_cadastral = 'arquivado' then 'arquivado'
                else coalesce((select p.status from app.processos p join app.fases_modelo f on f.empresa_id = p.empresa_id and f.codigo = p.fase
                               where p.terreno_id = t.id and p.parte_id is null
                               order by (p.status in ('ativo','stand_by')) desc, f.ordem desc, p.data_inicio desc limit 1), 'sem_negociacao') end,
           -- parcial: a área nova e a existente não coincidem (ex.: 5 lotes contra 3, com 3 em comum)
           case when s.pct_a >= 90 and s.pct_b >= 90 then 'mesma_area' else 'parcial' end,
           round(s.area_m2::numeric, 2), round(s.largura_m::numeric, 1), round(s.pct_a::numeric, 1), round(s.pct_b::numeric, 1)
    from app.terrenos t cross join lateral app.sobreposicao(g, t.poligono) s
    where t.empresa_id = p_empresa and t.id is distinct from p_ignorar and t.poligono operator(extensions.&&) g and s.conta
    order by s.area_m2 desc, t.codigo;
end $$;

-- ---------------------------------------------------------------------
-- Fases: abrir o processo do terreno numa fase
-- ---------------------------------------------------------------------
create or replace function app._fase_entrada(p_empresa uuid)
returns text
language sql stable security definer set search_path = ''
as $$ select codigo from app.fases_modelo where empresa_id = p_empresa and entrada $$;

-- Abre o processo na primeira etapa (com subetapa ativa) da fase. Sem checar
-- dependências nem permissão: quem chama já checou.
create or replace function app._abrir_processo(t app.terrenos, p_fase text, p_comentario text, p_oferta uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare f app.fases_modelo; v_id uuid; v_etapa text; v_sub text;
begin
  select * into f from app.fases_modelo where empresa_id = t.empresa_id and codigo = p_fase;
  if not found or not f.ativo then raise exception 'Fase inválida ou desativada' using errcode = '22023'; end if;
  select e.codigo, app._subetapa_inicial(t.empresa_id, p_fase, e.codigo) into v_etapa, v_sub
    from app.etapas_modelo e
   where e.empresa_id = t.empresa_id and e.fase = p_fase and app._subetapa_inicial(t.empresa_id, p_fase, e.codigo) is not null
   order by e.ordem limit 1;
  if v_etapa is null then raise exception 'A fase % não tem etapas: configure antes de abrir', f.nome using errcode = '22023'; end if;
  insert into app.processos (empresa_id, codigo, terreno_id, fase, etapa_atual, subetapa_atual, responsavel_id)
  values (t.empresa_id, f.prefixo || '-' || lpad(nextval('app.processo_seq')::text, 5, '0'), t.id, p_fase, v_etapa, v_sub, t.responsavel_id)
  returning id into v_id;
  if f.entrada then
    insert into app.negociacoes (processo_id, empresa_id, oferta_referencia_id) values (v_id, t.empresa_id, p_oferta);
  end if;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, para_etapa, para_subetapa, comentario)
  values (t.empresa_id, v_id, 'abertura', v_etapa, v_sub, p_comentario);
  perform app._tarefas_ao_entrar(v_id, 'etapa', v_etapa);
  return v_id;
end $$;

-- Situação de cada dependência da fase no terreno.
create or replace function app._dependencias_fase(p_terreno uuid, p_fase text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', d.id, 'tipo', 'dependencia', 'bloqueio_gestor', false,
           'ok', case d.requisito_tipo
                   when 'conclusao' then exists (select 1 from app.processos p where p.terreno_id = t.id and p.parte_id is null and p.fase = d.requisito_fase and p.status = 'concluido')
                   else exists (select 1 from app.processos p where p.terreno_id = t.id and p.parte_id is null and p.fase = d.requisito_fase and p.status = 'concluido')
                     or exists (select 1 from app.processo_transicoes x join app.processos p on p.id = x.processo_id
                                where p.terreno_id = t.id and p.parte_id is null and p.fase = d.requisito_fase
                                  and case d.requisito_tipo when 'etapa' then x.para_etapa else x.para_subetapa end = d.requisito)
                 end,
           'texto', case d.requisito_tipo
                      when 'conclusao' then coalesce(st.nome, 'Concluir') || ' em ' || rf.nome
                      when 'etapa' then rf.nome || ': chegar à etapa ' || coalesce(e.nome, d.requisito)
                      else rf.nome || ': passar por ' || coalesce(s.nome, d.requisito) end)
           order by rf.ordem, d.requisito_tipo, d.requisito), '[]'::jsonb)
  from app.terrenos t
  join app.fase_dependencias d on d.empresa_id = t.empresa_id and d.fase = p_fase
  join app.fases_modelo rf on rf.empresa_id = d.empresa_id and rf.codigo = d.requisito_fase
  left join app.status_modelo st on st.empresa_id = d.empresa_id and st.fase = d.requisito_fase and st.status = 'concluido'
  left join app.etapas_modelo e on d.requisito_tipo = 'etapa' and e.empresa_id = d.empresa_id and e.fase = d.requisito_fase and e.codigo = d.requisito
  left join app.subetapas_modelo s on d.requisito_tipo = 'subetapa' and s.empresa_id = d.empresa_id and s.fase = d.requisito_fase and s.codigo = d.requisito
  where t.id = p_terreno
$$;

-- Abre sozinhas as fases cujas dependências acabaram de se cumprir: só fase
-- ativa, com ao menos uma dependência, que o terreno nunca teve (fase
-- encerrada não reabre sozinha). Repete enquanto abrir alguma (uma fase pode
-- depender da etapa inicial de outra).
create or replace function app._abrir_fases_liberadas(p_terreno uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; f record; abriu boolean := true; n int := 0;
begin
  select * into t from app.terrenos where id = p_terreno;
  if t.situacao_cadastral = 'arquivado' then return; end if;
  while abriu and n < 20 loop
    abriu := false; n := n + 1;
    for f in select fm.codigo, fm.nome from app.fases_modelo fm
             where fm.empresa_id = t.empresa_id and fm.ativo and not fm.entrada
               and exists (select 1 from app.fase_dependencias d where d.empresa_id = fm.empresa_id and d.fase = fm.codigo)
               and not exists (select 1 from app.processos p where p.terreno_id = t.id and p.fase = fm.codigo and p.parte_id is null)
             order by fm.ordem loop
      if not exists (select 1 from jsonb_array_elements(app._dependencias_fase(t.id, f.codigo)) i where (i->>'ok')::boolean is not true) then
        perform app._abrir_processo(t, f.codigo, 'Fase aberta: dependências cumpridas');
        abriu := true;
      end if;
    end loop;
  end loop;
end $$;

-- Abre a fase à mão (fase sem dependência, reabrir uma encerrada, ou antes da
-- hora). Dependência pendente trava; gestor ou diretor força com justificativa.
create or replace function app.abrir_fase(p_terreno uuid, p_fase text, p_forcar boolean default false, p_comentario text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; pend jsonb; v_id uuid; v_forcado boolean := false;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if t.situacao_cadastral = 'arquivado' then raise exception 'Terreno arquivado: reative antes' using errcode = '22023'; end if;
  if exists (select 1 from app.processos where terreno_id = t.id and fase = p_fase and parte_id is null and status in ('ativo','stand_by')) then
    raise exception 'O terreno já está nesta fase' using errcode = '22023';
  end if;
  if p_fase = app._fase_entrada(t.empresa_id) then return app.abrir_negociacao(t.id); end if;
  pend := app._dependencias_fase(t.id, p_fase);
  if exists (select 1 from jsonb_array_elements(pend) i where (i->>'ok')::boolean is not true) then
    if not coalesce(p_forcar, false) then
      raise exception 'Ainda há dependências para abrir esta fase' using errcode = '22023', detail = pend::text;
    end if;
    if not app.eh_gestor(t.empresa_id) then raise exception 'Você não pode forçar a abertura da fase' using errcode = '42501'; end if;
    if coalesce(trim(p_comentario), '') = '' then raise exception 'Justifique a abertura forçada' using errcode = '22023'; end if;
    v_forcado := true;
  end if;
  v_id := app._abrir_processo(t, p_fase, coalesce(nullif(trim(p_comentario), ''), 'Fase aberta'));
  if v_forcado then update app.processo_transicoes set forcado = true where processo_id = v_id; end if;
  perform app._abrir_fases_liberadas(t.id);
  return v_id;
end $$;

-- O que falta para cada fase do terreno abrir, com a situação de cada uma.
create or replace function app.fases_do_terreno(p_terreno uuid)
returns table (fase text, nome text, ordem int, entrada boolean, processo_id uuid, processo_codigo text, status text,
               status_nome text, dependencias jsonb, pode_abrir boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(t.empresa_id);
  return query
    select f.codigo, f.nome, f.ordem, f.entrada, p.id, p.codigo, p.status, st.nome, d.deps,
           p.id is null or p.status not in ('ativo','stand_by')
    from app.fases_modelo f
    left join lateral (select * from app.processos x where x.terreno_id = t.id and x.fase = f.codigo and x.parte_id is null
                       order by (x.status in ('ativo','stand_by')) desc, x.data_inicio desc limit 1) p on true
    left join app.status_modelo st on st.empresa_id = f.empresa_id and st.fase = f.codigo and st.status = p.status
    cross join lateral (select app._dependencias_fase(t.id, f.codigo) as deps) d
    where f.empresa_id = t.empresa_id and f.ativo
    order by f.ordem, f.codigo;
end $$;

-- ---------------------------------------------------------------------
-- Ofertas e abertura da negociação (fase de entrada)
-- ---------------------------------------------------------------------
create or replace function app.abrir_negociacao(p_terreno uuid, p_oferta uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_id uuid; v_fase text;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if t.situacao_cadastral = 'arquivado' then raise exception 'Terreno arquivado: reative antes de negociar' using errcode = '22023'; end if;
  v_fase := app._fase_entrada(t.empresa_id);
  select id into v_id from app.processos where terreno_id = p_terreno and fase = v_fase and parte_id is null and status in ('ativo','stand_by');
  if found then return v_id; end if;
  return app._abrir_processo(t, v_fase, 'Negociação aberta', p_oferta);
end $$;

create or replace function app.registrar_oferta(
  p_terreno uuid, p_valor numeric, p_forma text default null, p_corretor uuid default null,
  p_observacao_pagamento text default null, p_aceita_permuta text default null,
  p_validade date default null, p_data date default current_date, p_comissao_pct numeric default null,
  p_ofertante uuid default null, p_comissao_valor numeric default null, p_poligono jsonb default null,
  p_partes jsonb default null)  -- terreno com vários donos: [{"parte_id": ..., "valor": ...}], valor opcional
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_of uuid; v_proc uuid; v_nova boolean; i jsonb;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if p_corretor is not null and not exists (select 1 from app.corretores where id = p_corretor and empresa_id = t.empresa_id) then
    raise exception 'Corretor não encontrado' using errcode = 'P0002';
  end if;
  if p_ofertante is not null and not exists (select 1 from app.pessoas where id = p_ofertante and empresa_id = t.empresa_id) then
    raise exception 'Ofertante não encontrado' using errcode = 'P0002';
  end if;

  -- o pedaço oferecido tem que estar no terreno; se passa dele, amplie a poligonal do terreno antes
  if p_poligono is not null then
    if not app.geojson_poligono_valido(p_poligono) then raise exception 'Poligonal da oferta inválida' using errcode = '22023'; end if;
    if extensions.st_area(extensions.st_difference(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(p_poligono::text), 4326)),
                                                   extensions.st_buffer(t.poligono::extensions.geography, 5)::extensions.geometry)::extensions.geography) >= 1 then
      raise exception 'A área da oferta passa da poligonal do terreno: amplie o terreno antes' using errcode = '22023';
    end if;
  end if;
  insert into app.ofertas (empresa_id, terreno_id, corretor_id, ofertante_id, data_oferta, valor_pedido, forma_pagamento_pedida,
                           observacao_pagamento, aceita_permuta, validade, comissao_pct, comissao_valor, poligono_geojson)
  values (t.empresa_id, t.id, p_corretor, p_ofertante, coalesce(p_data, current_date), p_valor, p_forma,
          p_observacao_pagamento, p_aceita_permuta, p_validade, p_comissao_pct, p_comissao_valor, p_poligono)
  returning id into v_of;
  for i in select * from jsonb_array_elements(coalesce(p_partes, '[]'::jsonb)) loop
    insert into app.oferta_partes (oferta_id, parte_id, empresa_id, valor_pedido)
    values (v_of, (i->>'parte_id')::uuid, t.empresa_id, (i->>'valor')::numeric);
    -- a negociação da parte sem oferta de referência passa a usar esta
    update app.negociacoes n set oferta_referencia_id = v_of
      from app.processos c where c.id = n.processo_id and c.parte_id = (i->>'parte_id')::uuid
       and c.status in ('ativo','stand_by') and n.oferta_referencia_id is null;
  end loop;

  v_nova := not exists (select 1 from app.processos where terreno_id = t.id and fase = app._fase_entrada(t.empresa_id) and parte_id is null and status in ('ativo','stand_by'));
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
declare p app.processos; antes int; ult app.processo_transicoes; inicial int;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Negociação não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if p_temperatura is not null and p_temperatura not between 1 and 5 then raise exception 'Temperatura vai de 1 a 5' using errcode = '22023'; end if;
  if p.parte_id is not null then
    raise exception 'A temperatura é uma só, da negociação do terreno' using errcode = '22023';
  end if;
  select temperatura into antes from app.negociacoes where processo_id = p.id;
  if not found then raise exception 'Temperatura só na negociação (fase de entrada)' using errcode = '22023'; end if;
  if antes is not distinct from p_temperatura then return; end if;
  update app.negociacoes set temperatura = p_temperatura, temperatura_em = now() where processo_id = p.id;
  -- cliques seguidos do mesmo usuário (app.janela_log) viram um registro só,
  -- do valor de antes da sequência ao final; se voltou ao de antes, some
  select * into ult from app.processo_transicoes where processo_id = p.id order by em desc, id desc limit 1;
  if found and ult.evento = 'temperatura' and ult.user_id is not distinct from auth.uid()
     and ult.em >= clock_timestamp() - app.janela_log() then
    inicial := nullif(split_part(ult.comentario, ' → ', 1), '—')::int;
    if inicial is not distinct from p_temperatura then
      delete from app.processo_transicoes where id = ult.id;
    else
      update app.processo_transicoes set em = clock_timestamp(),
        comentario = coalesce(inicial::text, '—') || ' → ' || coalesce(p_temperatura::text, '—')
      where id = ult.id;
    end if;
    return;
  end if;
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
  perform app.exigir_editor(p.empresa_id);
  if not exists (select 1 from app.ofertas where id = p_oferta and terreno_id = p.terreno_id) then
    raise exception 'A oferta não é deste terreno' using errcode = '22023';
  end if;
  update app.negociacoes set oferta_referencia_id = p_oferta where processo_id = p.id;
end $$;

-- ---------------------------------------------------------------------
-- Funil: etapas, subetapas, status e aprovações
--
-- Toda passagem (entrar numa etapa, numa subetapa ou num status de
-- encerramento) segue o mesmo caminho, app._passagem:
--   1. pendências travam (checklist para sair da etapa, pré-requisitos,
--      diligência impeditiva na compra); o gestor força com justificativa;
--   2. aprovações configuradas viram um pedido, salvo o nível que quem move
--      já tem (gestor dispensa gestor; diretor dispensa os dois);
--   3. sem pedido, executa na hora (app._executar_passagem).
-- ---------------------------------------------------------------------
create or replace function app._subetapa_inicial(p_empresa uuid, p_fase text, p_etapa text)
returns text
language sql stable security definer set search_path = ''
as $$
  select codigo from app.subetapas_modelo
  where empresa_id = p_empresa and fase = p_fase and etapa = p_etapa and ativo
  order by ordem, codigo limit 1
$$;

create or replace function app._passou_por(p_processo uuid, p_subetapa text)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.processo_transicoes where processo_id = p_processo and para_subetapa = p_subetapa) $$;

-- Pendências que travam a passagem. Cada item: ok, tipo, texto, bloqueio_gestor
-- (true = nem o gestor força).
create or replace function app._pendencias(p app.processos, p_destino_tipo text, p_destino text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  itens jsonb := '[]'::jsonb; r record; ordem_atual int; ordem_destino int; v_sub_inicial text;
begin
  select ordem into ordem_atual from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p.etapa_atual;
  if p_destino_tipo = 'etapa' then
    select ordem into ordem_destino from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p_destino;
  end if;

  -- sair da etapa (avanço ou conclusão da fase): checklist de documentos da etapa atual
  -- (negociação do terreno dividida em partes: o checklist é de cada parte)
  if ((p_destino_tipo = 'etapa' and ordem_destino > ordem_atual) or (p_destino_tipo = 'status' and p_destino = 'concluido'))
     and not app._tem_partes(p.id) then
    for r in select c.tipo_nome, c.situacao, c.condicao, c.regra_efetiva from app.v_checklist c
             where c.processo_id = p.id and c.etapa = p.etapa_atual and c.regra_efetiva <> 'livre' and c.aplica order by c.ordem loop
      itens := itens || jsonb_build_object('ok', r.situacao = 'validado', 'tipo', 'documento', 'bloqueio_gestor', false, 'condicao', r.condicao,
        'justifica', r.regra_efetiva = 'justifica',
        'texto', r.tipo_nome || case r.situacao when 'validado' then ' validado' when 'pendente' then ': não enviado'
                                                when 'recebido' then ': aguardando validação' when 'vencido' then ': vencido' else ': rejeitado' end);
    end loop;
  end if;

  -- compra (conclusão da fase de entrada): nenhuma diligência impeditiva
  if p_destino_tipo = 'status' and p_destino = 'concluido' and p.fase = app._fase_entrada(p.empresa_id) and p.parte_id is null then
    for r in select g.titulo from app.diligencias g where g.terreno_id = p.terreno_id and g.situacao = 'impeditiva' loop
      itens := itens || jsonb_build_object('ok', false, 'tipo', 'diligencia', 'bloqueio_gestor', false, 'texto', 'Diligência impeditiva: ' || r.titulo);
    end loop;
    -- terreno de vários donos: cada parte ativa comprada (nem o gestor força)
    if app._tem_partes(p.id) then
      for r in select tp.nome, c.status from app.terreno_partes tp
               left join app.processos c on c.parte_id = tp.id and c.principal_id = p.id
               where tp.terreno_id = p.terreno_id and tp.ativa order by tp.criado_em, tp.nome loop
        itens := itens || jsonb_build_object('ok', coalesce(r.status = 'concluido', false), 'tipo', 'parte', 'bloqueio_gestor', true,
          'texto', 'Parte ' || r.nome || case r.status when 'concluido' then ': comprada'
                                                       when 'perdido' then ': perdida (tire a parte do terreno ou encerre a negociação)'
                                                       when 'descartado' then ': descartada (tire a parte do terreno ou encerre a negociação)'
                                                       when 'stand_by' then ': em stand by'
                                                       when 'ativo' then ': em negociação'
                                                       else ': sem negociação' end);
      end loop;
    end if;
  end if;

  -- pré-requisitos (só para frente: voltar de etapa não exige nada)
  if p_destino_tipo = 'etapa' and ordem_destino > ordem_atual then
    v_sub_inicial := app._subetapa_inicial(p.empresa_id, p.fase, p_destino);
    -- pré-requisito com condição só conta quando ela vale para o terreno
    for r in select pr.requisito, s.nome, (array_agg(pr.condicao))[1] as condicao, bool_and(app._regra_branco(p.terreno_id, pr.regra, pr.regra_cond) = 'justifica') as justifica from app.prerequisitos_modelo pr
             join app.subetapas_modelo s on s.empresa_id = pr.empresa_id and s.fase = pr.fase and s.codigo = pr.requisito
             where pr.empresa_id = p.empresa_id and pr.fase = p.fase
               and ((pr.alvo_tipo = 'etapa' and pr.alvo = p_destino) or (pr.alvo_tipo = 'subetapa' and pr.alvo = v_sub_inicial))
               and app.avaliar_condicao(p.terreno_id, pr.condicao) and app._regra_branco(p.terreno_id, pr.regra, pr.regra_cond) <> 'livre'
             group by pr.requisito, s.nome, s.ordem order by s.ordem loop
      itens := itens || jsonb_build_object('ok', app._passou_por(p.id, r.requisito), 'tipo', 'prerequisito', 'bloqueio_gestor', false,
        'requisito', r.requisito, 'texto', 'Passar por ' || r.nome, 'condicao', r.condicao, 'justifica', r.justifica);
    end loop;
  elsif p_destino_tipo = 'subetapa' then
    for r in select pr.requisito, s.nome, pr.condicao, app._regra_branco(p.terreno_id, pr.regra, pr.regra_cond) = 'justifica' as justifica from app.prerequisitos_modelo pr
             join app.subetapas_modelo s on s.empresa_id = pr.empresa_id and s.fase = pr.fase and s.codigo = pr.requisito
             where pr.empresa_id = p.empresa_id and pr.fase = p.fase and pr.alvo_tipo = 'subetapa' and pr.alvo = p_destino
               and app.avaliar_condicao(p.terreno_id, pr.condicao) and app._regra_branco(p.terreno_id, pr.regra, pr.regra_cond) <> 'livre' loop
      itens := itens || jsonb_build_object('ok', app._passou_por(p.id, r.requisito), 'tipo', 'prerequisito', 'bloqueio_gestor', false,
        'requisito', r.requisito, 'texto', 'Passar por ' || r.nome, 'condicao', r.condicao, 'justifica', r.justifica);
    end loop;
  end if;

  -- tarefas da etapa que travam a saída (lote B, 31/out/2026; ver app._tarefas_travando, 001300):
  -- sair da etapa para frente ou concluir a fase, ou sair da subetapa para frente
  if (p_destino_tipo = 'etapa' and ordem_destino > ordem_atual) or (p_destino_tipo = 'status' and p_destino = 'concluido') then
    itens := itens || app._tarefas_travando(p, 'etapa');
  elsif p_destino_tipo = 'subetapa' and app._ordem_subetapa(p.empresa_id, p.fase, p_destino) > app._ordem_subetapa(p.empresa_id, p.fase, p.subetapa_atual) then
    itens := itens || app._tarefas_travando(p, 'subetapa');
  end if;

  -- jornada (1/nov/2026; ver 001400): perguntas e campos da etapa ou das subetapas deixadas,
  -- e as regras pelo valor que travam (bloqueia) ou só avisam (avisa)
  itens := itens || app._jornada_pendencias(p, p_destino_tipo, p_destino);
  return itens;
end $$;

-- Níveis de aprovação que a passagem pede a quem move (p_ator), já sem os
-- dispensados. Entrar numa etapa também entra na subetapa inicial dela.
create or replace function app._aprovacoes_exigidas(p app.processos, p_destino_tipo text, p_destino text, p_ator uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  g boolean := false; d boolean := false; modo text := 'sequencia'; r record; nivel_ator int; niveis jsonb := '[]'::jsonb;
begin
  if p_destino_tipo = 'etapa' then
    select aprova_gestor, aprova_diretor, aprovacao_modo into r from app.etapas_modelo
     where empresa_id = p.empresa_id and fase = p.fase and codigo = p_destino;
    g := r.aprova_gestor; d := r.aprova_diretor; modo := r.aprovacao_modo;
    select aprova_gestor, aprova_diretor, aprovacao_modo into r from app.subetapas_modelo
     where empresa_id = p.empresa_id and fase = p.fase and codigo = app._subetapa_inicial(p.empresa_id, p.fase, p_destino);
    if not (g or d) then modo := coalesce(r.aprovacao_modo, modo); end if;
    g := g or coalesce(r.aprova_gestor, false); d := d or coalesce(r.aprova_diretor, false);
  elsif p_destino_tipo = 'subetapa' then
    select aprova_gestor, aprova_diretor, aprovacao_modo into r from app.subetapas_modelo
     where empresa_id = p.empresa_id and fase = p.fase and codigo = p_destino;
    g := r.aprova_gestor; d := r.aprova_diretor; modo := r.aprovacao_modo;
  else
    select aprova_gestor, aprova_diretor, aprovacao_modo into r from app.status_modelo
     where empresa_id = p.empresa_id and fase = p.fase and status = p_destino;
    g := coalesce(r.aprova_gestor, false); d := coalesce(r.aprova_diretor, false); modo := coalesce(r.aprovacao_modo, 'sequencia');
  end if;

  -- regra da jornada pelo valor da resposta que pede aprovação (1/nov/2026)
  g := g or app._jornada_pede(p, p_destino_tipo, p_destino, 'gestor');
  d := d or app._jornada_pede(p, p_destino_tipo, p_destino, 'diretor');
  select app.nivel_papel(papel) into nivel_ator from app.membros where empresa_id = p.empresa_id and user_id = p_ator;
  if g and coalesce(nivel_ator, 0) < 2 then niveis := niveis || '"gestor"'::jsonb; end if;
  if d and coalesce(nivel_ator, 0) < 3 then niveis := niveis || '"diretor"'::jsonb; end if;
  return jsonb_build_object('niveis', niveis, 'modo', modo);
end $$;

-- Quem decide uma linha de aprovação: tem o nível, não é quem pediu, e é o
-- aprovador previsto ou está acima dele na hierarquia (qualquer superior
-- aprova por quem está abaixo). Sem previsto, qualquer um do nível.
create or replace function app._pode_decidir(a app.aprovacoes, p_user uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(app.nivel_papel(m.papel) >= case a.nivel when 'diretor' then 3 else 2 end, false)
     and p_user <> a.pedido_por
     and (a.aprovador_previsto is null or a.aprovador_previsto = p_user or app.eh_superior(a.empresa_id, p_user, a.aprovador_previsto))
  from app.membros m where m.empresa_id = a.empresa_id and m.user_id = p_user
$$;

-- Avisa quem está na vez de decidir o pedido.
create or replace function app._avisar_aprovadores(p_pedido uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare a app.aprovacoes; v_terreno uuid; v_nome text; u uuid;
begin
  for a in select * from app.aprovacoes x where x.pedido_id = p_pedido and x.status = 'pendente'
            and not exists (select 1 from app.aprovacoes o where o.pedido_id = x.pedido_id and o.status = 'pendente' and o.ordem < x.ordem) loop
    select terreno_id into v_terreno from app.processos where id = a.processo_id;
    select destino_nome into v_nome from app.v_aprovacoes where id = a.id;
    for u in select m.user_id from app.membros m
             where m.empresa_id = a.empresa_id and m.user_id <> a.pedido_por
               and (m.user_id = a.aprovador_previsto
                    or (a.aprovador_previsto is null and app.nivel_papel(m.papel) >= case a.nivel when 'diretor' then 3 else 2 end)) loop
      perform app._notificar(a.empresa_id, u, 'aprovacao_pendente', 'Aprovar passagem para ' || coalesce(v_nome, a.destino),
                             v_terreno, 'aprovacoes', a.id, current_date, a.pedido_por);
    end loop;
  end loop;
end $$;

-- Executa a passagem já liberada. Grava a transição com quem pediu.
create or replace function app._executar_passagem(
  p_processo uuid, p_destino_tipo text, p_destino text, p_forcado boolean, p_comentario text,
  p_dados jsonb default '{}'::jsonb, p_aprovacao uuid default null, p_por uuid default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_sub text; ordem_atual int; ordem_destino int; v_evento text;
begin
  select * into p from app.processos where id = p_processo for update;
  if p_destino_tipo = 'etapa' then
    select ordem into ordem_atual from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p.etapa_atual;
    select ordem into ordem_destino from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p_destino;
    v_sub := app._subetapa_inicial(p.empresa_id, p.fase, p_destino);
    -- voltar de etapa: as tarefas das etapas deixadas para trás (lote B)
    if ordem_destino < ordem_atual then perform app._tarefas_ao_voltar(p.id, ordem_destino); end if;
    update app.processos set etapa_atual = p_destino, etapa_desde = now(), subetapa_atual = v_sub, subetapa_desde = now() where id = p.id;
    insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa, forcado, comentario, aprovacao_id, user_id)
    values (p.empresa_id, p.id, case when ordem_destino > ordem_atual then 'avanco' else 'retorno' end,
            p.etapa_atual, p_destino, p.subetapa_atual, v_sub, coalesce(p_forcado, false), p_comentario, p_aprovacao, coalesce(p_por, auth.uid()));
    -- entrar na etapa (e na subetapa inicial): tarefas da etapa e gatilho das automações
    perform app._tarefas_ao_entrar(p.id, 'etapa', p_destino);
  elsif p_destino_tipo = 'subetapa' then
    update app.processos set subetapa_atual = p_destino, subetapa_desde = now() where id = p.id;
    insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa, forcado, comentario, aprovacao_id, user_id)
    values (p.empresa_id, p.id, 'subetapa', p.etapa_atual, p.etapa_atual, p.subetapa_atual, p_destino,
            coalesce(p_forcado, false), p_comentario, p_aprovacao, coalesce(p_por, auth.uid()));
    perform app._tarefas_ao_entrar(p.id, 'subetapa', p_destino);
  else
    update app.processos set status = p_destino,
           motivo_encerramento  = p_dados->>'motivo',
           detalhe_encerramento = p_dados->>'detalhe',
           pontos_sucesso       = p_dados->>'pontos_sucesso',
           retomar_em           = (p_dados->>'retomar_em')::date,
           data_encerramento    = now()
     where id = p.id;
    v_evento := case p_destino when 'concluido' then 'conclusao' when 'perdido' then 'perda' when 'descartado' then 'descarte' else 'stand_by' end;
    insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa, forcado, comentario, aprovacao_id, user_id)
    values (p.empresa_id, p.id, v_evento, p.etapa_atual, p.etapa_atual, p.subetapa_atual, p.subetapa_atual, coalesce(p_forcado, false),
            nullif(concat_ws(' · ',
              (select nome from app.motivos_encerramento where empresa_id = p.empresa_id and status = p_destino and codigo = p_dados->>'motivo'),
              case when p_destino = 'stand_by' then 'retomar em ' || to_char((p_dados->>'retomar_em')::date, 'DD/MM/YYYY') end,
              p_comentario), ''),
            p_aprovacao, coalesce(p_por, auth.uid()));
    if p_destino = 'stand_by' then perform app._lembretes_padrao(p.empresa_id, 'processos', p.id, 'stand_by_retomar'); end if;
    -- Stand By pausa as tarefas da fase; Perdido e Descartado arquivam, se pedido (lote B)
    perform app._tarefas_ao_encerrar(p.id, p_destino, p_dados);
    if p.parte_id is null and p_destino in ('perdido','descartado','stand_by') then perform app._encerrar_partes(p, p_destino, p_dados); end if;
  end if;
  if p.parte_id is not null then
    -- a negociação do terreno acompanha a parte mais atrasada
    perform app._sincronizar_principal(p.principal_id);
  elsif p_destino_tipo = 'etapa' then
    -- chegou à etapa da divisão: cada parte ganha a sua negociação
    perform app._abrir_negociacoes_partes(p.id);
  end if;
  -- a passagem pode cumprir a dependência de outra fase
  perform app._abrir_fases_liberadas(p.terreno_id);
end $$;

-- Quem pode ir para onde quando o terreno tem partes: a negociação do terreno
-- dividida não se move à mão (etapa e subetapa vêm das partes); a de uma parte
-- só anda a partir da etapa da divisão e enquanto a do terreno está ativa.
create or replace function app._conferir_movimento(p app.processos, p_destino_tipo text, p_destino text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare f app.fases_modelo;
begin
  if p_destino_tipo not in ('etapa','subetapa') and p.parte_id is null then return; end if;
  if p.parte_id is null then
    if app._tem_partes(p.id) then
      raise exception 'Com várias partes, a negociação do terreno anda pelas negociações das partes' using errcode = '22023';
    end if;
    return;
  end if;
  if (select status from app.processos where id = p.principal_id) <> 'ativo' then
    raise exception 'A negociação do terreno não está ativa' using errcode = '22023';
  end if;
  if p_destino_tipo = 'etapa' then
    select * into f from app.fases_modelo where empresa_id = p.empresa_id and codigo = p.fase;
    if app._ordem_etapa(p.empresa_id, p.fase, p_destino) < app._ordem_etapa(p.empresa_id, p.fase, f.etapa_partes) then
      raise exception 'A negociação da parte começa em %: as etapas anteriores são do terreno todo',
        (select nome from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = f.etapa_partes) using errcode = '22023';
    end if;
  end if;
end $$;

create or replace function app._passagem(
  p_processo uuid, p_destino_tipo text, p_destino text, p_forcar boolean, p_comentario text, p_dados jsonb default '{}'::jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  p app.processos; pend jsonb; aprov jsonb; v_forcado boolean := false; v_pedido uuid; v_niveis text[]; n text;
  m app.membros; v_previsto uuid;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if p.status <> 'ativo' then raise exception 'O processo desta fase não está ativo' using errcode = '22023'; end if;
  if exists (select 1 from app.aprovacoes where processo_id = p.id and status = 'pendente') then
    raise exception 'Há um pedido de aprovação em aberto: aguarde a decisão ou cancele o pedido' using errcode = '22023';
  end if;
  perform app._conferir_movimento(p, p_destino_tipo, p_destino);

  pend := app._pendencias(p, p_destino_tipo, p_destino);
  if exists (select 1 from jsonb_array_elements(pend) i where (i->>'ok')::boolean is not true) then
    if not coalesce(p_forcar, false) then
      raise exception 'Ainda há pendências para avançar' using errcode = '22023', detail = pend::text;
    end if;
    -- só pendências "avança com justificativa" (jornada): qualquer editor passa justificando;
    -- as demais, só gestor e diretor (e nem eles com bloqueio_gestor)
    if exists (select 1 from jsonb_array_elements(pend) i where (i->>'ok')::boolean is not true and not coalesce((i->>'justifica')::boolean, false))
       and (not app.eh_gestor(p.empresa_id)
            or exists (select 1 from jsonb_array_elements(pend) i where (i->>'ok')::boolean is not true and (i->>'bloqueio_gestor')::boolean)) then
      raise exception 'Você não pode forçar este avanço' using errcode = '42501';
    end if;
    if coalesce(trim(p_comentario), '') = '' then raise exception 'Justifique o avanço forçado' using errcode = '22023'; end if;
    v_forcado := true;
  end if;

  aprov := app._aprovacoes_exigidas(p, p_destino_tipo, p_destino, auth.uid());
  select array_agg(x) into v_niveis from jsonb_array_elements_text(aprov->'niveis') x;
  if v_niveis is null then
    perform app._executar_passagem(p.id, p_destino_tipo, p_destino, v_forcado, p_comentario, p_dados);
    return jsonb_build_object('resultado', 'feito');
  end if;

  -- pedido: uma linha por nível; aprovador previsto pela hierarquia de quem pede
  v_pedido := gen_random_uuid();
  select * into m from app.membros where empresa_id = p.empresa_id and user_id = auth.uid();
  foreach n in array v_niveis loop
    v_previsto := case
      when n = 'gestor' and m.papel = 'analista' then m.superior_id
      when n = 'diretor' and m.papel = 'gestor' then m.superior_id
      when n = 'diretor' and m.papel = 'analista' then (select superior_id from app.membros where empresa_id = p.empresa_id and user_id = m.superior_id)
    end;
    insert into app.aprovacoes (pedido_id, empresa_id, processo_id, destino_tipo, destino, nivel, ordem, aprovador_previsto, pedido_por, dados)
    values (v_pedido, p.empresa_id, p.id, p_destino_tipo, p_destino, n,
            case when n = 'diretor' and aprov->>'modo' = 'sequencia' and 'gestor' = any(v_niveis) then 2 else 1 end,
            v_previsto, auth.uid(),
            p_dados || jsonb_build_object('forcado', v_forcado, 'comentario', p_comentario));
  end loop;
  perform app._avisar_aprovadores(v_pedido);
  return jsonb_build_object('resultado', 'aguardando_aprovacao', 'pedido_id', v_pedido, 'niveis', aprov->'niveis', 'modo', aprov->>'modo');
end $$;

-- O que falta para uma passagem (padrão: a próxima etapa, ou concluir a fase na última).
create or replace function app.checar_passagem(p_processo uuid, p_destino_tipo text default null, p_destino text default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  p app.processos; v_tipo text := p_destino_tipo; v_destino text := p_destino; v_nome text;
  itens jsonb; aprov jsonb; ped jsonb; gestor boolean;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(p.empresa_id);
  gestor := app.eh_gestor(p.empresa_id);
  select jsonb_build_object('pedido_id', a.pedido_id, 'destino_tipo', a.destino_tipo, 'destino', a.destino, 'destino_nome', a.destino_nome,
                            'aguardando', a.nivel, 'pedido_por', a.pedido_por_nome, 'pedido_em', a.pedido_em,
                            'aprovador_previsto', a.aprovador_previsto_nome, 'posso_decidir', app._pode_decidir(x, auth.uid()))
    into ped
    from app.v_aprovacoes a join app.aprovacoes x on x.id = a.id
   where a.processo_id = p.id and a.status = 'pendente' and a.na_vez order by a.ordem, a.nivel limit 1;
  if p.status <> 'ativo' then
    return jsonb_build_object('proxima', null, 'ok', false, 'pode_forcar', false, 'itens', '[]'::jsonb, 'aprovacoes', '[]'::jsonb, 'pedido', ped);
  end if;

  if v_tipo is null then
    select 'etapa', e2.codigo into v_tipo, v_destino
      from app.etapas_modelo e1 join app.etapas_modelo e2 on e2.empresa_id = e1.empresa_id and e2.fase = e1.fase and e2.ordem > e1.ordem
     where e1.empresa_id = p.empresa_id and e1.fase = p.fase and e1.codigo = p.etapa_atual
     order by e2.ordem limit 1;
    if v_destino is null then v_tipo := 'status'; v_destino := 'concluido'; end if;
  end if;
  v_nome := case v_tipo
    when 'etapa' then (select nome from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = v_destino)
    when 'subetapa' then (select nome from app.subetapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = v_destino)
    else (select nome from app.status_modelo where empresa_id = p.empresa_id and fase = p.fase and status = v_destino) end;

  itens := app._pendencias(p, v_tipo, v_destino);
  if ped is not null then
    itens := itens || jsonb_build_object('ok', false, 'tipo', 'aprovacao_pendente', 'bloqueio_gestor', true,
      'texto', 'Aguardando aprovação do ' || (ped->>'aguardando') || ' para ' || coalesce(ped->>'destino_nome', ped->>'destino'));
  end if;
  aprov := app._aprovacoes_exigidas(p, v_tipo, v_destino, auth.uid());

  return jsonb_build_object(
    'proxima', v_destino, 'proxima_tipo', v_tipo, 'proxima_nome', v_nome,
    'ok', not exists (select 1 from jsonb_array_elements(itens) i where (i->>'ok')::boolean is not true),
    'pode_forcar', gestor
      and exists (select 1 from jsonb_array_elements(itens) i where (i->>'ok')::boolean is not true)
      and not exists (select 1 from jsonb_array_elements(itens) i where (i->>'ok')::boolean is not true and (i->>'bloqueio_gestor')::boolean),
    -- só faltam itens "avança com justificativa": qualquer editor passa justificando
    'pode_justificar', exists (select 1 from jsonb_array_elements(itens) i where (i->>'ok')::boolean is not true)
      and not exists (select 1 from jsonb_array_elements(itens) i where (i->>'ok')::boolean is not true and not coalesce((i->>'justifica')::boolean, false)),
    'itens', itens,
    'aprovacoes', aprov->'niveis', 'aprovacao_modo', aprov->>'modo',
    'pedido', ped);
end $$;

create or replace function app.checar_avanco(p_processo uuid)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select app.checar_passagem(p_processo) $$;

-- Avança para a próxima etapa. Sair da última não é avanço: é concluir a fase (encerrar_processo).
create or replace function app.mover_etapa(p_processo uuid, p_forcar boolean default false, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_prox text; r jsonb;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  select e2.codigo into v_prox
    from app.etapas_modelo e1 join app.etapas_modelo e2 on e2.empresa_id = e1.empresa_id and e2.fase = e1.fase and e2.ordem > e1.ordem
   where e1.empresa_id = p.empresa_id and e1.fase = p.fase and e1.codigo = p.etapa_atual
   order by e2.ordem limit 1;
  if v_prox is null then raise exception 'Não há próxima etapa: na última, conclua a fase' using errcode = '22023'; end if;
  r := app._passagem(p.id, 'etapa', v_prox, p_forcar, p_comentario);
  return app.checar_passagem(p.id) || r;
end $$;

-- Arrastar no quadro de etapas. Para frente, passa por cada etapa com as
-- regras de mover_etapa (se uma falhar, nada muda; aprovação só na última).
-- Para trás, exige motivo e vai para o histórico como "retorno".
create or replace function app.mover_para_etapa(p_processo uuid, p_etapa text, p_forcar boolean default false, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; atual int; alvo int; r jsonb := jsonb_build_object('resultado', 'feito'); e record;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if p.status <> 'ativo' then raise exception 'O processo desta fase não está ativo' using errcode = '22023'; end if;
  select ordem into atual from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p.etapa_atual;
  select ordem into alvo  from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p_etapa;
  if alvo is null then raise exception 'Etapa inválida' using errcode = '22023'; end if;
  if alvo > atual then
    for e in select codigo, ordem from app.etapas_modelo
             where empresa_id = p.empresa_id and fase = p.fase and ordem > atual and ordem <= alvo order by ordem loop
      r := app._passagem(p.id, 'etapa', e.codigo, p_forcar, p_comentario);
      if r->>'resultado' = 'aguardando_aprovacao' and e.ordem < alvo then
        raise exception 'A passagem para % precisa de aprovação: avance uma etapa por vez', e.codigo using errcode = '22023';
      end if;
    end loop;
  elsif alvo < atual then
    if coalesce(trim(p_comentario), '') = '' then raise exception 'Informe o motivo para voltar de etapa' using errcode = '22023'; end if;
    if exists (select 1 from app.aprovacoes where processo_id = p.id and status = 'pendente') then
      raise exception 'Há um pedido de aprovação em aberto: aguarde a decisão ou cancele o pedido' using errcode = '22023';
    end if;
    perform app._conferir_movimento(p, 'etapa', p_etapa);
    perform app._executar_passagem(p.id, 'etapa', p_etapa, false, p_comentario);
  end if;
  return app.checar_passagem(p.id) || r;
end $$;

-- Troca a subetapa dentro da etapa atual (arrastar no kanban da etapa).
create or replace function app.mover_subetapa(p_processo uuid, p_subetapa text, p_forcar boolean default false, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; s app.subetapas_modelo; r jsonb;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  select * into s from app.subetapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p_subetapa;
  if not found or not s.ativo then raise exception 'Subetapa inválida' using errcode = '22023'; end if;
  if s.etapa <> p.etapa_atual then raise exception 'A subetapa é de outra etapa: mude a etapa primeiro' using errcode = '22023'; end if;
  if p_subetapa = p.subetapa_atual then return app.checar_passagem(p.id) || jsonb_build_object('resultado', 'sem_mudanca'); end if;
  r := app._passagem(p.id, 'subetapa', p_subetapa, p_forcar, p_comentario);
  return app.checar_passagem(p.id) || r;
end $$;

-- Encerramento da fase: concluído (na fase de entrada, Comprado), perdido,
-- descartado ou stand by, se o status existe na fase (status_modelo). O
-- processo guarda a etapa e a subetapa em que estava. Concluir só na última
-- etapa e conforme a aprovação configurada em status_modelo.
-- p_tarefas (Perdido e Descartado): 'arquivar' (padrão) as tarefas abertas da fase ou 'manter'.
create or replace function app.encerrar_processo(
  p_processo uuid, p_status text, p_motivo text default null, p_detalhe text default null, p_retomar_em date default null,
  p_pontos_sucesso text default null, p_forcar boolean default false, p_comentario text default null, p_tarefas text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; mo app.motivos_encerramento; ultima text; v_entrada boolean;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if not exists (select 1 from app.status_modelo where empresa_id = p.empresa_id and fase = p.fase and status = p_status) then
    raise exception 'Status inválido nesta fase' using errcode = '22023';
  end if;
  v_entrada := p.fase = app._fase_entrada(p.empresa_id);
  if p_status in ('perdido','descartado') then
    select * into mo from app.motivos_encerramento where empresa_id = p.empresa_id and status = p_status and codigo = p_motivo and ativo;
    if not found then raise exception 'Escolha o motivo na lista' using errcode = '22023'; end if;
    if p_status = 'perdido' and coalesce(trim(p_detalhe), '') = '' then raise exception 'Conte o que aconteceu (relato)' using errcode = '22023'; end if;
    if mo.exige_texto and coalesce(trim(p_detalhe), '') = '' then raise exception 'Descreva o motivo' using errcode = '22023'; end if;
  elsif p_motivo is not null then
    raise exception 'Motivo só para Perdido e Descartado' using errcode = '22023';
  end if;
  if p_status = 'concluido' then
    select codigo into ultima from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase order by ordem desc limit 1;
    if p.etapa_atual <> ultima then raise exception 'A fase se conclui na última etapa' using errcode = '22023'; end if;
    if v_entrada and p.parte_id is null and (coalesce(trim(p_detalhe), '') = '' or coalesce(trim(p_pontos_sucesso), '') = '') then
      raise exception 'Escreva o relato e os pontos de sucesso da compra' using errcode = '22023';
    end if;
    if coalesce(trim(p_detalhe), '') = '' then raise exception 'Escreva o relato da conclusão' using errcode = '22023'; end if;
  elsif p_pontos_sucesso is not null then
    raise exception 'Pontos de sucesso só na conclusão' using errcode = '22023';
  end if;
  if p_status = 'stand_by' then
    if p_retomar_em is null or p_retomar_em <= current_date then raise exception 'Informe uma data futura para retomar' using errcode = '22023'; end if;
    if coalesce(trim(p_detalhe), '') = '' then raise exception 'Justifique o stand by' using errcode = '22023'; end if;
  elsif p_retomar_em is not null then
    raise exception 'Data de retomada só para Stand By' using errcode = '22023';
  end if;
  if p_tarefas is not null and (p_status not in ('perdido','descartado') or p_tarefas not in ('arquivar','manter')) then
    raise exception 'Arquivar ou manter as tarefas só em Perdido e Descartado' using errcode = '22023';
  end if;
  return app._passagem(p.id, 'status', p_status, p_forcar, p_comentario,
    jsonb_strip_nulls(jsonb_build_object('motivo', p_motivo, 'detalhe', nullif(trim(p_detalhe), ''),
                                         'pontos_sucesso', nullif(trim(p_pontos_sucesso), ''), 'retomar_em', p_retomar_em,
                                         'tarefas', p_tarefas)));
end $$;

-- Volta para Ativo na mesma etapa e subetapa. O tempo parado não conta na
-- etapa nem na subetapa: as datas de entrada andam o tempo do stand by.
create or replace function app.retomar_processo(p_processo uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; parado interval;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if p.status <> 'stand_by' then raise exception 'Só negociações em stand by podem ser retomadas' using errcode = '22023'; end if;
  if p.principal_id is not null and (select status from app.processos where id = p.principal_id) <> 'ativo' then
    raise exception 'A negociação do terreno não está ativa: retome-a antes' using errcode = '22023';
  end if;
  parado := now() - p.data_encerramento;
  update app.processos set status = 'ativo', retomar_em = null, data_encerramento = null,
         motivo_encerramento = null, detalhe_encerramento = null,
         etapa_desde = etapa_desde + parado, subetapa_desde = subetapa_desde + parado where id = p.id;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa)
  values (p.empresa_id, p.id, 'retomada', p.etapa_atual, p.etapa_atual, p.subetapa_atual, p.subetapa_atual);
  -- as tarefas que o Stand By pausou voltam, com os prazos andando os dias parados (lote B)
  perform app._tarefas_ao_retomar(p.id);
  -- retomar o terreno retoma as partes paradas; retomar uma parte acerta o terreno
  if p.parte_id is null then
    perform app.retomar_processo(c.id) from app.processos c where c.principal_id = p.id and c.status = 'stand_by';
    -- parte cadastrada durante o Stand By ganha a negociação dela agora (revisão de 2/nov/2026)
    perform app._abrir_negociacoes_partes(p.id);
  else
    perform app._sincronizar_principal(p.principal_id);
  end if;
end $$;

-- Decide um pedido. Aprova de uma vez todas as linhas na vez que a pessoa
-- pode decidir (um diretor que aprova pelo gestor também cobre o nível de
-- diretor). Recusa encerra o pedido inteiro. Tudo aprovado: a passagem acontece.
create or replace function app.decidir_aprovacao(p_pedido uuid, p_aprovar boolean, p_comentario text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare a app.aprovacoes; decidiu boolean := false; v_primeira uuid; pend jsonb; p app.processos; v_texto text;
begin
  select * into a from app.aprovacoes where pedido_id = p_pedido order by ordem limit 1;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(a.empresa_id);
  perform 1 from app.aprovacoes where pedido_id = p_pedido for update;
  select * into p from app.processos where id = a.processo_id for update;
  if not exists (select 1 from app.aprovacoes where pedido_id = p_pedido and status = 'pendente') then
    raise exception 'Este pedido já foi decidido' using errcode = '22023';
  end if;

  if not coalesce(p_aprovar, false) then
    if coalesce(trim(p_comentario), '') = '' then raise exception 'Diga o motivo da recusa' using errcode = '22023'; end if;
    select * into a from app.aprovacoes x where x.pedido_id = p_pedido and x.status = 'pendente' and app._pode_decidir(x, auth.uid())
     order by x.ordem limit 1;
    if not found then raise exception 'Você não pode decidir este pedido' using errcode = '42501'; end if;
    update app.aprovacoes set status = 'recusado', decidido_por = auth.uid(), decidido_em = clock_timestamp(), comentario = p_comentario where id = a.id;
    update app.aprovacoes set status = 'cancelado', decidido_em = clock_timestamp() where pedido_id = p_pedido and status = 'pendente';
    perform app._notificar(a.empresa_id, a.pedido_por, 'aprovacao_decidida', 'Pedido recusado: ' || p_comentario, p.terreno_id, 'aprovacoes', a.id, current_date, auth.uid());
    return jsonb_build_object('resultado', 'recusado');
  end if;

  loop
    select * into a from app.aprovacoes x
     where x.pedido_id = p_pedido and x.status = 'pendente' and app._pode_decidir(x, auth.uid())
       and not exists (select 1 from app.aprovacoes o where o.pedido_id = x.pedido_id and o.status = 'pendente' and o.ordem < x.ordem)
     order by x.ordem, x.nivel limit 1;
    exit when not found;
    update app.aprovacoes set status = 'aprovado', decidido_por = auth.uid(), decidido_em = clock_timestamp(), comentario = p_comentario where id = a.id;
    decidiu := true;
  end loop;
  if not decidiu then raise exception 'Você não pode decidir este pedido agora' using errcode = '42501'; end if;

  if exists (select 1 from app.aprovacoes where pedido_id = p_pedido and status = 'pendente') then
    perform app._avisar_aprovadores(p_pedido);
    return jsonb_build_object('resultado', 'aprovado_parcial');
  end if;

  -- tudo aprovado: confere de novo as pendências (podem ter mudado) e executa
  select * into a from app.aprovacoes where pedido_id = p_pedido order by ordem, nivel limit 1;
  if p.status <> 'ativo' then raise exception 'O processo desta fase não está mais ativo' using errcode = '22023'; end if;
  if not coalesce((a.dados->>'forcado')::boolean, false) then
    pend := app._pendencias(p, a.destino_tipo, a.destino);
    if exists (select 1 from jsonb_array_elements(pend) i where (i->>'ok')::boolean is not true) then
      raise exception 'Surgiram pendências desde o pedido: recuse e peça de novo' using errcode = '22023', detail = pend::text;
    end if;
  end if;
  perform app._executar_passagem(p.id, a.destino_tipo, a.destino, coalesce((a.dados->>'forcado')::boolean, false),
                                 a.dados->>'comentario', a.dados, a.id, a.pedido_por);
  select destino_nome into v_texto from app.v_aprovacoes where id = a.id;
  perform app._notificar(a.empresa_id, a.pedido_por, 'aprovacao_decidida', 'Aprovado: ' || coalesce(v_texto, a.destino), p.terreno_id, 'aprovacoes', a.id, current_date, auth.uid());
  return jsonb_build_object('resultado', 'aprovado');
end $$;

-- Quem pediu (ou quem pode decidir) desiste do pedido.
create or replace function app.cancelar_aprovacao(p_pedido uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare a app.aprovacoes;
begin
  select * into a from app.aprovacoes where pedido_id = p_pedido and status = 'pendente' order by ordem limit 1;
  if not found then raise exception 'Não há pedido em aberto' using errcode = 'P0002'; end if;
  perform app.exigir_editor(a.empresa_id);
  if a.pedido_por <> auth.uid()
     and not exists (select 1 from app.aprovacoes x where x.pedido_id = p_pedido and x.status = 'pendente' and app._pode_decidir(x, auth.uid())) then
    raise exception 'Só quem pediu ou quem aprova cancela o pedido' using errcode = '42501';
  end if;
  update app.aprovacoes set status = 'cancelado', decidido_por = auth.uid(), decidido_em = clock_timestamp() where pedido_id = p_pedido and status = 'pendente';
end $$;

-- ---------------------------------------------------------------------
-- Partes do terreno (vários donos negociando separado)
--
-- Com duas ou mais partes ativas, quando a negociação do terreno (fase de
-- entrada) chega à etapa da divisão (fases_modelo.etapa_partes), cada parte
-- ganha a sua negociação: um processo da mesma fase com parte_id e
-- principal_id, com oferta, propostas, documentos, subetapa, status e
-- histórico próprios (a temperatura é uma só, a da negociação do terreno). A partir daí a negociação do terreno não se
-- move à mão: fica na etapa e na subetapa da parte mais atrasada
-- (_sincronizar_principal) e só fica Comprado com todas as partes ativas
-- compradas. Parte perdida sai do terreno (remover_parte) ou o terreno se
-- encerra; encerrar o terreno encerra as partes em aberto.
-- ---------------------------------------------------------------------
create or replace function app._ordem_etapa(p_empresa uuid, p_fase text, p_etapa text)
returns int
language sql stable security definer set search_path = ''
as $$ select ordem from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_etapa $$;

-- A negociação do terreno anda pelas partes?
create or replace function app._tem_partes(p_processo uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.processos where principal_id = p_processo) $$;

-- Etapa e subetapa da negociação do terreno = as da parte mais atrasada em
-- aberto (sem nenhuma em aberto, a mais adiantada das compradas). Cada
-- mudança vira uma transição, como qualquer passagem.
create or replace function app._sincronizar_principal(p_principal uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_etapa text; v_sub text; ordem_atual int; ordem_nova int;
begin
  select * into p from app.processos where id = p_principal for update;
  if not found or p.status <> 'ativo' then return; end if;
  select c.etapa_atual, c.subetapa_atual into v_etapa, v_sub
    from app.processos c
    join app.terreno_partes tp on tp.id = c.parte_id and tp.ativa
    join app.etapas_modelo e on e.empresa_id = c.empresa_id and e.fase = c.fase and e.codigo = c.etapa_atual
    join app.subetapas_modelo s on s.empresa_id = c.empresa_id and s.fase = c.fase and s.codigo = c.subetapa_atual
   where c.principal_id = p.id and c.status in ('ativo','stand_by')
   order by e.ordem, s.ordem limit 1;
  if v_etapa is null then
    select c.etapa_atual, c.subetapa_atual into v_etapa, v_sub
      from app.processos c
      join app.terreno_partes tp on tp.id = c.parte_id and tp.ativa
      join app.etapas_modelo e on e.empresa_id = c.empresa_id and e.fase = c.fase and e.codigo = c.etapa_atual
      join app.subetapas_modelo s on s.empresa_id = c.empresa_id and s.fase = c.fase and s.codigo = c.subetapa_atual
     where c.principal_id = p.id and c.status = 'concluido'
     order by e.ordem desc, s.ordem desc limit 1;
  end if;
  if v_etapa is null or (v_etapa = p.etapa_atual and v_sub = p.subetapa_atual) then return; end if;
  ordem_atual := app._ordem_etapa(p.empresa_id, p.fase, p.etapa_atual);
  ordem_nova  := app._ordem_etapa(p.empresa_id, p.fase, v_etapa);
  if v_etapa <> p.etapa_atual then
    update app.processos set etapa_atual = v_etapa, etapa_desde = now(), subetapa_atual = v_sub, subetapa_desde = now() where id = p.id;
  else
    update app.processos set subetapa_atual = v_sub, subetapa_desde = now() where id = p.id;
  end if;
  insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa, comentario)
  values (p.empresa_id, p.id,
          case when ordem_nova > ordem_atual then 'avanco' when ordem_nova < ordem_atual then 'retorno' else 'subetapa' end,
          p.etapa_atual, v_etapa, p.subetapa_atual, v_sub, 'Pelas negociações das partes');
  -- as tarefas da etapa acompanham, como numa passagem à mão (revisão de 2/nov/2026)
  if ordem_nova > ordem_atual then perform app._tarefas_ao_entrar(p.id, 'etapa', v_etapa);
  elsif ordem_nova < ordem_atual then perform app._tarefas_ao_voltar(p.id, ordem_nova);
  elsif app._ordem_subetapa(p.empresa_id, p.fase, v_sub) > app._ordem_subetapa(p.empresa_id, p.fase, p.subetapa_atual) then
    perform app._tarefas_ao_entrar(p.id, 'subetapa', v_sub);
  end if;
  perform app._abrir_fases_liberadas(p.terreno_id);
end $$;

-- Abre a negociação de cada parte ativa que ainda não tem uma, quando a do
-- terreno está ativa, na etapa da divisão ou depois, e há duas ou mais partes.
create or replace function app._abrir_negociacoes_partes(p_principal uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; f app.fases_modelo; n app.negociacoes; tp record; v_id uuid; v_sub text; v_seq int; v_oferta uuid;
begin
  select * into p from app.processos where id = p_principal;
  if not found or p.status <> 'ativo' or p.parte_id is not null then return; end if;
  select * into f from app.fases_modelo where empresa_id = p.empresa_id and codigo = p.fase;
  if f.etapa_partes is null or app._ordem_etapa(p.empresa_id, p.fase, p.etapa_atual) < app._ordem_etapa(p.empresa_id, p.fase, f.etapa_partes) then return; end if;
  if (select count(*) from app.terreno_partes where terreno_id = p.terreno_id and ativa) < 2 then return; end if;
  select * into n from app.negociacoes where processo_id = p.id;
  v_sub := app._subetapa_inicial(p.empresa_id, p.fase, f.etapa_partes);
  for tp in select x.* from app.terreno_partes x
            where x.terreno_id = p.terreno_id and x.ativa
              and not exists (select 1 from app.processos c where c.principal_id = p.id and c.parte_id = x.id)
            order by x.criado_em, x.nome loop
    select count(*) + 1 into v_seq from app.processos where principal_id = p.id;
    -- oferta de referência: a mais recente que cobre a parte; senão, a do terreno
    select o.id into v_oferta from app.oferta_partes op join app.ofertas o on o.id = op.oferta_id
     where op.parte_id = tp.id order by (o.status = 'ativa') desc, o.data_oferta desc, o.criado_em desc limit 1;
    insert into app.processos (empresa_id, codigo, terreno_id, fase, etapa_atual, subetapa_atual, responsavel_id, parte_id, principal_id)
    values (p.empresa_id, p.codigo || '-' || v_seq, p.terreno_id, p.fase, f.etapa_partes, v_sub, p.responsavel_id, tp.id, p.id)
    returning id into v_id;
    -- sem temperatura: ela é uma só, a da negociação do terreno
    insert into app.negociacoes (processo_id, empresa_id, oferta_referencia_id)
    values (v_id, p.empresa_id, coalesce(v_oferta, n.oferta_referencia_id));
    insert into app.processo_transicoes (empresa_id, processo_id, evento, para_etapa, para_subetapa, comentario)
    values (p.empresa_id, v_id, 'abertura', f.etapa_partes, v_sub, 'Negociação da parte ' || tp.nome);
  end loop;
  perform app._sincronizar_principal(p.id);
end $$;

-- Cadastra ou altera uma parte. p_dados: nome, essencial, poligono, area_m2,
-- observacoes. Tornar uma parte dispensável é com gestor ou diretor (é o
-- passo antes de tirá-la). O pedaço fica dentro do terreno (5 m de folga).
create or replace function app.salvar_parte(p_terreno uuid, p_parte uuid, p_dados jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; tp app.terreno_partes; v_id uuid; v_poli jsonb; v_principal uuid;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  perform app._chaves_permitidas(p_dados, array['nome','essencial','poligono','area_m2','observacoes','pessoa_nome','telefone','email','documento']);
  -- contato da parte: confere e normaliza antes de gravar (vazio apaga)
  if p_dados ? 'telefone' then p_dados := jsonb_set(p_dados, '{telefone}', coalesce(to_jsonb(fluxo.validar_formato('telefone', p_dados->>'telefone')), 'null')); end if;
  if p_dados ? 'email' then p_dados := jsonb_set(p_dados, '{email}', coalesce(to_jsonb(fluxo.validar_formato('email', p_dados->>'email')), 'null')); end if;
  if p_dados ? 'documento' then
    p_dados := jsonb_set(p_dados, '{documento}', coalesce(to_jsonb(fluxo.validar_formato(
      case when length(regexp_replace(coalesce(p_dados->>'documento', ''), '\D', '', 'g')) > 11 then 'cnpj' else 'cpf' end, p_dados->>'documento')), 'null'));
  end if;
  v_poli := case when jsonb_typeof(p_dados->'poligono') = 'object' then p_dados->'poligono' end;
  if v_poli is not null then
    if not app.geojson_poligono_valido(v_poli) then raise exception 'Poligonal da parte inválida' using errcode = '22023'; end if;
    if extensions.st_area(extensions.st_difference(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(v_poli::text), 4326)),
                                                   extensions.st_buffer(t.poligono::extensions.geography, 5)::extensions.geometry)::extensions.geography) >= 1 then
      raise exception 'A área da parte passa da poligonal do terreno' using errcode = '22023';
    end if;
  end if;
  if p_parte is null then
    if coalesce(trim(p_dados->>'nome'), '') = '' then raise exception 'Dê um nome à parte (o dono ou os donos)' using errcode = '22023'; end if;
    if (p_dados->>'essencial')::boolean is false and not app.eh_gestor(t.empresa_id) then
      raise exception 'Só gestor ou diretor marca uma parte como dispensável' using errcode = '42501';
    end if;
    insert into app.terreno_partes (empresa_id, terreno_id, nome, essencial, poligono_geojson, area_m2, observacoes,
                                    pessoa_nome, telefone, email, documento)
    values (t.empresa_id, t.id, trim(p_dados->>'nome'), coalesce((p_dados->>'essencial')::boolean, true), v_poli,
            (p_dados->>'area_m2')::numeric, nullif(trim(p_dados->>'observacoes'), ''),
            nullif(trim(p_dados->>'pessoa_nome'), ''), p_dados->>'telefone', p_dados->>'email', p_dados->>'documento')
    returning id into v_id;
    -- negociação do terreno já na etapa da divisão: a parte nova ganha a sua
    select id into v_principal from app.processos
     where terreno_id = t.id and parte_id is null and fase = app._fase_entrada(t.empresa_id) and status = 'ativo';
    if v_principal is not null then perform app._abrir_negociacoes_partes(v_principal); end if;
    return v_id;
  end if;
  select * into tp from app.terreno_partes where id = p_parte and terreno_id = t.id for update;
  if not found then raise exception 'Parte não encontrada' using errcode = 'P0002'; end if;
  if not tp.ativa then raise exception 'A parte já saiu do terreno' using errcode = '22023'; end if;
  if tp.essencial and (p_dados->>'essencial')::boolean is false and not app.eh_gestor(t.empresa_id) then
    raise exception 'Só gestor ou diretor marca uma parte como dispensável' using errcode = '42501';
  end if;
  update app.terreno_partes set
    nome             = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    essencial        = coalesce((p_dados->>'essencial')::boolean, essencial),
    poligono_geojson = case when p_dados ? 'poligono' then v_poli else poligono_geojson end,
    area_m2          = case when p_dados ? 'area_m2' then (p_dados->>'area_m2')::numeric else area_m2 end,
    observacoes      = case when p_dados ? 'observacoes' then nullif(trim(p_dados->>'observacoes'), '') else observacoes end,
    pessoa_nome      = case when p_dados ? 'pessoa_nome' then nullif(trim(p_dados->>'pessoa_nome'), '') else pessoa_nome end,
    telefone         = case when p_dados ? 'telefone' then p_dados->>'telefone' else telefone end,
    email            = case when p_dados ? 'email' then p_dados->>'email' else email end,
    documento        = case when p_dados ? 'documento' then p_dados->>'documento' else documento end
  where id = tp.id;
  return tp.id;
end $$;

-- Tira a parte do terreno (o dono não vende, ou a área mudou). A negociação
-- dela tem que estar encerrada; parte essencial só sai com gestor ou diretor.
-- As matrículas e as inscrições dela ficam sem parte (voltam para o quadro de
-- cima da aba Terreno; a auditoria guarda o vínculo antigo).
create or replace function app.remover_parte(p_parte uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare tp app.terreno_partes; v_principal uuid;
begin
  select * into tp from app.terreno_partes where id = p_parte for update;
  if not found then raise exception 'Parte não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(tp.empresa_id);
  if not tp.ativa then raise exception 'A parte já saiu do terreno' using errcode = '22023'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Diga por que a parte sai do terreno' using errcode = '22023'; end if;
  if tp.essencial and not app.eh_gestor(tp.empresa_id) then
    raise exception 'Só gestor ou diretor tira uma parte essencial' using errcode = '42501';
  end if;
  if exists (select 1 from app.processos where parte_id = tp.id and status in ('ativo','stand_by')) then
    raise exception 'A negociação desta parte está em aberto: encerre-a antes' using errcode = '22023';
  end if;
  if exists (select 1 from app.processos where parte_id = tp.id and status = 'concluido') then
    raise exception 'Esta parte já foi comprada' using errcode = '22023';
  end if;
  perform app._parte_pode_sair(tp);
  delete from app.inscricao_partes where parte_id = tp.id;
  delete from app.matricula_partes where parte_id = tp.id;
  update app.terreno_partes set ativa = false, removida_em = now(), motivo_remocao = trim(p_motivo) where id = tp.id;
  for v_principal in select distinct principal_id from app.processos where parte_id = tp.id and principal_id is not null loop
    perform app._sincronizar_principal(v_principal);
  end loop;
end $$;

-- O terreno fica sempre com uma parte.
create or replace function app._parte_pode_sair(tp app.terreno_partes)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from app.terreno_partes where terreno_id = tp.terreno_id and ativa and id <> tp.id) then
    raise exception 'O terreno precisa de pelo menos uma parte' using errcode = '22023';
  end if;
end $$;

-- Exclui a parte cadastrada por engano: só a que não tem corretor, oferta, proposta nem negociação.
-- As etiquetas e as pessoas dela saem (a matrícula, o SQL e o cadastro da pessoa ficam). A que tem história sai por remover_parte.
create or replace function app.excluir_parte(p_parte uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare tp app.terreno_partes;
begin
  select * into tp from app.terreno_partes where id = p_parte for update;
  if not found then raise exception 'Parte não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(tp.empresa_id);
  perform app._parte_pode_sair(tp);
  if exists (select 1 from app.parte_corretores where parte_id = tp.id)
     or exists (select 1 from app.oferta_partes where parte_id = tp.id) or exists (select 1 from app.processos where parte_id = tp.id)
     or exists (select 1 from app.proposta_partes where parte_id = tp.id) then
    raise exception 'A parte % já tem histórico: tire-a do terreno com um motivo', tp.nome using errcode = '22023';
  end if;
  delete from app.inscricao_partes where parte_id = tp.id;
  delete from app.matricula_partes where parte_id = tp.id;
  delete from app.terreno_pessoas where parte_id = tp.id;
  delete from app.terreno_partes where id = tp.id;
end $$;

-- Encerrar a negociação do terreno leva junto as partes em aberto: perdido
-- e descartado com o mesmo motivo, stand by com a mesma data de retomada.
create or replace function app._encerrar_partes(p app.processos, p_status text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare c app.processos;
begin
  for c in select * from app.processos where principal_id = p.id
             and (status = 'ativo' or (status = 'stand_by' and p_status <> 'stand_by'))
           for update loop
    update app.aprovacoes set status = 'cancelado', decidido_em = clock_timestamp(), comentario = 'Negociação do terreno encerrada'
     where processo_id = c.id and status = 'pendente';
    update app.processos set status = p_status,
           motivo_encerramento  = p_dados->>'motivo',
           detalhe_encerramento = 'Com a negociação do terreno: ' || (p_dados->>'detalhe'),
           retomar_em           = (p_dados->>'retomar_em')::date,
           data_encerramento    = now()
     where id = c.id;
    insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa, comentario)
    values (c.empresa_id, c.id, case p_status when 'perdido' then 'perda' when 'descartado' then 'descarte' else 'stand_by' end,
            c.etapa_atual, c.etapa_atual, c.subetapa_atual, c.subetapa_atual, 'Com a negociação do terreno (' || p.codigo || ')');
    perform app._tarefas_ao_encerrar(c.id, p_status, p_dados);
  end loop;
end $$;

-- Etiquetas das partes com a fração de cada uma no lote (pedido do Moisés, 6/nov/2026): o percentual
-- informado; sem ele, o que sobra dos informados dividido igual entre as etiquetas sem percentual
-- (estimada). Uma etiqueta só, sem percentual, é o lote inteiro.
create view app.v_etiquetas with (security_invoker = true) as
select x.*, coalesce(x.percentual / 100, greatest(0, 1 - coalesce(x.soma_informada, 0) / 100) / nullif(x.sem_percentual, 0)) as fracao,
       x.percentual is null and x.copias > 1 as fracao_estimada
from (
  select 'matricula'::text as tipo, c.id, c.empresa_id, c.terreno_id, c.parte_id, c.matricula_id as lote_id, c.percentual, null::uuid as matricula_parte_id,
         m.area_registrada_m2 as area_lote_m2,
         sum(c.percentual) over w as soma_informada, count(*) filter (where c.percentual is null) over w as sem_percentual, count(*) over w as copias
  from app.matricula_partes c join app.matriculas m on m.id = c.matricula_id
  window w as (partition by c.matricula_id)
  union all
  select 'inscricao', c.id, c.empresa_id, c.terreno_id, c.parte_id, c.inscricao_id, c.percentual, c.matricula_parte_id,
         i.area_cadastral_m2,
         sum(c.percentual) over w, count(*) filter (where c.percentual is null) over w, count(*) over w
  from app.inscricao_partes c join app.inscricoes_municipais i on i.id = c.inscricao_id
  window w as (partition by c.inscricao_id)
) x;
grant select on app.v_etiquetas to authenticated;

-- Cada parte com a sua negociação, para a ficha e o quadro.
create view app.v_partes with (security_invoker = true) as
select tp.id, tp.empresa_id, tp.terreno_id, tp.nome, tp.essencial, tp.area_m2, tp.poligono_geojson, tp.observacoes,
       tp.ativa, tp.removida_em, tp.motivo_remocao, tp.pessoa_nome, tp.telefone, tp.email, tp.documento,
       -- área da parte (o que o Comercial mostra ao lado do valor pedido; pedido do Moises, 6/nov/2026): a soma, nos
       -- SQLs da parte, da área cadastral × a fração da parte no SQL × a fração da parte na matrícula em que ele está
       -- (v_etiquetas), quando todos têm área cadastral; sem SQL, a das matrículas, quando todas têm área
       ar.area_m2 as area_partes_m2, ar.area_fonte,
       ar.area_matriculas_m2, ar.area_cadastral_m2,
       -- Matrícula × Prefeitura da parte: área cadastral dos SQLs contra a das matrículas, em % da matrícula
       round((ar.area_cadastral_m2 - ar.area_matriculas_m2) / nullif(ar.area_matriculas_m2, 0) * 100, 1) as divergencia_cadastral_pct,
       -- zonas da última consulta de cada SQL da parte
       (select array_agg(distinct z->>'sigla' order by z->>'sigla') from app.inscricoes_municipais i
          cross join lateral (select c.zonas from app.consultas_lote c where c.inscricao_id = i.id order by c.consultado_em desc limit 1) c
          cross join jsonb_array_elements(c.zonas) z
          where i.id in (select inscricao_id from app.inscricao_partes where parte_id = tp.id) and z->>'sigla' is not null) as zonas,
       (select count(*) from app.matricula_partes m where m.parte_id = tp.id) as qtd_matriculas,
       (select count(*) from app.inscricao_partes i where i.parte_id = tp.id) as qtd_inscricoes,
       (select string_agg(pe.nome_razao_social, ', ' order by pe.nome_razao_social) from app.terreno_pessoas x
         join app.pessoas pe on pe.id = x.pessoa_id where x.parte_id = tp.id and x.papel = 'proprietario') as proprietarios,
       (select string_agg(pe.nome_razao_social, ', ' order by pe.nome_razao_social) from app.parte_corretores x
         join app.corretores co on co.id = x.corretor_id join app.pessoas pe on pe.id = co.pessoa_id where x.parte_id = tp.id) as corretores,
       c.id as processo_id, c.codigo as processo_codigo, c.principal_id, c.status, stm.nome as status_nome,
       c.etapa_atual, e.nome as etapa_nome, e.ordem as etapa_ordem, c.subetapa_atual, s.nome as subetapa_nome, s.ordem as subetapa_ordem,
       (current_date - c.subetapa_desde::date) as dias_na_subetapa,
       coalesce(c.status = 'ativo' and now() - c.subetapa_desde > make_interval(days => s.prazo_dias), false) as subetapa_atrasada,
       c.motivo_encerramento, mo.nome as motivo_encerramento_nome, c.retomar_em, c.responsavel_id,
       -- preço pedido da parte: o informado na oferta, ou o da oferta inteira quando ela cobre só esta parte
       case when op.parte_id is not null then
         coalesce(op.valor_pedido, case when (select count(*) from app.oferta_partes y where y.oferta_id = o.id) = 1 then o.valor_pedido end) end as valor_pedido,
       case when op.parte_id is not null then coalesce(op.forma_pagamento, o.forma_pagamento_pedida) end as forma_pagamento,
       lp.valor_total as ultima_proposta_valor, lp.origem as ultima_proposta_origem, lp.status as ultima_proposta_status,
       ap.nivel as aprovacao_aguardando
from app.terreno_partes tp
cross join lateral (
  select m.area_matriculas_m2, i.area_cadastral_m2,
         case when i.qtd > 0 then i.area_cadastral_m2 when m.qtd > 0 then m.area_matriculas_m2 end as area_m2,
         case when i.qtd > 0 and i.area_cadastral_m2 is not null then 'inscricoes'
              when i.qtd = 0 and m.area_matriculas_m2 is not null then 'matriculas' end as area_fonte
  from (select count(*) as qtd, case when count(*) filter (where area_lote_m2 is null) = 0 then round(sum(area_lote_m2 * fracao), 2) end as area_matriculas_m2
          from app.v_etiquetas where tipo = 'matricula' and parte_id = tp.id) m,
       (select count(*) as qtd, case when count(*) filter (where e.area_lote_m2 is null) = 0 then round(sum(e.area_lote_m2 * e.fracao * coalesce(em.fracao, 1)), 2) end as area_cadastral_m2
          from app.v_etiquetas e left join app.v_etiquetas em on em.tipo = 'matricula' and em.id = e.matricula_parte_id
          where e.tipo = 'inscricao' and e.parte_id = tp.id) i
) ar
left join lateral (
  select x.* from app.processos x where x.parte_id = tp.id
  order by (x.status in ('ativo','stand_by')) desc, x.data_inicio desc limit 1
) c on true
left join app.status_modelo stm on stm.empresa_id = c.empresa_id and stm.fase = c.fase and stm.status = c.status
left join app.etapas_modelo e on e.empresa_id = c.empresa_id and e.fase = c.fase and e.codigo = c.etapa_atual
left join app.subetapas_modelo s on s.empresa_id = c.empresa_id and s.fase = c.fase and s.codigo = c.subetapa_atual
left join app.motivos_encerramento mo on mo.empresa_id = c.empresa_id and mo.status = c.status and mo.codigo = c.motivo_encerramento
left join app.negociacoes n on n.processo_id = c.id
left join app.ofertas o on o.id = n.oferta_referencia_id
left join app.oferta_partes op on op.oferta_id = o.id and op.parte_id = tp.id
left join lateral (select * from app.propostas x where x.processo_id = c.id order by versao desc limit 1) lp on true
left join lateral (
  select a.nivel from app.aprovacoes a where a.processo_id = c.id and a.status = 'pendente' order by a.ordem, a.nivel limit 1
) ap on true;
grant select on app.v_partes to authenticated;

-- ---------------------------------------------------------------------
-- Propostas (pedidos do Moises, 9/nov/2026). Toda proposta é feita a uma ou
-- mais partes ativas do terreno (app.proposta_partes): com uma parte só, ela
-- entra sozinha; com mais de uma, escolher é obrigatório; na negociação de uma
-- parte (processo com parte_id), é a parte dela. Nenhuma proposta mexe em
-- outra: a nova não recusa nem substitui as abertas, mesmo das mesmas partes.
-- A tela avisa quando há propostas em aberto com parte em comum, e quem edita
-- decide (muda o status de qualquer uma, exclui uma ou deixa as duas). Nos
-- resumos do terreno vale a última feita (maior versão). proposta_anterior_id
-- guarda, só para leitura, a mais recente com parte em comum (ou sem parte
-- informada, a antiga).
-- ---------------------------------------------------------------------
drop function if exists app.registrar_proposta(uuid, text, numeric, text, text, date, date, text);
create or replace function app.registrar_proposta(
  p_processo uuid, p_origem text, p_valor numeric, p_forma text,
  p_condicoes text default null, p_data_apresentacao date default current_date,
  p_validade date default null, p_status text default 'apresentada', p_partes uuid[] default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_ant uuid; v_id uuid; v_partes uuid[]; v_ativas uuid[];
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if p.fase is distinct from app._fase_entrada(p.empresa_id) then raise exception 'Proposta só na negociação (fase de entrada)' using errcode = '22023'; end if;
  if p.status <> 'ativo' then raise exception 'A negociação não está ativa' using errcode = '22023'; end if;
  if p_status not in ('rascunho','apresentada','em_analise') then raise exception 'Uma proposta nova começa como rascunho, apresentada ou em análise' using errcode = '22023'; end if;

  -- as partes da proposta
  select array_agg(id) into v_ativas from app.terreno_partes where terreno_id = p.terreno_id and ativa;
  v_partes := (select array_agg(distinct x) from unnest(p_partes) x where x is not null);
  if p.parte_id is not null then
    if v_partes is not null and v_partes <> array[p.parte_id] then
      raise exception 'Na negociação de uma parte, a proposta é só dela' using errcode = '22023';
    end if;
    v_partes := array[p.parte_id];
  elsif v_partes is null then
    if v_ativas is null then raise exception 'O terreno não tem parte: cadastre uma na aba Terreno' using errcode = '22023'; end if;
    if cardinality(v_ativas) > 1 then raise exception 'Escolha para qual parte é a proposta' using errcode = '22023'; end if;
    v_partes := v_ativas;
  end if;
  if not v_partes <@ coalesce(v_ativas, '{}') then
    raise exception 'A proposta só pode ser feita a partes ativas deste terreno' using errcode = '22023';
  end if;

  -- só para leitura: a mais recente com parte em comum (ou sem parte informada)
  select x.id into v_ant from app.propostas x where x.processo_id = p.id
     and (not exists (select 1 from app.proposta_partes pp where pp.proposta_id = x.id)
          or exists (select 1 from app.proposta_partes pp where pp.proposta_id = x.id and pp.parte_id = any(v_partes)))
   order by x.versao desc limit 1;

  insert into app.propostas (empresa_id, processo_id, versao, origem, proposta_anterior_id, data_apresentacao, validade,
                             valor_total, forma_pagamento, condicoes_pagamento, status, viabilidade_id)
  values (p.empresa_id, p.id, coalesce((select max(versao) from app.propostas where processo_id = p.id), 0) + 1, p_origem, v_ant,
          p_data_apresentacao, p_validade, p_valor, p_forma, p_condicoes, p_status, p.viabilidade_id)
  returning id into v_id;
  insert into app.proposta_partes (proposta_id, parte_id, empresa_id) select v_id, x, p.empresa_id from unnest(v_partes) x;
  return v_id;
end $$;

-- Qualquer proposta muda de status, a qualquer momento: nenhuma muda sozinha.
create or replace function app.atualizar_status_proposta(p_proposta uuid, p_status text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare x app.propostas;
begin
  select * into x from app.propostas where id = p_proposta;
  if not found then raise exception 'Proposta não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(x.empresa_id);
  update app.propostas set status = p_status where id = x.id;
end $$;

-- Exclui a proposta (decisão do Moises, 9/nov/2026: com duas em aberto para a mesma
-- parte, quem edita pode apagar uma). A versão das outras não muda; quem apontava
-- para ela passa a apontar para a anterior dela. O registro fica no log (auditoria).
-- Proposta com documento não se exclui.
create or replace function app.excluir_proposta(p_proposta uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare x app.propostas;
begin
  select * into x from app.propostas where id = p_proposta for update;
  if not found then raise exception 'Proposta não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(x.empresa_id);
  if exists (select 1 from app.documentos where proposta_id = x.id) then
    raise exception 'A proposta v% tem documento: mude o status em vez de excluir', x.versao using errcode = '22023';
  end if;
  update app.propostas set proposta_anterior_id = x.proposta_anterior_id where proposta_anterior_id = x.id;
  delete from app.propostas where id = x.id;
end $$;

-- ---------------------------------------------------------------------
-- Viabilidade
-- ---------------------------------------------------------------------
create or replace function app.vincular_viabilidade(
  p_processo uuid, p_nome text, p_vgv numeric, p_margem_pct numeric, p_bkm_id uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_id uuid;
begin
  select * into p from app.processos where id = p_processo for update;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  insert into app.viabilidades (empresa_id, terreno_id, bkm_viabilidade_id, nome, vgv, margem_pct)
  values (p.empresa_id, p.terreno_id, p_bkm_id, p_nome, p_vgv, p_margem_pct) returning id into v_id;
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
  p_nome text default null, p_tamanho bigint default null, p_emitido_em date default current_date,
  p_reuniao uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; td app.tipos_documento; d app.documentos; v_ver int;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
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
  if (p_tipo = 'ata_reuniao') <> (p_reuniao is not null) then
    raise exception 'Ata de reunião vai sempre ligada a uma reunião, e só ela' using errcode = '22023';
  end if;
  if p_reuniao is not null and not exists (select 1 from app.reunioes where id = p_reuniao and terreno_id = t.id and status = 'realizada') then
    raise exception 'A ata exige uma reunião realizada deste terreno' using errcode = '22023';
  end if;

  if p_documento is not null then
    select * into d from app.documentos where id = p_documento and terreno_id = t.id for update;
    if not found then raise exception 'Documento não encontrado' using errcode = 'P0002'; end if;
  elsif p_reuniao is not null then
    select * into d from app.documentos where reuniao_id = p_reuniao and tipo_documento = p_tipo for update;
  elsif td.unico_por_processo and p_processo is not null then
    select * into d from app.documentos where processo_id = p_processo and tipo_documento = p_tipo for update;
  end if;

  if d.id is null then
    insert into app.documentos (empresa_id, terreno_id, processo_id, proposta_id, reuniao_id, tipo_documento, nome, emitido_em)
    values (t.empresa_id, t.id, coalesce(p_processo, (select processo_id from app.reunioes where id = p_reuniao)), p_proposta, p_reuniao,
            p_tipo, coalesce(nullif(trim(p_nome),''), td.nome), p_emitido_em)
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
  perform app.exigir_editor(d.empresa_id);
  -- quem enviou a versão atual não a valida sozinho; o diretor pode (decisão do Moisés, 2/nov/2026)
  if p_aprovado and auth.uid() = (select enviado_por from app.documento_versoes where documento_id = d.id order by versao desc limit 1)
     and app.papel(d.empresa_id) is distinct from 'diretor' then
    raise exception 'Quem enviou o documento não o valida: peça a outra pessoa' using errcode = '42501';
  end if;
  update app.documentos set situacao = case when p_aprovado then 'validado' else 'rejeitado' end,
         revisado_por = auth.uid(), revisado_em = now() where id = d.id;
end $$;

-- ---------------------------------------------------------------------
-- Salvar ficha do terreno com controle de edição simultânea.
-- p_versao é a versão que a tela carregou; se mudou, outra pessoa salvou antes.
-- Só os campos enviados em p_dados mudam; os de controle são ignorados.
-- ---------------------------------------------------------------------
-- Grava a busca do entorno feita no navegador (Places + rota a pé), trocando a anterior.
-- Recusa coordenada diferente da atual do terreno; descarta categoria inativa ou
-- desconhecida e lugar além do raio a pé da categoria; o mesmo lugar entra uma vez.
-- p_itens: [{categoria, google_place_id, nome, latitude, longitude, distancia_pe_m, duracao_pe_s, distancia_reta_m}]
create or replace function app.salvar_entorno(p_terreno uuid, p_latitude double precision, p_longitude double precision,
                                              p_itens jsonb, p_rota_a_pe boolean default true)
returns int
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; n int; v_excl jsonb;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if t.latitude is null then raise exception 'O terreno não está localizado' using errcode = '23514'; end if;
  if abs(t.latitude - p_latitude) > 1e-7 or abs(t.longitude - p_longitude) > 1e-7 then
    raise exception 'A localização do terreno mudou durante a busca; busque de novo' using errcode = 'PT409';
  end if;
  if jsonb_typeof(coalesce(p_itens, '[]')) <> 'array' then raise exception 'Itens devem ser uma lista' using errcode = '22023'; end if;

  -- o que o usuário excluiu neste terreno continua excluído na busca nova
  select coalesce(jsonb_object_agg(google_place_id, jsonb_build_object('em', excluido_em, 'por', excluido_por)), '{}') into v_excl
  from app.terreno_entorno where terreno_id = p_terreno and excluido_em is not null;
  delete from app.terreno_entorno where terreno_id = p_terreno;
  insert into app.terreno_entorno (empresa_id, terreno_id, categoria, google_place_id, nome, latitude, longitude,
                                   distancia_pe_m, duracao_pe_s, distancia_reta_m, excluido_em, excluido_por)
  select distinct on (i.google_place_id) t.empresa_id, p_terreno, i.categoria, i.google_place_id, trim(i.nome), i.latitude, i.longitude,
         i.distancia_pe_m, i.duracao_pe_s, i.distancia_reta_m,
         (v_excl->i.google_place_id->>'em')::timestamptz, (v_excl->i.google_place_id->>'por')::uuid
  from jsonb_to_recordset(coalesce(p_itens, '[]')) as i(categoria text, google_place_id text, nome text, latitude double precision,
       longitude double precision, distancia_pe_m int, duracao_pe_s int, distancia_reta_m int)
  join app.entorno_categorias c on c.codigo = i.categoria and c.ativo
  where i.google_place_id is not null and i.distancia_pe_m is not null and i.distancia_pe_m <= c.raio_pe_m
  order by i.google_place_id, c.ordem, i.distancia_pe_m;
  get diagnostics n = row_count;

  insert into app.terreno_entorno_buscas (terreno_id, empresa_id, latitude, longitude, rota_a_pe, buscado_em, buscado_por)
  values (p_terreno, t.empresa_id, p_latitude, p_longitude, coalesce(p_rota_a_pe, true), now(), auth.uid())
  on conflict (terreno_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, rota_a_pe = excluded.rota_a_pe,
                                         buscado_em = excluded.buscado_em, buscado_por = excluded.buscado_por;
  return n;
end $$;

-- Exclui um lugar do Google do entorno deste terreno; continua fora nas buscas seguintes.
create or replace function app.excluir_lugar_entorno(p_terreno uuid, p_google_place_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  update app.terreno_entorno set excluido_em = now(), excluido_por = auth.uid()
  where terreno_id = p_terreno and google_place_id = p_google_place_id and excluido_em is null;
  if not found then raise exception 'Lugar não está no entorno do terreno' using errcode = 'P0002'; end if;
end $$;

-- Desfaz a exclusão: o lugar volta à ficha do terreno, sem nova busca.
create or replace function app.restaurar_lugar_entorno(p_terreno uuid, p_google_place_id text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  update app.terreno_entorno set excluido_em = null, excluido_por = null
  where terreno_id = p_terreno and google_place_id = p_google_place_id and excluido_em is not null;
end $$;

-- Exclui um ponto da empresa só da ficha deste terreno (continua nos outros e no mapa).
create or replace function app.excluir_ponto_terreno(p_terreno uuid, p_ponto uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if not exists (select 1 from app.pontos_interesse where id = p_ponto and empresa_id = t.empresa_id) then
    raise exception 'Ponto não é desta empresa' using errcode = 'P0002';
  end if;
  insert into app.terreno_pontos_excluidos (terreno_id, ponto_id, empresa_id, excluido_por)
  values (p_terreno, p_ponto, t.empresa_id, auth.uid())
  on conflict (terreno_id, ponto_id) do nothing;
end $$;

-- Desfaz: o ponto volta à ficha deste terreno.
create or replace function app.restaurar_ponto_terreno(p_terreno uuid, p_ponto uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  delete from app.terreno_pontos_excluidos where terreno_id = p_terreno and ponto_id = p_ponto;
end $$;

-- Grava as distâncias (a pé e de carro, pela rota) do terreno aos pontos da empresa.
-- Recusa coordenada diferente da atual; ignora ponto de outra empresa ou inativo.
-- p_itens: [{ponto_id, distancia_pe_m, duracao_pe_s, distancia_carro_m, duracao_carro_s}]
create or replace function app.salvar_distancias_pontos(p_terreno uuid, p_latitude double precision, p_longitude double precision, p_itens jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; n int;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if t.latitude is null or abs(t.latitude - p_latitude) > 1e-7 or abs(t.longitude - p_longitude) > 1e-7 then
    raise exception 'A localização do terreno mudou durante a medição; meça de novo' using errcode = 'PT409';
  end if;
  insert into app.terreno_ponto_distancias (terreno_id, ponto_id, empresa_id, latitude, longitude,
                                            distancia_pe_m, duracao_pe_s, distancia_carro_m, duracao_carro_s, calculado_em)
  select distinct on (i.ponto_id) p_terreno, i.ponto_id, t.empresa_id, t.latitude, t.longitude,
         i.distancia_pe_m, i.duracao_pe_s, i.distancia_carro_m, i.duracao_carro_s, now()
  from jsonb_to_recordset(coalesce(p_itens, '[]')) as i(ponto_id uuid, distancia_pe_m int, duracao_pe_s int, distancia_carro_m int, duracao_carro_s int)
  join app.pontos_interesse p on p.id = i.ponto_id and p.empresa_id = t.empresa_id and p.ativo
  order by i.ponto_id
  on conflict (terreno_id, ponto_id) do update set latitude = excluded.latitude, longitude = excluded.longitude,
    distancia_pe_m = excluded.distancia_pe_m, duracao_pe_s = excluded.duracao_pe_s,
    distancia_carro_m = excluded.distancia_carro_m, duracao_carro_s = excluded.duracao_carro_s, calculado_em = excluded.calculado_em;
  get diagnostics n = row_count;
  return n;
end $$;

-- Área cadastral do terreno pela soma dos SQLs (pedido do Moisés, 6/nov/2026): a soma das áreas
-- cadastrais de todas as inscrições do terreno, só quando todas têm área (sem isso, nula).
create or replace function app._area_sqls(p_terreno uuid)
returns numeric language sql stable security definer set search_path = '' as $$
  select case when count(*) > 0 and count(*) filter (where area_cadastral_m2 is null) = 0
              then nullif(round(sum(area_cadastral_m2), 2), 0) end
  from app.inscricoes_municipais where terreno_id = p_terreno $$;

-- Refaz a cadastral do terreno pela soma, se ninguém digitou outra; só grava quando muda.
create or replace function app._sincronizar_area_cadastral(p_terreno uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v numeric := app._area_sqls(p_terreno);
begin
  update app.terrenos set area_cadastral_m2 = v
   where id = p_terreno and area_cadastral_origem = 'sqls' and area_cadastral_m2 is distinct from v;
end $$;

create or replace function app.tg_inscricao_area()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('app.apagando_terreno', true), '') = '1' then return null; end if;   -- o terreno está sendo apagado
  if tg_op in ('UPDATE','DELETE') then perform app._sincronizar_area_cadastral(old.terreno_id); end if;
  if tg_op in ('INSERT','UPDATE') and (tg_op = 'INSERT' or new.terreno_id is distinct from old.terreno_id) then
    perform app._sincronizar_area_cadastral(new.terreno_id);
  end if;
  return null;
end $$;
create trigger t_area_terreno after insert or delete or update of area_cadastral_m2, terreno_id on app.inscricoes_municipais
  for each row execute function app.tg_inscricao_area();

create or replace function app.salvar_terreno(p_terreno uuid, p_versao int, p_dados jsonb)
returns int
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_novo app.terrenos; fixos text[] := array['id','empresa_id','codigo','versao','criado_por','criado_em',
  'atualizado_em','atualizado_por','situacao_cadastral','arquivado_em','motivo_arquivamento'];
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if p_versao is distinct from t.versao then
    raise exception 'Esta ficha foi alterada por outra pessoa. Recarregue antes de salvar.' using errcode = 'PT409';
  end if;
  if exists (select 1 from jsonb_object_keys(p_dados) k where k = any(fixos)) then
    raise exception 'Campos de controle não podem ser alterados por aqui' using errcode = '22023';
  end if;
  v_novo := jsonb_populate_record(t, p_dados);
  update app.terrenos set
    nome = v_novo.nome, descricao = v_novo.descricao, prioridade = v_novo.prioridade, responsavel_id = v_novo.responsavel_id,
    origem_cadastro = v_novo.origem_cadastro, data_identificacao = v_novo.data_identificacao,
    observacoes = v_novo.observacoes, cep = v_novo.cep, logradouro = v_novo.logradouro, numero = v_novo.numero,
    complemento = v_novo.complemento, bairro = v_novo.bairro, municipio_id = v_novo.municipio_id, zona = v_novo.zona,
    zona_origem = case when v_novo.zona is null then null when v_novo.zona is distinct from t.zona then 'digitado' else t.zona_origem end,
    eixo_comercial_id = v_novo.eixo_comercial_id, referencia_localizacao = v_novo.referencia_localizacao,
    cartorio = nullif(trim(v_novo.cartorio), ''),
    cartorio_origem = case when nullif(trim(v_novo.cartorio), '') is null then null
                           when nullif(trim(v_novo.cartorio), '') is distinct from t.cartorio then 'digitado' else t.cartorio_origem end,
    historico_uso = nullif(trim(v_novo.historico_uso), ''),
    visita_tecnica_em = v_novo.visita_tecnica_em,
    latitude = v_novo.latitude, longitude = v_novo.longitude, poligono_geojson = v_novo.poligono_geojson,
    poligono_desenhado_geojson = v_novo.poligono_desenhado_geojson,
    precisao_localizacao = v_novo.precisao_localizacao, area_documental_m2 = v_novo.area_documental_m2,
    -- cadastral apagada volta à soma dos SQLs; outro valor escrito passa a valer no lugar dela
    area_cadastral_m2 = coalesce(v_novo.area_cadastral_m2, app._area_sqls(t.id)),
    area_cadastral_origem = case when v_novo.area_cadastral_m2 is null then 'sqls'
                                 when v_novo.area_cadastral_m2 is distinct from t.area_cadastral_m2 then 'digitada'
                                 else t.area_cadastral_origem end,
    area_levantamento_m2 = v_novo.area_levantamento_m2,
    area_adotada_m2 = v_novo.area_adotada_m2, fonte_area_adotada = v_novo.fonte_area_adotada,
    testada_principal_m = v_novo.testada_principal_m, desnivel_estimado_m = v_novo.desnivel_estimado_m,
    posicao_quadra = v_novo.posicao_quadra, formato = v_novo.formato, situacao_ocupacao = v_novo.situacao_ocupacao,
    uso_atual = v_novo.uso_atual, area_construida_existente_m2 = v_novo.area_construida_existente_m2,
    area_construida_demolir_m2 = v_novo.area_construida_demolir_m2, necessidade_demolicao = v_novo.necessidade_demolicao,
    observacoes_fisicas = v_novo.observacoes_fisicas, sobreposicoes_aceitas = v_novo.sobreposicoes_aceitas
  where id = t.id
  returning versao into t.versao;
  return t.versao;
end $$;

-- ---------------------------------------------------------------------
-- Lixeira do log: desfazer uma alteração da ficha (decisão do Moisés, 24/out/2026)
-- ---------------------------------------------------------------------
-- Volta os campos daquela alteração ao valor de antes, pela salvar_terreno.
-- O histórico não perde nada: o registro original fica marcado (desfeito_em,
-- desfeito_por) e a volta é um registro novo que aponta para ele (desfaz_id).
-- Pode quem fez a alteração, os superiores dessa pessoa e o administrador.
-- Só vale enquanto os campos ainda têm os valores daquela alteração: se
-- mudaram depois, desfaz-se primeiro a mudança mais recente. A prévia do
-- olhinho é só da tela e não passa pelo banco.
create or replace function app.desfazer_alteracao(p_auditoria bigint)
returns int
language plpgsql security definer set search_path = ''
as $$
declare a app.auditoria; t app.terrenos; v_cols text[]; v_dados jsonb; v_versao int; c text;
begin
  select * into a from app.auditoria where id = p_auditoria for update;
  if not found or a.tabela <> 'terrenos' or a.acao <> 'update' then
    raise exception 'Só alterações da ficha do terreno podem ser desfeitas' using errcode = '22023';
  end if;
  select * into t from app.terrenos where id = a.registro_id for update;
  if not found or t.empresa_id <> a.empresa_id then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if not (a.user_id = auth.uid() or app.eh_administrador(t.empresa_id) or app.eh_superior(t.empresa_id, auth.uid(), a.user_id)) then
    raise exception 'Só quem fez a alteração, os superiores dessa pessoa ou o administrador podem desfazê-la' using errcode = '42501';
  end if;
  if a.desfeito_em is not null then raise exception 'Esta alteração já foi desfeita' using errcode = '22023'; end if;
  if a.desfaz_id is not null then raise exception 'Um desfazer não se desfaz: altere o campo de novo' using errcode = '22023'; end if;
  -- a geometria sai da poligonal (coluna gerada)
  v_cols := array(select x from unnest(app.colunas_mudadas(a.antes, a.depois)) x where x <> 'poligono');
  if cardinality(v_cols) = 0 then raise exception 'Nada a desfazer' using errcode = '22023'; end if;
  if v_cols && array['situacao_cadastral','arquivado_em','motivo_arquivamento','criado_por','criado_em','codigo'] then
    raise exception 'Esta alteração não se desfaz por aqui' using errcode = '22023';
  end if;
  foreach c in array v_cols loop
    if to_jsonb(t) -> c is distinct from a.depois -> c then
      raise exception 'O campo % mudou depois desta alteração: desfaça primeiro a mudança mais recente', c using errcode = 'PT409';
    end if;
  end loop;
  select jsonb_object_agg(x, a.antes -> x) into v_dados from unnest(v_cols) x;
  perform set_config('app.desfazendo', '1', true);
  v_versao := app.salvar_terreno(t.id, t.versao, v_dados);
  perform set_config('app.desfazendo', '', true);
  update app.auditoria set desfeito_em = clock_timestamp(), desfeito_por = auth.uid() where id = a.id;
  update app.auditoria set desfaz_id = a.id
  where id = (select max(id) from app.auditoria where tabela = 'terrenos' and registro_id = t.id and acao = 'update');
  return v_versao;
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
  perform app.exigir_editor(t.empresa_id);
  if coalesce(trim(p_motivo),'') = '' then raise exception 'Informe o motivo do arquivamento' using errcode = '22023'; end if;
  if exists (select 1 from app.processos where terreno_id = t.id and status in ('ativo','stand_by')) then
    raise exception 'Encerre os processos abertos antes de arquivar o terreno' using errcode = '22023';
  end if;
  update app.terrenos set situacao_cadastral = 'arquivado', arquivado_em = now(), motivo_arquivamento = p_motivo where id = t.id;
end $$;

-- Desarquivar (revisão de 2/nov/2026: o terreno arquivado não tinha volta):
-- gestor, diretor ou o administrador. O arquivamento fica no histórico.
create or replace function app.reativar_terreno(p_terreno uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found or t.empresa_id not in (select app.minhas_empresas()) then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if not (app.eh_gestor(t.empresa_id) or app.eh_administrador(t.empresa_id)) then
    raise exception 'Só gestor, diretor ou o administrador desarquivam o terreno' using errcode = '42501';
  end if;
  if t.situacao_cadastral <> 'arquivado' then raise exception 'O terreno não está arquivado' using errcode = '22023'; end if;
  update app.terrenos set situacao_cadastral = 'ativo', arquivado_em = null, motivo_arquivamento = null where id = t.id;
end $$;

-- ---------------------------------------------------------------------
-- Configuração do funil pelo app (Configurações › Funil): só o
-- administrador, só por estas funções. Toda alteração vai para a auditoria.
-- ---------------------------------------------------------------------
create or replace function app._chaves_permitidas(p_dados jsonb, p_chaves text[])
returns void
language plpgsql immutable set search_path = ''
as $$
declare k text;
begin
  for k in select jsonb_object_keys(coalesce(p_dados, '{}'::jsonb)) loop
    if not k = any(p_chaves) then raise exception 'Campo não editável: %', k using errcode = '22023'; end if;
  end loop;
end $$;

-- Fase: cria (com nome e prefixo) ou altera nome, ordem, prefixo e ativo.
-- A fase de entrada é do modelo (não muda nem desativa). Desativar só sem
-- processo aberto na fase; a fase desativada não abre mais.
create or replace function app.salvar_fase(p_empresa uuid, p_codigo text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare f app.fases_modelo;
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['nome','ordem','prefixo','ativo','etapa_partes']);
  if p_dados ? 'prefixo' then
    if upper(p_dados->>'prefixo') !~ '^[A-Z]{2,5}$' then raise exception 'Prefixo: de 2 a 5 letras' using errcode = '22023'; end if;
    if exists (select 1 from app.fases_modelo where empresa_id = p_empresa and prefixo = upper(p_dados->>'prefixo') and codigo <> p_codigo) then
      raise exception 'O prefixo % já é de outra fase', upper(p_dados->>'prefixo') using errcode = '22023';
    end if;
  end if;
  select * into f from app.fases_modelo where empresa_id = p_empresa and codigo = p_codigo for update;
  if not found then
    if p_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Código da fase: letras minúsculas, números e _' using errcode = '22023'; end if;
    if coalesce(trim(p_dados->>'nome'), '') = '' or p_dados->>'prefixo' is null then
      raise exception 'Fase nova precisa de nome e prefixo' using errcode = '22023';
    end if;
    insert into app.fases_modelo (empresa_id, codigo, nome, ordem, prefixo, ativo)
    values (p_empresa, p_codigo, trim(p_dados->>'nome'),
            coalesce((p_dados->>'ordem')::int, (select coalesce(max(ordem), 0) + 1 from app.fases_modelo where empresa_id = p_empresa)),
            upper(p_dados->>'prefixo'), coalesce((p_dados->>'ativo')::boolean, true));
    return;
  end if;
  if (p_dados->>'ativo')::boolean is false and f.ativo then
    if f.entrada then raise exception 'A fase de entrada não pode ser desativada' using errcode = '22023'; end if;
    if exists (select 1 from app.processos where empresa_id = p_empresa and fase = f.codigo and status in ('ativo','stand_by')) then
      raise exception 'Há terrenos nesta fase: encerre os processos antes de desativar' using errcode = '22023';
    end if;
  end if;
  if p_dados ? 'etapa_partes' then
    if not f.entrada then raise exception 'Negociação por parte só na fase de entrada' using errcode = '22023'; end if;
    if nullif(p_dados->>'etapa_partes', '') is not null and not exists (
         select 1 from app.etapas_modelo where empresa_id = p_empresa and fase = f.codigo and codigo = p_dados->>'etapa_partes') then
      raise exception 'Etapa inválida' using errcode = '22023';
    end if;
    if exists (select 1 from app.processos where empresa_id = p_empresa and parte_id is not null and status in ('ativo','stand_by')) then
      raise exception 'Há negociações por parte em andamento: encerre-as antes de mudar a etapa da divisão' using errcode = '22023';
    end if;
    update app.fases_modelo set etapa_partes = nullif(p_dados->>'etapa_partes', '') where empresa_id = p_empresa and codigo = p_codigo;
  end if;
  update app.fases_modelo set
    nome    = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    ordem   = coalesce((p_dados->>'ordem')::int, ordem),
    prefixo = coalesce(upper(p_dados->>'prefixo'), prefixo),
    ativo   = coalesce((p_dados->>'ativo')::boolean, ativo)
  where empresa_id = p_empresa and codigo = p_codigo;
end $$;

-- Apagar só fase que nunca teve processo; com histórico, desativar.
create or replace function app.apagar_fase(p_empresa uuid, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  if exists (select 1 from app.fases_modelo where empresa_id = p_empresa and codigo = p_codigo and entrada) then
    raise exception 'A fase de entrada não pode ser apagada' using errcode = '22023';
  end if;
  if exists (select 1 from app.processos where empresa_id = p_empresa and fase = p_codigo) then
    raise exception 'A fase já tem histórico: desative em vez de apagar' using errcode = '22023';
  end if;
  delete from app.fases_modelo where empresa_id = p_empresa and codigo = p_codigo;
  if not found then raise exception 'Fase não encontrada' using errcode = 'P0002'; end if;
end $$;

-- Dependência: a fase p_fase abre quando p_requisito_fase foi concluída
-- (conclusao) ou passou pela etapa ou subetapa p_requisito. Recusa ciclo e
-- dependência na fase de entrada (ela abre pela oferta).
create or replace function app.adicionar_dependencia(p_empresa uuid, p_fase text, p_requisito_fase text, p_requisito_tipo text, p_requisito text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  perform app.exigir_administrador(p_empresa);
  if not exists (select 1 from app.fases_modelo where empresa_id = p_empresa and codigo = p_fase)
     or not exists (select 1 from app.fases_modelo where empresa_id = p_empresa and codigo = p_requisito_fase) then
    raise exception 'Fase não encontrada' using errcode = 'P0002';
  end if;
  if p_fase = p_requisito_fase then raise exception 'Uma fase não depende dela mesma' using errcode = '22023'; end if;
  if p_fase = app._fase_entrada(p_empresa) then raise exception 'A fase de entrada abre pela oferta, sem dependência' using errcode = '22023'; end if;
  if p_requisito_tipo = 'conclusao' then
    if p_requisito is not null then raise exception 'Conclusão não leva etapa nem subetapa' using errcode = '22023'; end if;
  elsif p_requisito_tipo = 'etapa' then
    if not exists (select 1 from app.etapas_modelo where empresa_id = p_empresa and fase = p_requisito_fase and codigo = p_requisito) then
      raise exception 'Etapa não encontrada na fase requisito' using errcode = '22023';
    end if;
  elsif p_requisito_tipo = 'subetapa' then
    if not exists (select 1 from app.subetapas_modelo where empresa_id = p_empresa and fase = p_requisito_fase and codigo = p_requisito and ativo) then
      raise exception 'Subetapa ativa não encontrada na fase requisito' using errcode = '22023';
    end if;
  else
    raise exception 'Dependência é conclusão, etapa ou subetapa' using errcode = '22023';
  end if;
  -- ciclo: a fase requisito já depende (direta ou indiretamente) de p_fase
  if exists (
      with recursive cadeia(fase, n) as (
        select p_requisito_fase, 0
        union
        select d.requisito_fase, c.n + 1 from cadeia c
        join app.fase_dependencias d on d.empresa_id = p_empresa and d.fase = c.fase
        where c.n < 50)
      select 1 from cadeia where fase = p_fase) then
    raise exception 'Isso cria um ciclo entre as fases' using errcode = '22023';
  end if;
  insert into app.fase_dependencias (empresa_id, fase, requisito_fase, requisito_tipo, requisito)
  values (p_empresa, p_fase, p_requisito_fase, p_requisito_tipo, p_requisito)
  on conflict do nothing returning id into v_id;
  return v_id;
end $$;

create or replace function app.remover_dependencia(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.fase_dependencias where id = p_id;
  if not found then raise exception 'Dependência não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  delete from app.fase_dependencias where id = p_id;
end $$;

-- Etapa: cria (com nome; nasce com uma subetapa "Em andamento" de mesmo
-- código) ou altera nome, ordem, prazo e aprovações. Mudar a ordem empurra
-- as outras etapas da fase.
create or replace function app.salvar_etapa(p_empresa uuid, p_fase text, p_codigo text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare e app.etapas_modelo; v_ordem int; n int;
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['nome','ordem','sla_dias','aprova_gestor','aprova_diretor','aprovacao_modo','subetapa']);
  if not exists (select 1 from app.fases_modelo where empresa_id = p_empresa and codigo = p_fase) then
    raise exception 'Fase não encontrada' using errcode = 'P0002';
  end if;
  select count(*) into n from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase;
  select * into e from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo for update;
  if not found then
    if p_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Código da etapa: letras minúsculas, números e _' using errcode = '22023'; end if;
    if exists (select 1 from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo) then
      raise exception 'Já há uma subetapa com o código %: escolha outro', p_codigo using errcode = '22023';
    end if;
    v_ordem := least(greatest(coalesce((p_dados->>'ordem')::int, n + 1), 1), n + 1);
    update app.etapas_modelo set ordem = ordem + 1 where empresa_id = p_empresa and fase = p_fase and ordem >= v_ordem;
    insert into app.etapas_modelo (empresa_id, fase, codigo, nome, ordem, sla_dias, aprova_gestor, aprova_diretor, aprovacao_modo)
    values (p_empresa, p_fase, p_codigo, p_dados->>'nome', v_ordem, (p_dados->>'sla_dias')::int,
            coalesce((p_dados->>'aprova_gestor')::boolean, false), coalesce((p_dados->>'aprova_diretor')::boolean, false),
            coalesce(p_dados->>'aprovacao_modo', 'sequencia'));
    insert into app.subetapas_modelo (empresa_id, fase, codigo, etapa, nome, ordem)
    values (p_empresa, p_fase, p_codigo, p_codigo, coalesce(nullif(trim(p_dados->>'subetapa'), ''), 'Em andamento'), 1);
    return;
  end if;
  if p_dados ? 'subetapa' then raise exception 'Subetapas da etapa: use salvar_subetapa' using errcode = '22023'; end if;
  if p_dados ? 'ordem' then
    v_ordem := least(greatest((p_dados->>'ordem')::int, 1), n);
    if v_ordem <> e.ordem then
      update app.etapas_modelo set ordem = ordem + case when e.ordem > v_ordem then 1 else -1 end
       where empresa_id = p_empresa and fase = p_fase and codigo <> e.codigo
         and ordem between least(e.ordem, v_ordem) and greatest(e.ordem, v_ordem);
    end if;
  end if;
  update app.etapas_modelo set
    nome           = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    ordem          = coalesce(v_ordem, ordem),
    sla_dias       = case when p_dados ? 'sla_dias' then (p_dados->>'sla_dias')::int else sla_dias end,
    aprova_gestor  = coalesce((p_dados->>'aprova_gestor')::boolean, aprova_gestor),
    aprova_diretor = coalesce((p_dados->>'aprova_diretor')::boolean, aprova_diretor),
    aprovacao_modo = coalesce(p_dados->>'aprovacao_modo', aprovacao_modo)
  where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo;
end $$;

-- Apagar só etapa sem histórico (nenhum processo passou por ela) e de que
-- nenhuma dependência de fase dependa. Leva subetapas, checklist e pré-requisitos.
create or replace function app.apagar_etapa(p_empresa uuid, p_fase text, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare e app.etapas_modelo;
begin
  perform app.exigir_administrador(p_empresa);
  select * into e from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo for update;
  if not found then raise exception 'Etapa não encontrada' using errcode = 'P0002'; end if;
  if exists (select 1 from app.processo_transicoes t join app.processos p on p.id = t.processo_id
             where p.empresa_id = p_empresa and p.fase = p_fase and (t.para_etapa = p_codigo or t.de_etapa = p_codigo))
     or exists (select 1 from app.processos where empresa_id = p_empresa and fase = p_fase and etapa_atual = p_codigo) then
    raise exception 'A etapa já tem histórico: não pode ser apagada' using errcode = '22023';
  end if;
  if exists (select 1 from app.fase_dependencias d where d.empresa_id = p_empresa and d.requisito_fase = p_fase
             and ((d.requisito_tipo = 'etapa' and d.requisito = p_codigo)
               or (d.requisito_tipo = 'subetapa' and d.requisito in (select codigo from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and etapa = p_codigo)))) then
    raise exception 'Outra fase depende desta etapa: remova a dependência antes' using errcode = '22023';
  end if;
  if exists (select 1 from app.fases_modelo where empresa_id = p_empresa and codigo = p_fase and etapa_partes = p_codigo) then
    raise exception 'A negociação por parte começa nesta etapa: escolha outra antes' using errcode = '22023';
  end if;
  delete from app.prerequisitos_modelo where empresa_id = p_empresa and fase = p_fase
     and ((alvo_tipo = 'etapa' and alvo = p_codigo)
       or (alvo_tipo = 'subetapa' and alvo in (select codigo from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and etapa = p_codigo)));
  delete from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo;
  update app.etapas_modelo set ordem = ordem - 1 where empresa_id = p_empresa and fase = p_fase and ordem > e.ordem;
end $$;

-- Status de encerramento da fase: nome (o de Concluído é o da fase:
-- Comprado, Aprovado...) e aprovações. Cria o status que a fase não tem;
-- "ativo": false tira (Concluído e Stand By ficam sempre; não tira status em uso).
create or replace function app.configurar_status(p_empresa uuid, p_fase text, p_status text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['nome','aprova_gestor','aprova_diretor','aprovacao_modo','ativo']);
  if (p_dados->>'ativo')::boolean is false then
    if p_status in ('concluido','stand_by') then raise exception 'Concluído e Stand By existem em toda fase' using errcode = '22023'; end if;
    if exists (select 1 from app.processos where empresa_id = p_empresa and fase = p_fase and status = p_status) then
      raise exception 'Status já usado nesta fase: não pode sair' using errcode = '22023';
    end if;
    delete from app.status_modelo where empresa_id = p_empresa and fase = p_fase and status = p_status;
    return;
  end if;
  if not exists (select 1 from app.status_modelo where empresa_id = p_empresa and fase = p_fase and status = p_status) then
    if not exists (select 1 from app.fases_modelo where empresa_id = p_empresa and codigo = p_fase) then
      raise exception 'Fase não encontrada' using errcode = 'P0002';
    end if;
    insert into app.status_modelo (empresa_id, fase, status, nome)
    values (p_empresa, p_fase, p_status, coalesce(nullif(trim(p_dados->>'nome'), ''),
            case p_status when 'concluido' then 'Concluído' when 'perdido' then 'Perdido' when 'descartado' then 'Descartado' else 'Stand By' end));
  end if;
  update app.status_modelo set
    nome           = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    aprova_gestor  = coalesce((p_dados->>'aprova_gestor')::boolean, aprova_gestor),
    aprova_diretor = coalesce((p_dados->>'aprova_diretor')::boolean, aprova_diretor),
    aprovacao_modo = coalesce(p_dados->>'aprovacao_modo', aprovacao_modo)
  where empresa_id = p_empresa and fase = p_fase and status = p_status;
  if not found then raise exception 'Status não encontrado' using errcode = 'P0002'; end if;
end $$;

-- Subetapa: cria (com etapa e nome) ou altera. Desativar com terrenos dentro
-- exige "mover_para" (outra subetapa ativa da mesma etapa).
create or replace function app.salvar_subetapa(p_empresa uuid, p_fase text, p_codigo text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare s app.subetapas_modelo; v_mover text; p record;
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['etapa','nome','ordem','prazo_dias','aprova_gestor','aprova_diretor','aprovacao_modo','ativo','mover_para']);
  select * into s from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo for update;
  if not found then
    if p_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Código da subetapa: letras minúsculas, números e _' using errcode = '22023'; end if;
    if not exists (select 1 from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_dados->>'etapa') then
      raise exception 'Informe uma etapa válida' using errcode = '22023';
    end if;
    insert into app.subetapas_modelo (empresa_id, fase, codigo, etapa, nome, ordem, prazo_dias, aprova_gestor, aprova_diretor, aprovacao_modo)
    values (p_empresa, p_fase, p_codigo, p_dados->>'etapa', p_dados->>'nome',
            coalesce((p_dados->>'ordem')::int, (select coalesce(max(ordem), 0) + 1 from app.subetapas_modelo
                                               where empresa_id = p_empresa and fase = p_fase and etapa = p_dados->>'etapa')),
            (p_dados->>'prazo_dias')::int, coalesce((p_dados->>'aprova_gestor')::boolean, false),
            coalesce((p_dados->>'aprova_diretor')::boolean, false), coalesce(p_dados->>'aprovacao_modo', 'sequencia'));
    return;
  end if;

  if p_dados ? 'etapa' and p_dados->>'etapa' <> s.etapa then
    raise exception 'Subetapa não muda de etapa (o histórico depende disso): crie outra' using errcode = '22023';
  end if;
  if (p_dados->>'ativo')::boolean is false and s.ativo then
    if not exists (select 1 from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and etapa = s.etapa and ativo and codigo <> s.codigo) then
      raise exception 'A etapa precisa de ao menos uma subetapa ativa' using errcode = '22023';
    end if;
    if exists (select 1 from app.prerequisitos_modelo where empresa_id = p_empresa and fase = p_fase and requisito = s.codigo) then
      raise exception 'Outras passagens dependem desta subetapa: remova esses pré-requisitos antes' using errcode = '22023';
    end if;
    if exists (select 1 from app.processos where empresa_id = p_empresa and fase = p_fase and subetapa_atual = s.codigo and status in ('ativo','stand_by')) then
      v_mover := p_dados->>'mover_para';
      if not exists (select 1 from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and etapa = s.etapa
                     and codigo = v_mover and ativo and codigo <> s.codigo) then
        raise exception 'Há terrenos nesta subetapa: diga para qual subetapa da mesma etapa movê-los' using errcode = '22023';
      end if;
      for p in select * from app.processos where empresa_id = p_empresa and fase = p_fase and subetapa_atual = s.codigo and status in ('ativo','stand_by') for update loop
        update app.processos set subetapa_atual = v_mover, subetapa_desde = now() where id = p.id;
        insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, de_subetapa, para_subetapa, comentario)
        values (p.empresa_id, p.id, 'subetapa', p.etapa_atual, p.etapa_atual, s.codigo, v_mover, 'Subetapa ' || s.nome || ' desativada');
      end loop;
    end if;
  end if;

  update app.subetapas_modelo set
    nome           = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    ordem          = coalesce((p_dados->>'ordem')::int, ordem),
    prazo_dias     = case when p_dados ? 'prazo_dias' then (p_dados->>'prazo_dias')::int else prazo_dias end,
    aprova_gestor  = coalesce((p_dados->>'aprova_gestor')::boolean, aprova_gestor),
    aprova_diretor = coalesce((p_dados->>'aprova_diretor')::boolean, aprova_diretor),
    aprovacao_modo = coalesce(p_dados->>'aprovacao_modo', aprovacao_modo),
    ativo          = coalesce((p_dados->>'ativo')::boolean, ativo)
  where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo;
end $$;

-- Apagar só subetapa sem histórico; com histórico, desativar.
create or replace function app.apagar_subetapa(p_empresa uuid, p_fase text, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  if exists (select 1 from app.processo_transicoes t join app.processos p on p.id = t.processo_id
             where p.empresa_id = p_empresa and p.fase = p_fase and (t.para_subetapa = p_codigo or t.de_subetapa = p_codigo))
     or exists (select 1 from app.processos where empresa_id = p_empresa and fase = p_fase and subetapa_atual = p_codigo) then
    raise exception 'A subetapa já tem histórico: desative em vez de apagar' using errcode = '22023';
  end if;
  delete from app.prerequisitos_modelo where empresa_id = p_empresa and fase = p_fase and alvo_tipo = 'subetapa' and alvo = p_codigo;
  delete from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_codigo;
  if not found then raise exception 'Subetapa não encontrada' using errcode = 'P0002'; end if;
end $$;

-- Pré-requisito: para entrar em p_alvo (etapa ou subetapa) precisa ter passado
-- por p_requisito (subetapa). Recusa o que travaria o processo para sempre:
-- ciclo, exigência de etapa posterior, ou exigir na subetapa inicial algo da própria etapa.
create or replace function app.adicionar_prerequisito(p_empresa uuid, p_fase text, p_alvo_tipo text, p_alvo text, p_requisito text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare req app.subetapas_modelo; ordem_req int; ordem_alvo int; etapa_alvo text; v_id uuid;
begin
  perform app.exigir_administrador(p_empresa);
  select * into req from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_requisito and ativo;
  if not found then raise exception 'Pré-requisito tem que ser uma subetapa ativa' using errcode = '22023'; end if;
  select ordem into ordem_req from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = req.etapa;
  if p_alvo_tipo = 'etapa' then
    etapa_alvo := p_alvo;
  elsif p_alvo_tipo = 'subetapa' then
    select etapa into etapa_alvo from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_alvo;
    if p_alvo = p_requisito then raise exception 'Uma subetapa não pode exigir ela mesma' using errcode = '22023'; end if;
  else
    raise exception 'Alvo é etapa ou subetapa' using errcode = '22023';
  end if;
  select ordem into ordem_alvo from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = etapa_alvo;
  if ordem_alvo is null then raise exception 'Alvo não encontrado' using errcode = 'P0002'; end if;
  if ordem_req > ordem_alvo or (p_alvo_tipo = 'etapa' and ordem_req = ordem_alvo) then
    raise exception 'O pré-requisito tem que vir antes: % é de etapa posterior', req.nome using errcode = '22023';
  end if;
  if p_alvo_tipo = 'subetapa' and req.etapa = etapa_alvo and p_alvo = app._subetapa_inicial(p_empresa, p_fase, etapa_alvo) then
    raise exception 'A subetapa inicial da etapa não pode exigir outra da mesma etapa' using errcode = '22023';
  end if;
  -- ciclo: o requisito (direta ou indiretamente) já exige o alvo
  if p_alvo_tipo = 'subetapa' and exists (
      with recursive cadeia(codigo, n) as (
        select p_requisito, 0
        union
        select pr.requisito, c.n + 1 from cadeia c
        join app.prerequisitos_modelo pr on pr.empresa_id = p_empresa and pr.fase = p_fase and pr.alvo_tipo = 'subetapa' and pr.alvo = c.codigo
        where c.n < 50)
      select 1 from cadeia where codigo = p_alvo) then
    raise exception 'Isso cria um ciclo: % já depende de %', req.nome, p_alvo using errcode = '22023';
  end if;
  insert into app.prerequisitos_modelo (empresa_id, fase, alvo_tipo, alvo, requisito)
  values (p_empresa, p_fase, p_alvo_tipo, p_alvo, p_requisito)
  on conflict do nothing returning id into v_id;
  return v_id;
end $$;

create or replace function app.remover_prerequisito(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.prerequisitos_modelo where id = p_id;
  if not found then raise exception 'Pré-requisito não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  delete from app.prerequisitos_modelo where id = p_id;
end $$;

-- Motivo de Descartado ou Perdido: cria ou altera; desativar no lugar de apagar.
create or replace function app.salvar_motivo(p_empresa uuid, p_status text, p_codigo text, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['nome','ordem','exige_texto','ativo']);
  update app.motivos_encerramento set
    nome        = coalesce(nullif(trim(p_dados->>'nome'), ''), nome),
    ordem       = coalesce((p_dados->>'ordem')::int, ordem),
    exige_texto = coalesce((p_dados->>'exige_texto')::boolean, exige_texto),
    ativo       = coalesce((p_dados->>'ativo')::boolean, ativo)
  where empresa_id = p_empresa and status = p_status and codigo = p_codigo;
  if not found then
    if p_codigo !~ '^[a-z][a-z0-9_]{1,40}$' then raise exception 'Código do motivo: letras minúsculas, números e _' using errcode = '22023'; end if;
    insert into app.motivos_encerramento (empresa_id, status, codigo, nome, ordem, exige_texto)
    values (p_empresa, p_status, p_codigo, p_dados->>'nome',
            coalesce((p_dados->>'ordem')::int, (select coalesce(max(ordem), 0) + 1 from app.motivos_encerramento where empresa_id = p_empresa and status = p_status)),
            coalesce((p_dados->>'exige_texto')::boolean, false));
  end if;
end $$;

create or replace function app.apagar_motivo(p_empresa uuid, p_status text, p_codigo text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  if exists (select 1 from app.processos where empresa_id = p_empresa and status = p_status and motivo_encerramento = p_codigo) then
    raise exception 'Motivo já usado: desative em vez de apagar' using errcode = '22023';
  end if;
  delete from app.motivos_encerramento where empresa_id = p_empresa and status = p_status and codigo = p_codigo;
  if not found then raise exception 'Motivo não encontrado' using errcode = 'P0002'; end if;
end $$;

-- Checklist de documentos para sair da etapa: incluir, marcar obrigatório, tirar.
-- p_regra (jornada, 1/nov/2026): bloqueia, justifica ou livre; nulo = pelo p_obrigatorio.
-- p_regra_cond: regra condicional [{condicao, regra}]; nulo mantém, '[]' tira.
create or replace function app.salvar_checklist(p_empresa uuid, p_fase text, p_etapa text, p_tipo_documento text, p_obrigatorio boolean default true, p_ordem int default null,
  p_regra text default null, p_regra_cond jsonb default null)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_regra text := coalesce(p_regra, case when coalesce(p_obrigatorio, true) then 'bloqueia' else 'livre' end);
begin
  perform app.exigir_administrador(p_empresa);
  insert into app.checklist_modelo (empresa_id, fase, etapa, tipo_documento, regra, ordem, regra_cond)
  values (p_empresa, p_fase, p_etapa, p_tipo_documento, v_regra,
          coalesce(p_ordem, (select coalesce(max(ordem), 0) + 1 from app.checklist_modelo where empresa_id = p_empresa and fase = p_fase and etapa = p_etapa)),
          app._regra_cond_config(p_empresa, p_regra_cond))
  on conflict (empresa_id, fase, etapa, tipo_documento)
  do update set regra = excluded.regra, ordem = coalesce(p_ordem, app.checklist_modelo.ordem),
                regra_cond = case when p_regra_cond is null then app.checklist_modelo.regra_cond else excluded.regra_cond end;
end $$;

create or replace function app.remover_checklist(p_empresa uuid, p_fase text, p_etapa text, p_tipo_documento text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  delete from app.checklist_modelo where empresa_id = p_empresa and fase = p_fase and etapa = p_etapa and tipo_documento = p_tipo_documento;
end $$;

-- ---------------------------------------------------------------------
-- Lote na base da prefeitura (GeoSampa, GeoSanja): grava a consulta feita no
-- navegador pela inscrição. A base vem da cidade da inscrição; o terreno tem
-- que ser dessa cidade e o lote devolvido tem que ser o da inscrição (no
-- GeoSampa, setor, quadra, lote e dígito; no GeoSanja, a inscrição que a busca
-- devolve). Completa na inscrição só o que está vazio (área cadastral) e o que
-- é do cadastro fiscal (CIB, zona fiscal, só em São Paulo). Com
-- p_criar_analise, troca as zonas DESTE lote na análise urbanística (ver
-- app._substituir_zonas): os outros lotes ficam como estavam.
-- p_lote: atributos do lote; p_camadas: {camada: [atributos]};
-- p_zonas: [{sigla, area_m2, macrozona}] (macrozona MC, ME ou MOC, em SJC).
-- ---------------------------------------------------------------------
create or replace function app.registrar_consulta_lote(
  p_inscricao uuid, p_lote jsonb, p_poligono jsonb, p_area_poligono numeric,
  p_camadas jsonb, p_zonas jsonb, p_camadas_com_erro text[] default '{}', p_criar_analise boolean default true)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare i app.inscricoes_municipais; t app.terrenos; b app.bases_cadastrais; v_mun text; v_ins text; v_id uuid;
begin
  select * into i from app.inscricoes_municipais where id = p_inscricao;
  if not found then raise exception 'Inscrição não encontrada' using errcode = 'P0002'; end if;
  select * into t from app.terrenos where id = i.terreno_id;
  perform app.exigir_editor(t.empresa_id);
  select * into b from app.bases_cadastrais where municipio_id = i.municipio_id;
  if not found then raise exception 'A cidade desta inscrição não tem base da prefeitura para consultar' using errcode = '22023'; end if;
  if t.municipio_id <> b.municipio_id then
    select nome into v_mun from app.municipios where id = b.municipio_id;
    raise exception 'O % só cobre %, e o terreno é de outra cidade', b.nome, v_mun using errcode = '22023';
  end if;
  if jsonb_typeof(p_lote) is distinct from 'object' then raise exception 'Lote inválido' using errcode = '22023'; end if;
  v_ins := case b.codigo
             when 'geosampa' then coalesce(p_lote->>'cd_setor_fiscal','') || coalesce(p_lote->>'cd_quadra_fiscal','')
                                || coalesce(p_lote->>'cd_lote','') || coalesce(p_lote->>'cd_digito_sql','')
             else regexp_replace(coalesce(p_lote->>'inscricao',''), '\D', '', 'g') end;
  if length(v_ins) <> length(regexp_replace(b.mascara, '[^0]', '', 'g')) or v_ins <> i.inscricao_norm then
    raise exception 'O lote do % (%) não é o da inscrição %', b.nome, v_ins, i.inscricao using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_zonas, '[]')) <> 'array' then raise exception 'Zonas devem ser uma lista' using errcode = '22023'; end if;

  insert into app.consultas_lote (empresa_id, terreno_id, inscricao_id, base, inscricao_norm, lote, poligono_geojson, area_poligono_m2,
                                  camadas, zonas, camadas_com_erro)
  values (t.empresa_id, t.id, i.id, b.codigo, v_ins, p_lote, p_poligono, nullif(p_area_poligono, 0),
          coalesce(p_camadas, '{}'), coalesce(p_zonas, '[]'), coalesce(p_camadas_com_erro, '{}'))
  returning id into v_id;

  update app.inscricoes_municipais
     set area_cadastral_m2 = coalesce(area_cadastral_m2, nullif((p_lote->>'qt_area_terreno')::numeric, 0)),
         cib = coalesce(nullif(trim(p_lote->>'cd_cib'), ''), cib),
         zona_fiscal = coalesce(nullif(trim(p_camadas#>>'{zona_fiscal,0,sg_zona_fiscal}'), ''), zona_fiscal)
   where id = i.id;

  -- cartório da circunscrição: só quando o terreno ainda não tem e a camada achou um só
  if t.cartorio is null and jsonb_typeof(p_camadas->'cartorio_registro_imovel') = 'array'
     and jsonb_array_length(p_camadas->'cartorio_registro_imovel') = 1
     and nullif(trim(p_camadas#>>'{cartorio_registro_imovel,0,cd_numero_cartorio}'), '') is not null then
    update app.terrenos set cartorio = trim(p_camadas#>>'{cartorio_registro_imovel,0,cd_numero_cartorio}') || ' CRI', cartorio_origem = 'prefeitura'
     where id = t.id;
  end if;

  if p_criar_analise and jsonb_array_length(coalesce(p_zonas, '[]')) > 0 then
    perform app._substituir_zonas(t, i.id, p_zonas, b.nome || ' (' || b.rotulo || ' ' || i.inscricao || ')');
  end if;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Consulta pela poligonal do terreno (restrições e entorno da área inteira).
-- A base é a da cidade do terreno; grava a poligonal de hoje do terreno junto.
-- ---------------------------------------------------------------------
create or replace function app.registrar_consulta_area(p_terreno uuid, p_camadas jsonb, p_camadas_com_erro text[] default '{}')
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; b app.bases_cadastrais; v_id uuid;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if t.poligono_geojson is null then raise exception 'O terreno não tem poligonal para consultar' using errcode = '22023'; end if;
  select * into b from app.bases_cadastrais where municipio_id = t.municipio_id;
  if not found then raise exception 'A cidade do terreno não tem base da prefeitura para consultar' using errcode = '22023'; end if;
  if jsonb_typeof(coalesce(p_camadas, '{}')) <> 'object' then raise exception 'Camadas inválidas' using errcode = '22023'; end if;
  insert into app.consultas_area (empresa_id, terreno_id, base, poligono_geojson, camadas, camadas_com_erro)
  values (t.empresa_id, t.id, b.codigo, t.poligono_geojson, coalesce(p_camadas, '{}'), coalesce(p_camadas_com_erro, '{}'))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Classificação topográfica (decisões do Moisés, 3 e 4/nov/2026): sete níveis pela
-- declividade média (a média da inclinação em cada ponto do terreno), com os cortes
-- do Moisés depois de medir 8 terrenos de São Paulo. A inclinação do plano que melhor se ajusta às cotas só é
-- mostrada; a terra mexida até esse plano (corte + aterro ÷ área, m³/m²) só pesa no
-- crítico (um morro, não uma rampa). Sem a terra mexida (cotas do Google, que erram
-- 1 a 4 m) a declividade só separa Plano, Inclinado ou, acima do agudo, crítico.
-- ---------------------------------------------------------------------
create or replace function app.classificar_topografia(p_empresa uuid, p_declividade numeric, p_terra numeric)
returns text
language sql stable security definer set search_path = ''
as $$
  with c as (
    select coalesce(x.plano_ate_pct, 5) as pl, coalesce(x.inclinado_ate_pct, 10) as inc, coalesce(x.leve_ate_pct, 13) as le,
           coalesce(x.mediano_ate_pct, 19) as me, coalesce(x.intenso_ate_pct, 24) as it, coalesce(x.agudo_ate_pct, 30) as ag,
           coalesce(x.critico_terra_m3m2, 1.5) as ct
    from (select 1) u left join app.topografia_config x on x.empresa_id = p_empresa)
  select case when p_declividade is null then null
              when p_declividade > ag or p_terra > ct then 'acidentado_critico'
              when p_declividade <= pl then 'plano'
              when p_terra is null or p_declividade <= inc then 'inclinado'
              when p_declividade <= le then 'acidentado_leve'
              when p_declividade <= me then 'acidentado_mediano'
              when p_declividade <= it then 'acidentado_intenso'
              else 'acidentado_agudo' end
  from c $$;

-- O front mede (laser em São Paulo, Google fora) e grava aqui; o perfil sai do banco.
create or replace function app.registrar_topografia(p_terreno uuid, p_declividade numeric, p_inclinacao numeric, p_terra numeric, p_desnivel numeric, p_fonte text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_perfil text; v_terra numeric;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if p_fonte is null or p_fonte not in ('laser','google') then raise exception 'Fonte das cotas inválida' using errcode = '22023'; end if;
  if p_declividade is null or p_declividade < 0 then raise exception 'Declividade inválida' using errcode = '22023'; end if;
  if p_inclinacao is null or p_inclinacao < 0 then raise exception 'Inclinação inválida' using errcode = '22023'; end if;
  -- com o Google a terra mexida não tem precisão: não é guardada
  v_terra := case when p_fonte = 'laser' then p_terra end;
  if p_fonte = 'laser' and (v_terra is null or v_terra < 0) then raise exception 'Com o laser, a terra mexida é obrigatória' using errcode = '22023'; end if;
  v_perfil := app.classificar_topografia(t.empresa_id, p_declividade, v_terra);
  update app.terrenos set topo_perfil = v_perfil, topo_declividade_pct = round(p_declividade, 2), topo_inclinacao_pct = round(p_inclinacao, 2),
    topo_terra_m3m2 = round(v_terra, 3), topo_desnivel_m = round(p_desnivel, 2), topo_fonte = p_fonte, topo_calculado_em = now(), topo_calculado_por = auth.uid()
  where id = t.id;
  return v_perfil;
end $$;

-- Limites da classificação: só o administrador; vale para as próximas medições
-- e para reclassificar as já feitas (o perfil gravado é recalculado aqui).
create or replace function app.salvar_topografia_config(p_empresa uuid, p_plano numeric, p_inclinado numeric, p_leve numeric, p_mediano numeric, p_intenso numeric, p_agudo numeric, p_critico_terra numeric)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  insert into app.topografia_config (empresa_id, plano_ate_pct, inclinado_ate_pct, leve_ate_pct, mediano_ate_pct, intenso_ate_pct, agudo_ate_pct, critico_terra_m3m2)
  values (p_empresa, p_plano, p_inclinado, p_leve, p_mediano, p_intenso, p_agudo, p_critico_terra)
  on conflict (empresa_id) do update set plano_ate_pct = excluded.plano_ate_pct, inclinado_ate_pct = excluded.inclinado_ate_pct,
    leve_ate_pct = excluded.leve_ate_pct, mediano_ate_pct = excluded.mediano_ate_pct, intenso_ate_pct = excluded.intenso_ate_pct, agudo_ate_pct = excluded.agudo_ate_pct,
    critico_terra_m3m2 = excluded.critico_terra_m3m2;
  update app.terrenos set topo_perfil = app.classificar_topografia(empresa_id, topo_declividade_pct, topo_terra_m3m2)
  where empresa_id = p_empresa and topo_perfil is not null;
end $$;

-- ---------------------------------------------------------------------
-- Cartório da circunscrição pelo pino do terreno (sem inscrição consultada).
-- O front consulta a prefeitura e grava aqui; só preenche o vazio ou troca o
-- que veio da prefeitura (o pino mudou de lugar), nunca o digitado.
-- ---------------------------------------------------------------------
create or replace function app.cartorio_da_prefeitura(p_terreno uuid, p_cartorio text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if nullif(trim(p_cartorio), '') is null then raise exception 'Cartório vazio' using errcode = '22023'; end if;
  if t.cartorio_origem = 'digitado' or t.cartorio = trim(p_cartorio) then return false; end if;
  update app.terrenos set cartorio = trim(p_cartorio), cartorio_origem = 'prefeitura' where id = t.id;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Zona da cidade (região) pelo GeoSampa, em São Paulo (9/nov/2026): o front
-- acha a subprefeitura da poligonal (ou do pino) e grava a região oficial dela
-- aqui. Preenche só o vazio ou troca o que veio da prefeitura (o terreno mudou
-- de lugar); nunca o digitado, nem a zona escolhida antes de existir a origem.
-- ---------------------------------------------------------------------
create or replace function app.zona_da_prefeitura(p_terreno uuid, p_zona text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if p_zona is null or p_zona not in ('leste','oeste','norte','sul','centro') then
    raise exception 'Zona inválida: %', p_zona using errcode = '22023';
  end if;
  if t.zona_origem = 'digitado' or (t.zona is not null and t.zona_origem is null) or t.zona = p_zona then return false; end if;
  update app.terrenos set zona = p_zona, zona_origem = 'prefeitura' where id = t.id;
  return true;
end $$;

-- ---------------------------------------------------------------------
-- Zonas da análise urbanística, por lote. Troca as zonas de um lote
-- (p_inscricao; nulo = parte do terreno sem inscrição, pela poligonal) numa
-- análise nova, que copia as zonas dos outros lotes da vigente; a anterior
-- fica como substituída. As exceções do lote numa zona que continua passam
-- para a análise nova. Se as zonas do lote não mudaram, nada é gravado.
-- Siglas fora do catálogo da cidade vão para as observações.
-- ---------------------------------------------------------------------
create or replace function app._substituir_zonas(p_terreno app.terrenos, p_inscricao uuid, p_zonas jsonb, p_fonte text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_ant uuid; v_an uuid; v_fora text[]; v_novo jsonb; v_velho jsonb;
begin
  if jsonb_typeof(coalesce(p_zonas, '[]')) <> 'array' then raise exception 'Zonas devem ser uma lista' using errcode = '22023'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_zonas, '[]')) as z(sigla text, area_m2 numeric, macrozona text)
              where coalesce(z.area_m2, 1) <= 0 or upper(z.macrozona) not in ('MC','ME','MOC')) then
    raise exception 'Zona com área zerada ou macrozona inválida (MC, ME ou MOC)' using errcode = '22023';
  end if;
  select id into v_ant from app.analises_urbanisticas where terreno_id = p_terreno.id and status = 'vigente';
  select array_agg(distinct z.sigla) into v_fora
    from jsonb_to_recordset(coalesce(p_zonas, '[]')) as z(sigla text, area_m2 numeric)
   where not exists (select 1 from app.zoneamentos c where c.municipio_id = p_terreno.municipio_id and c.sigla = z.sigla and c.ativo);
  select coalesce(jsonb_agg(jsonb_build_array(n.zid, n.area, n.macro) order by n.zid), '[]') into v_novo
    from (select c.id as zid, round(sum(z.area_m2), 2) as area, max(upper(z.macrozona)) as macro
            from jsonb_to_recordset(coalesce(p_zonas, '[]')) as z(sigla text, area_m2 numeric, macrozona text)
            join app.zoneamentos c on c.municipio_id = p_terreno.municipio_id and c.sigla = z.sigla and c.ativo
           group by c.id) n;
  select coalesce(jsonb_agg(jsonb_build_array(o.zoneamento_id, o.area_abrangida_m2, o.macrozona) order by o.zoneamento_id), '[]') into v_velho
    from app.analise_zoneamentos o where o.analise_id = v_ant and o.inscricao_id is not distinct from p_inscricao;
  if v_ant is not null and v_novo = v_velho and v_fora is null then return null; end if;

  insert into app.analises_urbanisticas (empresa_id, terreno_id, responsavel_id, fonte, observacoes)
  values (p_terreno.empresa_id, p_terreno.id, auth.uid(), p_fonte,
          case when v_fora is not null then 'Zonas fora do catálogo: ' || array_to_string(v_fora, ', ') end)
  returning id into v_an;
  insert into app.analise_zoneamentos (empresa_id, analise_id, inscricao_id, zoneamento_id, area_abrangida_m2, macrozona,
                                       ca_minimo, ca_basico, ca_maximo, to_maximo, gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m, outorga_gratuita, excecao_fonte, restricoes_observacoes)
  select empresa_id, v_an, inscricao_id, zoneamento_id, area_abrangida_m2, macrozona,
         ca_minimo, ca_basico, ca_maximo, to_maximo, gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m, outorga_gratuita, excecao_fonte, restricoes_observacoes
    from app.analise_zoneamentos where analise_id = v_ant and inscricao_id is distinct from p_inscricao;
  insert into app.analise_zoneamentos (empresa_id, analise_id, inscricao_id, zoneamento_id, area_abrangida_m2, macrozona,
                                       ca_minimo, ca_basico, ca_maximo, to_maximo, gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m, outorga_gratuita, excecao_fonte, restricoes_observacoes)
  select p_terreno.empresa_id, v_an, p_inscricao, (n->>0)::uuid, (n->>1)::numeric, n->>2,
         o.ca_minimo, o.ca_basico, o.ca_maximo, o.to_maximo, o.gabarito_m, o.gabarito_sem_limite, o.recuo_frente_m, o.recuo_lateral_m, o.recuo_lateral_alto_m, o.cota_parte_m2, o.max_unidades, o.permeabilidade, o.lote_minimo_m2, o.frente_minima_m, o.outorga_gratuita, o.excecao_fonte, o.restricoes_observacoes
    from jsonb_array_elements(v_novo) n
    left join app.analise_zoneamentos o on o.analise_id = v_ant and o.inscricao_id is not distinct from p_inscricao
                                       and o.zoneamento_id = (n->>0)::uuid;
  return v_an;
end $$;

-- Parte do terreno sem inscrição: as zonas tiradas pela poligonal do terreno,
-- fora dos lotes (o front cruza a poligonal com a camada de zoneamento).
-- Lista vazia tira essa parte (o terreno ficou todo coberto por lotes).
create or replace function app.registrar_zonas_sem_inscricao(p_terreno uuid, p_zonas jsonb, p_fonte text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  return app._substituir_zonas(t, null, p_zonas, coalesce(nullif(trim(p_fonte), ''), 'Poligonal do terreno (parte sem inscrição)'));
end $$;

-- Zonas de um lote registradas à mão (certidão de uso do solo, consulta prévia...),
-- pela ficha, aba Parâmetros, "Registrar zonas": mesma troca de app._substituir_zonas,
-- com a fonte obrigatória; p_inscricao nulo = parte do terreno sem inscrição.
create or replace function app.registrar_zonas_lote(p_terreno uuid, p_inscricao uuid, p_zonas jsonb, p_fonte text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if nullif(trim(p_fonte), '') is null then raise exception 'Informe a fonte das zonas' using errcode = '22023'; end if;
  if p_inscricao is not null and not exists (select 1 from app.inscricoes_municipais where id = p_inscricao and terreno_id = t.id) then
    raise exception 'O lote é de outro terreno' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(p_zonas, '[]')) <> 'array' or jsonb_array_length(coalesce(p_zonas, '[]')) = 0 then
    raise exception 'Informe ao menos uma zona' using errcode = '22023';
  end if;
  return app._substituir_zonas(t, p_inscricao, p_zonas, trim(p_fonte));
end $$;

-- Parâmetro urbanístico do catálogo da empresa: cria (p_id nulo; precisa de
-- zona, tipo e fonte) ou altera. Desativar = ativo false; a linha nunca é
-- apagada (a auditoria guarda cada mudança).
create or replace function app.salvar_zona_parametro(p_empresa uuid, p_id uuid, p_dados jsonb)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare r app.zona_parametros;
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['zoneamento_id','tipo','uso','macrozona','lote_area_min_m2','lote_area_max_m2','permitido',
    'ca_minimo','ca_basico','ca_maximo','to_maximo','to_lote_grande','to_corte_m2','gabarito_m','gabarito_sem_limite','recuo_frente_m',
    'recuo_lateral_m','recuo_lateral_alto_m','cota_parte_m2','max_unidades','permeabilidade','lote_minimo_m2','frente_minima_m',
    'outorga_gratuita','regras','fonte_norma','fonte_dispositivo','fonte_url','situacao','ativo']);
  if p_id is null then
    r := jsonb_populate_record(null::app.zona_parametros, p_dados);
    if r.zoneamento_id is null or r.tipo is null or coalesce(trim(r.fonte_norma), '') = '' then
      raise exception 'Parâmetro novo precisa de zona, tipo de empreendimento e fonte' using errcode = '22023';
    end if;
    insert into app.zona_parametros (empresa_id, zoneamento_id, tipo, uso, macrozona, lote_area_min_m2, lote_area_max_m2, permitido,
      ca_minimo, ca_basico, ca_maximo, to_maximo, to_lote_grande, to_corte_m2, gabarito_m, gabarito_sem_limite, recuo_frente_m,
      recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m,
      outorga_gratuita, regras, fonte_norma, fonte_dispositivo, fonte_url, situacao, ativo)
    values (p_empresa, r.zoneamento_id, r.tipo, r.uso, r.macrozona, r.lote_area_min_m2, r.lote_area_max_m2, coalesce(r.permitido, true),
      r.ca_minimo, r.ca_basico, r.ca_maximo, r.to_maximo, r.to_lote_grande, r.to_corte_m2, r.gabarito_m, coalesce(r.gabarito_sem_limite, false), r.recuo_frente_m,
      r.recuo_lateral_m, r.recuo_lateral_alto_m, r.cota_parte_m2, r.max_unidades, r.permeabilidade, r.lote_minimo_m2, r.frente_minima_m,
      r.outorga_gratuita, r.regras, trim(r.fonte_norma), r.fonte_dispositivo, r.fonte_url, coalesce(r.situacao, 'confirmado'), coalesce(r.ativo, true))
    returning id into r.id;
    return r.id;
  end if;
  select * into r from app.zona_parametros where id = p_id and empresa_id = p_empresa for update;
  if not found then raise exception 'Parâmetro não encontrado' using errcode = 'P0002'; end if;
  r := jsonb_populate_record(r, p_dados);
  if coalesce(trim(r.fonte_norma), '') = '' then raise exception 'O parâmetro precisa da fonte' using errcode = '22023'; end if;
  update app.zona_parametros set
    zoneamento_id = r.zoneamento_id, tipo = r.tipo, uso = r.uso, macrozona = r.macrozona,
    lote_area_min_m2 = r.lote_area_min_m2, lote_area_max_m2 = r.lote_area_max_m2, permitido = coalesce(r.permitido, true),
    ca_minimo = r.ca_minimo, ca_basico = r.ca_basico, ca_maximo = r.ca_maximo,
    to_maximo = r.to_maximo, to_lote_grande = r.to_lote_grande, to_corte_m2 = r.to_corte_m2,
    gabarito_m = r.gabarito_m, gabarito_sem_limite = coalesce(r.gabarito_sem_limite, false),
    recuo_frente_m = r.recuo_frente_m, recuo_lateral_m = r.recuo_lateral_m, recuo_lateral_alto_m = r.recuo_lateral_alto_m,
    cota_parte_m2 = r.cota_parte_m2, max_unidades = r.max_unidades, permeabilidade = r.permeabilidade,
    lote_minimo_m2 = r.lote_minimo_m2, frente_minima_m = r.frente_minima_m, outorga_gratuita = r.outorga_gratuita,
    regras = r.regras, fonte_norma = trim(r.fonte_norma), fonte_dispositivo = r.fonte_dispositivo, fonte_url = r.fonte_url,
    situacao = coalesce(r.situacao, 'confirmado'), ativo = coalesce(r.ativo, true)
  where id = p_id;
  return p_id;
end $$;

-- ---------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------
revoke execute on all functions in schema app from public;
grant execute on function
  app.geojson_poligono_valido(jsonb), app.distancia_km(double precision, double precision, double precision, double precision), app.minhas_empresas(), app.empresas_edicao(), app.papel(uuid), app.eh_membro(uuid), app.eh_gestor(uuid), app.exigir_membro(uuid), app.exigir_editor(uuid),
  app.nivel_papel(text), app.eh_administrador(uuid), app.exigir_administrador(uuid), app.eh_superior(uuid, uuid, uuid),
  app.salvar_terreno(uuid, int, jsonb), app.desfazer_alteracao(bigint),
  app.salvar_entorno(uuid, double precision, double precision, jsonb, boolean),
  app.excluir_lugar_entorno(uuid, text), app.restaurar_lugar_entorno(uuid, text),
  app.excluir_ponto_terreno(uuid, uuid), app.restaurar_ponto_terreno(uuid, uuid),
  app.salvar_distancias_pontos(uuid, double precision, double precision, jsonb),
  app.registrar_consulta_lote(uuid, jsonb, jsonb, numeric, jsonb, jsonb, text[], boolean), app.registrar_consulta_area(uuid, jsonb, text[]), app.cartorio_da_prefeitura(uuid, text), app.zona_da_prefeitura(uuid, text),
  app.classificar_topografia(uuid, numeric, numeric), app.registrar_topografia(uuid, numeric, numeric, numeric, numeric, text), app.salvar_topografia_config(uuid, numeric, numeric, numeric, numeric, numeric, numeric, numeric),
  app.registrar_zonas_sem_inscricao(uuid, jsonb, text), app.registrar_zonas_lote(uuid, uuid, jsonb, text), app.salvar_zona_parametro(uuid, uuid, jsonb),
  app.parametros_zona(uuid, uuid, text, text, numeric, text),
  app.buscar_duplicados(uuid, text, text, text, text, text),
  app.terrenos_sobrepostos(uuid, jsonb, uuid),
  app.abrir_negociacao(uuid, uuid),
  app.registrar_oferta(uuid, numeric, text, uuid, text, text, date, date, numeric, uuid, numeric, jsonb, jsonb),
  app.salvar_parte(uuid, uuid, jsonb), app.remover_parte(uuid, text), app.excluir_parte(uuid),
  app.definir_temperatura(uuid, int), app.definir_oferta_referencia(uuid, uuid),
  app.checar_avanco(uuid), app.checar_passagem(uuid, text, text),
  app.mover_etapa(uuid, boolean, text), app.mover_para_etapa(uuid, text, boolean, text), app.mover_subetapa(uuid, text, boolean, text),
  app.encerrar_processo(uuid, text, text, text, date, text, boolean, text, text), app.retomar_processo(uuid),
  app.decidir_aprovacao(uuid, boolean, text), app.cancelar_aprovacao(uuid),
  app.abrir_fase(uuid, text, boolean, text), app.fases_do_terreno(uuid),
  app.salvar_fase(uuid, text, jsonb), app.apagar_fase(uuid, text),
  app.adicionar_dependencia(uuid, text, text, text, text), app.remover_dependencia(uuid),
  app.salvar_etapa(uuid, text, text, jsonb), app.apagar_etapa(uuid, text, text), app.configurar_status(uuid, text, text, jsonb),
  app.salvar_subetapa(uuid, text, text, jsonb), app.apagar_subetapa(uuid, text, text),
  app.adicionar_prerequisito(uuid, text, text, text, text), app.remover_prerequisito(uuid),
  app.salvar_motivo(uuid, text, text, jsonb), app.apagar_motivo(uuid, text, text),
  app.salvar_checklist(uuid, text, text, text, boolean, int, text, jsonb), app.remover_checklist(uuid, text, text, text),
  app.registrar_proposta(uuid, text, numeric, text, text, date, date, text, uuid[]), app.atualizar_status_proposta(uuid, text), app.excluir_proposta(uuid),
  app.vincular_viabilidade(uuid, text, numeric, numeric, uuid),
  app.registrar_documento(uuid, text, text, text, uuid, uuid, uuid, text, bigint, date, uuid), app.revisar_documento(uuid, boolean),
  app.arquivar_terreno(uuid, text), app.reativar_terreno(uuid)
to authenticated;
