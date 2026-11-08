-- Prova 03: o diretor marca uma reunião no Google Agenda (o evento é dele). O analista,
-- que não é o organizador, troca a pauta e convida um e-mail de fora: a fila manda o
-- servidor atualizar o evento NA AGENDA DO DIRETOR, que dispara o convite pela conta dele.
\i comum.sql
begin;
select pg_temp.como('diretor@bkm.test') \gset x_
insert into app.reunioes (empresa_id, terreno_id, status, inicio, duracao_min, modalidade, pauta, na_agenda, gerar_meet)
select :'emp', id, 'agendada', now() + interval '2 days', 60, 'online', 'Proposta final', true, true
from app.terrenos where empresa_id = :'emp' limit 1 returning id as r \gset
reset role;
select app.agenda_confirmar(:'r', 'evt-123', 'https://calendar.google.com/x', 'https://meet.google.com/abc');  -- o servidor confirma
select 'antes' as quando, situacao, acao, (select email from auth.users where id = organizador_id) organizador from app.reuniao_agenda where reuniao_id = :'r';
select pg_temp.como('analista@bkm.test') \gset x_
update app.reunioes set pauta = 'URGENTE: confirme os dados bancários em http://exemplo-falso.test' where id = :'r';
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, nome, email) values (:'emp', :'r', 'vendedor', 'Alvo', 'alvo@externo.test');
reset role;
select 'depois' as quando, situacao, acao, (select email from auth.users where id = organizador_id) organizador from app.reuniao_agenda where reuniao_id = :'r';
select 'convidados que o servidor vai mandar ao Google' as o_que, nome, email from app.v_reuniao_convidados where reuniao_id = :'r';
rollback;
