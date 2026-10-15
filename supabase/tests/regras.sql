-- Testes das regras de negócio. Roda como o papel `authenticated`,
-- trocando de usuário pelo claim, como o PostgREST faz.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'gestor@bkm.test'),
  ('00000000-0000-0000-0000-00000000000b', 'analista@bkm.test'),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@outra.test'),
  ('00000000-0000-0000-0000-00000000000d', 'diretoria@bkm.test');

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

\set gestor   '00000000-0000-0000-0000-00000000000a'
\set analista '00000000-0000-0000-0000-00000000000b'
\set intruso  '00000000-0000-0000-0000-00000000000c'
\set leitor   '00000000-0000-0000-0000-00000000000d'

-- ---------------------------------------------------------------------
\echo '# empresa e equipe'
select pg_temp.como(:'gestor');
select app.criar_empresa('BKM Teste', 'Moisés') as emp \gset
insert into app.membros values (:'emp', :'analista', 'analista', 'Rafael', now()), (:'emp', :'leitor', 'leitura', 'Diretoria', now());
select pg_temp.ok((select count(*) from app.membros) = 3, 'gestor vê os 3 membros');
select id as sp from app.municipios where codigo_ibge = '3550308' \gset
select pg_temp.ok((select count(*) from app.zoneamentos where municipio_id = :'sp') > 30, 'zoneamentos de SP carregados');

-- ---------------------------------------------------------------------
\echo '# cadastro rápido do terreno'
select pg_temp.falha(format($$insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id) values (%L, 'Sem local', %L, 'corretor', %L)$$, :'emp', :'gestor', :'sp'),
  'cadastro exige localização mínima');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, logradouro, numero, bairro, zona)
values (:'emp', 'Terreno Av. Cupecê — esquina', :'gestor', 'corretor', :'sp', 'Av. Cupecê', '1500', 'Cidade Ademar', 'sul')
returning id as t1 \gset
select pg_temp.ok((select codigo from app.terrenos where id = :'t1') ~ '^TER-\d{6}$', 'código TER-000001 gerado');
select pg_temp.ok((select topografia from app.terrenos where id = :'t1') = 'nao_informado', 'campo não preenchido fica "não informado"');
select versao as v from app.terrenos where id = :'t1' \gset
select pg_temp.falha(format($$update app.terrenos set zona = 'leste' where id = %L$$, :'t1'), 'terreno não é alterado direto na tabela');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"zona":"centro"}')$$, :'t1', :v), 'zona aceita só as 8 opções');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"area_adotada_m2":2000}')$$, :'t1', :v), 'área adotada exige a fonte');
select app.salvar_terreno(:'t1', :v, '{"area_documental_m2":2000,"area_levantamento_m2":1920,"area_adotada_m2":1920,"fonte_area_adotada":"levantamento","area_construida_existente_m2":300,"area_construida_demolir_m2":180,"cep":"04366-000"}') as v2 \gset
select pg_temp.ok(:v2 = :v + 1, 'salvar sobe a versão');
select pg_temp.ok((select cep from app.terrenos where id = :'t1') = '04366000', 'CEP guardado só com dígitos');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"descricao":"edição velha"}')$$, :'t1', :v), 'edição com versão antiga é recusada');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"area_construida_demolir_m2":400}')$$, :'t1', :v2), 'demolir não passa da área construída');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"codigo":"TER-999999"}')$$, :'t1', :v2), 'campos de controle não mudam');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"poligono_geojson":{"type":"Polygon","coordinates":[[[-46.65,-23.66],[-46.64,-23.66],[-46.64,-23.67]]]}}')$$, :'t1', :v2),
  'polígono aberto é recusado');
select app.salvar_terreno(:'t1', :v2, '{"poligono_geojson":{"type":"Polygon","coordinates":[[[-46.65,-23.66],[-46.64,-23.66],[-46.64,-23.67],[-46.65,-23.66]]]}}') as v3 \gset
select pg_temp.ok((select poligono_geojson is not null from app.terrenos where id = :'t1'), 'polígono válido aceito');
select pg_temp.ok((select atualizado_por from app.terrenos where id = :'t1') = :'gestor', 'atualizado_por preenchido');

-- ---------------------------------------------------------------------
\echo '# matrícula, inscrição, valor venal e IPTU'
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, area_registrada_m2) values (:'emp', :'t1', '184.552', '11º CRI', 2000);
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, area_cadastral_m2) values (:'emp', :'t1', '089.123.0045-6', 1985) returning id as ins \gset
insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, valor_venal_imovel, situacao_iptu, iptu_valor_anual, iptu_parcelas, fonte) values
  (:'ins', :'emp', 2025, 3800000, 'tributado', 41000, 10, 'Carnê 2025');
insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, valor_venal_terreno, valor_venal_construcao, situacao_iptu, iptu_valor_anual, iptu_parcelas, fonte) values
  (:'ins', :'emp', 2026, 3500000, 600000, 'tributado', 45000, 10, 'Carnê 2026');
select pg_temp.ok((select exercicio from app.v_inscricoes where id = :'ins') = 2026, 'inscrição mostra o exercício mais recente');
select pg_temp.ok((select valor_venal_imovel from app.v_inscricoes where id = :'ins') = 4100000, 'venal do imóvel = terreno + construção');
select pg_temp.ok((select iptu_valor_parcela from app.v_inscricoes where id = :'ins') = 4500, 'parcela do IPTU = anual / parcelas');
select pg_temp.ok((select iptu_mensal from app.v_inscricoes where id = :'ins') = 3750 and (select iptu_mensal_origem from app.v_inscricoes where id = :'ins') = 'anual_dividido_por_12', 'mensal = anual / 12 quando não informado');
insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, valor_venal_terreno, valor_venal_construcao, situacao_iptu, iptu_valor_anual, iptu_parcelas, iptu_mensal_informado, fonte) values
  (:'ins', :'emp', 2026, 3500000, 600000, 'tributado', 45000, 10, 4500, 'Certidão corrigida');
select pg_temp.ok((select revisao from app.v_inscricoes where id = :'ins') = 2, 'correção do exercício vira revisão 2');
select pg_temp.ok((select count(*) from app.inscricao_valores where inscricao_id = :'ins' and exercicio = 2026 and not vigente) = 1, 'revisão 1 preservada, não vigente');
select pg_temp.ok((select iptu_mensal_origem from app.v_inscricoes where id = :'ins') = 'informado', 'mensal informado prevalece');
select pg_temp.falha(format($$update app.inscricao_valores set iptu_valor_anual = 1 where inscricao_id = %L$$, :'ins'), 'valor lançado não é editado');
select pg_temp.falha(format($$insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, situacao_iptu, iptu_valor_anual) values (%L, %L, 2027, 'isento', 1000)$$, :'ins', :'emp'), 'isento não tem IPTU a pagar');
select pg_temp.falha(format($$insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, valor_venal_terreno, valor_venal_construcao, valor_venal_imovel) values (%L, %L, 2027, 1, 1, 5)$$, :'ins', :'emp'), 'venal do imóvel bate com a soma');

-- ---------------------------------------------------------------------
\echo '# duplicidade'
select pg_temp.ok((select certeza from app.buscar_duplicados(:'emp', '184552', '11º CRI') limit 1) = 'certa', 'mesma matrícula e cartório = certa');
select pg_temp.ok((select certeza from app.buscar_duplicados(:'emp', '184552', '9º CRI') limit 1) = 'provavel', 'mesma matrícula em outro cartório = provável');
select pg_temp.ok((select count(*) from app.buscar_duplicados(:'emp', p_inscricao => '089.123.0045-6')) = 1, 'acha pela inscrição municipal');
select pg_temp.ok((select certeza from app.buscar_duplicados(:'emp', p_logradouro => 'av. cupecê', p_numero => '1500') limit 1) = 'possivel', 'acha pelo endereço');
select pg_temp.ok((select certeza from app.buscar_duplicados(:'emp', p_inscricao => '089.123.0046-4')) = 'mesma_quadra', 'SQL da mesma quadra avisa vizinho');
select pg_temp.ok((select count(*) from app.buscar_duplicados(:'emp', p_inscricao => '089.124.0046-4')) = 0, 'outra quadra não avisa');
select pg_temp.falha(format($$insert into app.matriculas (empresa_id, terreno_id, numero, cartorio) values (%L, %L, '184552', '11º CRI')$$, :'emp', :'t1'),
  'mesma matrícula no mesmo cartório não entra duas vezes');

-- ---------------------------------------------------------------------
\echo '# confrontações e proprietários'
insert into app.confrontacoes (empresa_id, terreno_id, ordem, tipo, comprimento_m, confrontante) values
  (:'emp', :'t1', 1, 'frente', 42, 'Av. Cupecê'), (:'emp', :'t1', 2, 'lateral_direita', 48.5, 'Lote 12 · matr. 184.553');
select pg_temp.ok((select count(*) from app.confrontacoes where terreno_id = :'t1') = 2, 'segmentos de confrontação registrados');
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social, cpf_cnpj) values (:'emp', 'PF', 'Maria Lins', '123.456.789-09') returning id as pml \gset
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'João Lins') returning id as pjl \gset
select pg_temp.ok((select cpf_cnpj from app.pessoas where id = :'pml') = '12345678909', 'CPF guardado só com dígitos');
select pg_temp.falha(format($$insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social, cpf_cnpj) values (%L, 'PJ', 'X', '123')$$, :'emp'), 'CNPJ precisa de 14 dígitos');
insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao) values (:'emp', :'t1', :'pml', 'proprietario', 60);
select pg_temp.falha(format($$insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao) values (%L, %L, %L, 'proprietario', 50)$$, :'emp', :'t1', :'pjl'), 'participações não passam de 100%');
insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao) values (:'emp', :'t1', :'pjl', 'proprietario', 40);
select pg_temp.ok((select sum(percentual_participacao) from app.terreno_pessoas where terreno_id = :'t1') = 100, 'participações somam 100%');

-- ---------------------------------------------------------------------
\echo '# infraestrutura'
select pg_temp.ok((select count(*) from app.v_terreno_infraestrutura where terreno_id = :'t1' and disponibilidade = 'nao_verificado') = 9, 'os 9 itens começam como não verificados');
select pg_temp.falha(format($$insert into app.terreno_infraestrutura (terreno_id, item, empresa_id, disponibilidade) values (%L, 'agua', %L, 'sim')$$, :'t1', :'emp'),
  'sim/não exige data de verificação');
insert into app.terreno_infraestrutura (terreno_id, item, empresa_id, disponibilidade, data_verificacao, fonte) values (:'t1', 'agua', :'emp', 'sim', current_date, 'Visita');
select pg_temp.ok((select disponibilidade from app.v_terreno_infraestrutura where terreno_id = :'t1' and item = 'agua') = 'sim', 'água registrada como sim');

-- ---------------------------------------------------------------------
\echo '# análise urbanística com dois zoneamentos'
insert into app.analises_urbanisticas (empresa_id, terreno_id, responsavel_id, fonte) values (:'emp', :'t1', :'gestor', 'GeoSampa') returning id as a1 \gset
insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, area_abrangida_m2, gabarito_m_status, ca_status, ca_maximo)
select :'emp', :'a1', id, 1400, 'sem_limite_identificado', 'limitado', 4 from app.zoneamentos where sigla = 'ZEU' and municipio_id = :'sp';
insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, area_abrangida_m2, gabarito_m_status, gabarito_maximo_m, ca_status, ca_maximo)
select :'emp', :'a1', id, 520, 'limitado', 28, 'limitado', 2 from app.zoneamentos where sigla = 'ZM' and municipio_id = :'sp';
select pg_temp.ok((select zoneamentos from app.v_urbanismo_vigente where terreno_id = :'t1') = 'ZEU + ZM', 'terreno com dois zoneamentos');
select pg_temp.ok((select algum_gabarito_sem_limite and ca_maximo = 4 from app.v_urbanismo_vigente where terreno_id = :'t1'), 'sem limite e CA máximo resumidos');
select pg_temp.falha(format($$insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, gabarito_m_status, gabarito_maximo_m) select %L, %L, id, 'sem_limite_identificado', 30 from app.zoneamentos where sigla = 'ZC' limit 1$$, :'emp', :'a1'),
  'sem limite não leva valor');
select pg_temp.falha(format($$insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, ca_status) select %L, %L, id, 'limitado' from app.zoneamentos where sigla = 'ZC' limit 1$$, :'emp', :'a1'),
  'limitado exige o valor');
select pg_temp.falha(format($$insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, ca_status, ca_maximo) select %L, %L, id, 'limitado', 0 from app.zoneamentos where sigla = 'ZC' limit 1$$, :'emp', :'a1'),
  'CA nunca é zero');
insert into app.analises_urbanisticas (empresa_id, terreno_id, fonte) values (:'emp', :'t1', 'Certidão de uso do solo') returning id as a2 \gset
select pg_temp.ok((select status from app.analises_urbanisticas where id = :'a1') = 'substituida', 'nova análise aposenta a anterior');
select pg_temp.ok((select count(*) from app.analise_zoneamentos where analise_id = :'a1') = 2, 'análise anterior preservada');

-- ---------------------------------------------------------------------
\echo '# corretores e ofertas'
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'Marcos Lemos') returning id as pm \gset
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'Juliana Reis') returning id as pj \gset
insert into app.corretores (empresa_id, pessoa_id, creci, imobiliaria) values (:'emp', :'pm', '123456-F', 'Lemos Imóveis') returning id as c1 \gset
insert into app.corretores (empresa_id, pessoa_id, creci, imobiliaria) values (:'emp', :'pj', '654321-F', 'Prime Terrenos') returning id as c2 \gset
select app.registrar_oferta(:'t1', 9000000, 'permuta_com_torna', :'c1', '60% em dinheiro, 40% em unidades', 'Aceita permuta de até 40%') as r1 \gset
select (:'r1'::jsonb->>'processo_id') as neg \gset
select pg_temp.ok((:'r1'::jsonb->>'negociacao_nova')::boolean, 'primeira oferta abre a negociação');
select pg_temp.ok((select principal from app.terreno_corretores where terreno_id = :'t1' and corretor_id = :'c1'), 'primeiro corretor vira principal');
select app.registrar_oferta(:'t1', 8700000, 'dinheiro', :'c2', p_ofertante => :'pml', p_comissao_valor => 261000) as r2 \gset
select pg_temp.ok((select ofertante_id from app.ofertas where (:'r2'::jsonb->>'oferta_id')::uuid = id) = :'pml', 'oferta registra o ofertante');
select pg_temp.ok(not (:'r2'::jsonb->>'negociacao_nova')::boolean and (:'r2'::jsonb->>'processo_id') = :'neg', 'segunda oferta entra na mesma negociação');
select pg_temp.ok(not (select principal from app.terreno_corretores where terreno_id = :'t1' and corretor_id = :'c2'), 'segundo corretor não é principal');
select pg_temp.ok((select valor_pedido from app.v_terrenos where id = :'t1') = 9000000, 'ficha mostra a oferta de referência');
select pg_temp.ok((select valor_pedido_m2 from app.v_terrenos where id = :'t1') = round(9000000/1920.0, 2), 'valor pedido por m² usa a área adotada');
select pg_temp.falha(format($$insert into app.ofertas (empresa_id, terreno_id, forma_pagamento_pedida) values (%L, %L, 'cheque')$$, :'emp', :'t1'), 'forma de pagamento só nas 5 opções');

-- ---------------------------------------------------------------------
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro) values (:'emp', 'Outro terreno', :'gestor', 'prospeccao', :'sp', 'Sacomã') returning id as tx \gset
select pg_temp.falha(format($$update app.ofertas set terreno_id = %L where terreno_id = %L$$, :'tx', :'t1'), 'oferta não muda de terreno');
select pg_temp.falha(format($$update app.confrontacoes set terreno_id = %L where terreno_id = %L$$, :'tx', :'t1'), 'confrontação não muda de terreno');

\echo '# temperatura'
select app.definir_temperatura(:'neg', 4);
select pg_temp.ok((select temperatura from app.v_terrenos where id = :'t1') = 4, 'temperatura 4 registrada');
select pg_temp.falha(format('select app.definir_temperatura(%L, 6)', :'neg'), 'temperatura só de 1 a 5');
select pg_temp.ok((select count(*) from app.processo_transicoes where processo_id = :'neg' and evento = 'temperatura') = 1, 'mudança de temperatura vai para o histórico');

-- ---------------------------------------------------------------------
\echo '# tarefas'
insert into app.tarefas (empresa_id, terreno_id, processo_id, titulo, responsavel_id, prazo) values
  (:'emp', :'t1', :'neg', 'Cobrar contraproposta', :'analista', current_date - 2),
  (:'emp', :'t1', null,  'Agendar visita técnica', :'gestor', current_date + 3);
select pg_temp.ok((select tarefas_atrasadas from app.v_terrenos where id = :'t1') = 1, 'tarefa vencida e aberta conta como atrasada');
select pg_temp.ok((select proxima_tarefa from app.v_terrenos where id = :'t1') = 'Cobrar contraproposta', 'próxima tarefa = prazo mais cedo');
update app.tarefas set status = 'concluida', resultado = 'Recebida por e-mail' where titulo = 'Cobrar contraproposta';
select pg_temp.ok((select concluida_em is not null from app.tarefas where titulo = 'Cobrar contraproposta'), 'concluir preenche a data');
select pg_temp.ok((select tarefas_atrasadas from app.v_terrenos where id = :'t1') = 0, 'concluída deixa de contar como atrasada');

-- ---------------------------------------------------------------------
\echo '# propostas encadeadas'
select app.registrar_proposta(:'neg', 'bkm', 8000000, 'dinheiro', 'À vista na escritura') as p1 \gset
select app.registrar_proposta(:'neg', 'vendedor', 9000000, 'permuta_com_torna', 'Torna de R$ 3 mi') as p2 \gset
select pg_temp.ok((select status from app.propostas where id = :'p1') = 'recusada', 'contraproposta do vendedor recusa a da BKM');
select pg_temp.ok((select proposta_anterior_id from app.propostas where id = :'p2') = :'p1', 'contraproposta aponta para a anterior');
select app.registrar_proposta(:'neg', 'bkm', 8500000, 'permuta_com_torna', 'R$ 6 mi + 8% em permuta') as p3 \gset
select app.registrar_proposta(:'neg', 'bkm', 8600000, 'permuta_com_torna', 'Ajuste da v3', current_date, current_date + 15) as p4 \gset
select pg_temp.ok((select status from app.propostas where id = :'p3') = 'substituida', 'nova da mesma origem substitui a anterior');
select pg_temp.ok((select versao from app.propostas where id = :'p4') = 4, 'quarta versão');
select pg_temp.falha(format('select app.atualizar_status_proposta(%L, %L)', :'p3', 'aceita'), 'só a última muda de status');

-- ---------------------------------------------------------------------
\echo '# avanço de etapa'
select pg_temp.como(:'analista');
select app.mover_etapa(:'neg') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'viabilidade_inicial', 'Recebido avança sem requisitos');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'neg'), 'Viabilidade inicial exige estudo');
select app.vincular_viabilidade(:'neg', 'Estudo base', 62000000, 15.2, 8400000) \gset
select app.mover_etapa(:'neg') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'negociacao', 'com estudo vai para Negociação');
select pg_temp.ok((select fase_negociacao from app.v_terrenos where id = :'t1') = 'proposta_enviada', 'última proposta da BKM: proposta enviada');
select pg_temp.ok((select acima_preco_max from app.v_terrenos where id = :'t1'), 'proposta da BKM acima do preço máximo sinalizada');
select app.registrar_proposta(:'neg', 'vendedor', 8900000, 'permuta_com_torna', 'Pede 9% em permuta') as p5 \gset
select pg_temp.ok((select fase_negociacao from app.v_terrenos where id = :'t1') = 'contraproposta', 'última proposta do vendedor: contraproposta');
select app.marcar_fase_final(:'neg', true);
select pg_temp.ok((select fase_negociacao from app.v_terrenos where id = :'t1') = 'negociacoes_finais', 'marcação manual: negociações finais');
select pg_temp.ok((select count(*) from app.processo_transicoes where processo_id = :'neg' and evento = 'fase_final') = 1, 'fase final vai para o histórico');
select pg_temp.ok(not (app.checar_avanco(:'neg')->>'ok')::boolean, 'Negociação exige proposta aceita');
select pg_temp.ok((app.checar_avanco(:'neg')->'itens') @> '[{"tipo":"gestor","ok":false}]', 'Minutagem pede aprovação de gestor');
select pg_temp.ok((select acima_preco_max from app.v_terrenos where id = :'t1') is not true, 'contraproposta do vendedor não acende o alerta de preço máximo');
select pg_temp.falha(format('select app.mover_etapa(%L, true, %L)', :'neg', 'x'), 'analista não força');
select pg_temp.falha(format('update app.processos set etapa_atual = %L where id = %L', 'minutagem', :'neg'), 'ninguém altera etapa direto');
select pg_temp.como(:'gestor');
select pg_temp.falha(format('select app.mover_etapa(%L, true)', :'neg'), 'avanço forçado exige justificativa');
select app.mover_etapa(:'neg', true, 'Aceite verbal; formalizar na minuta') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'minutagem', 'gestor leva à Minutagem');
select pg_temp.ok((select forcado from app.processo_transicoes where processo_id = :'neg' and evento = 'avanco' order by em desc limit 1), 'avanço forçado registrado');
select pg_temp.ok((select fase_negociacao from app.v_terrenos where id = :'t1') is null, 'fase só existe dentro da etapa Negociação');
select pg_temp.ok((app.checar_avanco(:'neg')->>'proxima') = 'ganha', 'depois da Minutagem vem o fechamento como ganha');
insert into app.diligencias (empresa_id, terreno_id, processo_id, categoria, titulo, situacao) values
  (:'emp', :'t1', :'neg', 'ambiental', 'Possível contaminação por posto vizinho', 'impeditiva') returning id as dg \gset
select pg_temp.ok((app.checar_avanco(:'neg')->'itens') @> '[{"tipo":"diligencia"}]', 'diligência impeditiva bloqueia o fechamento');
select pg_temp.ok((app.checar_avanco(:'neg')->'itens') @> '[{"tipo":"documento","ok":false}]', 'fechamento exige certidões e minuta');
select pg_temp.ok((select diligencias_impeditivas from app.v_terrenos where id = :'t1') = 1, 'listagem conta diligências impeditivas');
update app.diligencias set situacao = 'resolvida', providencia = 'Laudo de passivo ambiental negativo' where id = :'dg';
select pg_temp.ok((select resolvida_em is not null from app.diligencias where id = :'dg'), 'resolver preenche a data');
select pg_temp.ok(not ((app.checar_avanco(:'neg')->'itens') @> '[{"tipo":"diligencia"}]'), 'diligência resolvida sai das pendências');
select pg_temp.falha(format('select app.mover_para_etapa(%L, %L)', :'neg', 'negociacao'), 'voltar de etapa exige motivo');
select app.mover_para_etapa(:'neg', 'negociacao', false, 'Vendedor reabriu o preço') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'negociacao', 'arrastar para trás volta a etapa');
select pg_temp.ok((select evento from app.processo_transicoes where processo_id = :'neg' order by em desc limit 1) = 'retorno', 'retorno vai para o histórico');
select pg_temp.falha(format('select app.mover_para_etapa(%L, %L)', :'neg', 'ganha'), 'ganha não é destino de arrastar');
select app.mover_para_etapa(:'neg', 'minutagem', true, 'Aceite verbal mantido') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'minutagem', 'gestor arrasta de volta à Minutagem forçando');

-- ---------------------------------------------------------------------
\echo '# reuniões e atas'
select pg_temp.como(:'analista');
insert into app.reunioes (empresa_id, terreno_id, processo_id, inicio, modalidade, local, pauta, resumo) values
  (:'emp', :'t1', :'neg', now() - interval '1 day', 'presencial', 'bkm', 'Preço e forma de pagamento', 'Vendedor aceita estudar permuta')
  returning id as r1 \gset
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade) values (%L, %L, now() - interval '1 hour', 'presencial')$$, :'emp', :'t1'), 'presencial exige local (BKM ou externo)');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade, local) values (%L, %L, now() - interval '1 hour', 'online', 'bkm')$$, :'emp', :'t1'), 'online não tem local');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade) values (%L, %L, now() + interval '2 days', 'online')$$, :'emp', :'t1'), 'reunião realizada não tem data futura');
insert into app.reunioes (empresa_id, terreno_id, processo_id, status, inicio, modalidade, local, endereco) values
  (:'emp', :'t1', :'neg', 'agendada', now() + interval '3 days', 'presencial', 'externo', 'Escritório do advogado do vendedor') returning id as r2 \gset
select pg_temp.ok((select proxima_reuniao_em is not null from app.v_terrenos where id = :'t1'), 'listagem mostra a próxima reunião agendada');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, processo_id, inicio, modalidade) values (%L, %L, %L, now(), 'online')$$, :'emp', :'tx', :'neg'), 'reunião não aponta negociação de outro terreno');
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, user_id) values (:'emp', :'r1', 'bkm', :'gestor');
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, nome) values (:'emp', :'r1', 'vendedor', 'Sr. Carlos (sócio)');
select pg_temp.falha(format($$insert into app.reuniao_participantes (empresa_id, reuniao_id, lado) values (%L, %L, 'outro')$$, :'emp', :'r1'), 'participante precisa de identificação');
select app.registrar_documento(:'t1', 'ata_reuniao', :'emp' || '/' || :'t1' || '/ata_reuniao/a1.pdf', 'ata.pdf', p_reuniao => :'r1') as ata1 \gset
select app.registrar_documento(:'t1', 'ata_reuniao', :'emp' || '/' || :'t1' || '/ata_reuniao/a2.pdf', 'ata-rev.pdf', p_reuniao => :'r1') as ata2 \gset
select pg_temp.ok(:'ata1' = :'ata2', 'nova ata da mesma reunião vira versão');
select pg_temp.ok((select processo_id from app.documentos where id = :'ata1') = :'neg', 'ata herda a negociação da reunião');
select pg_temp.falha(format('select app.registrar_documento(%L, %L, %L, %L, p_reuniao => %L)', :'t1', 'ata_reuniao', :'emp' || '/x.pdf', 'x.pdf', :'r2'), 'reunião agendada não tem ata');
select pg_temp.falha(format('select app.registrar_documento(%L, %L, %L, %L)', :'t1', 'ata_reuniao', :'emp' || '/x.pdf', 'x.pdf'), 'ata sem reunião é recusada');
select pg_temp.ok((select ata_versao = 2 and jsonb_array_length(participantes) = 2 from app.v_reunioes where id = :'r1'), 'v_reunioes traz ata atual e participantes');
select pg_temp.ok((select reunioes_realizadas from app.v_terrenos where id = :'t1') = 1, 'listagem conta reuniões realizadas');
select pg_temp.falha(format($$insert into app.atividades (empresa_id, terreno_id, tipo, resumo) values (%L, %L, 'reuniao', 'x')$$, :'emp', :'t1'), 'reunião não é registrada como atividade');
select pg_temp.como(:'gestor');

-- ---------------------------------------------------------------------
\echo '# documentos'
select app.registrar_documento(:'t1', 'matricula', :'emp' || '/' || :'t1' || '/matricula/a.pdf', 'mat.pdf', :'neg') as d1 \gset
select app.registrar_documento(:'t1', 'matricula', :'emp' || '/' || :'t1' || '/matricula/b.pdf', 'mat2.pdf', :'neg') as d1b \gset
select pg_temp.ok(:'d1' = :'d1b', 'matrícula reaproveita o mesmo documento');
select pg_temp.ok((select versao_atual from app.v_documentos where id = :'d1') = 2, 'segunda versão preservando a primeira');
select app.registrar_documento(:'t1', 'foto', :'emp' || '/' || :'t1' || '/foto/1.jpg', 'f1.jpg') as f1 \gset
select app.registrar_documento(:'t1', 'foto', :'emp' || '/' || :'t1' || '/foto/2.jpg', 'f2.jpg') as f2 \gset
select pg_temp.ok(:'f1' <> :'f2', 'fotos são documentos separados');
select app.registrar_documento(:'t1', 'proposta', :'emp' || '/' || :'t1' || '/proposta/p4.pdf', 'p4.pdf', :'neg', :'p4') as dp \gset
select pg_temp.ok((select proposta_id from app.documentos where id = :'dp') = :'p4', 'documento ligado à proposta');
select pg_temp.falha(format('select app.registrar_documento(%L, %L, %L, %L)', :'t1', 'foto', 'outra/x.jpg', 'x.jpg'), 'caminho fora da empresa é recusado');

-- ---------------------------------------------------------------------
\echo '# encerramento e arquivamento'
select pg_temp.falha(format('select app.arquivar_terreno(%L, %L)', :'t1', 'teste'), 'não arquiva com negociação aberta');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L)', :'neg', 'perdida'), 'perda exige motivo');
select app.encerrar_processo(:'neg', 'perdida', 'Preço acima do teto da viabilidade');
select app.arquivar_terreno(:'t1', 'Vendedor fechou com concorrente');
select pg_temp.ok((select situacao_cadastral from app.terrenos where id = :'t1') = 'arquivado', 'terreno arquivado sem apagar histórico');
select pg_temp.falha(format('select app.abrir_negociacao(%L)', :'t1'), 'terreno arquivado não abre negociação');

-- ---------------------------------------------------------------------
\echo '# área de interesse'
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro) values (:'emp', 'Lote vizinho', :'gestor', 'prospeccao', :'sp', 'Cidade Ademar') returning id as t2 \gset
insert into app.areas_interesse (empresa_id, nome) values (:'emp', 'Área Cupecê A') returning id as ai \gset
insert into app.area_interesse_terrenos (area_interesse_id, terreno_id, empresa_id) values (:'ai', :'t1', :'emp'), (:'ai', :'t2', :'emp');
select pg_temp.ok((select count(*) from app.area_interesse_terrenos where area_interesse_id = :'ai') = 2, 'área de interesse reúne dois terrenos');

-- ---------------------------------------------------------------------
\echo '# somente leitura'
select pg_temp.como(:'leitor');
select pg_temp.ok((select count(*) from app.v_terrenos) = 3, 'leitura vê os terrenos');
select pg_temp.ok((select count(*) from app.v_inscricoes) = 1, 'leitura vê valor venal e IPTU');
select pg_temp.falha(format($$insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (%L, %L, 'x', current_date)$$, :'emp', :'t2'), 'leitura não cria tarefa');
select pg_temp.falha(format($$select app.salvar_terreno(%L, 1, '{"nome":"x"}')$$, :'t2'), 'leitura não edita terreno');
select pg_temp.falha(format('select app.registrar_oferta(%L, 100)', :'t2'), 'leitura não registra oferta');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade) values (%L, %L, now(), 'online')$$, :'emp', :'t2'), 'leitura não registra reunião');

\echo '# isolamento entre empresas'
select pg_temp.como(:'intruso');
select pg_temp.ok((select count(*) from app.terrenos) = 0, 'outra pessoa não vê terrenos');
select pg_temp.ok((select count(*) from app.v_terrenos) = 0, 'outra pessoa não vê a listagem');
select pg_temp.ok((select count(*) from app.v_inscricoes) = 0, 'outra pessoa não vê valor venal');
select pg_temp.ok((select count(*) from app.v_reunioes) = 0, 'outra pessoa não vê reuniões');
select pg_temp.falha(format('select app.checar_avanco(%L)', :'neg'), 'outra pessoa não acessa RPC');
select pg_temp.falha(format($$insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (%L, %L, 'x', current_date)$$, :'emp', :'t2'), 'outra pessoa não grava tarefa');
select pg_temp.ok((select count(*) from app.municipios) = 1, 'cadastros comuns continuam visíveis');

select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos') >= 3, 'auditoria registra alterações do terreno');

\echo '# fechamento como ganha'
select app.registrar_oferta(:'t2', 3000000) \gset
select id as ng from app.processos where terreno_id = :'t2' and status = 'ativo' \gset
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.mover_para_etapa(%L, %L)', :'ng', 'negociacao'), 'arrastar duas etapas para frente checa cada uma');
select pg_temp.ok((select etapa_atual from app.processos where id = :'ng') = 'recebido', 'falha no meio do caminho não muda nada');
select pg_temp.como(:'gestor');
select app.mover_etapa(:'ng') \gset
select app.mover_etapa(:'ng', true, 'Estudo em andamento') \gset
select app.mover_etapa(:'ng', true, 'Aceite por e-mail') \gset
select app.mover_etapa(:'ng', true, 'Certidões na escritura') \gset
select pg_temp.ok((select status = 'ganha' and etapa_atual = 'minutagem' from app.processos where id = :'ng'), 'fechamento vira status ganha e guarda a última etapa');
select pg_temp.ok((select evento from app.processo_transicoes where processo_id = :'ng' order by em desc limit 1) = 'ganho', 'ganho vai para o histórico');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'ng'), 'negociação ganha não avança mais');
\echo 'TODOS OS TESTES PASSARAM'
