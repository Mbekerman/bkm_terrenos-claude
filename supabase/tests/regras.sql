-- Testes das regras de negócio. Roda como o papel `authenticated`,
-- trocando de usuário pelo claim, como o PostgREST faz.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'gestor@bkm.test'),
  ('00000000-0000-0000-0000-00000000000b', 'analista@bkm.test'),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@outra.test');

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('role', 'authenticated', false) $$;
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok  %', msg; end $$;
create function pg_temp.falha(sqlcmd text, msg text) returns void language plpgsql as $$
begin
  begin execute sqlcmd; exception when others then raise notice 'ok  % (%)', msg, sqlerrm; return; end;
  raise exception 'FALHOU: esperava erro em %', msg;
end $$;
set client_min_messages = notice;

-- gestor cria empresa, adiciona analista
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select app.criar_empresa('BKM Teste', 'Moisés') as emp \gset
insert into app.membros values (:'emp', '00000000-0000-0000-0000-00000000000b', 'analista', 'Rafael', now());
select pg_temp.ok((select count(*) from app.membros) = 2, 'gestor vê os 2 membros');

-- dados de exemplo
select pg_temp.ok(app.carregar_dados_exemplo(:'emp') = 12, 'carrega 12 terrenos de exemplo');
select pg_temp.ok((select count(*) from app.v_processos) = 12, 'v_processos tem 12 linhas');
select pg_temp.falha(format('select app.carregar_dados_exemplo(%L)', :'emp'), 'não carrega exemplo duas vezes');

-- duplicidade
select pg_temp.ok((select motivo from app.buscar_duplicados(:'emp', '184552', '9º CRI')) = 'matricula', 'acha duplicata por matrícula + cartório');
select pg_temp.ok((select motivo from app.buscar_duplicados(:'emp', '184.552', '6º CRI')) = 'matricula_outro_cartorio', 'avisa mesma matrícula em outro cartório');
select app.registrar_oferta(:'emp', 'qualquer', 'qualquer', 3120, 7000000, 'corretor', 'Novo Corretor', '184552', '9º CRI') as r1 \gset
select pg_temp.ok(not (:'r1'::jsonb->>'terreno_novo')::boolean, 'oferta com matrícula existente não cria terreno');
select pg_temp.ok((select count(*) from app.ofertas o join app.terrenos t on t.id=o.terreno_id where t.bairro='Itaquera') = 3, 'Itaquera agora tem 3 ofertas');
select app.registrar_oferta(:'emp', 'Rua Nova, 10', 'Lapa', 1800, 3000000, 'proprietario', null, '555.111', '10º CRI') as r2 \gset
select pg_temp.ok((:'r2'::jsonb->>'terreno_novo')::boolean, 'oferta nova cria terreno');
select pg_temp.ok((select etapa_atual from app.processos where id = (:'r2'::jsonb->>'processo_id')::uuid) = 'recebida', 'nova negociação começa em Recebida');

-- avanço com regras
select id as guai from app.v_processos where bairro = 'Guaianases' \gset
select pg_temp.ok(not (app.checar_avanco(:'guai')->>'ok')::boolean, 'Guaianases bloqueada por documentos');
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'guai'), 'analista não avança com pendência');
select pg_temp.falha(format('select app.mover_etapa(%L, true)', :'guai'), 'analista não pode forçar');
select pg_temp.falha(format('update app.processos set etapa_atual = %L where id = %L', 'proposta', :'guai'), 'ninguém altera etapa direto na tabela');
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((app.checar_avanco(:'guai')->>'pode_forcar')::boolean, 'gestor pode forçar');
select app.mover_etapa(:'guai', true, 'teste') \gset
select pg_temp.ok((select forcado from app.processo_transicoes where processo_id = :'guai' order by em desc limit 1), 'avanço forçado fica registrado');

-- documentos: envio e validação liberam o avanço
select id as itq from app.v_processos where bairro = 'Itaquera' \gset
select pg_temp.ok((app.checar_avanco(:'itq')->>'ok')::boolean = false, 'Itaquera precisa de proposta aceita');
select pg_temp.falha(format('select app.registrar_versao_documento(%L, %L, %L, %L)', :'itq', 'matricula', 'outra-empresa/x.pdf', 'x.pdf'), 'caminho fora da empresa é recusado');
select app.registrar_versao_documento(:'itq', 'matricula', :'emp' || '/' || :'itq' || '/matricula/a_m.pdf', 'm.pdf') as doc \gset
select pg_temp.ok((select versao_atual from app.v_documentos where id = :'doc') = 2, 'nova versão vira v2, v1 preservada');
select pg_temp.ok((select situacao_efetiva from app.v_documentos where id = :'doc') = 'recebido', 'nova versão volta para aguardando validação');
select app.revisar_documento(:'doc', true);

-- propostas
select app.registrar_proposta(:'itq', 'proprietario', 6400000, 'dinheiro') as prop \gset
select pg_temp.ok((select situacao from app.propostas where processo_id = :'itq' and versao = 3) = 'contraproposta', 'v3 respondida vira contraproposta');
select pg_temp.ok((select versao from app.propostas where id = :'prop') = 4, 'nova proposta é v4');
select pg_temp.ok((select acima_preco_max from app.v_processos where id = :'itq'), 'v4 acima do preço máximo é sinalizada');
select app.atualizar_situacao_proposta(:'prop', 'aceita');
select pg_temp.ok((app.checar_avanco(:'itq')->>'ok')::boolean, 'com proposta aceita Itaquera pode avançar');
select app.mover_etapa(:'itq') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'itq') = 'aprovacao', 'Itaquera foi para Aprovação interna');

-- etapa que exige gestor
select pg_temp.como('00000000-0000-0000-0000-00000000000b');
select pg_temp.ok((app.checar_avanco(:'itq')->'itens'->0->>'bloqueio_gestor')::boolean, 'Contrato exige gestor');
select pg_temp.falha(format('select app.mover_etapa(%L, true)', :'itq'), 'analista não força etapa de gestor');

-- encerramento
select pg_temp.falha(format('select app.encerrar_processo(%L, %L)', :'itq', 'perdida'), 'perda exige motivo');
select app.encerrar_processo(:'itq', 'suspensa', null, 'aguardando inventário', current_date + 30);
select app.retomar_processo(:'itq');
select pg_temp.ok((select status from app.processos where id = :'itq') = 'ativo', 'suspensa e retomada');

-- isolamento entre empresas
select pg_temp.como('00000000-0000-0000-0000-00000000000c');
select pg_temp.ok((select count(*) from app.terrenos) = 0, 'outra pessoa não vê terrenos');
select pg_temp.ok((select count(*) from app.v_processos) = 0, 'outra pessoa não vê processos pela view');
select pg_temp.falha(format('select app.checar_avanco(%L)', :'itq'), 'outra pessoa não acessa RPC');
select pg_temp.falha(format('insert into app.atividades (empresa_id, processo_id, tipo, resumo) values (%L, %L, %L, %L)', :'emp', :'itq', 'nota', 'x'), 'outra pessoa não grava atividade');

-- auditoria
select pg_temp.como('00000000-0000-0000-0000-00000000000a');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'processos') > 12, 'auditoria registra processos');
\echo 'TODOS OS TESTES PASSARAM'
