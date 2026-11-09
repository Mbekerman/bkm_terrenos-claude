-- Prova 06b (I3, controle): o administrador da empresa "Outra SA" cria, na empresa dele, um quadro que
-- aponta para o terreno A003 da BKM Teste, e mede o efeito. Tudo desfeito no fim.
\i comum.sql
\set outra `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from app.empresas where nome='Outra SA'"`
\set ter `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select id from app.terrenos where codigo='A003'"`
\set proc `psql -h /tmp -p 54340 -U postgres -d postgres -At -c "select p.id from app.processos p join app.terrenos t on t.id=p.terreno_id where t.codigo='A003' and p.parte_id is null and p.status='ativo' and p.fase='novos_negocios'"`
begin;
select pg_temp.como('diretor@bkm.test') \gset x_
select 'CONTROLE: sem o quadro da Outra SA, o avanço' as k, app.mover_para_etapa(:'proc', 'estudos', true, 'controle') is not null as moveu;
reset role;
rollback;
