-- Prova 01: o analista conclui uma tarefa atrasada com a data de conclusão que quiser
-- (e cria uma tarefa já concluída no passado). Tudo desfeito no fim.
\i comum.sql
begin;
select pg_temp.como('analista@bkm.test') \gset x_
-- uma tarefa pública aberta, sem aprovador nem checklist, que o analista edita
create temp table alvo as
  select k.id, k.prazo from fluxo.tarefas k join fluxo.listas l on l.id = k.lista_id
  where k.visibilidade = 'publico' and k.concluida_em is null and not k.modelo and k.arquivada_em is null and l.tipo = 'aberta'
    and fluxo.nivel_cartao(fluxo.papel_tarefa(k.id)) >= 3 and cardinality(fluxo.pendencias_conclusao(k.id)) = 0
  limit 1;
update fluxo.tarefas set prazo = current_date - 30 where id = (select id from alvo);   -- atrasada há 30 dias
update fluxo.tarefas set concluida_em = '2020-01-01 10:00-03' where id = (select id from alvo);
select 'conclusão gravada:', codigo, prazo, concluida_em, (select email from app.usuarios where user_id = concluida_por) por, atrasada
  from fluxo.v_tarefas where id = (select id from alvo);
-- tarefa criada direto na lista que conclui, já concluída "em 2019"
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, prazo, concluida_em)
select q.empresa_id, q.id, (select id from fluxo.listas where quadro_id = q.id and tipo = 'conclui' limit 1), 'Feita em 2019', '2019-12-01', '2019-12-01'
from fluxo.quadros q where q.empresa_id = :'emp' limit 1
returning codigo, concluida_em;
reset role;
rollback;
