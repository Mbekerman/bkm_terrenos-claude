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
select pg_temp.ok((select count(*) from app.fases_modelo) = 7 and (select count(*) from app.fase_dependencias) = 6
  and (select count(*) from app.etapas_modelo where fase = 'novos_negocios') = 4 and (select count(*) from app.subetapas_modelo where fase = 'novos_negocios') = 13,
  'empresa nova recebe a cópia do funil padrão: 7 fases encadeadas; Novos Negócios com 4 etapas e 13 subetapas');
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
select pg_temp.ok((select tipo_empreendimento = 'nao_informado' and potencial_tipo_m2 is null from app.v_urbanismo_vigente where terreno_id = :'t1'),
  'tipo do empreendimento não informado: sem potencial escolhido (nunca vira mercado sozinho)');
select versao as vt from app.terrenos where id = :'t1' \gset
select pg_temp.falha(format($$select app.salvar_terreno(%L, %s, '{"tipo_empreendimento":"r2v"}')$$, :'t1', :vt), 'tipo do empreendimento só mercado, HIS ou HMP');
select app.salvar_terreno(:'t1', :vt, '{"tipo_empreendimento":"his"}') as vt \gset
select pg_temp.ok((select potencial_tipo_m2 = 1400*6 + 520*3 from app.v_urbanismo_vigente where terreno_id = :'t1')
              and exists (select 1 from app.auditoria where tabela = 'terrenos' and registro_id = :'t1' and depois->>'tipo_empreendimento' = 'his'),
  'tipo HIS escolhido na ficha: potencial do tipo pela regra de EHIS, com log');
select pg_temp.ok((select to_maximo from app.v_lote_zonas where id = :'az1' and tipo = 'mercado') = 0.70, 'TO pelo tamanho do lote (1.920 m²: a de lote grande)');
select pg_temp.falha(format($$update app.analise_zoneamentos set ca_maximo = 2.5 where id = %L$$, :'az2'), 'exceção do lote exige a fonte');
select pg_temp.falha(format($$update app.analise_zoneamentos set gabarito_m = 30, gabarito_sem_limite = true, excecao_fonte = 'X' where id = %L$$, :'az2'), 'sem limite não leva valor');
select pg_temp.falha(format($$update app.analise_zoneamentos set ca_maximo = 0, excecao_fonte = 'X' where id = %L$$, :'az2'), 'CA nunca é zero');
update app.analise_zoneamentos set ca_maximo = 2.5, excecao_fonte = 'Consulta prévia 2026/123' where id = :'az2';
select pg_temp.ok((select ca_maximo = 2.5 and tem_excecao from app.v_lote_zonas where id = :'az2' and tipo = 'his')
              and (select potencial_mercado_m2 from app.v_urbanismo_vigente where terreno_id = :'t1') = 1400*4 + 520*2.5, 'exceção do lote vale por cima do catálogo');
select pg_temp.falha(format($$update app.analise_zoneamentos set recuo_frente_m = 0, excecao_fonte = null where id = %L$$, :'az1'), 'recuo alterado no lote também exige a fonte');
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
select app.definir_temperatura(:'neg', 4);
select pg_temp.ok((select temperatura from app.v_terrenos where id = :'t1') = 4, 'temperatura 4 registrada');
select pg_temp.falha(format('select app.definir_temperatura(%L, 6)', :'neg'), 'temperatura só de 1 a 5');
select pg_temp.ok((select count(*) from app.processo_transicoes where processo_id = :'neg' and evento = 'temperatura') = 1, 'mudança de temperatura vai para o histórico');
select app.definir_temperatura(:'neg', 2);
select app.definir_temperatura(:'neg', 3);
select pg_temp.ok((select count(*) = 1 and min(comentario) = '— → 3' from app.processo_transicoes where processo_id = :'neg' and evento = 'temperatura'),
  'cliques seguidos na temperatura viram um registro só, do valor de antes ao final');
select app.definir_temperatura(:'neg', null);
select pg_temp.ok((select count(*) from app.processo_transicoes where processo_id = :'neg' and evento = 'temperatura') = 0,
  'se a sequência volta ao valor de antes, não fica registro');
select app.definir_temperatura(:'neg', 4);
reset role;
update app.processo_transicoes set em = em - interval '8 seconds' where processo_id = :'neg' and evento = 'temperatura';
select pg_temp.como(:'diretor');
select app.definir_temperatura(:'neg', 5);
select pg_temp.ok((select string_agg(comentario, ' | ' order by em) from app.processo_transicoes where processo_id = :'neg' and evento = 'temperatura') = '— → 4 | 4 → 5',
  'passados 7 segundos, a mudança seguinte é outro registro');
select pg_temp.como(:'analista');
select app.definir_temperatura(:'neg', 4);
select pg_temp.ok((select count(*) from app.processo_transicoes where processo_id = :'neg' and evento = 'temperatura') = 3, 'outro usuário não junta com a mudança de quem veio antes');
select pg_temp.como(:'diretor');

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
-- limpa o que os testes seguintes contam (como superusuário)
reset role;
delete from app.terrenos where id = :'tsj';
delete from app.inscricoes_municipais where id in (:'gi', :'gi2', :'gdup');
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
select id as tlog from app.tarefas where titulo = 'Log A' \gset
update app.tarefas set prioridade = 'alta' where id = :'tlog';
update app.tarefas set prioridade = 'baixa' where id = :'tlog';
select pg_temp.ok((select count(*) = 1 and min(antes->>'prioridade') = 'media' and min(depois->>'prioridade') = 'baixa' from app.auditoria where registro_id = :'tlog' and acao = 'update'),
  'mudanças seguidas no mesmo campo viram um log só, do valor de antes ao final');
update app.tarefas set prioridade = 'media' where id = :'tlog';
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tlog' and acao = 'update') = 0, 'se voltou ao valor de antes, o log some');
update app.tarefas set prioridade = 'alta' where id = :'tlog';
update app.tarefas set titulo = 'Log A1' where id = :'tlog';
select pg_temp.ok((select count(*) from app.auditoria where registro_id = :'tlog' and acao = 'update') = 2, 'campo diferente é outro log');
reset role;
update app.auditoria set em = em - interval '8 seconds' where registro_id = :'tlog';
select pg_temp.como(:'diretor');
update app.tarefas set titulo = 'Log A2' where id = :'tlog';
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
select pg_temp.falha(format('select app.definir_temperatura(%L, 3)', :'ap'), 'temperatura só na negociação');
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
select pg_temp.ok((select ordem = 8 and prefixo = 'REG' and ativo and not entrada from app.fases_modelo where empresa_id = :'emp' and codigo = 'regularizacao'),
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
select app.salvar_parte(:'tv', null, '{"nome":"Família Souza","area_m2":2700}') as pa \gset
select app.salvar_parte(:'tv', null, '{"nome":"Carlos Pires","area_m2":2700}') as pb \gset
select pg_temp.falha(format($$select app.salvar_parte(%L, null, '{"nome":"Oficina","essencial":false}')$$, :'tv'), 'só gestor ou diretor marca parte como dispensável');
select app.salvar_parte(:'tv', null, '{"nome":"Oficina do Zé","area_m2":2700}') as pc \gset
select pg_temp.falha(format($$select app.salvar_parte(%L, null, '{"nome":"Fora","poligono":%s}')$$, :'tv', pg_temp.quadra(-46.7000, -23.7000, 30)), 'pedaço da parte fica dentro do terreno');
select pg_temp.falha(format($$insert into app.terreno_partes (empresa_id, terreno_id, nome) values (%L, %L, 'Direto')$$, :'emp', :'tv'), 'parte só entra pela RPC');
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, parte_id) values (:'emp', :'tv', '201.001', '9º RI', :'pa'), (:'emp', :'tv', '201.002', '9º RI', :'pa');
insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, parte_id) values (:'emp', :'tv', '201.003', '9º RI', :'pb');
select pg_temp.falha(format($$insert into app.matriculas (empresa_id, terreno_id, numero, cartorio, parte_id) values (%L, %L, '1', '1º RI', %L)$$, :'emp', :'t1', :'pa'), 'matrícula só entra em parte do próprio terreno');
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
select pg_temp.falha(format('select app.definir_temperatura(%L, 5)', :'na'), 'a temperatura é uma só: a parte não tem a sua');
select app.definir_temperatura(:'nv', 4);
select pg_temp.ok((select temperatura from app.v_terrenos where id = :'tv') = 4, 'temperatura da negociação do terreno dividido');
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
select app.salvar_parte(:'tw', null, '{"nome":"Dono 1"}') as qa \gset
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

\echo 'TODOS OS TESTES PASSARAM'
