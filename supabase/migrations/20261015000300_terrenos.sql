-- =====================================================================
-- BKM Terrenos · 0003 · terreno e tudo que descreve o imóvel
-- Regra: "não informado" é null (números) ou 'nao_informado' (seleções),
-- nunca zero nem "não".
-- =====================================================================

create sequence app.terreno_seq;

-- GeoJSON Polygon válido: anéis fechados, ≥ 4 posições, lon/lat dentro dos limites.
create or replace function app.geojson_poligono_valido(g jsonb)
returns boolean language sql immutable as $$
  select g->>'type' = 'Polygon'
     and jsonb_typeof(g->'coordinates') = 'array'
     and jsonb_array_length(g->'coordinates') >= 1
     and not exists (
       select 1 from jsonb_array_elements(g->'coordinates') anel
       where jsonb_typeof(anel) <> 'array' or jsonb_array_length(anel) < 4
          or anel->0 <> anel->-1
          or exists (select 1 from jsonb_array_elements(anel) pt
                     where jsonb_typeof(pt) <> 'array' or jsonb_array_length(pt) < 2
                        or jsonb_typeof(pt->0) <> 'number' or jsonb_typeof(pt->1) <> 'number'
                        or (pt->>0)::float8 not between -180 and 180 or (pt->>1)::float8 not between -90 and 90))
$$;

-- Sobreposição entre duas poligonais (geometria 4326). Conta como o mesmo chão
-- quando a área em comum passa de 1 m² e não é só a faixa de imprecisão do
-- desenho na divisa: conta se a parte em comum tem mais de p_folga_m de largura
-- (diâmetro do maior círculo que cabe nela, em metros, na projeção UTM do lugar)
-- ou se cobre metade de qualquer um dos dois, para que o mesmo lote estreito
-- desenhado duas vezes nunca passe sem aviso.
create or replace function app.sobreposicao(a extensions.geometry, b extensions.geometry, p_folga_m float8 default 5)
returns table (area_m2 float8, largura_m float8, pct_a float8, pct_b float8, conta boolean)
language sql immutable set search_path = '' as $$
  with i as (select extensions.st_collectionextract(extensions.st_intersection(a, b), 3) as g),
  m as (select extensions.st_area(i.g::extensions.geography) as ar,
               case when extensions.st_isempty(i.g) then 0
                    else 2 * (extensions.st_maximuminscribedcircle(extensions.st_transform(i.g, extensions._st_bestsrid(i.g::extensions.geography)))).radius end as lg,
               extensions.st_area(a::extensions.geography) as aa, extensions.st_area(b::extensions.geography) as ab from i)
  select ar, lg, 100 * ar / nullif(aa, 0), 100 * ar / nullif(ab, 0), ar >= 1 and (lg > p_folga_m or ar >= aa / 2 or ar >= ab / 2)
  from m
$$;
grant execute on function app.sobreposicao(extensions.geometry, extensions.geometry, float8) to authenticated;

create table app.terrenos (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references app.empresas(id),
  codigo                text not null,   -- TER-000123, posto pelo banco (app.tg_terreno_controle)

  -- 1. Identificação e gestão
  nome                  text not null check (length(trim(nome)) > 0),
  descricao             text,
  situacao_cadastral    text not null default 'ativo' check (situacao_cadastral in ('ativo','arquivado')),
  prioridade            text check (prioridade in ('baixa','media','alta','estrategica')),
  responsavel_id        uuid not null references auth.users(id),
  -- o cadastro curto (só o nome) não pergunta a origem: nasce "não informado" e se completa na ficha
  origem_cadastro       text not null default 'nao_informado'
                          check (origem_cadastro in ('nao_informado','prospeccao','corretor','indicacao','portal','proprietario','outro')),
  url_origem            text,
  data_identificacao    date not null default current_date,
  observacoes           text,
  arquivado_em          timestamptz,
  motivo_arquivamento   text,

  -- 2. Endereço e localização
  cep                   text check (cep is null or cep ~ '^\d{8}$'),  -- só dígitos (trigger normaliza)
  logradouro            text,
  numero                text,
  complemento           text,
  bairro                text,
  municipio_id          uuid not null references app.municipios(id),
  zona                  text check (zona in ('leste','oeste','norte','sul','centro','sudeste','sudoeste','nordeste','noroeste')),  -- mesma lista para qualquer cidade
  eixo_comercial_id     uuid references app.eixos_comerciais(id),
  referencia_localizacao text,
  -- cartório de registro de imóveis da circunscrição (3/nov/2026): vem da prefeitura (em São Paulo, a camada
  -- cartorio_registro_imovel do GeoSampa, pelo lote ou pelo pino) e o usuário pode trocar; aí vira 'digitado'
  cartorio              text,
  cartorio_origem       text check (cartorio_origem in ('prefeitura','digitado')),
  -- histórico de uso do terreno e dos vizinhos, pesquisado (fotos aéreas, matrícula, Cetesb); o automático
  -- são as áreas contaminadas da consulta à prefeitura (lote 2 da ficha em abas, 4/nov/2026)
  historico_uso         text,
  latitude              double precision check (latitude between -90 and 90),
  longitude             double precision check (longitude between -180 and 180),
  poligono_geojson      jsonb check (poligono_geojson is null or app.geojson_poligono_valido(poligono_geojson)),
  -- a poligonal desenhada, guardada quando a do terreno passa a ser a soma dos lotes da prefeitura
  -- (para poder voltar a ela); nula quando a do terreno é a desenhada
  poligono_desenhado_geojson jsonb check (poligono_desenhado_geojson is null or app.geojson_poligono_valido(poligono_desenhado_geojson)),
  -- a mesma poligonal como geometria (corrigida se o desenho se cruza), para achar sobreposição
  poligono              extensions.geometry(Geometry, 4326) generated always as
                          (extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(poligono_geojson::text), 4326))) stored,
  -- terrenos com que o usuário confirmou, ao cadastrar ou mudar a poligonal, que esta se sobrepõe ("é outro terreno")
  sobreposicoes_aceitas uuid[] not null default '{}',
  precisao_localizacao  text not null default 'nao_informada' check (precisao_localizacao in ('nao_informada','aproximada','conferida')),

  -- 3. Áreas e características físicas
  area_documental_m2    numeric(12,2) check (area_documental_m2 > 0),
  area_cadastral_m2     numeric(12,2) check (area_cadastral_m2 > 0),
  area_levantamento_m2  numeric(12,2) check (area_levantamento_m2 > 0),
  -- área do desenho, em m² inteiros: não é digitada e acompanha cada ajuste na poligonal (pedido do Moisés, 24/out/2026)
  area_poligonal_m2     numeric(12,2) generated always as
                          (round(extensions.st_area(extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(poligono_geojson::text), 4326))::extensions.geography)::numeric, 0)) stored,
  area_adotada_m2       numeric(12,2) check (area_adotada_m2 > 0),
  -- 'poligonal': a adotada é a área do desenho, recalculada pelo trigger t_norm a cada gravação
  fonte_area_adotada    text check (fonte_area_adotada in ('documental','cadastral','levantamento','estimativa','poligonal')),
  testada_principal_m   numeric(8,2) check (testada_principal_m > 0),
  desnivel_estimado_m   numeric(6,2),
  posicao_quadra        text not null default 'nao_informado' check (posicao_quadra in ('nao_informado','meio_quadra','esquina','duas_frentes','quadra_inteira')),
  formato               text not null default 'nao_informado' check (formato in ('nao_informado','regular','irregular')),
  situacao_ocupacao     text not null default 'nao_informado' check (situacao_ocupacao in ('nao_informado','vazio','ocupado','parcialmente_ocupado')),
  uso_atual             text,
  area_construida_existente_m2 numeric(12,2) check (area_construida_existente_m2 >= 0),
  area_construida_demolir_m2   numeric(12,2) check (area_construida_demolir_m2 >= 0),
  necessidade_demolicao text not null default 'nao_avaliada' check (necessidade_demolicao in ('nao_avaliada','provavel','confirmada','dispensada')),
  observacoes_fisicas   text,
  -- Visita técnica (aba Infraestrutura): data da última visita; os itens ficam em terreno_infraestrutura
  visita_tecnica_em     date,
  -- Classificação topográfica (decisão do Moisés, 3/nov/2026): medida pelas cotas dentro da poligonal
  -- (laser 2020 em São Paulo, Google fora), gravada só por app.registrar_topografia e apagada
  -- quando a poligonal muda (t_norm), para o front medir de novo. Perfil por app.classificar_topografia
  -- (sete níveis desde 4/nov/2026, pela declividade média; cortes do Moisés depois de medir 8 terrenos de São Paulo).
  topo_perfil           text check (topo_perfil in ('plano','inclinado','acidentado_leve','acidentado_mediano','acidentado_intenso','acidentado_agudo','acidentado_critico')),
  topo_declividade_pct  numeric(6,2) check (topo_declividade_pct >= 0),  -- média da inclinação em cada ponto (grade de 1 m no laser)
  topo_inclinacao_pct   numeric(6,2) check (topo_inclinacao_pct >= 0),   -- do plano que melhor se ajusta às cotas
  topo_terra_m3m2       numeric(7,3) check (topo_terra_m3m2 >= 0),       -- corte + aterro até esse plano ÷ área; nulo com cotas do Google
  topo_desnivel_m       numeric(7,2) check (topo_desnivel_m >= 0),
  topo_fonte            text check (topo_fonte in ('laser','google')),
  topo_calculado_em     timestamptz,
  topo_calculado_por    uuid,

  criado_por            uuid default auth.uid(),
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  atualizado_por        uuid,
  versao                int not null default 1,  -- sobe a cada alteração; protege edição simultânea
  unique (empresa_id, codigo),
  check ((latitude is null) = (longitude is null)),
  check (area_adotada_m2 is null or fonte_area_adotada is not null),
  check (situacao_cadastral = 'ativo' or (arquivado_em is not null and motivo_arquivamento is not null)),
  check (area_construida_demolir_m2 is null or area_construida_existente_m2 is null
         or area_construida_demolir_m2 <= area_construida_existente_m2),
  -- o cadastro começa pela poligonal: sem ela não há terreno
  check (poligono_geojson is not null),
  check ((topo_perfil is null) = (topo_fonte is null) and (topo_perfil is null) = (topo_calculado_em is null)),
  check (topo_fonte is distinct from 'laser' or topo_terra_m3m2 is not null)
);
create index on app.terrenos (empresa_id, situacao_cadastral);
create index on app.terrenos using gist (poligono);

-- Partes do terreno: cada dono, ou grupo de donos que negocia junto, com os
-- seus lotes, matrículas e inscrições. Sem parte cadastrada (ou com uma só),
-- o terreno é negociado de uma vez; com duas ou mais, a partir da etapa
-- indicada na fase de entrada (fases_modelo.etapa_partes) cada parte tem a
-- sua negociação, ligada à do terreno. Escrita só pelas RPCs salvar_parte e
-- remover_parte; parte nunca é apagada, sai com motivo (ativa = false).
create table app.terreno_partes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  nome             text not null check (length(trim(nome)) > 0),
  -- essencial: sem ela o terreno não serve; dispensável: dá para seguir sem ela (área menor)
  essencial        boolean not null default true,
  poligono_geojson jsonb check (poligono_geojson is null or app.geojson_poligono_valido(poligono_geojson)),
  area_m2          numeric(12,2) check (area_m2 > 0),
  observacoes      text,
  -- contato da parte (todos opcionais; decisão do Moisés, 4/nov/2026): a pessoa principal,
  -- telefone e CPF/CNPJ só com dígitos, e-mail em minúsculas (conferidos em app.salvar_parte)
  pessoa_nome      text,
  telefone         text check (telefone ~ '^\d{10,11}$'),
  email            text check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  documento        text check (documento ~ '^(\d{11}|\d{14})$'),
  ativa            boolean not null default true,
  removida_em      timestamptz,
  motivo_remocao   text,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  check (ativa = (removida_em is null)),
  check (ativa or length(trim(coalesce(motivo_remocao, ''))) > 0)
);
create unique index terreno_partes_nome on app.terreno_partes (terreno_id, lower(trim(nome))) where ativa;
create index on app.terreno_partes (terreno_id);

create table app.matriculas (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  terreno_id         uuid not null references app.terrenos(id) on delete cascade,
  numero             text not null,
  numero_norm        text generated always as (regexp_replace(numero, '\D', '', 'g')) stored,
  cartorio           text check (cartorio is null or length(trim(cartorio)) > 0),  -- nulo = não informado
  area_registrada_m2 numeric(12,2),
  data_certidao      date,
  parte_id           uuid references app.terreno_partes(id),  -- de qual dono; nulo = terreno de um dono só
  unique (empresa_id, cartorio, numero_norm)  -- mesma matrícula no mesmo cartório = mesmo terreno
);
create index on app.matriculas (terreno_id);
create index on app.matriculas (empresa_id, numero_norm);

-- Cartório em branco conta como o mesmo (decisão do Moisés, 4/nov/2026): a matrícula sem cartório
-- não entra se o número já está noutro terreno em qualquer cartório, e a com cartório não entra se o
-- número já está noutro terreno sem cartório. O índice único cuida de dois cartórios iguais.
create or replace function app.tg_matricula_repetida()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  select t.codigo into v from app.matriculas m join app.terrenos t on t.id = m.terreno_id
  where m.empresa_id = new.empresa_id and m.numero_norm = regexp_replace(new.numero, '\D', '', 'g') and m.id <> new.id
    and (new.cartorio is null or m.cartorio is null)
  limit 1;
  if v is not null then
    raise exception 'A matrícula % já está no terreno %', new.numero, v using errcode = '23505';
  end if;
  return new;
end $$;
create trigger t_repetida before insert or update of numero, cartorio, empresa_id on app.matriculas
  for each row execute function app.tg_matricula_repetida();

create table app.inscricoes_municipais (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references app.empresas(id),
  terreno_id        uuid not null references app.terrenos(id) on delete cascade,
  -- Cidade da inscrição, escolhida antes de digitar: a que tem base da prefeitura
  -- (app.bases_cadastrais) abre com a máscara dela e busca o lote. Nulo = outro
  -- município, sem base: inscrição digitada.
  municipio_id      uuid references app.municipios(id),
  inscricao         text not null,  -- SQL em São Paulo; inscrição imobiliária em São José dos Campos
  inscricao_norm    text generated always as (regexp_replace(inscricao, '\D', '', 'g')) stored,
  area_cadastral_m2 numeric(12,2),
  cib               text,  -- Cadastro Imobiliário Brasileiro (vem do GeoSampa)
  zona_fiscal       text,  -- ZF-1 a ZF-4 em São Paulo (vem do GeoSampa)
  parte_id          uuid references app.terreno_partes(id),  -- de qual dono; nulo = terreno de um dono só
  -- De onde veio (4/nov/2026): digitada, ou marcada no mapa de lotes da prefeitura ao cadastrar o
  -- terreno (São Paulo, GeoSampa). Entra sem parte e é ligada à parte depois, na aba Terreno.
  origem            text not null default 'digitada' check (origem in ('digitada', 'mapa_prefeitura')),
  endereco_prefeitura text,  -- logradouro e número de porta do cadastro da prefeitura (vem do mapa)
  unique nulls not distinct (empresa_id, municipio_id, inscricao_norm)
);
create index on app.inscricoes_municipais (terreno_id);

-- Consultas do lote na base da prefeitura pela inscrição (GeoSampa em São
-- Paulo, GeoSanja em São José dos Campos): o retrato do lote e de todas as
-- camadas que tocam a poligonal, com data. Cada consulta é uma linha nova e
-- nunca é alterada; gravada só por app.registrar_consulta_lote. A planta (PDF)
-- e o desenho (DXF) do lote vão para documentos (tipos lote_pdf e lote_dxf), com versão.
create table app.consultas_lote (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  inscricao_id     uuid references app.inscricoes_municipais(id) on delete set null,
  base             text not null references app.bases_cadastrais(codigo),
  inscricao_norm   text not null check (inscricao_norm ~ '^\d+$'),
  consultado_em    timestamptz not null default clock_timestamp(),
  consultado_por   uuid references auth.users(id) default auth.uid(),
  lote             jsonb not null check (jsonb_typeof(lote) = 'object'),   -- atributos do lote (o GeoSanja só manda a inscrição)
  poligono_geojson jsonb check (poligono_geojson is null or app.geojson_poligono_valido(poligono_geojson)),
  area_poligono_m2 numeric(12,2) check (area_poligono_m2 > 0),
  camadas          jsonb not null default '{}' check (jsonb_typeof(camadas) = 'object'), -- {camada: [atributos de cada feição que toca]}
  zonas            jsonb not null default '[]' check (jsonb_typeof(zonas) = 'array'),    -- [{sigla, area_m2}] porção de cada zona no lote
  camadas_com_erro text[] not null default '{}'  -- camadas que não responderam nesta consulta
);
create index on app.consultas_lote (terreno_id, consultado_em desc);

-- Consulta da base da prefeitura pela poligonal do terreno (sem inscrição): as
-- mesmas camadas da consulta do lote, para a área estudada inteira, mais o
-- perímetro de qualificação ambiental da Quota Ambiental (chave quota_ambiental,
-- calculada pelo Mapa 3 da Lei 16.402). Atributos de cada feição com _dist_m (distância
-- até a poligonal, nas camadas consultadas por raio). Linha nova a cada consulta;
-- gravada só por app.registrar_consulta_area.
create table app.consultas_area (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  base             text not null references app.bases_cadastrais(codigo),
  consultado_em    timestamptz not null default clock_timestamp(),
  consultado_por   uuid references auth.users(id) default auth.uid(),
  poligono_geojson jsonb not null check (app.geojson_poligono_valido(poligono_geojson)), -- a poligonal consultada
  camadas          jsonb not null default '{}' check (jsonb_typeof(camadas) = 'object'),
  camadas_com_erro text[] not null default '{}'
);
create index on app.consultas_area (terreno_id, consultado_em desc);

-- Valor venal e IPTU: por inscrição e exercício. Corrigir um valor cria
-- uma nova revisão; a anterior fica preservada e deixa de ser a vigente.
create table app.inscricao_valores (
  id                     uuid primary key default gen_random_uuid(),
  inscricao_id           uuid not null references app.inscricoes_municipais(id) on delete cascade,
  empresa_id             uuid not null references app.empresas(id),
  exercicio              int  not null check (exercicio between 1990 and 2100),
  revisao                int  not null default 1 check (revisao > 0),
  vigente                boolean not null default true,
  valor_venal_terreno    numeric(14,2) check (valor_venal_terreno >= 0),
  valor_venal_construcao numeric(14,2) check (valor_venal_construcao >= 0),
  valor_venal_imovel     numeric(14,2) check (valor_venal_imovel >= 0),
  situacao_iptu          text not null default 'nao_informada' check (situacao_iptu in ('nao_informada','tributado','isento')),
  iptu_valor_anual       numeric(12,2) check (iptu_valor_anual >= 0),
  iptu_parcelas          int  check (iptu_parcelas between 1 and 12),
  iptu_mensal_informado  numeric(12,2) check (iptu_mensal_informado >= 0),  -- quando a fonte só traz o mensal
  data_verificacao       date,
  fonte                  text,  -- carnê, certidão de dados cadastrais, portal da prefeitura...
  observacoes            text,
  criado_por             uuid default auth.uid(),
  criado_em              timestamptz not null default now(),
  unique (inscricao_id, exercicio, revisao),
  check (situacao_iptu <> 'isento' or (coalesce(iptu_valor_anual, 0) = 0 and coalesce(iptu_mensal_informado, 0) = 0)),
  check (valor_venal_imovel is null or valor_venal_terreno is null or valor_venal_construcao is null
         or valor_venal_imovel = valor_venal_terreno + valor_venal_construcao)
);
-- Só o exercício mais recente vale (decisão do Moisés, 4/nov/2026, no lugar do histórico por
-- exercício): um vigente por inscrição; lançar o ano novo aposenta o anterior, e as linhas
-- antigas ficam só como registro.
create unique index inscricao_valor_vigente on app.inscricao_valores (inscricao_id) where vigente;

-- Nova linha do mesmo exercício vira a próxima revisão e aposenta a anterior.
-- Linha gravada não muda (só deixa de ser vigente).
create or replace function app.tg_inscricao_valor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select coalesce(max(revisao), 0) + 1 into new.revisao from app.inscricao_valores
     where inscricao_id = new.inscricao_id and exercicio = new.exercicio;
    if new.valor_venal_imovel is null and new.valor_venal_terreno is not null and new.valor_venal_construcao is not null then
      new.valor_venal_imovel := new.valor_venal_terreno + new.valor_venal_construcao;
    end if;
    if new.exercicio < (select max(exercicio) from app.inscricao_valores where inscricao_id = new.inscricao_id) then
      raise exception 'Só vale o exercício mais recente (%): lance o IPTU do ano atual',
        (select max(exercicio) from app.inscricao_valores where inscricao_id = new.inscricao_id) using errcode = '23514';
    end if;
    update app.inscricao_valores set vigente = false
     where inscricao_id = new.inscricao_id and vigente;
    new.vigente := true;
    return new;
  end if;
  if (to_jsonb(old) - 'vigente') is distinct from (to_jsonb(new) - 'vigente') then
    raise exception 'Valores de um exercício não são alterados: lance uma nova revisão' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_revisao before insert or update on app.inscricao_valores for each row execute function app.tg_inscricao_valor();

-- Histórico não se apaga (regra 8; revisão de 2/nov/2026): a inscrição com
-- IPTU ou valor venal lançado, ou que está numa análise já substituída, não
-- sai do terreno; a análise substituída e as zonas dela não mudam mais.
-- Valem para quem usa o sistema (auth.uid); a manutenção pelo banco passa.
create or replace function app.tg_inscricao_historico()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then return old; end if;
  if exists (select 1 from app.inscricao_valores where inscricao_id = old.id) then
    raise exception 'A inscrição tem histórico de IPTU e valor venal: não se apaga' using errcode = '23514';
  end if;
  if exists (select 1 from app.analise_zoneamentos z join app.analises_urbanisticas a on a.id = z.analise_id
              where z.inscricao_id = old.id and a.status = 'substituida') then
    raise exception 'A inscrição está numa análise urbanística anterior: não se apaga' using errcode = '23514';
  end if;
  return old;
end $$;
create trigger t_historico before delete on app.inscricoes_municipais for each row execute function app.tg_inscricao_historico();

-- Medidas de terrenos irregulares: um segmento por linha.
create table app.confrontacoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  terreno_id    uuid not null references app.terrenos(id) on delete cascade,
  ordem         int  not null check (ordem > 0),
  tipo          text not null default 'outro' check (tipo in ('frente','lateral_direita','lateral_esquerda','fundos','outro')),
  comprimento_m numeric(8,2) check (comprimento_m > 0),
  confrontante  text,  -- rua, lote vizinho, matrícula confrontante
  fonte         text,
  observacoes   text,
  unique (terreno_id, ordem)
);

create table app.terreno_pessoas (
  id                      uuid primary key default gen_random_uuid(),
  empresa_id              uuid not null references app.empresas(id),
  terreno_id              uuid not null references app.terrenos(id) on delete cascade,
  pessoa_id               uuid not null references app.pessoas(id),
  papel                   text not null default 'proprietario' check (papel in ('proprietario','representante','procurador','contato')),
  percentual_participacao numeric(5,2) check (percentual_participacao > 0 and percentual_participacao <= 100),  -- na parte, quando há partes
  parte_id                uuid references app.terreno_partes(id),  -- dono (ou representante) de qual parte
  observacoes             text,
  unique (terreno_id, pessoa_id, papel),
  check (papel = 'proprietario' or percentual_participacao is null)
);

-- Participações conhecidas dos proprietários somam no máximo 100% (em cada parte, quando há partes).
create or replace function app.tg_soma_participacao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare total numeric;
begin
  if new.papel = 'proprietario' and new.percentual_participacao is not null then
    perform 1 from app.terrenos where id = new.terreno_id for update;
    select coalesce(sum(percentual_participacao), 0) into total from app.terreno_pessoas
     where terreno_id = new.terreno_id and papel = 'proprietario' and id <> new.id
       and parte_id is not distinct from new.parte_id;
    if total + new.percentual_participacao > 100 then
      raise exception '%', format('A soma das participações passaria de 100%% (já há %s%% informado)', total) using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger t_soma after insert or update on app.terreno_pessoas for each row execute function app.tg_soma_participacao();

-- Matrícula, inscrição e pessoa só entram numa parte ativa do mesmo terreno.
create or replace function app.tg_parte_do_terreno()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.parte_id is not null and not exists (
       select 1 from app.terreno_partes where id = new.parte_id and terreno_id = new.terreno_id and ativa) then
    raise exception 'A parte não é deste terreno ou já saiu dele' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_parte before insert or update of parte_id, terreno_id on app.matriculas for each row execute function app.tg_parte_do_terreno();
create trigger t_parte before insert or update of parte_id, terreno_id on app.inscricoes_municipais for each row execute function app.tg_parte_do_terreno();
create trigger t_parte before insert or update of parte_id, terreno_id on app.terreno_pessoas for each row execute function app.tg_parte_do_terreno();

create table app.terreno_corretores (
  terreno_id  uuid not null references app.terrenos(id) on delete cascade,
  corretor_id uuid not null references app.corretores(id),
  empresa_id  uuid not null references app.empresas(id),
  principal   boolean not null default false,
  observacoes text,
  primary key (terreno_id, corretor_id)
);
create unique index terreno_corretor_principal_unico on app.terreno_corretores (terreno_id) where principal;

-- Corretores de cada parte (vários donos): uma parte pode ter vários corretores e o mesmo corretor
-- pode trazer várias partes. Ligar o corretor à parte também o põe entre os corretores do terreno.
create table app.parte_corretores (
  parte_id    uuid not null references app.terreno_partes(id) on delete cascade,
  corretor_id uuid not null references app.corretores(id),
  empresa_id  uuid not null references app.empresas(id),
  primary key (parte_id, corretor_id)
);
create or replace function app.tg_parte_corretor()
returns trigger language plpgsql security definer set search_path = '' as $$
declare tp app.terreno_partes;
begin
  select * into tp from app.terreno_partes where id = new.parte_id;
  if tp.empresa_id is distinct from new.empresa_id
     or not exists (select 1 from app.corretores where id = new.corretor_id and empresa_id = new.empresa_id) then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  if not tp.ativa then raise exception 'A parte já saiu do terreno' using errcode = '23514'; end if;
  insert into app.terreno_corretores (terreno_id, corretor_id, empresa_id, principal)
  values (tp.terreno_id, new.corretor_id, tp.empresa_id,
          not exists (select 1 from app.terreno_corretores where terreno_id = tp.terreno_id and principal))
  on conflict do nothing;
  return new;
end $$;
create trigger t_parte before insert or update on app.parte_corretores for each row execute function app.tg_parte_corretor();

create table app.terreno_infraestrutura (
  terreno_id      uuid not null references app.terrenos(id) on delete cascade,
  item            text not null references app.itens_infraestrutura(codigo),
  empresa_id      uuid not null references app.empresas(id),
  disponibilidade text not null default 'nao_verificado' check (disponibilidade in ('nao_verificado','sim','parcial','nao','nao_se_aplica')),
  data_verificacao date,
  fonte           text,
  observacoes     text,
  primary key (terreno_id, item),
  check (disponibilidade = 'nao_verificado' or data_verificacao is not null)
);

-- Viabilidades técnicas das concessionárias (aba Infraestrutura; decisão do Moisés, 3/nov/2026):
-- uma linha por serviço com viabilidade_tecnica no catálogo (Energia, Água, Esgoto, Gás).
-- Retorno viável, não viável ou condicionado, com a data de validade; "vencida" sai da view.
create table app.terreno_viabilidades_tecnicas (
  terreno_id     uuid not null references app.terrenos(id) on delete cascade,
  servico        text not null references app.itens_infraestrutura(codigo),
  empresa_id     uuid not null references app.empresas(id),
  situacao       text not null default 'nao_solicitada' check (situacao in ('nao_solicitada','solicitada','viavel','condicionada','nao_viavel')),
  concessionaria text,
  solicitada_em  date,
  emitida_em     date,
  validade       date,
  condicoes      text,
  atualizado_em  timestamptz not null default now(),
  primary key (terreno_id, servico),
  -- retorno recebido tem data de emissão; validade nunca antes da emissão
  check (situacao in ('nao_solicitada','solicitada') or emitida_em is not null),
  check (validade is null or emitida_em is null or validade >= emitida_em)
);
create or replace function app.tg_viab_tecnica()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from app.itens_infraestrutura where codigo = new.servico and viabilidade_tecnica) then
    raise exception 'Serviço sem viabilidade técnica: %', new.servico using errcode = '23514';
  end if;
  new.condicoes := nullif(trim(new.condicoes), '');
  new.concessionaria := nullif(trim(new.concessionaria), '');
  new.atualizado_em := now();
  return new;
end $$;
create trigger t_viab before insert or update on app.terreno_viabilidades_tecnicas for each row execute function app.tg_viab_tecnica();

-- Limites da classificação topográfica, por empresa (Configurações › Topografia, só administrador,
-- por app.salvar_topografia_config). Sem linha, valem os padrões das colunas: declividade média até
-- 5% plano, 10% inclinado, 13% leve, 19% mediano, 24% intenso e 30% agudo; acima, ou com terra mexida
-- acima de 1,5 m³/m², crítico (cortes do Moisés, 4/nov/2026, depois de medir 8 terrenos de São Paulo).
create table app.topografia_config (
  empresa_id         uuid primary key references app.empresas(id) on delete cascade,
  plano_ate_pct      numeric(5,2) not null default 5   check (plano_ate_pct > 0),
  inclinado_ate_pct  numeric(5,2) not null default 10  check (inclinado_ate_pct > plano_ate_pct),
  leve_ate_pct       numeric(5,2) not null default 13  check (leve_ate_pct > inclinado_ate_pct),
  mediano_ate_pct    numeric(5,2) not null default 19  check (mediano_ate_pct > leve_ate_pct),
  intenso_ate_pct    numeric(5,2) not null default 24  check (intenso_ate_pct > mediano_ate_pct),
  agudo_ate_pct      numeric(5,2) not null default 30  check (agudo_ate_pct > intenso_ate_pct),
  critico_terra_m3m2 numeric(6,3) not null default 1.5 check (critico_terra_m3m2 > 0)
);
alter table app.topografia_config enable row level security;
create policy ver on app.topografia_config for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.topografia_config to authenticated;

-- Análise urbanística: uma vigente por terreno; as anteriores ficam como histórico.
create table app.analises_urbanisticas (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  responsavel_id   uuid references auth.users(id),
  data_verificacao date not null default current_date,
  fonte            text,  -- GeoSampa, GeoSanja, certidão de uso do solo, consulta prévia...
  status           text not null default 'vigente' check (status in ('vigente','substituida')),
  observacoes      text,
  criado_em        timestamptz not null default now()
);
create unique index analise_vigente_unica on app.analises_urbanisticas (terreno_id) where status = 'vigente';

-- Zonas da análise, por lote: cada linha é a porção de uma zona num lote
-- (inscrição) do terreno; inscricao_id nulo = parte do terreno sem inscrição,
-- com a zona tirada pela poligonal. Os parâmetros vêm do catálogo
-- (zona_parametros) pelo tipo de empreendimento; aqui só ficam a macrozona
-- (SJC) e as exceções do lote (eixo, operação urbana, consulta prévia...),
-- sempre com a fonte. Exceção nula = segue o catálogo.
create table app.analise_zoneamentos (
  id                         uuid primary key default gen_random_uuid(),
  empresa_id                 uuid not null references app.empresas(id),
  analise_id                 uuid not null references app.analises_urbanisticas(id) on delete cascade,
  inscricao_id               uuid references app.inscricoes_municipais(id) on delete cascade,
  zoneamento_id              uuid not null references app.zoneamentos(id),
  area_abrangida_m2          numeric(12,2) check (area_abrangida_m2 > 0),
  macrozona                  text check (macrozona in ('MC','ME','MOC')),
  -- valores alterados pelo usuário no lote (o preenchimento automático não é definitivo; decisão do Moisés, 25/out/2026)
  ca_minimo                  numeric(6,3) check (ca_minimo > 0),
  ca_basico                  numeric(6,3) check (ca_basico > 0),
  ca_maximo                  numeric(6,3) check (ca_maximo > 0),
  to_maximo                  numeric(4,3) check (to_maximo > 0 and to_maximo <= 1),
  gabarito_m                 numeric(6,2) check (gabarito_m > 0),
  gabarito_sem_limite        boolean,
  recuo_frente_m             numeric(5,2) check (recuo_frente_m >= 0),
  recuo_lateral_m            numeric(5,2) check (recuo_lateral_m >= 0),
  recuo_lateral_alto_m       numeric(5,2) check (recuo_lateral_alto_m >= 0),
  cota_parte_m2              numeric(8,2) check (cota_parte_m2 > 0),
  max_unidades               int check (max_unidades > 0),
  permeabilidade             numeric(4,3) check (permeabilidade > 0 and permeabilidade <= 1),
  lote_minimo_m2             numeric(10,2) check (lote_minimo_m2 > 0),
  frente_minima_m            numeric(6,2) check (frente_minima_m > 0),
  outorga_gratuita           boolean,
  excecao_fonte              text,
  restricoes_observacoes     text,
  unique nulls not distinct (analise_id, inscricao_id, zoneamento_id),
  check (not coalesce(gabarito_sem_limite and gabarito_m is not null, false)),
  check (num_nonnulls(ca_minimo, ca_basico, ca_maximo, to_maximo, gabarito_m, gabarito_sem_limite, recuo_frente_m, recuo_lateral_m, recuo_lateral_alto_m, cota_parte_m2, max_unidades, permeabilidade, lote_minimo_m2, frente_minima_m, outorga_gratuita) = 0
         or nullif(trim(excecao_fonte), '') is not null)
);

-- O lote da linha tem que ser do terreno da análise.
create or replace function app.tg_analise_zona_lote()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.inscricao_id is not null and not exists (
       select 1 from app.inscricoes_municipais i join app.analises_urbanisticas a on a.terreno_id = i.terreno_id
        where i.id = new.inscricao_id and a.id = new.analise_id) then
    raise exception 'O lote é de outro terreno' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_lote before insert or update on app.analise_zoneamentos for each row execute function app.tg_analise_zona_lote();

-- Nova análise vigente aposenta a anterior.
create or replace function app.tg_analise_vigente()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'vigente' then
    update app.analises_urbanisticas set status = 'substituida'
     where terreno_id = new.terreno_id and status = 'vigente' and id <> new.id;
  end if;
  return new;
end $$;
create trigger t_vigente before insert on app.analises_urbanisticas for each row execute function app.tg_analise_vigente();

create or replace function app.tg_analise_substituida()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_status text;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_table_name = 'analises_urbanisticas' then
    if old.status = 'substituida' then
      raise exception 'Análise substituída é histórico: não muda' using errcode = '23514';
    end if;
    return coalesce(new, old);
  end if;
  select status into v_status from app.analises_urbanisticas where id = coalesce(new.analise_id, old.analise_id);
  if v_status = 'substituida' or (tg_op = 'UPDATE' and (select status from app.analises_urbanisticas where id = old.analise_id) = 'substituida') then
    raise exception 'Análise substituída é histórico: não muda' using errcode = '23514';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_historico before update or delete on app.analises_urbanisticas for each row execute function app.tg_analise_substituida();
create trigger t_historico before insert or update or delete on app.analise_zoneamentos for each row execute function app.tg_analise_substituida();
create trigger t_aud after insert or update or delete on app.analises_urbanisticas for each row execute function app.tg_auditoria();

-- Entorno do terreno: lugares do Google a até o raio a pé da categoria, com a
-- distância e o tempo pela rota a pé. Buscado uma vez quando o terreno é localizado e
-- de novo só quando ele muda de lugar. Gravado só por app.salvar_entorno, que troca
-- a busca inteira; a busca vale para a coordenada guardada em terreno_entorno_buscas.
create table app.terreno_entorno_buscas (
  terreno_id   uuid primary key references app.terrenos(id) on delete cascade,
  empresa_id   uuid not null references app.empresas(id),
  latitude     double precision not null,
  longitude    double precision not null,
  rota_a_pe    boolean not null default true,   -- false: a rota a pé não respondeu e valeu a linha reta
  buscado_em   timestamptz not null default now(),
  buscado_por  uuid references auth.users(id) default auth.uid()
);
create table app.terreno_entorno (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  categoria        text not null references app.entorno_categorias(codigo),
  google_place_id  text not null,
  nome             text not null check (length(trim(nome)) > 0),
  latitude         double precision not null check (latitude between -90 and 90),
  longitude        double precision not null check (longitude between -180 and 180),
  distancia_pe_m   int not null check (distancia_pe_m >= 0),
  duracao_pe_s     int check (duracao_pe_s >= 0),
  distancia_reta_m int check (distancia_reta_m >= 0),
  excluido_em      timestamptz,   -- excluído pelo usuário neste terreno: some da ficha e continua fora nas buscas seguintes
  excluido_por     uuid references auth.users(id),
  unique (terreno_id, google_place_id)
);
create index on app.terreno_entorno (terreno_id, categoria, distancia_pe_m);

-- Distância de cada terreno aos pontos de interesse da empresa (todos aparecem na
-- ficha): a pé e de carro pela rota, medida no navegador para a coordenada guardada.
-- Gravada só por app.salvar_distancias_pontos.
create table app.terreno_ponto_distancias (
  terreno_id        uuid not null references app.terrenos(id) on delete cascade,
  ponto_id          uuid not null references app.pontos_interesse(id) on delete cascade,
  empresa_id        uuid not null references app.empresas(id),
  latitude          double precision not null,
  longitude         double precision not null,
  distancia_pe_m    int check (distancia_pe_m >= 0),
  duracao_pe_s      int check (duracao_pe_s >= 0),
  distancia_carro_m int check (distancia_carro_m >= 0),
  duracao_carro_s   int check (duracao_carro_s >= 0),
  calculado_em      timestamptz not null default now(),
  primary key (terreno_id, ponto_id)
);

-- Ponto da empresa excluído da ficha de um terreno (pedido do Moisés, 4/nov/2026): sai só
-- deste terreno e continua nos outros e no mapa. Gravada só por app.excluir_ponto_terreno
-- e apagada só por app.restaurar_ponto_terreno.
create table app.terreno_pontos_excluidos (
  id            uuid primary key default gen_random_uuid(),
  terreno_id    uuid not null references app.terrenos(id) on delete cascade,
  ponto_id      uuid not null references app.pontos_interesse(id) on delete cascade,
  empresa_id    uuid not null references app.empresas(id),
  excluido_em   timestamptz not null default now(),
  excluido_por  uuid references auth.users(id),
  unique (terreno_id, ponto_id)
);

-- Composição de áreas: terrenos vizinhos estudados em conjunto.
create table app.areas_interesse (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  nome        text not null,
  descricao   text,
  criado_em   timestamptz not null default now(),
  unique (empresa_id, nome)
);
create table app.area_interesse_terrenos (
  area_interesse_id uuid not null references app.areas_interesse(id) on delete cascade,
  terreno_id        uuid not null references app.terrenos(id) on delete cascade,
  empresa_id        uuid not null references app.empresas(id),
  primary key (area_interesse_id, terreno_id)
);

-- ---------------------------------------------------------------------
-- Integridade: filho na mesma empresa do pai
-- ---------------------------------------------------------------------
create or replace function app.tg_mesma_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid; j jsonb := to_jsonb(new);
begin
  if j ? 'terreno_id' and j->>'terreno_id' is not null then
    select empresa_id into v from app.terrenos where id = (j->>'terreno_id')::uuid;
  elsif j ? 'processo_id' and j->>'processo_id' is not null then
    select empresa_id into v from app.processos where id = (j->>'processo_id')::uuid;
  elsif j ? 'inscricao_id' and (j->>'inscricao_id' is not null or not j ? 'analise_id') then
    select empresa_id into v from app.inscricoes_municipais where id = (j->>'inscricao_id')::uuid;
  elsif j ? 'reuniao_id' and j->>'reuniao_id' is not null then
    select empresa_id into v from app.reunioes where id = (j->>'reuniao_id')::uuid;
  elsif j ? 'analise_id' then
    select empresa_id into v from app.analises_urbanisticas where id = (j->>'analise_id')::uuid;
  else
    return new;
  end if;
  if v is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  -- registro existente não muda de terreno nem de empresa
  if tg_op = 'UPDATE' and (to_jsonb(old)->'terreno_id' is distinct from j->'terreno_id' or old.empresa_id is distinct from new.empresa_id) then
    raise exception 'Um registro não pode ser transferido para outro terreno' using errcode = '23514';
  end if;
  -- processo informado tem que ser do mesmo terreno
  if j->>'processo_id' is not null and j->>'terreno_id' is not null and not exists (
       select 1 from app.processos where id = (j->>'processo_id')::uuid and terreno_id = (j->>'terreno_id')::uuid) then
    raise exception 'A negociação informada é de outro terreno' using errcode = '23514';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['terrenos','matriculas','inscricoes_municipais','inscricao_valores','confrontacoes','terreno_pessoas','terreno_corretores','parte_corretores',
                           'terreno_infraestrutura','terreno_viabilidades_tecnicas','analises_urbanisticas','analise_zoneamentos','areas_interesse','area_interesse_terrenos',
                           'terreno_entorno','terreno_entorno_buscas','terreno_ponto_distancias','terreno_pontos_excluidos','consultas_lote','consultas_area'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
    if t <> 'terrenos' and t <> 'areas_interesse' then
      execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_mesma_empresa()', t);
    end if;
  end loop;
  -- remover vínculos é permitido; terreno e análise nunca são apagados (arquivar / substituir)
  foreach t in array array['matriculas','inscricoes_municipais','confrontacoes','terreno_pessoas','terreno_corretores','parte_corretores','area_interesse_terrenos','analise_zoneamentos'] loop
    execute format('create policy remover on app.%I for delete to authenticated using (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant delete on app.%I to authenticated', t);
  end loop;
end $$;
grant usage on sequence app.terreno_seq to authenticated;

-- Entorno e distâncias aos pontos são gravados só pelas RPCs (salvar_entorno, salvar_distancias_pontos).
drop policy inserir on app.terreno_entorno;        drop policy alterar on app.terreno_entorno;
drop policy inserir on app.terreno_entorno_buscas; drop policy alterar on app.terreno_entorno_buscas;
drop policy inserir on app.terreno_ponto_distancias; drop policy alterar on app.terreno_ponto_distancias;
drop policy inserir on app.terreno_pontos_excluidos; drop policy alterar on app.terreno_pontos_excluidos;
revoke insert, update on app.terreno_entorno, app.terreno_entorno_buscas, app.terreno_ponto_distancias, app.terreno_pontos_excluidos from authenticated;
-- Consulta do lote na prefeitura: só pela RPC, e nunca alterada.
drop policy inserir on app.consultas_lote; drop policy alterar on app.consultas_lote;
revoke insert, update on app.consultas_lote from authenticated;
drop policy inserir on app.consultas_area; drop policy alterar on app.consultas_area;
revoke insert, update on app.consultas_area from authenticated;

-- Terreno é alterado só por app.salvar_terreno (confere a versão); inserir continua direto.
drop policy alterar on app.terrenos;
revoke update on app.terrenos from authenticated;
-- Valores de IPTU não são apagados nem editados pelo app: nova revisão.
revoke update on app.inscricao_valores from authenticated;
drop policy alterar on app.inscricao_valores;

create or replace function app.tg_normalizar_terreno()
returns trigger language plpgsql as $$
begin
  new.cep := nullif(regexp_replace(coalesce(new.cep, ''), '\D', '', 'g'), '');
  new.nome := trim(new.nome);
  -- adotada pela poligonal: segue o desenho (a coluna gerada só é calculada depois deste trigger)
  -- poligonal nova: a classificação topográfica era da forma antiga e é medida de novo pelo front
  if tg_op = 'UPDATE' and new.poligono_geojson::text is distinct from old.poligono_geojson::text then
    new.topo_perfil := null; new.topo_declividade_pct := null; new.topo_inclinacao_pct := null; new.topo_terra_m3m2 := null; new.topo_desnivel_m := null;
    new.topo_fonte := null; new.topo_calculado_em := null; new.topo_calculado_por := null;
  end if;
  if new.fonte_area_adotada = 'poligonal' then
    new.area_adotada_m2 := round(extensions.st_area(extensions.st_makevalid(extensions.st_setsrid(
      extensions.st_geomfromgeojson(new.poligono_geojson::text), 4326))::extensions.geography)::numeric, 0);
  end if;
  return new;
end $$;
create trigger t_norm before insert or update on app.terrenos for each row execute function app.tg_normalizar_terreno();

-- Cada terreno nasce com o seu quadro de tarefas (fluxo), com as listas do modelo da empresa.
create or replace function app.tg_terreno_quadro()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- o quadro nasce com as listas da empresa e, se houver, as tarefas do modelo padrão (responsável do terreno onde o modelo pede)
  perform fluxo.aplicar_padrao(fluxo.quadro_de(new.empresa_id, 'terreno', new.id), new.responsavel_id);
  return new;
end $$;
create trigger t_quadro after insert on app.terrenos for each row execute function app.tg_terreno_quadro();

-- Teto dos cartões (fluxo, visibilidade por cartão): quem não vê o terreno não
-- vê os cartões do quadro dele. Hoje vê quem é da empresa; os perfis de acesso
-- à seção Terrenos e a cada terreno entram aqui quando existirem.
create or replace function app.ve_terreno(p_terreno uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.terrenos t join app.membros m on m.empresa_id = t.empresa_id and m.user_id = p_user
                 where t.id = p_terreno) $$;
grant execute on function app.ve_terreno(uuid, uuid) to authenticated;
insert into fluxo.objeto_tipos (tipo, funcao) values ('terreno', 'app.ve_terreno');

-- Quadro do terreno de uma tarefa (nulo se a tarefa é de outro tipo de quadro).
create or replace function app.terreno_da_tarefa(p_tarefa uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select q.objeto_id from fluxo.tarefas k join fluxo.quadros q on q.id = k.quadro_id
  where k.id = p_tarefa and q.objeto_tipo = 'terreno' $$;

-- Poligonal que ocupa parte de outro terreno da empresa só entra se o usuário
-- confirmou que é outro terreno (sobreposicoes_aceitas). A tela pergunta antes,
-- com app.terrenos_sobrepostos; aqui é a garantia para qualquer caminho (importação, API).
create or replace function app.tg_terreno_sobreposicao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare g extensions.geometry; v record;
begin
  if tg_op = 'UPDATE' and new.poligono_geojson is not distinct from old.poligono_geojson
     and new.sobreposicoes_aceitas is not distinct from old.sobreposicoes_aceitas then return new; end if;
  g := extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(new.poligono_geojson::text), 4326));
  select t.codigo, t.nome, round(s.area_m2::numeric) as area into v
  from app.terrenos t cross join lateral app.sobreposicao(g, t.poligono) s
  where t.empresa_id = new.empresa_id and t.id <> new.id and t.poligono operator(extensions.&&) g
    and not (t.id = any(new.sobreposicoes_aceitas)) and s.conta
  order by s.area_m2 desc limit 1;
  if found then
    raise exception 'A poligonal ocupa % m² de % (%). Confirme que é outro terreno ou registre a oferta nele.', v.area, v.codigo, v.nome using errcode = '23P01';
  end if;
  return new;
end $$;
create trigger t_sobre before insert or update on app.terrenos for each row execute function app.tg_terreno_sobreposicao();

create trigger t_upd before update on app.terrenos for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.terrenos    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.matriculas  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.inscricoes_municipais for each row execute function app.tg_auditoria();

-- A inscrição escolhida numa cidade tem que ser da cidade do terreno (nulo = outro município).
create or replace function app.tg_inscricao_municipio()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.municipio_id is not null and new.municipio_id is distinct from (select municipio_id from app.terrenos where id = new.terreno_id) then
    raise exception 'A inscrição é de % e o terreno fica em outra cidade',
      (select nome from app.municipios where id = new.municipio_id) using errcode = '22023';
  end if;
  return new;
end $$;
create trigger t_mun before insert or update on app.inscricoes_municipais for each row execute function app.tg_inscricao_municipio();
create trigger t_aud after insert or update or delete on app.analise_zoneamentos  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.inscricao_valores    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.terreno_pessoas      for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.confrontacoes        for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.terreno_entorno_buscas for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.consultas_lote for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.consultas_area for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.terreno_viabilidades_tecnicas for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.topografia_config for each row execute function app.tg_auditoria();

-- Partes: leitura para a empresa; escrita só pelas RPCs (salvar_parte, remover_parte).
alter table app.terreno_partes enable row level security;
create policy ver on app.terreno_partes for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.terreno_partes to authenticated;

-- Todo terreno nasce com uma parte, a "Vendedor 1" (decisão do Moisés, 4/nov/2026). Matrículas e
-- inscrições se ligam direto à parte (parte_id, escrita direta conferida por t_parte); sem parte,
-- ficam no quadro de cima da aba Terreno até alguém arrastá-las para uma parte. Não há lote
-- (matrícula com os seus SQLs; decisão do Moisés de 4/nov/2026): área e divergência são da parte (app.v_partes).
create or replace function app.tg_terreno_parte_inicial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into app.terreno_partes (empresa_id, terreno_id, nome) values (new.empresa_id, new.id, 'Vendedor 1');
  return null;
end $$;
create trigger t_parte1 after insert on app.terrenos for each row execute function app.tg_terreno_parte_inicial();
create trigger t_emp before insert or update on app.terreno_partes for each row execute function app.tg_mesma_empresa();
create trigger t_aud after insert or update or delete on app.terreno_partes for each row execute function app.tg_auditoria();

-- só exclusão e restauração alteram um lugar; a busca troca as linhas sem passar por update
create trigger t_aud after update on app.terreno_entorno for each row execute function app.tg_auditoria();
create trigger t_aud after insert or delete on app.terreno_pontos_excluidos for each row execute function app.tg_auditoria();
