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
-- tarefa no quadro do terreno, na lista dada (padrão Fazer)
create function pg_temp.lista(p_ter uuid, p_nome text) returns uuid language sql as $$
  select l.id from fluxo.listas l join fluxo.quadros q on q.id = l.quadro_id
  where q.objeto_tipo = 'terreno' and q.objeto_id = p_ter and l.nome = p_nome $$;
create function pg_temp.tarefa(p_ter uuid, p_titulo text, p_prazo date, p_resp uuid default null, p_proc uuid default null, p_lista text default 'Fazer')
returns uuid language sql as $$
  insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, prazo, responsavel_id, processo_id)
  select q.empresa_id, q.id, pg_temp.lista(p_ter, p_lista), p_titulo, p_prazo, p_resp, p_proc
  from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = p_ter
  returning id $$;
set client_min_messages = notice;

\set diretor  '00000000-0000-0000-0000-00000000000a'
\set gestor   '00000000-0000-0000-0000-00000000000e'
\set analista '00000000-0000-0000-0000-00000000000b'
\set intruso  '00000000-0000-0000-0000-00000000000c'
\set leitor   '00000000-0000-0000-0000-00000000000d'

-- ---------------------------------------------------------------------
\echo '# empresa e equipe'
select pg_temp.como(:'diretor');
select pg_temp.falha($$select app.criar_empresa('Minha', 'Eu', auth.uid())$$, 'o usuário logado não cria empresa');
reset role;
select app.criar_empresa('BKM Teste', 'Moisés', :'diretor') as emp \gset
select pg_temp.como(:'diretor');
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
select pg_temp.ok((select count(*) from app.fases_modelo) = 8 and (select count(*) from app.fase_dependencias) = 6
  and (select count(*) from app.etapas_modelo where fase = 'novos_negocios') = 4 and (select count(*) from app.subetapas_modelo where fase = 'novos_negocios') = 13,
  'empresa nova recebe a cópia do funil padrão: 8 fases, Funding solta; Novos Negócios com 4 etapas e 13 subetapas');
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
select pg_temp.ok((select codigo from app.terrenos where id = :'t1') ~ '^[A-Z]\d{3}$', 'código curto (letra e 3 dígitos) gerado');
select pg_temp.ok(app.codigo_terreno(1) = 'A001' and app.codigo_terreno(999) = 'A999' and app.codigo_terreno(1000) = 'B001'
              and app.codigo_terreno(23976) = 'Z999', 'código: A001 a A999, depois B001, até Z999');
select pg_temp.ok(app.codigo_terreno(8 * 999) = 'H999' and app.codigo_terreno(8 * 999 + 1) = 'J001'
              and app.codigo_terreno(13 * 999) = 'N999' and app.codigo_terreno(13 * 999 + 1) = 'P001',
              'código pula as letras I e O: H999 → J001, N999 → P001');
select pg_temp.ok((select count(*) from generate_series(1, 23976) n where app.codigo_terreno(n) ~ '^[IO]') = 0
              and (select count(distinct app.codigo_terreno(n)) from generate_series(1, 23976) n) = 23976,
              'nenhum código com I ou O, e nenhum repetido');
select pg_temp.falha('select app.codigo_terreno(23977)', 'depois do Z999 não há código');
select pg_temp.ok((select situacao_ocupacao from app.terrenos where id = :'t1') = 'nao_informado', 'campo não preenchido fica "não informado"');
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
select pg_temp.ok((select count(*) from app.inscricao_valores where inscricao_id = :'ins' and vigente) = 1, 'só o exercício mais recente fica vigente');
select pg_temp.falha(format($$insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, situacao_iptu, fonte) values (%L, %L, 2024, 'tributado', 'Carnê antigo')$$, :'ins', :'emp'), 'exercício anterior ao atual é recusado');
select pg_temp.falha(format($$update app.inscricao_valores set iptu_valor_anual = 1 where inscricao_id = %L$$, :'ins'), 'valor lançado não é editado');
insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, valor_venal_terreno, situacao_iptu, iptu_valor_anual, fonte, notificacao) values
  (:'ins', :'emp', 2026, 3600000, 'tributado', 46000, 'Prefeitura de São Paulo: notificação de lançamento NL 01', '{"versao": 1, "notificacao": "01", "pagar": {"total": 46000}}');
select pg_temp.ok((select notificacao->'pagar'->>'total' from app.inscricao_valores where inscricao_id = :'ins' and vigente) = '46000', 'a notificação da Prefeitura fica guardada com o valor');
select pg_temp.falha(format($$insert into app.inscricao_valores (inscricao_id, empresa_id, exercicio, situacao_iptu, fonte, notificacao) values (%L, %L, 2026, 'tributado', 'x', '[1]')$$, :'ins', :'emp'), 'notificação precisa ser um objeto');
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
select pg_temp.ok((select count(*) from app.v_terreno_infraestrutura where terreno_id = :'t1' and disponibilidade = 'nao_verificado') = 8, 'os 8 itens da visita técnica começam como não verificados');
select pg_temp.falha(format($$insert into app.terreno_infraestrutura (terreno_id, item, empresa_id, disponibilidade) values (%L, 'agua', %L, 'sim')$$, :'t1', :'emp'),
  'sim/não exige data de verificação');
insert into app.terreno_infraestrutura (terreno_id, item, empresa_id, disponibilidade, data_verificacao, fonte) values (:'t1', 'agua', :'emp', 'sim', current_date, 'Visita');
select pg_temp.ok((select disponibilidade from app.v_terreno_infraestrutura where terreno_id = :'t1' and item = 'agua') = 'sim', 'água registrada como sim');
insert into app.terreno_infraestrutura (terreno_id, item, empresa_id, disponibilidade, data_verificacao, observacoes) values (:'t1', 'calcada', :'emp', 'parcial', current_date, 'Só na frente da Cupecê');
select pg_temp.ok((select disponibilidade from app.v_terreno_infraestrutura where terreno_id = :'t1' and item = 'calcada') = 'parcial', 'visita técnica aceita Parcial (e Não se aplica)');
select pg_temp.ok(not exists (select 1 from app.v_terreno_infraestrutura where item = 'fibra'), 'telefonia saiu da visita técnica');
\echo '# viabilidades técnicas'
select pg_temp.ok((select string_agg(servico, ',' order by ordem) from app.v_terreno_viabilidades_tecnicas where terreno_id = :'t1') = 'energia,agua,esgoto,gas'
  and not exists (select 1 from app.v_terreno_viabilidades_tecnicas where terreno_id = :'t1' and situacao <> 'nao_solicitada'), 'energia, água, esgoto e gás, todas não solicitadas');
select pg_temp.falha(format($$insert into app.terreno_viabilidades_tecnicas (terreno_id, servico, empresa_id, situacao) values (%L, 'asfalto', %L, 'solicitada')$$, :'t1', :'emp'),
  'asfalto não tem viabilidade técnica');
select pg_temp.falha(format($$insert into app.terreno_viabilidades_tecnicas (terreno_id, servico, empresa_id, situacao) values (%L, 'agua', %L, 'viavel')$$, :'t1', :'emp'),
  'retorno da concessionária exige a data de emissão');
select pg_temp.falha(format($$insert into app.terreno_viabilidades_tecnicas (terreno_id, servico, empresa_id, situacao, emitida_em, validade) values (%L, 'agua', %L, 'viavel', current_date, current_date - 1)$$, :'t1', :'emp'),
  'validade não pode ser antes da emissão');
insert into app.terreno_viabilidades_tecnicas (terreno_id, servico, empresa_id, situacao, concessionaria, emitida_em, validade) values (:'t1', 'agua', :'emp', 'viavel', ' Sabesp ', current_date - 400, current_date - 35);
insert into app.terreno_viabilidades_tecnicas (terreno_id, servico, empresa_id, situacao, emitida_em, validade, condicoes) values (:'t1', 'energia', :'emp', 'condicionada', current_date - 10, current_date + 170, 'Reforço da rede pela incorporadora');
select pg_temp.ok((select vencida and concessionaria = 'Sabesp' from app.v_terreno_viabilidades_tecnicas where terreno_id = :'t1' and servico = 'agua')
  and not (select vencida from app.v_terreno_viabilidades_tecnicas where terreno_id = :'t1' and servico = 'energia'), 'viabilidade com a validade passada sai como vencida');
\echo '# classificação topográfica'
select pg_temp.ok(app.classificar_topografia(:'emp', 3.9, 0.1) = 'plano' and app.classificar_topografia(:'emp', 5, 0.1) = 'plano'
  and app.classificar_topografia(:'emp', 9.5, 0.4) = 'inclinado' and app.classificar_topografia(:'emp', 12, 0.3) = 'acidentado_leve'
  and app.classificar_topografia(:'emp', 17.8, 0.8) = 'acidentado_mediano' and app.classificar_topografia(:'emp', 22, 0.4) = 'acidentado_intenso'
  and app.classificar_topografia(:'emp', 30, 0.4) = 'acidentado_agudo' and app.classificar_topografia(:'emp', 31, 0.2) = 'acidentado_critico'
  and app.classificar_topografia(:'emp', 24.4, 4.96) = 'acidentado_critico',
  'sete perfis pela declividade média; terra mexida acima de 1,5 m³/m² é crítico (o limite entra)');
select pg_temp.ok(app.classificar_topografia(:'emp', 25, null) = 'inclinado' and app.classificar_topografia(:'emp', 4, null) = 'plano'
  and app.classificar_topografia(:'emp', 40, null) = 'acidentado_critico',
  'sem a terra mexida (Google): plano, inclinado ou crítico pela declividade');
select app.registrar_topografia(:'t1', 12.2, 8.4, 0.31, 4.2, 'laser') as tperf \gset
select pg_temp.ok(:'tperf' = 'acidentado_leve' and (select topo_perfil = 'acidentado_leve' and topo_declividade_pct = 12.2 and topo_terra_m3m2 = 0.31 and topo_fonte = 'laser' and topo_calculado_por = :'diretor'
  from app.terrenos where id = :'t1'), 'medição do laser gravada com o perfil calculado no banco');
select app.registrar_topografia(:'t1', 12.2, 8.4, 0.9, 4.2, 'google') as tperf \gset
select pg_temp.ok(:'tperf' = 'inclinado' and (select topo_terra_m3m2 is null from app.terrenos where id = :'t1'), 'com o Google a terra mexida não é guardada');
select pg_temp.falha(format('select app.registrar_topografia(%L, 5, 5, null, 1, %L)', :'t1', 'laser'), 'com o laser a terra mexida é obrigatória');
select pg_temp.falha(format('select app.registrar_topografia(%L, null, 5, 0.1, 1, %L)', :'t1', 'laser'), 'a declividade média é obrigatória');
select app.registrar_topografia(:'t1', 12.2, 8.4, 0.31, 4.2, 'laser');
select pg_temp.falha(format('select app.salvar_topografia_config(%L, 5, 10, 13, 12, 24, 30, 1.5)', :'emp'), 'limite do mediano acima do leve');
select app.salvar_topografia_config(:'emp', 15, 18, 20, 25, 28, 35, 1.5);
select pg_temp.ok((select topo_perfil from app.terrenos where id = :'t1') = 'plano', 'limites novos reclassificam o que já foi medido');
select app.salvar_topografia_config(:'emp', 5, 10, 13, 19, 24, 30, 1.5);
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.salvar_topografia_config(%L, 5, 10, 13, 19, 24, 30, 1.5)', :'emp'), 'só o administrador muda os limites');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.registrar_topografia(%L, 5, 5, 0.1, 1, %L)', :'t1', 'laser'), 'leitura não grava a classificação');
select pg_temp.como(:'diretor');
select versao as tv from app.terrenos where id = :'t1' \gset
select app.salvar_terreno(:'t1', :tv, '{"visita_tecnica_em":"2026-11-03"}') \gset
select pg_temp.ok((select visita_tecnica_em = '2026-11-03' and topo_perfil is not null from app.terrenos where id = :'t1'), 'data da visita técnica pela ficha; sem mexer na poligonal, a classificação fica');
select versao as tv from app.terrenos where id = :'t1' \gset
select app.salvar_terreno(:'t1', :tv, '{"poligono_geojson":{"type":"Polygon","coordinates":[[[-46.65,-23.66],[-46.64,-23.66],[-46.64,-23.672],[-46.65,-23.66]]]}}') \gset
select pg_temp.ok((select topo_perfil is null and topo_fonte is null and topo_calculado_em is null from app.terrenos where id = :'t1'), 'poligonal nova apaga a classificação para medir de novo');

-- ---------------------------------------------------------------------
\echo '# parâmetros urbanísticos por zona e tipo de empreendimento'
select id as zeu from app.zoneamentos where sigla = 'ZEU' and municipio_id = :'sp' \gset
select id as zm from app.zoneamentos where sigla = 'ZM' and municipio_id = :'sp' \gset
select id as zeis2 from app.zoneamentos where sigla = 'ZEIS-2' and municipio_id = :'sp' \gset
select id as sjc from app.municipios where codigo_ibge = '3549904' \gset
select id as zm3 from app.zoneamentos where sigla = 'ZM3' and municipio_id = :'sjc' \gset
select id as zm2 from app.zoneamentos where sigla = 'ZM2' and municipio_id = :'sjc' \gset
select pg_temp.ok((select count(*) from app.zona_parametros where empresa_id = :'emp') = (select count(*) from app.zona_parametros where empresa_id is null)
              and (select count(*) from app.zona_parametros where empresa_id is null) > 200, 'empresa nova recebe a cópia do catálogo de parâmetros (SP e SJC)');
select pg_temp.ok((select ca_maximo from app.parametros_zona(:'emp', :'zeu', 'mercado')) = 4 and (select ca_maximo from app.parametros_zona(:'emp', :'zeu', 'his')) = 6
              and (select ca_maximo from app.parametros_zona(:'emp', :'zeu', 'hmp')) = 5, 'ZEU: CA máximo 4 no mercado, 6 no EHIS e 5 no EHMP');
select pg_temp.ok((select gabarito_sem_limite and gabarito_m is null and cota_parte_m2 = 20 from app.parametros_zona(:'emp', :'zeu', 'his')), 'ZEU sem limite de gabarito e cota-parte de 20 m²');
select pg_temp.ok((select tipo = 'mercado' and ca_maximo = 1 from app.parametros_zona(:'emp', (select id from app.zoneamentos where sigla = 'ZPR' and municipio_id = :'sp'), 'his')),
  'zona sem regra própria de HIS usa a de mercado e diz isso');
select pg_temp.ok((select not permitido from app.parametros_zona(:'emp', (select id from app.zoneamentos where sigla = 'ZMIS' and municipio_id = :'sp'), 'hmp')), 'EHMP proibido na ZMIS');
select pg_temp.ok((select ca_maximo from app.parametros_zona(:'emp', :'zeis2', 'his', null, 800)) = 2 and (select ca_maximo from app.parametros_zona(:'emp', :'zeis2', 'his', null, 1000)) = 4
              and (select ca_maximo from app.parametros_zona(:'emp', :'zeis2', 'his')) = 4, 'ZEIS-2: lote menor que 1.000 m² cai para CA 2; sem área, vale o lote grande');
select pg_temp.ok((select ca_maximo from app.parametros_zona(:'emp', :'zm3', 'mercado', 'MC')) = 3 and (select ca_maximo from app.parametros_zona(:'emp', :'zm3', 'mercado', 'ME')) = 2
              and (select ca_maximo from app.parametros_zona(:'emp', :'zm3', 'mercado', 'MOC')) = 1.3, 'SJC: CA máximo da ZM3 muda pela macrozona (3, 2 e 1,3 na Ocupação Controlada)');
select pg_temp.ok(not exists (select 1 from app.parametros_zona(:'emp', :'zm3', 'mercado')), 'SJC sem macrozona: parâmetro não informado');
select pg_temp.ok((select uso = 'RV1' and permitido from app.parametros_zona(:'emp', :'zm2', 'mercado', 'MC')), 'ZM2 sem uso escolhido: vale o vertical admitido (RV1), não o RV2 proibido');
select pg_temp.ok((select outorga_gratuita and ca_maximo = 3 and situacao = 'validar' from app.parametros_zona(:'emp', :'zm3', 'his', 'MC', null, 'RV2')),
  'SJC: HIS tem o mesmo CA do mercado e outorga gratuita (a validar)');
\set pj `cat tools/parametros/parametros.json`
select pg_temp.ok((select coalesce(jsonb_agg(r order by r->>'municipio', r->>'sigla', r->>'tipo', coalesce(r->>'uso', ''), coalesce(r->>'macrozona', ''),
                                        coalesce((r->>'lote_area_min_m2')::numeric, 0), coalesce((r->>'lote_area_max_m2')::numeric, 0)), '[]')
from (
  select jsonb_strip_nulls(jsonb_build_object(
    'municipio', m.codigo_ibge, 'sigla', z.sigla, 'tipo', p.tipo, 'uso', p.uso, 'macrozona', p.macrozona,
    'lote_area_min_m2', p.lote_area_min_m2, 'lote_area_max_m2', p.lote_area_max_m2, 'permitido', p.permitido,
    'ca_minimo', p.ca_minimo, 'ca_basico', p.ca_basico, 'ca_maximo', p.ca_maximo,
    'to_maximo', p.to_maximo, 'to_lote_grande', p.to_lote_grande, 'to_corte_m2', p.to_corte_m2,
    'gabarito_m', p.gabarito_m, 'gabarito_sem_limite', p.gabarito_sem_limite,
    'recuo_frente_m', p.recuo_frente_m, 'recuo_lateral_m', p.recuo_lateral_m, 'recuo_lateral_alto_m', p.recuo_lateral_alto_m,
    'cota_parte_m2', p.cota_parte_m2, 'max_unidades', p.max_unidades, 'permeabilidade', p.permeabilidade,
    'lote_minimo_m2', p.lote_minimo_m2, 'frente_minima_m', p.frente_minima_m, 'outorga_gratuita', p.outorga_gratuita,
    'regras', p.regras, 'fonte_norma', p.fonte_norma, 'fonte_dispositivo', p.fonte_dispositivo, 'fonte_url', p.fonte_url,
    'situacao', p.situacao)) as r
  from app.zona_parametros p
  join app.zoneamentos z on z.id = p.zoneamento_id
  join app.municipios m on m.id = z.municipio_id
  where p.empresa_id is null and p.ativo
) x) = :'pj'::jsonb, 'catálogo padrão do banco igual ao do protótipo (tools/parametros/parametros.json)');
select id as pzm from app.zona_parametros where empresa_id = :'emp' and zoneamento_id = :'zm' and tipo = 'mercado' \gset
select app.salvar_zona_parametro(:'emp', :'pzm', '{"gabarito_m":30,"situacao":"confirmado"}') \gset
select pg_temp.ok((select gabarito_m = 30 from app.zona_parametros where id = :'pzm') and (select gabarito_m = 28 from app.zona_parametros where empresa_id is null and zoneamento_id = :'zm' and tipo = 'mercado'),
  'administrador edita o parâmetro da empresa; o modelo padrão fica como está');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'zona_parametros' and registro_id = :'pzm' and acao = 'update') = 1, 'mudança no catálogo vai para os logs');
select pg_temp.falha(format($$select app.salvar_zona_parametro(%L, %L, '{"gabarito_m":30,"gabarito_sem_limite":true}')$$, :'emp', :'pzm'), 'gabarito sem limite não leva valor');
select pg_temp.falha(format($$select app.salvar_zona_parametro(%L, %L, '{"fonte_norma":""}')$$, :'emp', :'pzm'), 'parâmetro sempre com a fonte');
select pg_temp.falha(format($$select app.salvar_zona_parametro(%L, null, '{"zoneamento_id":"%s","tipo":"mercado","fonte_norma":"X"}')$$, :'emp', :'zm'), 'uma linha ativa por zona, tipo e condição');
select app.salvar_zona_parametro(:'emp', :'pzm', '{"gabarito_m":28}') \gset
select pg_temp.falha(format($$update app.zona_parametros set ca_maximo = 9 where id = %L$$, :'pzm'), 'catálogo só muda pela RPC');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select app.salvar_zona_parametro(%L, %L, '{"ca_maximo":9}')$$, :'emp', :'pzm'), 'só o administrador edita o catálogo de parâmetros');
select pg_temp.como(:'diretor');

\echo '# análise urbanística: zonas por lote, com os parâmetros do catálogo'
insert into app.analises_urbanisticas (empresa_id, terreno_id, responsavel_id, fonte) values (:'emp', :'t1', :'diretor', 'Certidão de uso do solo') returning id as a1 \gset
insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, area_abrangida_m2) values (:'emp', :'a1', :'zeu', 1400) returning id as az1 \gset
insert into app.analise_zoneamentos (empresa_id, analise_id, zoneamento_id, area_abrangida_m2) values (:'emp', :'a1', :'zm', 520) returning id as az2 \gset
select pg_temp.ok((select zoneamentos from app.v_urbanismo_vigente where terreno_id = :'t1') = 'ZEU / ZM', 'terreno com dois zoneamentos, do maior para o menor, separados por barra');
select pg_temp.ok((select algum_gabarito_sem_limite and ca_maximo = 4 and menor_gabarito_m = 28 and tem_area_sem_inscricao from app.v_urbanismo_vigente where terreno_id = :'t1'),
  'sem limite, menor gabarito e CA máximo resumidos');
select pg_temp.ok((select potencial_mercado_m2 = 1400*4 + 520*2 and potencial_his_m2 = 1400*6 + 520*3 and potencial_hmp_m2 = 1400*5 + 520*2.5 and potencial_basico_m2 = 1920
                     from app.v_urbanismo_vigente where terreno_id = :'t1'), 'potencial construtivo por tipo = soma de área × CA de cada zona');
select pg_temp.ok((select to_maximo from app.v_lote_zonas where id = :'az1' and tipo = 'mercado') = 0.70, 'TO pelo tamanho do lote (1.920 m²: a de lote grande)');
-- alteração no lote sem a fonte vale (fonte opcional desde 6/nov/2026)
update app.analise_zoneamentos set ca_maximo = 2.5 where id = :'az2';
select pg_temp.falha(format($$update app.analise_zoneamentos set gabarito_m = 30, gabarito_sem_limite = true, excecao_fonte = 'X' where id = %L$$, :'az2'), 'sem limite não leva valor');
select pg_temp.falha(format($$update app.analise_zoneamentos set ca_maximo = 0, excecao_fonte = 'X' where id = %L$$, :'az2'), 'CA nunca é zero');
update app.analise_zoneamentos set ca_maximo = 2.5, excecao_fonte = 'Consulta prévia 2026/123' where id = :'az2';
select pg_temp.ok((select ca_maximo = 2.5 and tem_excecao from app.v_lote_zonas where id = :'az2' and tipo = 'his')
              and (select potencial_mercado_m2 from app.v_urbanismo_vigente where terreno_id = :'t1') = 1400*4 + 520*2.5, 'exceção do lote vale por cima do catálogo');
update app.analise_zoneamentos set recuo_frente_m = 0, cota_parte_m2 = 25, ca_basico = 1.5, outorga_gratuita = true, excecao_fonte = 'Projeto aprovado 2026/77' where id = :'az1';
select pg_temp.ok((select recuo_frente_m = 0 and cota_parte_m2 = 25 and outorga_gratuita and tem_excecao and potencial_basico_m2 = 1400*1.5 and lote_minimo_m2 = 1000
                     from app.v_lote_zonas where id = :'az1' and tipo = 'mercado'), 'qualquer parâmetro preenchido sozinho pode ser alterado no lote (recuo, cota-parte, CA básico, outorga); o resto segue o catálogo');
update app.analise_zoneamentos set recuo_frente_m = null, cota_parte_m2 = null, ca_basico = null, outorga_gratuita = null where id = :'az1';
insert into app.analises_urbanisticas (empresa_id, terreno_id, fonte) values (:'emp', :'t1', 'Certidão nova') returning id as a2 \gset
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
-- a temperatura é do terreno (decisão do Moises, 9/nov/2026): vale sem negociação e o log é o da auditoria do terreno
reset role;
update app.auditoria set em = em - interval '1 minute' where tabela = 'terrenos' and registro_id = :'t1';
select pg_temp.como(:'diretor');
select app.definir_temperatura(:'tx', 3);
select pg_temp.ok((select temperatura from app.v_terrenos where id = :'tx') = 3 and (select negociacao_id is null from app.v_terrenos where id = :'tx'),
  'terreno sem negociação também tem temperatura');
select versao as v_t1 from app.terrenos where id = :'t1' \gset
select app.definir_temperatura(:'t1', 4);
select pg_temp.ok((select temperatura from app.v_terrenos where id = :'t1') = 4, 'temperatura 4 registrada');
select pg_temp.ok((select versao from app.terrenos where id = :'t1') = :v_t1, 'a temperatura não mexe na versão da ficha');
select pg_temp.falha(format('select app.definir_temperatura(%L, 6)', :'t1'), 'temperatura só de 1 a 5');
select pg_temp.falha(format('select app.salvar_terreno(%L, %s, %L)', :'t1', :v_t1, '{"temperatura":2}'), 'temperatura não passa pela salvar_terreno');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos' and registro_id = :'t1' and acao = 'update' and antes->'temperatura' is distinct from depois->'temperatura') = 1, 'mudança de temperatura vai para os logs do terreno');
select app.definir_temperatura(:'t1', 2);
select app.definir_temperatura(:'t1', 3);
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos' and registro_id = :'t1' and acao = 'update' and antes->'temperatura' is distinct from depois->'temperatura') = 1 and (select bool_and(antes->'temperatura' = 'null' and depois->>'temperatura' = '3') from app.auditoria
  where tabela = 'terrenos' and registro_id = :'t1' and acao = 'update' and antes->'temperatura' is distinct from depois->'temperatura'),
  'cliques seguidos na temperatura viram um registro só, do valor de antes ao final');
select pg_temp.falha(format('select app.desfazer_alteracao(%s)', (select max(id) from app.auditoria where tabela = 'terrenos' and registro_id = :'t1')),
  'temperatura não se desfaz pela lixeira');
select app.definir_temperatura(:'t1', null);
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos' and registro_id = :'t1' and acao = 'update' and antes->'temperatura' is distinct from depois->'temperatura') = 0, 'se a sequência volta ao valor de antes, não fica registro');
select app.definir_temperatura(:'t1', 4);
reset role;
update app.auditoria set em = em - interval '8 seconds' where tabela = 'terrenos' and registro_id = :'t1';
select pg_temp.como(:'diretor');
select app.definir_temperatura(:'t1', 5);
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos' and registro_id = :'t1' and acao = 'update' and antes->'temperatura' is distinct from depois->'temperatura') = 2, 'passados 7 segundos, a mudança seguinte é outro registro');
select pg_temp.como(:'analista');
select app.definir_temperatura(:'t1', 4);
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos' and registro_id = :'t1' and acao = 'update' and antes->'temperatura' is distinct from depois->'temperatura') = 3, 'outro usuário não junta com a mudança de quem veio antes');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.definir_temperatura(%L, 2)', :'t1'), 'leitura não muda a temperatura');
select pg_temp.como(:'diretor');

-- ---------------------------------------------------------------------
\echo '# tarefas'
select pg_temp.tarefa(:'t1', 'Cobrar contraproposta', current_date - 2, :'analista', :'neg');
select pg_temp.tarefa(:'t1', 'Agendar visita técnica', current_date + 3, :'diretor');
select pg_temp.ok((select tarefas_atrasadas from app.v_terrenos where id = :'t1') = 1, 'tarefa vencida e aberta conta como atrasada');
select pg_temp.ok((select proxima_tarefa from app.v_terrenos where id = :'t1') = 'Cobrar contraproposta', 'próxima tarefa = prazo mais cedo');
update fluxo.tarefas set lista_id = pg_temp.lista(:'t1', 'Feito'), resultado = 'Recebida por e-mail' where titulo = 'Cobrar contraproposta';
select pg_temp.ok((select concluida_em is not null and concluida_por = :'diretor' from fluxo.tarefas where titulo = 'Cobrar contraproposta'), 'levar para Feito conclui e preenche a data');
select pg_temp.ok((select tarefas_atrasadas from app.v_terrenos where id = :'t1') = 0, 'concluída deixa de contar como atrasada');

-- ---------------------------------------------------------------------
\echo '# propostas encadeadas'
select app.registrar_proposta(:'neg', 'bkm', 8000000, 'dinheiro', 'À vista na escritura') as p1 \gset
select app.registrar_proposta(:'neg', 'vendedor', 9000000, 'permuta_com_torna', 'Torna de R$ 3 mi') as p2 \gset
select pg_temp.ok((select status from app.propostas where id = :'p1') = 'apresentada', 'contraproposta do vendedor não mexe na da BKM (nenhuma sobrepõe outra)');
select pg_temp.ok((select proposta_anterior_id from app.propostas where id = :'p2') = :'p1', 'contraproposta aponta para a anterior');
select app.registrar_proposta(:'neg', 'bkm', 8500000, 'permuta_com_torna', 'R$ 6 mi + 8% em permuta') as p3 \gset
select app.registrar_proposta(:'neg', 'bkm', 8600000, 'permuta_com_torna', 'Ajuste da v3', current_date, current_date + 15) as p4 \gset
select pg_temp.ok((select status from app.propostas where id = :'p3') = 'apresentada', 'nova da mesma origem também não mexe na anterior');
select pg_temp.ok((select versao from app.propostas where id = :'p4') = 4, 'quarta versão');
select app.atualizar_status_proposta(:'p1', 'recusada');
select app.atualizar_status_proposta(:'p2', 'recusada');
select app.atualizar_status_proposta(:'p3', 'substituida');
select pg_temp.ok((select count(*) from app.propostas where id in (:'p1', :'p2', :'p3') and status in ('recusada','substituida')) = 3,
  'quem edita muda o status de qualquer proposta, também das antigas');

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
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'novos_negocios', 'etapa', 'negociacao', 'estudo_viabilidade')$$, :'emp'), 'analista não configura o funil');
select pg_temp.como(:'diretor');
select app.adicionar_prerequisito(:'emp', 'novos_negocios', 'etapa', 'negociacao', 'estudo_viabilidade') as pr1 \gset
select app.adicionar_prerequisito(:'emp', 'novos_negocios', 'subetapa', 'proposta_enviada', 'preparando_proposta') as pr2 \gset
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'novos_negocios', 'etapa', 'estudos', 'proposta_enviada')$$, :'emp'), 'pré-requisito de etapa posterior é recusado');
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'novos_negocios', 'subetapa', 'preparando_proposta', 'proposta_enviada')$$, :'emp'), 'ciclo entre subetapas é recusado');
select pg_temp.falha(format($$select app.adicionar_prerequisito(%L, 'novos_negocios', 'subetapa', 'aguardando_reuniao', 'preparando_proposta')$$, :'emp'), 'subetapa inicial não exige outra da própria etapa');
select pg_temp.como(:'analista');
select pg_temp.ok((app.checar_avanco(:'neg')->'itens') @> '[{"tipo":"prerequisito","ok":false,"requisito":"estudo_viabilidade"}]', 'quadro de avanço mostra o pré-requisito que falta');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'neg'), 'sem passar pelo Estudo de Viabilidade não entra em Negociação');
select pg_temp.falha(format('select app.mover_etapa(%L, true, %L)', :'neg', 'x'), 'analista não força');
select app.mover_subetapa(:'neg', 'estudo_viabilidade') \gset
select app.mover_subetapa(:'neg', 'analise_tecnica') \gset
select app.vincular_viabilidade(:'neg', 'Estudo base', 62000000, 15.2) \gset
select app.mover_etapa(:'neg') \gset
select pg_temp.ok((select etapa_atual = 'negociacao' and subetapa_atual = 'aguardando_reuniao' from app.processos where id = :'neg'),
  'passou pelo Estudo de Viabilidade (mesmo tendo saído dele) e entra em Negociação');
select pg_temp.ok((select abaixo_margem_min from app.v_terrenos where id = :'t1') is false, 'sem rentabilidade mínima definida, o aviso não acende');
select pg_temp.como(:'diretor');
select app.salvar_margem_minima(:'emp', 16);
select pg_temp.ok((select abaixo_margem_min and margem_minima_pct = 16 from app.v_terrenos where id = :'t1'), 'margem do estudo válido (15,2%) abaixo da mínima da empresa (16%) acende o aviso');
select app.salvar_margem_minima(:'emp', 15);
select pg_temp.ok((select abaixo_margem_min from app.v_terrenos where id = :'t1') is false, 'margem acima da mínima não acende');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'viabilidade_config') = 2, 'mudança da rentabilidade mínima vai para a auditoria');
select pg_temp.como(:'analista');
select app.registrar_proposta(:'neg', 'vendedor', 8900000, 'permuta_com_torna', 'Pede 9% em permuta') as p5 \gset
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
select app.salvar_subetapa(:'emp', 'novos_negocios', 'contrato_enviado', '{"aprova_gestor":true,"aprova_diretor":true}');
select app.salvar_subetapa(:'emp', 'novos_negocios', 'em_ajuste', '{"aprova_gestor":true,"aprova_diretor":true,"aprovacao_modo":"paralelo"}');
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
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L)', :'neg', 'concluido', '<p>Fechado</p>'), 'Comprado exige relato e pontos de sucesso');
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
-- excluir ponto da empresa da ficha: sai só deste terreno (4/nov/2026)
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.excluir_ponto_terreno(%L, %L)', :'tm', :'pterm'), 'leitura não exclui ponto do terreno');
select pg_temp.como(:'analista');
select app.excluir_ponto_terreno(:'tm', :'pterm');
select pg_temp.ok(not exists (select 1 from app.v_terreno_pontos where terreno_id = :'tm' and ponto_id = :'pterm'), 'ponto excluído some da ficha deste terreno');
select pg_temp.ok((select ativo from app.pontos_interesse where id = :'pterm'), 'ponto excluído do terreno continua ativo (outros terrenos e mapa)');
select pg_temp.falha(format($$insert into app.terreno_pontos_excluidos (terreno_id, ponto_id, empresa_id) values (%L, %L, %L)$$, :'tm', :'pcamp', :'emp'), 'exclusão do terreno não é gravada direto');
select app.excluir_ponto_terreno(:'tm', :'pterm');
select pg_temp.ok((select count(*) from app.terreno_pontos_excluidos where terreno_id = :'tm') = 1, 'excluir de novo não duplica');
select app.restaurar_ponto_terreno(:'tm', :'pterm');
select pg_temp.ok(exists (select 1 from app.v_terreno_pontos where terreno_id = :'tm' and ponto_id = :'pterm'), 'restaurar devolve o ponto à ficha');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terreno_pontos_excluidos') = 2, 'exclusão e restauração vão para os logs');
select pg_temp.como(:'analista');
update app.pontos_interesse set ativo = false where id = :'pcamp';
select pg_temp.ok(not exists (select 1 from app.v_terreno_pontos where ponto_id = :'pcamp'), 'ponto da empresa excluído (desligado) some de todos os terrenos');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'pontos_interesse' and registro_id = :'pcamp' and acao = 'update') = 1, 'exclusão do ponto vai para os logs');
select pg_temp.como(:'analista');
select pg_temp.como(:'leitor');
update app.pontos_interesse set ativo = true where id = :'pcamp';
select pg_temp.ok((select not ativo from app.pontos_interesse where id = :'pcamp'), 'leitura não restaura nem exclui ponto da empresa');
select pg_temp.como(:'analista');
update app.pontos_interesse set ativo = true where id = :'pcamp';
select pg_temp.ok((select ativo from app.pontos_interesse where id = :'pcamp'), 'analista restaura o ponto da empresa');
select pg_temp.como(:'diretor');
select pg_temp.ok((select situacao_mapa from app.v_mapa where id = :'tm') = 'sem_negociacao', 'pin sem negociação');

\echo '# entorno do terreno (Google, distância a pé)'
select pg_temp.ok((select count(*) from app.entorno_categorias where ativo) = 8, 'oito categorias de entorno ligadas: metrô/trem, shopping, hospital, escola/creche, supermercado, parque, terminal de ônibus e faculdade');
select pg_temp.ok((select count(*) from app.entorno_categorias where codigo in ('metro_trem','escola','faculdade') and min_avaliacoes is null) = 3, 'estação, escola e faculdade entram com qualquer número de avaliações');
select pg_temp.ok((select isento_nomes like '%shopping%' and um_por_local_m = 200 from app.entorno_categorias where codigo = 'shopping'), 'shopping passa pelo nome e junta as lojas de dentro');
select pg_temp.ok((select min_avaliacoes = 50 and isento_nomes like '%ubs%' from app.entorno_categorias where codigo = 'hospital'), 'hospital: clínica precisa de 50 avaliações, posto de saúde não');
select pg_temp.ok((select excluir_nomes like '%autoescola%' from app.entorno_categorias where codigo = 'escola'), 'escola: autoescola sai pelo nome');
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
select app.excluir_lugar_entorno(:'tm', 'g1');
select pg_temp.ok(not exists (select 1 from app.v_terreno_entorno where google_place_id = 'g1') and exists (select 1 from app.v_terreno_entorno where google_place_id = 'g3'), 'lugar do Google excluído some do entorno do terreno');
select pg_temp.ok((select excluido_por = :'analista'::uuid from app.terreno_entorno where terreno_id = :'tm' and google_place_id = 'g1'), 'exclusão guarda quem excluiu, para a lista de excluídos');
select app.salvar_entorno(:'tm', -23.6681, -46.6513, $j$[
  {"categoria":"metro_trem","google_place_id":"g1","nome":"Estação Exemplo","latitude":-23.667,"longitude":-46.652,"distancia_pe_m":620,"duracao_pe_s":480},
  {"categoria":"hospital","google_place_id":"g3","nome":"Hospital Perto","latitude":-23.673,"longitude":-46.645,"distancia_pe_m":1500,"duracao_pe_s":1140}
]$j$) \gset
select pg_temp.ok(not exists (select 1 from app.v_terreno_entorno where google_place_id = 'g1') and exists (select 1 from app.terreno_entorno where terreno_id = :'tm' and google_place_id = 'g1' and excluido_em is not null), 'lugar excluído continua fora depois de buscar de novo (terreno mudou de lugar)');
select pg_temp.falha(format('select app.excluir_lugar_entorno(%L, %L)', :'tm', 'g9'), 'só exclui lugar que está no entorno do terreno');
select pg_temp.falha(format($$update app.terreno_entorno set excluido_em = now() where terreno_id = %L and google_place_id = 'g3'$$, :'tm'), 'exclusão não é gravada direto, só pela RPC');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.excluir_lugar_entorno(%L, %L)', :'tm', 'g3'), 'leitura não exclui lugar do entorno');
select pg_temp.falha(format('select app.restaurar_lugar_entorno(%L, %L)', :'tm', 'g1'), 'leitura não restaura lugar do entorno');
select pg_temp.como(:'analista');
select app.restaurar_lugar_entorno(:'tm', 'g1');
select pg_temp.ok(exists (select 1 from app.v_terreno_entorno where google_place_id = 'g1'), 'lugar restaurado volta ao entorno sem nova busca');
select pg_temp.falha(format($$insert into app.terreno_entorno (empresa_id, terreno_id, categoria, google_place_id, nome, latitude, longitude, distancia_pe_m) values (%L, %L, 'hospital', 'x', 'x', 0, 0, 1)$$, :'emp', :'tm'), 'entorno não é gravado direto, só pela RPC');
select pg_temp.falha(format('select app.salvar_entorno(%L, -23.60, -46.60, %L)', :'tm', '[]'), 'busca feita para outra coordenada é recusada');
select app.salvar_entorno(:'tm', -23.6681, -46.6513, '[]', false) as ne2 \gset
select pg_temp.ok((select count(*) from app.terreno_entorno where terreno_id = :'tm') = 0 and (select not rota_a_pe from app.terreno_entorno_buscas where terreno_id = :'tm'), 'nova busca troca a anterior inteira');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terreno_entorno_buscas' and depois->>'terreno_id' = :'tm') = 3, 'busca do entorno vai para os logs');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terreno_entorno' and depois->>'google_place_id' = 'g1') = 2, 'exclusão e restauração do lugar vão para os logs (a busca não)');
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
\set gcam '{"cartorio_registro_imovel":[{"cd_numero_cartorio":"13º"}],"zona_fiscal":[{"sg_zona_fiscal":"ZF-1"}],"pde_macroarea_lei_18209":[{"sg_macroarea":"MUC"}]}'
select pg_temp.como(:'analista');
select app.registrar_consulta_lote(:'gi', :'glote', :'gpoli', 593.4, :'gcam',
  '[{"sigla":"ZEU","area_m2":500},{"sigla":"ZEU","area_m2":93.4},{"sigla":"ZXX","area_m2":1}]', '{drenagem}') as gc \gset
select pg_temp.ok((select area_cadastral_m2 = 593 and cib = '0DRHNJA-V' and zona_fiscal = 'ZF-1' from app.inscricoes_municipais where id = :'gi'),
  'consulta completa a área cadastral vazia, o CIB e a zona fiscal da inscrição');
select pg_temp.ok((select cartorio = '13º CRI' and cartorio_origem = 'prefeitura' from app.terrenos where id = :'tm'), 'consulta preenche o cartório vazio do terreno, vindo da prefeitura');
select versao as tmv from app.terrenos where id = :'tm' \gset
select app.salvar_terreno(:'tm', :tmv, '{"cartorio":"4º CRI"}') \gset
select pg_temp.ok((select cartorio = '4º CRI' and cartorio_origem = 'digitado' from app.terrenos where id = :'tm'), 'usuário troca o cartório: fica digitado');
select app.cartorio_da_prefeitura(:'tm', '13º CRI') as crok \gset
select pg_temp.ok(not :'crok' and (select cartorio from app.terrenos where id = :'tm') = '4º CRI', 'pino não troca o cartório digitado');
select versao as tmv from app.terrenos where id = :'tm' \gset
select app.salvar_terreno(:'tm', :tmv, '{"cartorio":""}') \gset
select pg_temp.ok((select cartorio is null and cartorio_origem is null from app.terrenos where id = :'tm'), 'cartório apagado volta a vazio, sem origem');
select app.cartorio_da_prefeitura(:'tm', '13º CRI') as crok \gset
select pg_temp.ok(:'crok' and (select cartorio_origem from app.terrenos where id = :'tm') = 'prefeitura', 'pino preenche o cartório vazio');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.cartorio_da_prefeitura(%L, %L)', :'tm', '1º CRI'), 'leitura não grava o cartório');
select pg_temp.como(:'analista');
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
-- dois lotes no mesmo terreno: cada consulta troca só as zonas do próprio lote
insert into app.inscricoes_municipais (empresa_id, terreno_id, municipio_id, inscricao) values (:'emp', :'tm', :msp, '009.027.0010-5') returning id as gi2 \gset
select app.registrar_consulta_lote(:'gi2', '{"cd_setor_fiscal":"009","cd_quadra_fiscal":"027","cd_lote":"0010","cd_digito_sql":"5"}', null, null, '{}',
  '[{"sigla":"ZM","area_m2":300},{"sigla":"ZEU","area_m2":20}]') \gset
select pg_temp.ok((select string_agg(sigla || ':' || area_abrangida_m2::int, ' ' order by inscricao, sigla) from app.v_lote_zonas where terreno_id = :'tm' and tipo = 'mercado')
  = 'ZEU:593 ZEU:20 ZM:300', 'segundo lote não apaga o primeiro: zonas de cada lote na análise vigente');
select pg_temp.ok((select zoneamentos = 'ZEU / ZM' and qtd_lotes = 2 and not tem_area_sem_inscricao from app.v_urbanismo_vigente where terreno_id = :'tm'), 'resumo com todas as zonas da área');
update app.analise_zoneamentos set gabarito_sem_limite = false, gabarito_m = 40, excecao_fonte = 'Operação urbana'
 where inscricao_id = :'gi' and analise_id = (select id from app.analises_urbanisticas where terreno_id = :'tm' and status = 'vigente');
select count(*) as nan from app.analises_urbanisticas where terreno_id = :'tm' \gset
select app.registrar_consulta_lote(:'gi', :'glote', null, null, '{}', '[{"sigla":"ZEU","area_m2":593.4}]') \gset
select pg_temp.ok((select count(*) from app.analises_urbanisticas where terreno_id = :'tm') = :nan, 'consulta com as mesmas zonas do lote não cria análise nova');
select app.registrar_consulta_lote(:'gi', :'glote', null, null, '{}', '[{"sigla":"ZEU","area_m2":590}]') \gset
select pg_temp.ok((select gabarito_m = 40 and not gabarito_sem_limite and area_abrangida_m2 = 590 from app.v_lote_zonas where inscricao_id = :'gi' and tipo = 'mercado')
              and (select count(*) from app.v_lote_zonas where inscricao_id = :'gi2' and tipo = 'mercado') = 2, 'exceção do lote passa para a análise nova; o outro lote fica como estava');
select app.registrar_zonas_sem_inscricao(:'tm', '[{"sigla":"ZM","area_m2":45.5}]') \gset
select pg_temp.ok((select tem_area_sem_inscricao and qtd_lotes = 2 from app.v_urbanismo_vigente where terreno_id = :'tm')
              and (select area_abrangida_m2 from app.v_lote_zonas where terreno_id = :'tm' and inscricao_id is null and tipo = 'mercado') = 45.5,
  'parte do terreno sem inscrição entra com a zona da poligonal');
select pg_temp.falha(format($$select app.registrar_zonas_sem_inscricao(%L, '[{"sigla":"ZM","area_m2":0}]')$$, :'tm'), 'zona com área zerada é recusada');
-- zonas de um lote registradas à mão (aba Parâmetros, "Registrar zonas")
select app.registrar_zonas_lote(:'tm', :'gi2', '[{"sigla":"ZM","area_m2":320}]', 'Certidão de uso do solo') \gset
select pg_temp.ok((select string_agg(sigla || ':' || area_abrangida_m2::int, ' ' order by sigla) from app.v_lote_zonas where inscricao_id = :'gi2' and tipo = 'mercado') = 'ZM:320'
              and (select fonte from app.analises_urbanisticas where terreno_id = :'tm' and status = 'vigente') = 'Certidão de uso do solo'
              and (select count(*) from app.v_lote_zonas where inscricao_id = :'gi' and tipo = 'mercado') = 1, 'zonas do lote à mão trocam só as daquele lote, com a fonte');
select pg_temp.falha(format($$select app.registrar_zonas_lote(%L, %L, '[{"sigla":"ZM","area_m2":10}]', ' ')$$, :'tm', :'gi2'), 'zonas à mão sem fonte são recusadas');
select pg_temp.falha(format($$select app.registrar_zonas_lote(%L, %L, '[{"sigla":"ZM","area_m2":10}]', 'x')$$, :'tm', :'ins'), 'lote de outro terreno é recusado nas zonas à mão');
select pg_temp.falha(format($$insert into app.analise_zoneamentos (empresa_id, analise_id, inscricao_id, zoneamento_id) values (%L, %L, %L, %L)$$,
  :'emp', (select id from app.analises_urbanisticas where terreno_id = :'tm' and status = 'vigente'), :'ins', :'zm'), 'lote de outro terreno é recusado');
select pg_temp.falha(format('select app.registrar_consulta_lote(%L, %L, null, null, %L, %L)', :'gi',
  '{"cd_setor_fiscal":"009","cd_quadra_fiscal":"027","cd_lote":"0010","cd_digito_sql":"1"}', '{}', '[]'), 'lote de outro SQL é recusado');
select pg_temp.falha(format($$update app.consultas_lote set zonas = '[]' where id = %L$$, :'gc'), 'consulta não é alterada');
select pg_temp.ok((select count(*) from app.consultas_lote where id = :'gc' and zonas <> '[]') = 1, 'consulta continua como foi gravada');
select app.registrar_documento(:'tm', 'lote_dxf', :'emp' || '/' || :'tm' || '/lote_dxf/a.dxf', 'lote.dxf') as gd \gset
select app.registrar_documento(:'tm', 'lote_dxf', :'emp' || '/' || :'tm' || '/lote_dxf/b.dxf', 'lote.dxf', p_documento => :'gd') as gd2 \gset
select pg_temp.ok(:'gd' = :'gd2' and (select count(*) from app.documento_versoes where documento_id = :'gd') = 2, 'DXF do lote vira documento com versões');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.registrar_consulta_lote(%L, %L, null, null, %L, %L)', :'gi', :'glote', '{}', '[]'), 'leitura não consulta a base da prefeitura');
select pg_temp.ok((select count(*) from app.consultas_lote where terreno_id = :'tm') = 5, 'leitura vê as consultas');
select pg_temp.como(:'diretor');
-- São José dos Campos: o GeoSanja devolve só a inscrição e a poligonal
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
  values (:'emp', 'Em SJC', :'diretor', 'prospeccao', :msj, 'Vila Adyanna', pg_temp.quadra(-45.8860, -23.1890)) returning id as tsj \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, municipio_id, inscricao) values (:'emp', :'tsj', :msj, '41.0024.0011.0000') returning id as gs \gset
select app.registrar_consulta_lote(:'gs', '{"inscricao":"41.0024.0011.0000"}', :'gpoli', 412.5,
  '{"anexo_07":[{"nome":"Centro expandido","ca_max":4}]}', '[{"sigla":"ZM2","area_m2":412.5,"macrozona":"MC"}]') as gcs \gset
select pg_temp.ok((select base = 'geosanja' and inscricao_norm = '41002400110000' from app.consultas_lote where id = :'gcs')
              and (select a.fonte = 'GeoSanja (Inscrição imobiliária 41.0024.0011.0000)' and a.observacoes is null and zz.sigla = 'ZM2'
                     from app.analises_urbanisticas a join app.analise_zoneamentos z on z.analise_id = a.id join app.zoneamentos zz on zz.id = z.zoneamento_id
                    where a.terreno_id = :'tsj' and a.status = 'vigente')
              and (select area_cadastral_m2 is null and cib is null from app.inscricoes_municipais where id = :'gs'),
  'GeoSanja: consulta e análise com a zona do catálogo de SJC; área cadastral fica vazia (não vem)');
select pg_temp.ok((select ca_maximo = 3 and macrozona = 'MC' from app.v_lote_zonas where terreno_id = :'tsj' and tipo = 'mercado'), 'GeoSanja: macrozona do lote escolhe o CA máximo de SJC');
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
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'consultas_lote') = 6, 'consultas do lote vão para os logs');
-- consulta pela poligonal do terreno (restrições e entorno da área inteira) e histórico de uso digitado
select pg_temp.como(:'analista');
select app.registrar_consulta_area(:'tm', '{"quota_ambiental":[{"pa":"PA 5"}],"arvore_v2":[{"cd_identificador":"1","_dist_m":12.5}],"mancha_inundacao_5":[]}', '{rede_comgas}') as gca \gset
select pg_temp.ok((select base = 'geosampa' and camadas#>>'{quota_ambiental,0,pa}' = 'PA 5' and camadas_com_erro = '{rede_comgas}'
                     and poligono_geojson = (select poligono_geojson from app.terrenos where id = :'tm') from app.consultas_area where id = :'gca'),
  'consulta pela poligonal guarda a base da cidade, a poligonal do terreno, o PA e as camadas que falharam');
select pg_temp.falha(format($$update app.consultas_area set camadas = '{}' where id = %L$$, :'gca'), 'consulta pela poligonal não é alterada');
select pg_temp.falha(format('select app.registrar_consulta_area(%L, %L)', :'tsj', '[]'), 'camadas que não são um objeto são recusadas');
select versao as tmv from app.terrenos where id = :'tm' \gset
select app.salvar_terreno(:'tm', :tmv, '{"historico_uso":"  Posto de gasolina até 1998  "}') \gset
select pg_temp.ok((select historico_uso from app.terrenos where id = :'tm') = 'Posto de gasolina até 1998', 'histórico de uso digitado, sem espaços nas pontas');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.registrar_consulta_area(%L, %L)', :'tm', '{}'), 'leitura não consulta pela poligonal');
select pg_temp.ok((select count(*) from app.consultas_area where terreno_id = :'tm') = 1, 'leitura vê a consulta pela poligonal');
select pg_temp.como(:'diretor');
-- limpa o que os testes seguintes contam (como superusuário)
reset role;
select set_config('request.jwt.claim.sub', '', false);
delete from app.terrenos where id = :'tsj';
delete from app.inscricoes_municipais where id in (:'gi', :'gi2', :'gdup');
select pg_temp.como(:'diretor');
select pg_temp.ok(not exists (select 1 from app.v_mapa where id = :'t1'), 'terreno arquivado sai do mapa');
select pg_temp.tarefa(:'tm', 'Visitar o lote', current_date - 1) as k1 \gset
select pg_temp.tarefa(:'tm', 'Pedir matrícula', current_date + 5) as k2 \gset
select pg_temp.ok((select posicao from fluxo.tarefas where id = :'k2') > (select posicao from fluxo.tarefas where id = :'k1'), 'tarefa nova entra no fim da lista');
select pg_temp.ok((select atrasada and terreno_nome = 'Pin no mapa' and lista_nome = 'Fazer' from app.v_tarefas where id = :'k1'), 'quadro de tarefas mostra lista, atraso e terreno');
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Fazendo'), posicao = (select posicao from fluxo.tarefas where id = :'k1') - 1 where id = :'k2';
select pg_temp.ok((select lista_nome = 'Fazendo' and concluida_em is null from app.v_tarefas where id = :'k2'), 'arrastar a tarefa muda a lista');

-- ---------------------------------------------------------------------
\echo '# somente leitura'
select pg_temp.como(:'leitor');
select pg_temp.ok((select count(*) from app.v_terrenos) = 4, 'leitura vê os terrenos');
select pg_temp.ok((select count(*) from app.v_inscricoes) = 1, 'leitura vê valor venal e IPTU');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos') >= 3, 'leitura vê os logs da ficha');
select pg_temp.falha(format($$select pg_temp.tarefa(%L, 'x', current_date)$$, :'t2'), 'leitura não cria tarefa');
select q.id as q2, pg_temp.lista(:'t2', 'Fazer') as l2 from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'t2' \gset
select pg_temp.falha(format($$select app.salvar_terreno(%L, 1, '{"nome":"x"}')$$, :'t2'), 'leitura não edita terreno');
select pg_temp.falha(format('select app.registrar_oferta(%L, 100)', :'t2'), 'leitura não registra oferta');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade) values (%L, %L, now(), 'online')$$, :'emp', :'t2'), 'leitura não registra reunião');

\echo '# isolamento entre empresas'
select pg_temp.como(:'intruso');
select pg_temp.ok((select count(*) from app.terrenos) = 0, 'outra pessoa não vê terrenos');
select pg_temp.ok((select count(*) from app.v_terrenos) = 0, 'outra pessoa não vê a listagem');
select pg_temp.ok((select count(*) from app.v_inscricoes) = 0, 'outra pessoa não vê valor venal');
select pg_temp.ok((select count(*) from app.auditoria) = 0, 'outra pessoa não vê os logs');
select pg_temp.ok((select count(*) from app.v_reunioes) = 0, 'outra pessoa não vê reuniões');
select pg_temp.ok((select count(*) from app.pontos_interesse) = 0 and (select count(*) from app.v_mapa) = 0, 'outra pessoa não vê mapa nem pontos de interesse');
select pg_temp.falha(format('select app.checar_avanco(%L)', :'neg'), 'outra pessoa não acessa RPC');
select pg_temp.falha(format($$insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo) values (%L, %L, %L, 'x')$$, :'emp', :'q2', :'l2'), 'outra pessoa não grava tarefa');
select pg_temp.ok((select count(*) from fluxo.tarefas) = 0 and (select count(*) from fluxo.quadros) = 0, 'outra pessoa não vê quadros nem tarefas');
select pg_temp.ok((select count(*) from app.municipios) = 5571, 'cadastros comuns continuam visíveis');

select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'terrenos') >= 3, 'auditoria registra alterações do terreno');
begin;
select pg_temp.tarefa(:'t2', 'Log A', current_date);
select pg_temp.tarefa(:'t2', 'Log B', current_date);
commit;
select pg_temp.ok((select bool_and(em > ant) from (select em, lag(em) over (order by id) ant from (select id, em from app.auditoria where tabela = 'tarefas' order by id desc limit 2) u) x where ant is not null),
  'alterações na mesma transação ficam em instantes distintos, na ordem em que aconteceram');
select id as tlog from fluxo.tarefas where titulo = 'Log A' \gset
update fluxo.tarefas set prioridade = 'alta' where id = :'tlog';
update fluxo.tarefas set prioridade = 'baixa' where id = :'tlog';
select pg_temp.ok((select count(*) = 1 and min(antes->>'prioridade') = 'media' and min(depois->>'prioridade') = 'baixa' from app.auditoria where registro_id = :'tlog' and acao = 'update'),
  'mudanças seguidas no mesmo campo viram um log só, do valor de antes ao final');
update fluxo.tarefas set prioridade = 'media' where id = :'tlog';
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tlog' and acao = 'update') = 0, 'se voltou ao valor de antes, o log some');
update fluxo.tarefas set prioridade = 'alta' where id = :'tlog';
update fluxo.tarefas set titulo = 'Log A1' where id = :'tlog';
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tlog' and acao = 'update') = 2, 'campo diferente é outro log');
reset role;
update app.auditoria set em = em - interval '8 seconds' where registro_id = :'tlog';
select pg_temp.como(:'diretor');
update fluxo.tarefas set titulo = 'Log A2' where id = :'tlog';
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tlog' and acao = 'update') = 3, 'passados 7 segundos, a mesma mudança é outro log');
-- ajuste na poligonal: salvamentos seguidos juntam por 2 minutos
select versao as vp from app.terrenos where id = :'tx' \gset
select count(*) as np0 from app.auditoria where registro_id = :'tx' and acao = 'update' \gset
select app.salvar_terreno(:'tx', :vp, jsonb_build_object('poligono_geojson', pg_temp.quadra(-46.6000, -23.6000, 32))) as vp \gset
select app.salvar_terreno(:'tx', :vp, jsonb_build_object('poligono_geojson', pg_temp.quadra(-46.6000, -23.6000, 34))) as vp \gset
reset role;
update app.auditoria set em = em - interval '90 seconds' where registro_id = :'tx';
select pg_temp.como(:'diretor');
select app.salvar_terreno(:'tx', :vp, jsonb_build_object('poligono_geojson', pg_temp.quadra(-46.6000, -23.6000, 36))) as vp \gset
select pg_temp.ok((select count(*) = :np0 + 1 and bool_or(depois->'poligono_geojson' = pg_temp.quadra(-46.6000, -23.6000, 36)) from app.auditoria where registro_id = :'tx' and acao = 'update'),
  'ajustes na poligonal a menos de 2 minutos um do outro viram um log só');
reset role;
update app.auditoria set em = em - interval '3 minutes' where registro_id = :'tx';
select pg_temp.como(:'diretor');
select app.salvar_terreno(:'tx', :vp, jsonb_build_object('poligono_geojson', pg_temp.quadra(-46.6000, -23.6000, 38))) as vp \gset
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tx' and acao = 'update') = :np0 + 2, 'passados 2 minutos, o ajuste seguinte é outro log');
select app.salvar_terreno(:'tx', :vp, '{"nome":"Outro terreno."}') as vp \gset
reset role;
update app.auditoria set em = em - interval '30 seconds' where registro_id = :'tx';
select pg_temp.como(:'diretor');
select app.salvar_terreno(:'tx', :vp, '{"nome":"Outro terreno"}') as vp \gset
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tx' and acao = 'update') = :np0 + 4, 'outros campos seguem com a janela de 7 segundos');
-- área da poligonal: calculada pelo desenho; adotada pela poligonal acompanha cada ajuste
select pg_temp.ok((select area_poligonal_m2 between 1440 and 1448 from app.terrenos where id = :'tx'), 'área da poligonal sai do desenho (quadrado de 38 m)');
select app.salvar_terreno(:'tx', :vp, '{"fonte_area_adotada":"poligonal","area_poligonal_m2":1}') as vp \gset
select pg_temp.ok((select area_adotada_m2 = area_poligonal_m2 and area_poligonal_m2 > 1 from app.terrenos where id = :'tx'), 'adotada pela poligonal fica igual à área do desenho (e a da poligonal não se digita)');
reset role;
update app.auditoria set em = em - interval '3 minutes' where registro_id = :'tx';
select pg_temp.como(:'diretor');
select count(*) as np1 from app.auditoria where registro_id = :'tx' and acao = 'update' \gset
select app.salvar_terreno(:'tx', :vp, jsonb_build_object('poligono_geojson', pg_temp.quadra(-46.6000, -23.6000, 40))) as vp \gset
select app.salvar_terreno(:'tx', :vp, jsonb_build_object('poligono_geojson', pg_temp.quadra(-46.6000, -23.6000, 39))) as vp \gset
select pg_temp.ok((select area_adotada_m2 = area_poligonal_m2 and area_poligonal_m2 between 1517 and 1525 from app.terrenos where id = :'tx'), 'ajustar a poligonal muda a área adotada junto');
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tx' and acao = 'update') = :np1 + 1, 'com a área adotada junto, os ajustes seguem num log só por 2 minutos');
select app.salvar_terreno(:'tx', :vp, '{"fonte_area_adotada":null,"area_adotada_m2":null}') as vp \gset
-- lixeira do log: desfazer uma alteração deixa o rastro
select pg_temp.como(:'analista');
select versao as vp from app.terrenos where id = :'tx' \gset
select coalesce(testada_principal_m::text, '') as td0 from app.terrenos where id = :'tx' \gset
select app.salvar_terreno(:'tx', :vp, '{"testada_principal_m": 41}') as vp \gset
reset role;
select max(id) as aud_a from app.auditoria where registro_id = :'tx' and acao = 'update' \gset
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.desfazer_alteracao(%s)', :aud_a), 'leitura não desfaz');
select pg_temp.como(:'analista');
select app.desfazer_alteracao(:aud_a) as vp \gset
select pg_temp.ok((select testada_principal_m is not distinct from nullif(:'td0', '')::numeric from app.terrenos where id = :'tx'), 'quem fez desfaz: o campo volta ao valor de antes');
reset role;
select pg_temp.ok((select desfeito_em is not null and desfeito_por = :'analista' from app.auditoria where id = :aud_a)
  and (select desfaz_id = :aud_a and antes->>'testada_principal_m' = '41.00' from app.auditoria where id = (select max(id) from app.auditoria where registro_id = :'tx' and acao = 'update')),
  'o log original fica marcado como desfeito e a volta é um log novo que aponta para ele');
select max(id) as aud_v from app.auditoria where registro_id = :'tx' and acao = 'update' \gset
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.desfazer_alteracao(%s)', :aud_a), 'alteração já desfeita não se desfaz de novo');
select pg_temp.falha(format('select app.desfazer_alteracao(%s)', :aud_v), 'o desfazer não se desfaz');
select app.salvar_terreno(:'tx', :vp, '{"testada_principal_m": 42}') as vp \gset
reset role;
select max(id) as aud_b from app.auditoria where registro_id = :'tx' and acao = 'update' \gset
select pg_temp.ok(:aud_b > :aud_v, 'mudança logo depois do desfazer é outro log');
select pg_temp.como(:'gestor');
select app.salvar_terreno(:'tx', :vp, '{"testada_principal_m": 43}') as vp \gset
select pg_temp.falha(format('select app.desfazer_alteracao(%s)', :aud_b), 'campo que mudou depois não se desfaz por um log antigo');
reset role;
select max(id) as aud_c from app.auditoria where registro_id = :'tx' and acao = 'update' \gset
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.desfazer_alteracao(%s)', :aud_c), 'analista não desfaz a alteração do gestor dele');
select pg_temp.como(:'diretor');
select app.desfazer_alteracao(:aud_c) as vp \gset
select pg_temp.ok((select testada_principal_m = 42 from app.terrenos where id = :'tx'), 'o diretor (superior e administrador) desfaz a alteração do gestor');
select pg_temp.falha('select app.desfazer_alteracao((select min(id) from app.auditoria where tabela = ''membros''))', 'só alterações da ficha do terreno se desfazem');

\echo '# fechamento como comprado'
select app.registrar_oferta(:'t2', 3000000) \gset
select id as ng from app.processos where terreno_id = :'t2' and status = 'ativo' \gset
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.mover_para_etapa(%L, %L)', :'ng', 'negociacao'), 'arrastar duas etapas para frente checa cada uma');
select pg_temp.ok((select etapa_atual from app.processos where id = :'ng') = 'triagem', 'falha no meio do caminho não muda nada');
select pg_temp.ok((select situacao_mapa from app.v_mapa where id = :'t2') = 'triagem', 'pin da negociação ativa usa a etapa');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L, p_pontos_sucesso => %L)', :'ng', 'concluido', 'x', 'y'), 'compra só na última etapa');
select pg_temp.como(:'gestor');
select app.mover_etapa(:'ng') \gset
select app.mover_etapa(:'ng', true, 'Estudo em andamento') \gset
select app.mover_etapa(:'ng') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'ng') = 'contrato', 'gestor leva ao Contrato sem pedir aprovação');
select pg_temp.ok((app.checar_avanco(:'ng')->>'proxima') = 'concluido' and (app.checar_avanco(:'ng')->>'proxima_tipo') = 'status', 'depois do Contrato vem o fechamento como Comprado');
select pg_temp.ok((app.checar_avanco(:'ng')->'aprovacoes') = '["diretor"]', 'compra pede o diretor (o gestor já tem o nível dele)');
insert into app.diligencias (empresa_id, terreno_id, processo_id, categoria, titulo, situacao) values
  (:'emp', :'t2', :'ng', 'ambiental', 'Possível contaminação por posto vizinho', 'impeditiva') returning id as dg \gset
select pg_temp.ok((app.checar_avanco(:'ng')->'itens') @> '[{"tipo":"diligencia"}]', 'diligência impeditiva trava a compra');
select pg_temp.ok((app.checar_avanco(:'ng')->'itens') @> '[{"tipo":"documento","ok":false}]', 'compra exige certidões e minuta');
select pg_temp.ok((select diligencias_impeditivas from app.v_terrenos where id = :'t2') = 1, 'listagem conta diligências impeditivas');
update app.diligencias set situacao = 'resolvida', providencia = 'Laudo de passivo ambiental negativo' where id = :'dg';
select pg_temp.ok((select resolvida_em is not null from app.diligencias where id = :'dg'), 'resolver preenche a data');
select pg_temp.ok(not ((app.checar_avanco(:'ng')->'itens') @> '[{"tipo":"diligencia"}]'), 'diligência resolvida sai das pendências');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L, p_pontos_sucesso => %L)', :'ng', 'concluido', 'x', 'y'), 'compra com documento pendente é recusada');
select app.encerrar_processo(:'ng', 'concluido', p_detalhe => '<p>Compra fechada com permuta</p>', p_pontos_sucesso => '<ul><li>Permuta aceita</li></ul>',
                             p_forcar => true, p_comentario => 'Certidões na escritura') as r \gset
select pg_temp.ok((:'r'::jsonb->>'resultado') = 'aguardando_aprovacao' and (select status from app.processos where id = :'ng') = 'ativo', 'gestor força e a compra aguarda o diretor');
select pedido_id as ped5 from app.aprovacoes where processo_id = :'ng' and status = 'pendente' \gset
select pg_temp.como(:'diretor');
select app.decidir_aprovacao(:'ped5', true) \gset
select pg_temp.ok((select status = 'concluido' and etapa_atual = 'contrato' and pontos_sucesso is not null and detalhe_encerramento is not null from app.processos where id = :'ng'),
  'diretor aprova: Comprado, com relato e pontos de sucesso, guardando a última etapa');
select pg_temp.ok((select evento = 'conclusao' and forcado from app.processo_transicoes where processo_id = :'ng' order by em desc limit 1), 'compra vai para o histórico, forçada');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'ng'), 'negociação comprada não avança mais');

\echo '# fases'
select id as ap from app.processos where terreno_id = :'t2' and fase = 'aprovacao' \gset
select pg_temp.ok((select codigo like 'APR-%' and status = 'ativo' and etapa_atual = 'projeto' and subetapa_atual = 'estudo_implantacao' from app.processos where id = :'ap'),
  'comprado abre sozinho a Aprovação de Projetos, na primeira etapa, com o prefixo da fase');
select pg_temp.ok((select codigo like 'NEG-%' from app.processos where id = :'ng'), 'o processo de Novos Negócios leva o prefixo NEG');
select pg_temp.ok((select fase = 'aprovacao' and fase_nome = 'Aprovação de Projetos' and processo_status = 'ativo' and negociacao_status = 'concluido'
                     and processo_status_nome is null and fases_abertas = array['aprovacao'] from app.v_terrenos where id = :'t2'),
  'a ficha mostra a fase atual e guarda o status da negociação');
select pg_temp.ok((select fase = 'aprovacao' and situacao_mapa = 'projeto' from app.v_mapa where id = :'t2'), 'pin com a fase e a etapa atual (filtro por fase)');
select pg_temp.ok((select count(*) from app.fases_do_terreno(:'t2') where status = 'concluido' and status_nome = 'Comprado') = 1
  and (select not pode_abrir from app.fases_do_terreno(:'t2') where fase = 'aprovacao')
  and (select dependencias @> '[{"ok":false}]' from app.fases_do_terreno(:'t2') where fase = 'incorporacao'),
  'fases do terreno: Comprado, a fase aberta e o que falta para a próxima');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, %L, %L)', :'ap', 'perdido', 'sem_retorno', 'x'), 'Perdido não existe na Aprovação de Projetos');
select pg_temp.falha(format('select app.registrar_proposta(%L, %L, 100, %L)', :'ap', 'bkm', 'a_vista'), 'proposta só na negociação');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L)', :'ap', 'concluido', 'Aprovado'), 'fase se conclui só na última etapa');
select app.mover_para_etapa(:'ap', 'alvaras') \gset
select pg_temp.falha(format('select app.encerrar_processo(%L, %L)', :'ap', 'concluido'), 'concluir a fase exige relato');
select app.encerrar_processo(:'ap', 'concluido', p_detalhe => '<p>Alvará de execução emitido</p>') \gset
select pg_temp.ok((select status from app.processos where id = :'ap') = 'concluido'
  and exists (select 1 from app.processos where terreno_id = :'t2' and fase = 'incorporacao' and status = 'ativo'),
  'concluir a Aprovação (sem pontos de sucesso) abre o Registro de Incorporação');
select pg_temp.falha(format('select app.abrir_fase(%L, %L)', :'t2', 'incorporacao'), 'não abre a fase em que o terreno já está');

\echo '# configuração do funil (administrador)'
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select app.salvar_etapa(%L, 'novos_negocios', 'estudos', '{"nome":"Estudos"}')$$, :'emp'), 'só o administrador muda a configuração');
select pg_temp.falha(format($$update app.etapas_modelo set nome = 'X' where empresa_id = %L$$, :'emp'), 'configuração não muda direto na tabela');
select pg_temp.como(:'diretor');
select app.salvar_etapa(:'emp', 'novos_negocios', 'estudos', '{"nome":"Estudos","sla_dias":15}');
select pg_temp.ok((select nome = 'Estudos' and sla_dias = 15 from app.etapas_modelo where codigo = 'estudos'), 'administrador renomeia a etapa e muda o prazo');
select app.salvar_subetapa(:'emp', 'novos_negocios', 'due_diligence', '{"etapa":"contrato","nome":"Due diligence","prazo_dias":20}');
select pg_temp.ok((select ordem = 4 and ativo from app.subetapas_modelo where codigo = 'due_diligence'), 'subetapa nova entra no fim do kanban da etapa');
select app.apagar_subetapa(:'emp', 'novos_negocios', 'due_diligence');
select pg_temp.falha(format($$select app.apagar_subetapa(%L, 'novos_negocios', 'aguardando_informacoes')$$, :'emp'), 'subetapa com histórico não é apagada, só desativada');
select pg_temp.falha(format($$select app.salvar_subetapa(%L, 'novos_negocios', 'estudo_viabilidade', '{"ativo":false}')$$, :'emp'), 'não desativa subetapa de que outra passagem depende');
select pg_temp.falha(format($$select app.salvar_subetapa(%L, 'novos_negocios', 'estudo_massa', '{"etapa":"triagem"}')$$, :'emp'), 'subetapa não muda de etapa');
select app.registrar_oferta(:'tx', 1500000) \gset
select id as nx from app.processos where terreno_id = :'tx' and status = 'ativo' \gset
select pg_temp.falha(format($$select app.salvar_subetapa(%L, 'novos_negocios', 'aguardando_informacoes', '{"ativo":false}')$$, :'emp'), 'desativar com terrenos dentro pede para onde movê-los');
select app.salvar_subetapa(:'emp', 'novos_negocios', 'aguardando_informacoes', '{"ativo":false,"mover_para":"aguardando_documentos"}');
select pg_temp.ok((select subetapa_atual from app.processos where id = :'nx') = 'aguardando_documentos', 'terrenos da subetapa desativada vão para a escolhida');
reset role;
select pg_temp.ok(app._subetapa_inicial(:'emp', 'novos_negocios', 'triagem') = 'aguardando_documentos', 'subetapa inicial passa a ser a primeira ativa');
select pg_temp.como(:'diretor');
select app.salvar_subetapa(:'emp', 'novos_negocios', 'aguardando_informacoes', '{"ativo":true}');
select app.remover_prerequisito(:'pr2');
select pg_temp.ok(not exists (select 1 from app.prerequisitos_modelo where id = :'pr2'), 'pré-requisito removido');
select app.salvar_motivo(:'emp', 'perdido', 'permuta_recusada', '{"nome":"Recusou permuta física"}');
select pg_temp.ok((select ordem from app.motivos_encerramento where codigo = 'permuta_recusada') = 8, 'motivo novo entra no fim da lista');
select pg_temp.falha(format($$select app.apagar_motivo(%L, 'perdido', 'vendido_terceiro')$$, :'emp'), 'motivo já usado não é apagado');
select app.salvar_motivo(:'emp', 'perdido', 'vendido_terceiro', '{"ativo":false}');
select app.salvar_checklist(:'emp', 'novos_negocios', 'estudos', 'planialtimetrico', false);
select pg_temp.ok((select not obrigatorio from app.checklist_modelo where etapa = 'estudos' and tipo_documento = 'planialtimetrico'), 'checklist da etapa editado pelo administrador');
select app.remover_checklist(:'emp', 'novos_negocios', 'estudos', 'planialtimetrico');
select app.configurar_status(:'emp', 'novos_negocios', 'concluido', '{"aprovacao_modo":"paralelo"}');

\echo '# configuração das fases (administrador)'
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select app.salvar_fase(%L, 'regularizacao', '{"nome":"Regularização","prefixo":"REG"}')$$, :'emp'), 'só o administrador cria fase');
select pg_temp.como(:'diretor');
select app.salvar_fase(:'emp', 'regularizacao', '{"nome":"Regularização","prefixo":"reg"}');
select pg_temp.ok((select ordem = 9 and prefixo = 'REG' and ativo and not entrada from app.fases_modelo where empresa_id = :'emp' and codigo = 'regularizacao'),
  'fase nova entra no fim, com o prefixo em maiúsculas');
select pg_temp.falha(format($$select app.salvar_fase(%L, 'outra', '{"nome":"Outra","prefixo":"NEG"}')$$, :'emp'), 'prefixo é único na empresa');
select pg_temp.falha(format($$select app.salvar_fase(%L, 'novos_negocios', '{"ativo":false}')$$, :'emp'), 'a fase de entrada não é desativada');
select pg_temp.falha(format($$select app.apagar_fase(%L, 'aprovacao')$$, :'emp'), 'fase com histórico não é apagada');
select pg_temp.falha(format($$select app.salvar_fase(%L, 'incorporacao', '{"ativo":false}')$$, :'emp'), 'fase com terreno dentro não é desativada');
select app.salvar_etapa(:'emp', 'regularizacao', 'levantamento', '{"nome":"Levantamento"}');
select app.salvar_etapa(:'emp', 'regularizacao', 'averbacao', '{"nome":"Averbação","subetapa":"Protocolo"}');
select app.salvar_etapa(:'emp', 'regularizacao', 'vistoria', '{"nome":"Vistoria","ordem":1}');
select pg_temp.ok((select string_agg(codigo, ',' order by ordem) from app.etapas_modelo where empresa_id = :'emp' and fase = 'regularizacao') = 'vistoria,levantamento,averbacao',
  'etapa nova pelo app, na ordem pedida, empurrando as outras');
select pg_temp.ok((select nome = 'Protocolo' and etapa = 'averbacao' from app.subetapas_modelo where empresa_id = :'emp' and fase = 'regularizacao' and codigo = 'averbacao'),
  'etapa nova nasce com uma subetapa');
select app.salvar_etapa(:'emp', 'regularizacao', 'vistoria', '{"ordem":3}');
select pg_temp.ok((select string_agg(codigo, ',' order by ordem) from app.etapas_modelo where empresa_id = :'emp' and fase = 'regularizacao') = 'levantamento,averbacao,vistoria',
  'reordenar etapa pelo app');
select app.apagar_etapa(:'emp', 'regularizacao', 'vistoria');
select pg_temp.ok((select count(*) from app.etapas_modelo where empresa_id = :'emp' and fase = 'regularizacao') = 2, 'etapa sem histórico é apagada');
select pg_temp.falha(format($$select app.apagar_etapa(%L, 'aprovacao', 'projeto')$$, :'emp'), 'etapa com histórico não é apagada');
select pg_temp.falha(format($$select app.adicionar_dependencia(%L, 'novos_negocios', 'obras', 'conclusao')$$, :'emp'), 'a fase de entrada não tem dependência');
select pg_temp.falha(format($$select app.adicionar_dependencia(%L, 'regularizacao', 'incorporacao', 'etapa', 'nao_existe')$$, :'emp'), 'dependência de etapa inexistente é recusada');
select app.adicionar_dependencia(:'emp', 'regularizacao', 'incorporacao', 'etapa', 'cartorio') as dep1 \gset
select pg_temp.falha(format($$select app.adicionar_dependencia(%L, 'aprovacao', 'regularizacao', 'conclusao')$$, :'emp'), 'ciclo entre fases é recusado');
select app.configurar_status(:'emp', 'regularizacao', 'concluido', '{"nome":"Regularizado"}');
select pg_temp.ok((select nome from app.status_modelo where empresa_id = :'emp' and fase = 'regularizacao' and status = 'concluido') = 'Regularizado', 'status da fase nova com nome próprio');
select pg_temp.falha(format($$select app.configurar_status(%L, 'regularizacao', 'concluido', '{"ativo":false}')$$, :'emp'), 'Concluído existe em toda fase');
select app.configurar_status(:'emp', 'aprovacao', 'perdido', '{}');
select app.configurar_status(:'emp', 'aprovacao', 'perdido', '{"ativo":false}');
select pg_temp.ok(not exists (select 1 from app.status_modelo where empresa_id = :'emp' and fase = 'aprovacao' and status = 'perdido'), 'status opcional entra e sai da fase');
select id as inc from app.processos where terreno_id = :'t2' and fase = 'incorporacao' \gset
select pg_temp.como(:'analista');
select app.mover_etapa(:'inc', true, 'x') \gset
select pg_temp.ok((select fases_abertas = array['incorporacao','regularizacao'] from app.v_terrenos where id = :'t2'),
  'chegar ao Cartório abre a Regularização junto: as duas fases correm em paralelo');
select pg_temp.ok((select fase from app.v_terrenos where id = :'t2') = 'regularizacao', 'a fase atual é a aberta mais adiante');
select pg_temp.como(:'diretor');
select app.remover_dependencia(:'dep1');
select app.salvar_fase(:'emp', 'vistoria_final', '{"nome":"Vistoria final","prefixo":"VIS"}');
select app.salvar_etapa(:'emp', 'vistoria_final', 'vistoria', '{"nome":"Vistoria"}');
select app.adicionar_dependencia(:'emp', 'vistoria_final', 'obras', 'conclusao');
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.abrir_fase(%L, %L)', :'t2', 'vistoria_final'), 'dependência pendente trava a abertura à mão');
select pg_temp.falha(format('select app.abrir_fase(%L, %L, true, %L)', :'t2', 'vistoria_final', 'urgente'), 'analista não força a abertura');
select pg_temp.como(:'gestor');
select pg_temp.falha(format('select app.abrir_fase(%L, %L, true)', :'t2', 'vistoria_final'), 'abertura forçada pede justificativa');
select app.abrir_fase(:'t2', 'vistoria_final', true, 'Vistoria pedida pelo banco') as vf \gset
select pg_temp.ok((select forcado and evento = 'abertura' from app.processo_transicoes where processo_id = :'vf'), 'abertura forçada vai para o histórico');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela in ('fases_modelo','fase_dependencias')) >= 5, 'configuração das fases vai para a auditoria');
select pg_temp.ok((select count(*) from app.auditoria where tabela in ('etapas_modelo','subetapas_modelo','motivos_encerramento','checklist_modelo','status_modelo','prerequisitos_modelo')) >= 10,
  'toda alteração de configuração vai para a auditoria');
select pg_temp.como(:'intruso');
reset role;
select app.criar_empresa('Outra', 'Fulano', :'intruso') as emp2 \gset
select pg_temp.como(:'intruso');
select pg_temp.ok((select nome from app.etapas_modelo where codigo = 'estudos') = 'Estudos Preliminares', 'cada empresa tem a sua configuração');
select pg_temp.como(:'diretor');

\echo '# notificações e lembretes'
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Pedir certidões', current_date + 2, :'gestor') as kn \gset
select pg_temp.ok(to_regclass('app.tarefa_marcados') is null, 'tarefa não tem lista de marcados: só o @ avisa');
select pg_temp.ok((select array_agg(dias_antes) from app.lembretes where origem_id = :'kn') = '{0}', 'tarefa nasce com lembrete no dia do prazo');
insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (:'emp', 'tarefas', :'kn', 1);
select pg_temp.falha(format($$insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (%L, 'tarefas', %L, 400)$$, :'emp', :'kn'), 'antecedência até 365 dias');
select pg_temp.falha(format($$insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (%L, 'tarefas', %L, 3)$$, :'emp2', :'kn'), 'lembrete não aponta item de outra empresa');
select pg_temp.falha(format($$insert into app.notificacoes (empresa_id, destinatario_id, tipo, texto, origem_tabela, origem_id, referencia) values (%L, %L, 'x', 'x', 'x', %L, current_date)$$, :'emp', :'gestor', :'kn'),
  'notificação só é criada pelo banco');
select pg_temp.como(:'diretor');
select pg_temp.ok(not exists (select 1 from app.tipos_notificacao where codigo = 'tarefa_marcado'), 'não existe aviso de marcado na tarefa, só de menção');
reset role;
select app.rotina_diaria(current_date + 1) \gset
select app.rotina_diaria(current_date + 2) \gset
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_atribuida') = 1, 'responsável é avisado da tarefa atribuída');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'tarefa_prazo') = 2, 'lembretes de 1 dia antes e do dia do prazo');
select pg_temp.ok((select texto from app.notificacoes where tipo = 'tarefa_prazo' order by referencia desc limit 1) like '%: hoje', 'no dia: "vence hoje"');
select pg_temp.como(:'analista');
update fluxo.tarefas set prazo = current_date + 6 where id = :'kn';
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
select app.salvar_subetapa(:'emp', 'novos_negocios', 'aguardando_documentos', '{"prazo_dias":3}');
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
\echo '# terreno com vários donos: uma negociação por parte'
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
values (:'emp', 'Três lotes na R. Itapura', :'analista', 'corretor', :'sp', 'Tatuapé', pg_temp.quadra(-46.8000, -23.7000, 90)) returning id as tv \gset
select pg_temp.ok((select count(*) = 1 and min(nome) = 'Vendedor 1' from app.terreno_partes where terreno_id = :'tv'), 'todo terreno nasce com uma parte, a Vendedor 1');
select app.salvar_parte(:'tv', (select id from app.terreno_partes where terreno_id = :'tv'), '{"nome":"Família Souza","area_m2":2700}') as pa \gset
select app.salvar_parte(:'tv', null, '{"nome":"Carlos Pires","area_m2":2700}') as pb \gset
select pg_temp.falha(format($$select app.salvar_parte(%L, null, '{"nome":"Oficina","essencial":false}')$$, :'tv'), 'só gestor ou diretor marca parte como dispensável');
select app.salvar_parte(:'tv', null, '{"nome":"Oficina do Zé","area_m2":2700}') as pc \gset
select pg_temp.falha(format($$select app.salvar_parte(%L, null, '{"nome":"Fora","poligono":%s}')$$, :'tv', pg_temp.quadra(-46.7000, -23.7000, 30)), 'pedaço da parte fica dentro do terreno');
select pg_temp.falha(format($$insert into app.terreno_partes (empresa_id, terreno_id, nome) values (%L, %L, 'Direto')$$, :'emp', :'tv'), 'parte só entra pela RPC');
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio) values (:'emp', :'tv', '201.001', '9º RI'), (:'emp', :'tv', '201.002', '9º RI'), (:'emp', :'tv', '201.003', '9º RI');
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id)
  select :'emp', :'tv', id, case when numero = '201.003' then :'pb'::uuid else :'pa'::uuid end from app.matriculas where terreno_id = :'tv';
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio) values (:'emp', :'t1', '1', '1º RI') returning id as m_t1 \gset
select pg_temp.falha(format($$insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id) values (%L, %L, %L, %L)$$, :'emp', :'t1', :'m_t1', :'pa'), 'matrícula só entra em parte do próprio terreno');
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'Ana Souza') returning id as pas \gset
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'Beto Souza') returning id as pbs \gset
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'Carlos Pires') returning id as pcp \gset
insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao, parte_id) values
  (:'emp', :'tv', :'pas', 'proprietario', 50, :'pa'), (:'emp', :'tv', :'pbs', 'proprietario', 50, :'pa'), (:'emp', :'tv', :'pcp', 'proprietario', 100, :'pb');
select pg_temp.ok((select sum(percentual_participacao) from app.terreno_pessoas where terreno_id = :'tv') = 200, 'participações somam 100% em cada parte (herdeiros juntos numa parte)');
select pg_temp.ok((select qtd_matriculas = 2 and proprietarios = 'Ana Souza, Beto Souza' from app.v_partes where id = :'pa'), 'parte mostra matrículas e donos');
insert into app.parte_corretores (empresa_id, parte_id, corretor_id) values (:'emp', :'pb', :'c1'), (:'emp', :'pb', :'c2'), (:'emp', :'pa', :'c1');
select pg_temp.ok((select count(*) from app.parte_corretores where parte_id = :'pb') = 2, 'uma parte pode ter vários corretores');
select pg_temp.ok((select count(*) from app.parte_corretores where corretor_id = :'c1' and parte_id in (:'pa', :'pb')) = 2, 'o mesmo corretor pode trazer várias partes');
select pg_temp.ok((select count(*) from app.terreno_corretores where terreno_id = :'tv') = 2 and (select count(*) from app.terreno_corretores where terreno_id = :'tv' and principal) = 1,
  'corretor da parte entra nos corretores do terreno, um só principal');
select pg_temp.ok((select corretores like '%, %' from app.v_partes where id = :'pb') and (select corretores is not null from app.v_partes where id = :'pa') and (select corretores is null from app.v_partes where id = :'pc'), 'parte mostra os seus corretores');

select app.registrar_oferta(:'tv', 9000000, p_partes => format('[{"parte_id":"%s","valor":3500000},{"parte_id":"%s"}]', :'pa', :'pb')::jsonb) as rv \gset
select (:'rv'::jsonb->>'processo_id') as nv \gset
select pg_temp.ok((select count(*) from app.oferta_partes where oferta_id = (:'rv'::jsonb->>'oferta_id')::uuid) = 2, 'oferta do corretor cobre duas partes, com preço de uma');
select pg_temp.ok(not exists (select 1 from app.processos where principal_id = :'nv'), 'antes da Negociação, uma negociação só (Triagem e Estudos são da área toda)');
select pg_temp.como(:'gestor');
select app.mover_etapa(:'nv') \gset
select app.mover_etapa(:'nv', true, 'Estudo pronto') \gset
select pg_temp.ok((select count(*) from app.processos where principal_id = :'nv' and status = 'ativo' and etapa_atual = 'negociacao' and subetapa_atual = 'aguardando_reuniao') = 3,
  'na Negociação, cada parte ganha a sua negociação, na subetapa inicial');
select id as na from app.processos where parte_id = :'pa' \gset
select id as nb from app.processos where parte_id = :'pb' \gset
select id as nc from app.processos where parte_id = :'pc' \gset
select pg_temp.ok((select codigo from app.processos where id = :'na') = (select codigo from app.processos where id = :'nv') || '-1', 'código da parte: o do terreno com um número');
select pg_temp.ok((select valor_pedido = 3500000 from app.v_partes where id = :'pa') and (select valor_pedido is null from app.v_partes where id = :'pb'),
  'preço pedido por parte vem da oferta');
select pg_temp.ok(not exists (select 1 from app.fases_do_terreno(:'tv') where processo_id in (:'na', :'nb', :'nc')), 'as partes não aparecem como fases');
select pg_temp.falha(format('select app.mover_subetapa(%L, %L)', :'nv', 'preparando_proposta'), 'negociação do terreno dividida não se move à mão');
select pg_temp.falha(format('select app.mover_para_etapa(%L, %L, false, %L)', :'na', 'estudos', 'voltar'), 'parte não volta para antes da Negociação');
select app.definir_temperatura(:'tv', 4);
select pg_temp.ok((select temperatura from app.v_terrenos where id = :'tv') = 4, 'temperatura do terreno dividido');
select app.registrar_proposta(:'na', 'bkm', 3200000, 'dinheiro') \gset
select pg_temp.ok((select ultima_proposta_valor from app.v_partes where id = :'pa') = 3200000 and (select ultima_proposta_valor is null from app.v_partes where id = :'pb'), 'propostas por parte');
select app.registrar_proposta(:'nb', 'bkm', 2000000, 'dinheiro', p_status => 'rascunho') \gset
select pg_temp.ok((select proposta_ativa_valor from app.v_terrenos where id = :'tv') = 3200000,
  'filtro por proposta: terreno dividido soma a última proposta ativa de cada parte (rascunho não conta)');
select pg_temp.ok((select uf = 'SP' and tem_partes and corretor_ids @> array[:'c1', :'c2']::uuid[] from app.v_terrenos where id = :'tv'),
  'lista de terrenos traz a UF, se tem partes e todos os corretores (inclusive os das partes)');
select app.mover_subetapa(:'na', 'proposta_enviada') \gset
select pg_temp.ok((select subetapa_atual from app.processos where id = :'nv') = 'aguardando_reuniao', 'o terreno fica na subetapa da parte mais atrasada');
select app.mover_etapa(:'na') \gset
select app.mover_etapa(:'nb') \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'nv') = 'negociacao', 'com uma parte na Negociação, o terreno continua nela');
select app.mover_etapa(:'nc') \gset
select pg_temp.ok((select etapa_atual = 'contrato' and subetapa_atual = 'em_elaboracao' from app.processos where id = :'nv'), 'todas no Contrato: o terreno vai junto');
select pg_temp.ok((select comentario = 'Pelas negociações das partes' and evento = 'avanco' from app.processo_transicoes where processo_id = :'nv' order by em desc limit 1),
  'o avanço do terreno vai para o histórico');

-- parte comprada, parte perdida
select pg_temp.como(:'diretor');
select app.encerrar_processo(:'na', 'concluido', p_detalhe => 'Escritura da Família Souza', p_forcar => true, p_comentario => 'Certidões na escritura') \gset
select pg_temp.ok((select status from app.processos where id = :'na') = 'concluido', 'parte comprada sem pontos de sucesso (só a compra do terreno pede)');
select pg_temp.ok((select status from app.processos where id = :'nv') = 'ativo', 'uma parte comprada não compra o terreno');
select pg_temp.como(:'analista');
select app.encerrar_processo(:'nc', 'perdido', 'desistiu_vender', 'O Zé vendeu a oficina para outra incorporadora') \gset
select app.encerrar_processo(:'nb', 'stand_by', p_detalhe => 'Carlos viajando', p_retomar_em => current_date + 10) \gset
select pg_temp.ok((select etapa_atual from app.processos where id = :'nv') = 'contrato', 'parte em stand by continua contando para a posição do terreno');
select app.retomar_processo(:'nb');
select pg_temp.como(:'diretor');
select app.encerrar_processo(:'nb', 'concluido', p_detalhe => 'Escritura do Carlos', p_forcar => true, p_comentario => 'Certidões na escritura') \gset
select pg_temp.ok((app.checar_avanco(:'nv')->'itens') @> '[{"tipo":"parte","ok":false,"bloqueio_gestor":true}]', 'parte perdida trava a compra do terreno, nem o gestor força');
select pg_temp.falha(format('select app.encerrar_processo(%L, %L, p_detalhe => %L, p_pontos_sucesso => %L, p_forcar => true, p_comentario => %L)', :'nv', 'concluido', 'x', 'y', 'z'),
  'terreno não fica Comprado com parte perdida');
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.remover_parte(%L, %L)', :'pc', 'Vendida a terceiro'), 'analista não tira parte essencial');
select pg_temp.como(:'gestor');
select pg_temp.falha(format('select app.remover_parte(%L, %L)', :'pa', 'x'), 'parte comprada não sai');
select app.remover_parte(:'pc', 'Vendida a terceiro: seguimos com dois lotes');
select pg_temp.ok((select not ativa and motivo_remocao is not null from app.terreno_partes where id = :'pc'), 'gestor tira a parte perdida, com motivo');
select pg_temp.ok(not ((app.checar_avanco(:'nv')->'itens') @> '[{"tipo":"parte","ok":false}]'), 'sem a parte perdida, as outras estão compradas');
select pg_temp.ok((app.checar_avanco(:'nv')->'itens') @> '[{"tipo":"parte","ok":true}]' and not ((app.checar_avanco(:'nv')->'itens') @> '[{"tipo":"documento"}]'),
  'checklist de documentos fica com cada parte');
select app.encerrar_processo(:'nv', 'concluido', p_detalhe => 'Área comprada em duas escrituras', p_pontos_sucesso => 'Negociação separada por família') \gset
select pedido_id as pedv from app.aprovacoes where processo_id = :'nv' and status = 'pendente' \gset
select pg_temp.como(:'diretor');
select app.decidir_aprovacao(:'pedv', true) \gset
select pg_temp.ok((select status from app.processos where id = :'nv') = 'concluido', 'todas as partes ativas compradas: o terreno fica Comprado');
select pg_temp.ok((select count(*) from app.processos where terreno_id = :'tv' and fase = 'aprovacao' and status = 'ativo') = 1,
  'a compra do terreno (não a de uma parte) abre a fase seguinte');

-- encerrar o terreno leva as partes
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
values (:'emp', 'Dois lotes na R. Tuiuti', :'analista', 'corretor', :'sp', 'Tatuapé', pg_temp.quadra(-46.8100, -23.7000, 60)) returning id as tw \gset
select app.salvar_parte(:'tw', (select id from app.terreno_partes where terreno_id = :'tw'), '{"nome":"Dono 1"}') as qa \gset
select (app.registrar_oferta(:'tw', 5000000)->>'processo_id') as nw \gset
select pg_temp.como(:'gestor');
select app.mover_para_etapa(:'nw', 'negociacao', true, 'Estudo dispensado') \gset
select pg_temp.ok(not exists (select 1 from app.processos where principal_id = :'nw'), 'com uma parte só, a negociação não se divide');
select app.salvar_parte(:'tw', null, '{"nome":"Dono 2"}') as qb2 \gset
select pg_temp.ok((select count(*) from app.processos where principal_id = :'nw') = 2, 'a segunda parte cadastrada já na Negociação divide a negociação');
select app.encerrar_processo(:'nw', 'stand_by', p_detalhe => 'Inventário do Dono 2', p_retomar_em => current_date + 30) \gset
select pg_temp.ok((select count(*) from app.processos where principal_id = :'nw' and status = 'stand_by') = 2, 'stand by do terreno para as partes');
select pg_temp.falha(format('select app.retomar_processo(%L)', (select id from app.processos where parte_id = :'qa')), 'parte não retoma com o terreno parado');
select app.retomar_processo(:'nw');
select pg_temp.ok((select count(*) from app.processos where principal_id = :'nw' and status = 'ativo') = 2, 'retomar o terreno retoma as partes');
select app.encerrar_processo(:'nw', 'descartado', 'financeira') \gset
select pg_temp.ok((select count(*) from app.processos where principal_id = :'nw' and status = 'descartado' and motivo_encerramento = 'financeira') = 2,
  'descartar o terreno descarta as partes, com o mesmo motivo');

-- ---------------------------------------------------------------------
\echo '# visões salvas dos filtros'
select pg_temp.como(:'analista');
insert into app.filtros_salvos (empresa_id, nome, filtros) values (:'emp', 'Quentes em SP', '{"temperatura":[4,5],"cidade":["São Paulo"]}') returning id as fs1 \gset
select pg_temp.falha(format($$insert into app.filtros_salvos (empresa_id, nome) values (%L, 'Quentes em SP')$$, :'emp'), 'nome repetido na mesma pessoa');
select pg_temp.falha(format($$insert into app.filtros_salvos (empresa_id, user_id, nome) values (%L, null, 'Da empresa')$$, :'emp'), 'só o administrador cria visão da empresa');
select pg_temp.falha(format($$insert into app.filtros_salvos (empresa_id, user_id, nome) values (%L, %L, 'De outro')$$, :'emp', :'gestor'), 'ninguém cria visão no nome de outro');
select pg_temp.como(:'leitor');
insert into app.filtros_salvos (empresa_id, nome) values (:'emp', 'Minha consulta');
select pg_temp.ok((select count(*) from app.filtros_salvos) = 1, 'Leitura salva as suas visões e não vê as dos outros');
select pg_temp.como(:'diretor');
insert into app.filtros_salvos (empresa_id, user_id, nome, filtros) values (:'emp', null, 'Prazo estourado', '{"atrasada":true}') returning id as fs2 \gset
select pg_temp.como(:'analista');
select pg_temp.ok((select count(*) from app.filtros_salvos) = 2, 'cada um vê as suas e as da empresa');
update app.filtros_salvos set nome = 'Mudada' where id = :'fs2';
select pg_temp.ok((select nome from app.filtros_salvos where id = :'fs2') = 'Prazo estourado', 'visão da empresa não muda por quem não é administrador');
delete from app.filtros_salvos where id = :'fs2';
select pg_temp.ok(exists (select 1 from app.filtros_salvos where id = :'fs2'), 'nem é apagada');
update app.filtros_salvos set filtros = '{"temperatura":[5]}' where id = :'fs1';
select pg_temp.ok((select filtros->'temperatura' = '[5]' from app.filtros_salvos where id = :'fs1'), 'a própria visão muda');
select pg_temp.como(:'intruso');
select pg_temp.ok((select count(*) from app.filtros_salvos) = 0, 'outra empresa não vê as visões');

-- ---------------------------------------------------------------------
\echo '# concorrência'
select pg_temp.como(:'analista');
insert into app.concorrentes (empresa_id, nome) values (:'emp', 'Construtora Exemplo') returning id as cc \gset
select pg_temp.falha(format($$insert into app.concorrentes (empresa_id, nome) values (%L, ' construtora exemplo ')$$, :'emp'), 'empresa concorrente com o mesmo nome');
insert into app.concorrencia_empreendimentos (empresa_id, concorrente_id, nome, latitude, longitude, unidades, situacao, data_lancamento)
  values (:'emp', :'cc', 'Residencial Jardim', -23.5862, -46.5795, 200, 'lancamento', '2026-03-01') returning id as ce \gset
insert into app.concorrencia_tipologias (empresa_id, empreendimento_id, area_privativa_m2, dormitorios, unidades, faixa)
  values (:'emp', :'ce', 40, 2, 150, 'his2') returning id as tp1 \gset
insert into app.concorrencia_tipologias (empresa_id, empreendimento_id, area_privativa_m2, dormitorios, unidades, faixa)
  values (:'emp', :'ce', 50, 2, 50, 'hmp') returning id as tp2 \gset
select pg_temp.ok((select preco_m2 is null and tipologias = 2 and tipologias_com_preco = 0 from app.v_concorrencia where id = :'ce'), 'sem preço apurado, sem preço por m²');
insert into app.concorrencia_precos (empresa_id, tipologia_id, apurado_em, preco_medio, fonte) values
  (:'emp', :'tp1', '2026-03-10', 240000, 'stand'), (:'emp', :'tp2', '2026-03-10', 350000, 'stand');
-- (240000×150 + 350000×50) ÷ (40×150 + 50×50) = 53.500.000 ÷ 8.500
select pg_temp.ok((select preco_m2 = 6294.12 and mix_completo from app.v_concorrencia where id = :'ce'), 'preço por m² ponderado pelo mix de unidades');
insert into app.concorrencia_precos (empresa_id, tipologia_id, apurado_em, preco_medio) values (:'emp', :'tp1', '2026-09-01', 260000);
select pg_temp.ok((select count(*) from app.concorrencia_precos where tipologia_id = :'tp1') = 2, 'preço novo vira linha nova, o anterior fica');
select pg_temp.ok((select apurado_de = '2026-03-10' and apurado_ate = '2026-09-01' from app.v_concorrencia where id = :'ce'), 'o resumo mostra o período dos preços usados');
select pg_temp.ok((select preco_m2 from app.concorrencia_resumo('2026-04-01') where empreendimento_id = :'ce') = 6294.12, 'o preço por m² de uma data passada usa os preços daquela data');
select pg_temp.falha(format($$insert into app.concorrencia_precos (empresa_id, tipologia_id, apurado_em, preco_medio) values (%L, %L, '2026-09-01', 1)$$, :'emp', :'tp1'), 'um preço por tipologia e data');
select pg_temp.falha(format($$insert into app.concorrencia_precos (empresa_id, tipologia_id, apurado_em, preco_medio) values (%L, %L, current_date + 1, 1)$$, :'emp', :'tp1'), 'apuração no futuro');
update app.concorrencia_tipologias set unidades = null where id = :'tp2';
-- média simples: (260000/40 + 350000/50) ÷ 2 = (6500 + 7000) ÷ 2
select pg_temp.ok((select preco_m2 = 6750 and not mix_completo from app.v_concorrencia where id = :'ce'), 'sem o mix, média simples do preço por m² das tipologias');
select pg_temp.ok((select faixas = '{his2,hmp}' from app.v_concorrencia where id = :'ce'), 'faixas sociais das tipologias');
update app.concorrencia_tipologias set ativo = false where id = :'tp2';
select pg_temp.ok((select preco_m2 = 6500 and tipologias = 1 from app.v_concorrencia where id = :'ce'), 'tipologia desativada sai do cálculo');
select pg_temp.falha(format($$update app.concorrencia_precos set tipologia_id = %L where tipologia_id = %L$$, :'tp2', :'tp1'), 'preço não muda de tipologia');
select pg_temp.como(:'leitor');
select pg_temp.ok((select count(*) from app.v_concorrencia) = 1, 'Leitura vê a concorrência');
select pg_temp.falha(format($$insert into app.concorrencia_precos (empresa_id, tipologia_id, apurado_em, preco_medio) values (%L, %L, '2026-08-01', 1)$$, :'emp', :'tp1'), 'Leitura não lança preço');
select pg_temp.como(:'intruso');
select pg_temp.ok((select count(*) from app.v_concorrencia) = 0 and (select count(*) from app.concorrentes) = 0, 'outra empresa não vê a concorrência');
select pg_temp.falha(format($$insert into app.concorrencia_empreendimentos (empresa_id, concorrente_id, nome, latitude, longitude) values (%L, %L, 'X', 0, 0)$$, :'emp2', :'cc'), 'empreendimento não aponta empresa concorrente de outra empresa');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'concorrencia_precos') >= 3, 'preços entram na auditoria');

-- ---------------------------------------------------------------------
\echo '# setores censitários e renda familiar estimada'
reset role;
-- dois setores vizinhos de 100 m (códigos fictícios); B tem a renda em sigilo
insert into app.setores_censitarios (cd_setor, area_ponderacao, distrito, area_km2, geom, fonte_geometria) values
  ('355030899999991', '3550308999', 'Teste', 0.01, extensions.st_multi(extensions.st_geomfromgeojson(pg_temp.quadra(-46.60000, -23.55, 100)::text)), 'teste'),
  ('355030899999992', '3550308999', 'Teste', 0.01, extensions.st_multi(extensions.st_geomfromgeojson(pg_temp.quadra(-46.60000 + 100 / (111320 * cos(radians(-23.55))), -23.55, 100)::text)), 'teste');
insert into app.setor_valores (cd_setor, variavel, valor, situacao) values
  ('355030899999991', 'V0001', 300, 'divulgado'), ('355030899999991', 'V0007', 100, 'divulgado'), ('355030899999991', 'V06001', 100, 'divulgado'),
  ('355030899999991', 'V06004', 4000, 'divulgado'), ('355030899999991', 'V06006', 3000, 'divulgado'),
  ('355030899999992', 'V0001', 200, 'divulgado'), ('355030899999992', 'V0007', 80, 'divulgado'), ('355030899999992', 'V06001', 80, 'divulgado'),
  ('355030899999992', 'V06004', null, 'sigilo'), ('355030899999992', 'V06006', null, 'sigilo');
select pg_temp.falha($$insert into app.setor_valores values ('355030899999992', 'V06002', 0, 'sigilo')$$, 'valor em sigilo fica nulo, nunca zero');
select pg_temp.falha($$insert into app.setores_censitarios (cd_setor, geom, fonte_geometria) values ('999999999999999', extensions.st_multi(extensions.st_geomfromtext('POLYGON((0 0,1 0,1 1,0 0))', 4326)), 'x')$$, 'setor de município que não existe');
select pg_temp.como(:'leitor');
select pg_temp.ok((select v06004_original = 4000 and renda_responsavel_censo_2022 = 4000 and fator_familiar = 1.6
  and renda_familiar_estimada_2022 = 6400.00 and round(fator_atualizacao_pnad, 6) = 1.376164 and renda_familiar_estimada_atual = 8807.45 and faixa = 8
  from app.setores_renda where cd_setor = '355030899999991'), 'V06004 R$ 4.000 → R$ 6.400,00 em 2022 → R$ 8.807,45 em valores de 2025 (R$ 8.000 a 9.000); o original fica');
select pg_temp.ok((select v06004_original is null and renda_familiar_estimada_atual is null and faixa is null and situacao_renda = 'sigilo'
  from app.setores_renda where cd_setor = '355030899999992'), 'setor em sigilo: sem renda e sem faixa');
select pg_temp.ok((select string_agg(app.renda_faixa(v)::text, ',' order by v) from unnest(array[1999, 2500, 3500, 4500, 6500, 9500, 13000, 20000, 27000, 31000]::numeric[]) v)
  = '1,2,3,4,6,9,10,13,15,16', 'exemplos da especificação caem nas faixas certas');
select pg_temp.ok(app.renda_faixa(2000) = 1 and app.renda_faixa(2000.4) = 1 and app.renda_faixa(2000.5) = 2 and app.renda_faixa(2001) = 2
  and app.renda_faixa(30000) = 15 and app.renda_faixa(30001) = 16 and app.renda_faixa(null) is null,
  'fronteira: o limite de cima entra na faixa, depois de arredondar para reais');
select pg_temp.ok((select count(distinct cor) = 16 and bool_and(app.renda_faixa(ate) = ordem) from app.renda_faixas), '16 faixas, 16 cores diferentes, cada limite na própria faixa');
\set cfg `cat tools/setores/metodologia_renda.json`
select pg_temp.ok((select m.fator_familiar = (c->>'fatorFamiliar')::numeric and m.pnad_valor_base = (c->>'pnadValorBase')::numeric
  and m.pnad_valor_atual = (c->>'pnadValorAtual')::numeric and m.pnad_ano_atual = (c->>'pnadAnoAtual')::int and m.distorcida_razao = (c->>'distorcidaRazao')::numeric
  from app.metodologias_renda m, (select :'cfg'::jsonb as c) x where m.vigente), 'metodologia do banco igual à do protótipo (metodologia_renda.json)');
select pg_temp.ok((select bool_and(f.ate is not distinct from (j->>'ate')::numeric and f.cor = j->>'cor' and f.rotulo = j->>'rotulo') and count(*) = 16
  from app.renda_faixas f join jsonb_array_elements((:'cfg'::jsonb)->'faixas') with ordinality e(j, n) on n = f.ordem), 'faixas e cores do banco iguais às do protótipo');
-- densidade bruta: pessoas ÷ área do setor; 0 é "sem moradores", separado da primeira faixa
select pg_temp.ok((select densidade_hab_km2 = 30000 and faixa_densidade = 6 from app.setores_renda where cd_setor = '355030899999991')
  and (select densidade_hab_km2 = 20000 and faixa_densidade = 5 from app.setores_renda where cd_setor = '355030899999992'),
  'densidade: 300 pessoas em 0,01 km² = 30.000 hab/km² (20 a 30 mil, o limite entra); 200 = 20.000 (15 a 20 mil)');
select pg_temp.ok(app.densidade_faixa(0) = 0 and app.densidade_faixa(0.4) = 1 and app.densidade_faixa(2500) = 1 and app.densidade_faixa(2500.1) = 2
  and app.densidade_faixa(100000) = 8 and app.densidade_faixa(100000.1) = 9 and app.densidade_faixa(null) is null,
  'densidade: zero é sem moradores, nada se arredonda, o limite de cima entra na faixa');
\set cfgd `cat tools/setores/metodologia_densidade.json`
select pg_temp.ok((select bool_and(f.ate is not distinct from (j->>'ate')::numeric and f.cor = j->>'cor' and f.rotulo = j->>'rotulo') and count(*) = 10 and count(distinct f.cor) = 10
  from app.densidade_faixas f join jsonb_array_elements((:'cfgd'::jsonb)->'faixas') with ordinality e(j, n) on n - 1 = f.ordem), 'faixas e cores da densidade iguais às do protótipo');
-- perfil da população (idade, sexo, domicílios): só somas exatas; sigilo e ausência viram "não divulgado"
reset role;
insert into app.setor_valores (cd_setor, variavel, valor, situacao) values
  ('355030899999991', 'V01007', 140, 'divulgado'), ('355030899999991', 'V01008', 160, 'divulgado'),
  ('355030899999991', 'V01031', 20, 'divulgado'), ('355030899999991', 'V01009', 10, 'divulgado'), ('355030899999991', 'V01020', 10, 'divulgado'),
  ('355030899999991', 'V01035', 30, 'divulgado'), ('355030899999991', 'V01036', 30, 'divulgado'),
  ('355030899999991', 'V01013', 15, 'divulgado'), ('355030899999991', 'V01014', 15, 'divulgado'), ('355030899999991', 'V01024', 15, 'divulgado'), ('355030899999991', 'V01025', 15, 'divulgado'),
  ('355030899999991', 'V00001', 98, 'divulgado'), ('355030899999991', 'V00002', 2, 'divulgado'), ('355030899999991', 'V00005', 290, 'divulgado'), ('355030899999991', 'V00006', 4, 'divulgado'),
  ('355030899999991', 'V00017', 20, 'divulgado'), ('355030899999991', 'V00018', 30, 'divulgado'), ('355030899999991', 'V00019', 25, 'divulgado'), ('355030899999991', 'V00020', 15, 'divulgado'),
  ('355030899999991', 'V00049', 60, 'divulgado'), ('355030899999991', 'V0009', 10, 'divulgado'), ('355030899999991', 'V0008', 3, 'divulgado'),
  ('355030899999992', 'V01007', 100, 'divulgado'), ('355030899999992', 'V01008', 100, 'divulgado'), ('355030899999992', 'V01031', null, 'sigilo');
select pg_temp.como(:'leitor');
select app.perfil_area(extensions.st_geomfromgeojson(pg_temp.quadra(-46.60000 + 25 / (111320 * cos(radians(-23.55))), -23.55, 150)::text)) as pf \gset
select pg_temp.ok((select (e->>'pessoas')::numeric between 399 and 401 and (e->>'homens')::numeric between 189 and 191 and (e->>'mulheres')::numeric between 209 and 211
  and (e->>'moradores_por_domicilio')::numeric = 2.94 from (select :'pf'::jsonb e) x),
  'perfil: pessoas e sexo pela fração da área; moradores por domicílio só dos setores com os dois números (294 ÷ 100)');
select pg_temp.ok((select (e->'idade'->0->>'pessoas')::numeric = 20 and (e->'idade'->3->>'pessoas')::numeric = 60 and (e->'idade'->3->>'homens')::numeric = 30
  and (e->>'idade_nao_divulgada')::numeric between 319 and 321 and jsonb_array_length(e->'idade') = 8 from (select :'pf'::jsonb e) x),
  'perfil: 8 grupos de idade por soma exata (20 a 29 = 20–24 + 25–29); setor em sigilo fica fora e o resto é "não divulgado", nunca zero');
select pg_temp.ok((select (e->'tamanho'->4->>'rotulo') = '5 ou mais moradores' and (e->'tamanho'->4->>'domicilios')::numeric = 8
  and (e->'especie'->2->>'domicilios')::numeric = 60 and (e->>'vagos')::numeric = 10 and (e->>'uso_ocasional')::numeric = 3 from (select :'pf'::jsonb e) x),
  'perfil: 5 ou mais moradores = domicílios − os de 1 a 4 (98 − 90); espécie, vagos e uso ocasional');
\set cfgdemo `cat tools/setores/demografia.json`
select pg_temp.ok((select count(*) = 8 and bool_and(g.rotulo = j->>'rotulo' and to_jsonb(g.total) = j->'total' and to_jsonb(g.homens) = j->'homens' and to_jsonb(g.mulheres) = j->'mulheres')
  from app.demografia_grupos g, (select :'cfgdemo'::jsonb c) x, jsonb_array_elements(c->'idade') with ordinality e(j, n) where g.tipo = 'idade' and n = g.ordem)
  and (select count(*) = 4 from app.demografia_grupos g, (select :'cfgdemo'::jsonb c) x, jsonb_array_elements(c->'tamanho') with ordinality e(j, n) where g.tipo = 'tamanho' and n = g.ordem and g.total = array[j->>'var'] and g.rotulo = j->>'rotulo')
  and (select count(*) = 5 from app.demografia_grupos g, (select :'cfgdemo'::jsonb c) x, jsonb_array_elements(c->'especie') with ordinality e(j, n) where g.tipo = 'especie' and n = g.ordem and g.total = array[j->>'var'] and g.rotulo = j->>'rotulo'),
  'grupos do perfil iguais aos do protótipo (demografia.json)');
-- área: todo o setor A e metade do B
select app.estatisticas_area(extensions.st_geomfromgeojson(pg_temp.quadra(-46.60000 + 25 / (111320 * cos(radians(-23.55))), -23.55, 150)::text)
  ) as est \gset
select pg_temp.ok((select (e->>'setores')::int = 2 and (e->>'pessoas')::numeric between 399 and 401 and (e->>'domicilios')::numeric between 139 and 141 from (select :'est'::jsonb e) x),
  'raio/poligonal: cada setor entra pela fração da área (300 + metade de 200 pessoas)');
select pg_temp.ok((select (e->>'renda_familiar_media_estimada')::numeric = 8807.45 and (e->>'cobertura_renda_pct')::numeric between 71.3 and 71.5
  and (select (d->>'pct')::numeric from jsonb_array_elements(e->'distribuicao') d where (d->>'faixa')::int = 8) = 100 from (select :'est'::jsonb e) x),
  'renda média só com os setores que têm renda, e a cobertura diz quanto ficou de fora');
select pg_temp.ok((select (e->>'pessoas')::numeric between 145 and 152 from (select app.estatisticas_raio(-23.55, -46.60, 40) e) x), 'raio de 40 m no meio do setor A: π × 40² de 100 × 100 m, cerca de 150 das 300 pessoas');
select pg_temp.ok((select count(*) = 2 and bool_and(geojson ? 'coordinates') and bool_and(faixa_densidade is not null) from app.setores_no_retangulo(-46.61, -23.56, -46.59, -23.54, 15)), 'setores da tela para o mapa, com a faixa de renda e a de densidade');
select pg_temp.falha($$insert into app.metodologias_renda (versao, censo_ano, variavel_base, fator_familiar, fator_familiar_origem, pnad_ano_base, pnad_valor_base, pnad_ano_atual, pnad_valor_atual, pnad_fonte) values (2, 2022, 'V06004', 1.5, 'x', 2022, 1, 2025, 1, 'x')$$, 'só o carregamento escreve metodologia e setores');
select pg_temp.como(:'diretor');

-- ---------------------------------------------------------------------
\echo '# estudo de viabilidade estática'
\set cfgviab `cat tools/viabilidade/despesas.json`
select pg_temp.ok((select count(*) from app.viabilidade_despesas where empresa_id = :'emp') = jsonb_array_length((:'cfgviab'::jsonb)->'despesas')
  and (select bool_and(d.nome = j->>'nome' and d.grupo = j->>'grupo' and d.tipo_padrao = j->>'tipo' and d.valor_padrao is not distinct from (j->>'valor')::numeric
                       and d.deduz_vgv = (j->>'deduz')::boolean and d.ordem = n)
       from jsonb_array_elements((:'cfgviab'::jsonb)->'despesas') with ordinality e(j, n) join app.viabilidade_despesas d on d.empresa_id = :'emp' and d.codigo = j->>'codigo'),
  'empresa recebe a lista padrão de itens, igual à do protótipo (despesas.json)');
select pg_temp.ok((select bool_and(app.viab_tipos(g.key) = array(select jsonb_array_elements_text(g.value->'tipos'))
                                   and app.viab_secao(g.key) = g.value->>'secao' and app.viab_fixo(g.key) = (g.value->>'fixo')::boolean)
                     from jsonb_each((:'cfgviab'::jsonb)->'grupos') g),
  'grupos com as mesmas bases de cálculo, seção e itens fixos do protótipo');
select pg_temp.como(:'analista');
select app.criar_viabilidade(:'t1', 'Estudo estático') as vb1 \gset
select pg_temp.ok((select count(*) from app.viabilidade_linhas where viabilidade_id = :'vb1')
                  = (select count(*) from app.viabilidade_despesas where empresa_id = :'emp' and app.viab_fixo(grupo) and not app.viab_restrito(grupo)),
  'fora da diretoria, as linhas de Taxas e Despesas financeiras não aparecem (só o total do estudo)');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.viabilidade_linhas where viabilidade_id = :'vb1')
                  = (select count(*) from app.viabilidade_despesas where empresa_id = :'emp' and app.viab_fixo(grupo)),
  'estudo novo já vem com os itens fixos de Taxas, Despesas financeiras (com os dois custos de capital) e Despesas comerciais');
select pg_temp.como(:'analista');
insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, area_privativa, quantidade, quantidade_permuta, quantidade_comissao, preco_unitario)
values (:'emp', :'vb1', 1, '2 dormitórios', 40, 100, 10, 2, 280000) returning id as tp1 \gset
insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, area_privativa, quantidade, preco_m2)
values (:'emp', :'vb1', 2, '2 dormitórios com suíte', 50, 50, 7200) returning id as tp2 \gset
select pg_temp.ok((select preco_m2 from app.viabilidade_tipologias where id = :'tp1') = 7000 and (select preco_unitario from app.viabilidade_tipologias where id = :'tp2') = 360000,
  'com a área, o preço unitário dá o preço por m² e o preço por m² dá o unitário');
insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, quantidade, preco_unitario) values (:'emp', :'vb1', 3, 'Teste', 1, 300000) returning id as tp3 \gset
update app.viabilidade_tipologias set preco_m2 = 6000 where id = :'tp3';
select pg_temp.ok((select preco_unitario = 300000 and preco_m2 = 6000 from app.viabilidade_tipologias where id = :'tp3'), 'sem área, os dois preços ficam como digitados');
update app.viabilidade_tipologias set area_privativa = 60 where id = :'tp3';
select pg_temp.ok((select preco_unitario = 300000 and preco_m2 = 5000 from app.viabilidade_tipologias where id = :'tp3'), 'área nova com os dois preços: mantém o unitário e refaz o m²');
update app.viabilidade_tipologias set preco_m2 = 5500 where id = :'tp3';
select pg_temp.ok((select preco_unitario from app.viabilidade_tipologias where id = :'tp3') = 330000, 'mudar o m² com a área refaz o unitário');
update app.viabilidade_tipologias set preco_unitario = null, area_privativa = null where id = :'tp3';
update app.viabilidade_tipologias set area_privativa = 50 where id = :'tp3';
select pg_temp.ok((select preco_unitario from app.viabilidade_tipologias where id = :'tp3') = 275000, 'área nova com só o m²: completa o unitário');
delete from app.viabilidade_tipologias where id = :'tp3';
select pg_temp.falha(format($$update app.viabilidade_tipologias set quantidade_comissao = 91 where id = %L$$, :'tp1'), 'permuta mais comissão não passa da quantidade');
-- despesas comerciais (fixas): % do VGV, verba e verba mensal
update app.viabilidade_linhas set valor = 4 where viabilidade_id = :'vb1' and despesa = 'comissao';
update app.viabilidade_linhas set valor = 1.5 where viabilidade_id = :'vb1' and despesa = 'marketing';
update app.viabilidade_linhas set valor = 2 where viabilidade_id = :'vb1' and despesa = 'itbi_vendas';
update app.viabilidade_linhas set tipo = 'verba', valor = 300000 where viabilidade_id = :'vb1' and despesa = 'registro_vendas';
update app.viabilidade_linhas set valor = 50000, quantidade = 24 where viabilidade_id = :'vb1' and despesa = 'custo_fixo_comercial';
-- taxas e despesas financeiras (fixas): só a diretoria ou o administrador mexe
-- (fora da diretoria a linha nem aparece; o gatilho barra quem chegasse a ela)
update app.viabilidade_linhas set valor = 4 where viabilidade_id = :'vb1' and despesa = 'impostos';
update app.viabilidade_linhas set tipo = 'verba' where viabilidade_id = :'vb1' and despesa = 'taxa_gestao_obra';
update app.viabilidade_linhas set despesa = 'marketing', valor = 0 where viabilidade_id = :'vb1' and despesa = 'taxa_gestao_obra';
delete from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'taxa_desenvolvimento';
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) = 1 from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'taxa_desenvolvimento')
  and (select tipo <> 'verba' from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'taxa_gestao_obra')
  and (select valor is distinct from 4 from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'impostos'),
  'analista não muda, não troca de item nem tira taxa ou despesa financeira do estudo');
select id as vb1_taxa from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'taxa_gestao_obra' \gset
reset role;
select set_config('request.jwt.claim.sub', :'analista', false);
select pg_temp.falha(format($$update app.viabilidade_linhas set despesa = 'marketing', valor = 0 where id = %L$$, :'vb1_taxa'),
  'trocar uma taxa por outra despesa (e zerar) também é mudar a taxa');
select pg_temp.como(:'diretor');
update app.viabilidade_linhas set valor = 4 where viabilidade_id = :'vb1' and despesa = 'impostos';
update app.viabilidade_linhas set valor = 2 where viabilidade_id = :'vb1' and despesa = 'taxa_gestao_obra';
update app.viabilidade_linhas set valor = 10 where viabilidade_id = :'vb1' and despesa = 'taxa_desenvolvimento';
select pg_temp.como(:'analista');
-- obra em camadas e despesas gerais
insert into app.viabilidade_linhas (empresa_id, viabilidade_id, ordem, despesa, tipo, valor) values
  (:'emp', :'vb1', 1, 'fundacoes_especiais', 'area', 100),
  (:'emp', :'vb1', 2, 'contencoes', 'pct_obra_tipica', 2),
  (:'emp', :'vb1', 3, 'infra_externa', 'verba', 1000000),
  (:'emp', :'vb1', 4, 'ligacoes', 'pct_obra_raso', 1),
  (:'emp', :'vb1', 5, 'projetos', 'pct_obra_total', 3),
  (:'emp', :'vb1', 6, 'aprovacoes', 'verba', 200000),
  (:'emp', :'vb1', 7, 'assistencia_tecnica', 'pct_obra_total', 1),
  (:'emp', :'vb1', 8, 'itbi_terreno', 'verba', 150000),
  (:'emp', :'vb1', 9, 'registro_incorporacao', 'verba', 100000),
  (:'emp', :'vb1', 10, 'adm_central', 'pct_vgv', 1);
select app.salvar_viabilidade(:'vb1', '{"custo_m2":3000,"deducao_vgv_pct":5,"permuta_fin_pct":8,"minimo_garantido":3000000,"pagamento_dinheiro":1000000,"comissao_dinheiro":200000,"deduz_vgv":["itbi_vendas","registro_vendas"]}');
select pg_temp.ok((select vgv = 46000000 and permuta_valor = 2800000 and comissao_valor = 560000 and vgv_vendido = 42640000 and unidades = 150 and unidades_permuta = 10 and unidades_comissao = 2
  and area_privativa = 6500 and deducoes = 3284800 and vgv_liquido = 39355200 from app.viabilidades where id = :'vb1'),
  'VGV 46 mi − permuta 2,8 mi − comissão 0,56 mi = vendido 42,64 mi; − 5% e ITBI e registro das vendas (3,2848 mi) = VGV líquido 39,3552 mi');
select pg_temp.ok((select obra_incidente = 19500000 and obra_raso = 20540000 and obra_total = 21745400 and custo_obras = 22815216 from app.viabilidades where id = :'vb1'),
  'obra: incidente 3.000/m² × 6.500 m² = 19,5 mi; raso + atípicos (100/m² e 2% do típico) = 20,54 mi; total + não incidente (verba e 1% do raso) = 21,7454 mi; + projetos e pós-obra (% da total) = 22,815216 mi');
select pg_temp.ok((select permuta_financeira = 3148416 and custo_terreno = 4348416 from app.viabilidades where id = :'vb1'),
  'terreno: permuta financeira 8% do VGV líquido (3,148416 mi, acima do mínimo) + 1 mi em dinheiro + 0,2 mi de comissão');
select pg_temp.ok((select despesas_gerais = 676400 and taxas = 964858.91 and custos_comerciais = 4698000 and despesas_total = 35208490.91
  and ebitda = 7969968 and despesas_financeiras = 1705600 and lucro_sem_taxas = 6264368
  and lucro_liquido = 5299509.09 and margem_pct = 13.47 from app.viabilidades where id = :'vb1'),
  'gerais 676,4 mil, comerciais 4,698 mi: EBITDA 7,97 mi − financeiras (impostos 4%: 1,7056 mi) = sem taxas 6,264 mi − taxas 964,9 mil (com 10% do lucro) = lucro 5,299 mi, margem 13,47%');
select pg_temp.ok((app.calcular_viabilidade(:'vb1')->>'lucro_liquido')::numeric = 5299509.09
  and not exists (select 1 from jsonb_array_elements(app.calcular_viabilidade(:'vb1')->'linhas') x where app.viab_restrito(x->>'grupo')),
  'fora da diretoria, o cálculo conta Taxas e Financeiras no lucro, mas não devolve o detalhe dessas linhas');
select pg_temp.como(:'diretor');
select pg_temp.ok((select (x->>'base')::numeric = 5299509.09 and (x->>'valor')::numeric = 529950.91 from jsonb_array_elements(app.calcular_viabilidade(:'vb1')->'linhas') x
                    where x->>'id' = (select id::text from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'taxa_desenvolvimento')),
  'taxa de desenvolvimento: 10% do lucro líquido, já descontada ela mesma');
select pg_temp.como(:'analista');
update app.viabilidade_linhas set tipo = 'verba_unidade', valor = 500 where viabilidade_id = :'vb1' and despesa = 'contratos_cef';
select pg_temp.ok((select custos_comerciais from app.viabilidades where id = :'vb1') = 4767000, 'verba por unidade: 500 × 138 unidades líquidas (150 − 10 em permuta − 2 da comissão)');
update app.viabilidade_linhas set tipo = 'verba', valor = null where viabilidade_id = :'vb1' and despesa = 'contratos_cef';
select app.salvar_viabilidade(:'vb1', '{"minimo_garantido":3500000}');
select pg_temp.ok((select permuta_financeira = 3500000 and custo_terreno = 4700000 and lucro_liquido = 4979887.27 from app.viabilidades where id = :'vb1')
  and (app.calcular_viabilidade(:'vb1')->>'minimo_aplicado')::boolean, 'permuta financeira abaixo do mínimo garantido usa o mínimo');
select app.salvar_viabilidade(:'vb1', '{"minimo_garantido":3000000}');
select app.salvar_viabilidade(:'vb1', '{"custo_m2":10000}');
select pg_temp.ok((select lucro_liquido = -43857086 and taxas + despesas_financeiras = 3077990 from app.viabilidades where id = :'vb1'), 'sem lucro, os itens em % do lucro valem zero');
select app.salvar_viabilidade(:'vb1', '{"custo_m2":3000}');
-- juros PJ: item de Despesas financeiras em % da obra total, com o padrão da empresa
select pg_temp.como(:'diretor');
update app.viabilidade_linhas set valor = 2 where viabilidade_id = :'vb1' and despesa = 'juros_pj';
select pg_temp.ok((select despesas_financeiras = 2140508 and lucro_liquido = 4904138.18 from app.viabilidades where id = :'vb1'),
  'juros PJ de 2% da obra total (21,7454 mi) = 434.908 nas despesas financeiras; lucro 4,904 mi (a taxa de 10% do lucro cai junto)');
update app.viabilidade_linhas set valor = null where viabilidade_id = :'vb1' and despesa = 'juros_pj';
-- custo de capital (28/out/2026): % sobre o Aporte, que é a permuta financeira em dinheiro ou o pagamento em dinheiro do terreno
update app.viabilidade_linhas set valor = 2 where viabilidade_id = :'vb1' and despesa = 'capital_permuta';
update app.viabilidade_linhas set valor = 1 where viabilidade_id = :'vb1' and despesa = 'capital_pagamento';
select pg_temp.ok((select despesas_financeiras = 1778568.32 and lucro_sem_taxas = 6191399.68 from app.viabilidades where id = :'vb1')
  and (select bool_and((x->>'base')::numeric = case l.despesa when 'capital_permuta' then 3148416 else 1000000 end and x->>'secao' = 'financeiro')
         from jsonb_array_elements(app.calcular_viabilidade(:'vb1')->'linhas') x join app.viabilidade_linhas l on l.id::text = x->>'id'
        where l.despesa in ('capital_permuta','capital_pagamento')),
  'custo de capital: 2% da permuta financeira em dinheiro (3.148.416) + 1% do pagamento em dinheiro (1 mi) = 72.968,32 nas despesas financeiras');
select pg_temp.falha(format($$update app.viabilidade_linhas set tipo = 'pct_vgv' where viabilidade_id = %L and despesa = 'capital_permuta'$$, :'vb1'), 'custo de capital só aceita a base Aporte');
select pg_temp.falha(format($$update app.viabilidade_linhas set tipo = 'pct_aporte_permuta' where viabilidade_id = %L and despesa = 'impostos'$$, :'vb1'), 'Aporte só vale no custo de capital');
select app.salvar_viabilidade(:'vb1', '{"minimo_garantido":3500000}');
select pg_temp.ok((select (x->>'valor')::numeric = 70000 from jsonb_array_elements(app.calcular_viabilidade(:'vb1')->'linhas') x
                    where x->>'id' = (select id::text from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'capital_permuta')),
  'com o mínimo garantido, o aporte da permuta é o mínimo (2% de 3,5 mi)');
select app.salvar_viabilidade(:'vb1', '{"minimo_garantido":3000000}');
select pg_temp.como(:'analista');
update app.viabilidade_linhas set valor = 5 where viabilidade_id = :'vb1' and despesa = 'capital_pagamento';
select pg_temp.como(:'diretor');
select pg_temp.ok((select valor is distinct from 5 from app.viabilidade_linhas where viabilidade_id = :'vb1' and despesa = 'capital_pagamento'),
  'analista não muda o custo de capital');
update app.viabilidade_linhas set valor = null where viabilidade_id = :'vb1' and despesa in ('capital_permuta','capital_pagamento');
select app.salvar_despesa_viabilidade(:'emp', 'juros_pj', '{"valor_padrao":1.5}');
select pg_temp.como(:'analista');
select app.criar_viabilidade(:'t1', 'Com juros padrão') as vbj \gset
select app.criar_viabilidade(:'t1', 'Cópia', :'vb1') as vbc \gset
select pg_temp.como(:'diretor');
select pg_temp.ok((select valor = 1.5 and tipo = 'pct_obra_total' from app.viabilidade_linhas where viabilidade_id = :'vbj' and despesa = 'juros_pj'),
  'estudo novo (criado pelo analista) vem com o juros PJ padrão da empresa');
select pg_temp.ok((select valor = 4 from app.viabilidade_linhas where viabilidade_id = :'vbc' and despesa = 'impostos'), 'duplicar copia as taxas e despesas financeiras do estudo');
select pg_temp.como(:'analista');
select app.apagar_viabilidade(:'vbj');
select app.apagar_viabilidade(:'vbc');
select pg_temp.falha(format($$update app.viabilidade_linhas set tipo = 'pct_lucro' where viabilidade_id = %L and despesa = 'comissao'$$, :'vb1'), 'base que o grupo não aceita é recusada (comercial em % do lucro)');
select pg_temp.falha(format($$insert into app.viabilidade_linhas (empresa_id, viabilidade_id, despesa, tipo, valor) values (%L, %L, 'comissao', 'pct_vgv', 1)$$, :'emp', :'vb1'), 'item fixo não entra duas vezes');
select pg_temp.falha(format($$select app.salvar_viabilidade(%L, '{"deduz_vgv":["comissao"]}')$$, :'vb1'), 'só despesa comercial dedutível sai do VGV líquido');
select pg_temp.falha(format($$insert into app.viabilidade_linhas (empresa_id, viabilidade_id, despesa, tipo, valor) values (%L, %L, 'inexistente', 'verba', 1)$$, :'emp', :'vb1'), 'item fora da lista da empresa é recusado');
select pg_temp.falha(format($$select app.salvar_despesa_viabilidade(%L, 'outros_comercial', '{"ativo":false}')$$, :'emp'), 'analista não mexe na lista de itens');
select pg_temp.falha(format('select app.salvar_margem_minima(%L, 10)', :'emp'), 'analista não muda a rentabilidade mínima');
select app.vincular_viabilidade(:'neg', 'Estudo do BKM', 1, 1) as vbx \gset
select pg_temp.falha(format($$insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, nome, quantidade) values (%L, %L, 'X', 1)$$, :'emp', :'vbx'), 'estudo externo (BKM) não recebe tipologias');
select app.vincular_estudo(:'neg', :'vb1');
select pg_temp.ok((select vgv = 46000000 and margem_pct = 13.47 from app.v_terrenos where id = :'t1'), 'a negociação vincula o estudo: VGV e margem aparecem no terreno');
select pg_temp.falha(format('select app.apagar_viabilidade(%L)', :'vb1'), 'estudo vinculado à negociação não se apaga');
select app.criar_viabilidade(:'t1', 'Cópia', :'vb1') as vb2 \gset
select pg_temp.ok((select count(*) from app.viabilidade_tipologias where viabilidade_id = :'vb2') = 2 and (select lucro_liquido from app.viabilidades where id = :'vb2') = 5299509.09
  and (select count(*) from app.viabilidade_linhas where viabilidade_id = :'vb2') = (select count(*) from app.viabilidade_linhas where viabilidade_id = :'vb1'),
  'duplicar copia dados, tipologias e linhas, com o mesmo resultado');
select app.apagar_viabilidade(:'vb2');
select pg_temp.ok(not exists (select 1 from app.viabilidade_linhas where viabilidade_id = :'vb2'), 'estudo solto se apaga, com as linhas');
select pg_temp.como(:'leitor');
update app.viabilidade_linhas set valor = 1 where viabilidade_id = :'vb1';
select pg_temp.ok((select lucro_liquido from app.viabilidades where id = :'vb1') = 5299509.09, 'leitura vê o estudo mas não altera as linhas');
select pg_temp.falha(format($$select app.criar_viabilidade(%L, 'X')$$, :'t1'), 'leitura não cria estudo');
select pg_temp.falha(format($$select app.salvar_viabilidade(%L, '{"custo_m2":1}')$$, :'vb1'), 'leitura não muda os dados do estudo');
select pg_temp.como(:'intruso');
select pg_temp.ok(not exists (select 1 from app.viabilidade_tipologias where viabilidade_id = :'vb1') and not exists (select 1 from app.viabilidade_despesas where empresa_id = :'emp'), 'outra empresa não vê estudo nem lista');
select pg_temp.como(:'diretor');
select app.salvar_despesa_viabilidade(:'emp', 'registro_vendas', '{"deduz_vgv":false}');
select pg_temp.ok((select vgv_liquido = 39655200 and permuta_financeira = 3172416 and lucro_liquido = 5277690.91 and margem_pct = 13.31 from app.viabilidades where id = :'vb1'),
  'registro das vendas deixa de ser dedutível: VGV líquido sobe 0,3 mi, a permuta financeira acompanha e o estudo se refaz');
select pg_temp.falha(format($$select app.salvar_despesa_viabilidade(%L, 'infra_externa', '{"grupo":"projetos"}')$$, :'emp'), 'item usado em estudo não muda de grupo');
select pg_temp.falha(format($$select app.apagar_despesa_viabilidade(%L, 'comissao')$$, :'emp'), 'item usado não se apaga (desativa)');
select app.salvar_despesa_viabilidade(:'emp', 'premio_vendas', '{"nome":"Prêmio de vendas","grupo":"comercial","tipo_padrao":"pct_vgv","valor_padrao":0.5}');
select pg_temp.falha(format($$select app.salvar_despesa_viabilidade(%L, 'x_lucro', '{"nome":"X","grupo":"comercial","tipo_padrao":"pct_lucro"}')$$, :'emp'), 'item novo só com base aceita pelo grupo');
select app.apagar_despesa_viabilidade(:'emp', 'premio_vendas');
select pg_temp.ok(not exists (select 1 from app.viabilidade_despesas where codigo = 'premio_vendas'), 'item novo entra na lista e, sem uso, se apaga');


-- modelos de estudo: do usuário e da empresa, com o padrão da empresa
select pg_temp.como(:'analista');
select app.salvar_modelo_viabilidade(:'vb1', 'Meu modelo') as mdu \gset
select pg_temp.ok((select user_id = :'analista' and not padrao and (dados->>'custo_m2')::numeric = 3000
                     and not exists (select 1 from jsonb_array_elements(dados->'linhas') l where l->>'despesa' in ('impostos','taxa_desenvolvimento'))
                     and exists (select 1 from jsonb_array_elements(dados->'linhas') l where l->>'despesa' = 'comissao')
                   from app.modelos_viabilidade(:'emp') where id = :'mdu'),
  'modelo do analista guarda o valor da obra e as linhas, sem Taxas e Despesas financeiras');
select pg_temp.falha(format($$select app.salvar_modelo_viabilidade(%L, 'Meu modelo')$$, :'vb1'), 'nome de modelo repetido é recusado');
select pg_temp.falha(format($$select app.salvar_modelo_viabilidade(%L, 'Da empresa', true)$$, :'vb1'), 'analista não grava modelo da empresa');
select app.criar_viabilidade(:'t1', 'Pelo meu modelo', null, :'mdu') as vbm \gset
select pg_temp.como(:'diretor');
select pg_temp.ok((select custo_m2 = 3000 and deduz_vgv = '{itbi_vendas}'
                     and not exists (select 1 from app.viabilidade_tipologias where viabilidade_id = :'vbm') from app.viabilidades where id = :'vbm')
  and (select count(*) from app.viabilidade_linhas where viabilidade_id = :'vbm') = (select count(*) from app.viabilidade_linhas where viabilidade_id = :'vb1')
  and (select valor is null from app.viabilidade_linhas where viabilidade_id = :'vbm' and despesa = 'impostos')
  and exists (select 1 from app.viabilidade_linhas a join app.viabilidade_linhas b on b.despesa = a.despesa and b.viabilidade_id = :'vb1'
               where a.viabilidade_id = :'vbm' and a.despesa = 'comissao' and a.tipo = b.tipo and a.valor is not distinct from b.valor),
  'estudo pelo modelo do usuário: valores e bases do modelo (sem o que deixou de ser dedutível), sem tipologias; Taxas e Despesas financeiras com o padrão da lista');
select pg_temp.como(:'analista');
select app.apagar_viabilidade(:'vbm');
select pg_temp.como(:'gestor');
select pg_temp.ok(not exists (select 1 from app.modelos_viabilidade(:'emp') where id = :'mdu'), 'modelo do usuário só ele vê');
select pg_temp.falha(format($$select app.criar_viabilidade(%L, 'X', null, %L)$$, :'t1', :'mdu'), 'ninguém usa o modelo de outro usuário');
select pg_temp.falha(format($$select app.apagar_modelo_viabilidade(%L)$$, :'mdu'), 'ninguém apaga o modelo de outro usuário');
select pg_temp.como(:'diretor');
select app.salvar_modelo_viabilidade(:'vb1', 'Padrão BKM', true) as mde \gset
select app.marcar_modelo_padrao(:'emp', :'mde');
select pg_temp.ok(exists (select 1 from app.modelos_viabilidade(:'emp') m, jsonb_array_elements(m.dados->'linhas') l where m.id = :'mde' and l->>'despesa' = 'impostos'),
  'o modelo da empresa salvo pela diretoria guarda as taxas e despesas financeiras');
select pg_temp.como(:'gestor');
select pg_temp.ok(not exists (select 1 from app.modelos_viabilidade(:'emp') m, jsonb_array_elements(m.dados->'linhas') l where m.id = :'mde' and l->>'despesa' in ('impostos','taxa_desenvolvimento'))
  and exists (select 1 from app.modelos_viabilidade(:'emp') m, jsonb_array_elements(m.dados->'linhas') l where m.id = :'mde' and l->>'despesa' = 'comissao'),
  'fora da diretoria, o modelo aparece sem as linhas de taxas e despesas financeiras');
select pg_temp.ok(not exists (select 1 from app.auditoria where tabela = 'viabilidade_modelos'), 'nem o log do modelo, que leva os mesmos valores');
select pg_temp.falha('select dados from app.viabilidade_modelos', 'a tabela dos modelos não se lê direto');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select app.marcar_modelo_padrao(%L, null)$$, :'emp'), 'só o administrador escolhe o modelo padrão');
select pg_temp.falha(format($$select app.apagar_modelo_viabilidade(%L)$$, :'mde'), 'analista não apaga modelo da empresa');
select pg_temp.falha(format($$select app.marcar_modelo_padrao(%L, %L)$$, :'emp', :'mdu'), 'modelo do usuário não vira padrão');
select app.criar_viabilidade(:'t1', 'Novo') as vbp \gset
select pg_temp.como(:'diretor');
select pg_temp.ok((select custo_m2 = 3000 from app.viabilidades where id = :'vbp')
  and (select valor = 4 from app.viabilidade_linhas where viabilidade_id = :'vbp' and despesa = 'impostos'),
  'estudo novo nasce com o modelo padrão da empresa, com as Taxas e Despesas financeiras dele (gravado pela diretoria)');
select pg_temp.como(:'analista');
select app.criar_viabilidade(:'t1', 'Só a lista', null, null, true) as vbs \gset
select pg_temp.como(:'diretor');
select pg_temp.ok((select custo_m2 is null from app.viabilidades where id = :'vbs')
  and (select valor is null from app.viabilidade_linhas where viabilidade_id = :'vbs' and despesa = 'impostos'),
  'sem modelo, o estudo nasce só com a lista da empresa');
select pg_temp.como(:'analista');
select app.apagar_viabilidade(:'vbp');
select app.apagar_viabilidade(:'vbs');
select app.apagar_modelo_viabilidade(:'mdu');
select pg_temp.ok(not exists (select 1 from app.modelos_viabilidade(:'emp') where id = :'mdu'), 'o usuário apaga o próprio modelo');
select pg_temp.como(:'diretor');
select app.marcar_modelo_padrao(:'emp', null);
select pg_temp.ok(not exists (select 1 from app.modelos_viabilidade(:'emp') where padrao), 'o administrador tira o padrão');
select app.apagar_modelo_viabilidade(:'mde');

-- ---------------------------------------------------------------------
\echo '# login pelo Google: perfil, @ e perfil básico'
reset role;
select pg_temp.como(:'diretor');
insert into app.empresa_dominios (dominio, empresa_id) values ('bkm.test', :'emp');
reset role;
select pg_temp.ok((app.hook_antes_de_criar_usuario('{"user":{"email":"nova@bkm.test"}}') = '{}'::jsonb)
  and (app.hook_antes_de_criar_usuario('{"user":{"email":"x@gmail.com"}}') ? 'error')
  and (app.hook_antes_de_criar_usuario('{"user":{"email":"x@bkm.test.evil.com"}}') ? 'error'),
  'o gancho do Auth só deixa criar usuário de domínio cadastrado');
insert into auth.users values
  ('00000000-0000-0000-0000-0000000000f1', 'João.Silva@BKM.test', '{"full_name":"João Silva","avatar_url":"https://foto/1"}', now()),
  ('00000000-0000-0000-0000-0000000000f2', 'joao.silva@bkm.test', '{"full_name":"Outro João"}', now());
select pg_temp.ok((select arroba = 'joao.silva' and nome = 'João Silva' and foto_url = 'https://foto/1' and email = 'joão.silva@bkm.test'
  from app.usuarios where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'primeiro login cria o perfil com nome, foto e o @ do e-mail, em minúsculas e sem acento');
select pg_temp.ok((select arroba from app.usuarios where user_id = '00000000-0000-0000-0000-0000000000f2') = 'joao.silva2', '@ repetido ganha número no fim');
select pg_temp.ok((select papel = 'basico' and not administrador from app.membros where user_id = '00000000-0000-0000-0000-0000000000f1' and empresa_id = :'emp'),
  'quem entra pelo domínio vira membro básico da empresa');
update auth.users set raw_user_meta_data = '{"full_name":"João S. Silva","avatar_url":"https://foto/2"}' where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select nome = 'João S. Silva' and foto_url = 'https://foto/2' and arroba = 'joao.silva' from app.usuarios where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'novo login atualiza nome e foto e mantém o @');
select pg_temp.como('00000000-0000-0000-0000-0000000000f1');
select pg_temp.ok(exists (select 1 from app.terrenos), 'o básico consulta os dados da empresa, como leitura');
select pg_temp.falha(format($$update app.terrenos set nome = 'X' where id = %L$$, :'t1'), 'o básico não altera nada');
select pg_temp.falha(format($$select app.mudar_arroba(%L, 'jj')$$, '00000000-0000-0000-0000-0000000000f1'), 'o básico não muda o próprio @');
select app.salvar_minha_foto('https://lh3.googleusercontent.com/a/foto-da-api');
select pg_temp.ok((select foto_url = 'https://lh3.googleusercontent.com/a/foto-da-api' from app.usuarios where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'quem entrou grava a própria foto buscada no Google');
select pg_temp.falha($$select app.salvar_minha_foto('https://exemplo.com/foto.png')$$, 'foto que não é do Google é recusada');
reset role;
update auth.users set raw_user_meta_data = '{"full_name":"João S. Silva"}', last_sign_in_at = now() where id = '00000000-0000-0000-0000-0000000000f1';
select pg_temp.ok((select foto_url = 'https://lh3.googleusercontent.com/a/foto-da-api' from app.usuarios where user_id = '00000000-0000-0000-0000-0000000000f1'),
  'login sem foto não apaga a foto gravada');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.usuarios where arroba like 'joao.silva%') = 2, 'a equipe vê nome, foto e @ de quem está na empresa');
select pg_temp.falha(format($$select app.mudar_arroba(%L, 'joao.silva')$$, '00000000-0000-0000-0000-0000000000f2'), '@ já usado é recusado');
select pg_temp.ok(app.mudar_arroba('00000000-0000-0000-0000-0000000000f2', '@Joao.Outro') = 'joao.outro', 'o administrador muda o @');

\echo '# equipe prevista: papel combinado antes do primeiro login'
insert into app.equipe_prevista (empresa_id, email, papel, administrador, superior_email, nome) values
  (:'emp', 'ana.prevista@bkm.test', 'analista', false, 'gestora.prevista@bkm.test', 'Ana Prevista'),
  (:'emp', 'gestora.prevista@bkm.test', 'gestor', false, 'diretor@bkm.test', null),
  (:'emp', 'errado.prevista@bkm.test', 'analista', false, 'diretor@bkm.test', null),
  (:'emp', 'dir.prevista@bkm.test', 'diretor', true, null, null);
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into app.equipe_prevista (empresa_id, email, papel) values (%L, 'eu@bkm.test', 'diretor')$$, :'emp'),
  'só o administrador combina a equipe prevista');
select pg_temp.ok((select count(*) from app.equipe_prevista) = 0, 'e só ele a vê');
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000e1', 'Ana.Prevista@bkm.test', '{"full_name":"Ana P."}', now());
select pg_temp.ok((select papel = 'analista' and superior_id is null and nome = 'Ana Prevista' from app.membros where user_id = '00000000-0000-0000-0000-0000000000e1'),
  'no primeiro login entra com o papel combinado; o superior que ainda não entrou fica para depois');
insert into auth.users values ('00000000-0000-0000-0000-0000000000e2', 'gestora.prevista@bkm.test', '{"full_name":"Gestora"}', now());
select pg_temp.ok((select papel = 'gestor' and superior_id = :'diretor' from app.membros where user_id = '00000000-0000-0000-0000-0000000000e2'),
  'o superior que já está na empresa entra junto');
select pg_temp.ok((select superior_id from app.membros where user_id = '00000000-0000-0000-0000-0000000000e1') = '00000000-0000-0000-0000-0000000000e2',
  'quando o superior entra, quem responde a ele ganha o superior');
insert into auth.users values ('00000000-0000-0000-0000-0000000000e3', 'errado.prevista@bkm.test', '{}', now());
select pg_temp.ok((select papel from app.membros where user_id = '00000000-0000-0000-0000-0000000000e3') = 'basico',
  'equipe prevista errada (analista abaixo de diretor) não impede o login: entra como básico');
insert into auth.users values ('00000000-0000-0000-0000-0000000000e4', 'dir.prevista@bkm.test', '{}', now());
select pg_temp.ok((select papel = 'diretor' and administrador from app.membros where user_id = '00000000-0000-0000-0000-0000000000e4'),
  'a marca de administrador vem da equipe prevista');
select pg_temp.ok((select count(*) from app.equipe_prevista where aplicada_em is not null) = 3, 'a equipe prevista guarda quando foi aplicada');
select pg_temp.como(:'diretor');

\echo '# menções com @ e e-mail das notificações'
select pg_temp.ok(app.arrobas_no_texto('Fala @Gestor e @joao.silva. Copiar x@bkm.test e @@ ninguém') = array['gestor','joao.silva'],
  'acha os @ do texto, sem e-mail e sem o ponto final');
select pg_temp.como(:'analista');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, prazo)
  select :'emp', l.quadro_id, l.id, 'Conferir matrícula', 'Ver com @gestor e @joao.silva; @analista e @intruso não contam', current_date + 5
  from fluxo.listas l where l.id = pg_temp.lista(:'tm', 'Fazer') returning id as km \gset
select pg_temp.ok((select array_agg(user_id order by user_id) from app.mencoes where origem_id = :'km')
  = array[:'gestor', '00000000-0000-0000-0000-0000000000f1']::uuid[], 'o @ de quem é da empresa vira menção; o próprio autor e quem é de fora, não');
update fluxo.tarefas set descricao = 'Ver com @gestor, @joao.silva e @diretor' where id = :'km';
select pg_temp.ok((select count(*) from app.mencoes where origem_id = :'km') = 3, 'editar o texto só acrescenta quem entrou agora');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'mencao' and origem_id = :'km') = 1
  and (select texto from app.notificacoes where tipo = 'mencao' and origem_id = :'km') like '% mencionou você na tarefa: Conferir matrícula',
  'quem é mencionado é avisado uma vez, com o lugar da menção');
select pg_temp.ok((select email_status from app.notificacoes where tipo = 'mencao' and origem_id = :'km') = 'pendente',
  'menção vai também por e-mail pelo padrão do tipo');
select app.salvar_preferencia_notificacao(:'emp', 'mencao', false);
select pg_temp.como(:'analista');
insert into app.atividades (empresa_id, terreno_id, tipo, resumo) values (:'emp', :'tm', 'nota', 'Liguei para o vendedor, @gestor assume') returning id as am \gset
select pg_temp.como(:'gestor');
select pg_temp.ok((select email_status from app.notificacoes where tipo = 'mencao' and origem_id = :'am') is null
  and exists (select 1 from app.notificacoes where tipo = 'mencao' and origem_id = :'am'),
  'quem desligou o e-mail da menção continua avisado só no app');
select pg_temp.ok((select count(*) from app.preferencias_notificacao) = 1, 'cada um vê só as próprias preferências');
select app.salvar_preferencia_notificacao(:'emp', 'mencao', null);
select pg_temp.ok(not exists (select 1 from app.preferencias_notificacao), 'preferência vazia volta ao padrão do tipo');
-- participantes da reunião marcados com @ (pedido do Moises, 9/nov/2026)
select pg_temp.como(:'analista');
insert into app.reunioes (empresa_id, terreno_id, status, inicio, modalidade, link, pauta) values
  (:'emp', :'tm', 'agendada', now() + interval '2 days', 'online', 'https://meet.google.com/abc-defg-hij', 'Contraproposta com @gestor') returning id as rm \gset
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, user_id) values (:'emp', :'rm', 'bkm', :'gestor'), (:'emp', :'rm', 'bkm', :'diretor'), (:'emp', :'rm', 'bkm', :'analista');
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, nome, email) values (:'emp', :'rm', 'vendedor', 'Sr. Carlos', 'carlos@exemplo.com');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade, local, link) values (%L, %L, now() - interval '1 hour', 'presencial', 'bkm', 'https://meet.google.com/x')$$, :'emp', :'tm'), 'link só em reunião online');
select pg_temp.falha(format($$update app.reunioes set link = 'meet.google.com/x' where id = %L$$, :'rm'), 'link da reunião começa com http');
select pg_temp.ok((select count(*) from app.mencoes where origem_tabela = 'reunioes' and origem_id = :'rm') = 2,
  'colega marcado como participante vira menção da reunião, uma vez por pessoa; quem marcou e quem é de fora, não');
select pg_temp.como(:'diretor');
select pg_temp.ok((select texto from app.notificacoes where tipo = 'mencao' and origem_id = :'rm') like '% marcou você na reunião de %',
  'participante da BKM marcado é avisado no sino');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'mencao' and origem_id = :'rm') = 1,
  'mencionado no texto e marcado como participante recebe um aviso só');
select pg_temp.ok((select bool_and(email_status is null) from app.notificacoes where tipo = 'tarefa_prazo'), 'lembrete de prazo não vai por e-mail no padrão');
select pg_temp.falha(format($$select app.salvar_preferencia_notificacao(%L, 'nao_existe', true)$$, :'emp'), 'tipo de notificação desconhecido é recusado');
select pg_temp.falha(format($$insert into app.preferencias_notificacao values (%L, %L, 'mencao', true)$$, :'emp', :'gestor'), 'preferência só se grava pela função');
select pg_temp.como(:'intruso');
select pg_temp.falha(format($$select app.salvar_preferencia_notificacao(%L, 'mencao', true)$$, :'emp'), 'quem é de fora não grava preferência na empresa');
select pg_temp.ok(not exists (select 1 from app.mencoes), 'quem é de fora não vê as menções');
select pg_temp.como(:'diretor');
select app.configurar_notificacao(:'emp', 'tarefa_prazo', p_email_padrao => true);
select pg_temp.ok((select email_padrao from app.tipos_notificacao where empresa_id = :'emp' and codigo = 'tarefa_prazo'), 'administrador liga o e-mail padrão de um tipo');

-- ---------------------------------------------------------------------
\echo '# quadros e tarefas (fluxo, bloco 1)'
select pg_temp.como(:'analista');
select q.id as qm from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'tm' \gset
select pg_temp.ok((select string_agg(nome || ':' || tipo, ',' order by posicao) from fluxo.listas where quadro_id = :'qm')
  = 'Backlog:aberta,Fazer:aberta,Fazendo:aberta,Aguardando retorno:aberta,Pausadas:pausa,Feito:conclui',
  'terreno nasce com o seu quadro e as listas padrão');
select pg_temp.ok(fluxo.quadro_de(:'emp', 'terreno', :'tm') = :'qm', 'pedir o quadro de novo devolve o mesmo');
select pg_temp.tarefa(:'tm', 'Levantar matrícula', current_date + 3, :'gestor', null, 'Backlog') as kf \gset
select pg_temp.ok((select codigo ~ '^TAR-\d{6}$' and solicitante_id = :'analista' from fluxo.tarefas where id = :'kf'), 'tarefa ganha código TAR e quem criou é o solicitante');
select pg_temp.ok((select lista_nome = 'Backlog' and objeto_tipo = 'terreno' and objeto_id = :'tm' from fluxo.v_tarefas where id = :'kf'), 'o cartão sabe o quadro e o objeto que ele acompanha');
update fluxo.tarefas set concluida_em = now() where id = :'kf';
select pg_temp.ok((select lista_nome = 'Feito' and concluida_por = :'analista' from fluxo.v_tarefas where id = :'kf'), 'marcar concluída leva o cartão para a lista que conclui');
update fluxo.tarefas set concluida_em = null where id = :'kf';
select pg_temp.ok((select lista_nome = 'Backlog' and concluida_em is null from fluxo.v_tarefas where id = :'kf'), 'reabrir leva para a primeira lista aberta');
select pg_temp.falha(format($$update fluxo.tarefas set lista_id = %L where id = %L$$, pg_temp.lista(:'tm', 'Pausadas'), :'kf'), 'Pausadas é lista de pausa: só se entra por Pausar');
select pg_temp.falha(format($$update fluxo.tarefas set lista_id = %L where id = %L$$, pg_temp.lista(:'t2', 'Fazer'), :'kf'), 'lista de outro quadro é recusada');
select pg_temp.falha(format($$update fluxo.tarefas set quadro_id = %L, lista_id = %L where id = %L$$, :'q2', :'l2', :'kf'), 'cartão não muda de quadro');
select pg_temp.falha(format($$delete from fluxo.tarefas where id = %L$$, :'kf'), 'tarefa não se apaga, só se arquiva');
select pg_temp.falha(format($$update fluxo.tarefas set inicio = current_date + 9 where id = %L$$, :'kf'), 'início depois do prazo é recusado');
select pg_temp.falha(format($$update fluxo.tarefas set processo_id = %L where id = %L$$, :'neg', :'kf'), 'negociação de outro terreno é recusada');
update fluxo.tarefas set prazo = current_date - 1 where id = :'kf';
select pg_temp.ok((select atrasada from fluxo.v_tarefas where id = :'kf'), 'prazo vencido e aberta: atrasada');
update fluxo.tarefas set arquivada_em = now() where id = :'kf';
select pg_temp.ok((select not atrasada and arquivada_por = :'analista' from fluxo.v_tarefas where id = :'kf'), 'arquivada não conta como atrasada e guarda quem arquivou');
update fluxo.tarefas set arquivada_em = null where id = :'kf';
select pg_temp.ok((select arquivada_por is null from fluxo.tarefas where id = :'kf'), 'restaurar tira o arquivamento');
-- papéis: executor é avisado; quem acompanha recebe comentário e conclusão
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values
  (:'emp', :'kf', :'diretor', 'executor'), (:'emp', :'kf', :'gestor', 'acompanha');
select pg_temp.falha(format($$insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (%L, %L, %L, 'dono')$$, :'emp', :'kf', :'leitor'), 'papel desconhecido é recusado');
insert into fluxo.comentarios (empresa_id, tarefa_id, texto) values (:'emp', :'kf', 'Cartório pediu mais 5 dias, @diretor') returning id as cm \gset
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Feito') where id = :'kf';
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where origem_id = :'kf' and tipo = 'tarefa_atribuida') = 1, 'executor é avisado da tarefa');
select pg_temp.ok((select count(*) from app.notificacoes where origem_tabela = 'tarefas' and origem_id = :'kf' and tipo = 'mencao') = 1
  and (select texto from app.notificacoes where origem_id = :'kf' and tipo = 'mencao') like '%num comentário da tarefa: Levantar matrícula',
  '@ no comentário avisa e leva à tarefa');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where origem_id = :'kf' and tipo = 'tarefa_acompanhada') >= 1
  and exists (select 1 from app.notificacoes where origem_id = :'kf' and tipo = 'tarefa_acompanhada' and terreno_id = :'tm'),
  'quem acompanha é avisado, com o terreno do quadro');
-- comentários: só o autor edita e apaga
update fluxo.comentarios set texto = 'mudei' where id = :'cm';
select pg_temp.ok((select texto from fluxo.comentarios where id = :'cm') like 'Cartório%', 'outro usuário não edita o comentário');
insert into fluxo.comentario_reacoes (empresa_id, comentario_id, emoji) values (:'emp', :'cm', '👍');
select pg_temp.falha(format($$insert into fluxo.comentario_reacoes (empresa_id, comentario_id, user_id, emoji) values (%L, %L, %L, '👍')$$, :'emp', :'cm', :'diretor'), 'ninguém reage em nome de outro');
select pg_temp.como(:'analista');
update fluxo.comentarios set texto = 'Cartório pediu mais 5 dias úteis' where id = :'cm';
select pg_temp.ok((select editado_em is not null from fluxo.comentarios where id = :'cm'), 'o autor edita e fica marcado como editado');
update fluxo.comentarios set apagado_em = now() where id = :'cm';
select pg_temp.falha(format($$update fluxo.comentarios set texto = 'volta' where id = %L$$, :'cm'), 'comentário apagado não se edita');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'comentarios' and registro_id = :'cm') >= 2, 'o histórico guarda o que o comentário dizia');
select pg_temp.como(:'analista');
-- checklist com responsável e prazo por item
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'k1', 'Documentos') returning id as ch \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, responsavel_id, prazo) values
  (:'emp', :'ch', 'Matrícula atualizada', :'gestor', current_date + 2) returning id as ci1 \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto) values (:'emp', :'ch', 'Certidão de ônus') returning id as ci2 \gset
update fluxo.checklist_itens set concluido_em = now() where id = :'ci2';
select pg_temp.ok((select checklist_total = 2 and checklist_feitos = 1 from fluxo.v_tarefas where id = :'k1'), 'cartão mostra o andamento do checklist');
select pg_temp.ok((select concluido_por = :'analista' from fluxo.checklist_itens where id = :'ci2'), 'item feito guarda quem marcou');
select fluxo.item_para_tarefa(:'ci1') as kc \gset
select pg_temp.ok((select titulo = 'Matrícula atualizada' and responsavel_id = :'gestor' and quadro_id = :'qm' from fluxo.tarefas where id = :'kc')
  and (select virou_tarefa_id = :'kc' and concluido_em is not null from fluxo.checklist_itens where id = :'ci1')
  and exists (select 1 from fluxo.anexos where tarefa_id = :'kc' and tarefa_ref_id = :'k1'),
  'item vira cartão no mesmo quadro, ligado ao cartão de origem');
select pg_temp.ok(fluxo.item_para_tarefa(:'ci1') = :'kc', 'converter de novo devolve o mesmo cartão');
select pg_temp.como(:'gestor');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'tarefa_atribuida' and texto like 'Item para você em %Matrícula atualizada'), 'responsável do item é avisado');
-- etiquetas e anexos
select pg_temp.como(:'analista');
insert into fluxo.etiquetas (empresa_id, nome, cor) values (:'emp', 'Jurídico', 'roxo') returning id as et \gset
insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (:'emp', :'k1', :'et');
select pg_temp.falha(format($$insert into fluxo.etiquetas (empresa_id, nome, cor) values (%L, 'X', 'dourado')$$, :'emp'), 'cor fora da paleta é recusada');
select pg_temp.como(:'intruso');
insert into fluxo.etiquetas (empresa_id, nome) values (:'emp2', 'Deles') returning id as et2 \gset
select pg_temp.falha(format($$select fluxo.quadro_de(%L, 'terreno', %L)$$, :'emp', :'tm'), 'quem é de fora não abre o quadro');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (%L, %L, %L)$$, :'emp', :'k1', :'et2'), 'etiqueta de outra empresa é recusada');
insert into fluxo.anexos (empresa_id, tarefa_id, tipo, nome, url) values (:'emp', :'k1', 'link', 'Matrícula no Drive', 'https://drive.google.com/x');
select pg_temp.falha(format($$insert into fluxo.anexos (empresa_id, tarefa_id, tipo, nome) values (%L, %L, 'link', 'sem endereço')$$, :'emp', :'k1'), 'link sem endereço é recusado');
select pg_temp.ok((select count(*) from fluxo.anexos where tarefa_id = :'k1') = 1, 'anexo fica no cartão');
-- leitura só vê
select pg_temp.como(:'leitor');
select pg_temp.ok((select count(*) from fluxo.v_tarefas where quadro_id = :'qm') >= 3, 'leitura vê o quadro');
select pg_temp.falha(format($$insert into fluxo.comentarios (empresa_id, tarefa_id, texto) values (%L, %L, 'x')$$, :'emp', :'k1'), 'leitura não comenta');
select pg_temp.falha(format($$select fluxo.item_para_tarefa(%L)$$, :'ci2'), 'leitura não converte item');
-- listas padrão: só o administrador; vale para quadros novos
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select fluxo.salvar_lista_modelo(%L, null, 'Nova', 9, 'aberta')$$, :'emp'), 'só o administrador muda as listas padrão');
select pg_temp.como(:'diretor');
select id as lb from fluxo.listas_modelo where empresa_id is null and nome = 'Backlog' \gset
select fluxo.salvar_lista_modelo(:'emp', :'lb', 'Entrada', 1, 'aberta') as lbe \gset
select pg_temp.ok((select count(*) from fluxo.listas_modelo where empresa_id = :'emp') = 6 and (select nome from fluxo.listas_modelo where id = :'lbe') = 'Entrada'
  and (select nome from fluxo.listas_modelo where id = :'lb') = 'Backlog', 'a primeira mudança copia o padrão para a empresa');
select id as lfeito from fluxo.listas_modelo where empresa_id = :'emp' and nome = 'Feito' \gset
select pg_temp.falha(format($$select fluxo.salvar_lista_modelo(%L, %L, 'Feito', 6, 'aberta')$$, :'emp', :'lfeito'), 'o modelo não fica sem lista que conclui');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Quadro novo', :'diretor', 'prospeccao', :'sp', -23.70, -46.70, pg_temp.quadra(-46.70, -23.70)) returning id as tq \gset
select pg_temp.ok(pg_temp.lista(:'tq', 'Entrada') is not null and pg_temp.lista(:'tm', 'Backlog') is not null, 'quadro novo usa as listas da empresa; os existentes mantêm as suas');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'listas_modelo') >= 7, 'listas padrão vão para a auditoria');
-- ---------------------------------------------------------------------
\echo '# cronograma (fluxo, bloco 2)'
select pg_temp.como(:'analista');
-- datas de 2030 sem feriado; 05/08/2030 é segunda
select pg_temp.tarefa(:'tm', 'Cr A', '2030-08-09') as ca \gset
update fluxo.tarefas set inicio = '2030-08-05' where id = :'ca';
select pg_temp.ok((select duracao = 5 and inicio_min = '2030-08-05' from fluxo.tarefas where id = :'ca'), 'duração sai do início e do prazo (dias corridos)');
select pg_temp.tarefa(:'tm', 'Cr B', '2030-08-03') as cb \gset
update fluxo.tarefas set inicio = '2030-08-01' where id = :'cb';
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id) values (:'emp', :'ca', :'cb') returning id as vab \gset
select pg_temp.ok((select inicio = '2030-08-10' and prazo = '2030-08-12' and duracao = 3 and inicio_min = '2030-08-01' from fluxo.tarefas where id = :'cb'),
  'término-início: a sucessora começa no dia seguinte ao fim da predecessora, com a mesma duração');
update fluxo.tarefas set prazo = '2030-08-12' where id = :'ca';
select pg_temp.ok((select inicio = '2030-08-13' and prazo = '2030-08-15' from fluxo.tarefas where id = :'cb'), 'esticar a predecessora empurra a sucessora');
select pg_temp.tarefa(:'tm', 'Cr C', '2030-08-01') as cc \gset
update fluxo.tarefas set inicio = '2030-08-01' where id = :'cc';
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, defasagem) values (:'emp', :'cb', :'cc', 2);
select pg_temp.ok((select inicio = '2030-08-18' and prazo = '2030-08-18' from fluxo.tarefas where id = :'cc'), 'defasagem de 2 dias depois do fim');
update fluxo.tarefas set prazo = '2030-08-09' where id = :'ca';
select pg_temp.ok((select inicio from fluxo.tarefas where id = :'cb') = '2030-08-10' and (select inicio from fluxo.tarefas where id = :'cc') = '2030-08-15',
  'encurtar a predecessora puxa a cadeia de volta (o mais cedo possível)');
select pg_temp.tarefa(:'tm', 'Cr D', '2030-08-01') as cd \gset
update fluxo.tarefas set inicio = '2030-08-01' where id = :'cd';
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, tipo, defasagem) values (:'emp', :'ca', :'cd', 'II', 1);
select pg_temp.ok((select inicio = '2030-08-06' from fluxo.tarefas where id = :'cd'), 'início-início com defasagem de 1 dia');
select pg_temp.tarefa(:'tm', 'Cr E', '2030-08-02') as ce \gset
update fluxo.tarefas set inicio = '2030-08-01' where id = :'ce';
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, tipo) values (:'emp', :'ca', :'ce', 'II'), (:'emp', :'ca', :'ce', 'TT');
select pg_temp.ok((select inicio = '2030-08-08' and prazo = '2030-08-09' from fluxo.tarefas where id = :'ce'),
  'II e TT com durações diferentes: como no Project, a sucessora termina junto e começa depois');
update fluxo.tarefas set duracao = 5 where id = :'ce';
select pg_temp.ok((select inicio = '2030-08-05' and prazo = '2030-08-09' and duracao = 5 from fluxo.tarefas where id = :'ce'), 'esticar a sucessora para a duração da predecessora (a opção do aviso): começam e terminam juntas');
select pg_temp.tarefa(:'tm', 'Cr F', '2030-08-01') as cf \gset
update fluxo.tarefas set inicio = '2030-08-01' where id = :'cf';
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, tipo) values (:'emp', :'ca', :'cf', 'IT');
select pg_temp.ok((select prazo = '2030-08-05' from fluxo.tarefas where id = :'cf'), 'início-término: a sucessora termina quando a predecessora começa');
select pg_temp.falha(format($$insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id) values (%L, %L, %L)$$, :'emp', :'cc', :'ca'), 'vínculo em círculo é recusado');
select pg_temp.falha(format($$insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id) values (%L, %L, %L)$$, :'emp', :'ca', :'ca'), 'tarefa não depende dela mesma');
update fluxo.tarefas set inicio = '2030-08-20' where id = :'cb';
select pg_temp.ok((select inicio = '2030-08-20' and inicio_min = '2030-08-20' from fluxo.tarefas where id = :'cb'), 'início digitado depois do que o vínculo pede vale (não começar antes de)');
update fluxo.tarefas set inicio = '2030-08-01' where id = :'cb';
select pg_temp.ok((select inicio = '2030-08-10' from fluxo.tarefas where id = :'cb'), 'início antes do que o vínculo deixa volta para o mais cedo possível');
update fluxo.tarefas set concluida_em = now() where id = :'cc';
select inicio as cc_ini from fluxo.tarefas where id = :'cc' \gset
update fluxo.tarefas set prazo = '2030-08-11' where id = :'ca';
select pg_temp.ok((select inicio from fluxo.tarefas where id = :'cc') = :'cc_ini' and (select inicio from fluxo.tarefas where id = :'cb') = '2030-08-12',
  'tarefa concluída não se move; a aberta acompanha');
update fluxo.tarefas set concluida_em = null where id = :'cc';
delete from fluxo.vinculos where id = :'vab';
select pg_temp.ok((select count(*) from fluxo.vinculos where sucessora_id = :'cb') = 0, 'quem edita tira o vínculo');
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id) values (:'emp', :'ca', :'cb');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'tarefas' and registro_id = :'cb' and user_id = :'analista'
  and antes->>'inicio' is distinct from depois->>'inicio') >= 1, 'a auditoria guarda quem mudou as datas, inclusive as empurradas');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id) values (%L, %L, %L)$$, :'emp', :'cd', :'cf'), 'leitura não cria vínculo');
-- dias úteis
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select fluxo.salvar_calendario(%L, true)$$, :'emp'), 'só o administrador muda o calendário');
select pg_temp.como(:'diretor');
select fluxo.salvar_calendario(:'emp', true);
select pg_temp.ok(fluxo.somar_dias(:'emp', '2030-08-09', 1) = '2030-08-12' and fluxo.somar_dias(:'emp', '2030-11-14', 1) = '2030-11-18'
  and fluxo.duracao_dias(:'emp', '2030-08-09', '2030-08-12') = 2 and fluxo.somar_dias(:'emp', '2030-08-12', -1) = '2030-08-09',
  'dias úteis pulam fim de semana e feriado');
select fluxo.salvar_calendario(:'emp', false);
select pg_temp.ok(fluxo.somar_dias(:'emp', '2030-08-09', 1) = '2030-08-10', 'padrão volta a dias corridos');
-- linha de base
select pg_temp.como(:'analista');
select fluxo.enviar_cronograma(:'qm') as lb1 \gset
select pg_temp.ok((select situacao = 'pendente' and numero is null from fluxo.linhas_base where id = :'lb1')
  and (select count(*) from fluxo.linha_base_itens where linha_base_id = :'lb1') >= 6, 'quem edita manda o cronograma; fica pendente com o retrato das datas');
select pg_temp.falha(format($$select fluxo.decidir_linha_base(%L, true)$$, :'lb1'), 'analista não aprova a própria linha de base');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$select fluxo.enviar_cronograma(%L)$$, :'qm'), 'leitura não manda cronograma');
select pg_temp.como(:'gestor');
select fluxo.decidir_linha_base(:'lb1', true);
select pg_temp.ok((select situacao = 'aprovada' and numero = 1 and decidida_por = :'gestor' from fluxo.linhas_base where id = :'lb1'), 'o gestor de quem mandou aprova: linha de base 1');
select pg_temp.como(:'analista');
select prazo as a_pz from fluxo.tarefas where id = :'ca' \gset
update fluxo.tarefas set prazo = prazo + 2 where id = :'ca';
select pg_temp.ok((select desvio_prazo = 2 and atrasada_base and base_prazo = :'a_pz' from fluxo.v_cronograma where tarefa_id = :'ca')
  and (select desvio_prazo = 2 from fluxo.v_cronograma where tarefa_id = :'cb'), 'depois de aprovada, as datas seguem livres e o desvio aparece (inclusive na sucessora)');
select pg_temp.falha(format($$select fluxo.enviar_cronograma(%L)$$, :'qm'), 'mudar a linha de base pede o motivo');
select fluxo.enviar_cronograma(:'qm', 'Cartório atrasou') as lb2 \gset
select pg_temp.ok((select situacao from fluxo.linhas_base where id = :'lb2') = 'pendente' and (select situacao from fluxo.linhas_base where id = :'lb1') = 'aprovada',
  'o analista só pede a troca; a aprovada continua valendo');
select pg_temp.como(:'gestor');
select fluxo.decidir_linha_base(:'lb2', false, 'Segura até o retorno do cartório');
select pg_temp.ok((select situacao = 'recusada' and motivo_decisao is not null from fluxo.linhas_base where id = :'lb2'), 'o gestor recusa com motivo');
select fluxo.enviar_cronograma(:'qm', 'Replanejado com o cartório') as lb3 \gset
select pg_temp.ok((select situacao = 'aprovada' and numero = 2 from fluxo.linhas_base where id = :'lb3')
  and (select situacao from fluxo.linhas_base where id = :'lb1') = 'substituida'
  and (select desvio_prazo = 0 from fluxo.v_cronograma where tarefa_id = :'ca'), 'gestor troca a linha de base direto; a antiga fica guardada');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.auditoria where tabela = 'linhas_base') >= 4, 'linha de base vai para a auditoria');
select pg_temp.como(:'intruso');
select pg_temp.ok((select count(*) from fluxo.linhas_base) = 0 and (select count(*) from fluxo.vinculos) = 0, 'outra empresa não vê cronograma');
-- ---------------------------------------------------------------------
\echo '# modelos de tarefas (fluxo)'
select pg_temp.como(:'diretor');
insert into fluxo.modelos_quadro (empresa_id, nome) values (:'emp', 'Aquisição padrão') returning id as mp \gset
insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, lista_nome, inicio_dias, duracao, responsavel_objeto, pessoas, etiquetas, checklists)
  values (:'emp', :'mp', 1, 'Pedir matrícula atualizada', 'Fazer', 0, 3, true,
          jsonb_build_array(jsonb_build_object('papel', 'aprovador', 'user_id', :'gestor'), jsonb_build_object('papel', 'acompanha', 'objeto', true)),
          array[:'et']::uuid[], '[{"nome": "Cartório", "itens": ["Pedir certidão", "Conferir ônus"]}]') returning id as mt1 \gset
insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, inicio_dias, duracao, responsavel_id)
  values (:'emp', :'mp', 2, 'Análise jurídica', 0, 5, :'analista') returning id as mt2 \gset
insert into fluxo.modelo_vinculos (empresa_id, modelo_id, predecessora_id, sucessora_id) values (:'emp', :'mp', :'mt1', :'mt2');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select fluxo.definir_modelo_padrao(%L, %L)$$, :'emp', :'mp'), 'só o administrador escolhe o modelo padrão');
select pg_temp.falha(format($$insert into fluxo.modelos_quadro (empresa_id, nome) values (%L, 'Meu da empresa')$$, :'emp'), 'analista não cria modelo da empresa');
select pg_temp.falha(format($$update fluxo.modelo_tarefas set titulo = 'x' where id = %L returning 1/0$$, :'mt1'), 'analista não mexe no modelo da empresa');
select pg_temp.como(:'diretor');
select fluxo.definir_modelo_padrao(:'emp', :'mp');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno com modelo', :'gestor', 'prospeccao', :'sp', -23.72, -46.72, pg_temp.quadra(-46.72, -23.72)) returning id as tmod \gset
select q.id as qmod from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'tmod' \gset
select id as km1 from fluxo.tarefas where quadro_id = :'qmod' and titulo = 'Pedir matrícula atualizada' \gset
select id as km2 from fluxo.tarefas where quadro_id = :'qmod' and titulo = 'Análise jurídica' \gset
select pg_temp.ok((select inicio = current_date and prazo = current_date + 2 and responsavel_id = :'gestor' and lista_nome = 'Fazer' from fluxo.v_tarefas where id = :'km1'),
  'terreno novo já nasce com as tarefas do modelo padrão: datas relativas e o responsável do terreno');
select pg_temp.ok((select count(*) from fluxo.tarefa_pessoas where tarefa_id = :'km1' and ((papel = 'aprovador' and user_id = :'gestor') or (papel = 'acompanha' and user_id = :'gestor'))) = 2
  and exists (select 1 from fluxo.tarefa_etiquetas where tarefa_id = :'km1' and etiqueta_id = :'et')
  and (select count(*) from fluxo.checklist_itens i join fluxo.checklists c on c.id = i.checklist_id where c.tarefa_id = :'km1' and c.nome = 'Cartório') = 2,
  'aprovador, quem acompanha, etiqueta e checklist vêm do modelo');
select pg_temp.ok((select inicio = current_date + 3 and prazo = current_date + 7 and responsavel_id = :'analista' and lista_nome = 'Entrada' from fluxo.v_tarefas where id = :'km2')
  and exists (select 1 from fluxo.vinculos where predecessora_id = :'km1' and sucessora_id = :'km2'),
  'a predecessora já vem ligada e empurra a sucessora; lista desconhecida cai na primeira aberta');
-- modelo próprio: o analista salva o quadro e aplica em outro
select pg_temp.como(:'analista');
update fluxo.tarefas set responsavel_id = :'analista' where id = :'km1';
select fluxo.salvar_quadro_como_modelo(:'qmod', 'Meu roteiro') as mm \gset
select pg_temp.ok((select dono_id = :'analista' and not padrao from fluxo.modelos_quadro where id = :'mm')
  and (select count(*) from fluxo.modelo_tarefas where modelo_id = :'mm') = 2
  and (select count(*) from fluxo.modelo_vinculos where modelo_id = :'mm') = 1
  and (select inicio_dias from fluxo.modelo_tarefas where modelo_id = :'mm' and titulo = 'Análise jurídica') = 3,
  'salvar o quadro como modelo próprio guarda tarefas, prazos relativos e predecessoras');
select pg_temp.falha(format($$select fluxo.salvar_quadro_como_modelo(%L, 'Da empresa', true)$$, :'qmod'), 'analista não salva modelo da empresa');
select count(*) as antes_k from fluxo.tarefas where quadro_id = :'qm' \gset
select fluxo.aplicar_modelo(:'mm', :'qm', '2030-09-02') as napl \gset
select pg_temp.ok(:napl = 2 and (select count(*) from fluxo.tarefas where quadro_id = :'qm') = :antes_k + 2
  and exists (select 1 from fluxo.tarefas where quadro_id = :'qm' and titulo = 'Análise jurídica' and inicio = '2030-09-05'),
  'aplicar o modelo à mão cria as tarefas a partir da data escolhida');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from fluxo.modelos_quadro where id = :'mm') = 0, 'o modelo de um não aparece para os outros');
select pg_temp.falha(format($$select fluxo.aplicar_modelo(%L, %L)$$, :'mm', :'qm'), 'ninguém aplica o modelo de outra pessoa');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$select fluxo.aplicar_modelo(%L, %L)$$, :'mp', :'qm'), 'leitura não aplica modelo');
select pg_temp.como(:'diretor');
select fluxo.definir_modelo_padrao(:'emp', null);
select pg_temp.ok(not exists (select 1 from fluxo.modelos_quadro where empresa_id = :'emp' and padrao), 'o administrador tira o padrão');
\echo '# aprovação formal da tarefa (fluxo, bloco 3)'
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Minuta do compromisso', current_date + 5, :'analista', null, 'Fazendo') as ka \gset
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'ka', 'Conferir') returning id as cka \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto) values (:'emp', :'cka', 'Cláusula de permuta') returning id as ika \gset
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'ka'), 'com item do checklist em aberto, não conclui');
update fluxo.checklist_itens set concluido_em = now() where id = :'ika';
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel, ordem) values (:'emp', :'ka', :'gestor', 'aprovador', 1), (:'emp', :'ka', :'diretor', 'aprovador', 2);
select pg_temp.falha(format($$update fluxo.tarefas set lista_id = %L where id = %L$$, pg_temp.lista(:'tm', 'Feito'), :'ka'), 'com aprovador, arrastar para Feito sem aprovação é recusado');
select fluxo.pedir_aprovacao(:'ka', 'Minuta pronta') as apa \gset
select pg_temp.ok((select situacao = 'pendente' and modo = 'paralelo' from fluxo.aprovacoes where id = :'apa')
  and (select count(*) from fluxo.aprovacao_votos where aprovacao_id = :'apa' and decisao is null) = 2,
  'o pedido tira a foto dos dois aprovadores, em paralelo');
select pg_temp.falha(format($$select fluxo.decidir_aprovacao(%L, true)$$, :'apa'), 'quem não é aprovador não decide');
select pg_temp.como(:'gestor');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'aprovacao_pendente' and origem_tabela = 'tarefa_aprovacoes' and origem_id = :'apa' and terreno_id = :'tm'),
  'em paralelo, os aprovadores são avisados do pedido');
select pg_temp.falha(format($$select fluxo.decidir_aprovacao(%L, false)$$, :'apa'), 'recusar sem justificativa é recusado');
select fluxo.decidir_aprovacao(:'apa', true, 'Ok do jurídico');
select pg_temp.ok((select situacao = 'pendente' from fluxo.aprovacoes where id = :'apa') and (select concluida_em is null from fluxo.tarefas where id = :'ka'),
  'um aprovou: segue pendente e a tarefa não conclui');
select pg_temp.falha(format($$select fluxo.decidir_aprovacao(%L, true)$$, :'apa'), 'o mesmo aprovador não vota duas vezes');
select pg_temp.como(:'diretor');
select fluxo.decidir_aprovacao(:'apa', true);
select pg_temp.ok((select situacao = 'aprovada' from fluxo.aprovacoes where id = :'apa')
  and (select lista_nome = 'Feito' and concluida_em is not null from fluxo.v_tarefas where id = :'ka'),
  'todos aprovaram: o pedido fica aprovado e a tarefa conclui sozinha');
select pg_temp.como(:'analista');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'aprovacao_decidida' and origem_id = :'apa' and texto like 'Tarefa aprovada:%'),
  'quem pediu é avisado da aprovação');
update fluxo.tarefas set concluida_em = null where id = :'ka';
select pg_temp.ok((select situacao = 'invalidada' from fluxo.aprovacoes where id = :'apa'), 'reabrir a tarefa aprovada invalida a aprovação');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'ka'), 'reaberta, só conclui com aprovação nova');
-- em sequência: cada um na sua vez; o superior decide pelo aprovador abaixo dele
update fluxo.tarefas set aprovacao_modo = 'sequencia' where id = :'ka';
delete from fluxo.tarefa_pessoas where tarefa_id = :'ka' and papel = 'aprovador';
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel, ordem) values (:'emp', :'ka', :'diretor', 'aprovador', 1), (:'emp', :'ka', :'gestor', 'aprovador', 2);
select fluxo.pedir_aprovacao(:'ka') as aps \gset
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select fluxo.decidir_aprovacao(%L, true)$$, :'aps'), 'em sequência, o segundo não decide antes do primeiro');
select pg_temp.como(:'diretor');
select fluxo.decidir_aprovacao(:'aps', true);
select pg_temp.como(:'gestor');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'aprovacao_pendente' and origem_id = :'aps' and destinatario_id = :'gestor'),
  'em sequência, o próximo é avisado quando o anterior aprova');
select fluxo.decidir_aprovacao(:'aps', false, 'Falta a cláusula de multa');
select pg_temp.ok((select situacao = 'recusada' from fluxo.aprovacoes where id = :'aps') and (select concluida_em is null from fluxo.tarefas where id = :'ka')
  and (select justificativa = 'Falta a cláusula de multa' and decidido_por = :'gestor' from fluxo.aprovacao_votos where aprovacao_id = :'aps' and aprovador_id = :'gestor'),
  'recusa com justificativa encerra o pedido e a tarefa segue aberta');
select pg_temp.como(:'analista');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'aprovacao_decidida' and origem_id = :'aps' and texto like '%Falta a cláusula de multa%'),
  'quem pediu recebe a recusa com a justificativa');
-- superior decide por quem está abaixo: o diretor aprova pelo gestor
update fluxo.tarefas set aprovacao_modo = 'paralelo' where id = :'ka';
delete from fluxo.tarefa_pessoas where tarefa_id = :'ka' and papel = 'aprovador' and user_id = :'diretor';
select fluxo.pedir_aprovacao(:'ka') as apd \gset
select pg_temp.como(:'diretor');
select fluxo.decidir_aprovacao(:'apd', true, 'Aprovo pela Paula');
select pg_temp.ok((select decidido_por = :'diretor' and aprovador_id = :'gestor' from fluxo.aprovacao_votos where aprovacao_id = :'apd')
  and (select situacao = 'aprovada' from fluxo.aprovacoes where id = :'apd'),
  'o superior decide no lugar do aprovador e o voto guarda quem decidiu');
-- aprovador que pede tem o próprio voto dado; pedido novo cancela o anterior; quem pede desiste
select pg_temp.como(:'gestor');
select pg_temp.tarefa(:'tm', 'Parecer do jurídico', current_date + 5, :'gestor', null, 'Fazer') as kb \gset
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'kb', :'gestor', 'aprovador'), (:'emp', :'kb', :'diretor', 'aprovador');
select fluxo.pedir_aprovacao(:'kb') as apb1 \gset
select pg_temp.ok((select decisao = 'aprovou' from fluxo.aprovacao_votos where aprovacao_id = :'apb1' and aprovador_id = :'gestor'),
  'o aprovador que pede tem o próprio voto dado');
select fluxo.pedir_aprovacao(:'kb') as apb2 \gset
select pg_temp.ok((select situacao = 'cancelada' from fluxo.aprovacoes where id = :'apb1'), 'pedido novo cancela o que estava aberto');
select fluxo.cancelar_aprovacao(:'apb2');
select pg_temp.ok((select situacao = 'cancelada' from fluxo.aprovacoes where id = :'apb2'), 'quem edita desiste do pedido');
select pg_temp.falha(format($$insert into fluxo.aprovacoes (empresa_id, tarefa_id, modo, situacao) values (%L, %L, 'paralelo', 'aprovada')$$, :'emp', :'kb'), 'aprovação não se escreve direto, só pelas funções');
select pg_temp.falha(format($$select fluxo.pedir_aprovacao(%L)$$, :'kf'), 'tarefa sem aprovador não pede aprovação');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$select fluxo.pedir_aprovacao(%L)$$, :'kb'), 'leitura não pede aprovação');
-- a regra do checklist é da empresa e só o administrador muda
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select fluxo.salvar_regras(%L, false)$$, :'emp'), 'só o administrador muda a regra do checklist');
select pg_temp.como(:'diretor');
select fluxo.salvar_regras(:'emp', false);
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Pedir certidões', current_date + 5, :'analista', null, 'Fazer') as kc \gset
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'kc', 'Certidões') returning id as ckc \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto) values (:'emp', :'ckc', 'Ônus reais');
update fluxo.tarefas set concluida_em = now() where id = :'kc';
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kc'), 'com a regra desligada, conclui com item em aberto');
-- o modo de aprovação e a ordem dos aprovadores passam pelo modelo
select pg_temp.como(:'analista');
update fluxo.tarefas set aprovacao_modo = 'sequencia' where id = :'kb';
select fluxo.salvar_quadro_como_modelo(:'qm', 'Com aprovação') as mapr \gset
select pg_temp.ok((select aprovacao_modo = 'sequencia' and pessoas->0->>'papel' = 'aprovador' from fluxo.modelo_tarefas where modelo_id = :'mapr' and titulo = 'Parecer do jurídico'),
  'o modelo guarda o modo de aprovação do cartão');
\echo '# SLA com pausa aprovada (fluxo, bloco 3)'
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Aguardar cartório', current_date + 2, :'analista', null, 'Fazendo') as kp \gset
select pg_temp.falha(format($$select fluxo.pausar(%L, '')$$, :'kp'), 'pausar sem motivo é recusado');
select fluxo.pausar(:'kp', 'Cartório em greve') as zp \gset
select pg_temp.ok((select situacao = 'pendente' from fluxo.pausas where id = :'zp') and (select lista_nome = 'Fazendo' from fluxo.v_tarefas where id = :'kp'),
  'analista pede a pausa: fica pendente e o cartão não sai da lista');
select pg_temp.falha(format($$select fluxo.decidir_pausa(%L, true)$$, :'zp'), 'quem pediu não aprova a própria pausa');
select pg_temp.como(:'gestor');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'aprovacao_pendente' and origem_tabela = 'tarefa_pausas' and origem_id = :'zp'),
  'o gestor de quem pediu é avisado do pedido de pausa');
select pg_temp.falha(format($$select fluxo.decidir_pausa(%L, false)$$, :'zp'), 'recusar a pausa exige motivo');
select fluxo.decidir_pausa(:'zp', true);
select pg_temp.ok((select situacao = 'ativa' and inicio is not null from fluxo.pausas where id = :'zp')
  and (select lista_tipo = 'pausa' from fluxo.v_tarefas where id = :'kp'), 'aprovada, a pausa começa e o cartão vai para Pausadas');
select pg_temp.como(:'analista');
select pg_temp.ok(exists (select 1 from app.notificacoes where tipo = 'aprovacao_decidida' and origem_id = :'zp' and texto like 'Pausa aprovada:%'), 'quem pediu é avisado da aprovação da pausa');
-- pausada não atrasa; sair de Pausadas só por Retomar; retomar empurra o prazo pelos dias pausados
reset role;
update fluxo.pausas set inicio = inicio - interval '5 days' where id = :'zp';  -- simula 5 dias de pausa (como dono do banco)
select pg_temp.como(:'analista');
update fluxo.tarefas set prazo = current_date - 1 where id = :'kp';
select pg_temp.ok((select not atrasada from fluxo.v_tarefas where id = :'kp'), 'pausada, a tarefa não fica atrasada');
select pg_temp.ok((select dias_pausada = 5 and pausada from fluxo.v_tarefa_sla where tarefa_id = :'kp'), 'o tempo pausado conta enquanto a pausa dura');
select pg_temp.falha(format($$update fluxo.tarefas set lista_id = %L where id = %L$$, pg_temp.lista(:'tm', 'Fazer'), :'kp'), 'tirar de Pausadas arrastando é recusado: use Retomar');
select fluxo.retomar(:'kp') as dret \gset
select pg_temp.ok(:dret = 5 and (select prazo = current_date + 4 and lista_nome = 'Fazendo' from fluxo.v_tarefas where id = :'kp')
  and (select situacao = 'encerrada' and dias = 5 and retomada_por = :'analista' from fluxo.pausas where id = :'zp'),
  'retomar volta para a lista de antes e empurra o prazo pelos 5 dias pausados');
select pg_temp.ok((select dias_pausada = 5 and pausas = 1 and not pausada from fluxo.v_tarefa_sla where tarefa_id = :'kp'), 'o tempo líquido desconta a pausa encerrada');
-- quem já tem o nível pausa direto; concluir uma pausada encerra a pausa
select pg_temp.como(:'gestor');
select fluxo.pausar(:'kp', 'Esperando o vendedor') as zg \gset
select pg_temp.ok((select situacao = 'ativa' from fluxo.pausas where id = :'zg'), 'gestor pausa direto, sem pedido');
update fluxo.tarefas set concluida_em = now() where id = :'kp';
select pg_temp.ok((select situacao = 'encerrada' from fluxo.pausas where id = :'zg') and (select lista_nome = 'Feito' from fluxo.v_tarefas where id = :'kp'),
  'concluir a tarefa pausada encerra a pausa');
-- recusa e regra da empresa
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Esperar topografia', current_date + 2, :'analista', null, 'Fazer') as kq \gset
select fluxo.pausar(:'kq', 'Topógrafo sem agenda') as zq \gset
select pg_temp.como(:'diretor');
select fluxo.decidir_pausa(:'zq', false, 'Contrate outro topógrafo');
select pg_temp.ok((select situacao = 'recusada' and motivo_decisao = 'Contrate outro topógrafo' from fluxo.pausas where id = :'zq')
  and (select lista_nome = 'Fazer' from fluxo.v_tarefas where id = :'kq'), 'o diretor (acima do gestor) recusa com motivo e o cartão fica onde está');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select fluxo.salvar_regra_pausa(%L, 'ninguem')$$, :'emp'), 'só o administrador escolhe quem aprova a pausa');
select pg_temp.como(:'diretor');
select fluxo.salvar_regra_pausa(:'emp', 'diretor');
select pg_temp.como(:'analista');
select fluxo.pausar(:'kq', 'Topógrafo sem agenda de novo') as zq2 \gset
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select fluxo.decidir_pausa(%L, true)$$, :'zq2'), 'com a regra "diretor", o gestor não aprova a pausa');
select pg_temp.como(:'diretor');
select fluxo.decidir_pausa(:'zq2', true);
select pg_temp.ok((select situacao = 'ativa' from fluxo.pausas where id = :'zq2'), 'o diretor aprova a pausa');
select fluxo.salvar_regra_pausa(:'emp', 'ninguem');
select pg_temp.como(:'analista');
select fluxo.retomar(:'kq');
select fluxo.pausar(:'kq', 'Chuva') as zq3 \gset
select pg_temp.ok((select situacao = 'ativa' from fluxo.pausas where id = :'zq3'), 'com a regra "ninguém", a pausa vale na hora');
select pg_temp.falha(format($$select fluxo.pausar(%L, 'De novo')$$, :'kq'), 'tarefa já pausada não pausa de novo');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$select fluxo.retomar(%L)$$, :'kq'), 'leitura não retoma');
select pg_temp.como(:'diretor');
select fluxo.salvar_regra_pausa(:'emp', 'gestor');
-- ---------------------------------------------------------------------
\echo '# visibilidade por cartão (fluxo, bloco 3)'
reset role;
insert into auth.users values ('00000000-0000-0000-0000-0000000000f3', 'diretora2@bkm.test');
update app.membros set papel = 'diretor', nome = 'Diretora sem admin' where user_id = '00000000-0000-0000-0000-0000000000f3' and empresa_id = :'emp';  -- entrou pelo domínio como básico
\set dir2 '00000000-0000-0000-0000-0000000000f3'
\set basico '00000000-0000-0000-0000-0000000000f1'
select pg_temp.como(:'analista');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, visibilidade)
select q.empresa_id, q.id, pg_temp.lista(:'tm', 'Fazer'), 'Anotação pessoal', 'individual'
from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'tm' returning id as vi \gset
select pg_temp.ok((select visibilidade = 'individual' from fluxo.tarefas where id = :'vi'), 'quem cria escolhe Individual e vê o próprio cartão');
select pg_temp.como(:'gestor');
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where id = :'vi') and not exists (select 1 from fluxo.v_tarefas where id = :'vi'),
  'individual: o gestor de quem criou não vê');
select pg_temp.ok(not exists (select 1 from app.auditoria where tabela = 'tarefas' and registro_id = :'vi'), 'nem o histórico do cartão individual');
select pg_temp.como(:'dir2');
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where id = :'vi'), 'individual: o diretor também não vê');
select pg_temp.como(:'diretor');
select pg_temp.ok(exists (select 1 from fluxo.tarefas where id = :'vi'), 'individual: o administrador do sistema vê os de todos');
-- pôr outra pessoa no cartão o torna restrito
select pg_temp.como(:'analista');
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'vi', :'gestor', 'acompanha');
select pg_temp.ok((select visibilidade = 'restrito' from fluxo.tarefas where id = :'vi'), 'pôr outra pessoa no individual o torna restrito');
select pg_temp.como(:'gestor');
select pg_temp.ok(exists (select 1 from fluxo.tarefas where id = :'vi'), 'restrito: quem está no cartão vê');
select pg_temp.falha(format($$update fluxo.tarefas set visibilidade = 'publico' where id = %L$$, :'vi'), 'quem só está no cartão não muda a visibilidade');
select pg_temp.como(:'leitor');
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where id = :'vi'), 'restrito: quem não foi liberado não vê');
select pg_temp.como(:'dir2');
select pg_temp.ok(exists (select 1 from fluxo.tarefas where id = :'vi'), 'restrito: o diretor vê');
-- grupos e papéis no cartão
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into fluxo.grupos (empresa_id, nome) values (%L, 'Jurídico')$$, :'emp'), 'só o administrador cria grupo');
select pg_temp.como(:'diretor');
insert into fluxo.grupos (empresa_id, nome) values (:'emp', 'Jurídico') returning id as gj \gset
insert into fluxo.grupo_membros (empresa_id, grupo_id, user_id) values (:'emp', :'gj', :'leitor'), (:'emp', :'gj', :'basico');
select pg_temp.como(:'analista');
insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, grupo_id, papel) values (:'emp', :'vi', :'gj', 'comentarista');
select pg_temp.como(:'leitor');
select pg_temp.ok(fluxo.papel_tarefa(:'vi') = 'comentarista', 'grupo liberado: quem é do grupo vê com o papel dado');
insert into fluxo.comentarios (empresa_id, tarefa_id, autor_id, texto) values (:'emp', :'vi', :'leitor', 'Vi a matrícula');
select pg_temp.ok(exists (select 1 from fluxo.comentarios where tarefa_id = :'vi' and autor_id = :'leitor'), 'comentarista comenta, mesmo sendo leitura no sistema');
update fluxo.tarefas set titulo = 'Mudado' where id = :'vi';
select pg_temp.ok((select titulo = 'Anotação pessoal' from fluxo.tarefas where id = :'vi'), 'comentarista não edita o cartão');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, excluido) values (%L, %L, %L, true)$$, :'emp', :'vi', :'basico'),
  'quem não administra o cartão não dá nem tira acesso');
select pg_temp.como(:'analista');
insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, excluido) values (:'emp', :'vi', :'basico', true);
select pg_temp.como(:'basico');
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where id = :'vi'), 'exceção: a pessoa tirada do grupo liberado não vê');
-- público: papel do sistema, que o cartão pode subir
select pg_temp.como(:'dir2');
update fluxo.tarefas set visibilidade = 'publico' where id = :'vi';
select pg_temp.ok((select visibilidade = 'publico' from fluxo.tarefas where id = :'vi'), 'o diretor muda a visibilidade');
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Conferir certidões', current_date + 5) as vp \gset
select pg_temp.como(:'basico');
select pg_temp.ok(fluxo.papel_tarefa(:'vp') = 'leitor', 'público: o básico vê e só lê');
update fluxo.tarefas set titulo = 'Mudado' where id = :'vp';
select pg_temp.ok((select titulo = 'Conferir certidões' from fluxo.tarefas where id = :'vp'), 'leitor não edita');
select pg_temp.como(:'analista');
insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'vp', :'basico', 'editor');
select pg_temp.como(:'basico');
update fluxo.tarefas set titulo = 'Conferir certidões e IPTU' where id = :'vp';
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'vp', 'Certidões');
select pg_temp.ok((select titulo = 'Conferir certidões e IPTU' from fluxo.tarefas where id = :'vp') and exists (select 1 from fluxo.checklists where tarefa_id = :'vp'),
  'o papel no cartão passa o do sistema: o básico liberado como editor edita');
-- item que vira cartão herda a visibilidade
select pg_temp.como(:'analista');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, visibilidade)
select q.empresa_id, q.id, pg_temp.lista(:'tm', 'Fazer'), 'Diligência sigilosa', 'restrito'
from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'tm' returning id as vr \gset
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'vr', 'Passos') returning id as vrc \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto) values (:'emp', :'vrc', 'Pedir certidão de ônus') returning id as vri \gset
select fluxo.item_para_tarefa(:'vri') as vrk \gset
select pg_temp.ok((select visibilidade = 'restrito' from fluxo.tarefas where id = :'vrk'), 'item que vira cartão herda a visibilidade do cartão de origem');
select pg_temp.como(:'gestor');
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where id in (:'vr', :'vrk')) and not exists (select 1 from fluxo.checklist_itens where id = :'vri'),
  'restrito: nem o cartão nem o checklist aparecem para quem não está nele');
select pg_temp.falha(format($$select fluxo.pausar(%L, 'x')$$, :'vr'), 'quem não vê o cartão não o pausa');
-- @ só avisa quem vê o cartão
select pg_temp.como(:'analista');
update fluxo.tarefas set descricao = 'Ver com @joao.silva' where id = :'vr';
update fluxo.tarefas set descricao = 'Ver com @joao.silva' where id = :'vp';
select pg_temp.ok(not exists (select 1 from app.mencoes where origem_id = :'vr' and user_id = :'basico')
  and exists (select 1 from app.mencoes where origem_id = :'vp' and user_id = :'basico'),
  'o @ num cartão restrito não avisa quem não vê o cartão; no público, avisa');
-- teto do objeto: quem não vê o terreno não vê os cartões dele
reset role;
create function pg_temp.nao_ve(uuid, uuid) returns boolean language sql as $$ select false $$;
update fluxo.objeto_tipos set funcao = 'pg_temp.nao_ve' where tipo = 'terreno';
select pg_temp.como(:'basico');
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where id = :'vp'), 'teto: sem ver o terreno, nem o cartão liberado aparece');
select pg_temp.como(:'diretor');
select pg_temp.ok(exists (select 1 from fluxo.tarefas where id = :'vp'), 'o administrador do sistema continua vendo');
reset role;
update fluxo.objeto_tipos set funcao = 'app.ve_terreno' where tipo = 'terreno';
-- ---------------------------------------------------------------------
\echo '# campos personalizados (fluxo, bloco 4)'
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into fluxo.campos (empresa_id, nome, tipo) values (%L, 'Valor do laudo', 'numero')$$, :'emp'), 'só o administrador cria campo');
select pg_temp.como(:'diretor');
insert into fluxo.campos (empresa_id, nome, tipo, na_frente) values (:'emp', 'Valor do laudo', 'numero', true) returning id as cnum \gset
insert into fluxo.campos (empresa_id, nome, tipo) values (:'emp', 'Cartório', 'lista') returning id as clis \gset
insert into fluxo.campos (empresa_id, nome, tipo) values (:'emp', 'Exige vistoria', 'caixa') returning id as ccx \gset
insert into fluxo.campo_opcoes (empresa_id, campo_id, nome) values (:'emp', :'clis', '1º RI') returning id as o1 \gset
insert into fluxo.campo_opcoes (empresa_id, campo_id, nome) values (:'emp', :'clis', '2º RI') returning id as o2 \gset
insert into fluxo.campos (empresa_id, nome, tipo) values (:'emp', 'Outro', 'lista') returning id as clis2 \gset
insert into fluxo.campo_opcoes (empresa_id, campo_id, nome) values (:'emp', :'clis2', 'X') returning id as ox \gset
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Pedir laudo', current_date + 5) as kc \gset
insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, numero) values (:'emp', :'kc', :'cnum', 125000);
insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, opcao_id) values (:'emp', :'kc', :'clis', :'o2');
insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, caixa) values (:'emp', :'kc', :'ccx', false);
select pg_temp.ok((select count(*) = 3 from fluxo.tarefa_campos where tarefa_id = :'kc'), 'quem edita o cartão preenche número, lista e sim/não');
select pg_temp.ok((select caixa = false from fluxo.tarefa_campos where tarefa_id = :'kc' and campo_id = :'ccx')
  and not exists (select 1 from fluxo.tarefa_campos where tarefa_id = :'kc' and campo_id not in (:'cnum', :'clis', :'ccx')),
  '"não" é um valor; o que não foi preenchido fica sem linha (não informado)');
select pg_temp.falha(format($$insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, texto) values (%L, %L, %L, 'cem mil')$$, :'emp', :'kc', :'cnum'),
  'valor fora do tipo do campo é recusado');
select pg_temp.falha(format($$update fluxo.tarefa_campos set opcao_id = %L where tarefa_id = %L and campo_id = %L$$, :'ox', :'kc', :'clis'),
  'opção de outro campo é recusada');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, opcao_id) values (%L, %L, %L, %L)$$, :'emp', :'kc', :'clis2', :'ox'),
  'leitura não preenche campo');
select pg_temp.ok(exists (select 1 from fluxo.tarefa_campos where tarefa_id = :'kc' and campo_id = :'cnum'), 'leitura vê os valores do cartão público');
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$update fluxo.campos set tipo = 'texto' where id = %L$$, :'cnum'), 'campo com valor não muda de tipo');
select pg_temp.falha(format($$delete from fluxo.campos where id = %L$$, :'cnum'), 'campo com valor não se apaga');
select pg_temp.falha(format($$delete from fluxo.campo_opcoes where id = %L$$, :'o2'), 'opção usada não se apaga');
delete from fluxo.campo_opcoes where id = :'o1';
update fluxo.campos set ativo = false where id = :'ccx';
select pg_temp.como(:'analista');
select pg_temp.falha(format($$update fluxo.tarefa_campos set caixa = true where tarefa_id = %L and campo_id = %L$$, :'kc', :'ccx'), 'campo desativado não recebe valor novo');
delete from fluxo.tarefa_campos where tarefa_id = :'kc' and campo_id = :'cnum';
select pg_temp.ok(not exists (select 1 from fluxo.tarefa_campos where tarefa_id = :'kc' and campo_id = :'cnum'), 'apagar o valor volta o campo a não informado');
select pg_temp.como(:'diretor');
update fluxo.tarefa_itens set regra_branco = 'bloqueia' where tarefa_id = :'kc' and campo_id in (:'cnum', :'ccx');
select pg_temp.como(:'analista');
select pg_temp.ok(fluxo.pendencias_conclusao(:'kc') = array['campos'], 'campo que bloqueia no cartão, sem valor, fica pendente (o desativado não conta)');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kc'), 'com campo obrigatório sem valor, não conclui');
insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, numero) values (:'emp', :'kc', :'cnum', 98000);
update fluxo.tarefas set concluida_em = now() where id = :'kc';
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kc'), 'preenchido o campo obrigatório, conclui');
\echo '# campos do terreno e da negociação, itens do cartão e regra em branco (31/out)'
select pg_temp.como(:'diretor');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno das condições', :'analista', 'corretor', :'sp', -23.61, -46.61, pg_temp.quadra(-46.61, -23.61)) returning id as tcd \gset
select app.registrar_oferta(:'tcd', 5000000, 'permuta_fisica') as rcd \gset
select (:'rcd'::jsonb->>'processo_id') as pcd \gset
select pg_temp.ok((select titulo from app.v_campos where empresa_id = :'emp' and chave = 'calculado.forma_pagamento_vigente') = 'Forma de pagamento vigente',
  'o catálogo de campos traz o título padrão');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select app.salvar_campo(%L, 'terreno.situacao_ocupacao', 'Relevo', true, true)$$, :'emp'), 'só o administrador muda o título do campo');
select pg_temp.falha(format($$insert into app.campos_empresa values (%L, 'terreno.situacao_ocupacao', 'Relevo', true, true)$$, :'emp'), 'a escolha da empresa só muda pela função');
select pg_temp.como(:'diretor');
select app.salvar_campo(:'emp', 'terreno.situacao_ocupacao', 'Relevo do terreno', true, true);
select pg_temp.ok((select titulo from app.v_campos where empresa_id = :'emp' and chave = 'terreno.situacao_ocupacao') = 'Relevo do terreno', 'o administrador dá o título que o usuário vê');
select pg_temp.falha(format($$select app.salvar_campo(%L, 'terreno.bairro', 'relevo do terreno', true, false)$$, :'emp'), 'dois campos não têm o mesmo título');
select app.salvar_campo(:'emp', 'terreno.situacao_ocupacao', '  ', true, true);
select pg_temp.ok((select titulo from app.v_campos where empresa_id = :'emp' and chave = 'terreno.situacao_ocupacao') = 'Ocupação', 'título vazio volta ao padrão');
select pg_temp.ok(app.campo_cartao(:'tcd', 'terreno.situacao_ocupacao')->'valor' = 'null'::jsonb, 'ocupação não informada é campo em branco, nunca um valor');
select pg_temp.ok(app.campo_cartao(:'tcd', 'calculado.forma_pagamento_vigente')->>'valor' = 'permuta_fisica', 'sem proposta, a forma de pagamento vigente é a pedida na oferta');
select pg_temp.como(:'intruso');
select pg_temp.ok(app.campo_cartao(:'tcd', 'oferta.valor_pedido') is null, 'outra empresa não lê o campo do terreno');
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tcd', 'Minuta de permuta', null, :'analista') as kp \gset
\set permuta '{"modo":"todas","itens":[{"campo":"calculado.forma_pagamento_vigente","op":"em","valores":["permuta_fisica","permuta_financeira","permuta_com_torna"]}]}'
select pg_temp.ok(fluxo.condicao_vale(:'kp', :'permuta'), 'condição: forma de pagamento vigente é permuta');
select app.registrar_proposta(:'pcd', 'bkm', 4500000, 'dinheiro') \gset
select pg_temp.ok(app.campo_cartao(:'tcd', 'calculado.forma_pagamento_vigente')->>'valor' = 'dinheiro', 'com proposta vigente, vale a forma de pagamento da proposta');
select pg_temp.ok(not fluxo.condicao_vale(:'kp', :'permuta'), 'a proposta em dinheiro desliga a condição de permuta');
select pg_temp.ok(fluxo.condicao_vale(:'kp', '{"modo":"todas","itens":[{"grupo":{"modo":"qualquer","itens":[{"campo":"calculado.forma_pagamento_vigente","op":"em","valores":["permuta_fisica"]},{"campo":"oferta.valor_pedido","op":"maior","valores":[4000000]}]}},{"campo":"terreno.situacao_ocupacao","op":"vazio"}]}'),
  'grupo: (permuta ou preço pedido acima de 4 mi) e ocupação não informada');
select pg_temp.ok(not fluxo.condicao_vale(:'kp', '{"modo":"qualquer","itens":[{"campo":"terreno.situacao_ocupacao","op":"fora","valores":["vazio"]}]}'),
  'campo em branco não satisfaz "não é" (não informado nunca vira valor)');
select pg_temp.falha(format($$insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave) values (%L, %L, 'terreno.descricao')$$, :'emp', :'kp'),
  'campo que não está liberado para o cartão não entra');
select pg_temp.falha(format($$insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, condicao) values (%L, %L, 'terreno.area_documental_m2', '{"modo":"todas","itens":[{"campo":"terreno.descricao","op":"preenchido"}]}')$$, :'emp', :'kp'),
  'condição só com campo liberado para condição');
select pg_temp.falha(format($$insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, condicao) values (%L, %L, 'terreno.area_documental_m2', '{"modo":"todas","itens":[{"campo":"oferta.valor_pedido","op":"em","valores":["1"]}]}')$$, :'emp', :'kp'),
  'operador tem que servir ao tipo do campo');
select pg_temp.falha(format($$insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, condicao) values (%L, %L, 'terreno.area_documental_m2', '{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"em","valores":["montanha"]}]}')$$, :'emp', :'kp'),
  'valor da lista tem que ser opção do campo');
select pg_temp.falha(format($$insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, condicao) values (%L, %L, 'terreno.area_documental_m2', '{"modo":"todas","itens":[{"grupo":{"modo":"todas","itens":[{"grupo":{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"vazio"}]}}]}}]}')$$, :'emp', :'kp'),
  'a condição aceita um nível de grupo só');
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, regra_branco) values (:'emp', :'kp', 'terreno.area_documental_m2', 'bloqueia');
select pg_temp.ok(fluxo.pendencias_conclusao(:'kp') = array['campos'], 'campo do terreno em branco com regra "bloqueia" impede concluir');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kp'), 'com o campo em branco que bloqueia, não conclui');
select pg_temp.falha(format($$select fluxo.concluir_justificando(%L, 'Vou ver depois')$$, :'kp'), 'item que bloqueia: o analista não conclui nem com justificativa');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$update fluxo.tarefa_itens set regra_branco = 'livre' where tarefa_id = %L$$, :'kp'), 'só diretor, administrador e quem criou mudam a regra do item');
select pg_temp.falha(format($$delete from fluxo.tarefa_itens where tarefa_id = %L$$, :'kp'), 'item com regra não sai pela mão de quem não configura o cartão');
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave) values (:'emp', :'kp', 'oferta.forma_pagamento_pedida');
select pg_temp.ok(exists (select 1 from fluxo.tarefa_itens where tarefa_id = :'kp' and chave = 'oferta.forma_pagamento_pedida' and regra_branco = 'livre'),
  'quem edita o cartão inclui campo sem regra (livre)');
select pg_temp.como(:'analista');
select app.gravar_campo(:'tcd', 'terreno.area_documental_m2', '1500');
select pg_temp.ok((select area_documental_m2 from app.terrenos where id = :'tcd') = 1500, 'o cartão grava no próprio terreno');
select pg_temp.ok(fluxo.pendencias_conclusao(:'kp') = '{}', 'preenchido o campo, nada impede concluir');
select pg_temp.falha(format($$select app.gravar_campo(%L, 'terreno.area_adotada_m2', '1500')$$, :'tcd'), 'campo que não se edita pelo cartão é recusado');
select app.gravar_campo(:'tcd', 'oferta.validade', to_jsonb((current_date + 30)::text));
select pg_temp.ok((select validade from app.ofertas where terreno_id = :'tcd') = current_date + 30, 'o cartão grava na oferta de referência');
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, regra_branco) values (:'emp', :'kp', 'terreno.situacao_ocupacao', 'justificativa');
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'kp', 'Permuta') returning id as ckp \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, regra_branco, condicao) values (:'emp', :'ckp', 'Minuta aprovada pelo jurídico', 'bloqueia', :'permuta');
select pg_temp.ok(fluxo.pendencias_conclusao(:'kp') = array['justificar'], 'em branco com regra "justificativa" pede justificativa; o item de permuta não vale com proposta em dinheiro');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kp'), 'sem justificativa, não conclui');
select pg_temp.falha(format($$select fluxo.concluir_justificando(%L, '  ')$$, :'kp'), 'justificativa vazia não vale');
select pg_temp.ok(fluxo.concluir_justificando(:'kp', 'Vendedor não tem levantamento') = 'concluida', 'com justificativa, conclui');
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kp')
  and (select itens->0->>'ref' = 'terreno.situacao_ocupacao' and not libera_bloqueio from fluxo.conclusao_justificativas where tarefa_id = :'kp'),
  'a justificativa fica registrada com os itens em branco');
select pg_temp.tarefa(:'tcd', 'Contrato com o vendedor', null, :'analista') as kd \gset
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'kd', 'Documentos') returning id as ckd \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, regra_branco) values (:'emp', :'ckd', 'Certidão de ônus', 'bloqueia');
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, regra_branco, condicao) values (:'emp', :'kd', 'oferta.corretor_id', 'bloqueia', :'permuta');
select pg_temp.ok(fluxo.pendencias_conclusao(:'kd') = array['checklist'], 'item de checklist com regra própria bloqueia; o campo com condição que não vale, não');
select pg_temp.ok((select count(*) from fluxo.itens_em_branco(:'kd')) = 1, 'a lista do que falta traz só o que vale agora');
select pg_temp.como(:'diretor');
select pg_temp.ok(fluxo.concluir_justificando(:'kd', 'Certidão chega amanhã; contrato assinado') = 'concluida', 'o diretor passa pelo item que bloqueia, com justificativa');
select pg_temp.ok((select libera_bloqueio from fluxo.conclusao_justificativas where tarefa_id = :'kd'), 'o registro diz que o diretor passou pelo bloqueio');
select pg_temp.como(:'analista');
update fluxo.tarefas set concluida_em = null where id = :'kd';
select fluxo.copiar_tarefa(:'kd', pg_temp.lista(:'tcd', 'Fazer'), 'Contrato (cópia)') as kdc \gset
select pg_temp.ok((select regra_branco = 'bloqueia' and condicao is not null from fluxo.tarefa_itens where tarefa_id = :'kdc' and chave = 'oferta.corretor_id')
  and (select regra_branco = 'bloqueia' from fluxo.checklist_itens i join fluxo.checklists c on c.id = i.checklist_id where c.tarefa_id = :'kdc'),
  'a cópia leva os itens e a regra de cada um');
select pg_temp.como(:'gestor');
select pg_temp.ok(fluxo.concluir_justificando(:'kdc', 'Certidão pedida ao cartório') = 'concluida', 'o gestor também passa pelo item que bloqueia, com justificativa (como no funil)');
select pg_temp.ok((select libera_bloqueio from fluxo.conclusao_justificativas where tarefa_id = :'kdc'), 'o registro diz que o gestor passou pelo bloqueio');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$select app.gravar_campo(%L, 'terreno.area_documental_m2', '1600')$$, :'tcd'), 'leitura não grava campo pelo cartão');
\echo '# recorrência (fluxo, bloco 4)'
select pg_temp.ok(fluxo.proxima_ocorrencia(row(null,null,null,'mensal',1,null,31,current_date,null,null,1,null,null,true,null,null)::fluxo.recorrencias, '2026-01-31') = '2026-02-28',
  'mensal no dia 31: mês sem o dia usa o último');
select pg_temp.ok(fluxo.proxima_ocorrencia(row(null,null,null,'semanal',2,array[1,3],null,current_date,null,null,1,null,null,true,null,null)::fluxo.recorrencias, '2026-11-02') = '2026-11-04'
  and fluxo.proxima_ocorrencia(row(null,null,null,'semanal',2,array[1,3],null,current_date,null,null,1,null,null,true,null,null)::fluxo.recorrencias, '2026-11-04') = '2026-11-16',
  'a cada 2 semanas, segunda e quarta: quarta da mesma semana, depois segunda de duas semanas adiante');
select pg_temp.ok(fluxo.proxima_ocorrencia(row(null,null,null,'diaria',3,null,null,current_date,null,null,1,null,null,true,null,null)::fluxo.recorrencias, '2026-11-02') = '2026-11-05', 'a cada 3 dias');
-- datas a partir de hoje: a série não cria cartões para datas que já passaram
select d as seg, d + 2 as seg_qua, d + 7 as seg1, d + 9 as seg1p, d + 14 as seg2, d + 16 as seg2p, d + 6 as dom, d + 21 as seg3, d + 70 as fim
from (select current_date + 7 + (8 - extract(dow from current_date)::int) % 7 as d) x \gset
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Relatório semanal da obra', :'seg_qua', :'analista') as kr \gset
update fluxo.tarefas set inicio = :'seg' where id = :'kr';
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'kr', :'diretor', 'acompanha');
insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (:'emp', :'kr', 'Conferir') returning id as chr \gset
insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, prazo) values (:'emp', :'chr', 'Fotos', :'seg'::date + 1);
insert into fluxo.recorrencias (empresa_id, tarefa_id, frequencia, dias_semana, prazo_dias, max_vezes)
values (:'emp', :'kr', 'semanal', array[1], 2, 3) returning id as rr \gset
select pg_temp.ok((select proxima = :'seg1' and vezes = 1 from fluxo.recorrencias where id = :'rr'), 'a próxima data sai do início do cartão de origem');
select pg_temp.falha(format($$select fluxo.gerar_recorrencias(%L)$$, :'fim'), 'só a rotina gera as ocorrências');
select pg_temp.como(:'leitor');
update fluxo.recorrencias set intervalo = 2 where id = :'rr';
reset role;
select pg_temp.ok((select intervalo = 1 from fluxo.recorrencias where id = :'rr'), 'leitura não muda a recorrência');
select pg_temp.ok(fluxo.gerar_recorrencias(:'dom') = 0, 'antes da data, nada nasce');
select pg_temp.ok(fluxo.gerar_recorrencias(:'fim') = 2, 'na data, nasce mesmo com a anterior aberta; a de origem conta como a primeira das 3');
select pg_temp.ok((select not ativa and vezes = 3 from fluxo.recorrencias where id = :'rr'), 'chegou ao número de vezes: a série encerra');
select pg_temp.ok((select string_agg(inicio || '/' || prazo, ',' order by inicio) from fluxo.tarefas where recorrencia_id = :'rr')
  = :'seg1' || '/' || :'seg1p' || ',' || :'seg2' || '/' || :'seg2p', 'cada ocorrência começa na data e o prazo vem N dias depois');
select pg_temp.ok((select bool_and(k.criado_por = :'analista' and k.responsavel_id = :'analista'
                    and exists (select 1 from fluxo.tarefa_pessoas p where p.tarefa_id = k.id and p.user_id = :'diretor' and p.papel = 'acompanha'))
                   from fluxo.tarefas k where k.recorrencia_id = :'rr'), 'a ocorrência copia quem criou, o responsável e quem acompanha');
select pg_temp.ok((select bool_and(i.concluido_em is null) and min(i.prazo) = :'seg1'::date + 1
                   from fluxo.tarefas k join fluxo.checklists c on c.tarefa_id = k.id join fluxo.checklist_itens i on i.checklist_id = c.id
                   where k.recorrencia_id = :'rr'), 'o checklist vem em aberto, com o prazo do item andando junto');
select id as kr2 from fluxo.tarefas where recorrencia_id = :'rr' order by inicio limit 1 \gset
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into fluxo.recorrencias (empresa_id, tarefa_id, frequencia) values (%L, %L, 'diaria')$$, :'emp', :'kr2'),
  'uma ocorrência não vira outra série');
update fluxo.recorrencias set ativa = true, max_vezes = null where id = :'rr';
select pg_temp.ok((select proxima = :'seg3' from fluxo.recorrencias where id = :'rr'), 'retomada, a série segue da próxima data');
update fluxo.recorrencias set dias_semana = array[1,3] where id = :'rr';
select pg_temp.ok((select proxima = :'seg2'::date + 2 from fluxo.recorrencias where id = :'rr'), 'mudar a regra recalcula a próxima a partir da última ocorrência');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, inicio)
select empresa_id, quadro_id, lista_id, 'Vistoria mensal', current_date - 60 from fluxo.tarefas where id = :'kr' returning id as kv \gset
insert into fluxo.recorrencias (empresa_id, tarefa_id, frequencia) values (:'emp', :'kv', 'diaria') returning id as rv \gset
select pg_temp.ok((select proxima = current_date + 1 from fluxo.recorrencias where id = :'rv'), 'cartão antigo: a série segue de amanhã, sem criar os dias que passaram');
update fluxo.recorrencias set ativa = false where id in (:'rr', :'rv');
reset role;
select pg_temp.ok(fluxo.gerar_recorrencias(:'fim') = 0, 'série parada não gera');
\echo '# apontamento de horas (fluxo, bloco 4)'
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Levantar certidões', current_date + 5, :'analista') as kh \gset
update fluxo.tarefas set estimativa_min = 480 where id = :'kh';
insert into fluxo.apontamentos (empresa_id, tarefa_id, minutos, nota) values (:'emp', :'kh', 90, 'Cartório');
insert into fluxo.apontamentos (empresa_id, tarefa_id, data, minutos) values (:'emp', :'kh', current_date - 1, 60) returning id as ah \gset
select pg_temp.ok((select user_id = :'analista' from fluxo.apontamentos where id = :'ah'), 'o apontamento é de quem apontou, sem aprovação');
select pg_temp.falha(format($$insert into fluxo.apontamentos (empresa_id, tarefa_id, data, minutos) values (%L, %L, current_date + 1, 30)$$, :'emp', :'kh'), 'não aponta no futuro');
select pg_temp.falha(format($$insert into fluxo.apontamentos (empresa_id, tarefa_id, minutos) values (%L, %L, 1400)$$, :'emp', :'kh'), 'mais de 24 horas no mesmo dia é recusado');
select pg_temp.falha(format($$insert into fluxo.apontamentos (empresa_id, tarefa_id, user_id, minutos) values (%L, %L, %L, 30)$$, :'emp', :'kh', :'gestor'), 'ninguém aponta horas no nome de outro');
select pg_temp.como(:'gestor');
insert into fluxo.apontamentos (empresa_id, tarefa_id, minutos) values (:'emp', :'kh', 30);
update fluxo.apontamentos set minutos = 1 where id = :'ah';
delete from fluxo.apontamentos where id = :'ah';
select pg_temp.ok((select minutos = 60 from fluxo.apontamentos where id = :'ah'), 'só o autor (ou o administrador) muda e apaga o apontamento');
select pg_temp.ok((select apontado_min = 180 and estimativa_min = 480 and (por_pessoa->>:'analista')::int = 150 from fluxo.v_tarefa_horas where tarefa_id = :'kh'),
  'a tarefa soma o apontado, por pessoa, ao lado da estimativa');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$insert into fluxo.apontamentos (empresa_id, tarefa_id, minutos) values (%L, %L, 30)$$, :'emp', :'kh'), 'leitura não aponta horas');
select pg_temp.como(:'analista');
delete from fluxo.apontamentos where id = :'ah';
select pg_temp.ok(not exists (select 1 from fluxo.apontamentos where id = :'ah'), 'o autor apaga o próprio apontamento');
\echo '# copiar cartão e modelo de cartão (fluxo, bloco 4)'
select pg_temp.como(:'analista');
select fluxo.copiar_tarefa(:'kr', pg_temp.lista(:'t1', 'Fazer'), 'Relatório semanal (cópia)') as kcp \gset
select pg_temp.ok((select titulo = 'Relatório semanal (cópia)' and criado_por = :'analista' and solicitante_id = :'analista' and inicio is null and prazo is null
                     and recorrencia_id is null and quadro_id = (select quadro_id from fluxo.listas where id = pg_temp.lista(:'t1', 'Fazer'))
                   from fluxo.tarefas where id = :'kcp'), 'a cópia vai para outro quadro, de quem copiou, sem datas nem série');
select pg_temp.ok(exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = :'kcp' and user_id = :'diretor' and papel = 'acompanha')
  and (select count(*) = 1 and bool_and(i.concluido_em is null) from fluxo.checklists c join fluxo.checklist_itens i on i.checklist_id = c.id where c.tarefa_id = :'kcp'),
  'por padrão vão pessoas e checklists em aberto');
select fluxo.copiar_tarefa(:'kr', pg_temp.lista(:'tm', 'Fazer'), null, array['etiquetas']) as kcp2 \gset
select pg_temp.ok((select titulo = 'Relatório semanal da obra' and responsavel_id is null from fluxo.tarefas where id = :'kcp2')
  and not exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = :'kcp2') and not exists (select 1 from fluxo.checklists where tarefa_id = :'kcp2'),
  'só vai o que foi marcado; sem título novo, fica o mesmo');
select pg_temp.falha(format($$select fluxo.copiar_tarefa(%L, %L)$$, :'kr', pg_temp.lista(:'tm', 'Feito')), 'a cópia não vai para a lista que conclui');
update fluxo.tarefas set modelo = true, prazo = current_date - 1 where id = :'kh';
select pg_temp.ok((select not atrasada from fluxo.v_tarefas where id = :'kh'), 'modelo de cartão não atrasa');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kh'), 'modelo de cartão não se conclui');
select pg_temp.falha(format($$update fluxo.tarefas set modelo = true where id = %L$$, :'kr'), 'cartão com recorrência não vira modelo');
select fluxo.copiar_tarefa(:'kh', pg_temp.lista(:'tm', 'Fazer')) as kcp3 \gset
select pg_temp.ok((select not modelo and estimativa_min = 480 from fluxo.tarefas where id = :'kcp3'), 'criar a partir do modelo: a cópia é um cartão comum, com a estimativa');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$select fluxo.copiar_tarefa(%L, %L)$$, :'kr', pg_temp.lista(:'tm', 'Fazer')), 'leitura não copia cartão');
\echo '# tarefas pelo funil (bloco 4)'
reset role;
select p.terreno_id as tf from app.processos p where p.status = 'ativo' and p.parte_id is null and p.empresa_id = :'emp'
  and exists (select 1 from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = p.terreno_id) limit 1 \gset
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tf', 'Conferir a minuta', current_date + 2) as kfu \gset
select pg_temp.ok((select count(*) from app.v_tarefas_funil where tarefa_id = :'kfu')
  = (select count(*) from app.processos where terreno_id = :'tf' and parte_id is null and status in ('ativo','stand_by'))
  and (select bool_and(etapa is not null and subetapa is not null) from app.v_tarefas_funil where tarefa_id = :'kfu'),
  'a tarefa aparece em cada fase aberta do terreno, com a etapa e a subetapa dele');
select pg_temp.ok(not exists (select 1 from app.v_tarefas_funil where tarefa_id = :'kcp'), 'terreno sem fase aberta fica fora da visão do funil');
select pg_temp.como(:'intruso');
select pg_temp.ok(not exists (select 1 from app.v_tarefas_funil where tarefa_id = :'kfu'), 'outra empresa não vê a visão do funil');
\echo '# automações de tarefas (fluxo, bloco 5a)'
select pg_temp.como(:'diretor');
insert into fluxo.etiquetas (empresa_id, nome, cor) values (:'emp', 'Em andamento', 'azul') returning id as ean \gset

select quadro_id as qm from fluxo.listas where id = pg_temp.lista(:'tm', 'Fazer') \gset
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes) values (%L, %L, 'X', 'criada', '[{"tipo":"arquivar"}]')$$, :'emp', :'qm'),
  'leitura não cria regra');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, nome, gatilho, acoes) values (%L, 'X', 'criada', '[{"tipo":"arquivar"}]')$$, :'emp'),
  'regra da empresa toda é só do administrador');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, gatilho_lista_id, acoes) values (%L, %L, 'X', 'entrou_lista', %L, '[{"tipo":"arquivar"}]')$$,
  :'emp', :'qm', pg_temp.lista(:'t1', 'Fazendo')), 'a lista do gatilho tem que ser do quadro da regra');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes) values (%L, %L, 'X', 'criada', %L)$$,
  :'emp', :'qm', jsonb_build_array(jsonb_build_object('tipo', 'mover', 'lista', pg_temp.lista(:'tm', 'Pausadas')))), 'regra não pausa tarefa (a pausa pede motivo)');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes) values (%L, %L, 'X', 'criada', '[{"tipo":"avisar","para":[]}]')$$, :'emp', :'qm'),
  'aviso sem destinatário é recusado');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes) values (%L, %L, 'X', 'prazo_antes', '[{"tipo":"arquivar"}]')$$, :'emp', :'qm'),
  'prazo vencendo pede os dias de antecedência');
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, gatilho_lista_id, acoes)
values (:'emp', :'qm', 'Começou a fazer', 'entrou_lista', pg_temp.lista(:'tm', 'Fazendo'),
        jsonb_build_array(jsonb_build_object('tipo', 'avisar', 'para', array['responsavel','gestor'], 'texto', 'Começou'),
                          jsonb_build_object('tipo', 'etiqueta', 'etiqueta', :'ean', 'por', true))) returning id as au1 \gset
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, gatilho_etiqueta_id, acoes)
values (:'emp', :'qm', 'Em andamento é prioridade', 'etiqueta', :'ean', '[{"tipo":"prioridade","valor":"alta"}]') returning id as au2 \gset
select pg_temp.ok((select dono_id = :'analista' from fluxo.automacoes where id = :'au1'), 'quem edita o terreno cria regra para o quadro dele e é o dono');
select pg_temp.tarefa(:'tm', 'Pedir matrícula', current_date + 10, :'analista') as ka1 \gset
select pg_temp.como(:'diretor');
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Fazendo') where id = :'ka1';
reset role;
select pg_temp.ok((select count(*) = 2 from app.notificacoes where tipo = 'automacao' and texto = 'Começou: Pedir matrícula' and destinatario_id in (:'analista', :'gestor')),
  'entrou na lista: avisa o responsável e o gestor dele');
select pg_temp.ok(exists (select 1 from fluxo.tarefa_etiquetas where tarefa_id = :'ka1' and etiqueta_id = :'ean')
  and (select resultado = 'ok' and detalhe like 'avisou 2 pessoas; pôs a etiqueta Em andamento' and user_id = :'diretor' from fluxo.automacao_execucoes where automacao_id = :'au1' and tarefa_id = :'ka1'),
  'a regra põe a etiqueta e a execução fica registrada com quem disparou');
select pg_temp.ok((select prioridade = 'media' from fluxo.tarefas where id = :'ka1') and not exists (select 1 from fluxo.automacao_execucoes where automacao_id = :'au2'),
  'o que uma regra faz não dispara outra regra');
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Pedir IPTU', current_date + 10) as ka2 \gset
insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (:'emp', :'ka2', :'ean');
select pg_temp.ok((select prioridade = 'alta' from fluxo.tarefas where id = :'ka2'), 'a etiqueta posta por uma pessoa dispara a regra');
update fluxo.automacoes set ativa = false where id = :'au2';
select pg_temp.tarefa(:'tm', 'Pedir certidão', current_date + 10) as ka3 \gset
insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (:'emp', :'ka3', :'ean');
select pg_temp.ok((select prioridade = 'media' from fluxo.tarefas where id = :'ka3'), 'regra desligada não roda');
select pg_temp.falha(format($$delete from fluxo.automacoes where id = %L$$, :'au2'), 'regra que já rodou não se apaga');
select pg_temp.como(:'gestor');
update fluxo.automacoes set nome = 'Outro nome' where id = :'au1';
select pg_temp.ok((select nome = 'Começou a fazer' from fluxo.automacoes where id = :'au1'), 'só o dono (ou o administrador) muda a regra');
-- regra da empresa: listas pelo nome, em qualquer quadro
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, nome, gatilho, gatilho_lista_id, acoes) values (%L, 'X', 'entrou_lista', %L, '[{"tipo":"arquivar"}]')$$,
  :'emp', pg_temp.lista(:'tm', 'Fazendo')), 'regra da empresa escolhe a lista pelo nome');
insert into fluxo.automacoes (empresa_id, nome, gatilho, gatilho_lista_nome, condicoes, acoes)
values (:'emp', 'Esperando retorno urgente', 'entrou_lista', 'aguardando retorno', '[{"tipo":"prioridade","valores":["alta"]}]',
        '[{"tipo":"adiar","dias":5},{"tipo":"mover","lista_nome":"Lista que não existe"}]') returning id as au3 \gset
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'t1', 'Ligar para o corretor', current_date + 3) as ka4 \gset
select pg_temp.tarefa(:'t1', 'Ligar para o dono', current_date + 3) as ka5 \gset
update fluxo.tarefas set prioridade = 'alta' where id = :'ka4';
update fluxo.tarefas set lista_id = pg_temp.lista(:'t1', 'Aguardando retorno') where id in (:'ka4', :'ka5');
select pg_temp.ok((select lista_id = pg_temp.lista(:'t1', 'Aguardando retorno') and prazo = current_date + 3 from fluxo.tarefas where id = :'ka4')
  and (select resultado = 'erro' and detalhe like '%Lista que não existe%' from fluxo.automacao_execucoes where automacao_id = :'au3' and tarefa_id = :'ka4'),
  'regra que falha registra o erro e não desfaz nada (nem o que a própria regra fez antes)');
select pg_temp.ok(not exists (select 1 from fluxo.automacao_execucoes where automacao_id = :'au3' and tarefa_id = :'ka5'), 'fora da condição, a regra não roda');
select pg_temp.como(:'diretor');
update fluxo.automacoes set acoes = '[{"tipo":"adiar","dias":5}]' where id = :'au3';
select pg_temp.como(:'analista');
update fluxo.tarefas set lista_id = pg_temp.lista(:'t1', 'Fazer') where id = :'ka4';
update fluxo.tarefas set lista_id = pg_temp.lista(:'t1', 'Aguardando retorno') where id = :'ka4';
select pg_temp.ok((select prazo = fluxo.somar_dias(:'emp', current_date + 3, 5) from fluxo.tarefas where id = :'ka4'), 'regra da empresa vale em outro quadro, pela lista com o mesmo nome');
-- cartão criado: no fim da transação, com as etiquetas já gravadas
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, condicoes, acoes)
values (:'emp', :'qm', 'Checklist do jurídico', 'criada', jsonb_build_array(jsonb_build_object('tipo', 'etiqueta', 'etiqueta', :'et', 'tem', true)),
        '[{"tipo":"checklist","nome":"Jurídico","itens":["Matrícula","Ônus"]}]') returning id as au4 \gset
begin;
select pg_temp.tarefa(:'tm', 'Diligência', current_date + 20) as ka6 \gset
insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (:'emp', :'ka6', :'et');
commit;
select pg_temp.tarefa(:'tm', 'Sem etiqueta', current_date + 20) as ka7 \gset
select pg_temp.ok((select count(*) = 2 from fluxo.checklists c join fluxo.checklist_itens i on i.checklist_id = c.id where c.tarefa_id = :'ka6' and c.nome = 'Jurídico')
  and not exists (select 1 from fluxo.checklists where tarefa_id = :'ka7'), 'cartão criado com a etiqueta ganha o checklist; sem ela, não');
select pg_temp.ok(not exists (select 1 from fluxo.automacao_execucoes e join fluxo.automacoes a on a.id = e.automacao_id where e.tarefa_id = :'ka6' and a.gatilho = 'etiqueta'),
  'a etiqueta do cartão que acabou de nascer não conta como etiqueta adicionada');
-- checklist completo leva para Feito; a conclusão pela regra não dispara as regras de concluída
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes)
values (:'emp', :'qm', 'Checklist pronto vai para Feito', 'checklist_completo', jsonb_build_array(jsonb_build_object('tipo', 'mover', 'lista', pg_temp.lista(:'tm', 'Feito')))) returning id as au5 \gset
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes)
values (:'emp', :'qm', 'Concluiu, arquiva', 'concluida', '[{"tipo":"arquivar"}]') returning id as au6 \gset
update fluxo.checklist_itens i set concluido_em = now() from fluxo.checklists c where c.id = i.checklist_id and c.tarefa_id = :'ka6' and i.texto = 'Matrícula';
select pg_temp.ok((select concluida_em is null from fluxo.tarefas where id = :'ka6'), 'com item em aberto, nada acontece');
update fluxo.checklist_itens i set concluido_em = now() from fluxo.checklists c where c.id = i.checklist_id and c.tarefa_id = :'ka6' and i.texto = 'Ônus';
select pg_temp.ok((select concluida_em is not null and arquivada_em is null from fluxo.tarefas where id = :'ka6'), 'checklist completo: a regra conclui, e a regra de concluída não roda em cadeia');
-- prazo: vence em N dias e venceu, pela rotina diária, uma vez por prazo
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, gatilho_dias, acoes)
values (:'emp', :'qm', 'Vence em 2 dias', 'prazo_antes', 2, '[{"tipo":"avisar","para":["responsavel"]}]') returning id as au7 \gset
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes)
values (:'emp', :'qm', 'Venceu', 'prazo_venceu', '[{"tipo":"prioridade","valor":"alta"}]') returning id as au8 \gset
select pg_temp.tarefa(:'tm', 'Entregar laudo', current_date + 2, :'gestor') as ka8 \gset
select pg_temp.tarefa(:'tm', 'Responder o cartório', current_date - 1) as ka9 \gset
select pg_temp.falha('select fluxo.automacoes_prazo()', 'só a rotina roda as regras de prazo');
reset role;
select fluxo.automacoes_prazo() as nprazo \gset
select pg_temp.ok((select count(*) = 1 from app.notificacoes n join fluxo.automacao_execucoes e on e.id = n.origem_id
                   where e.automacao_id = :'au7' and e.tarefa_id = :'ka8' and n.destinatario_id = :'gestor' and e.referencia = current_date + 2),
  'prazo em 2 dias: a rotina avisa o responsável');
select pg_temp.ok((select prioridade = 'alta' from fluxo.tarefas where id = :'ka9'), 'prazo vencido: a regra roda');
select pg_temp.ok(fluxo.automacoes_prazo() = 0, 'rodar de novo no mesmo dia não repete');
update fluxo.tarefas set prazo = current_date + 1 where id = :'ka8';
select pg_temp.ok(fluxo.automacoes_prazo() = 1, 'prazo mudou: a regra vale para o prazo novo');
-- quem vê
select pg_temp.como(:'intruso');
select pg_temp.ok(not exists (select 1 from fluxo.automacoes) and not exists (select 1 from fluxo.automacao_execucoes), 'outra empresa não vê regras nem execuções');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$delete from fluxo.automacoes where id = %L$$, :'au8'), 'o dono também não apaga regra que rodou: o histórico fica');
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, acoes) values (:'emp', :'qm', 'Rascunho', 'criada', '[{"tipo":"arquivar"}]') returning id as au9 \gset
update fluxo.automacoes set ativa = false where id = :'au9';
delete from fluxo.automacoes where id = :'au9';
select pg_temp.ok(not exists (select 1 from fluxo.automacoes where id = :'au9'), 'regra que nunca rodou o dono apaga');
update fluxo.automacoes set ativa = false where quadro_id = :'qm';
select pg_temp.como(:'diretor');
update fluxo.automacoes set ativa = false where quadro_id is null;
\echo '# botões e agendamentos (bloco 5b)'
select pg_temp.como(:'analista');
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, condicoes, acoes)
values (:'emp', :'qm', 'Cobrar retorno', 'botao', '[{"tipo":"situacao","valores":["aberta"]}]',
        jsonb_build_array(jsonb_build_object('tipo', 'mover', 'lista', pg_temp.lista(:'tm', 'Aguardando retorno')), '{"tipo":"adiar","dias":3}'::jsonb)) returning id as abt \gset
select pg_temp.tarefa(:'tm', 'Pedir certidão de ônus', current_date + 5, :'analista') as kb1 \gset
select pg_temp.tarefa(:'tm', 'Certidão já recebida', current_date + 5, :'analista') as kb2 \gset
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Feito') where id = :'kb2';
select pg_temp.ok(exists (select 1 from fluxo.botoes_cartao(:'kb1') where id = :'abt' and escopo = 'quadro')
  and not exists (select 1 from fluxo.botoes_cartao(:'kb2') where id = :'abt'), 'o botão aparece só nos cartões que passam nas condições');
select resultado as rbt from fluxo.apertar_botao(:'abt', :'kb1') \gset
select pg_temp.ok(:'rbt' = 'ok' and (select lista_id = pg_temp.lista(:'tm', 'Aguardando retorno') and prazo = fluxo.somar_dias(:'emp', current_date + 5, 3) from fluxo.tarefas where id = :'kb1')
  and (select user_id = :'analista' and gatilho = 'botao' from fluxo.automacao_execucoes where automacao_id = :'abt' and tarefa_id = :'kb1'),
  'apertar o botão faz as ações no cartão e registra quem apertou');
select pg_temp.falha(format($$select fluxo.apertar_botao(%L, %L)$$, :'abt', :'kb2'), 'botão que não vale para o cartão não roda');
select pg_temp.como(:'leitor');
select pg_temp.ok(not exists (select 1 from fluxo.botoes_cartao(:'kb1')), 'leitura não vê botões no cartão');
select pg_temp.falha(format($$select fluxo.apertar_botao(%L, %L)$$, :'abt', :'kb1'), 'leitura não aperta botão');
select pg_temp.como(:'analista');
update fluxo.automacoes set ativa = false where id = :'abt';
select pg_temp.ok(not exists (select 1 from fluxo.botoes_cartao(:'kb1')), 'botão desligado some do cartão');
-- agendamentos
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, agenda_freq, acoes) values (%L, %L, 'X', 'agenda', 'diaria', '[{"tipo":"arquivar"}]')$$, :'emp', :'qm'),
  'regra agendada precisa de condição');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, agenda_freq, condicoes, acoes) values (%L, %L, 'X', 'agenda', 'semanal', '[{"tipo":"situacao","valores":["aberta"]}]', '[{"tipo":"arquivar"}]')$$, :'emp', :'qm'),
  'agendamento semanal precisa dos dias');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, agenda_freq, agenda_dias, condicoes, acoes) values (%L, %L, 'X', 'agenda', 'mensal', '{32}', '[{"tipo":"situacao","valores":["aberta"]}]', '[{"tipo":"arquivar"}]')$$, :'emp', :'qm'),
  'dia do mês de 1 a 31');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, condicoes, acoes) values (%L, %L, 'X', 'botao', '[{"tipo":"situacao","valores":["parada"]}]', '[{"tipo":"arquivar"}]')$$, :'emp', :'qm'),
  'situação aberta, atrasada ou concluída');
select pg_temp.ok(fluxo.agenda_hoje('mensal', '{31}', '2027-02-28') and not fluxo.agenda_hoje('mensal', '{31}', '2027-02-27')
  and fluxo.agenda_hoje('semanal', '{1}', '2026-11-02') and not fluxo.agenda_hoje('semanal', '{1}', '2026-11-03'),
  'mensal no dia 31 roda no último dia do mês curto; semanal no dia da semana marcado');
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, agenda_freq, agenda_dias, condicoes, acoes)
values (:'emp', :'qm', 'Segunda: atrasadas sobem a prioridade', 'agenda', 'semanal', array[extract(dow from current_date + 3)::int, extract(dow from current_date + 3)::int],
        '[{"tipo":"situacao","valores":["atrasada"]}]', '[{"tipo":"prioridade","valor":"alta"}]') returning id as aag \gset
select pg_temp.ok((select cardinality(agenda_dias) = 1 from fluxo.automacoes where id = :'aag'), 'dias repetidos viram um só');
select pg_temp.tarefa(:'tm', 'Atrasada do agendamento', current_date - 1, :'analista') as kb3 \gset
select pg_temp.tarefa(:'tm', 'No prazo do agendamento', current_date + 10, :'analista') as kb4 \gset
select pg_temp.falha('select fluxo.automacoes_agenda()', 'só a rotina roda as regras agendadas');
reset role;
select fluxo.automacoes_agenda(current_date + 2) as nag \gset
select pg_temp.ok(not exists (select 1 from fluxo.automacao_execucoes where automacao_id = :'aag'), 'fora do dia marcado, a regra agendada não roda');
select app.rotina_diaria(current_date + 3) \gset
select pg_temp.ok((select prioridade = 'alta' from fluxo.tarefas where id = :'kb3') and (select prioridade = 'media' from fluxo.tarefas where id = :'kb4')
  and (select referencia = current_date + 3 from fluxo.automacao_execucoes where automacao_id = :'aag' and tarefa_id = :'kb3'),
  'no dia marcado, a rotina roda a regra nos cartões que passam nas condições');
select pg_temp.ok(fluxo.automacoes_agenda(current_date + 3) = 0, 'rodar de novo no mesmo dia não repete');
update fluxo.automacoes set ativa = false where id = :'aag';
\echo '# automações do cartão e subtarefas (30/out)'
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Cartão com regra própria', current_date + 10, :'analista') as kq1 \gset
select pg_temp.tarefa(:'tm', 'Cartão sem regra', current_date + 10, :'analista') as kq2 \gset
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, tarefa_id, nome, gatilho, acoes) values (%L, %L, 'X', 'criada', '[{"tipo":"arquivar"}]')$$, :'emp', :'kq1'),
  'regra do cartão não usa "cartão criado"');
insert into fluxo.automacoes (empresa_id, tarefa_id, nome, gatilho, gatilho_lista_id, acoes)
values (:'emp', :'kq1', 'Só neste cartão', 'entrou_lista', pg_temp.lista(:'tm', 'Fazendo'), '[{"tipo":"prioridade","valor":"alta"}]') returning id as auc \gset
select pg_temp.ok((select quadro_id = :'qm' from fluxo.automacoes where id = :'auc'), 'a regra do cartão fica no quadro do cartão');
select pg_temp.falha(format($$update fluxo.automacoes set tarefa_id = %L where id = %L$$, :'kq2', :'auc'), 'a regra não muda de cartão');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, tarefa_id, nome, gatilho, gatilho_lista_id, acoes) values (%L, %L, 'X', 'entrou_lista', %L, '[{"tipo":"arquivar"}]')$$,
  :'emp', :'kq1', pg_temp.lista(:'t1', 'Fazendo')), 'a lista da regra do cartão é do quadro dele');
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Fazendo') where id in (:'kq1', :'kq2');
select pg_temp.ok((select prioridade = 'alta' from fluxo.tarefas where id = :'kq1') and (select prioridade = 'media' from fluxo.tarefas where id = :'kq2'),
  'a regra do cartão só roda nele');
select pg_temp.como(:'leitor');
select pg_temp.falha(format($$insert into fluxo.automacoes (empresa_id, tarefa_id, nome, gatilho, acoes) values (%L, %L, 'X', 'concluida', '[{"tipo":"arquivar"}]')$$, :'emp', :'kq2'),
  'leitura não cria regra no cartão');
select pg_temp.como(:'analista');
select fluxo.copiar_tarefa(:'kq1', pg_temp.lista(:'tm', 'Fazer')) as kq3 \gset
select fluxo.copiar_tarefa(:'kq1', pg_temp.lista(:'t1', 'Fazer')) as kq4 \gset
select fluxo.copiar_tarefa(:'kq1', pg_temp.lista(:'tm', 'Fazer'), null, array['etiquetas']) as kq5 \gset
select pg_temp.ok((select gatilho_lista_id = pg_temp.lista(:'tm', 'Fazendo') and dono_id = :'analista' from fluxo.automacoes where tarefa_id = :'kq3')
  and (select gatilho_lista_id = pg_temp.lista(:'t1', 'Fazendo') from fluxo.automacoes where tarefa_id = :'kq4')
  and not exists (select 1 from fluxo.automacoes where tarefa_id = :'kq5'),
  'a cópia leva as regras do cartão; em outro quadro, a lista pelo nome; sem marcar, não vão');
-- subtarefas
select pg_temp.tarefa(:'tm', 'Levantar a matrícula', current_date + 5, :'analista') as ks1 \gset
update fluxo.tarefas set mae_id = :'kq2' where id = :'ks1';
select pg_temp.falha(format($$update fluxo.tarefas set mae_id = %L where id = %L$$, :'ks1', :'kq3'), 'subtarefa não tem subtarefa');
select pg_temp.falha(format($$update fluxo.tarefas set mae_id = %L where id = %L$$, :'kq3', :'kq2'), 'tarefa com subtarefas não vira subtarefa');
select pg_temp.falha(format($$update fluxo.tarefas set mae_id = %L where id = %L$$, :'kq4', :'kq3'), 'a mãe é do mesmo quadro');
select pg_temp.como(:'diretor');
select fluxo.salvar_regras(:'emp', true);
select pg_temp.como(:'analista');
select pg_temp.ok(fluxo.pendencias_conclusao(:'kq2') = array['subtarefas'], 'subtarefa em aberto é pendência da mãe');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kq2'), 'a mãe não conclui com subtarefa em aberto');
update fluxo.tarefas set concluida_em = now() where id = :'ks1';
update fluxo.tarefas set concluida_em = now() where id = :'kq2';
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kq2'), 'com as subtarefas concluídas, a mãe conclui');
select pg_temp.como(:'diretor');
select fluxo.salvar_regras(:'emp', false);
-- predecessora pendente: por padrão só aviso; com a regra, bloqueia (decisão do Moisés, 30/out/2026)
select pg_temp.tarefa(:'tm', 'Pedir a certidão', current_date + 3, :'analista') as kp1 \gset
select pg_temp.tarefa(:'tm', 'Analisar a certidão', current_date + 6, :'analista') as kp2 \gset
select pg_temp.tarefa(:'tm', 'Começar o estudo', current_date + 8, :'analista') as kp3 \gset
select pg_temp.tarefa(:'tm', 'Revisar o estudo', current_date + 9, :'analista') as kp4 \gset
insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, tipo) values (:'emp', :'kp1', :'kp2', 'TI'), (:'emp', :'kp3', :'kp4', 'II');
select pg_temp.ok(fluxo.predecessoras_pendentes(:'kp2') = array[(select codigo from fluxo.tarefas where id = :'kp1')], 'TI: predecessora em aberto fica pendente');
select pg_temp.ok(cardinality(fluxo.predecessoras_pendentes(:'kp4')) = 1, 'II: predecessora sem começar fica pendente');
select pg_temp.ok(not ('predecessoras' = any (fluxo.pendencias_conclusao(:'kp2'))), 'sem a regra, predecessora pendente não bloqueia');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select fluxo.salvar_regra_predecessoras(%L, true)$$, :'emp'), 'só o administrador liga o bloqueio das predecessoras');
select pg_temp.como(:'diretor');
select fluxo.salvar_regra_predecessoras(:'emp', true);
select pg_temp.como(:'analista');
select pg_temp.ok('predecessoras' = any (fluxo.pendencias_conclusao(:'kp2')), 'com a regra, vira pendência');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kp2'), 'com a regra, não conclui antes da predecessora TI');
update fluxo.tarefas set inicio = current_date where id = :'kp3';
select pg_temp.ok(cardinality(fluxo.predecessoras_pendentes(:'kp4')) = 0, 'II: com o início da predecessora chegado, libera');
update fluxo.tarefas set concluida_em = now() where id = :'kp1';
update fluxo.tarefas set concluida_em = now() where id = :'kp2';
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kp2'), 'com a predecessora concluída, a sucessora conclui');
select pg_temp.como(:'diretor');
select fluxo.salvar_regra_predecessoras(:'emp', false);
\echo '# tarefas da etapa, trava, condições e volta de etapa (lote B, 31/out)'
select pg_temp.como(:'diretor');
insert into fluxo.modelos_quadro (empresa_id, nome) values (:'emp', 'Estudos preliminares') returning id as mest \gset
insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, lista_nome, inicio_dias, duracao) values (:'emp', :'mest', 1, 'Estudo de massa', 'Fazer', 0, 5) returning id as mte1 \gset
insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, inicio_dias, duracao) values (:'emp', :'mest', 2, 'Estudo de viabilidade', 0, 10) returning id as mte2 \gset
insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, condicao) values (:'emp', :'mest', 3, 'Minuta de permuta', :'permuta') returning id as mte3 \gset
insert into fluxo.modelo_vinculos (empresa_id, modelo_id, predecessora_id, sucessora_id) values (:'emp', :'mest', :'mte1', :'mte2');
select pg_temp.falha(format($$insert into fluxo.modelo_tarefas (empresa_id, modelo_id, titulo, condicao) values (%L, %L, 'X', '{"modo":"todas","itens":[{"campo":"terreno.descricao","op":"preenchido"}]}')$$, :'emp', :'mest'),
  'a condição da tarefa do modelo só usa campo liberado para condição');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select app.salvar_regra_etapa(%L, null, '{"fase":"novos_negocios","etapa":"estudos","titulo":"X"}')$$, :'emp'), 'só o administrador cria regra de tarefas da etapa');
insert into fluxo.modelos_quadro (empresa_id, dono_id, nome) values (:'emp', :'analista', 'Meu modelo') returning id as mmeu \gset
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$select app.salvar_regra_etapa(%L, null, '{"fase":"novos_negocios","etapa":"estudos","modelo_id":"%s","titulo":"X"}')$$, :'emp', :'mest'), 'a regra cria um modelo ou uma tarefa, não os dois');
select pg_temp.falha(format($$select app.salvar_regra_etapa(%L, null, '{"fase":"novos_negocios","etapa":"estudos","modelo_id":"%s"}')$$, :'emp', :'mmeu'), 'a regra usa modelo da empresa, não de uma pessoa');
select pg_temp.falha(format($$select app.salvar_regra_etapa(%L, null, '{"fase":"novos_negocios","etapa":"estudos","subetapa":"proposta_enviada","titulo":"X"}')$$, :'emp'), 'a subetapa da regra é da etapa');
select app.salvar_regra_etapa(:'emp', null, jsonb_build_object('fase','novos_negocios','etapa','estudos','modelo_id',:'mest','trava',true)) as re1 \gset
select app.salvar_regra_etapa(:'emp', null, '{"fase":"novos_negocios","etapa":"estudos","subetapa":"estudo_viabilidade","titulo":"Cobrar o estudo do arquiteto","prazo_dias":5,"trava":true}') as re2 \gset
select app.salvar_regra_etapa(:'emp', null, jsonb_build_object('fase','novos_negocios','etapa','estudos','titulo','Conferir a permuta','condicao',:'permuta'::jsonb,'trava',true)) as re3 \gset
select app.salvar_regra_etapa(:'emp', null, '{"fase":"novos_negocios","etapa":"estudos","titulo":"Conferir o preço pedido","trava":true,"condicao":{"modo":"todas","itens":[{"campo":"oferta.valor_pedido","op":"maior","valores":[2000000]}]}}') as re4 \gset
select app.salvar_regra_etapa(:'emp', null, '{"fase":"novos_negocios","etapa":"negociacao","titulo":"Cobrar retorno da proposta","prazo_dias":5}') as re5 \gset
select pg_temp.ok((select not trava from app.etapa_regras where id = :'re5') and (select responsavel_objeto from app.etapa_regras where id = :'re5'),
  'a trava começa desligada e o responsável padrão é o do terreno');
-- condição no checklist de documentos e no pré-requisito
select app.salvar_checklist(:'emp', 'novos_negocios', 'estudos', 'matricula', true);
select pg_temp.falha(format($$select app.condicao_checklist(%L, 'novos_negocios', 'estudos', 'matricula', '{"modo":"todas","itens":[{"campo":"terreno.descricao","op":"preenchido"}]}')$$, :'emp'),
  'a condição do documento só usa campo liberado');
select app.condicao_checklist(:'emp', 'novos_negocios', 'estudos', 'matricula', :'permuta');
select app.condicao_prerequisito(:'pr1', :'permuta');
insert into fluxo.automacoes (empresa_id, nome, gatilho, gatilho_etapa, acoes)
values (:'emp', 'Negociação é prioridade', 'etapa', 'novos_negocios:negociacao', '[{"tipo":"prioridade","valor":"alta"}]') returning id as aue \gset
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno do funil', :'gestor', 'corretor', :'sp', -23.63, -46.63, pg_temp.quadra(-46.63, -23.63)) returning id as tfn \gset
select pg_temp.como(:'analista');
select (app.registrar_oferta(:'tfn', 3000000, 'dinheiro')->>'processo_id') as pfn \gset
select app.mover_etapa(:'pfn') \gset
select id as kms from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Estudo de massa' \gset
select id as kvb from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Estudo de viabilidade' \gset
select id as kpr from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Conferir o preço pedido' \gset
select pg_temp.ok((select count(*) from fluxo.tarefas where processo_id = :'pfn') = 3
  and not exists (select 1 from fluxo.tarefas where processo_id = :'pfn' and titulo in ('Minuta de permuta','Conferir a permuta')),
  'ao entrar na etapa nascem o modelo e a tarefa da regra; o que tem condição que não vale (permuta, com oferta em dinheiro) não nasce');
select pg_temp.ok((select etapa = 'estudos' and subetapa is null and inicio = current_date and prazo = current_date + 4 and responsavel_id is null from fluxo.tarefas where id = :'kms')
  and (select inicio = current_date + 5 from fluxo.tarefas where id = :'kvb') and exists (select 1 from fluxo.vinculos where predecessora_id = :'kms' and sucessora_id = :'kvb'),
  'prazos contam do dia da entrada, com as predecessoras do modelo; a tarefa fica marcada com a etapa');
select pg_temp.ok((select responsavel_id = :'gestor' from fluxo.tarefas where id = :'kpr'), 'o responsável do terreno vira a pessoa do terreno na hora');
select pg_temp.tarefa(:'tfn', 'Visitar o terreno', null, :'gestor') as kvi \gset
select pg_temp.ok((select k.processo_id = :'pfn' and k.etapa = 'estudos' and k.subetapa = p.subetapa_atual from fluxo.tarefas k join app.processos p on p.id = k.processo_id where k.id = :'kvi')
  and (select not trava and trava_nivel is null from app.v_tarefas_etapa where tarefa_id = :'kvi'),
  'a tarefa criada à mão nasce na etapa atual e não trava, mesmo com regra da etapa que trava');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, etapa) select empresa_id, id, pg_temp.lista(:'tfn', 'Fazer'), 'Sem etapa', 'nenhuma'
  from fluxo.quadros where objeto_tipo = 'terreno' and objeto_id = :'tfn' returning id as kne \gset
select pg_temp.ok((select processo_id is null and etapa is null from fluxo.tarefas where id = :'kne'), '"Nenhuma" deixa a tarefa sem etapa');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, processo_id, etapa, subetapa, prazo)
  select q.empresa_id, q.id, pg_temp.lista(:'tfn', 'Fazer'), 'Etapa escolhida', :'pfn', s.etapa, s.codigo, current_date + 2
  from fluxo.quadros q, app.subetapas_modelo s join app.processos p on p.empresa_id = s.empresa_id and p.fase = s.fase
  where q.objeto_tipo = 'terreno' and q.objeto_id = :'tfn' and p.id = :'pfn' and s.etapa <> p.etapa_atual order by s.etapa, s.ordem limit 1 returning id as kes \gset
select pg_temp.ok((select k.etapa <> p.etapa_atual and k.subetapa is not null and k.prazo = current_date + 2 from fluxo.tarefas k join app.processos p on p.id = k.processo_id where k.id = :'kes'),
  'quem cria escolhe outra etapa e subetapa da fase, com prazo');
select pg_temp.falha(format($$insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, processo_id, etapa, subetapa)
  select empresa_id, id, pg_temp.lista(%L, 'Fazer'), 'Sub errada', %L, 'estudos', 'nao_existe' from fluxo.quadros where objeto_tipo = 'terreno' and objeto_id = %L$$, :'tfn', :'pfn', :'tfn'),
  'subetapa de outra etapa é recusada');
select pg_temp.falha(format($$update fluxo.tarefas set etapa = 'projeto' where id = %L$$, :'kvi'), 'a etapa da tarefa é da fase da negociação');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(app.checar_passagem(:'pfn')->'itens') i where i->>'tipo' in ('documento','prerequisito')),
  'documento e pré-requisito com condição que não vale não entram nas pendências');
select pg_temp.ok((select not aplica from app.v_checklist where processo_id = :'pfn' and etapa = 'estudos' and tipo_documento = 'matricula'), 'o checklist diz que o documento não se aplica');
select pg_temp.ok((select count(*) from jsonb_array_elements(app.checar_passagem(:'pfn')->'itens') i where i->>'tipo' = 'tarefa') = 3
  and not exists (select 1 from jsonb_array_elements(app.checar_passagem(:'pfn')->'itens') i where i->>'tarefa_id' = :'kvi'),
  'as tarefas abertas que travam entram nas pendências do avanço; a criada à mão não');
select pg_temp.falha(format('select app.mover_etapa(%L)', :'pfn'), 'com tarefa aberta que trava, o analista não avança');
-- subetapa: a regra dela nasce e trava a saída da subetapa
select app.mover_subetapa(:'pfn', 'estudo_viabilidade') \gset
select id as kca from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Cobrar o estudo do arquiteto' \gset
select pg_temp.ok((select subetapa = 'estudo_viabilidade' and prazo = current_date + 5 from fluxo.tarefas where id = :'kca'), 'a regra da subetapa nasce ao entrar nela');
select pg_temp.falha(format('select app.mover_subetapa(%L, %L)', :'pfn', 'analise_tecnica'), 'a tarefa da subetapa trava a saída da subetapa');
update fluxo.tarefas set concluida_em = now() where id = :'kca';
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'pode_avancar' and destinatario_id = :'gestor' and texto like '%pode avançar. As tarefas de Estudo de Viabilidade%') = 1,
  'concluída a última tarefa que trava, o responsável do terreno recebe "pode avançar"');
select pg_temp.como(:'analista');
select pg_temp.ok((select subetapa_atual = 'estudo_viabilidade' from app.processos where id = :'pfn'), 'o sistema não avança sozinho');
-- a condição deixa de valer: não se aplica mais
select app.gravar_campo(:'tfn', 'oferta.valor_pedido', '1500000');
select pg_temp.ok((select situacao = 'nao_se_aplica' and not trava from app.v_tarefas_etapa where tarefa_id = :'kpr'), 'condição que deixou de valer: a tarefa fica, não trava e não se aplica mais');
select pg_temp.como(:'gestor');
select pg_temp.falha(format('select app.mover_etapa(%L, true, %L)', :'pfn', ' '), 'o gestor força só com justificativa');
select app.mover_etapa(:'pfn', true, 'Seguimos com o estudo em paralelo') \gset
select pg_temp.ok((select etapa_atual = 'negociacao' from app.processos where id = :'pfn')
  and (select forcado from app.processo_transicoes where processo_id = :'pfn' order by em desc limit 1), 'o gestor avança com justificativa, que fica no histórico');
select id as kcr from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Cobrar retorno da proposta' \gset
select pg_temp.ok((select prioridade = 'alta' and etapa = 'negociacao' from fluxo.tarefas where id = :'kcr'), 'gatilho "Terreno entrou na etapa" roda nos cartões da etapa');
select pg_temp.ok((select prioridade = 'media' from fluxo.tarefas where id = :'kvb'), 'o gatilho não toca cartão de outra etapa');
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tfn', 'Minuta da proposta', null, :'gestor') as kmp \gset
insert into fluxo.comentarios (empresa_id, tarefa_id, autor_id, texto) values (:'emp', :'kmp', :'analista', 'Primeira versão no Drive');
-- voltar de etapa
select app.mover_para_etapa(:'pfn', 'estudos', false, 'O vendedor pediu outro estudo') \gset
select pg_temp.ok((select arquivada_em is not null from fluxo.tarefas where id = :'kcr') and (select situacao = 'arquivada_auto' from app.tarefas_etapa where tarefa_id = :'kcr'),
  'voltar de etapa: tarefa sem trabalho da etapa deixada é arquivada sozinha');
select pg_temp.ok((select arquivada_em is null from fluxo.tarefas where id = :'kmp') and (select situacao = 'deixada' and not trava from app.v_tarefas_etapa where tarefa_id = :'kmp'),
  'com trabalho, a tarefa fica aberta como "Etapa deixada" e não trava');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'etapa_deixada' and destinatario_id = :'gestor') = 1, 'o responsável da tarefa deixada é avisado');
select pg_temp.como(:'analista');
select pg_temp.ok((select arquivada_em is null and concluida_em is null from fluxo.tarefas where id = :'kvb'), 'as tarefas da etapa de destino ficam como estavam');
select pg_temp.ok((select count(*) from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Estudo de massa') = 1, 'voltar à etapa não cria de novo o que já existe');
-- concluir o que trava a etapa avisa que pode avançar
update fluxo.tarefas set concluida_em = now() where id in (:'kms', :'kvi');
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'pode_avancar' and texto like '%tarefas de Estudos estão%') = 0, 'ainda com tarefa que trava, nada de aviso');
select pg_temp.como(:'analista');
update fluxo.tarefas set concluida_em = now() where id = :'kvb';
select pg_temp.como(:'gestor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'pode_avancar' and destinatario_id = :'gestor' and texto like '%tarefas de Estudos estão%') = 1, 'concluídas as tarefas da etapa, vem o aviso');
select pg_temp.como(:'analista');
select app.mover_etapa(:'pfn') \gset
select pg_temp.ok((select arquivada_em is null and prazo = current_date + 5 from fluxo.tarefas where id = :'kcr')
  and (select count(*) from fluxo.tarefas where processo_id = :'pfn' and titulo = 'Cobrar retorno da proposta') = 1,
  'de volta à etapa, a arquivada sozinha volta com o mesmo código e o prazo refeito, sem duplicar');
select pg_temp.ok((select situacao = 'ativa' from app.v_tarefas_etapa where tarefa_id = :'kmp'), 'a deixada volta a valer na etapa');
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kms'), 'concluída continua concluída');
-- Stand By pausa as tarefas da fase; a retomada devolve
select app.tarefas_abertas_fase(:'pfn') as nab \gset
select pg_temp.falha(format($$select app.encerrar_processo(%L, 'stand_by', p_detalhe => 'x', p_retomar_em => current_date + 30, p_tarefas => 'manter')$$, :'pfn'),
  'arquivar ou manter as tarefas é só de Perdido e Descartado');
select app.encerrar_processo(:'pfn', 'stand_by', p_detalhe => 'Proprietário em inventário', p_retomar_em => current_date + 30) \gset
select pg_temp.ok((select count(*) from fluxo.pausas z join fluxo.tarefas k on k.id = z.tarefa_id where k.processo_id = :'pfn' and z.situacao = 'ativa' and z.origem = 'stand_by') = :nab
  and (select lista_nome = 'Pausadas' from fluxo.v_tarefas where id = :'kcr'), 'Stand By pausa as tarefas abertas da fase, sem pedido');
select pg_temp.ok(not exists (select 1 from fluxo.pausas where tarefa_id = :'kne'), 'tarefa sem etapa não é pausada');
select pg_temp.falha(format('select fluxo.retomar(%L)', :'kcr'), 'tarefa pausada pelo Stand By só volta com a negociação');
select app.retomar_processo(:'pfn');
select pg_temp.ok((select lista_nome <> 'Pausadas' from fluxo.v_tarefas where id = :'kcr')
  and not exists (select 1 from fluxo.pausas z join fluxo.tarefas k on k.id = z.tarefa_id where k.processo_id = :'pfn' and z.situacao = 'ativa'),
  'retomada a negociação, as tarefas voltam para a lista de antes');
-- Perdido arquiva as tarefas abertas da fase (padrão)
select app.encerrar_processo(:'pfn', 'perdido', 'sem_retorno', 'O proprietário parou de responder') \gset
select pg_temp.ok(not exists (select 1 from fluxo.tarefas where processo_id = :'pfn' and concluida_em is null and arquivada_em is null)
  and (select arquivada_em is null from fluxo.tarefas where id = :'kne'), 'Perdido arquiva as tarefas abertas da fase; as sem etapa ficam');
select pg_temp.como(:'diretor');
select pg_temp.ok(app.apagar_regra_etapa(:'re5') = 'desativada' and app.apagar_regra_etapa(:'re3') = 'apagada', 'regra que já criou tarefa só se desliga');
select app.condicao_prerequisito(:'pr1', null);
update fluxo.automacoes set ativa = false where id = :'aue';
-- =====================================================================
-- Formulário da tarefa e máscaras (decisões do Moisés, 1/nov/2026)
-- =====================================================================
select pg_temp.ok(fluxo.validar_formato('cpf', '529.982.247-25') = '52998224725', 'CPF válido fica só com os dígitos');
select pg_temp.falha($$select fluxo.validar_formato('cpf', '529.982.247-24')$$, 'CPF com dígito verificador errado é recusado');
select pg_temp.falha($$select fluxo.validar_formato('cpf', '111.111.111-11')$$, 'CPF de dígitos repetidos é recusado');
select pg_temp.ok(fluxo.validar_formato('cnpj', '11.222.333/0001-81') = '11222333000181', 'CNPJ válido fica só com os dígitos');
select pg_temp.falha($$select fluxo.validar_formato('cnpj', '11.222.333/0001-82')$$, 'CNPJ com dígito verificador errado é recusado');
select pg_temp.ok(fluxo.validar_formato('email', ' Ana.Souza@BKM.com.br ') = 'ana.souza@bkm.com.br', 'e-mail fica em minúsculas');
select pg_temp.falha($$select fluxo.validar_formato('email', 'ana@bkm')$$, 'e-mail sem domínio completo é recusado');
select pg_temp.ok(fluxo.validar_formato('telefone', '(11) 98765-4321') = '11987654321' and fluxo.validar_formato('telefone', '(12) 3456-7890') = '1234567890',
  'telefone com DDD, fixo ou celular, fica só com os dígitos');
select pg_temp.falha($$select fluxo.validar_formato('telefone', '(11) 88765-4321')$$, 'celular de 11 dígitos começa com 9');
select pg_temp.falha($$select fluxo.validar_formato('telefone', '98765-4321')$$, 'telefone sem DDD é recusado');
select pg_temp.ok(fluxo.formas('lista', 3) = array['menu','radio','chips','segmentado'] and fluxo.formas('lista', 2) @> array['chave']
  and fluxo.formas('lista', 7) = array['menu'] and fluxo.formas('sim_nao') = array['botoes','chave'] and fluxo.formas('numero') = array['campo'],
  'formas por tipo: segmentado até 4 opções, chave com 2, acima de 6 só o menu');
select pg_temp.ok((select formato from app.v_campos where empresa_id = :'emp' and chave = 'oferta.valor_pedido') = 'moeda'
  and (select formato from app.v_campos where empresa_id = :'emp' and chave = 'terreno.cep') = 'cep', 'o catálogo traz a máscara fixa (moeda, CEP)');
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tcd', 'Visita técnica ao terreno', null, :'analista') as kf \gset
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, tipo, pergunta, resposta) values (:'emp', :'kf', 'telefone', 'Telefone do zelador', '"(12) 3456-7890"');
select pg_temp.ok((select resposta #>> '{}' from fluxo.tarefa_itens where tarefa_id = :'kf' and tipo = 'telefone') = '1234567890',
  'pergunta só no cartão: a resposta com máscara fica guardada só com os dígitos');
select pg_temp.falha(format($$update fluxo.tarefa_itens set resposta = '"3456"' where tarefa_id = %L and tipo = 'telefone'$$, :'kf'), 'resposta fora da máscara é recusada');
select pg_temp.falha(format($$update fluxo.tarefa_itens set tipo = 'texto' where tarefa_id = %L and tipo = 'telefone'$$, :'kf'), 'pergunta com resposta não muda de tipo');
select pg_temp.falha(format($$insert into fluxo.tarefa_itens (empresa_id, tarefa_id, tipo) values (%L, %L, 'texto')$$, :'emp', :'kf'), 'pergunta só no cartão precisa do texto da pergunta');
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, tipo, pergunta, opcoes, forma) values (:'emp', :'kf', 'lista', 'Muro de divisa', '{Bom,Ruim}', 'chave') returning id as imuro \gset
select pg_temp.falha(format($$update fluxo.tarefa_itens set forma = 'caixas' where id = %L$$, :'imuro'), 'forma que não serve ao tipo é recusada');
select pg_temp.falha(format($$update fluxo.tarefa_itens set resposta = '"Caído"' where id = %L$$, :'imuro'), 'resposta de lista só entre as opções');
update fluxo.tarefa_itens set resposta = '"Ruim"' where id = :'imuro';
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, pergunta, ajuda, forma) values (:'emp', :'kf', 'terreno.situacao_ocupacao', 'Como está a ocupação hoje?', 'Veja se há inquilino', 'chips');
select pg_temp.ok((select pergunta = 'Como está a ocupação hoje?' and forma = 'chips' from fluxo.tarefa_itens where tarefa_id = :'kf' and chave = 'terreno.situacao_ocupacao'),
  'pergunta ligada a campo do terreno guarda o texto, a ajuda e a forma');
select pg_temp.falha(format($$update fluxo.tarefa_itens set forma = 'chave' where tarefa_id = %L and chave = 'terreno.situacao_ocupacao'$$, :'kf'),
  'chave só em lista de duas opções');
insert into fluxo.tarefa_itens (empresa_id, tarefa_id, tipo, pergunta, regra_branco) values (:'emp', :'kf', 'paragrafo', 'Observações da visita', 'justificativa') returning id as iobs \gset
select pg_temp.ok((select tipo = 'pergunta' and nome = 'Observações da visita' and regra = 'justificativa' from fluxo.itens_em_branco(:'kf')),
  'pergunta em branco com regra entra no que falta para concluir, pelo texto da pergunta');
update fluxo.tarefa_itens set resposta = '"Muro caído no fundo"' where id = :'iobs';
select pg_temp.ok(not exists (select 1 from fluxo.itens_em_branco(:'kf')), 'respondida, a pergunta sai do que falta');
select fluxo.copiar_tarefa(:'kf', pg_temp.lista(:'tcd', 'Fazer'), 'Visita técnica (cópia)', array['campos']) as kfc \gset
select pg_temp.ok((select count(*) from fluxo.tarefa_itens where tarefa_id = :'kfc') = 4
  and (select resposta #>> '{}' from fluxo.tarefa_itens where tarefa_id = :'kfc' and pergunta = 'Muro de divisa') = 'Ruim',
  'copiar o cartão com os campos leva as perguntas e as respostas');
select pg_temp.como(:'diretor');
insert into fluxo.campos (empresa_id, nome, tipo, formato) values (:'emp', 'CPF do vendedor', 'texto', 'cpf') returning id as ccpf \gset
select pg_temp.falha(format($$insert into fluxo.campos (empresa_id, nome, tipo, formato) values (%L, 'Valor X', 'numero', 'email')$$, :'emp'), 'número não leva máscara de texto');
select pg_temp.como(:'analista');
insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, texto) values (:'emp', :'kf', :'ccpf', '529.982.247-25');
select pg_temp.ok((select texto from fluxo.tarefa_campos where tarefa_id = :'kf' and campo_id = :'ccpf') = '52998224725', 'campo personalizado com máscara guarda só os dígitos');
select pg_temp.falha(format($$update fluxo.tarefa_campos set texto = '123' where tarefa_id = %L and campo_id = %L$$, :'kf', :'ccpf'), 'campo personalizado recusa valor fora da máscara');
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$select app.salvar_campo(%L, 'terreno.area_documental_m2', null, true, true, 'cpf')$$, :'emp'), 'máscara de texto só em campo de texto');
select pg_temp.falha(format($$select app.salvar_campo(%L, 'terreno.cep', null, false, false, 'telefone')$$, :'emp'), 'campo com máscara fixa não troca de máscara');
select app.salvar_campo(:'emp', 'terreno.referencia_localizacao', null, false, true, 'telefone');
select pg_temp.ok((select formato from app.v_campos where empresa_id = :'emp' and chave = 'terreno.referencia_localizacao') = 'telefone', 'o administrador dá máscara ao campo de texto');
select pg_temp.como(:'analista');
select app.gravar_campo(:'tcd', 'terreno.referencia_localizacao', '"(11) 3333-4444"');
select pg_temp.ok((select referencia_localizacao from app.terrenos where id = :'tcd') = '1133334444', 'o cartão grava o campo do terreno com a máscara, só os dígitos');
select pg_temp.falha(format($$select app.gravar_campo(%L, 'terreno.referencia_localizacao', '"perto da padaria"')$$, :'tcd'), 'o terreno recusa valor fora da máscara do campo');
select pg_temp.como(:'diretor');
select app.salvar_campo(:'emp', 'terreno.referencia_localizacao', null, false, false, '');

-- ---------------------------------------------------------------------
-- Jornada do terreno (1/nov/2026): perguntas e campos por etapa e subetapa,
-- campos novos do terreno, regra de cada item e regras pelo valor
-- ---------------------------------------------------------------------
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$select app.salvar_campo_terreno(%L, null, '{"titulo":"Perfil topográfico","tipo":"texto"}')$$, :'emp'), 'o campo novo não repete o título de um campo do catálogo');
select pg_temp.falha(format($$select app.salvar_campo_terreno(%L, null, '{"titulo":"Uma opção","tipo":"lista","opcoes":["Só"]}')$$, :'emp'), 'campo de lista precisa de ao menos duas opções');
select app.salvar_campo_terreno(:'emp', null, '{"titulo":"Recuo frontal atende","tipo":"lista","opcoes":["Sim","Não","A verificar"]}') as cjr \gset
select app.salvar_campo_terreno(:'emp', null, '{"titulo":"Área demolir estimada","tipo":"numero","unidade":"m²"}') as cjd \gset
select 'personalizado.' || codigo as kjr from app.campos_terreno where id = :'cjr' \gset
select 'personalizado.' || codigo as kjd from app.campos_terreno where id = :'cjd' \gset
select pg_temp.ok((select tipo = 'lista' and condicao and cartao from app.v_campos where empresa_id = :'emp' and chave = :'kjr'),
  'o campo novo do terreno entra no catálogo da empresa, liberado para condição e cartão');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select app.salvar_item_jornada(%L, null, '{"fase":"novos_negocios","etapa":"triagem","campo":"terreno.situacao_ocupacao"}')$$, :'emp'), 'só o administrador monta a jornada');
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$select app.salvar_item_jornada(%L, null, '{"fase":"novos_negocios","etapa":"triagem","campo":"terreno.situacao_ocupacao","forma":"chave"}')$$, :'emp'),
  'a forma de responder segue o tipo do campo (chave só com duas opções)');
select pg_temp.falha(format($$select app.salvar_item_jornada(%L, null, '{"fase":"novos_negocios","etapa":"triagem","subetapa":"estudo_massa","campo":"terreno.situacao_ocupacao"}')$$, :'emp'),
  'a subetapa do item é da etapa');
select app.salvar_item_jornada(:'emp', null, '{"fase":"novos_negocios","etapa":"triagem","campo":"terreno.situacao_ocupacao","pergunta":"Como é o terreno?","forma":"chips"}') as ij1 \gset
select pg_temp.falha(format($$select app.salvar_item_jornada(%L, null, '{"fase":"novos_negocios","etapa":"triagem","campo":"terreno.situacao_ocupacao"}')$$, :'emp'), 'o mesmo campo não entra duas vezes no mesmo lugar');
select app.salvar_item_jornada(:'emp', null, jsonb_build_object('fase','novos_negocios','etapa','triagem','subetapa','aguardando_informacoes','campo',:'kjr','regra','justifica')) as ij2 \gset
select app.salvar_item_jornada(:'emp', null, jsonb_build_object('fase','novos_negocios','etapa','triagem','subetapa','aguardando_informacoes','campo',:'kjd',
  'condicao', '{"modo":"todas","itens":[{"campo":"terreno.necessidade_demolicao","op":"em","valores":["confirmada"]}]}'::jsonb)) as ij3 \gset
select app.salvar_item_jornada(:'emp', null, '{"fase":"novos_negocios","etapa":"triagem","campo":"terreno.uso_atual","regra":"livre"}') as ij4 \gset
select pg_temp.falha(format($$select app.salvar_regra_jornada(%L, null, '{"fase":"novos_negocios","etapa":"triagem","acao":"bloqueia","mensagem":"X"}')$$, :'emp'), 'a regra pelo valor precisa de condição');
select app.salvar_regra_jornada(:'emp', null, '{"fase":"novos_negocios","etapa":"triagem","acao":"bloqueia","mensagem":"Terreno irregular: refazer a análise",
  "condicao":{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"em","valores":["ocupado"]}]}}') as rj1 \gset
select app.salvar_regra_jornada(:'emp', null, '{"fase":"novos_negocios","etapa":"triagem","acao":"diretor","mensagem":"Declive: o diretor aprova",
  "condicao":{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"em","valores":["parcialmente_ocupado"]}]}}') as rj2 \gset
select app.salvar_regra_jornada(:'emp', null, jsonb_build_object('fase','novos_negocios','etapa','triagem','acao','avisa','mensagem','Recuo a verificar com o arquiteto',
  'condicao', jsonb_build_object('modo','todas','itens', jsonb_build_array(jsonb_build_object('campo', :'kjr', 'op', 'em', 'valores', jsonb_build_array('A verificar')))))) as rj3 \gset
select app.salvar_checklist(:'emp', 'novos_negocios', 'triagem', 'iptu', null, null, 'justifica');
select pg_temp.ok((select regra = 'justifica' and obrigatorio from app.checklist_modelo where empresa_id = :'emp' and fase = 'novos_negocios' and etapa = 'triagem' and tipo_documento = 'iptu'),
  'o documento da jornada ganha a regra (avança com justificativa conta como exigido)');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno da jornada', :'gestor', 'corretor', :'sp', -23.64, -46.64, pg_temp.quadra(-46.64, -23.64)) returning id as tjn \gset
select pg_temp.como(:'analista');
select (app.registrar_oferta(:'tjn', 2500000, 'dinheiro')->>'processo_id') as pjn \gset
select app.checar_passagem(:'pjn') as cj1 \gset
select pg_temp.ok((select count(*) from jsonb_array_elements(:'cj1'::jsonb->'itens') i where i->>'tipo' = 'jornada') = 2
  and exists (select 1 from jsonb_array_elements(:'cj1'::jsonb->'itens') i where i->>'texto' = 'Como é o terreno?: não informado' and not (i->>'justifica')::boolean)
  and exists (select 1 from jsonb_array_elements(:'cj1'::jsonb->'itens') i where i->>'campo' = :'kjr' and (i->>'justifica')::boolean)
  and not exists (select 1 from jsonb_array_elements(:'cj1'::jsonb->'itens') i where i->>'campo' in (:'kjd', 'terreno.uso_atual')),
  'sair da etapa pede os itens da etapa e das subetapas; condição que não vale e item livre não travam');
select pg_temp.ok(not (:'cj1'::jsonb->>'pode_justificar')::boolean and not (:'cj1'::jsonb->>'pode_forcar')::boolean,
  'com item que bloqueia, o analista não passa nem justificando');
select pg_temp.ok((select count(*) = 4 and count(*) filter (where (x->>'aplica')::boolean) = 3 from jsonb_array_elements(app.jornada_processo(:'pjn')->'itens') x),
  'a jornada da etapa mostra todos os itens e diz quais valem agora');
select pg_temp.falha(format($$select app.mover_subetapa(%L, 'aguardando_documentos')$$, :'pjn'), 'sair da subetapa sem a resposta trava');
select pg_temp.falha(format($$select app.mover_subetapa(%L, 'aguardando_documentos', true, '')$$, :'pjn'), 'passar sem a resposta pede justificativa');
select app.mover_subetapa(:'pjn', 'aguardando_documentos', true, 'O arquiteto responde na visita') \gset
select pg_temp.ok((select subetapa_atual = 'aguardando_documentos' from app.processos where id = :'pjn')
  and (select forcado and comentario = 'O arquiteto responde na visita' from app.processo_transicoes where processo_id = :'pjn' order by em desc, id desc limit 1),
  'item que pede justificativa: o analista passa justificando, e fica no histórico');
select pg_temp.falha(format($$select app.gravar_campo(%L, %L, '"Talvez"')$$, :'tjn', :'kjr'), 'o campo novo de lista só aceita as opções');
select pg_temp.falha(format($$select app.gravar_campo(%L, %L, '"muito"')$$, :'tjn', :'kjd'), 'o campo novo de número recusa texto');
select app.gravar_campo(:'tjn', :'kjr', '"A verificar"');
select app.gravar_campo(:'tjn', 'terreno.necessidade_demolicao', '"confirmada"');
select app.gravar_campo(:'tjn', 'terreno.situacao_ocupacao', '"ocupado"');
select pg_temp.ok((select valor #>> '{}' = 'A verificar' from app.terreno_valores where terreno_id = :'tjn' and campo_id = :'cjr')
  and (app.campo_cartao(:'tjn', :'kjr')->>'valor') = 'A verificar',
  'a resposta grava no próprio terreno (fonte única: ficha, cartão e jornada leem o mesmo valor)');
select app.checar_passagem(:'pjn') as cj2 \gset
select pg_temp.ok(exists (select 1 from jsonb_array_elements(:'cj2'::jsonb->'itens') i where i->>'tipo' = 'regra_valor' and not (i->>'ok')::boolean and i->>'texto' = 'Terreno irregular: refazer a análise')
  and exists (select 1 from jsonb_array_elements(:'cj2'::jsonb->'itens') i where i->>'tipo' = 'regra_valor' and (i->>'aviso')::boolean and (i->>'ok')::boolean)
  and exists (select 1 from jsonb_array_elements(:'cj2'::jsonb->'itens') i where i->>'campo' = :'kjd' and not (i->>'ok')::boolean),
  'regra pelo valor trava ou só avisa; o item condicional entra quando a condição passa a valer');
select app.gravar_campo(:'tjn', :'kjd', '"350"');
select app.gravar_campo(:'tjn', 'terreno.situacao_ocupacao', '"parcialmente_ocupado"');
select pg_temp.falha(format($$select app.mover_etapa(%L)$$, :'pjn'), 'o documento que pede justificativa ainda trava sem ela');
select app.checar_passagem(:'pjn') as cj3 \gset
select pg_temp.ok((:'cj3'::jsonb->>'pode_justificar')::boolean and (:'cj3'::jsonb->'aprovacoes') ? 'diretor',
  'só falta o que pede justificativa; o declive pede o diretor');
select app.mover_etapa(:'pjn', true, 'O vendedor manda o IPTU esta semana') as mj \gset
select pg_temp.ok(:'mj'::jsonb->>'resultado' = 'aguardando_aprovacao'
  and exists (select 1 from app.aprovacoes where processo_id = :'pjn' and status = 'pendente' and nivel = 'diretor'),
  'a regra pelo valor vira pedido de aprovação do diretor');
select pg_temp.como(:'diretor');
select app.decidir_aprovacao((select pedido_id from app.aprovacoes where processo_id = :'pjn' and status = 'pendente' limit 1), true, 'Declive suave, ok');
select pg_temp.ok((select etapa_atual = 'estudos' from app.processos where id = :'pjn'), 'aprovado, o terreno avança');
select app.apagar_campo_terreno(:'cjd') as aj \gset
select pg_temp.ok(:'aj' = 'desativado' and (select not ativo from app.campos_terreno where id = :'cjd'), 'campo novo com valor não se apaga: desativa');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select app.gravar_campo(%L, %L, '"10"')$$, :'tjn', :'kjd'), 'campo desativado não grava');
select pg_temp.como(:'diretor');
select app.apagar_item_jornada(:'ij4');
select pg_temp.ok(not exists (select 1 from app.jornada_itens where id = :'ij4'), 'tirar da jornada apaga o item; o valor fica no terreno');
-- Regra em branco com 3 opções em todo item e comportamento condicional (1/nov/2026)
select pg_temp.falha(format($$select app.salvar_item_jornada(%L, %L, '{"regra_cond":[{"regra":"livre"}]}')$$, :'emp', :'ij1'), 'comportamento condicional precisa de condição');
select pg_temp.falha(format($$select app.salvar_item_jornada(%L, %L, '{"regra_cond":[{"regra":"talvez","condicao":{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"em","valores":["vazio"]}]}}]}')$$, :'emp', :'ij1'),
  'comportamento condicional só com Pode avançar, Avança com justificativa ou Não avança');
select app.salvar_item_jornada(:'emp', :'ij1', '{"regra_cond":[
  {"regra":"justifica","condicao":{"modo":"todas","itens":[{"campo":"terreno.necessidade_demolicao","op":"em","valores":["confirmada"]}]}},
  {"regra":"livre","condicao":{"modo":"todas","itens":[{"campo":"terreno.necessidade_demolicao","op":"em","valores":["dispensada"]}]}}]}');
select app.salvar_checklist(:'emp', 'novos_negocios', 'triagem', 'iptu', null, null, 'justifica',
  '[{"regra":"livre","condicao":{"modo":"todas","itens":[{"campo":"terreno.necessidade_demolicao","op":"em","valores":["dispensada"]}]}}]');
select pg_temp.ok((select regra = 'bloqueia' and jsonb_array_length(regra_cond) = 2 from app.jornada_itens where id = :'ij1')
  and (select regra = 'justifica' and jsonb_array_length(regra_cond) = 1 from app.checklist_modelo where empresa_id = :'emp' and fase = 'novos_negocios' and etapa = 'triagem' and tipo_documento = 'iptu'),
  'a pergunta e o documento guardam o comportamento único e o condicional');
select app.salvar_checklist(:'emp', 'novos_negocios', 'triagem', 'iptu', null, null, 'justifica');
select pg_temp.ok((select jsonb_array_length(regra_cond) = 1 from app.checklist_modelo where empresa_id = :'emp' and fase = 'novos_negocios' and etapa = 'triagem' and tipo_documento = 'iptu'),
  'salvar o documento sem a regra condicional a mantém');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno da regra condicional', :'gestor', 'corretor', :'sp', -23.66, -46.66, pg_temp.quadra(-46.66, -23.66)) returning id as tjc \gset
select pg_temp.como(:'analista');
select (app.registrar_oferta(:'tjc', 1800000, 'dinheiro')->>'processo_id') as pjc \gset
select app.checar_passagem(:'pjc') as cc1 \gset
select pg_temp.ok(exists (select 1 from jsonb_array_elements(:'cc1'::jsonb->'itens') i where i->>'campo' = 'terreno.situacao_ocupacao' and not (i->>'justifica')::boolean),
  'nenhuma condição vale: vale o comportamento único (não avança)');
select app.gravar_campo(:'tjc', 'terreno.necessidade_demolicao', '"confirmada"');
select app.checar_passagem(:'pjc') as cc2 \gset
select pg_temp.ok(exists (select 1 from jsonb_array_elements(:'cc2'::jsonb->'itens') i where i->>'campo' = 'terreno.situacao_ocupacao' and (i->>'justifica')::boolean)
  and (select regra_efetiva = 'justifica' from jsonb_to_recordset(app.jornada_processo(:'pjc')->'itens') x(id uuid, regra_efetiva text) where x.id = :'ij1'),
  'a condição que vale decide: avança com justificativa');
select app.gravar_campo(:'tjc', 'terreno.necessidade_demolicao', '"dispensada"');
select app.checar_passagem(:'pjc') as cc3 \gset
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(:'cc3'::jsonb->'itens') i where i->>'campo' = 'terreno.situacao_ocupacao')
  and not exists (select 1 from jsonb_array_elements(:'cc3'::jsonb->'itens') i where i->>'tipo' = 'documento' and i->>'texto' like 'IPTU%'),
  'com "pode avançar" pela condição, a pergunta e o documento não travam');
select pg_temp.como(:'diretor');
select id as prj from app.prerequisitos_modelo where empresa_id = :'emp' limit 1 \gset
select app.regra_prerequisito(:'prj', 'livre');
select pg_temp.ok((select regra = 'livre' from app.prerequisitos_modelo where id = :'prj'), 'o pré-requisito também pode ser "pode avançar"');
select app.regra_prerequisito(:'prj', 'bloqueia', '[]');
select app.salvar_regra_etapa(:'emp', null, '{"fase":"novos_negocios","etapa":"contrato","titulo":"Conferir a minuta","regra":"justifica"}') as rej \gset
select app.salvar_regra_etapa(:'emp', null, '{"fase":"novos_negocios","etapa":"contrato","titulo":"Conferir o registro","trava":false,
  "regra_cond":[{"regra":"bloqueia","condicao":{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"em","valores":["ocupado"]}]}}]}') as rek \gset
select pg_temp.ok((select regra = 'justifica' and trava from app.etapa_regras where id = :'rej')
  and (select regra = 'livre' and trava and jsonb_array_length(regra_cond) = 1 from app.etapa_regras where id = :'rek'),
  'a tarefa da etapa ganha as 3 opções e o comportamento condicional');
select count(*) as nte from jsonb_array_elements(app.checar_passagem(:'pjn')->'itens') i where i->>'tipo' = 'tarefa' \gset
select count(app.salvar_regra_etapa(:'emp', id, '{"regra":"justifica"}')) from app.etapa_regras where empresa_id = :'emp' and fase = 'novos_negocios' and etapa = 'estudos' and trava and ativo;
select pg_temp.ok(:nte > 0 and (select bool_and((i->>'justifica')::boolean) from jsonb_array_elements(app.checar_passagem(:'pjn')->'itens') i where i->>'tipo' = 'tarefa'),
  'tarefa aberta de regra "avança com justificativa" entra como pendência que se justifica');
select count(app.salvar_regra_etapa(:'emp', id, '{"regra":"bloqueia"}')) from app.etapa_regras where empresa_id = :'emp' and fase = 'novos_negocios' and etapa = 'estudos' and trava and ativo;

-- ---------------------------------------------------------------------
\echo '# brechas fechadas na revisão de 2/nov/2026'
-- 1. aprovadores: só quem gerencia o cartão, e nunca com pedido aberto
select pg_temp.como(:'gestor');
select pg_temp.tarefa(:'tm', 'Aprovar a minuta', current_date + 5) as kap \gset
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'kap', :'diretor', 'aprovador');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$delete from fluxo.tarefa_pessoas where tarefa_id = %L and papel = 'aprovador'$$, :'kap'), 'o editor não tira o aprovador para concluir sem aprovação');
select pg_temp.falha(format($$update fluxo.tarefa_pessoas set user_id = %L where tarefa_id = %L and papel = 'aprovador'$$, :'analista', :'kap'), 'o editor não se põe no lugar do aprovador');
select pg_temp.falha(format($$insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (%L, %L, %L, 'aprovador')$$, :'emp', :'kap', :'analista'), 'o editor não se inclui como aprovador');
select pg_temp.falha(format($$update fluxo.tarefas set concluida_em = now() where id = %L$$, :'kap'), 'e o cartão continua sem concluir sem a aprovação');
insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'kap', :'gestor', 'acompanha');
select pg_temp.ok(exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = :'kap' and user_id = :'gestor' and papel = 'acompanha'), 'as outras pessoas do cartão o editor continua pondo');
select pg_temp.como(:'gestor');
select fluxo.pedir_aprovacao(:'kap') is not null as ped \gset
select pg_temp.falha(format($$delete from fluxo.tarefa_pessoas where tarefa_id = %L and papel = 'aprovador'$$, :'kap'), 'com o pedido aberto, nem quem criou muda os aprovadores');
select pg_temp.como(:'diretor');
select fluxo.decidir_aprovacao((select id from fluxo.aprovacoes where tarefa_id = :'kap' and situacao = 'pendente'), false, 'Falta a cláusula de permuta');
select pg_temp.como(:'gestor');
delete from fluxo.tarefa_pessoas where tarefa_id = :'kap' and papel = 'aprovador';
select pg_temp.ok(not exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = :'kap' and papel = 'aprovador'), 'sem pedido aberto, quem criou o cartão muda os aprovadores');

-- 2. quem criou, código e quem concluiu não mudam pela tela
select pg_temp.tarefa(:'tm', 'Cartão do gestor', current_date + 5) as kcg \gset
select codigo as kcg_cod from fluxo.tarefas where id = :'kcg' \gset
select pg_temp.como(:'analista');
update fluxo.tarefas set criado_por = :'analista', codigo = 'TAR-999999' where id = :'kcg';
select pg_temp.ok((select criado_por = :'gestor' and codigo = :'kcg_cod' from fluxo.tarefas where id = :'kcg'), 'o editor não vira quem criou o cartão nem troca o código');
select pg_temp.ok(fluxo.papel_tarefa(:'kcg') = 'editor', 'e continua só editor do cartão');
select pg_temp.falha(format($$update fluxo.tarefas set visibilidade = 'individual' where id = %L$$, :'kcg'), 'por isso não esconde o cartão de quem o criou');
update fluxo.tarefas set concluida_em = now() where id = :'kcg';
update fluxo.tarefas set concluida_por = :'gestor', concluida_em = now() - interval '3 days' where id = :'kcg';
select pg_temp.ok((select concluida_por = :'analista' and concluida_em > now() - interval '1 hour' from fluxo.tarefas where id = :'kcg'), 'quem concluiu e quando ficam como o sistema gravou');

-- 7. automações: arquivar e trocar o responsável funcionam
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, gatilho_lista_id, acoes)
values (:'emp', :'qm', 'Retorno passa ao gestor', 'entrou_lista', pg_temp.lista(:'tm', 'Aguardando retorno'),
        jsonb_build_array(jsonb_build_object('tipo', 'responsavel', 'pessoa', :'gestor'), jsonb_build_object('tipo', 'arquivar'))) returning id as aur \gset
select pg_temp.tarefa(:'tm', 'Esperar o cartório', current_date + 5, :'analista') as kar \gset
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Aguardando retorno') where id = :'kar';
reset role;
select pg_temp.ok((select responsavel_id = :'gestor' and arquivada_em is not null from fluxo.tarefas where id = :'kar')
  and (select resultado = 'ok' and detalhe = 'trocou o responsável; arquivou' from fluxo.automacao_execucoes where automacao_id = :'aur' and tarefa_id = :'kar'),
  'a automação troca o responsável e arquiva (antes as duas ações davam erro)');

-- 6. lembrete de cartão Restrito: só quem vê o cartão
select pg_temp.como(:'gestor');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, visibilidade, prazo)
values (:'emp', :'qm', pg_temp.lista(:'tm', 'Fazer'), 'Proposta sigilosa', 'restrito', current_date + 5) returning id as krs \gset
select pg_temp.como(:'analista');
select pg_temp.ok(not exists (select 1 from app.lembretes where origem_id = :'krs'), 'quem não vê o cartão não vê os lembretes dele');
select pg_temp.falha(format($$insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes) values (%L, 'tarefas', %L, 10)$$, :'emp', :'krs'),
  'nem grava lembrete para um cartão que não vê');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes, destinatario_id) values (%L, 'tarefas', %L, 10, %L)$$, :'emp', :'krs', :'analista'),
  'o lembrete não vai para quem não vê o cartão');
reset role;
select app._notificar(:'emp', :'analista', 'tarefa_atribuida', 'Tarefa para você: Proposta sigilosa', :'tm', 'tarefas', :'krs', current_date, :'gestor');
select pg_temp.ok(not exists (select 1 from app.notificacoes where origem_id = :'krs' and destinatario_id = :'analista'),
  'e nenhum aviso de cartão chega a quem não o vê');

-- 3. tarefa que trava: tirar a etapa, arquivar ou virar modelo só com gestor ou diretor
select pg_temp.como(:'diretor');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno da trava', :'analista', 'corretor', :'sp', -23.71, -46.71, pg_temp.quadra(-46.71, -23.71)) returning id as ttv \gset
select (app.registrar_oferta(:'ttv', 3000000, 'dinheiro')->>'processo_id') as ptv \gset
select app.mover_etapa(:'ptv', true, 'teste') as r \gset
select pg_temp.como(:'analista');
select (i->>'tarefa_id') as ktv from jsonb_array_elements(app.checar_passagem(:'ptv')->'itens') i where i->>'tipo' = 'tarefa' limit 1 \gset
select pg_temp.ok(:'ktv' <> '', 'o terreno tem tarefa que trava a saída da etapa');
select pg_temp.falha(format($$update fluxo.tarefas set etapa = 'nenhuma' where id = %L$$, :'ktv'), 'o analista não tira a etapa da tarefa que trava (Nenhuma)');
select pg_temp.falha(format($$update fluxo.tarefas set arquivada_em = now() where id = %L$$, :'ktv'), 'nem arquiva a tarefa que trava');
select pg_temp.falha(format($$update fluxo.tarefas set modelo = true where id = %L$$, :'ktv'), 'nem a torna modelo');
select pg_temp.falha(format($$select app.mover_etapa(%L)$$, :'ptv'), 'e o avanço continua travado');
update fluxo.tarefas set titulo = titulo || ' (revisado)' where id = :'ktv';
select pg_temp.ok((select titulo like '% (revisado)' from fluxo.tarefas where id = :'ktv'), 'o resto da tarefa o analista continua editando');
select pg_temp.como(:'gestor');
update fluxo.tarefas set arquivada_em = now() where id = :'ktv';
select pg_temp.ok((select arquivada_em is not null from fluxo.tarefas where id = :'ktv'), 'o gestor arquiva a tarefa que trava');

-- 5. parte sem negociação não deixa o terreno virar Comprado
select pg_temp.como(:'diretor');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno de três donos', :'diretor', 'corretor', :'sp', -23.73, -46.73, pg_temp.quadra(-46.73, -23.73)) returning id as tpd \gset
select app.abrir_negociacao(:'tpd') as ppd \gset
select app.salvar_parte(:'tpd', (select id from app.terreno_partes where terreno_id = :'tpd'), '{"nome":"Dono A"}') as pa_a \gset
select app.salvar_parte(:'tpd', null, '{"nome":"Dono B"}') as pa_b \gset
select (app.mover_para_etapa(:'ppd', 'negociacao', true, 'teste'))->>'resultado' as r \gset
select app.encerrar_processo(:'ppd', 'stand_by', null, 'pausa', current_date + 10) as r \gset
select app.salvar_parte(:'tpd', null, '{"nome":"Dono C"}') as pa_c \gset
select app.retomar_processo(:'ppd');
select pg_temp.ok((select count(*) = 3 from app.processos where principal_id = :'ppd'), 'parte cadastrada no Stand By ganha a negociação ao retomar');
select (app.mover_para_etapa(c.id, 'contrato', true, 'teste'))->>'resultado' from app.processos c join app.terreno_partes tp on tp.id = c.parte_id
 where c.principal_id = :'ppd' \g /dev/null
select app.encerrar_processo(c.id, 'concluido', null, 'ok', null, null, true, 'teste') from app.processos c join app.terreno_partes tp on tp.id = c.parte_id
 where c.principal_id = :'ppd' \g /dev/null
-- parte que ficou sem negociação (gravada por fora) conta como pendência, não como ok
reset role;
insert into app.terreno_partes (empresa_id, terreno_id, nome) values (:'emp', :'tpd', 'Dono D');
select pg_temp.como(:'diretor');
select pg_temp.ok(exists (select 1 from jsonb_array_elements(app.checar_passagem(:'ppd', 'status', 'concluido')->'itens') i where i->>'tipo' = 'parte' and (i->>'ok')::boolean is false and i->>'texto' like '%Dono D: sem negociação'),
  'parte sem negociação aparece como pendência, não como ok');
select pg_temp.falha(format($$select app.encerrar_processo(%L, 'concluido', null, 'compra', null, 'ok', true, 'forçando')$$, :'ppd'), 'e o terreno não vira Comprado, nem forçando');

-- 4. terreno em partes não passa por cima da Jornada
select app.salvar_item_jornada(:'emp', null, '{"fase":"novos_negocios","etapa":"negociacao","campo":"terreno.descricao","regra":"bloqueia"}') as ijp \gset
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, latitude, longitude, poligono_geojson)
  values (:'emp', 'Terreno de dois donos', :'diretor', 'corretor', :'sp', -23.75, -46.75, pg_temp.quadra(-46.75, -23.75)) returning id as tjp \gset
select app.abrir_negociacao(:'tjp') as pjp \gset
select app.salvar_parte(:'tjp', (select id from app.terreno_partes where terreno_id = :'tjp'), '{"nome":"Dono A"}') as r \gset
select app.salvar_parte(:'tjp', null, '{"nome":"Dono B"}') as r \gset
select (app.mover_para_etapa(:'pjp', 'negociacao', true, 'teste'))->>'resultado' as r \gset
select pg_temp.como(:'analista');
select id as cjp from app.processos where principal_id = :'pjp' order by codigo limit 1 \gset
select pg_temp.ok(exists (select 1 from jsonb_array_elements(app.checar_passagem(:'cjp', 'etapa', 'contrato')->'itens') i where i->>'tipo' = 'jornada' and (i->>'ok')::boolean is false),
  'a parte que sai de Negociação vê a pergunta da Jornada sem resposta');
select pg_temp.falha(format($$select app.mover_para_etapa(%L, 'contrato')$$, :'cjp'), 'e não sai sem a resposta');
select pg_temp.como(:'diretor');
select app.gravar_campo(:'tjp', 'terreno.descricao', '"Dois lotes de esquina"');
select pg_temp.como(:'analista');
select pg_temp.ok(not exists (select 1 from jsonb_array_elements(app.checar_passagem(:'cjp', 'etapa', 'contrato')->'itens') i where i->>'tipo' = 'jornada' and (i->>'ok')::boolean is false),
  'respondida no terreno, vale para todas as partes');
select pg_temp.como(:'diretor');
select app.salvar_item_jornada(:'emp', :'ijp', '{"ativo":false}') as r \gset

-- ---------------------------------------------------------------------
\echo '# médios e baixos da revisão de 2/nov/2026'
-- Taxas e Financeiras: o gestor também não vê o log de cada linha
select pg_temp.como(:'gestor');
select pg_temp.ok(not exists (select 1 from app.auditoria where tabela = 'viabilidade_linhas' and depois->>'despesa' in ('impostos','taxa_desenvolvimento'))
  and exists (select 1 from app.auditoria where tabela = 'viabilidade_linhas' and depois->>'despesa' = 'comissao'),
  'o gestor vê o log das linhas comuns, não o das taxas e despesas financeiras');
select pg_temp.como(:'diretor');
select pg_temp.ok(exists (select 1 from app.auditoria where tabela = 'viabilidade_linhas' and depois->>'despesa' = 'impostos'), 'a diretoria vê');
-- regra do quadro só mexe no cartão que o dono edita (não basta ver)
select pg_temp.como(:'diretor');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, visibilidade)
select q.empresa_id, q.id, pg_temp.lista(:'tm', 'Fazer'), 'Cartão que o gestor só lê', 'restrito'
from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'tm' returning id as kle \gset
insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, papel) values (:'emp', :'kle', :'gestor', 'leitor');
select pg_temp.como(:'gestor');
insert into fluxo.automacoes (empresa_id, quadro_id, nome, gatilho, gatilho_lista_id, acoes)
values (:'emp', :'qm', 'Fazendo é alta', 'entrou_lista', pg_temp.lista(:'tm', 'Fazendo'), '[{"tipo":"prioridade","valor":"alta"}]') returning id as aul \gset
select pg_temp.ok(fluxo.papel_tarefa(:'kle') = 'leitor', 'o gestor só lê este cartão');
select pg_temp.como(:'diretor');
update fluxo.tarefas set lista_id = pg_temp.lista(:'tm', 'Fazendo') where id = :'kle';
select pg_temp.ok((select prioridade = 'media' from fluxo.tarefas where id = :'kle') and not exists (select 1 from fluxo.automacao_execucoes where automacao_id = :'aul'),
  'a regra de quem só lê o cartão não mexe nele');
update fluxo.automacoes set ativa = false where id = :'aul';

-- pausa pedida perde o sentido quando a tarefa é concluída
select pg_temp.como(:'analista');
select pg_temp.tarefa(:'tm', 'Conferir a certidão de ônus', current_date + 3) as kpz \gset
select fluxo.pausar(:'kpz', 'Cartório fechado') as zpz \gset
select pg_temp.ok((select situacao = 'pendente' from fluxo.pausas where id = :'zpz'), 'a pausa do analista fica pedida');
update fluxo.tarefas set concluida_em = now() where id = :'kpz';
select pg_temp.ok((select situacao = 'cancelada' from fluxo.pausas where id = :'zpz'), 'concluída a tarefa, o pedido de pausa é cancelado');
select pg_temp.como(:'gestor');
select pg_temp.falha(format($$select fluxo.decidir_pausa(%L, true)$$, :'zpz'), 'e aprovar o pedido não reabre a tarefa');
select pg_temp.ok((select concluida_em is not null from fluxo.tarefas where id = :'kpz'), 'a tarefa continua concluída');

-- aviso de pausa não leva o título a quem não vê o cartão
select pg_temp.como(:'analista');
insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, visibilidade)
select q.empresa_id, q.id, pg_temp.lista(:'tm', 'Fazer'), 'Assunto reservado', 'individual'
from fluxo.quadros q where q.objeto_tipo = 'terreno' and q.objeto_id = :'tm' returning id as kre \gset
select fluxo.pausar(:'kre', 'Aguardando') as zre \gset
reset role;
select pg_temp.ok(not exists (select 1 from app.notificacoes where texto like '%Assunto reservado%' and destinatario_id = :'gestor'),
  'o pedido de pausa de um cartão Individual não chega ao gestor que não o vê');

-- portas das funções internas: só sobre o cartão que quem pergunta vê
select pg_temp.como(:'intruso');
select pg_temp.falha(format($$select fluxo.condicao_vale(%L, '{"modo":"todas","itens":[{"campo":"terreno.situacao_ocupacao","op":"vazio"}]}')$$, :'kpz'),
  'quem é de outra empresa não pergunta sobre os campos do terreno pelo cartão');
select pg_temp.falha(format($$select fluxo.campo_do_objeto(%L, 'terreno.situacao_ocupacao')$$, :'kpz'), 'nem lê o campo');
select pg_temp.falha(format($$select fluxo.pendencias_conclusao(%L)$$, :'kpz'), 'nem as pendências do cartão');
select pg_temp.como(:'analista');
select pg_temp.ok(fluxo.condicao_vale(:'kpz', null) and fluxo.pendencias_conclusao(:'kpz') = '{}', 'quem vê o cartão continua perguntando');

-- quem enviou o documento não o valida sozinho; o diretor pode
select app.registrar_documento(:'tm', 'foto', :'emp' || '/' || :'tm' || '/foto/rev.jpg', 'rev.jpg') as drv \gset
select pg_temp.falha(format($$select app.revisar_documento(%L, true)$$, :'drv'), 'quem enviou não valida o próprio documento');
select app.revisar_documento(:'drv', false);
select pg_temp.ok((select situacao = 'rejeitado' from app.documentos where id = :'drv'), 'mas pode recusar o que enviou');
select pg_temp.como(:'gestor');
select app.revisar_documento(:'drv', true);
select pg_temp.ok((select situacao = 'validado' and revisado_por = :'gestor' from app.documentos where id = :'drv'), 'outra pessoa valida');
select pg_temp.como(:'diretor');
select app.registrar_documento(:'tm', 'foto', :'emp' || '/' || :'tm' || '/foto/rev2.jpg', 'rev2.jpg') as drd \gset
select app.revisar_documento(:'drd', true);
select pg_temp.ok((select situacao = 'validado' from app.documentos where id = :'drd'), 'o diretor valida o que ele mesmo enviou');

-- desarquivar terreno
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, poligono_geojson)
  values (:'emp', 'Para arquivar', :'analista', 'corretor', :'sp', pg_temp.quadra(-46.80, -23.80)) returning id as tar \gset
select app.arquivar_terreno(:'tar', 'Proprietário desistiu');
select pg_temp.como(:'analista');
select pg_temp.falha(format($$select app.reativar_terreno(%L)$$, :'tar'), 'analista não desarquiva');
select pg_temp.como(:'gestor');
select app.reativar_terreno(:'tar');
select pg_temp.ok((select situacao_cadastral = 'ativo' and arquivado_em is null and motivo_arquivamento is null from app.terrenos where id = :'tar'),
  'gestor desarquiva o terreno');
select pg_temp.ok(exists (select 1 from app.auditoria where tabela = 'terrenos' and registro_id = :'tar' and depois->>'motivo_arquivamento' = 'Proprietário desistiu'),
  'o arquivamento fica no histórico');
select pg_temp.falha(format($$select app.reativar_terreno(%L)$$, :'tar'), 'terreno ativo não se desarquiva');

-- terreno: código e quem criou são do banco; responsável e vínculos dentro da empresa
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, codigo, criado_por, nome, responsavel_id, origem_cadastro, municipio_id, poligono_geojson)
  values (:'emp', 'TER-999999', :'gestor', 'Código escolhido', :'analista', 'corretor', :'sp', pg_temp.quadra(-46.81, -23.81)) returning id as tce \gset
select pg_temp.ok((select codigo <> 'TER-999999' and codigo ~ '^[A-Z]\d{3}$' and criado_por = :'analista' from app.terrenos where id = :'tce'),
  'cadastro direto não escolhe o código nem quem criou');
select pg_temp.falha(format($$insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, poligono_geojson) values (%L, 'X', %L, 'corretor', %L, %L)$$,
  :'emp', :'intruso', :'sp', pg_temp.quadra(-46.82, -23.82)), 'o responsável do terreno é da equipe da empresa');
select pg_temp.falha(format($$select app.salvar_terreno(%L, (select versao from app.terrenos where id = %L), '{"responsavel_id":"%s"}')$$, :'tce', :'tce', :'intruso'),
  'nem depois, ao editar a ficha');

-- histórico: inscrição com IPTU e análise substituída
select pg_temp.falha(format($$delete from app.inscricoes_municipais where id = %L$$, :'ins'), 'inscrição com IPTU e valor venal não se apaga');
select pg_temp.falha(format($$update app.analises_urbanisticas set fonte = 'Reescrita' where id = %L$$, :'a1'), 'análise substituída não muda');
select pg_temp.falha(format($$update app.analise_zoneamentos set area_abrangida_m2 = 1 where analise_id = %L$$, :'a1'), 'nem as zonas dela');
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao) values (:'emp', :'tce', '077.111.0001-1') returning id as ilv \gset
delete from app.inscricoes_municipais where id = :'ilv';
select pg_temp.ok(not exists (select 1 from app.inscricoes_municipais where id = :'ilv'), 'inscrição sem histórico continua saindo');

-- tipo da lista: só gestor, diretor ou o administrador
select pg_temp.falha(format($$update fluxo.listas set tipo = 'pausa' where id = %L$$, pg_temp.lista(:'tm', 'Fazer')), 'analista não muda o tipo da lista');
select pg_temp.falha(format($$insert into fluxo.listas (empresa_id, quadro_id, nome, tipo) values (%L, %L, 'Pronto', 'conclui')$$, :'emp', :'qm'),
  'nem cria lista que conclui');
insert into fluxo.listas (empresa_id, quadro_id, nome) values (:'emp', :'qm', 'Na prefeitura') returning id as lnp \gset
select pg_temp.ok((select tipo = 'aberta' from fluxo.listas where id = :'lnp'), 'lista nova aberta, quem edita cria');
select pg_temp.como(:'gestor');
update fluxo.listas set tipo = 'conclui' where id = :'lnp';
select pg_temp.ok((select tipo = 'conclui' from fluxo.listas where id = :'lnp'), 'o gestor muda o tipo');
update fluxo.listas set tipo = 'aberta', oculta = true where id = :'lnp';

-- outra empresa: equipe, @, domínio e cadastros
select pg_temp.como(:'intruso');
reset role;
select app.criar_empresa('Outra SA', 'Intruso', :'intruso') as emp_x \gset
select pg_temp.como(:'intruso');
select pg_temp.falha(format($$insert into app.membros (empresa_id, user_id, papel, nome) values (%L, %L, 'analista', 'Pego')$$, :'emp_x', :'analista'),
  'o administrador de outra empresa não põe alguém da BKM na equipe dele');
select pg_temp.falha(format($$select app.mudar_arroba(%L, 'pego')$$, :'analista'), 'nem muda o @ dele');
select pg_temp.falha(format($$insert into app.empresa_dominios (dominio, empresa_id) values ('gmail.com', %L)$$, :'emp_x'), 'e-mail gratuito não vira domínio de empresa');
select pg_temp.falha(format($$insert into app.empresa_dominios (dominio, empresa_id) values ('bkm2.test', %L)$$, :'emp_x'), 'só o domínio do próprio e-mail');
insert into app.empresa_dominios (dominio, empresa_id) values ('outra.test', :'emp_x');
select pg_temp.ok(exists (select 1 from app.empresa_dominios where dominio = 'outra.test'), 'o domínio do próprio e-mail entra');
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp_x', 'PF', 'Corretor de fora') returning id as pfx \gset
insert into app.corretores (empresa_id, pessoa_id) values (:'emp_x', :'pfx') returning id as cfx \gset
select pg_temp.como(:'diretor');
select pg_temp.falha(format($$insert into app.terreno_corretores (terreno_id, corretor_id, empresa_id) values (%L, %L, %L)$$, :'tce', :'cfx', :'emp'),
  'corretor de outra empresa não entra no terreno');
select pg_temp.falha(format($$insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao) values (%L, %L, %L, 'proprietario', 10)$$, :'emp', :'tce', :'pfx'),
  'nem pessoa de outra empresa');

-- ---------------------------------------------------------------------
\echo '# partes com matrículas e SQLs ligados direto, sem lote (etiquetas da aba Terreno, 4/nov/2026)'
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, cartorio, cartorio_origem, poligono_geojson)
values (:'emp', 'Lotes na R. Bresser', :'analista', 'corretor', :'sp', 'Brás', '9º CRI', 'prefeitura', pg_temp.quadra(-46.8200, -23.7000, 60)) returning id as tl \gset
select id as lp1 from app.terreno_partes where terreno_id = :'tl' \gset
select app.salvar_parte(:'tl', :'lp1', '{"pessoa_nome":" Maria Lopes ","telefone":"(11) 98765-4321","email":"Maria@Lopes.com","documento":"529.982.247-25","observacoes":"Herdeira"}') \g /dev/null
select pg_temp.ok((select nome = 'Vendedor 1' and pessoa_nome = 'Maria Lopes' and telefone = '11987654321' and email = 'maria@lopes.com' and documento = '52998224725'
                     from app.terreno_partes where id = :'lp1'), 'contato da parte: só dígitos no telefone e no CPF, e-mail em minúsculas');
select pg_temp.falha(format($$select app.salvar_parte(%L, %L, '{"documento":"123.456.789-00"}')$$, :'tl', :'lp1'), 'CPF com dígito errado é recusado');
select pg_temp.falha(format($$select app.salvar_parte(%L, %L, '{"email":"maria@"}')$$, :'tl', :'lp1'), 'e-mail inválido é recusado');
select app.salvar_parte(:'tl', null, '{"nome":"Vendedor 2","documento":"11.222.333/0001-81"}') as lp2 \gset
select pg_temp.ok((select documento = '11222333000181' from app.terreno_partes where id = :'lp2'), 'CNPJ da parte');
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, area_cadastral_m2) values (:'emp', :'tl', '059.112.0031-4', 480) returning id as li1 \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, area_cadastral_m2) values (:'emp', :'tl', '059.112.0032-2', 150) returning id as li2 \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, area_cadastral_m2) values (:'emp', :'tl', '059.112.0033-0', 400) returning id as li3 \gset
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, area_registrada_m2) values (:'emp', :'tl', '301.001', '9º CRI', 500) returning id as lm1 \gset
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, area_registrada_m2) values (:'emp', :'tl', '301.002', '9º CRI', 300) returning id as lm2 \gset
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, area_registrada_m2) values (:'emp', :'tl', '301.003', '9º CRI', 200) returning id as lm3 \gset
select pg_temp.ok((select count(*) = 0 from app.matricula_partes where terreno_id = :'tl')
                  and (select count(*) = 0 from app.inscricao_partes where terreno_id = :'tl'), 'matrícula e SQL entram sem parte');
-- arrastar a etiqueta para a parte = uma linha da etiqueta na parte
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id) values (:'emp', :'tl', :'lm1', :'lp1') returning id as lc1 \gset
-- o SQL entra na parte sempre dentro de uma matrícula dela (subquadro da matrícula; pedido do Moises, 6/nov/2026)
select pg_temp.falha(format($$insert into app.inscricao_partes (empresa_id, terreno_id, inscricao_id, parte_id) values (%L, %L, %L, %L)$$, :'emp', :'tl', :'li1', :'lp1'),
  'SQL sem matrícula não entra na parte');
insert into app.inscricao_partes (empresa_id, terreno_id, inscricao_id, matricula_parte_id) values (:'emp', :'tl', :'li1', :'lc1') returning id as lic1 \gset
select pg_temp.ok((select parte_id = :'lp1' from app.inscricao_partes where id = :'lic1'), 'o SQL dentro da matrícula fica na parte dela');
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id) values (:'emp', :'tl', :'lm2', :'lp2') returning id as lc_2 \gset
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id) values (:'emp', :'tl', :'lm3', :'lp2') returning id as lc_3 \gset
insert into app.inscricao_partes (empresa_id, terreno_id, inscricao_id, matricula_parte_id) values (:'emp', :'tl', :'li2', :'lc_2'), (:'emp', :'tl', :'li3', :'lc_3');
select pg_temp.ok((select area_partes_m2 = 480 and area_fonte = 'inscricoes' and area_matriculas_m2 = 500 and area_cadastral_m2 = 480 and divergencia_cadastral_pct = -4.0 from app.v_partes where id = :'lp1'),
  'área da parte pelos SQLs dela e divergência com as matrículas');
select pg_temp.ok((select area_partes_m2 = 550 and area_matriculas_m2 = 500 and area_cadastral_m2 = 550 and divergencia_cadastral_pct = 10.0 from app.v_partes where id = :'lp2'),
  'parte com duas matrículas e dois SQLs: divergência pela soma de cada lado');
update app.inscricoes_municipais set area_cadastral_m2 = null where id = :'li3';
select pg_temp.ok((select area_partes_m2 is null and area_fonte is null and divergencia_cadastral_pct is null from app.v_partes where id = :'lp2'), 'SQL sem área: a parte fica sem área (não soma pela metade)');
update app.inscricoes_municipais set area_cadastral_m2 = 400 where id = :'li3';
-- o SQL anda com a matrícula: a matrícula muda de parte, ele vai junto; ela sai da parte, ele fica solto
update app.matricula_partes set parte_id = :'lp1' where id = :'lc_3';
select pg_temp.ok((select parte_id = :'lp1' from app.inscricao_partes where inscricao_id = :'li3'), 'a matrícula leva os SQLs dela para a outra parte');
update app.matricula_partes set parte_id = :'lp2' where id = :'lc_3';
update app.inscricao_partes set parte_id = :'lp2' where id = :'lic1';
select pg_temp.ok((select parte_id = :'lp1' from app.inscricao_partes where id = :'lic1'), 'o SQL dentro de uma matrícula fica na parte dela, mesmo pedindo outra');
update app.inscricao_partes set matricula_parte_id = :'lc_2' where id = :'lic1';
select pg_temp.ok((select parte_id = :'lp2' from app.inscricao_partes where id = :'lic1'), 'o SQL levado para a matrícula de outra parte vai para a parte dela');
update app.inscricao_partes set matricula_parte_id = :'lc1' where id = :'lic1';
select pg_temp.falha(format($$update app.matricula_partes set parte_id = %L where id = %L$$, :'pa', :'lc1'), 'a parte tem que ser do terreno');
-- o mesmo lote em duas partes (etiqueta duplicada; pedido do Moisés, 6/nov/2026)
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id) values (:'emp', :'tl', :'lm1', :'lp2') returning id as lc2 \gset
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id, percentual) values (:'emp', :'tl', :'lm1', :'lp2', 0) returning id as lc3 \gset
select pg_temp.ok((select count(*) = 2 from app.matricula_partes where matricula_id = :'lm1' and parte_id = :'lp2'), 'a cópia duplicada nasce na mesma parte da original');
delete from app.matricula_partes where id = :'lc3';
select pg_temp.ok((select area_matriculas_m2 = 250 from app.v_partes where id = :'lp1') and (select area_matriculas_m2 = 750 from app.v_partes where id = :'lp2'),
  'lote de duas partes sem percentual: metade para cada');
select pg_temp.ok((select bool_and(fracao_estimada) from app.v_etiquetas where lote_id = :'lm1'), 'sem percentual, a fração do lote compartilhado é estimada');
update app.matricula_partes set percentual = 70 where id = :'lc1';
select pg_temp.ok((select area_matriculas_m2 = 350 from app.v_partes where id = :'lp1') and (select area_matriculas_m2 = 650 from app.v_partes where id = :'lp2'),
  'com 70% numa parte, a outra fica com o que sobra');
select pg_temp.ok((select area_partes_m2 = 336 from app.v_partes where id = :'lp1'),
  'área da parte = área do SQL × fração da parte no SQL × fração da parte na matrícula (480 × 100% × 70%)');
select pg_temp.falha(format('update app.matricula_partes set percentual = 40 where id = %L', :'lc2'), 'os percentuais do mesmo lote não passam de 100%');
update app.matricula_partes set percentual = 30 where id = :'lc2';
select pg_temp.ok((select count(*) = 0 from app.v_etiquetas where lote_id = :'lm1' and fracao_estimada), 'com os percentuais informados, nada é estimado');
update app.matricula_partes set percentual = 0 where id = :'lc2';
update app.matricula_partes set percentual = 100 where id = :'lc1';
select pg_temp.ok((select area_matriculas_m2 = 500 from app.v_partes where id = :'lp1') and (select area_matriculas_m2 = 500 from app.v_partes where id = :'lp2'),
  'etiqueta com 0%: a parte fica sem nada do lote');
-- cópia solta (sem parte), para distribuir depois
update app.matricula_partes set percentual = 60 where id = :'lc1';
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id, percentual) values (:'emp', :'tl', :'lm1', null, 40) returning id as lcs \gset
select pg_temp.ok((select fracao = 0.4 from app.v_etiquetas where id = :'lcs'), 'cópia solta guarda a fração dela no lote');
select pg_temp.ok((select area_matriculas_m2 = 300 from app.v_partes where id = :'lp1'), 'a parte fica só com a fração dela; a solta não entra em parte nenhuma');
delete from app.matricula_partes where id = :'lc2';
update app.matricula_partes set parte_id = :'lp2' where id = :'lcs';
select pg_temp.ok((select area_matriculas_m2 = 700 from app.v_partes where id = :'lp2'), 'a solta levada para uma parte entra nela');
insert into app.matricula_partes (id, empresa_id, terreno_id, matricula_id, parte_id, percentual) values (:'lc2', :'emp', :'tl', :'lm1', null, 0);
update app.matricula_partes set parte_id = null where id = :'lcs';
delete from app.matricula_partes where id = :'lc2';
update app.matricula_partes set parte_id = :'lp2', percentual = 0 where id = :'lcs';
update app.matricula_partes set percentual = 100 where id = :'lc1';
update app.matricula_partes set percentual = 70 where id = :'lc1';
delete from app.matricula_partes where id in (:'lc2', :'lcs');
update app.matricula_partes set percentual = null where id = :'lc1';
select pg_temp.ok((select area_matriculas_m2 = 500 from app.v_partes where id = :'lp1'), 'de volta a uma parte só, o lote inteiro');
-- parte só com SQLs: a área vem do cadastro da prefeitura
select app.salvar_parte(:'tl', null, '{"nome":"Vendedor 3"}') as lp3 \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, municipio_id, inscricao, area_cadastral_m2, origem, endereco_prefeitura)
values (:'emp', :'tl', :'sp', '059.112.0040-3', 220, 'mapa_prefeitura', 'R BRESSER, 120') returning id as lim \gset
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio) values (:'emp', :'tl', '301.004', '9º CRI') returning id as lm4 \gset
insert into app.matricula_partes (empresa_id, terreno_id, matricula_id, parte_id) values (:'emp', :'tl', :'lm4', :'lp3') returning id as lc4 \gset
insert into app.inscricao_partes (empresa_id, terreno_id, inscricao_id, matricula_parte_id) values (:'emp', :'tl', :'lim', :'lc4');
select pg_temp.ok((select area_partes_m2 = 220 and area_fonte = 'inscricoes' and divergencia_cadastral_pct is null from app.v_partes where id = :'lp3'), 'matrícula sem área: a área da parte vem dos SQLs, sem divergência');
delete from app.matricula_partes where id = :'lc4';
select pg_temp.ok((select parte_id is null and matricula_parte_id is null from app.inscricao_partes where inscricao_id = :'lim'), 'a matrícula sai da parte: o SQL dela fica solto');
insert into app.matricula_partes (id, empresa_id, terreno_id, matricula_id, parte_id) values (:'lc4', :'emp', :'tl', :'lm4', :'lp3');
update app.inscricao_partes set matricula_parte_id = :'lc4' where inscricao_id = :'lim';
-- pessoas da parte: relação e participação (pedido do Moises, 6/nov/2026)
insert into app.pessoas (empresa_id, nome_razao_social) values (:'emp', 'Ana Bresser') returning id as pana \gset
insert into app.pessoas (empresa_id, nome_razao_social) values (:'emp', 'João Bresser') returning id as pjoao \gset
insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao, parte_id) values (:'emp', :'tl', :'pana', 'proprietario', 100, :'lp3');
insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, parte_id) values (:'emp', :'tl', :'pjoao', 'conjuge', :'lp3');
select pg_temp.falha(format($$insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, parte_id) values (%L, %L, %L, 'proprietario', %L)$$, :'emp', :'tl', :'pjoao', :'lp3'),
  'proprietário sem a participação não entra');
insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social) values (:'emp', 'PF', 'Só o Nome') returning id as psn \gset
select pg_temp.ok((select telefone is null and email is null and cpf_cnpj is null from app.pessoas where id = :'psn'), 'pessoa entra só com o nome (telefone, e-mail e CPF opcionais)');
select pg_temp.falha(format($$insert into app.terreno_pessoas (empresa_id, terreno_id, pessoa_id, papel, percentual_participacao, parte_id) values (%L, %L, %L, 'parente', 10, %L)$$, :'emp', :'tl', :'pjoao', :'lp3'),
  'participação só de proprietário');
select pg_temp.falha(format($$insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, origem) values (%L, %L, '059.112.0041-1', 'chute')$$, :'emp', :'tl'), 'origem da inscrição só digitada ou do mapa');
reset role;
insert into app.consultas_lote (empresa_id, terreno_id, inscricao_id, base, inscricao_norm, lote, zonas)
values (:'emp', :'tl', :'li1', 'geosampa', '05911200314', '{}', '[{"sigla":"ZM","area_m2":480}]');
select pg_temp.como(:'analista');
select pg_temp.ok((select zonas = '{ZM}' from app.v_partes where id = :'lp1'), 'zonas da parte pela última consulta dos SQLs dela');
-- excluir a parte: as etiquetas dela ficam sem parte (voltam para o quadro de cima)
select app.excluir_parte(:'lp3');
select pg_temp.ok(not exists (select 1 from app.terreno_partes where id = :'lp3') and exists (select 1 from app.inscricoes_municipais where id = :'lim')
                  and not exists (select 1 from app.inscricao_partes where inscricao_id = :'lim')
                  and not exists (select 1 from app.terreno_pessoas where terreno_id = :'tl' and pessoa_id in (:'pana', :'pjoao'))
                  and exists (select 1 from app.pessoas where id = :'pana'),
  'parte excluída: o SQL dela fica no terreno, sem parte, e as pessoas saem dela (o cadastro da pessoa fica)');
select app.excluir_parte(:'lp2');
select pg_temp.ok((select count(*) = 0 from app.matricula_partes where parte_id = :'lp2') and (select count(*) = 4 from app.matriculas where terreno_id = :'tl'),
  'matrículas da parte excluída ficam no terreno, sem parte');
select pg_temp.falha(format('select app.excluir_parte(%L)', :'lp1'), 'a última parte não sai');
insert into app.terrenos (empresa_id, nome, responsavel_id, origem_cadastro, municipio_id, bairro, poligono_geojson)
values (:'emp', 'Uma parte só', :'analista', 'corretor', :'sp', 'Brás', pg_temp.quadra(-46.8300, -23.7000, 30)) returning id as tl2 \gset
select pg_temp.falha(format('select app.excluir_parte(id) from app.terreno_partes where terreno_id = %L', :'tl2'), 'o terreno fica sempre com uma parte');
select pg_temp.como(:'leitor');
delete from app.matricula_partes where id = :'lc1';
select pg_temp.ok(exists (select 1 from app.matricula_partes where id = :'lc1'), 'Leitura não tira a matrícula da parte');
select pg_temp.como(:'analista');

-- ---------------------------------------------------------------------
\echo '# estudos de massa (lote 4 da ficha em abas)'
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.solicitar_estudo_massa(%L, %L)', :'t1', :'intruso'), 'o arquiteto é alguém da equipe');
select app.solicitar_estudo_massa(:'t1', :'diretor', E'Torre única\n2 dormitórios, sem vaga', current_date + 10) as em1 \gset
select pg_temp.ok((select nome = 'Estudo de massa 1' and situacao = 'solicitado' and solicitante_id = :'analista' from app.estudos_massa where id = :'em1'),
  'pedido ao arquiteto com briefing e prazo nasce Solicitado, numerado no terreno');
select pg_temp.como(:'diretor');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'massa_solicitado' and origem_id = :'em1') = 1, 'o arquiteto é avisado do pedido');
select app.salvar_estudo_massa(:'em1', '{"tipologias":[{"nome":"2 dormitórios","area_privativa":40,"quantidade":100},{"nome":"2 dormitórios com suíte","area_privativa":50,"quantidade":50}],
  "lazer_coberto_torre_m2":300,"vagas_cobertas":0,"vagas_descobertas":30,"ca_legal":4,"ca_venal":3.2}');
select pg_temp.ok((select situacao = 'em_elaboracao' and area_privativa_m2 = 6500 and unidades = 150 and eficiencia_pct is null from app.estudos_massa where id = :'em1'),
  'o primeiro dado põe em elaboração; área privativa total = Σ área × quantidade (6.500 m², 150 unidades)');
select pg_temp.falha(format($$select app.salvar_estudo_massa(%L, '{"situacao":"entregue"}')$$, :'em1'), 'sem a área construída total não se entrega');
select pg_temp.falha(format($$select app.salvar_estudo_massa(%L, '{"tipologias":[{"nome":" "}]}')$$, :'em1'), 'tipologia sem título é recusada');
select app.salvar_estudo_massa(:'em1', '{"area_construida_m2":10000,"situacao":"entregue"}');
select pg_temp.ok((select situacao = 'entregue' and eficiencia_pct = 65 and entregue_em is not null from app.estudos_massa where id = :'em1'),
  'entregue; eficiência = privativa ÷ construída = 65%');
select pg_temp.como(:'analista');
select pg_temp.ok((select count(*) from app.notificacoes where tipo = 'massa_entregue' and origem_id = :'em1') = 1, 'quem pediu é avisado da entrega');
select app.solicitar_estudo_massa(:'t1', :'diretor', 'Alternativa com studio') as em2 \gset
select pg_temp.falha(format('select app.marcar_massa_valido(%L)', :'em2'), 'só o estudo entregue pode ser o válido');
select app.marcar_massa_valido(:'em1');
select pg_temp.ok((select valido from app.estudos_massa where id = :'em1'), 'analista marca o estudo válido');
select pg_temp.falha(format($$select app.salvar_estudo_massa(%L, '{"situacao":"em_elaboracao"}')$$, :'em1'), 'o válido não volta para em elaboração');
select app.salvar_estudo_massa(:'em1', '{"observacoes":"Conferido com o zoneamento"}');
-- o botão do estudo de massa cria a viabilidade presa a ele
select app.criar_viabilidade_da_massa(:'em1') as vbm \gset
select pg_temp.ok((select nome = 'Viabilidade do Estudo de massa 1' and estudo_massa_id = :'em1' and not segue_massa_valido and area_construida = 10000 and area_privativa = 6500 and unidades = 150
                     from app.viabilidades where id = :'vbm')
  and (select count(*) = 2 and bool_and(massa_tipologia_id is not null) from app.viabilidade_tipologias where viabilidade_id = :'vbm'),
  'viabilidade criada pelo estudo de massa leva as tipologias (título, área, quantidade) e a área construída');
select pg_temp.falha(format($$update app.viabilidade_tipologias set quantidade = 90 where viabilidade_id = %L and nome = '2 dormitórios'$$, :'vbm'), 'presa ao estudo de massa, a quantidade não muda na viabilidade');
select pg_temp.falha(format($$insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, nome, quantidade) values (%L, %L, 'Extra', 1)$$, :'emp', :'vbm'), 'nem entra tipologia nova');
update app.viabilidade_tipologias set preco_unitario = 280000, quantidade_permuta = 10 where viabilidade_id = :'vbm' and nome = '2 dormitórios';
select pg_temp.ok((select preco_m2 = 7000 from app.viabilidade_tipologias where viabilidade_id = :'vbm' and nome = '2 dormitórios'), 'preço, permuta e comissão continuam da viabilidade');
select pg_temp.falha(format($$select app.salvar_viabilidade(%L, '{"area_construida":9000}')$$, :'vbm'), 'presa ao estudo, a área construída vem dele');
select app.salvar_viabilidade(:'vbm', '{"custo_m2":2000,"obra_base":"construida"}');
select pg_temp.ok((select obra_incidente = 20000000 from app.viabilidades where id = :'vbm'), 'obra pela área construída: 2.000/m² × 10.000 m² = 20 mi');
select app.salvar_viabilidade(:'vbm', '{"obra_base":"privativa"}');
select pg_temp.ok((select obra_incidente = 13000000 from app.viabilidades where id = :'vbm'), 'obra pela área privativa: 2.000/m² × 6.500 m² = 13 mi');
select app.salvar_viabilidade(:'vbm', '{"obra_base":"construida"}');
select id as emt1 from app.estudo_massa_tipologias where estudo_id = :'em1' and nome = '2 dormitórios' \gset
select id as emt2 from app.estudo_massa_tipologias where estudo_id = :'em1' and nome = '2 dormitórios com suíte' \gset
select app.salvar_estudo_massa(:'em1', format('{"area_construida_m2":9500,"tipologias":[{"id":"%s","nome":"2 dormitórios","area_privativa":41,"quantidade":8},{"id":"%s","nome":"2 dormitórios com suíte","area_privativa":50,"quantidade":50}]}', :'emt1', :'emt2')::jsonb);
select pg_temp.ok((select quantidade = 8 and area_privativa = 41 and preco_unitario = 280000 and quantidade_permuta = 8 from app.viabilidade_tipologias where viabilidade_id = :'vbm' and massa_tipologia_id = :'emt1')
  and (select area_construida = 9500 and obra_incidente = 19000000 from app.viabilidades where id = :'vbm'),
  'mudou o estudo de massa, a viabilidade muda junto: quantidade e área novas, mesmo preço; a permuta cabe na quantidade nova; obra pela área construída nova');
-- seguir o válido
select app.vincular_massa(:'vbm', null, true);
select pg_temp.ok((select segue_massa_valido and estudo_massa_id = :'em1' from app.viabilidades where id = :'vbm'), 'a viabilidade passa a seguir o estudo válido');
select app.salvar_estudo_massa(:'em2', '{"tipologias":[{"nome":"2 Dormitórios","area_privativa":42,"quantidade":120},{"nome":"Studio","area_privativa":26,"quantidade":40}],"area_construida_m2":11000,"situacao":"entregue"}');
select app.marcar_massa_valido(:'em2');
select pg_temp.ok((select not valido from app.estudos_massa where id = :'em1') and (select estudo_massa_id = :'em2' and area_construida = 11000 from app.viabilidades where id = :'vbm')
  and (select string_agg(nome || ':' || quantidade || ':' || coalesce(preco_unitario::text, '-'), ',' order by ordem) from app.viabilidade_tipologias where viabilidade_id = :'vbm')
      = '2 Dormitórios:120:280000.00,Studio:40:-',
  'trocou o válido, a viabilidade troca de estudo: a tipologia de mesmo nome guarda o preço, a nova entra e a que saiu do estudo sai');
select pg_temp.falha(format('select app.apagar_estudo_massa(%L)', :'em2'), 'o estudo válido não se apaga');
select app.criar_viabilidade_da_massa(:'em1', 'Presa ao 1') as vbm1 \gset
select pg_temp.falha(format('select app.apagar_estudo_massa(%L)', :'em1'), 'estudo com viabilidade presa não se apaga');
select app.vincular_massa(:'vbm1', null, false);
insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, nome, quantidade) values (:'emp', :'vbm1', 'Extra', 1);
select pg_temp.ok((select count(*) = 3 and bool_and(massa_tipologia_id is null) from app.viabilidade_tipologias where viabilidade_id = :'vbm1'), 'solta, a viabilidade fica com as tipologias e volta a editá-las');
update app.viabilidade_tipologias set quantidade = 3 where viabilidade_id = :'vbm1' and nome = '2 dormitórios';
select app.vincular_massa(:'vbm1', :'em1', false);
select pg_temp.ok((select string_agg(nome || ':' || quantidade, ',' order by ordem) from app.viabilidade_tipologias where viabilidade_id = :'vbm1') = '2 dormitórios:8,2 dormitórios com suíte:50',
  'vinculando de novo, as tipologias voltam às do estudo de massa (a editada e a incluída à mão saem)');
select app.vincular_massa(:'vbm1', null, false);
select app.criar_viabilidade(:'t1', 'Cópia presa', :'vbm') as vbmc \gset
select pg_temp.ok((select segue_massa_valido and estudo_massa_id = :'em2' from app.viabilidades where id = :'vbmc')
  and (select count(*) = 2 and bool_and(massa_tipologia_id is not null) from app.viabilidade_tipologias where viabilidade_id = :'vbmc'), 'duplicar leva o vínculo com o estudo de massa');
select app.apagar_estudo_massa(:'em1');
select pg_temp.ok(not exists (select 1 from app.estudos_massa where id = :'em1'), 'estudo sem viabilidade presa e não válido se apaga');
-- arquivos: PDF e DWG em Documentos, com versão
select app.anexar_arquivo_massa(:'em2', 'massa_pdf', :'emp' || '/' || :'t1' || '/massa_pdf/a.pdf', 'Estudo.PDF') as emd1 \gset
select app.anexar_arquivo_massa(:'em2', 'massa_pdf', :'emp' || '/' || :'t1' || '/massa_pdf/b.pdf', 'estudo-rev.pdf') as emd2 \gset
select pg_temp.ok(:'emd1' = :'emd2' and (select count(*) from app.documento_versoes where documento_id = :'emd1') = 2
  and (select estudo_massa_id = :'em2' and tipo_documento = 'massa_pdf' from app.documentos where id = :'emd1'), 'PDF do estudo em Documentos; o segundo envio é a versão 2');
select pg_temp.falha(format('select app.anexar_arquivo_massa(%L, %L, %L, %L)', :'em2', 'massa_dwg', :'emp' || '/x.pdf', 'x.pdf'), 'no lugar do DWG, só arquivo .dwg');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.solicitar_estudo_massa(%L, %L)', :'t1', :'diretor'), 'Leitura não pede estudo de massa');
select pg_temp.falha(format($$select app.salvar_estudo_massa(%L, '{"observacoes":"x"}')$$, :'em2'), 'Leitura não altera o estudo de massa');
select pg_temp.como(:'analista');

-- ---------------------------------------------------------------------
\echo '# reuniões com o Google Agenda (lote 6 da ficha em abas)'
select pg_temp.como(:'analista');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, inicio, modalidade, local, na_agenda) values (%L, %L, now() - interval '1 day', 'presencial', 'bkm', true)$$, :'emp', :'t1'), 'reunião já realizada não vai para a Agenda');
select pg_temp.falha(format($$insert into app.reunioes (empresa_id, terreno_id, status, inicio, modalidade, local, na_agenda, gerar_meet) values (%L, %L, 'agendada', now() + interval '1 day', 'presencial', 'bkm', true, true)$$, :'emp', :'t1'), 'Meet só em reunião online');
insert into app.reunioes (empresa_id, terreno_id, processo_id, status, inicio, duracao_min, modalidade, pauta, na_agenda, gerar_meet) values
  (:'emp', :'t1', :'neg', 'agendada', now() + interval '2 days', 60, 'online', 'Contraproposta', true, true) returning id as ra \gset
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, user_id) values (:'emp', :'ra', 'bkm', :'diretor');
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, nome, email) values (:'emp', :'ra', 'vendedor', 'Sr. Carlos', 'Carlos@Exemplo.com');
select pg_temp.falha(format($$insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, nome, email) values (%L, %L, 'outro', 'X', 'sem-arroba')$$, :'emp', :'ra'), 'e-mail do convidado com formato inválido é recusado');
select pg_temp.ok((select situacao = 'pendente' and acao = 'criar' and organizador_id = :'analista' from app.reuniao_agenda where reuniao_id = :'ra'),
  'marcada com "Criar no Google Agenda", vai para a fila: criar o evento na agenda de quem marcou');
select pg_temp.ok((select string_agg(email, ',' order by email) from app.v_reuniao_convidados where reuniao_id = :'ra') = 'carlos@exemplo.com,diretor@bkm.test',
  'convidados: o e-mail do usuário da BKM e o digitado do vendedor');
select pg_temp.falha(format($$select app.agenda_confirmar(%L, 'ev1')$$, :'ra'), 'só o servidor confirma o evento');
select pg_temp.falha(format($$update app.reuniao_participantes set resposta = 'aceito' where reuniao_id = %L$$, :'ra'), 'a resposta ao convite vem do Google, não da tela');
reset role;
set role service_role;
select app.agenda_confirmar(:'ra', 'ev1', 'https://calendar.google.com/ev1', 'https://meet.google.com/abc-defg-hij');
reset role;
select pg_temp.como(:'analista');
select pg_temp.ok((select situacao = 'sincronizada' and evento_id = 'ev1' and meet_link like 'https://meet.google.com/%' from app.reuniao_agenda where reuniao_id = :'ra'),
  'o servidor grava o evento e devolve o link do Meet');
update app.reunioes set inicio = inicio + interval '1 hour' where id = :'ra';
select pg_temp.ok((select situacao = 'pendente' and acao = 'atualizar' from app.reuniao_agenda where reuniao_id = :'ra'), 'mudou a hora no sistema, o evento volta para a fila para atualizar');
reset role; set role service_role;
select app.agenda_confirmar(:'ra', 'ev1');
select app.agenda_evento_mudou(:'ra', now() + interval '3 days', 90);
select app.agenda_resposta(:'ra', 'carlos@exemplo.com', 'aceito') as nresp \gset
reset role;
select pg_temp.como(:'analista');
select pg_temp.ok((select duracao_min = 90 and inicio > now() + interval '2 days' from app.reunioes where id = :'ra')
  and (select situacao = 'sincronizada' from app.reuniao_agenda where reuniao_id = :'ra') and :nresp = 1
  and (select resposta = 'aceito' from app.reuniao_participantes where reuniao_id = :'ra' and nome = 'Sr. Carlos'),
  'mudança feita direto na Agenda volta para a reunião sem voltar para a fila; a resposta do convidado aparece');
insert into app.reuniao_participantes (empresa_id, reuniao_id, lado, user_id) values (:'emp', :'ra', 'bkm', :'gestor');
select pg_temp.ok((select situacao = 'pendente' and acao = 'atualizar' from app.reuniao_agenda where reuniao_id = :'ra'), 'participante novo atualiza o convite');
reset role; set role service_role;
select app.agenda_confirmar(:'ra', null, p_erro => 'Token expirado');
reset role;
select pg_temp.como(:'analista');
select pg_temp.ok((select situacao = 'erro' and erro = 'Token expirado' from app.reuniao_agenda where reuniao_id = :'ra'), 'falha no Google fica registrada na reunião');
-- depois da reunião: gravação, transcrição e rascunho do resumo
reset role; set role service_role;
select app.agenda_confirmar(:'ra', 'ev1');
select app.registrar_gravacao(:'ra', 'https://drive.google.com/grav', 'https://docs.google.com/transc', 'Carlos: aceito 2,8 mi com permuta de 10 unidades.',
  'https://docs.google.com/anotacoes-gemini');
select pg_temp.falha(format('select app.registrar_resumo_ia(%L, %L, null, %L)', :'ra', 'x', 'chatgpt'), 'origem do resumo só Gemini ou a IA do sistema');
select app.registrar_resumo_ia(:'ra', 'Vendedor aceita 2,8 mi com permuta de 10 unidades.', '@analista manda a minuta até sexta.');
reset role;
select pg_temp.como(:'analista');
select pg_temp.ok((select resumo_situacao = 'rascunho' and resumo_origem = 'gemini' and anotacoes_url like '%anotacoes-gemini' and transcricao like 'Carlos:%' from app.reuniao_agenda where reuniao_id = :'ra')
  and (select resumo is null from app.reunioes where id = :'ra')
  and (select count(*) = 1 from app.notificacoes where tipo = 'reuniao_resumo' and origem_id = :'ra' and destinatario_id = :'analista'),
  'gravação, transcrição e Anotações do Gemini do Meet; o rascunho não mexe no resumo e avisa quem marcou');
select pg_temp.falha(format('select app.decidir_resumo_ia(%L, true)', :'ra'), 'aceitar o resumo pede a reunião realizada');
update app.reunioes set status = 'realizada', inicio = now() - interval '1 hour' where id = :'ra';
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.decidir_resumo_ia(%L, true)', :'ra'), 'Leitura não aceita o resumo');
select pg_temp.como(:'analista');
select app.decidir_resumo_ia(:'ra', true, 'Vendedor aceita 2,8 mi com permuta de 10 unidades (ajustado).');
select pg_temp.ok((select resumo like '%(ajustado).' and encaminhamentos like '@analista%' from app.reunioes where id = :'ra')
  and (select resumo_situacao = 'aceito' and resumo_decidido_por = :'analista' from app.reuniao_agenda where reuniao_id = :'ra'),
  'aceito com ajuste: vai para o que foi tratado e os encaminhamentos');
-- tirar da Agenda e cancelar
insert into app.reunioes (empresa_id, terreno_id, status, inicio, modalidade, local, na_agenda) values
  (:'emp', :'t1', 'agendada', now() + interval '5 days', 'presencial', 'bkm', true) returning id as rb \gset
reset role; set role service_role; select app.agenda_confirmar(:'rb', 'ev2'); reset role;
select pg_temp.como(:'analista');
update app.reunioes set status = 'cancelada' where id = :'rb';
select pg_temp.ok((select acao = 'cancelar' and situacao = 'pendente' from app.reuniao_agenda where reuniao_id = :'rb'), 'cancelar no sistema cancela o evento');
update app.reunioes set na_agenda = false where id = :'rb';
reset role; set role service_role; select app.agenda_confirmar(:'rb', null); reset role;
select pg_temp.como(:'analista');
select pg_temp.ok((select acao = 'remover' and evento_id is null and situacao = 'sincronizada' from app.reuniao_agenda where reuniao_id = :'rb'), 'tirar da Agenda remove o evento');

-- ---------------------------------------------------------------------
\echo '# conferência protótipo × banco (4/nov/2026)'
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, municipio_id, poligono_geojson)
  values (:'emp', 'Só o nome', :'analista', :'sp', pg_temp.quadra(-47.31, -23.31)) returning id as tcurto \gset
select pg_temp.ok((select origem_cadastro from app.terrenos where id = :'tcurto') = 'nao_informado',
  'o cadastro curto (só o nome) nasce com a origem "não informado"');
insert into app.matriculas (empresa_id, terreno_id, numero) values (:'emp', :'tcurto', '700.100');
select pg_temp.ok((select cartorio is null from app.matriculas where numero = '700.100'), 'matrícula entra sem cartório (não informado)');
select pg_temp.falha(format($$insert into app.matriculas (empresa_id, terreno_id, numero, cartorio) values (%L, %L, '700100', '9º RI')$$, :'emp', :'t1'),
  'cartório em branco conta como o mesmo: o número não entra noutro terreno com cartório');
select pg_temp.falha(format($$insert into app.matriculas (empresa_id, terreno_id, numero) values (%L, %L, '184.552')$$, :'emp', :'tcurto'),
  'nem o número de outro terreno entra sem cartório');
select pg_temp.ok((select certeza from app.buscar_duplicados(:'emp', '700100', '9º RI') limit 1) = 'certa', 'a busca de duplicados trata o cartório em branco como o mesmo');
select app.salvar_terreno(:'tcurto', (select versao from app.terrenos where id = :'tcurto'),
  jsonb_build_object('poligono_desenhado_geojson', pg_temp.quadra(-47.31, -23.31, 25))) as vcurto \gset
select pg_temp.ok((select poligono_desenhado_geojson is not null from app.terrenos where id = :'tcurto'),
  'a poligonal desenhada fica guardada quando a do terreno vira a soma dos lotes');

-- ---------------------------------------------------------------------
\echo '# área cadastral do terreno pela soma dos SQLs (6/nov/2026)'
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, municipio_id, poligono_geojson)
  values (:'emp', 'Soma dos SQLs', :'analista', :'sp', pg_temp.quadra(-47.33, -23.33)) returning id as tsq \gset
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao, area_cadastral_m2) values (:'emp', :'tsq', '501.001.0001-1', 400) returning id as sq1 \gset
select pg_temp.ok((select area_cadastral_m2 = 400 and area_cadastral_origem = 'sqls' from app.terrenos where id = :'tsq'), 'o primeiro SQL com área vira a cadastral do terreno');
insert into app.inscricoes_municipais (empresa_id, terreno_id, inscricao) values (:'emp', :'tsq', '501.001.0002-1') returning id as sq2 \gset
select pg_temp.ok((select area_cadastral_m2 is null from app.terrenos where id = :'tsq'), 'SQL sem área deixa a soma em branco (não soma pela metade)');
update app.inscricoes_municipais set area_cadastral_m2 = 250.5 where id = :'sq2';
select pg_temp.ok((select area_cadastral_m2 = 650.5 from app.terrenos where id = :'tsq'), 'com todos os SQLs com área, a cadastral é a soma');
select app.salvar_terreno(:'tsq', (select versao from app.terrenos where id = :'tsq'), '{"fonte_area_adotada":"cadastral"}') \gset
delete from app.inscricoes_municipais where id = :'sq2';
select pg_temp.ok((select area_cadastral_m2 = 400 and area_adotada_m2 = 400 from app.terrenos where id = :'tsq'), 'excluir SQL refaz a soma, e a adotada pela cadastral acompanha');
select app.salvar_terreno(:'tsq', (select versao from app.terrenos where id = :'tsq'), '{"area_cadastral_m2":420}') \gset
select pg_temp.ok((select area_cadastral_m2 = 420 and area_cadastral_origem = 'digitada' and area_adotada_m2 = 420 from app.terrenos where id = :'tsq'), 'valor digitado passa a valer');
update app.inscricoes_municipais set area_cadastral_m2 = 410 where id = :'sq1';
select pg_temp.ok((select area_cadastral_m2 = 420 from app.terrenos where id = :'tsq'), 'o SQL não sobrescreve a cadastral digitada');
select app.salvar_terreno(:'tsq', (select versao from app.terrenos where id = :'tsq'), '{"area_cadastral_m2":null}') \gset
select pg_temp.ok((select area_cadastral_m2 = 410 and area_cadastral_origem = 'sqls' from app.terrenos where id = :'tsq'), 'apagar a cadastral volta para a soma dos SQLs');
delete from app.inscricoes_municipais where id = :'sq1';
select pg_temp.ok((select area_cadastral_m2 is null and area_adotada_m2 is null and fonte_area_adotada is null from app.terrenos where id = :'tsq'),
  'sem SQL, sem cadastral; a adotada que era a cadastral fica em branco');

-- ---------------------------------------------------------------------
\echo '# ficha numa chamada só (6/nov/2026)'
select pg_temp.como(:'analista');
select pg_temp.ok((select (d->'v'->>'id') = :'tsq' and (d->'t'->>'nome') = 'Soma dos SQLs' and jsonb_typeof(d->'fases') = 'array'
    and (d->>'q_insc')::int = 0 and jsonb_typeof(d->'procs') = 'array'
  from (select app.ficha_dados(:'emp', (select codigo from app.terrenos where id = :'tsq')) d) x), 'a ficha vem inteira numa chamada');
select pg_temp.ok(app.ficha_dados(:'emp', 'Z999') is null, 'código que não existe devolve nulo');

-- ---------------------------------------------------------------------
\echo '# propostas por parte (9/nov/2026)'
select pg_temp.como(:'analista');
insert into app.terrenos (empresa_id, nome, responsavel_id, municipio_id, poligono_geojson)
  values (:'emp', 'Propostas por parte', :'analista', :'sp', pg_temp.quadra(-47.21, -23.21)) returning id as tpp \gset
select (app.registrar_oferta(:'tpp', 5000000)->>'processo_id') as npp \gset
select app.registrar_proposta(:'npp', 'bkm', 4000000, 'dinheiro') as q1 \gset
select pg_temp.ok((select array_agg(parte_id) from app.proposta_partes where proposta_id = :'q1') = (select array_agg(id) from app.terreno_partes where terreno_id = :'tpp'),
  'com uma parte só, a proposta é dela sem precisar escolher');
select app.salvar_parte(:'tpp', null, '{"nome":"Vizinho"}') as ppb \gset
select id as ppa from app.terreno_partes where terreno_id = :'tpp' and id <> :'ppb' \gset
select pg_temp.falha(format('select app.registrar_proposta(%L, %L, 100, %L)', :'npp', 'bkm', 'dinheiro'), 'com duas partes, escolher a parte é obrigatório');
select pg_temp.falha(format('select app.registrar_proposta(%L, %L, 100, %L, p_partes => %L)', :'npp', 'bkm', 'dinheiro', '{}'), 'lista vazia de partes é recusada');
select pg_temp.falha(format('select app.registrar_proposta(%L, %L, 100, %L, p_partes => array[%L]::uuid[])', :'npp', 'bkm', 'dinheiro', :'pa'),
  'parte de outro terreno é recusada');
select app.registrar_proposta(:'npp', 'bkm', 1500000, 'dinheiro', p_partes => array[:'ppb']::uuid[]) as q2 \gset
select pg_temp.ok((select versao from app.propostas where id = :'q2') = 2 and (select proposta_anterior_id is null from app.propostas where id = :'q2'),
  'a versão é uma só sequência; proposta a outra parte não responde à da primeira');
select app.registrar_proposta(:'npp', 'vendedor', 6000000, 'dinheiro', p_partes => array[:'ppa', :'ppb', :'ppa']::uuid[]) as q3 \gset
select pg_temp.ok((select count(*) from app.proposta_partes where proposta_id = :'q3') = 2, 'proposta a todas as partes (repetida conta uma vez)');
select pg_temp.ok((select count(*) from app.propostas where id in (:'q1', :'q2') and status = 'apresentada') = 2
    and (select proposta_anterior_id from app.propostas where id = :'q3') = :'q2'::uuid,
  'propostas sobrepostas ficam todas abertas; a nova só aponta para a mais recente com parte em comum');
reset role;
select pg_temp.ok((select ultima_proposta_valor from app.v_terrenos where id = :'tpp') = 6000000 and (select proposta_ativa_valor from app.v_terrenos where id = :'tpp') = 6000000
    and (select app.proposta_vigente(:'npp')) = :'q3'::uuid, 'nos resumos do terreno vale a última feita');
select pg_temp.como(:'analista');
select app.excluir_proposta(:'q2');
select pg_temp.ok(not exists (select 1 from app.propostas where id = :'q2') and (select proposta_anterior_id from app.propostas where id = :'q3') is null
    and exists (select 1 from app.auditoria where tabela = 'propostas' and registro_id = :'q2'::uuid and acao = 'delete'),
  'quem edita exclui uma proposta; a que apontava para ela passa à anterior dela, e o log fica');
select pg_temp.falha(format('select app.excluir_parte(%L)', :'ppb'), 'parte com proposta tem histórico: não se exclui');
reset role;  -- proposta antiga, de antes das partes
insert into app.propostas (empresa_id, processo_id, versao, origem, valor_total, forma_pagamento, status)
  values (:'emp', :'npp', 9, 'bkm', 100, 'dinheiro', 'apresentada') returning id as qv \gset
select pg_temp.como(:'analista');
select app.registrar_proposta(:'npp', 'bkm', 4500000, 'dinheiro', p_partes => array[:'ppa']::uuid[]) as q4 \gset
select pg_temp.ok((select status from app.propostas where id = :'qv') = 'apresentada' and (select proposta_anterior_id from app.propostas where id = :'q4') = :'qv'::uuid
    and (select versao from app.propostas where id = :'q4') = 10,
  'proposta antiga, sem parte informada, conta como de todas as partes');
select pg_temp.como(:'leitor');
select pg_temp.falha(format('select app.excluir_proposta(%L)', :'q4'), 'leitura não exclui proposta');
select pg_temp.como(:'gestor');
select app.remover_parte(:'ppb', 'Vendeu para outro');
select pg_temp.como(:'analista');
select pg_temp.falha(format('select app.registrar_proposta(%L, %L, 100, %L, p_partes => array[%L]::uuid[])', :'npp', 'bkm', 'dinheiro', :'ppb'),
  'parte tirada do terreno não recebe proposta');

\echo 'TODOS OS TESTES PASSARAM'
