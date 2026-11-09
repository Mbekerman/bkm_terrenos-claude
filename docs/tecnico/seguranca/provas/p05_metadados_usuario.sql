-- Prova 05: no Supabase, o próprio usuário muda o raw_user_meta_data pelo navegador
-- (supabase.auth.updateUser({ data: { full_name, avatar_url } })). O GoTrue grava isso em
-- auth.users e o trigger t_usuario_login copia para app.usuarios sem validar: nome falso
-- (se passa por outra pessoa) e foto em qualquer endereço (contorna app.salvar_minha_foto).
-- Aqui o UPDATE em auth.users faz o papel do GoTrue. Desfeito no fim.
\i comum.sql
begin;
select 'antes' as quando, email, nome, foto_url, arroba from app.usuarios where email = 'joao.silva@bkm.test';
-- o que o GoTrue grava quando o usuário chama updateUser({data: ...}) com o próprio token
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"full_name":"Moisés Bekerman (Diretor)","avatar_url":"https://rastreador.exemplo.test/pixel.gif?quem=todos"}'
 where email = 'joao.silva@bkm.test';
select 'depois' as quando, email, nome, foto_url, arroba from app.usuarios where email = 'joao.silva@bkm.test';
-- a mesma foto pela RPC oficial é recusada
select pg_temp.como('joao.silva@bkm.test') \gset x_
select app.salvar_minha_foto('https://rastreador.exemplo.test/pixel.gif');
reset role;
rollback;
