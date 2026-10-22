-- Testes das regras de negócio. Roda como o papel `authenticated`,
-- trocando de usuário pelo claim, como o PostgREST faz.
\set ON_ERROR_STOP on
\set QUIET on
set client_min_messages = warning;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a', 'diretor@bkm.test'),
  ('00000000-0000-0000-0000-00000000000b', 'analista@bkm.test'),
  ('00000000-0000-0000-0000-00000000000c', 'intruso@outra.test'),
  ('00000000-0000-0000-0000-00000000000d', 'leitura@bkm.test'),
  ('00000000-0000-0000-0000-00000000000e', 'gestor@bkm.test');

create function pg_temp.como(u text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', u, false), set_config('role', 'authenticated', false) $$;
create function pg_temp.ok(cond boolean, msg text) returns void language plpgsql as $$
begin if not coalesce(cond,false) then raise exception 'FALHOU: %', msg; end if; raise notice 'ok  %', msg; end $$;
create function pg_temp.falha(sqlcmd text, msg text) returns void language plpgsql as $$
begin
  begin execute sqlcmd; exception when others then raise notice 'ok  % (%)', msg, sqlerrm; return; end;
  raise exception 'FALHOU: esperava erro em %', msg;
end $$;
-- quadrado de lado_m metros centrado no ponto, como GeoJSON (toda terreno precisa de poligonal)
create function pg_temp.quadra(lon float8, lat float8, lado_m float8 default 30) returns jsonb language sql as $$
  select jsonb_build_object('type','Polygon','coordinates',jsonb_build_array(jsonb_build_array(
    jsonb_build_array(lon - dx, lat - dy), jsonb_build_array(lon + dx, lat - dy), jsonb_build_array(lon + dx, lat + dy),
    jsonb_build_array(lon - dx, lat + dy), jsonb_build_array(lon - dx, lat - dy))))
  from (select lado_m / 2 / (111320 * cos(radians(lat))) as dx, lado_m / 2 / 110574.0 as dy) d $$;
set client_min_messages = notice;

\set diretor  '00000000-0000-0000-0000-00000000000a'
\set gestor   '00000000-0000-0000-0000-00000000000e'
\set analista '00000000-0000-0000-0000-00000000000b'
\set intruso  '00000000-0000-0000-0000-00000000000c'
\set leitor   '00000000-0000-0000-0000-00000000000d'

-- ---------------------------------------------------------------------
\echo '# empresa e equipe'
select pg_temp.como(:'diretor');
select app.criar_empresa('BKM Teste', 'Moisés') as emp \gset
select pg_temp.ok((select papel = 'diretor' and administrador from app.membros where user_id = :'diretor'), 'quem cria a empresa vira diretor e administrador');
insert into app.membros (empresa_id, user_id, papel, nome, superior_id) values (:'emp', :'gestor', 'gestor', 'Paula', :'diretor');
insert into app.membros (empresa_id, user_id, papel, nome, superior_id) values (:'emp', :'analista', 'analista', 'Rafael', :'gestor');
insert into app.membros (empresa_id, user_id, papel, nome) values (:'emp', :'leitor', 'leitura', 'Consulta');
select pg_temp.ok((select count(*) from app.membros) = 4, 'administrador vê os 4 membros');
select pg_temp.ok(app.eh_superior(:'emp', :'diretor', :'analista') and app.eh_superior(:'emp', :'gestor', :'analista') and not app.eh_superior(:'emp', :'analista', :'gestor'),
  'hierarquia: analista responde ao gestor, que responde ao diretor');
select pg_temp.falha(format($$update app.membros set superior_id = %L where user_id = %L$$, :'diretor', :'analista'), 'o superior do analista é um gestor, não o diretor');
select pg_temp.falha(format($$update app.membros set papel = 'analista' where user_id = %L$$, :'gestor'), 'gestor com equipe não muda de papel sem trocar o superior da equipe');
select pg_temp.falha(format($$update app.membros set administrador = false where user_id = %L$$, :'diretor'), 'a empresa não fica sem administrador');
select pg_temp.ok((select count(*) from app.etapas_modelo) = 4 and (select count(*) from app.subetapas_modelo) = 13,
  'empresa nova recebe a cópia do funil padrão: 4 etapas e 13 subetapas');
select pg_temp.ok((select count(*) from app.motivos_encerramento where status = 'descartado') = 8 and (select count(*) from app.motivos_encerramento where status = 'perdido') = 7,
  'motivos de Descartado e de Perdido copiados');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$insert into app.membros (empresa_id, user_id, papel, nome) values (%L, %L, 'analista', 'X')$$, :'emp', :'intruso'), 'só o administrador gerencia a equipe');
select pg_temp.como(:'diretor');
select id as sp from app.municipios where codigo_ibge = '3550308' \gset
select pg_temp.ok((select count(*) from app.zoneamentos where municipio_id = :'sp') > 30, 'zoneamentos de SP carregados');

\echo '# municípios'
select pg_temp.ok((select count(*) from app.municipios) = 5571, 'municípios do IBGE carregados');
select pg_temp.ok((select string_agg(distinct m.nome, ', ') from app.zoneamentos z join app.municipios m on m.id = z.municipio_id) = 'São José dos Campos, São Paulo', 'catálogo de zoneamento só de São Paulo e São José dos Campos');
select pg_temp.ok(app.municipio_por_nome('São Paulo', 'SP') = :'sp', 'acha o município pelo nome e UF do Google');
select pg_temp.ok(app.municipio_por_nome('sao jose dos campos', 'sp') = (select id from app.municipios where codigo_ibge = '3549904'), 'acha sem acento e em minúsculas');
select pg_temp.ok(app.municipio_por_nome('Santa Bárbara D''Oeste', 'SP') = (select id from app.municipios where codigo_ibge = '3545803'), 'acha com apóstrofo e maiúsculas diferentes');
select pg_temp.ok(app.municipio_por_nome('São Paulo', 'RJ') is null, 'UF errada não acha município de outro estado');

-- ---------------------------------------------------------------------
\echo '# cadastro rápido do terreno'
select pg_temp.falha(format($$insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro) values (%L, 'Sem poligonal', %L, 'corretor', %L, 'Sacomã')$$, :'emp', :'diretor', :'sp'),
  'cadastro exige a poligonal');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, logradouro, numero, bairro, zona, poligono_geojson)
values (:'emp', 'Terreno Av. Cupecê — esquina', :'diretor', 'corretor', :'sp', 'Av. Cupecê', '1500', 'Cidade Ademar', 'sul', pg_temp.quadra(-46.6450, -23.6650))
returning id as t1 \gset
select pg_temp.ok((select codigo from app.terrenos where id = :'t1') ~ '^TER-\d{6}$', 'código TER-000001 gerado');
select pg_temp.ok((select topografia from app.terrenos where id = :'t1') = 'nao_informado', 'campo não preenchido fica "não informado"');
select versao as v from app.terrenos where id = :'t1' \gset
select pg_temp.falha(format($$update app.terrenos set zona = 'leste' where id = %L$$, :'t1'), 'terreno não é alterado direto na tabela');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"zona":"centro-oeste"}')$$, :'t1', :v), 'zona aceita só as 9 opções');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"area_adotada_m2":2000}')$$, :'t1', :v), 'área adotada exige a fonte');
select app.salvar_terreno(:'t1', :v, '{"area_documental_m2":2000,"area_levantamento_m2":1920,"area_adotada_m2":1920,"fonte_area_adotada":"levantamento","area_construida_existente_m2":300,"area_construida_demolir_m2":180,"cep":"04366-000","zona":"centro"}') as v2 \gset
select pg_temp.ok(:v2 = :v + 1, 'salvar sobe a versão');
select pg_temp.ok((select cep from app.terrenos where id = :'t1') = '04366000', 'CEP guardado só com dígitos');
select pg_temp.ok((select zona from app.terrenos where id = :'t1') = 'centro', 'zona Centro vale para qualquer cidade');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"descricao":"edição velha"}')$$, :'t1', :v), 'edição com versão antiga é recusada');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"area_construida_demolir_m2":400}')$$, :'t1', :v2), 'demolir não passa da área construída');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"codigo":"TER-999999"}')$$, :'t1', :v2), 'campos de controle não mudam');
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"poligono_geojson":{"type":"Polygon","coordinates":[[[-46.65,-23.66],[-46.64,-23.66],[-46.64,-23.67]]]}}')$$, :'t1', :v2),
  'polígono aberto é recusado');
select app.salvar_terreno(:'t1', :v2, '{"poligono_geojson":{"type":"Polygon","coordinates":[[[-46.65,-23.66],[-46.64,-23.66],[-46.64,-23.67],[-46.65,-23.66]]]}}') as v3 \gset
select pg_temp.ok((select poligono_geojson is not null from app.terrenos where id = :'t1'), 'polígono válido aceito');
select pg_temp.ok((select atualizado_por from app.terrenos where id = :'t1') = :'diretor', 'atualizado_por preenchido');

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
insert into app.analises_urbanisticas (empresa_id, terreno_id, responsavel_id, fonte) values (:'emp', :'t1', :'diretor', 'GeoSampa') returning id as a1 \gset
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
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson) values (:'emp', 'Outro terreno', :'diretor', 'prospeccao', :'sp', 'Sacomã', pg_temp.quadra(-46.6000, -23.6000)) returning id as tx \gset
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
  (:'emp', :'t1', null,  'Agendar visita técnica', :'diretor', current_date + 3);
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
\echo '# funil: etapas e subetapas'
select pg_temp.como(:'analista');
select pg_temp.ok((select etapa_atual = 'triagem' and subetapa_atual = 'aguardando_informacoes' from app.processos where id = :'neg'),
  'negociação abre em Em Triagem › Aguardando Informações');
select app.mover_subetapa(:'neg', 'verificacao_interna') \gset
select pg_temp.ok((select subetapa_atual from app.processos where id = :'neg') = 'verificacao_interna', 'subetapa muda em qualquer ordem dentro da etapa');
select pg_temp.ok((select de_subetapa = 'aguardando_informacoes' and para_subetapa = 'verificacao_interna' and user_id = :'analista'
                   from app.processo_transicoes where processo_id = :'neg' and evento = 'subetapa'), 'troca de subetapa vai para o histórico com quem moveu');
select pg_temp.falha(format('select app.mover_subetapa(%L, %L)', :'neg', 'estudo_massa'), 'subetapa de outra etapa é recusada');
select pg_temp.falha(format('update app.processos set subetapa_atual = %L where id = %L', 'aguardando_documentos', :'neg'), 'ninguém altera etapa ou subetapa direto');
select app.mover_etapa(:'neg') \gset
select pg_temp.ok((select etapa_atual = 'estudos' and subetapa_atual = 'estudo_massa' from app.processos where id = :'neg'), 'avançar entra na subetapa inicial da etapa');
select pg_temp.ok((select subetapa_nome from app.v_terrenos where id = :'t1') = 'Estudo de Massa', 'listagem mostra a subetapa');

\echo '# pré-requisitos'
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'negociacao', 'etapa', 'negociacao', 'estudo_viabilidade')$$, :'emp'), 'analista não configura o funil');
select pg_temp.como(:'diretor');
select app.adicionar_prerequisito(:'emp', 'negociacao', 'etapa', 'negociacao', 'estudo_viabilidade') as pr1 \gset
select app.adicionar_prerequisito(:'emp', 'negociacao', 'subetapa', 'proposta_enviada', 'preparando_proposta') as pr2 \gset
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'negociacao', 'etapa', 'estudos', 'proposta_enviada')$$, :'emp'), 'pré-requisito de etapa posterior é recusado');
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'negociacao', 'subetapa', 'preparando_proposta', 'proposta_enviada')$$, :'emp'), 'ciclo entre subetapas é recusado');
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'negociacao', 'subetapa', 'aguardando_reuniao', 'preparando_proposta')$$, :'emp'), 'subetapa inicial não exige outra da própria etapa');
select pg_temp.como(:'analista');
select pg_temp.ok((app.checar_avanco(:'neg')->'itens') @> '[{"tipo":"prerequisito","ok":false,"requisito":"estudo_viabilidade"}]', 'quadro de avanço mostra o pré-requisito que falta');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'neg'), 'sem passar pelo Estudo de Viabilidade não entra em Negociação');
select pg_temp.falha(format('select app.mover_etapa(%L, true, %L)', :'neg', 'x'), 'analista não força');
select app.mover_subetapa(:'neg', 'estudo_viabilidade') \gset
select app.mover_subetapa(:'neg', 'analise_tecnica') \gset
select app.vincular_viabilidade(:'neg', 'Estudo base', 62000000, 15.2, 8400000) \gset
select app.mover_etapa(:'neg') \gset
select pg_temp.ok((select etapa_atual = 'negociacao' and subetapa_atual = 'aguardando_reuniao' from app.processos where id = :'neg'),
  'passou pelo Estudo de Viabilidade (mesmo tendo saído dele) e entra em Negociação');
select pg_temp.ok((select acima_preco_max from app.v_terrenos where id = :'t1'), 'proposta da BKM acima do preço máximo sinalizada');
select app.registrar_proposta(:'neg', 'vendedor', 8900000, 'permuta_com_torna', 'Pede 9% em permuta') as p5 \gset
select pg_temp.ok((select acima_preco_max from app.v_terrenos where id = :'t1') is not true, 'contraproposta do vendedor não acende o alerta de preço máximo');
select pg_temp.falha(format('select app.mover_subetapa(%L, %L)', :'neg', 'proposta_enviada'), 'Proposta Enviada exige ter passado por Preparando Proposta');
select pg_temp.como(:'gestor');
select pg_temp.falha(format('select app.mover_subetapa(%L, %L, true)', :'neg', 'proposta_enviada'), 'avanço forçado exige justificativa');
select app.mover_subetapa(:'neg', 'proposta_enviada', true, 'Proposta foi direto por e-mail') \gset
select pg_temp.ok((select forcado from app.processo_transicoes where processo_id = :'neg' and para_subetapa = 'proposta_enviada'), 'gestor força o pré-requisito e fica registrado');

\echo '# aprovações'
select pg_temp.como(:'analista');
select pg_temp.ok((app.checar_avanco(:'neg')->'aprovacoes') = '["gestor"]' and (app.checar_avanco(:'neg')->>'proxima') = 'contrato', 'entrar em Contrato pede aprovação do gestor');
select app.mover_etapa(:'neg') as r \gset
select pg_temp.ok((:'r'::jsonb->>'resultado') = 'aguardando_aprovacao', 'analista pede a passagem para Contrato');
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'negociacao', 'o card fica onde está, aguardando aprovação');
select pedido_id as ped1 from app.aprovacoes where processo_id = :'neg' and status = 'pendente' \gset
select pg_temp.ok((select aprovador_previsto from app.aprovacoes where pedido_id = :'ped1') = :'gestor', 'aprovador previsto é o gestor de quem pediu');
select pg_temp.ok((select aprovacao_aguardando from app.v_terrenos where id = :'t1') = 'gestor', 'listagem mostra que aguarda o gestor');
select pg_temp.falha(format('select app.mover_subetapa(%L, %L)', :'neg', 'contra_proposta'), 'com pedido aberto o card não se move');
select pg_temp.falha(format('select app.decidir_aprovacao(%L, true)', :'ped1'), 'quem pediu não aprova');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'aprovacao_pendente') = 1, 'gestor recebe a notificação do pedido');
select pg_temp.ok((app.checar_avanco(:'neg')->'pedido'->>'posso_decidir')::boolean, 'quadro de avanço diz ao gestor que ele decide');
select pg_temp.falha(format('select app.decidir_aprovacao(%L, false)', :'ped1'), 'recusa exige comentário');
select app.decidir_aprovacao(:'ped1', false, 'Falta a reunião com o advogado') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'neg') = 'negociacao' and (select status from app.aprovacoes where pedido_id = :'ped1') = 'recusado',
  'recusado, o processo fica onde estava e o pedido vai para o histórico');
select pg_temp.como(:'analista');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'aprovacao_decidida') = 1, 'quem pediu é avisado da decisão');
select app.mover_etapa(:'neg') \gset
select pedido_id as ped2 from app.aprovacoes where processo_id = :'neg' and status = 'pendente' \gset
select pg_temp.como(:'diretor');
select app.decidir_aprovacao(:'ped2', true, 'Ok, seguir') \gset
select pg_temp.ok((select etapa_atual = 'contrato' and subetapa_atual = 'em_elaboracao' from app.processos where id = :'neg'), 'diretor aprova pelo gestor e o processo avança');
select pg_temp.ok((select user_id = :'analista' and aprovacao_id is not null from app.processo_transicoes where processo_id = :'neg' and evento = 'avanco' and para_etapa = 'contrato'),
  'a passagem fica no nome de quem pediu, ligada ao pedido aprovado');
select pg_temp.ok((select decidido_por from app.aprovacoes where pedido_id = :'ped2') = :'diretor', 'quem aprovou de fato fica registrado');
select pg_temp.como(:'gestor');
select app.mover_para_etapa(:'neg', 'negociacao', false, 'Vendedor reabriu o preço') \gset
select pg_temp.ok((select evento = 'retorno' and para_subetapa = 'aguardando_reuniao' from app.processo_transicoes where processo_id = :'neg' order by em desc limit 1),
  'voltar de etapa é "retorno" e entra na subetapa inicial');
select app.mover_etapa(:'neg') as r \gset
select pg_temp.ok((:'r'::jsonb->>'resultado') = 'feito' and (select etapa_atual from app.processos where id = :'neg') = 'contrato', 'gestor que move dispensa a aprovação de gestor');

select pg_temp.como(:'diretor');
select app.salvar_subetapa(:'emp', 'negociacao', 'contrato_enviado', '{"aprova_gestor":true,"aprova_diretor":true}');
select app.salvar_subetapa(:'emp', 'negociacao', 'em_ajuste', '{"aprova_gestor":true,"aprova_diretor":true,"aprovacao_modo":"paralelo"}');
select pg_temp.como(:'analista');
select app.mover_subetapa(:'neg', 'contrato_enviado') \gset
select pedido_id as ped3 from app.aprovacoes where processo_id = :'neg' and status = 'pendente' limit 1 \gset
select pg_temp.ok((select string_agg(nivel || ordem, ',' order by ordem) from app.aprovacoes where pedido_id = :'ped3') = 'gestor1,diretor2', 'em sequência: gestor primeiro, diretor depois');
select pg_temp.ok((select aprovador_previsto from app.aprovacoes where pedido_id = :'ped3' and nivel = 'diretor') = :'diretor', 'diretor previsto é o superior do gestor de quem pediu');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'aprovacao_pendente') = 0, 'em sequência, o diretor só é avisado depois do gestor');
select pg_temp.como(:'gestor');
select pg_temp.ok((app.decidir_aprovacao(:'ped3', true)->>'resultado') = 'aprovado_parcial', 'gestor aprova a parte dele');
select pg_temp.ok((select subetapa_atual from app.processos where id = :'neg') = 'em_elaboracao', 'falta o diretor: nada muda ainda');
select pg_temp.falha(format('select app.decidir_aprovacao(%L, true)', :'ped3'), 'gestor não aprova pelo diretor');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'aprovacao_pendente') = 1, 'aprovado o gestor, o diretor é avisado');
select app.decidir_aprovacao(:'ped3', true) \gset
select pg_temp.ok((select subetapa_atual from app.processos where id = :'neg') = 'contrato_enviado', 'os dois aprovaram: a passagem acontece');
select pg_temp.como(:'analista');
select app.mover_subetapa(:'neg', 'em_ajuste') \gset
select pedido_id as ped4 from app.aprovacoes where processo_id = :'neg' and status = 'pendente' limit 1 \gset
select pg_temp.ok((select bool_and(ordem = 1) and count(*) = 2 from app.aprovacoes where pedido_id = :'ped4'), 'em paralelo, gestor e diretor recebem juntos');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'aprovacao_pendente') = 2, 'em paralelo, o diretor é avisado na hora');
select pg_temp.como(:'analista');
select app.cancelar_aprovacao(:'ped4');
select pg_temp.ok((select bool_and(status = 'cancelado') from app.aprovacoes where pedido_id = :'ped4'), 'quem pediu pode cancelar o pedido');
select pg_temp.como(:'diretor');
select app.mover_subetapa(:'neg', 'em_ajuste') as r \gset
select pg_temp.ok((:'r'::jsonb->>'resultado') = 'feito', 'diretor que move dispensa gestor e diretor');
select pg_temp.como(:'diretor');

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
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, user_id) values (:'emp', :'r1', 'bkm', :'diretor');
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
select pg_temp.como(:'diretor');

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
\echo '# status: stand by, perdido, descartado'
select pg_temp.falha(format('select app.arquivar_terreno(%L, %L)', :'t1', 'teste'), 'não arquiva com negociação aberta');
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L)', :'neg', 'descartado'), 'descartar exige motivo da lista');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, %L)', :'neg', 'descartado', 'preco_alto'), 'motivo fora da lista é recusado');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, %L)', :'neg', 'descartado', 'outros'), 'Descartado por Outros exige texto');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, %L)', :'neg', 'perdido', 'vendido_terceiro'), 'Perdido exige relato');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L)', :'neg', 'comprado', '<p>Fechado</p>'), 'Comprado exige relato e pontos de sucesso');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L)', :'neg', 'stand_by', 'Inventário'), 'Stand By exige data futura');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_retomar_em => current_date + 30)', :'neg', 'stand_by'), 'Stand By exige justificativa');
select app.encerrar_processo(:'neg', 'stand_by', p_detalhe => 'Inventário em andamento', p_retomar_em => current_date + 30) \gset
select pg_temp.ok((select status = 'stand_by' and etapa_atual = 'contrato' and subetapa_atual = 'em_ajuste' from app.processos where id = :'neg'), 'stand by guarda etapa e subetapa');
select pg_temp.ok((select array_agg(dias_antes order by dias_antes) from app.lembretes where origem_tabela = 'processos' and origem_id = :'neg') = '{0,7}', 'stand by cria os lembretes padrão (7 dias antes e no dia)');
reset role;  -- a rotina roda pelo pg_cron, fora de qualquer usuário
select app.rotina_diaria(current_date + 23) \gset
select app.rotina_diaria(current_date + 23) \gset
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'stand_by_retomar') = 1, 'responsável é lembrado 7 dias antes de retomar, sem repetir');
select pg_temp.como(:'analista');
select app.retomar_processo(:'neg');
select pg_temp.ok((select status = 'ativo' and subetapa_atual = 'em_ajuste' from app.processos where id = :'neg'), 'retomar volta para Ativo na mesma etapa e subetapa');
select pg_temp.ok((select tempo_stand_by > interval '0' from app.v_tempo_subetapas where processo_id = :'neg' and subetapa = 'em_ajuste'), 'tempo em stand by fica separado do tempo ativo');
select pg_temp.ok((select ultima_saida is not null and passagens = 1 from app.v_tempo_subetapas where processo_id = :'neg' and subetapa = 'estudo_viabilidade'),
  'tempo por subetapa: entrada e saída de Estudo de Viabilidade lidas do histórico');
select pg_temp.ok((select count(*) from app.v_tempo_subetapas where processo_id = :'neg' and atual) = 1, 'só a subetapa atual está em aberto');
select app.encerrar_processo(:'neg', 'perdido', 'vendido_terceiro', 'Fechou com a construtora vizinha por valor maior') \gset
select pg_temp.ok((select status = 'perdido' and etapa_atual = 'contrato' and motivo_encerramento = 'vendido_terceiro' from app.processos where id = :'neg'), 'perdido guarda motivo, relato e a etapa onde parou');
select pg_temp.ok((select motivo_encerramento_nome from app.v_terrenos where id = :'t1') = 'Vendido para terceiro', 'listagem mostra o nome do motivo');
select pg_temp.falha(format('select app.retomar_processo(%L)', :'neg'), 'perdido não volta para Ativo');
select pg_temp.como(:'diretor');
select app.arquivar_terreno(:'t1', 'Vendedor fechou com concorrente');
select pg_temp.ok((select situacao_cadastral from app.terrenos where id = :'t1') = 'arquivado', 'terreno arquivado sem apagar histórico');
select pg_temp.falha(format('select app.abrir_negociacao(%L)', :'t1'), 'terreno arquivado não abre negociação');

-- ---------------------------------------------------------------------
\echo '# área de interesse'
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson) values (:'emp', 'Lote vizinho', :'diretor', 'prospeccao', :'sp', 'Cidade Ademar', pg_temp.quadra(-46.6300, -23.6800)) returning id as t2 \gset
insert into app.areas_interesse (empresa_id, nome) values (:'emp', 'Área Cupecê A') returning id as ai \gset
insert into app.area_interesse_terrenos (area_interesse_id, terreno_id, empresa_id) values (:'ai', :'t1', :'emp'), (:'ai', :'t2', :'emp');
select pg_temp.ok((select count(*) from app.area_interesse_terrenos where area_interesse_id = :'ai') = 2, 'área de interesse reúne dois terrenos');

-- ---------------------------------------------------------------------
\echo '# mapa, pontos de interesse e quadro de tarefas'
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Pin no mapa', :'diretor', 'prospeccao', :'sp', -23.6681, -46.6513, pg_temp.quadra(-46.6513, -23.6681)) returning id as tm \gset
insert into app.pontos_interesse (empresa_id, nome, categoria, latitude, longitude) values
  (:'emp', 'Terminal Cidade Ademar', 'transporte', -23.6672, -46.6522),
  (:'emp', 'Escritório Campinas', 'empresa', -22.9056, -47.0608);
select pg_temp.ok((select app.distancia_km(-23.5505, -46.6333, -22.9056, -47.0608)) between 80 and 90, 'distância São Paulo–Campinas em linha reta');
select pg_temp.ok((select count(*) from app.v_terreno_pontos where terreno_id = :'tm') = 2, 'todos os pontos da empresa aparecem para o terreno, perto ou longe');
select pg_temp.ok((select distancia_km from app.v_terreno_pontos where terreno_id = :'tm' and nome = 'Terminal Cidade Ademar') < 0.2, 'terminal a menos de 200 m em linha reta');
select pg_temp.ok((select bool_and(precisa_medir and distancia_pe_m is null) from app.v_terreno_pontos where terreno_id = :'tm'), 'antes de medir a rota, só a linha reta');
select id as pterm from app.pontos_interesse where nome = 'Terminal Cidade Ademar' \gset
select id as pcamp from app.pontos_interesse where nome = 'Escritório Campinas' \gset
select app.salvar_distancias_pontos(:'tm', -23.6681, -46.6513, format('[{"ponto_id":"%s","distancia_pe_m":260,"duracao_pe_s":200,"distancia_carro_m":900,"duracao_carro_s":240},{"ponto_id":"%s","distancia_carro_m":98000,"duracao_carro_s":5400},{"ponto_id":"%s","distancia_pe_m":1}]', :'pterm', :'pcamp', :'tx')::jsonb) as nd \gset
select pg_temp.ok(:nd = 2, 'distâncias gravadas só para pontos da empresa');
select pg_temp.ok((select distancia_pe_m = 260 and not precisa_medir from app.v_terreno_pontos where terreno_id = :'tm' and ponto_id = :'pterm'), 'terminal com distância a pé pela rota');
select pg_temp.ok((select distancia_pe_m is null and distancia_carro_m = 98000 from app.v_terreno_pontos where terreno_id = :'tm' and ponto_id = :'pcamp'), 'ponto longe com distância de carro');
select pg_temp.falha(format('select app.salvar_distancias_pontos(%L, -23.60, -46.60, %L)', :'tm', '[]'), 'medição para outra coordenada é recusada');
select pg_temp.falha(format($$insert into app.terreno_ponto_distancias (terreno_id, ponto_id, empresa_id, latitude, longitude) values (%L, %L, %L, 0, 0)$$, :'tm', :'pterm', :'emp'), 'distância não é gravada direto');
select pg_temp.ok((select situacao_mapa from app.v_mapa where id = :'tm') = 'sem_negociacao', 'pin sem negociação');

\echo '# entorno do terreno (Google, distância a pé)'
select pg_temp.ok((select count(*) from app.entorno_categorias where ativo) = 3, 'três categorias de entorno ligadas: metrô/trem, shopping e hospital');
select pg_temp.ok((select precisa_buscar and buscado_em is null from app.v_entorno_buscas where terreno_id = :'tm'), 'terreno localizado e nunca buscado precisa de busca');
select pg_temp.como(:'analista');
select app.salvar_entorno(:'tm', -23.6681, -46.6513, $j$[
  {"categoria":"metro_trem","google_place_id":"g1","nome":"Estação Exemplo","latitude":-23.667,"longitude":-46.652,"distancia_pe_m":620,"duracao_pe_s":480,"distancia_reta_m":410},
  {"categoria":"metro_trem","google_place_id":"g1","nome":"Estação Exemplo (entrada 2)","latitude":-23.667,"longitude":-46.652,"distancia_pe_m":700,"duracao_pe_s":540},
  {"categoria":"shopping","google_place_id":"g2","nome":"Shopping Longe","latitude":-23.66,"longitude":-46.64,"distancia_pe_m":1600,"duracao_pe_s":1200},
  {"categoria":"hospital","google_place_id":"g3","nome":"Hospital Perto","latitude":-23.673,"longitude":-46.645,"distancia_pe_m":1500,"duracao_pe_s":1140},
  {"categoria":"padaria","google_place_id":"g4","nome":"Padaria","latitude":-23.668,"longitude":-46.651,"distancia_pe_m":100}
]$j$) as ne \gset
select pg_temp.ok(:ne = 2, 'entorno grava só o que está no raio a pé, de categoria ativa, sem repetir o lugar');
select pg_temp.ok((select distancia_pe_m from app.v_terreno_entorno where terreno_id = :'tm' and google_place_id = 'g1') = 620, 'lugar repetido fica com a menor distância a pé');
select pg_temp.ok((select not desatualizado and rota_a_pe from app.v_terreno_entorno where terreno_id = :'tm' limit 1), 'busca em dia, pela rota a pé');
select pg_temp.falha(format($$insert into app.terreno_entorno (empresa_id, terreno_id, categoria, google_place_id, nome, latitude, longitude, distancia_pe_m) values (%L, %L, 'hospital', 'x', 'x', 0, 0, 1)$$, :'emp', :'tm'), 'entorno não é gravado direto, só pela RPC');
select pg_temp.falha(format('select app.salvar_entorno(%L, -23.60, -46.60, %L)', :'tm', '[]'), 'busca feita para outra coordenada é recusada');
select app.salvar_entorno(:'tm', -23.6681, -46.6513, '[]', false) as ne2 \gset
select pg_temp.ok((select count(*) from app.terreno_entorno where terreno_id = :'tm') = 0 and (select not rota_a_pe from app.terreno_entorno_buscas where terreno_id = :'tm'), 'nova busca troca a anterior inteira');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terreno_entorno_buscas' and depois->>'terreno_id' = :'tm') = 2, 'busca do entorno vai para os logs');
select versao as vtm from app.terrenos where id = :'tm' \gset
select app.salvar_terreno(:'tm', :vtm, '{"latitude":-23.6700,"longitude":-46.6500}') \gset
select pg_temp.ok((select desatualizado and precisa_buscar from app.v_entorno_buscas where terreno_id = :'tm'), 'mudou a localização: entorno fica desatualizado');
select pg_temp.ok((select bool_and(precisa_medir and distancia_pe_m is null and distancia_carro_m is null) from app.v_terreno_pontos where terreno_id = :'tm'), 'mudou a localização: distâncias pela rota ficam para medir de novo');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.salvar_entorno(%L, -23.67, -46.65, %L)', :'tm', '[]'), 'leitura não grava entorno');
select pg_temp.ok((select count(*) from app.v_entorno_buscas where terreno_id = :'tm') = 1, 'leitura vê a situação do entorno');
select pg_temp.como(:'diretor');

\echo '# Lote na base da prefeitura pela inscrição (GeoSampa e GeoSanja)'
\set msp '(select id from app.municipios where codigo_ibge = ''3550308'')'
\set msj '(select id from app.municipios where codigo_ibge = ''3549904'')'
select pg_temp.ok((select string_agg(codigo || '=' || mascara, ' ' order by ordem) from app.bases_cadastrais)
  = 'geosampa=000.000.0000-0 geosanja=00.0000.0000.0000', 'São Paulo e São José dos Campos têm base, cada uma com a sua máscara');
insert into app.inscricoes_municipais (empresa_id, terreno_id, municipio_id, inscricao) values (:'emp', :'tm', :msp, '009.027.0009-1') returning id as gi \gset
\set glote '{"cd_setor_fiscal":"009","cd_quadra_fiscal":"027","cd_lote":"0009","cd_digito_sql":"1","qt_area_terreno":593,"qt_area_construida":4994,"cd_cib":"0DRHNJA-V","cd_condominio":"00"}'
\set gpoli '{"type":"Polygon","coordinates":[[[-46.6551,-23.5619],[-46.6555,-23.5620],[-46.6553,-23.5621],[-46.6551,-23.5619]]]}'
\set gcam '{"zona_fiscal":[{"sg_zona_fiscal":"ZF-1"}],"pde_macroarea_lei_18209":[{"sg_macroarea":"MUC"}]}'
select pg_temp.como(:'analista');
select app.registrar_consulta_lote(:'gi', :'glote', :'gpoli', 593.4, :'gcam',
  '[{"sigla":"ZEU","area_m2":500},{"sigla":"ZEU","area_m2":93.4},{"sigla":"ZXX","area_m2":1}]', '{drenagem}') as gc \gset
select pg_temp.ok((select area_cadastral_m2 = 593 and cib = '0DRHNJA-V' and zona_fiscal = 'ZF-1' from app.inscricoes_municipais where id = :'gi'),
  'consulta completa a área cadastral vazia, o CIB e a zona fiscal da inscrição');
select pg_temp.ok((select base = 'geosampa' and inscricao_norm = '00902700091' and camadas_com_erro = '{drenagem}' and lote->>'qt_area_construida' = '4994'
                     from app.consultas_lote where id = :'gc'),
  'consulta guarda a base, o lote inteiro e as camadas que falharam');
select pg_temp.ok((select a.fonte = 'GeoSampa (SQL 009.027.0009-1)' and a.observacoes like '%ZXX%' and z.area_abrangida_m2 = 593.4
                     from app.analises_urbanisticas a join app.analise_zoneamentos z on z.analise_id = a.id
                    where a.terreno_id = :'tm' and a.status = 'vigente'),
  'consulta registra análise vigente com a área da zona somada; sigla fora do catálogo vai para as observações');
update app.inscricoes_municipais set area_cadastral_m2 = 600 where id = :'gi';
select app.registrar_consulta_lote(:'gi', :'glote', null, null, '{}', '[]', '{}', false) as gc2 \gset
select pg_temp.ok((select area_cadastral_m2 from app.inscricoes_municipais where id = :'gi') = 600, 'área cadastral já preenchida não é trocada');
select pg_temp.ok((select count(*) from app.consultas_lote where terreno_id = :'tm') = 2
              and (select count(*) from app.analises_urbanisticas where terreno_id = :'tm') = 1, 'cada consulta é linha nova; sem zonas, nenhuma análise nova');
select pg_temp.falha(format('select app.registrar_consulta_lote(%L, %L, null, null, %L, %L)', :'gi',
  '{"cd_setor_fiscal":"009","cd_quadra_fiscal":"027","cd_lote":"0010","cd_digito_sql":"1"}', '{}', '[]'), 'lote de outro SQL é recusado');
select pg_temp.falha(format($$update app.consultas_lote set zonas = '[]' where id = %L$$, :'gc'), 'consulta não é alterada');
select pg_temp.ok((select count(*) from app.consultas_lote where id = :'gc' and zonas <> '[]') = 1, 'consulta continua como foi gravada');
select app.registrar_documento(:'tm', 'lote_dxf', :'emp' || '/' || :'tm' || '/lote_dxf/a.dxf', 'lote.dxf') as gd \gset
select app.registrar_documento(:'tm', 'lote_dxf', :'emp' || '/' || :'tm' || '/lote_dxf/b.dxf', 'lote.dxf', p_documento => :'gd') as gd2 \gset
select pg_temp.ok(:'gd' = :'gd2' and (select count(*) from app.documento_versoes where documento_id = :'gd') = 2, 'DXF do lote vira documento com versões');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.registrar_consulta_lote(%L, %L, null, null, %L, %L)', :'gi', :'glote', '{}', '[]'), 'leitura não consulta a base da prefeitura');
select pg_temp.ok((select count(*) from app.consultas_lote where terreno_id = :'tm') = 2, 'leitura vê as consultas');
select pg_temp.como(:'diretor');
-- São José dos Campos: o GeoSanja devolve só a inscrição e a poligonal
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
  values (:'emp', 'Em SJC', :'diretor', 'prospeccao', :msj, 'Vila Adyanna', pg_temp.quadra(-45.8860, -23.1890)) returning id as tsj \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, municipio_id, inscricao) values (:'emp', :'tsj', :msj, '41.0024.0011.0000') returning id as gs \gset
select app.registrar_consulta_lote(:'gs', '{"inscricao":"41.0024.0011.0000"}', :'gpoli', 412.5,
  '{"anexo_07":[{"nome":"Centro expandido","ca_max":4}]}', '[{"sigla":"ZM2","area_m2":412.5}]') as gcs \gset
select pg_temp.ok((select base = 'geosanja' and inscricao_norm = '41002400110000' from app.consultas_lote where id = :'gcs')
              and (select a.fonte = 'GeoSanja (Inscrição imobiliária 41.0024.0011.0000)' and a.observacoes is null and zz.sigla = 'ZM2'
                     from app.analises_urbanisticas a join app.analise_zoneamentos z on z.analise_id = a.id join app.zoneamentos zz on zz.id = z.zoneamento_id
                    where a.terreno_id = :'tsj' and a.status = 'vigente')
              and (select area_cadastral_m2 is null and cib is null from app.inscricoes_municipais where id = :'gs'),
  'GeoSanja: consulta e análise com a zona do catálogo de SJC; área cadastral fica vazia (não vem)');
select pg_temp.falha(format('select app.registrar_consulta_lote(%L, %L, null, null, %L, %L)', :'gs', '{"inscricao":"41.0024.0012.0000"}', '{}', '[]'),
  'GeoSanja: lote de outra inscrição é recusado');
select pg_temp.falha(format($$insert into app.inscricoes_municipais (empresa_id, terreno_id, municipio_id, inscricao) values (%L, %L, %s, '111.222.3333-4')$$,
  :'emp', :'tsj', :'msp'), 'SQL de São Paulo num terreno de SJC é recusado');
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao) values (:'emp', :'tsj', '123456') returning id as gout \gset
select pg_temp.falha(format('select app.registrar_consulta_lote(%L, %L, null, null, %L, %L)', :'gout', '{"inscricao":"123456"}', '{}', '[]'),
  'inscrição de outro município (sem base) não consulta');
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao) values (:'emp', :'tm', '009.027.0009-1') returning id as gdup \gset
select pg_temp.ok(:'gdup' is not null, 'mesmo número em outra cidade não é duplicata');
select pg_temp.ok((select count(*) from app.buscar_duplicados(:'emp', p_inscricao => '41.0024.0099.0000') where certeza = 'mesma_quadra') = 1,
  'inscrição de SJC da mesma quadra avisa vizinho');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'consultas_lote') = 3, 'consultas do lote vão para os logs');
-- limpa o que os testes seguintes contam (como superusuário)
reset role;
delete from app.terrenos where id = :'tsj';
delete from app.inscricoes_municipais where id in (:'gi', :'gdup');
select pg_temp.como(:'diretor');
select pg_temp.ok(not exists (select 1 from app.v_mapa where id = :'t1'), 'terreno arquivado sai do mapa');
insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (:'emp', :'tm', 'Visitar o lote', current_date - 1) returning id as k1 \gset
insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (:'emp', :'tm', 'Pedir matrícula', current_date + 5) returning id as k2 \gset
select pg_temp.ok((select posicao from app.tarefas where id = :'k2') > (select posicao from app.tarefas where id = :'k1'), 'tarefa nova entra no fim da coluna');
select pg_temp.ok((select atrasada and terreno_nome = 'Pin no mapa' from app.v_tarefas where id = :'k1'), 'quadro de tarefas mostra atraso e terreno');
update app.tarefas set status = 'em_andamento', posicao = (select posicao from app.tarefas where id = :'k1') - 1 where id = :'k2';
select pg_temp.ok((select status from app.tarefas where id = :'k2') = 'em_andamento', 'arrastar a tarefa muda o status');

-- ---------------------------------------------------------------------
\echo '# somente leitura'
select pg_temp.como(:'leitor');
select pg_temp.ok((select count(*) from app.v_terrenos) = 4, 'leitura vê os terrenos');
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
select pg_temp.ok((select count(*) from app.pontos_interesse) = 0 and (select count(*) from app.v_mapa) = 0, 'outra pessoa não vê mapa nem pontos de interesse');
select pg_temp.falha(format('select app.checar_avanco(%L)', :'neg'), 'outra pessoa não acessa RPC');
select pg_temp.falha(format($$insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (%L, %L, 'x', current_date)$$, :'emp', :'t2'), 'outra pessoa não grava tarefa');
select pg_temp.ok((select count(*) from app.municipios) = 5571, 'cadastros comuns continuam visíveis');

select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos') >= 3, 'auditoria registra alterações do terreno');
begin;
insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (:'emp', :'t2', 'Log A', current_date);
insert into app.tarefas (empresa_id, terreno_id, titulo, prazo) values (:'emp', :'t2', 'Log B', current_date);
commit;
select pg_temp.ok((select bool_and(em > ant) from (select em, lag(em) over (order by id) ant from (select id, em from app.auditoria where tabela = 'tarefas' order by id desc limit 2) u) x where ant is not null),
  'alterações na mesma transação ficam em instantes distintos, na ordem em que aconteceram');

\echo '# fechamento como comprado'
select app.registrar_oferta(:'t2', 3000000) \gset
select id as ng from app.processos where terreno_id = :'t2' and status = 'ativo' \gset
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.mover_para_etapa(%L, %L)', :'ng', 'negociacao'), 'arrastar duas etapas para frente checa cada uma');
select pg_temp.ok((select etapa_atual from app.processos where id = :'ng') = 'triagem', 'falha no meio do caminho não muda nada');
select pg_temp.ok((select situacao_mapa from app.v_mapa where id = :'t2') = 'triagem', 'pin da negociação ativa usa a etapa');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L, p_pontos_sucesso => %L)', :'ng', 'comprado', 'x', 'y'), 'compra só na última etapa');
select pg_temp.como(:'gestor');
select app.mover_etapa(:'ng') \gset
select app.mover_etapa(:'ng', true, 'Estudo em andamento') \gset
select app.mover_etapa(:'ng') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'ng') = 'contrato', 'gestor leva ao Contrato sem pedir aprovação');
select pg_temp.ok((app.checar_avanco(:'ng')->>'proxima') = 'comprado' and (app.checar_avanco(:'ng')->>'proxima_tipo') = 'status', 'depois do Contrato vem o fechamento como Comprado');
select pg_temp.ok((app.checar_avanco(:'ng')->'aprovacoes') = '["diretor"]', 'compra pede o diretor (o gestor já tem o nível dele)');
insert into app.diligencias (empresa_id, terreno_id, processo_id, categoria, titulo, situacao) values
  (:'emp', :'t2', :'ng', 'ambiental', 'Possível contaminação por posto vizinho', 'impeditiva') returning id as dg \gset
select pg_temp.ok((app.checar_avanco(:'ng')->'itens') @> '[{"tipo":"diligencia"}]', 'diligência impeditiva trava a compra');
select pg_temp.ok((app.checar_avanco(:'ng')->'itens') @> '[{"tipo":"documento","ok":false}]', 'compra exige certidões e minuta');
select pg_temp.ok((select diligencias_impeditivas from app.v_terrenos where id = :'t2') = 1, 'listagem conta diligências impeditivas');
update app.diligencias set situacao = 'resolvida', providencia = 'Laudo de passivo ambiental negativo' where id = :'dg';
select pg_temp.ok((select resolvida_em is not null from app.diligencias where id = :'dg'), 'resolver preenche a data');
select pg_temp.ok(not ((app.checar_avanco(:'ng')->'itens') @> '[{"tipo":"diligencia"}]'), 'diligência resolvida sai das pendências');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L, p_pontos_sucesso => %L)', :'ng', 'comprado', 'x', 'y'), 'compra com documento pendente é recusada');
select app.encerrar_processo(:'ng', 'comprado', p_detalhe => '<p>Compra fechada com permuta</p>', p_pontos_sucesso => '<ul><li>Permuta aceita</li></ul>',
                             p_forcar => true, p_comentario => 'Certidões na escritura') as r \gset
select pg_temp.ok((:'r'::jsonb->>'resultado') = 'aguardando_aprovacao' and (select status from app.processos where id = :'ng') = 'ativo', 'gestor força e a compra aguarda o diretor');
select pedido_id as ped5 from app.aprovacoes where processo_id = :'ng' and status = 'pendente' \gset
select pg_temp.como(:'diretor');
select app.decidir_aprovacao(:'ped5', true) \gset
select pg_temp.ok((select status = 'comprado' and etapa_atual = 'contrato' and pontos_sucesso is not null and detalhe_encerramento is not null from app.processos where id = :'ng'),
  'diretor aprova: Comprado, com relato e pontos de sucesso, guardando a última etapa');
select pg_temp.ok((select evento = 'compra' and forcado from app.processo_transicoes where processo_id = :'ng' order by em desc limit 1), 'compra vai para o histórico, forçada');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'ng'), 'negociação comprada não avança mais');
select pg_temp.ok((select situacao_mapa from app.v_mapa where id = :'t2') = 'comprado', 'pin da negociação comprada');

\echo '# configuração do funil (administrador)'
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select app.configurar_etapa(%L, 'negociacao', 'estudos', '{"nome":"Estudos"}')$$, :'emp'), 'só o administrador muda a configuração');
select pg_temp.falha(format($$update app.etapas_modelo set nome = 'X' where empresa_id = %L$$, :'emp'), 'configuração não muda direto na tabela');
select pg_temp.como(:'diretor');
select app.configurar_etapa(:'emp', 'negociacao', 'estudos', '{"nome":"Estudos","sla_dias":15}');
select pg_temp.ok((select nome = 'Estudos' and sla_dias = 15 from app.etapas_modelo where codigo = 'estudos'), 'administrador renomeia a etapa e muda o prazo');
select pg_temp.falha(format($$select app.configurar_etapa(%L, 'negociacao', 'estudos', '{"ordem":9}')$$, :'emp'), 'ordem da etapa não muda pelo app');
select app.salvar_subetapa(:'emp', 'negociacao', 'due_diligence', '{"etapa":"contrato","nome":"Due diligence","prazo_dias":20}');
select pg_temp.ok((select ordem = 4 and ativo from app.subetapas_modelo where codigo = 'due_diligence'), 'subetapa nova entra no fim do kanban da etapa');
select app.apagar_subetapa(:'emp', 'negociacao', 'due_diligence');
select pg_temp.falha(format($$select app.apagar_subetapa(%L, 'negociacao', 'aguardando_informacoes')$$, :'emp'), 'subetapa com histórico não é apagada, só desativada');
select pg_temp.falha(format($$select app.salvar_subetapa(%L, 'negociacao', 'estudo_viabilidade', '{"ativo":false}')$$, :'emp'), 'não desativa subetapa de que outra passagem depende');
select pg_temp.falha(format($$select app.salvar_subetapa(%L, 'negociacao', 'estudo_massa', '{"etapa":"triagem"}')$$, :'emp'), 'subetapa não muda de etapa');
select app.registrar_oferta(:'tx', 1500000) \gset
select id as nx from app.processos where terreno_id = :'tx' and status = 'ativo' \gset
select pg_temp.falha(format($$select app.salvar_subetapa(%L, 'negociacao', 'aguardando_informacoes', '{"ativo":false}')$$, :'emp'), 'desativar com terrenos dentro pede para onde movê-los');
select app.salvar_subetapa(:'emp', 'negociacao', 'aguardando_informacoes', '{"ativo":false,"mover_para":"aguardando_documentos"}');
select pg_temp.ok((select subetapa_atual from app.processos where id = :'nx') = 'aguardando_documentos', 'terrenos da subetapa desativada vão para a escolhida');
reset role;
select pg_temp.ok(app._subetapa_inicial(:'emp', 'negociacao', 'triagem') = 'aguardando_documentos', 'subetapa inicial passa a ser a primeira ativa');
select pg_temp.como(:'diretor');
select app.salvar_subetapa(:'emp', 'negociacao', 'aguardando_informacoes', '{"ativo":true}');
select app.remover_prerequisito(:'pr2');
select pg_temp.ok(not exists (select 1 from app.prerequisitos_modelo where id = :'pr2'), 'pré-requisito removido');
select app.salvar_motivo(:'emp', 'perdido', 'permuta_recusada', '{"nome":"Recusou permuta física"}');
select pg_temp.ok((select ordem from app.motivos_encerramento where codigo = 'permuta_recusada') = 8, 'motivo novo entra no fim da lista');
select pg_temp.falha(format($$select app.apagar_motivo(%L, 'perdido', 'vendido_terceiro')$$, :'emp'), 'motivo já usado não é apagado');
select app.salvar_motivo(:'emp', 'perdido', 'vendido_terceiro', '{"ativo":false}');
select app.salvar_checklist(:'emp', 'negociacao', 'estudos', 'planialtimetrico', false);
select pg_temp.ok((select not obrigatorio from app.checklist_modelo where etapa = 'estudos' and tipo_documento = 'planialtimetrico'), 'checklist da etapa editado pelo administrador');
select app.remover_checklist(:'emp', 'negociacao', 'estudos', 'planialtimetrico');
select app.configurar_status(:'emp', 'negociacao', 'comprado', '{"aprovacao_modo":"paralelo"}');
select pg_temp.ok((select count(*) from app.auditoria where tabela in ('etapas_modelo','subetapas_modelo','motivos_encerramento','checklist_modelo','status_modelo','prerequisitos_modelo')) >= 10,
  'toda alteração de configuração vai para a auditoria');
select pg_temp.como(:'intruso');
select app.criar_empresa('Outra', 'Fulano') as emp2 \gset
select pg_temp.ok((select nome from app.etapas_modelo where codigo = 'estudos') = 'Estudos Preliminares', 'cada empresa tem a sua configuração');
select pg_temp.como(:'diretor');

\echo '# notificações e lembretes'
select pg_temp.como(:'analista');
insert into app.tarefas (empresa_id, terreno_id, titulo, responsavel_id, prazo) values (:'emp', :'tm', 'Pedir certidões', :'gestor', current_date + 2) returning id as kn \gset
insert into app.tarefa_marcados (tarefa_id, user_id, empresa_id) values (:'kn', :'diretor', :'emp');
select pg_temp.falha(format($$insert into app.tarefa_marcados (tarefa_id, user_id, empresa_id) values (%L, %L, %L)$$, :'kn', :'intruso', :'emp'), 'só membros da empresa são marcados');
select pg_temp.ok((select array_agg(dias_antes) from app.lembretes where origem_id = :'kn') = '{0}', 'tarefa nasce com lembrete no dia do prazo');
insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (:'emp', 'tarefas', :'kn', 1);
select pg_temp.falha(format($$insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (%L, 'tarefas', %L, 400)$$, :'emp', :'kn'), 'antecedência até 365 dias');
select pg_temp.falha(format($$insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (%L, 'tarefas', %L, 3)$$, :'emp2', :'kn'), 'lembrete não aponta item de outra empresa');
select pg_temp.falha(format($$insert into app.notificacoes (empresa_id, destinatario_id, tipo, texto, origem_tabela, origem_id, referencia) values (%L, %L, 'x', 'x', 'x', %L, current_date)$$, :'emp', :'gestor', :'kn'),
  'notificação só é criada pelo banco');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_marcado') = 1, 'quem é marcado na tarefa é avisado');
reset role;
select app.rotina_diaria(current_date + 1) \gset
select app.rotina_diaria(current_date + 2) \gset
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_atribuida') = 1, 'responsável é avisado da tarefa atribuída');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_prazo') = 2, 'lembretes de 1 dia antes e do dia do prazo');
select pg_temp.ok((select texto from app.notificacoes where tipo = 'tarefa_prazo' order by referencia desc limit 1) like '%: hoje', 'no dia: "vence hoje"');
select pg_temp.como(:'analista');
update app.tarefas set prazo = current_date + 6 where id = :'kn';
reset role;
select app.rotina_diaria(current_date + 6) \gset
select app.rotina_diaria(current_date + 8) \gset
select app.rotina_diaria(current_date + 9) \gset
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_prazo') = 4, 'prazo mudou: os lembretes voltam a valer para a data nova');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_atrasada' and origem_id = :'kn') = 1, 'tarefa atrasada avisa uma vez só');
select app.marcar_notificacao_lida() as lidas \gset
select pg_temp.ok(:lidas >= 5 and not exists (select 1 from app.notificacoes where lida_em is null), 'marcar todas como lidas');
select pg_temp.como(:'analista');
select pg_temp.ok(not exists (select 1 from app.notificacoes where destinatario_id = :'gestor'), 'cada um vê só as suas notificações');
select pg_temp.como(:'diretor');
select app.salvar_subetapa(:'emp', 'negociacao', 'aguardando_documentos', '{"prazo_dias":3}');
reset role;
select app.rotina_diaria(current_date + 5) \gset
select app.rotina_diaria(current_date + 6) \gset
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'subetapa_prazo' and origem_id = :'nx') = 1, 'subetapa com prazo estourado avisa o responsável uma vez');
select pg_temp.ok((select subetapa_atrasada from app.v_terrenos where id = :'tx') is false, 'hoje ainda dentro do prazo da subetapa');
select app.registrar_documento(:'tx', 'matricula', :'emp' || '/' || :'tx' || '/matricula/m.pdf', 'm.pdf', :'nx', p_emitido_em => current_date) as dv \gset
select pg_temp.ok((select array_agg(dias_antes order by dias_antes) from app.lembretes where origem_id = :'dv') = '{7,30}', 'documento que vence nasce com lembretes de 30 e 7 dias');
select app.configurar_notificacao(:'emp', 'tarefa_atrasada', false);
select pg_temp.ok((select not ativo from app.tipos_notificacao where codigo = 'tarefa_atrasada'), 'administrador desliga um tipo de notificação');
-- ---------------------------------------------------------------------
\echo '# poligonal primeiro: terrenos que se sobrepõem à área nova'
select pg_temp.como(:'diretor');
-- A e B: quadras de ~100 × 110 m lado a lado (encostam na divisa)
\set qa '{"type":"Polygon","coordinates":[[[-46.7000,-23.6000],[-46.6990,-23.6000],[-46.6990,-23.6010],[-46.7000,-23.6010],[-46.7000,-23.6000]]]}'
\set qb '{"type":"Polygon","coordinates":[[[-46.6990,-23.6000],[-46.6980,-23.6000],[-46.6980,-23.6010],[-46.6990,-23.6010],[-46.6990,-23.6000]]]}'
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
values (:'emp', 'Quadra A', :'diretor', 'corretor', :'sp', 'Campo Limpo', :'qa') returning id as sa \gset
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
values (:'emp', 'Vizinho B', :'diretor', 'corretor', :'sp', 'Campo Limpo', :'qb') returning id as sb \gset
select pg_temp.ok((select poligono is not null from app.terrenos where id = :'sa'), 'poligonal vira geometria; o vizinho que só encosta na divisa entra');
-- B desenhado 3 m para dentro de A: faixa de imprecisão, não conta
select pg_temp.ok((select count(*) from app.terrenos_sobrepostos(:'emp',
  '{"type":"Polygon","coordinates":[[[-46.69903,-23.6000],[-46.6980,-23.6000],[-46.6980,-23.6010],[-46.69903,-23.6010],[-46.69903,-23.6000]]]}', :'sb')) = 0,
  'faixa de 3 m na divisa não conta');
select pg_temp.ok((select largura_m between 7 and 9 from app.terrenos_sobrepostos(:'emp',
  '{"type":"Polygon","coordinates":[[[-46.69908,-23.6000],[-46.6980,-23.6000],[-46.6980,-23.6010],[-46.69908,-23.6010],[-46.69908,-23.6000]]]}', :'sb') where terreno_id = :'sa'),
  'faixa de 8 m conta, com a largura informada');
-- C entra 8 m pelo norte de A
\set qc '{"type":"Polygon","coordinates":[[[-46.7000,-23.5992],[-46.6990,-23.5992],[-46.6990,-23.60007],[-46.7000,-23.60007],[-46.7000,-23.5992]]]}'
select pg_temp.falha(format($$insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson) values (%L, 'C', %L, 'corretor', %L, 'Campo Limpo', %L)$$, :'emp', :'diretor', :'sp', :'qc'),
  'banco recusa poligonal que ocupa parte de outro terreno');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson, sobreposicoes_aceitas)
values (:'emp', 'C', :'diretor', 'corretor', :'sp', 'Campo Limpo', :'qc', array[:'sa']::uuid[]) returning id as sc \gset
select pg_temp.ok(:'sc' is not null, 'entra quando o usuário confirma que é outro terreno');
select versao as vb from app.terrenos where id = :'sb' \gset
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, jsonb_build_object('poligono_geojson', %L::jsonb))$$, :'sb', :vb, :'qa'), 'mudar a poligonal para cima de outro terreno também é recusado');
-- área nova no meio de A e B
\set meio '{"type":"Polygon","coordinates":[[[-46.6995,-23.6000],[-46.6985,-23.6000],[-46.6985,-23.6010],[-46.6995,-23.6010],[-46.6995,-23.6000]]]}'
select pg_temp.ok((select count(*) from app.terrenos_sobrepostos(:'emp', :'meio') where terreno_id in (:'sa', :'sb')) = 2, 'área no meio de A e B acha os dois');
select pg_temp.ok((select motivo = 'parcial' and pct_da_nova between 48 and 52 and pct_do_existente between 48 and 52 and area_sobreposta_m2 between 5000 and 6000
  from app.terrenos_sobrepostos(:'emp', :'meio') where terreno_id = :'sa'), 'mostra a área em comum e o percentual de cada lado');
select pg_temp.ok((select situacao from app.terrenos_sobrepostos(:'emp', :'meio') where terreno_id = :'sa') = 'sem_negociacao', 'informa a situação do existente');
select pg_temp.ok((select count(*) from app.terrenos_sobrepostos(:'emp', :'meio', :'sa') where terreno_id = :'sa') = 0, 'o terreno em edição fica fora da busca');
select pg_temp.ok((select motivo from app.terrenos_sobrepostos(:'emp', :'qa') where terreno_id = :'sa') = 'mesma_area', 'a mesma área desenhada de novo');
-- A é parte da área nova (3 lotes de 5)
select pg_temp.ok((select motivo = 'parcial' and pct_do_existente > 99 and pct_da_nova between 45 and 55 from app.terrenos_sobrepostos(:'emp',
  '{"type":"Polygon","coordinates":[[[-46.7000,-23.6000],[-46.6990,-23.6000],[-46.6990,-23.6020],[-46.7000,-23.6020],[-46.7000,-23.6000]]]}') where terreno_id = :'sa'),
  'área nova que contém o terreno inteiro: parcial, com 100% do existente');
-- lote estreito (5 × 27 m) desenhado duas vezes: a faixa tem menos de 5 m, mas cobre o lote inteiro
\set qn '{"type":"Polygon","coordinates":[[[-46.7100,-23.6000],[-46.70995,-23.6000],[-46.70995,-23.60025],[-46.7100,-23.60025],[-46.7100,-23.6000]]]}'
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
values (:'emp', 'Lote estreito', :'diretor', 'corretor', :'sp', 'Campo Limpo', :'qn') returning id as sn \gset
select pg_temp.ok((select motivo from app.terrenos_sobrepostos(:'emp', :'qn') where terreno_id = :'sn') = 'mesma_area', 'lote estreito repetido sempre avisa');
select pg_temp.ok((select count(*) from app.terrenos_sobrepostos(:'emp',
  '{"type":"Polygon","coordinates":[[[-46.6999,-23.6001],[-46.6991,-23.6009],[-46.6991,-23.6001],[-46.6999,-23.6009],[-46.6999,-23.6001]]]}') where terreno_id = :'sa') = 1,
  'desenho que se cruza (gravata) é corrigido e ainda acha o terreno');
select pg_temp.falha(format($$select * from app.terrenos_sobrepostos(%L, '{"type":"Polygon","coordinates":[[[-46.7,-23.6],[-46.69,-23.6]]]}')$$, :'emp'), 'poligonal inválida é recusada');
select pg_temp.falha(format($$select * from app.terrenos_sobrepostos(%L, '{"type":"Point","coordinates":[-46.7,-23.6]}')$$, :'emp'), 'ponto não serve como poligonal');
-- oferta de parte do terreno
select app.registrar_oferta(:'sa', 900000, p_poligono => '{"type":"Polygon","coordinates":[[[-46.7000,-23.6000],[-46.6995,-23.6000],[-46.6995,-23.6010],[-46.7000,-23.6010],[-46.7000,-23.6000]]]}') as ofp \gset
select pg_temp.ok((select poligono_geojson is not null from app.ofertas where terreno_id = :'sa'), 'oferta guarda o pedaço oferecido');
select pg_temp.falha(format($$select app.registrar_oferta(%L, 900000, p_poligono => %L)$$, :'sa', :'qb'), 'oferta que passa da poligonal do terreno é recusada');
select pg_temp.como(:'intruso');
select pg_temp.falha(format($$select * from app.terrenos_sobrepostos(%L, %L)$$, :'emp', :'meio'), 'outra empresa não consulta');
select pg_temp.como(:'diretor');
\echo 'TODOS OS TESTES PASSARAM'
