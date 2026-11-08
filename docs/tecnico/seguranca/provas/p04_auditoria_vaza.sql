-- Prova 04: o log (app.auditoria) mostra a qualquer membro, inclusive `basico`, linhas que a RLS
-- da tabela de origem esconde: equipe prevista (só administrador), regra de automação e lembrete
-- de um cartão Restrito, modelo de tarefas pessoal de outro usuário. Desfeito no fim.
\i comum.sql
begin;
select pg_temp.como('diretor@bkm.test') \gset x_
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, visibilidade)
select q.empresa_id, q.id, (select id from fluxo.listas where quadro_id = q.id and tipo = 'aberta' limit 1), 'Cartão sigiloso', 'restrito'
from fluxo.quadros q where q.empresa_id = :'emp' limit 1 returning id as alvo, quadro_id as qd \gset
insert into fluxo.automacoes (empresa_id, tarefa_id, nome, gatilho, acoes)
values (:'emp', :'alvo', 'Avisar o advogado do litígio com o vendedor', 'concluida', '[{"tipo":"avisar","para":["responsavel"],"texto":"Litígio: avisar Dr. Fulano"}]');
insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes, destinatario_id) values (:'emp', 'tarefas', :'alvo', 3, :'diretor');
insert into fluxo.modelos_quadro (empresa_id, nome, dono_id) values (:'emp', 'Meu modelo pessoal: demissões', :'diretor');
insert into app.equipe_prevista (empresa_id, email, papel, administrador, nome) values (:'emp', 'novo.diretor@bkm.test', 'diretor', true, 'Contratação sigilosa');
select pg_temp.como('joao.silva@bkm.test') \gset x_
select 'papel de quem consulta' as k, papel from app.membros where user_id = auth.uid();
select 'RLS da tabela de origem' as k,
  (select count(*) from app.equipe_prevista) equipe_prevista, (select count(*) from fluxo.automacoes where tarefa_id = :'alvo') automacoes_do_cartao,
  (select count(*) from app.lembretes where origem_id = :'alvo') lembretes_do_cartao, (select count(*) from fluxo.modelos_quadro where nome like 'Meu modelo%') modelo_pessoal;
select 'o log entrega' as k, tabela, left(coalesce(depois->>'nome', depois->>'email', depois->>'origem_id'), 60) as conteudo,
       depois->>'papel' papel, depois->>'administrador' adm, depois->>'tarefa_id' as tarefa_id
from app.auditoria where tabela in ('equipe_prevista','automacoes','lembretes','modelos_quadro') and acao = 'insert'
  and em > now() - interval '1 minute' order by id;
reset role;
rollback;
