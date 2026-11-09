-- Prova 02: o analista NÃO vê um cartão Restrito, mas (a) acha o id dele em app.mencoes e
-- (b) lê as etiquetas e os campos personalizados dele pelo oráculo fluxo._condicoes_ok
-- (security definer, exposto a authenticated, sem conferir quem chama). Desfeito no fim.
\i comum.sql
begin;
-- o diretor cria um cartão Restrito só com o gestor, com etiqueta "Jurídico", "Valor do laudo" = 1.500.000 e lista "Cartório" = opção X
select pg_temp.como('diretor@bkm.test') \gset x_
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, visibilidade)
select q.empresa_id, q.id, (select id from fluxo.listas where quadro_id = q.id and tipo = 'aberta' limit 1),
       'Due diligence sigilosa', null, 'restrito'
from fluxo.quadros q where q.empresa_id = :'emp' limit 1 returning id as alvo \gset
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'alvo', :'gestor', 'executor');
update fluxo.tarefas set descricao = 'Ver com @gestor o passivo' where id = :'alvo';
insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (:'emp', :'alvo', '67060973-8be1-4e9d-9741-41401d3c3f0d');
insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, numero) values (:'emp', :'alvo', 'a546b09b-1c7d-411c-93a3-b808c6940cf7', 1500000);
-- agora o analista
select pg_temp.como('analista@bkm.test') \gset x_
select 'analista vê o cartão?' as pergunta, count(*) as linhas from fluxo.tarefas where id = :'alvo';
select 'app.mencoes entrega o id do cartão restrito' as achado, origem_tabela, origem_id = :'alvo' as e_o_cartao,
       (select arroba from app.usuarios where user_id = m.user_id) as mencionado, (select arroba from app.usuarios where user_id = m.por) as autor
  from app.mencoes m where origem_id = :'alvo';
-- oráculo: monta uma "automação" e uma "tarefa" com o id do cartão e pergunta
select 'tem a etiqueta Jurídico?' as pergunta,
  fluxo._condicoes_ok(jsonb_populate_record(null::fluxo.automacoes, '{"condicoes":[{"tipo":"etiqueta","etiqueta":"67060973-8be1-4e9d-9741-41401d3c3f0d","tem":true}]}'),
   jsonb_populate_record(null::fluxo.tarefas, jsonb_build_object('id', :'alvo'))) as resposta;
select 'Valor do laudo = 1.500.000?' as pergunta,
  fluxo._condicoes_ok(jsonb_populate_record(null::fluxo.automacoes, '{"condicoes":[{"tipo":"campo","campo":"a546b09b-1c7d-411c-93a3-b808c6940cf7","op":"igual","valor":"1500000"}]}'),
   jsonb_populate_record(null::fluxo.tarefas, jsonb_build_object('id', :'alvo'))) as resposta;
select 'Valor do laudo = 1.400.000?' as pergunta,
  fluxo._condicoes_ok(jsonb_populate_record(null::fluxo.automacoes, '{"condicoes":[{"tipo":"campo","campo":"a546b09b-1c7d-411c-93a3-b808c6940cf7","op":"igual","valor":"1400000"}]}'),
   jsonb_populate_record(null::fluxo.tarefas, jsonb_build_object('id', :'alvo'))) as resposta;
-- o mesmo oráculo responde para o diretor de OUTRA empresa
select pg_temp.como('intruso@outra.test') \gset x_
select 'intruso de outra empresa: tem a etiqueta?' as pergunta,
  fluxo._condicoes_ok(jsonb_populate_record(null::fluxo.automacoes, '{"condicoes":[{"tipo":"etiqueta","etiqueta":"67060973-8be1-4e9d-9741-41401d3c3f0d","tem":true}]}'),
   jsonb_populate_record(null::fluxo.tarefas, jsonb_build_object('id', :'alvo'))) as resposta,
  fluxo.papel_tarefa(:'alvo', :'gestor') as papel_do_gestor_no_cartao;
reset role;
rollback;
