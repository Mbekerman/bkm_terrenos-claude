-- =====================================================================
-- Campos do terreno e da negociação (decisões do Moisés, 31/out/2026)
-- Catálogo fixo dos campos que o app oferece às condições ("Vale quando...")
-- e ao cartão da tarefa: do terreno, da negociação (processo da fase de
-- entrada), da oferta de referência, da proposta vigente e alguns
-- calculados. Cada empresa dá o título de cada campo (o nome que o usuário
-- vê, editável pelo administrador em Configurações › Campos) e marca se o
-- campo serve para condição e se pode ir para o cartão. Colunas de sistema
-- (código, empresa, datas de criação, versão, poligonal) ficam de fora.
-- O valor nunca é copiado: lê e grava no próprio registro. "Não informado"
-- (nulo, nao_informado, nao_avaliada...) é sempre campo em branco.
-- Condição: {"modo": "todas"|"qualquer", "itens": [{"campo", "op", "valores"},
-- {"grupo": {"modo", "itens"}}]}, com um nível de grupo. Operadores por tipo:
-- lista, pessoa e texto: em, fora, preenchido, vazio; número: igual, maior,
-- menor, entre, preenchido, vazio; data: antes, depois, ultimos_dias,
-- preenchido, vazio; sim/não: sim, nao, vazio. Fora "vazio" e "preenchido",
-- campo em branco nunca satisfaz a condição (não vira zero nem "não").
-- A forma de pagamento vigente é a da proposta vigente; sem proposta, a
-- pedida na oferta de referência.
-- =====================================================================
create table app.campos_catalogo (
  chave     text primary key check (chave ~ '^[a-z_]+\.[a-z0-9_]+$'),
  origem    text not null check (origem in ('terreno','negociacao','oferta','proposta','calculado')),
  coluna    text,                -- coluna da tabela da origem (nulo nos calculados)
  titulo    text not null,       -- título padrão
  tipo      text not null check (tipo in ('texto','numero','data','lista','lista_multi','pessoa','sim_nao')),
  unidade   text,                -- m², m, R$, %
  opcoes    text[],              -- valores da lista (nulo = vem do cadastro: etapas, municípios, corretores...)
  vazio     text,                -- o valor que quer dizer "não informado" na coluna (nao_informado...)
  editavel  boolean not null default false,  -- pode ser alterado pelo cartão
  condicao  boolean not null default false,  -- padrão: serve para condição
  cartao    boolean not null default false,  -- padrão: pode ir para o cartão
  -- máscara fixa do campo (1/nov/2026): moeda (R$), percentual (%), cep; nulo = o administrador pode dar uma ao texto
  formato   text check (formato in ('moeda','percentual','cep','email','telefone','cpf','cnpj')),
  ordem     int not null
);
create unique index campos_catalogo_titulo on app.campos_catalogo (lower(titulo));
grant select on app.campos_catalogo to authenticated;
-- Catálogo único, sem empresa: todo usuário logado lê, ninguém escreve pela API.
-- RLS ligada para o Security Advisor do Supabase (rls_disabled_in_public, 10/nov/2026).
alter table app.campos_catalogo enable row level security;
create policy campos_catalogo_ler on app.campos_catalogo for select to authenticated using (true);

insert into app.campos_catalogo (chave, origem, coluna, titulo, tipo, unidade, opcoes, vazio, editavel, condicao, cartao, ordem) values
  ('terreno.nome','terreno','nome','Nome do terreno','texto',null,null,null,true,false,true,1),
  ('terreno.descricao','terreno','descricao','Descrição','texto',null,null,null,true,false,false,2),
  ('terreno.situacao_cadastral','terreno','situacao_cadastral','Situação do cadastro','lista',null,'{ativo,arquivado}',null,false,true,false,3),
  ('terreno.prioridade','terreno','prioridade','Prioridade','lista',null,'{baixa,media,alta,estrategica}',null,true,true,true,4),
  ('terreno.responsavel_id','terreno','responsavel_id','Responsável do terreno','pessoa',null,null,null,true,true,true,5),
  ('terreno.origem_cadastro','terreno','origem_cadastro','Origem do terreno','lista',null,'{nao_informado,prospeccao,corretor,indicacao,portal,proprietario,outro}',null,true,true,false,6),
  ('terreno.data_identificacao','terreno','data_identificacao','Identificado em','data',null,null,null,true,false,false,8),
  ('terreno.observacoes','terreno','observacoes','Observações','texto',null,null,null,true,false,false,9),
  ('terreno.temperatura','terreno','temperatura','Temperatura','lista',null,'{1,2,3,4,5}',null,true,true,true,7),
  ('terreno.cep','terreno','cep','CEP','texto',null,null,null,true,false,false,10),
  ('terreno.logradouro','terreno','logradouro','Rua','texto',null,null,null,true,false,false,11),
  ('terreno.numero','terreno','numero','Número','texto',null,null,null,true,false,false,12),
  ('terreno.complemento','terreno','complemento','Complemento','texto',null,null,null,true,false,false,13),
  ('terreno.bairro','terreno','bairro','Bairro','texto',null,null,null,true,true,false,14),
  ('terreno.municipio_id','terreno','municipio_id','Município','lista',null,null,null,false,true,true,15),
  ('terreno.zona','terreno','zona','Zona da cidade','lista',null,'{leste,oeste,norte,sul,centro,sudeste,sudoeste,nordeste,noroeste}',null,true,true,false,16),
  ('terreno.eixo_comercial_id','terreno','eixo_comercial_id','Eixo comercial','lista',null,null,null,true,true,false,17),
  ('terreno.referencia_localizacao','terreno','referencia_localizacao','Ponto de referência','texto',null,null,null,true,false,false,18),
  ('terreno.precisao_localizacao','terreno','precisao_localizacao','Precisão da localização','lista',null,'{aproximada,conferida}','nao_informada',true,false,false,19),
  ('terreno.area_documental_m2','terreno','area_documental_m2','Área documental','numero','m²',null,null,true,true,true,20),
  ('terreno.area_cadastral_m2','terreno','area_cadastral_m2','Área cadastral','numero','m²',null,null,true,true,true,21),
  ('terreno.area_levantamento_m2','terreno','area_levantamento_m2','Área do levantamento','numero','m²',null,null,true,true,true,22),
  ('terreno.area_poligonal_m2','terreno','area_poligonal_m2','Área da poligonal','numero','m²',null,null,false,true,true,23),
  ('terreno.area_adotada_m2','terreno','area_adotada_m2','Área adotada','numero','m²',null,null,false,true,true,24),
  ('terreno.fonte_area_adotada','terreno','fonte_area_adotada','Fonte da área adotada','lista',null,'{documental,cadastral,levantamento,poligonal}',null,false,false,false,25),
  ('terreno.testada_principal_m','terreno','testada_principal_m','Testada principal','numero','m',null,null,true,true,true,26),
  -- medido pelas cotas (app.registrar_topografia); o relevo digitado saiu em 4/nov/2026 (decisão do Moisés)
  ('terreno.topo_perfil','terreno','topo_perfil','Perfil topográfico','lista',null,'{plano,inclinado,acidentado_leve,acidentado_mediano,acidentado_intenso,acidentado_agudo,acidentado_critico}',null,false,true,true,27),
  ('terreno.desnivel_estimado_m','terreno','desnivel_estimado_m','Desnível estimado','numero','m',null,null,true,true,true,28),
  ('terreno.posicao_quadra','terreno','posicao_quadra','Posição na quadra','lista',null,'{meio_quadra,esquina,duas_frentes,quadra_inteira}','nao_informado',true,false,false,29),
  ('terreno.formato','terreno','formato','Formato do lote','lista',null,'{regular,irregular}','nao_informado',true,false,false,30),
  ('terreno.situacao_ocupacao','terreno','situacao_ocupacao','Ocupação','lista',null,'{vazio,ocupado,parcialmente_ocupado}','nao_informado',true,true,true,31),
  ('terreno.uso_atual','terreno','uso_atual','Uso atual','texto',null,null,null,true,false,true,32),
  ('terreno.area_construida_existente_m2','terreno','area_construida_existente_m2','Área construída existente','numero','m²',null,null,true,false,true,33),
  ('terreno.area_construida_demolir_m2','terreno','area_construida_demolir_m2','Área a demolir','numero','m²',null,null,true,false,true,34),
  ('terreno.necessidade_demolicao','terreno','necessidade_demolicao','Precisa demolir','lista',null,'{provavel,confirmada,dispensada}','nao_avaliada',true,true,true,35),
  ('terreno.observacoes_fisicas','terreno','observacoes_fisicas','Observações físicas','texto',null,null,null,true,false,false,36),
  ('negociacao.etapa','negociacao','etapa_atual','Etapa','lista',null,null,null,false,true,false,40),
  ('negociacao.subetapa','negociacao','subetapa_atual','Subetapa','lista',null,null,null,false,true,false,41),
  ('negociacao.status','negociacao','status','Situação da negociação','lista',null,'{ativo,concluido,perdido,descartado,stand_by}',null,false,true,false,42),
  ('negociacao.responsavel_id','negociacao','responsavel_id','Responsável da negociação','pessoa',null,null,null,false,true,true,43),
  ('negociacao.data_inicio','negociacao','data_inicio','Início da negociação','data',null,null,null,false,false,false,45),
  ('negociacao.retomar_em','negociacao','retomar_em','Retomar em (Stand By)','data',null,null,null,false,false,false,46),
  ('negociacao.motivo_encerramento','negociacao','motivo_encerramento','Motivo do encerramento','lista',null,null,null,false,false,false,47),
  ('oferta.valor_pedido','oferta','valor_pedido','Preço pedido','numero','R$',null,null,true,true,true,50),
  ('oferta.forma_pagamento_pedida','oferta','forma_pagamento_pedida','Forma de pagamento pedida','lista',null,'{dinheiro,permuta_fisica,permuta_financeira,permuta_geral,permuta_com_torna}',null,true,false,true,51),
  ('oferta.observacao_pagamento','oferta','observacao_pagamento','Observação do pagamento','texto',null,null,null,true,false,false,52),
  ('oferta.aceita_permuta','oferta','aceita_permuta','Aceita permuta','texto',null,null,null,true,false,true,53),
  ('oferta.comissao_pct','oferta','comissao_pct','Comissão (%)','numero','%',null,null,true,true,false,54),
  ('oferta.comissao_valor','oferta','comissao_valor','Comissão (R$)','numero','R$',null,null,true,false,false,55),
  ('oferta.corretor_id','oferta','corretor_id','Corretor','lista',null,null,null,false,true,true,56),
  ('oferta.ofertante_id','oferta','ofertante_id','Quem ofereceu','lista',null,null,null,false,false,false,57),
  ('oferta.data_oferta','oferta','data_oferta','Data da oferta','data',null,null,null,true,false,false,58),
  ('oferta.validade','oferta','validade','Validade da oferta','data',null,null,null,true,false,false,59),
  ('proposta.valor_total','proposta','valor_total','Valor da proposta vigente','numero','R$',null,null,false,true,true,60),
  ('proposta.forma_pagamento','proposta','forma_pagamento','Forma de pagamento proposta','lista',null,'{dinheiro,permuta_fisica,permuta_financeira,permuta_geral,permuta_com_torna}',null,false,false,false,61),
  ('proposta.condicoes_pagamento','proposta','condicoes_pagamento','Condições de pagamento','texto',null,null,null,false,false,false,62),
  ('proposta.origem','proposta','origem','Quem propôs','lista',null,'{bkm,vendedor}',null,false,true,false,63),
  ('proposta.status','proposta','status','Situação da proposta','lista',null,'{apresentada,em_analise,aceita}',null,false,true,false,64),
  ('proposta.data_apresentacao','proposta','data_apresentacao','Proposta apresentada em','data',null,null,null,false,false,false,65),
  ('proposta.validade','proposta','validade','Validade da proposta','data',null,null,null,false,false,false,66),
  ('calculado.forma_pagamento_vigente','calculado',null,'Forma de pagamento vigente','lista',null,'{dinheiro,permuta_fisica,permuta_financeira,permuta_geral,permuta_com_torna}',null,false,true,true,70),
  ('calculado.margem_liquida','calculado',null,'Margem líquida do estudo válido','numero','%',null,null,false,true,true,71),
  ('calculado.vgv','calculado',null,'VGV do estudo válido','numero','R$',null,null,false,true,true,72),
  ('calculado.preco_m2','calculado',null,'Preço pedido por m²','numero','R$',null,null,false,true,true,73),
  ('calculado.zonas','calculado',null,'Zonas da área','lista_multi',null,null,null,false,true,true,74),
  ('calculado.tem_partes','calculado',null,'Vários donos','sim_nao',null,null,null,false,true,false,75),
  ('calculado.corretores','calculado',null,'Corretores do terreno ou das partes','lista_multi',null,null,null,false,true,false,76);

update app.campos_catalogo set formato = case when chave = 'terreno.cep' then 'cep' when unidade = 'R$' then 'moeda' when unidade = '%' then 'percentual' end;

-- O que cada empresa escolheu (sem linha, vale o catálogo)
create table app.campos_empresa (
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  chave       text not null references app.campos_catalogo(chave),
  titulo      text check (titulo is null or length(trim(titulo)) > 0),   -- nulo = título padrão
  condicao    boolean not null,
  cartao      boolean not null,
  formato     text check (formato in ('email','telefone','cpf','cnpj')),   -- máscara do texto dada pelo administrador (só campo de texto sem máscara fixa)
  primary key (empresa_id, chave)
);
alter table app.campos_empresa enable row level security;
create policy ver on app.campos_empresa for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.campos_empresa to authenticated;
create trigger t_aud after insert or update or delete on app.campos_empresa for each row execute function app.tg_auditoria();

-- Campos novos do terreno (jornada, 1/nov/2026): o administrador cria, numa pergunta
-- da jornada ou em Configurações › Campos, o campo que o terreno ainda não tem. A
-- chave é personalizado.<codigo> e o campo entra em tudo que usa o catálogo:
-- condição, cartão da tarefa, jornada. O valor mora em app.terreno_valores, um por
-- terreno (fonte única: a ficha, o cartão e a jornada leem e gravam o mesmo valor).
-- Com valor, o tipo não muda e o campo não se apaga (desativa).
create table app.campos_terreno (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  codigo      text not null check (codigo ~ '^[a-z0-9_]+$'),
  titulo      text not null check (length(trim(titulo)) > 0),
  tipo        text not null check (tipo in ('texto','numero','data','lista','sim_nao')),
  unidade     text,
  opcoes      text[],
  formato     text check (formato in ('moeda','percentual','email','telefone','cpf','cnpj')),
  condicao    boolean not null default true,
  cartao      boolean not null default true,
  ativo       boolean not null default true,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now(),
  unique (empresa_id, codigo),
  check ((tipo = 'lista') = (opcoes is not null and cardinality(opcoes) >= 2)),
  check (formato is null or (tipo = 'texto' and formato in ('email','telefone','cpf','cnpj')) or (tipo = 'numero' and formato in ('moeda','percentual')))
);
create unique index campos_terreno_titulo on app.campos_terreno (empresa_id, lower(titulo));
create table app.terreno_valores (
  empresa_id    uuid not null references app.empresas(id) on delete cascade,
  terreno_id    uuid not null references app.terrenos(id) on delete cascade,
  campo_id      uuid not null references app.campos_terreno(id),
  valor         jsonb not null,
  alterado_por  uuid default auth.uid(),
  alterado_em   timestamptz not null default clock_timestamp(),
  primary key (terreno_id, campo_id)
);
alter table app.campos_terreno enable row level security;
alter table app.terreno_valores enable row level security;
create policy ver on app.campos_terreno for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy ver on app.terreno_valores for select to authenticated using (empresa_id in (select app.minhas_empresas()) and app.ve_terreno(terreno_id));
grant select on app.campos_terreno, app.terreno_valores to authenticated;
create trigger t_aud after insert or update or delete on app.campos_terreno for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.terreno_valores for each row execute function app.tg_auditoria();

-- Definição do campo para a empresa (título, condição e cartão já com a escolha dela)
create or replace function app.campo_def(p_empresa uuid, p_chave text)
returns table (chave text, origem text, coluna text, titulo text, tipo text, unidade text, opcoes text[], vazio text, editavel boolean, condicao boolean, cartao boolean, formato text)
language sql stable security definer set search_path = '' as $$
  select c.chave, c.origem, c.coluna, coalesce(x.titulo, c.titulo), c.tipo, c.unidade, c.opcoes, c.vazio, c.editavel,
         coalesce(x.condicao, c.condicao), coalesce(x.cartao, c.cartao), coalesce(c.formato, x.formato)
  from app.campos_catalogo c left join app.campos_empresa x on x.empresa_id = p_empresa and x.chave = c.chave
  where c.chave = p_chave
  union all
  -- campo novo do terreno: desativado, só leitura e fora das condições e do cartão
  select 'personalizado.' || k.codigo, 'personalizado', null, k.titulo, k.tipo, k.unidade, k.opcoes, null, k.ativo,
         k.condicao and k.ativo, k.cartao and k.ativo, k.formato
  from app.campos_terreno k where k.empresa_id = p_empresa and 'personalizado.' || k.codigo = p_chave $$;

create view app.v_campos with (security_invoker = true) as
select e.empresa_id, c.chave, c.origem, c.coluna, c.titulo as titulo_padrao, coalesce(x.titulo, c.titulo) as titulo, c.tipo, c.unidade, c.opcoes,
       c.editavel, coalesce(x.condicao, c.condicao) as condicao, coalesce(x.cartao, c.cartao) as cartao, coalesce(c.formato, x.formato) as formato, c.ordem
from app.campos_catalogo c
cross join lateral app.minhas_empresas() e(empresa_id)
left join app.campos_empresa x on x.empresa_id = e.empresa_id and x.chave = c.chave
union all
select k.empresa_id, 'personalizado.' || k.codigo, 'personalizado', null, k.titulo, k.titulo, k.tipo, k.unidade, k.opcoes,
       k.ativo, k.condicao and k.ativo, k.cartao and k.ativo, k.formato, 1000
from app.campos_terreno k where k.empresa_id in (select app.minhas_empresas());
grant select on app.v_campos to authenticated;

-- Administrador: título (vazio volta ao padrão; dois campos não têm o mesmo título), condição, cartão e,
-- no campo de texto sem máscara fixa, a máscara (nulo mantém; '' tira; o valor que já está no registro precisa seguir a nova)
create or replace function app.salvar_campo(p_empresa uuid, p_chave text, p_titulo text, p_condicao boolean, p_cartao boolean, p_formato text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare c app.campos_catalogo; v_tit text; v_fmt text; v_ter uuid;
begin
  perform app.exigir_administrador(p_empresa);
  select * into c from app.campos_catalogo where chave = p_chave;
  if c.chave is null then raise exception 'Campo desconhecido: %', p_chave using errcode = 'P0002'; end if;
  v_tit := nullif(trim(p_titulo), '');
  if v_tit = c.titulo then v_tit := null; end if;
  if exists (select 1 from app.campos_catalogo o left join app.campos_empresa x on x.empresa_id = p_empresa and x.chave = o.chave
             where o.chave <> p_chave and lower(coalesce(x.titulo, o.titulo)) = lower(coalesce(v_tit, c.titulo)))
     or exists (select 1 from app.campos_terreno k where k.empresa_id = p_empresa and lower(k.titulo) = lower(coalesce(v_tit, c.titulo))) then
    raise exception 'Já existe um campo com o título %', coalesce(v_tit, c.titulo) using errcode = '23505';
  end if;
  v_fmt := case when p_formato is null then (select formato from app.campos_empresa where empresa_id = p_empresa and chave = p_chave) else nullif(p_formato, '') end;
  if v_fmt is not null then
    if c.tipo <> 'texto' or c.formato is not null then raise exception 'O campo % não aceita máscara', c.titulo using errcode = '22023'; end if;
    if v_fmt not in ('email','telefone','cpf','cnpj') then raise exception 'Máscara desconhecida: %', v_fmt using errcode = '22023'; end if;
    for v_ter in select id from app.terrenos where empresa_id = p_empresa loop
      if not fluxo._formato_ok(v_fmt, app._valor_campo(v_ter, p_chave) #>> '{}') and app._valor_campo(v_ter, p_chave) is not null then
        raise exception 'Há terrenos com % fora dessa máscara: corrija antes de ligar', c.titulo using errcode = '23514';
      end if;
    end loop;
  end if;
  insert into app.campos_empresa (empresa_id, chave, titulo, condicao, cartao, formato)
  values (p_empresa, p_chave, v_tit, coalesce(p_condicao, c.condicao), coalesce(p_cartao, c.cartao), v_fmt)
  on conflict (empresa_id, chave) do update set titulo = excluded.titulo, condicao = excluded.condicao, cartao = excluded.cartao, formato = excluded.formato;
end $$;

-- A negociação do terreno: o processo da fase de entrada sem parte (o aberto; senão, o mais recente)
create or replace function app.negociacao_do_terreno(p_terreno uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select p.id from app.processos p join app.fases_modelo f on f.empresa_id = p.empresa_id and f.codigo = p.fase and f.entrada
  where p.terreno_id = p_terreno and p.parte_id is null
  order by p.status in ('ativo','stand_by') desc, p.data_inicio desc limit 1 $$;

-- Oferta de referência: a da negociação; sem ela, a ativa mais recente do terreno
create or replace function app.oferta_do_terreno(p_terreno uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select n.oferta_referencia_id from app.negociacoes n where n.processo_id = app.negociacao_do_terreno(p_terreno)),
    (select o.id from app.ofertas o where o.terreno_id = p_terreno and o.status = 'ativa' order by o.data_oferta desc, o.id limit 1)) $$;

-- Proposta vigente: a última versão apresentada, em análise ou aceita da negociação
create or replace function app.proposta_vigente(p_processo uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from app.propostas where processo_id = p_processo and status in ('apresentada','em_analise','aceita')
  order by versao desc limit 1 $$;

-- Valor do campo no terreno (jsonb; nulo = em branco). Não confere quem vê: uso interno.
create or replace function app._valor_campo(p_terreno uuid, p_chave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c app.campos_catalogo; v jsonb; v_proc uuid; v_of uuid; v_prop uuid;
begin
  if p_chave like 'personalizado.%' then
    select x.valor into v from app.terreno_valores x join app.campos_terreno k on k.id = x.campo_id
    where x.terreno_id = p_terreno and 'personalizado.' || k.codigo = p_chave;
    return case when v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and v #>> '{}' = '') then null else v end;
  end if;
  select * into c from app.campos_catalogo where chave = p_chave;
  if c.chave is null then return null; end if;
  if c.origem = 'terreno' then
    execute format('select to_jsonb(t.%I) from app.terrenos t where t.id = $1', c.coluna) into v using p_terreno;
  elsif c.origem = 'negociacao' then
    v_proc := app.negociacao_do_terreno(p_terreno);
    execute format('select to_jsonb(p.%I) from app.processos p where p.id = $1', c.coluna) into v using v_proc;
  elsif c.origem = 'oferta' then
    execute format('select to_jsonb(o.%I) from app.ofertas o where o.id = $1', c.coluna) into v using app.oferta_do_terreno(p_terreno);
  elsif c.origem = 'proposta' then
    execute format('select to_jsonb(x.%I) from app.propostas x where x.id = $1', c.coluna) into v using app.proposta_vigente(app.negociacao_do_terreno(p_terreno));
  else
    v_proc := app.negociacao_do_terreno(p_terreno);
    v := case p_chave
      when 'calculado.forma_pagamento_vigente' then
        to_jsonb(coalesce((select forma_pagamento from app.propostas where id = app.proposta_vigente(v_proc)),
                          (select forma_pagamento_pedida from app.ofertas where id = app.oferta_do_terreno(p_terreno))))
      when 'calculado.margem_liquida' then
        (select to_jsonb(vi.margem_pct) from app.processos p join app.viabilidades vi on vi.id = p.viabilidade_id where p.id = v_proc)
      when 'calculado.vgv' then
        (select to_jsonb(vi.vgv) from app.processos p join app.viabilidades vi on vi.id = p.viabilidade_id where p.id = v_proc)
      when 'calculado.preco_m2' then
        (select to_jsonb(round(o.valor_pedido / t.area_adotada_m2, 2)) from app.ofertas o, app.terrenos t
         where o.id = app.oferta_do_terreno(p_terreno) and t.id = p_terreno and t.area_adotada_m2 > 0)
      when 'calculado.zonas' then
        (select jsonb_agg(distinct z.sigla) from app.analises_urbanisticas a join app.analise_zoneamentos az on az.analise_id = a.id
         join app.zoneamentos z on z.id = az.zoneamento_id where a.terreno_id = p_terreno and a.status = 'vigente')
      when 'calculado.tem_partes' then
        to_jsonb(exists (select 1 from app.terreno_partes where terreno_id = p_terreno))
      when 'calculado.corretores' then
        (select jsonb_agg(distinct corretor_id) from app.terreno_corretores where terreno_id = p_terreno)
    end;
  end if;
  if v is null or v = 'null'::jsonb or v = '[]'::jsonb or (jsonb_typeof(v) = 'string' and (v #>> '{}' = c.vazio or v #>> '{}' = '')) then
    return null;
  end if;
  return v;
end $$;

-- Campo do terreno como o cartão mostra (registrado em fluxo.objeto_tipos.campo_objeto)
create or replace function app.campo_cartao(p_terreno uuid, p_chave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare d record; v_emp uuid;
begin
  select empresa_id into v_emp from app.terrenos where id = p_terreno;
  if v_emp is null or (auth.uid() is not null and not app.ve_terreno(p_terreno)) then return null; end if;
  select * into d from app.campo_def(v_emp, p_chave);
  if d.chave is null then return null; end if;
  return jsonb_build_object('titulo', d.titulo, 'tipo', d.tipo, 'unidade', d.unidade, 'opcoes', to_jsonb(d.opcoes), 'formato', d.formato, 'editavel', d.editavel,
                            'cartao', d.cartao, 'valor', app._valor_campo(p_terreno, p_chave));
end $$;

-- Confere a condição (registrado em fluxo.objeto_tipos.valida_condicao): só campos marcados para
-- condição na empresa, operador do tipo do campo, valores no formato certo, um nível de grupo.
create or replace function app.validar_condicao(p_empresa uuid, p_cond jsonb, p_nivel int default 0)
returns void language plpgsql stable security definer set search_path = '' as $$
declare it jsonb; d record; v_op text; n int; x jsonb;
begin
  if p_cond is null then return; end if;
  if jsonb_typeof(p_cond) <> 'object' or coalesce(p_cond->>'modo', '') not in ('todas','qualquer') or jsonb_typeof(p_cond->'itens') is distinct from 'array'
     or jsonb_array_length(p_cond->'itens') = 0 then
    raise exception 'Condição inválida: diga se valem todas ou qualquer uma e ponha ao menos uma condição' using errcode = '22023';
  end if;
  for it in select * from jsonb_array_elements(p_cond->'itens') loop
    if it ? 'grupo' then
      if p_nivel > 0 then raise exception 'A condição aceita só um nível de grupo' using errcode = '22023'; end if;
      perform app.validar_condicao(p_empresa, it->'grupo', 1);
      continue;
    end if;
    select * into d from app.campo_def(p_empresa, it->>'campo');
    if d.chave is null then raise exception 'Campo desconhecido na condição: %', it->>'campo' using errcode = '22023'; end if;
    if not d.condicao then raise exception 'O campo % não está liberado para condição', d.titulo using errcode = '22023'; end if;
    v_op := it->>'op';
    if v_op is null or not (v_op = any (case
         when d.tipo in ('lista','lista_multi','pessoa','texto') then array['em','fora','preenchido','vazio']
         when d.tipo = 'numero' then array['igual','maior','menor','entre','preenchido','vazio']
         when d.tipo = 'data' then array['antes','depois','ultimos_dias','preenchido','vazio']
         else array['sim','nao','vazio'] end)) then
      raise exception 'Operador % não serve para o campo %', coalesce(v_op, '(nenhum)'), d.titulo using errcode = '22023';
    end if;
    n := case when jsonb_typeof(it->'valores') = 'array' then jsonb_array_length(it->'valores') else 0 end;
    if v_op in ('em','fora') and n = 0 then raise exception 'Escolha ao menos um valor para %', d.titulo using errcode = '22023'; end if;
    if v_op in ('igual','maior','menor','antes','depois','ultimos_dias') and n <> 1 then raise exception 'Informe um valor para %', d.titulo using errcode = '22023'; end if;
    if v_op = 'entre' and n <> 2 then raise exception 'Informe o mínimo e o máximo para %', d.titulo using errcode = '22023'; end if;
    if v_op in ('em','fora') and d.opcoes is not null then
      for x in select * from jsonb_array_elements(it->'valores') loop
        if not (x #>> '{}' = any (d.opcoes)) then raise exception 'Valor % não é opção de %', x #>> '{}', d.titulo using errcode = '22023'; end if;
      end loop;
    end if;
    begin
      if d.tipo = 'numero' and n > 0 then perform (y #>> '{}')::numeric from jsonb_array_elements(it->'valores') y; end if;
      if v_op in ('antes','depois') then perform (it->'valores'->>0)::date; end if;
      if v_op = 'ultimos_dias' and (it->'valores'->>0)::int < 1 then raise exception 'dias'; end if;
    exception when others then
      raise exception 'Valor inválido para %', d.titulo using errcode = '22023';
    end;
  end loop;
end $$;

-- Uma condição simples sobre o terreno
create or replace function app._condicao_item(p_terreno uuid, it jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v jsonb; t text; op text := it->>'op'; vals jsonb := coalesce(it->'valores', '[]'); x numeric;
begin
  v := app._valor_campo(p_terreno, it->>'campo');
  if op = 'vazio' then return v is null; end if;
  if op = 'preenchido' then return v is not null; end if;
  if v is null then return false; end if;   -- em branco não satisfaz nada além de "vazio"
  select tipo into t from app.campos_catalogo where chave = it->>'campo';
  if op in ('em','fora') then
    if jsonb_typeof(v) = 'array' then
      return (op = 'em') = exists (select 1 from jsonb_array_elements_text(v) a join jsonb_array_elements_text(vals) b on a = b);
    end if;
    return (op = 'em') = exists (select 1 from jsonb_array_elements_text(vals) b where b = v #>> '{}');
  end if;
  if op in ('igual','maior','menor','entre') then
    x := (v #>> '{}')::numeric;
    return case op when 'igual' then x = (vals->>0)::numeric when 'maior' then x > (vals->>0)::numeric when 'menor' then x < (vals->>0)::numeric
                   else x between (vals->>0)::numeric and (vals->>1)::numeric end;
  end if;
  if op in ('antes','depois','ultimos_dias') then
    return case op when 'antes' then (v #>> '{}')::date < (vals->>0)::date when 'depois' then (v #>> '{}')::date > (vals->>0)::date
                   else (v #>> '{}')::date between current_date - (vals->>0)::int and current_date end;
  end if;
  if op in ('sim','nao') then return (v #>> '{}')::boolean = (op = 'sim'); end if;
  return false;
end $$;

-- A condição vale para o terreno? (registrado em fluxo.objeto_tipos.avalia_condicao) Sem condição, vale.
create or replace function app.avaliar_condicao(p_terreno uuid, p_cond jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare it jsonb; r boolean; algum boolean := false; todos boolean := true;
begin
  if p_cond is null or jsonb_typeof(p_cond->'itens') is distinct from 'array' or jsonb_array_length(p_cond->'itens') = 0 then return true; end if;
  for it in select * from jsonb_array_elements(p_cond->'itens') loop
    r := case when it ? 'grupo' then app.avaliar_condicao(p_terreno, it->'grupo') else app._condicao_item(p_terreno, it) end;
    if r then algum := true; else todos := false; end if;
  end loop;
  return case when p_cond->>'modo' = 'qualquer' then algum else todos end;
end $$;

-- Gravar pelo cartão no próprio registro: terreno pela salvar_terreno, oferta de referência direto, temperatura pela regra dela.
create or replace function app.gravar_campo(p_terreno uuid, p_chave text, p_valor jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c app.campos_catalogo; t app.terrenos; v_of uuid; v_fmt text; v_val jsonb := case when p_valor = 'null'::jsonb then null else p_valor end;
  k app.campos_terreno;
begin
  select * into t from app.terrenos where id = p_terreno;
  if t.id is null or not app.ve_terreno(p_terreno) then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  -- campo novo do terreno: confere o tipo e a máscara; em branco apaga o valor
  if p_chave like 'personalizado.%' then
    select * into k from app.campos_terreno where empresa_id = t.empresa_id and 'personalizado.' || codigo = p_chave;
    if k.id is null then raise exception 'Campo desconhecido: %', p_chave using errcode = 'P0002'; end if;
    if not k.ativo then raise exception 'O campo % está desativado', k.titulo using errcode = '22023'; end if;
    if v_val is not null and jsonb_typeof(v_val) = 'string' and trim(v_val #>> '{}') = '' then v_val := null; end if;
    if v_val is not null then
      begin
        v_val := case k.tipo
          when 'numero' then to_jsonb((v_val #>> '{}')::numeric)
          when 'data' then to_jsonb((v_val #>> '{}')::date)
          when 'sim_nao' then to_jsonb((v_val #>> '{}')::boolean)
          else to_jsonb(v_val #>> '{}') end;
      exception when others then
        raise exception 'Valor inválido para %', k.titulo using errcode = '22023';
      end;
      if k.tipo = 'lista' and not (v_val #>> '{}' = any (k.opcoes)) then
        raise exception 'Valor % não é opção de %', v_val #>> '{}', k.titulo using errcode = '22023';
      end if;
      if k.tipo = 'texto' and k.formato is not null then v_val := to_jsonb(fluxo.validar_formato(k.formato, v_val #>> '{}')); end if;
    end if;
    if v_val is null then
      delete from app.terreno_valores where terreno_id = t.id and campo_id = k.id;
    else
      insert into app.terreno_valores (empresa_id, terreno_id, campo_id, valor) values (t.empresa_id, t.id, k.id, v_val)
      on conflict (terreno_id, campo_id) do update set valor = excluded.valor, alterado_por = auth.uid(), alterado_em = clock_timestamp()
      where app.terreno_valores.valor is distinct from excluded.valor;
    end if;
    return;
  end if;
  select * into c from app.campos_catalogo where chave = p_chave;
  if c.chave is null or not c.editavel then raise exception 'Este campo não se altera pelo cartão' using errcode = '22023'; end if;
  -- texto com máscara grava como fica guardado (dígitos, e-mail em minúsculas)
  select formato into v_fmt from app.campo_def(t.empresa_id, p_chave);
  if c.tipo = 'texto' and v_fmt is not null and v_val is not null then v_val := to_jsonb(fluxo.validar_formato(v_fmt, v_val #>> '{}')); end if;
  if v_val is null and c.vazio is not null then v_val := to_jsonb(c.vazio); end if;
  if p_chave = 'terreno.temperatura' then
    perform app.definir_temperatura(t.id, (v_val #>> '{}')::int);
  elsif c.origem = 'terreno' then
    perform app.salvar_terreno(t.id, t.versao, jsonb_build_object(c.coluna, v_val));
  elsif c.origem = 'oferta' then
    v_of := app.oferta_do_terreno(t.id);
    if v_of is null then raise exception 'O terreno não tem oferta' using errcode = '23514'; end if;
    execute format('update app.ofertas set %1$I = (jsonb_populate_record(null::app.ofertas, $1)).%1$I where id = $2', c.coluna)
    using jsonb_build_object(c.coluna, v_val), v_of;
  end if;
end $$;

-- Administrador cria ou altera um campo novo do terreno. p_dados: titulo, tipo, unidade,
-- opcoes, formato, condicao, cartao, ativo. Com valor guardado, o tipo não muda e
-- nenhuma opção em uso sai. Devolve o id.
create or replace function app.salvar_campo_terreno(p_empresa uuid, p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k app.campos_terreno; v_tit text := nullif(trim(p_dados->>'titulo'), ''); v_tipo text; v_op text[]; v_id uuid := coalesce(p_id, gen_random_uuid());
begin
  perform app.exigir_administrador(p_empresa);
  if p_id is not null then
    select * into k from app.campos_terreno where id = p_id and empresa_id = p_empresa;
    if k.id is null then raise exception 'Campo não encontrado' using errcode = 'P0002'; end if;
  end if;
  v_tit := coalesce(v_tit, k.titulo);
  if v_tit is null then raise exception 'Dê um título ao campo' using errcode = '22023'; end if;
  if exists (select 1 from app.campos_catalogo o left join app.campos_empresa x on x.empresa_id = p_empresa and x.chave = o.chave
             where lower(coalesce(x.titulo, o.titulo)) = lower(v_tit))
     or exists (select 1 from app.campos_terreno o where o.empresa_id = p_empresa and o.id <> v_id and lower(o.titulo) = lower(v_tit)) then
    raise exception 'Já existe um campo com o título %', v_tit using errcode = '23505';
  end if;
  v_tipo := coalesce(p_dados->>'tipo', k.tipo);
  v_op := case when p_dados ? 'opcoes' then (select array_agg(distinct trim(x)) filter (where trim(x) <> '') from jsonb_array_elements_text(p_dados->'opcoes') x) else k.opcoes end;
  if v_tipo <> 'lista' then v_op := null; end if;
  if k.id is not null and exists (select 1 from app.terreno_valores where campo_id = k.id) then
    if v_tipo <> k.tipo then raise exception 'O campo % já tem valores: o tipo não muda (crie outro campo)', k.titulo using errcode = 'P0001'; end if;
    if v_tipo = 'lista' and exists (select 1 from app.terreno_valores x where x.campo_id = k.id and not (x.valor #>> '{}' = any (v_op))) then
      raise exception 'Há terrenos com uma opção que você tirou: corrija antes' using errcode = 'P0001';
    end if;
  end if;
  insert into app.campos_terreno (id, empresa_id, codigo, titulo, tipo, unidade, opcoes, formato, condicao, cartao, ativo)
  values (v_id, p_empresa, 'c' || substr(replace(v_id::text, '-', ''), 1, 10), v_tit, v_tipo,
          nullif(trim(p_dados->>'unidade'), ''), v_op, nullif(p_dados->>'formato', ''),
          coalesce((p_dados->>'condicao')::boolean, true), coalesce((p_dados->>'cartao')::boolean, true), coalesce((p_dados->>'ativo')::boolean, true))
  on conflict (id) do update set titulo = excluded.titulo, tipo = excluded.tipo,
    unidade = case when p_dados ? 'unidade' then excluded.unidade else app.campos_terreno.unidade end, opcoes = excluded.opcoes,
    formato = case when p_dados ? 'formato' then excluded.formato else app.campos_terreno.formato end,
    condicao = coalesce((p_dados->>'condicao')::boolean, app.campos_terreno.condicao), cartao = coalesce((p_dados->>'cartao')::boolean, app.campos_terreno.cartao),
    ativo = coalesce((p_dados->>'ativo')::boolean, app.campos_terreno.ativo);
  return v_id;
end $$;

-- Apaga o campo novo só sem valor e sem uso na jornada; senão, desativa.
create or replace function app.apagar_campo_terreno(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare k app.campos_terreno;
begin
  select * into k from app.campos_terreno where id = p_id;
  if k.id is null then raise exception 'Campo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(k.empresa_id);
  if exists (select 1 from app.terreno_valores where campo_id = k.id)
     or exists (select 1 from app.jornada_itens where empresa_id = k.empresa_id and campo = 'personalizado.' || k.codigo) then
    update app.campos_terreno set ativo = false where id = k.id;
    return 'desativado';
  end if;
  delete from app.campos_terreno where id = k.id;
  return 'apagado';
end $$;

revoke all on function app.campo_def(uuid, text), app.salvar_campo(uuid, text, text, boolean, boolean, text), app.negociacao_do_terreno(uuid),
  app.oferta_do_terreno(uuid), app.proposta_vigente(uuid), app._valor_campo(uuid, text), app.campo_cartao(uuid, text),
  app.validar_condicao(uuid, jsonb, int), app._condicao_item(uuid, jsonb), app.avaliar_condicao(uuid, jsonb), app.gravar_campo(uuid, text, jsonb) from public;
revoke all on function app.salvar_campo_terreno(uuid, uuid, jsonb), app.apagar_campo_terreno(uuid) from public;
grant execute on function app.salvar_campo_terreno(uuid, uuid, jsonb), app.apagar_campo_terreno(uuid) to authenticated;
grant execute on function app.campo_def(uuid, text), app.salvar_campo(uuid, text, text, boolean, boolean, text), app.campo_cartao(uuid, text),
  app.validar_condicao(uuid, jsonb, int), app.gravar_campo(uuid, text, jsonb) to authenticated;

update fluxo.objeto_tipos set avalia_condicao = 'app.avaliar_condicao', valida_condicao = 'app.validar_condicao', campo_objeto = 'app.campo_cartao'
where tipo = 'terreno';
