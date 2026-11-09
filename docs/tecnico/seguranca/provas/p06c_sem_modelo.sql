-- Prova 06c (I3, sem a regra de modelo): o administrador da empresa "Outra SA" cria, na empresa dele, um quadro que
-- aponta para o terreno A003 da BKM Teste, e mede o efeito. Tudo desfeito no fim.
\i comum.sql
\set outra `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from app.empresas where nome='Outra SA'"`
\set ter `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from app.terrenos where codigo='A003'"`
\set proc `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select p.id from app.processos p join app.terrenos t on t.id=p.terreno_id where t.codigo='A003' and p.parte_id is null and p.status='ativo' and p.fase='novos_negocios'"`
begin;
select pg_temp.como('intruso@outra.test') \gset x_
select fluxo.quadro_de(:'outra', 'terreno', :'ter', 'Quadro estranho') as q2 \gset
select 'quadro criado na Outra SA apontando para A003' as k, :'q2' is not null as ok;
-- (a) tarefa no quadro dele: o trigger preenche processo, fase e etapa do terreno da BKM?
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo)
values (:'outra', :'q2', (select id from fluxo.listas where quadro_id = :'q2' and tipo = 'aberta' limit 1), 'Tarefa do intruso')
returning id as tx \gset
select '(a) a tarefa dele ganhou' as k, processo_id is not null as processo_bkm, etapa, subetapa from fluxo.tarefas where id = :'tx';
select '(a) leituras diretas' as k,
  (select count(*) from app.v_terrenos where id = :'ter') v_terrenos,
  (select count(*) from app.v_tarefas_funil where terreno_id = :'ter') v_tarefas_funil,
  (select count(*) from app.processos where id = :'proc') processos,
  app.tarefas_abertas_fase(:'proc') tarefas_abertas_fase,
  app.jornada_processo(:'proc') is not null jornada,
  app.campo_cartao(:'ter', 'terreno.nome') campo_cartao,
  (select count(*) from fluxo.v_tarefas where quadro_id = :'q2') suas_tarefas;
reset role;
update app.etapa_regras set ativo = false where modelo_id is not null and etapa = 'estudos';
-- (b)(c)(d) a BKM move A003 para Estudos (etapa com regras que travam)
select pg_temp.como('diretor@bkm.test') \gset x_
select app.mover_para_etapa(:'proc', 'estudos', true, 'teste I3') is not null as moveu;
reset role;
select '(b) tarefas de regra criadas, por empresa do quadro' as k, q.empresa_id = :'outra' as no_quadro_da_outra, count(*)
  from app.tarefas_etapa e join fluxo.tarefas k on k.id = e.tarefa_id join fluxo.quadros q on q.id = k.quadro_id
 where e.processo_id = :'proc' group by 1, 2;
select '(b) a tarefa do intruso depois do avanço' as k, etapa, subetapa, arquivada_em is not null arquivada from fluxo.tarefas where id = :'tx';
select '(c) pendências do avanço da BKM citam a tarefa do intruso?' as k,
  coalesce(app.checar_passagem(:'proc')::text like '%Tarefa do intruso%', false) as cita;
select '(d) avisos ao intruso sobre o A003' as k, count(*) from app.notificacoes
 where destinatario_id = (select id from auth.users where email='intruso@outra.test') and terreno_id = :'ter';
select '(d) avisos da BKM com origem na tarefa dele' as k, count(*) from app.notificacoes where origem_id = :'tx';
rollback;
