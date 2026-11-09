-- =====================================================================
-- BKM Terrenos · 0004 · ofertas, processos, negociação, propostas,
-- tarefas, atividades e documentos
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ofertas: o que o vendedor pede. Várias por terreno (um corretor cada).
-- ---------------------------------------------------------------------
create table app.ofertas (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references app.empresas(id),
  terreno_id             uuid not null references app.terrenos(id),
  corretor_id            uuid references app.corretores(id),
  ofertante_id           uuid references app.pessoas(id),  -- quem oferece quando não é (só) o corretor: proprietário, procurador
  data_oferta            date not null default current_date,
  valor_pedido           numeric(14,2) check (valor_pedido > 0),
  forma_pagamento_pedida text check (forma_pagamento_pedida in ('dinheiro','permuta_fisica','permuta_financeira','permuta_geral','permuta_com_torna')),
  observacao_pagamento   text,
  aceita_permuta         text,
  comissao_pct           numeric(5,2) check (comissao_pct >= 0 and comissao_pct <= 100),
  comissao_valor         numeric(14,2) check (comissao_valor >= 0),
  validade               date,
  status                 text not null default 'ativa' check (status in ('ativa','expirada','retirada')),
  observacoes            text,
  -- o pedaço oferecido, quando não é o terreno inteiro (ex.: 3 dos 5 lotes estudados); nulo = o terreno todo
  poligono_geojson       jsonb check (poligono_geojson is null or app.geojson_poligono_valido(poligono_geojson)),
  criado_por             uuid default auth.uid(),
  criado_em              timestamptz not null default now()
);
create index on app.ofertas (terreno_id, data_oferta);

-- Corretor de uma oferta passa a constar no terreno; o primeiro vira principal.
create or replace function app.tg_oferta_corretor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.corretor_id is not null then
    insert into app.terreno_corretores (terreno_id, corretor_id, empresa_id, principal)
    values (new.terreno_id, new.corretor_id, new.empresa_id,
            not exists (select 1 from app.terreno_corretores where terreno_id = new.terreno_id and principal))
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger t_corretor after insert on app.ofertas for each row execute function app.tg_oferta_corretor();

-- Partes que a oferta cobre (terreno com vários donos), com o preço de cada
-- uma quando o ofertante informa. Sem linha: a oferta é do terreno todo.
create table app.oferta_partes (
  oferta_id    uuid not null references app.ofertas(id) on delete cascade,
  parte_id     uuid not null references app.terreno_partes(id),
  empresa_id   uuid not null references app.empresas(id),
  valor_pedido numeric(14,2) check (valor_pedido > 0),
  -- forma de pagamento pedida por esta parte (nula = a da oferta)
  forma_pagamento text check (forma_pagamento in ('dinheiro','permuta_fisica','permuta_financeira','permuta_geral','permuta_com_torna')),
  primary key (oferta_id, parte_id)
);
create index on app.oferta_partes (parte_id);

create or replace function app.tg_oferta_parte()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from app.ofertas o join app.terreno_partes tp on tp.terreno_id = o.terreno_id and tp.empresa_id = o.empresa_id
                 where o.id = new.oferta_id and tp.id = new.parte_id and tp.ativa and o.empresa_id = new.empresa_id) then
    raise exception 'A parte não é do terreno da oferta' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_parte before insert or update on app.oferta_partes for each row execute function app.tg_oferta_parte();

-- ---------------------------------------------------------------------
-- Viabilidades vinculadas (TEMPORÁRIO: vira view sobre o BKM)
-- ---------------------------------------------------------------------
create table app.viabilidades (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references app.empresas(id),
  terreno_id         uuid references app.terrenos(id),
  area_interesse_id  uuid references app.areas_interesse(id),
  bkm_viabilidade_id uuid,
  nome               text not null,
  vgv                numeric(16,2),
  margem_pct         numeric(10,2),
  calculado_em       date not null default current_date,
  criado_em          timestamptz not null default now(),
  check (num_nonnulls(terreno_id, area_interesse_id) = 1)
);

-- Rentabilidade mínima da empresa (decisão do Moisés, 26/out/2026): margem líquida
-- do estudo válido abaixo dela acende "Rentabilidade abaixo da mínima" (no lugar do
-- antigo preço máximo do terreno). Nulo = sem mínimo. Só o administrador muda
-- (app.salvar_margem_minima), com auditoria.
create table app.viabilidade_config (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null unique references app.empresas(id) on delete cascade,
  margem_minima_pct  numeric(5,2) check (margem_minima_pct between -100 and 100)
);

-- ---------------------------------------------------------------------
-- Processo: o terreno numa fase (Novos Negócios, Aprovação de Projetos...).
-- Etapas, transições, checklist e tarefas penduram aqui. Código com o prefixo
-- da fase (NEG-00012), dado na abertura (app._abrir_processo).
-- ---------------------------------------------------------------------
create sequence app.processo_seq;
create table app.processos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references app.empresas(id),
  codigo               text not null,
  fase                 text not null,
  terreno_id           uuid not null references app.terrenos(id),
  etapa_atual          text not null,
  etapa_desde          timestamptz not null default now(),
  subetapa_atual       text not null,
  subetapa_desde       timestamptz not null default now(),
  -- fora de "ativo", guarda a etapa e a subetapa em que estava
  status               text not null default 'ativo' check (status in ('ativo','concluido','perdido','descartado','stand_by')),
  responsavel_id       uuid references auth.users(id),
  viabilidade_id       uuid references app.viabilidades(id),
  -- negociação de uma parte (terreno com vários donos): pendurada na negociação do terreno
  parte_id             uuid references app.terreno_partes(id),
  principal_id         uuid references app.processos(id),
  motivo_encerramento  text,   -- código de motivos_encerramento (descartado, perdido)
  detalhe_encerramento text,   -- relato (concluído, perdido), texto livre (descartado) ou justificativa (stand by); rich text
  pontos_sucesso       text,   -- concluído na fase de entrada (compra): rich text
  retomar_em           date,
  data_inicio          timestamptz not null default now(),
  data_encerramento    timestamptz,
  criado_por           uuid default auth.uid(),
  atualizado_em        timestamptz not null default now(),
  unique (empresa_id, codigo),
  foreign key (empresa_id, fase) references app.fases_modelo(empresa_id, codigo),
  foreign key (empresa_id, fase, etapa_atual) references app.etapas_modelo(empresa_id, fase, codigo),
  foreign key (empresa_id, fase, etapa_atual, subetapa_atual) references app.subetapas_modelo(empresa_id, fase, etapa, codigo),
  check (status not in ('perdido','descartado') or motivo_encerramento is not null),
  check (status not in ('concluido','perdido') or detalhe_encerramento is not null),
  check (status <> 'stand_by' or (retomar_em is not null and detalhe_encerramento is not null)),
  check ((parte_id is null) = (principal_id is null))
);
create index on app.processos (empresa_id, fase, status, etapa_atual, subetapa_atual);
create index on app.processos (principal_id);
create unique index processos_um_aberto_por_terreno on app.processos (terreno_id, fase) where status in ('ativo','stand_by') and parte_id is null;
-- uma negociação por parte em cada negociação do terreno
create unique index processos_um_por_parte on app.processos (principal_id, parte_id) where parte_id is not null;

-- Dados próprios da negociação (1:1 com o processo).
create table app.negociacoes (
  processo_id          uuid primary key references app.processos(id) on delete cascade,
  empresa_id           uuid not null references app.empresas(id),
  oferta_referencia_id uuid references app.ofertas(id),
  temperatura          smallint check (temperatura between 1 and 5),  -- null = não avaliada
  temperatura_em       timestamptz
);

-- Toda passagem com data, hora e usuário: base dos KPIs de SLA.
-- para_etapa/para_subetapa = onde o processo fica depois do evento (também
-- em stand by e encerramentos, que mantêm a posição).
create table app.processo_transicoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  processo_id   uuid not null references app.processos(id) on delete cascade,
  evento        text not null check (evento in ('abertura','avanco','retorno','subetapa','conclusao','descarte','perda','stand_by','retomada','temperatura')),
  de_etapa      text,
  para_etapa    text,
  de_subetapa   text,
  para_subetapa text,
  forcado       boolean not null default false,
  comentario    text,
  aprovacao_id  uuid,          -- pedido de aprovação que liberou a passagem (FK abaixo)
  user_id       uuid default auth.uid(),
  em            timestamptz not null default clock_timestamp()  -- uma RPC pode gravar várias transições; cada uma no seu instante
);
create index on app.processo_transicoes (processo_id, em);
create index on app.processo_transicoes (processo_id, para_subetapa);

-- Pedidos de aprovação. Um pedido (pedido_id) tem uma linha por nível
-- exigido e ainda não dispensado. Em sequência, o diretor (ordem 2) só
-- recebe depois do gestor; em paralelo, os dois têm ordem 1.
create table app.aprovacoes (
  id               uuid primary key default gen_random_uuid(),
  pedido_id        uuid not null,
  empresa_id       uuid not null references app.empresas(id),
  processo_id      uuid not null references app.processos(id) on delete cascade,
  destino_tipo     text not null check (destino_tipo in ('etapa','subetapa','status')),
  destino          text not null,
  nivel            text not null check (nivel in ('gestor','diretor')),
  ordem            smallint not null check (ordem in (1,2)),
  aprovador_previsto uuid references auth.users(id),   -- null: qualquer um do nível
  pedido_por       uuid not null references auth.users(id),
  pedido_em        timestamptz not null default clock_timestamp(),
  status           text not null default 'pendente' check (status in ('pendente','aprovado','recusado','cancelado')),
  decidido_por     uuid references auth.users(id),
  decidido_em      timestamptz,
  comentario       text,
  -- o que aplicar quando aprovado: forçado, justificativa, dados do encerramento
  dados            jsonb not null default '{}'::jsonb,
  check ((status = 'pendente') = (decidido_em is null)),
  check (status <> 'recusado' or length(trim(coalesce(comentario,''))) > 0)
);
create unique index aprovacoes_um_pedido_aberto on app.aprovacoes (processo_id, nivel) where status = 'pendente';
create index on app.aprovacoes (pedido_id);
create index on app.aprovacoes (empresa_id, status, nivel);
alter table app.processo_transicoes add foreign key (aprovacao_id) references app.aprovacoes(id);

-- ---------------------------------------------------------------------
-- Propostas e contrapropostas: uma tabela, encadeada.
-- ---------------------------------------------------------------------
create table app.propostas (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references app.empresas(id),
  processo_id          uuid not null references app.processos(id) on delete cascade,
  versao               int  not null,
  origem               text not null check (origem in ('bkm','vendedor')),
  proposta_anterior_id uuid references app.propostas(id),
  data_apresentacao    date,
  validade             date,
  valor_total          numeric(14,2) not null check (valor_total > 0),
  forma_pagamento      text not null check (forma_pagamento in ('dinheiro','permuta_fisica','permuta_financeira','permuta_geral','permuta_com_torna')),
  condicoes_pagamento  text,
  status               text not null check (status in ('rascunho','apresentada','em_analise','aceita','recusada','expirada','retirada','substituida')),
  viabilidade_id       uuid references app.viabilidades(id),
  criado_por           uuid default auth.uid(),
  criado_em            timestamptz not null default now(),
  unique (processo_id, versao),
  check (validade is null or data_apresentacao is null or validade >= data_apresentacao)
);

-- Partes a que a proposta foi feita (pedido do Moises, 9/nov/2026): de uma a todas as
-- partes ativas do terreno; gravadas só por app.registrar_proposta. Proposta antiga
-- sem linha aqui = "parte não informada" (nunca vira "todas"). Não muda depois de
-- gravada: o log é o da proposta (sem trigger de auditoria próprio).
create table app.proposta_partes (
  proposta_id uuid not null references app.propostas(id) on delete cascade,
  parte_id    uuid not null references app.terreno_partes(id),
  empresa_id  uuid not null references app.empresas(id),
  primary key (proposta_id, parte_id)
);
create index on app.proposta_partes (parte_id);

-- ---------------------------------------------------------------------
-- Tarefas: moram no esquema fluxo (quadros e tarefas, ver 00150), no
-- quadro do terreno. Aqui o BKM Terrenos liga a tarefa à negociação: o
-- processo, se houver, é do mesmo terreno do quadro.
-- ---------------------------------------------------------------------
alter table fluxo.tarefas add foreign key (processo_id) references app.processos(id);

-- Etapa do funil do cartão (lote B, 31/out/2026): a tarefa nova nasce na etapa
-- e na subetapa atuais do terreno (o processo aberto da fase mais adiantada;
-- subetapa desde 1/nov/2026); quem cria pode escolher outra etapa e subetapa; etapa 'nenhuma'
-- deixa a tarefa sem etapa (nunca trava). A etapa é da fase do processo e a
-- subetapa, da etapa.
create or replace function app.tg_tarefa_processo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_fase text;
begin
  if new.etapa = 'nenhuma' then
    new.processo_id := null; new.etapa := null; new.subetapa := null;
  elsif tg_op = 'INSERT' and new.processo_id is null and new.etapa is null and not new.modelo then
    select p.id, p.etapa_atual, p.subetapa_atual into new.processo_id, new.etapa, new.subetapa
    from app.processos p join fluxo.quadros q on q.objeto_tipo = 'terreno' and q.objeto_id = p.terreno_id
    join app.fases_modelo f on f.empresa_id = p.empresa_id and f.codigo = p.fase
    where q.id = new.quadro_id and p.parte_id is null and p.status in ('ativo','stand_by')
    order by p.status = 'ativo' desc, f.ordem desc limit 1;
  end if;
  if new.processo_id is null then
    new.etapa := null; new.subetapa := null;
    return new;
  end if;
  select p.fase into v_fase from app.processos p join fluxo.quadros q on q.objeto_tipo = 'terreno' and q.objeto_id = p.terreno_id
   where p.id = new.processo_id and q.id = new.quadro_id;
  if v_fase is null then raise exception 'A negociação informada é de outro terreno' using errcode = '23514'; end if;
  if new.etapa is null then
    new.etapa := (select etapa_atual from app.processos where id = new.processo_id);
  elsif not exists (select 1 from app.etapas_modelo e join app.processos p on p.empresa_id = e.empresa_id and p.fase = e.fase
                    where p.id = new.processo_id and e.codigo = new.etapa) then
    raise exception 'Etapa de outra fase' using errcode = '23514';
  end if;
  if new.subetapa is not null and not exists (select 1 from app.subetapas_modelo s join app.processos p on p.empresa_id = s.empresa_id and p.fase = s.fase
                    where p.id = new.processo_id and s.codigo = new.subetapa and s.etapa = new.etapa) then
    if tg_op = 'UPDATE' and new.etapa is distinct from old.etapa then new.subetapa := null;   -- mudou a etapa: a subetapa de antes não vale
    else raise exception 'Subetapa de outra etapa' using errcode = '23514'; end if;
  end if;
  return new;
end $$;
create trigger t_processo before insert or update of processo_id, etapa, subetapa on fluxo.tarefas for each row execute function app.tg_tarefa_processo();

create table app.atividades (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  terreno_id  uuid not null references app.terrenos(id) on delete cascade,
  processo_id uuid references app.processos(id),
  tipo        text not null check (tipo in ('ligacao','visita','email','mensagem','nota')),  -- reunião tem tabela própria
  ocorreu_em  timestamptz not null default now(),
  resumo      text not null,
  resultado   text,
  user_id     uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index on app.atividades (terreno_id, ocorreu_em desc);

-- ---------------------------------------------------------------------
-- Reuniões da negociação. A ata é um documento (tipo ata_reuniao) ligado
-- à reunião, versionado como qualquer outro; o texto extraído das versões
-- (documento_versoes.texto_extraido) é o insumo para resumos por IA.
-- ---------------------------------------------------------------------
create table app.reunioes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  terreno_id      uuid not null references app.terrenos(id) on delete cascade,
  processo_id     uuid references app.processos(id),
  status          text not null default 'realizada' check (status in ('agendada','realizada','cancelada')),
  inicio          timestamptz not null,
  duracao_min     int check (duracao_min > 0),
  modalidade      text not null check (modalidade in ('presencial','online')),
  local           text check (local in ('bkm','externo')),        -- só presencial
  endereco        text,                                           -- local externo
  link            text check (link is null or (link ~* '^https?://\S+$' and length(link) <= 2000)),  -- online: link da reunião, digitado (Moises, 9/nov/2026)
  pauta           text,
  resumo          text,                                           -- o que foi tratado, escrito por quem participou
  encaminhamentos text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid,
  constraint reuniao_local_so_presencial check ((modalidade = 'presencial') = (local is not null)),
  constraint reuniao_endereco_so_externo check (local is distinct from 'bkm' or endereco is null),
  constraint reuniao_link_so_online check (link is null or modalidade = 'online')
);
create index on app.reunioes (terreno_id, inicio desc);
create index on app.reunioes (processo_id, inicio desc);

create or replace function app.tg_reuniao()
returns trigger language plpgsql as $$
begin
  if new.status = 'realizada' and new.inicio > now() then
    raise exception 'Reunião realizada não pode ter data futura' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_reuniao before insert or update on app.reunioes for each row execute function app.tg_reuniao();

create table app.reuniao_participantes (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references app.empresas(id),
  reuniao_id uuid not null references app.reunioes(id) on delete cascade,
  lado       text not null check (lado in ('bkm','vendedor','corretor','outro')),
  user_id    uuid references auth.users(id),      -- membro da BKM
  pessoa_id  uuid references app.pessoas(id),     -- vendedor, corretor, advogado...
  nome       text,                                -- quem não está cadastrado
  constraint participante_identificado check (num_nonnulls(user_id, pessoa_id, nullif(trim(nome), '')) = 1)
);
create index on app.reuniao_participantes (reuniao_id);

-- ---------------------------------------------------------------------
-- Diligências: questões a esclarecer antes de comprar. "Impeditiva" em
-- aberto bloqueia a saída da etapa Diligência.
-- ---------------------------------------------------------------------
create table app.diligencias (
  id                     uuid primary key default gen_random_uuid(),
  empresa_id             uuid not null references app.empresas(id),
  terreno_id             uuid not null references app.terrenos(id) on delete cascade,
  processo_id            uuid references app.processos(id),
  categoria              text not null check (categoria in ('documental','juridica','ambiental','ocupacional','tecnica','outra')),
  titulo                 text not null check (length(trim(titulo)) > 0),
  situacao               text not null default 'nao_avaliada' check (situacao in ('nao_avaliada','em_analise','pendente','resolvida','impeditiva')),
  responsavel_id         uuid references auth.users(id),
  prazo                  date,
  evidencia_documento_id uuid,  -- FK adicionada depois de documentos
  providencia            text,
  observacoes            text,
  resolvida_em           timestamptz,
  criado_por             uuid default auth.uid(),
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  check ((situacao = 'resolvida') = (resolvida_em is not null))
);
create index on app.diligencias (terreno_id);

create or replace function app.tg_diligencia()
returns trigger language plpgsql as $$
begin
  if new.situacao = 'resolvida' and new.resolvida_em is null then new.resolvida_em := now(); end if;
  if new.situacao <> 'resolvida' then new.resolvida_em := null; end if;
  return new;
end $$;
create trigger t_resolucao before insert or update on app.diligencias for each row execute function app.tg_diligencia();

-- ---------------------------------------------------------------------
-- Documentos: o "documento" é estável; cada envio é uma versão.
-- ---------------------------------------------------------------------
create table app.documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  terreno_id     uuid not null references app.terrenos(id),
  processo_id    uuid references app.processos(id),
  proposta_id    uuid references app.propostas(id),
  reuniao_id     uuid references app.reunioes(id),
  tipo_documento text not null references app.tipos_documento(codigo),
  nome           text not null,
  emitido_em     date,
  situacao       text not null default 'recebido' check (situacao in ('recebido','validado','rejeitado')),
  revisado_por   uuid references auth.users(id),
  revisado_em    timestamptz,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index on app.documentos (terreno_id);
create unique index documentos_uma_ata_por_reuniao on app.documentos (reuniao_id) where tipo_documento = 'ata_reuniao';

create table app.documento_versoes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  documento_id uuid not null references app.documentos(id) on delete cascade,
  versao       int  not null,
  storage_path text not null,
  nome_arquivo text not null,
  tamanho      bigint,
  sha256       text,
  enviado_por  uuid default auth.uid(),
  enviado_em   timestamptz not null default now(),
  texto_extraido text,   -- preenchido pela extração (OCR/IA); base para busca e resumo
  unique (documento_id, versao)
);

alter table app.diligencias add foreign key (evidencia_documento_id) references app.documentos(id);

-- ---------------------------------------------------------------------
-- Triggers e RLS
-- ---------------------------------------------------------------------
create trigger t_upd before update on app.diligencias for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.diligencias for each row execute function app.tg_auditoria();
create trigger t_upd before update on app.processos  for each row execute function app.tg_atualizado_em();
create trigger t_upd before update on app.documentos for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.ofertas     for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.oferta_partes for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.processos   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.aprovacoes  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.propostas   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.documentos  for each row execute function app.tg_auditoria();
create trigger t_upd before update on app.reunioes for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.reunioes    for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.reuniao_participantes for each row execute function app.tg_auditoria();  -- quem entrou e saiu da reunião, nos logs da ficha

do $$
declare t text;
begin
  foreach t in array array['ofertas','oferta_partes','viabilidades','processos','negociacoes','processo_transicoes','aprovacoes','propostas','proposta_partes','atividades','reunioes','reuniao_participantes','diligencias','documentos','documento_versoes'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
  -- escrita direta só onde não há regra de etapa
  foreach t in array array['ofertas','oferta_partes','atividades','reunioes','reuniao_participantes','diligencias'] loop
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant insert, update on app.%I to authenticated', t);
    execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_mesma_empresa()', t);
  end loop;
end $$;
create policy remover on app.reuniao_participantes for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
create policy remover on app.oferta_partes for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
grant delete on app.reuniao_participantes, app.oferta_partes to authenticated;
grant usage on sequence app.processo_seq to authenticated;

-- Tarefas pelo funil (bloco 4; visão só de leitura da página Tarefas): cada
-- tarefa de quadro de terreno com a fase aberta do terreno, a etapa e a
-- subetapa em que ele está. Uma linha por fase aberta (o terreno em duas
-- fases aparece nas duas); partes ficam de fora (vale a negociação do terreno).
create view app.v_tarefas_funil with (security_invoker = true) as
select k.id as tarefa_id, k.codigo, k.titulo, k.lista_nome, k.lista_tipo, k.responsavel_id, k.prazo, k.atrasada, k.concluida_em, k.arquivada_em, k.modelo,
       q.objeto_id as terreno_id, p.id as processo_id, p.fase, p.etapa_atual as etapa, p.subetapa_atual as subetapa, p.status as processo_status
from fluxo.v_tarefas k
join fluxo.quadros q on q.id = k.quadro_id and q.objeto_tipo = 'terreno'
join app.processos p on p.terreno_id = q.objeto_id and p.parte_id is null and p.status in ('ativo','stand_by');
grant select on app.v_tarefas_funil to authenticated;

-- ---------------------------------------------------------------------
-- Vínculos dentro da empresa (revisão de 2/nov/2026): pessoa, corretor e
-- ofertante são cadastros da mesma empresa do registro; responsável do
-- terreno e participante da BKM numa reunião são membros dela (fora dela,
-- os avisos se perdiam sem ninguém saber).
-- ---------------------------------------------------------------------
create or replace function app.tg_vinculos_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new); o jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end; k text;
begin
  foreach k in array array['pessoa_id','ofertante_id'] loop
    if j->>k is not null and j->k is distinct from o->k
       and not exists (select 1 from app.pessoas where id = (j->>k)::uuid and empresa_id = new.empresa_id) then
      raise exception 'A pessoa não é desta empresa' using errcode = '42501';
    end if;
  end loop;
  if j->>'corretor_id' is not null and j->'corretor_id' is distinct from o->'corretor_id'
     and not exists (select 1 from app.corretores where id = (j->>'corretor_id')::uuid and empresa_id = new.empresa_id) then
    raise exception 'O corretor não é desta empresa' using errcode = '42501';
  end if;
  foreach k in array array['responsavel_id','user_id'] loop
    if j->>k is not null and j->k is distinct from o->k
       and not exists (select 1 from app.membros where user_id = (j->>k)::uuid and empresa_id = new.empresa_id) then
      raise exception 'A pessoa escolhida não é da equipe desta empresa' using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['terrenos','corretores','terreno_pessoas','terreno_corretores','parte_corretores','ofertas','reuniao_participantes'] loop
    execute format('create trigger t_vinculos before insert or update on app.%I for each row execute function app.tg_vinculos_empresa()', t);
  end loop;
end $$;

-- Código curto do terreno (decisão do Moisés, 4/nov/2026): letra + 3 dígitos pela ordem de cadastro,
-- A001 a A999, depois B001... até Z999, sem as letras I e O, que se confundem com 1 e 0
-- (decisão do Moisés, 4/nov/2026): 24 letras, 23.976 terrenos.
create or replace function app.codigo_terreno(p_n bigint)
returns text language plpgsql immutable set search_path = '' as $$
begin
  if p_n is null or p_n < 1 or p_n > 24 * 999 then
    raise exception 'Acabaram os códigos de terreno (Z999).';
  end if;
  return substr('ABCDEFGHJKLMNPQRSTUVWXYZ', ((p_n - 1) / 999)::int + 1, 1) || lpad((((p_n - 1) % 999) + 1)::text, 3, '0');
end $$;
grant execute on function app.codigo_terreno(bigint) to authenticated;

-- Terreno cadastrado direto: o código e quem criou são do banco, não do usuário.
create or replace function app.tg_terreno_controle()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null or new.codigo is null then
      new.codigo := app.codigo_terreno(nextval('app.terreno_seq'));
    end if;
    if auth.uid() is not null then new.criado_por := auth.uid(); new.criado_em := now(); end if;
  elsif auth.uid() is not null then
    new.codigo := old.codigo; new.criado_por := old.criado_por; new.criado_em := old.criado_em;
  end if;
  return new;
end $$;
create trigger t_controle before insert or update on app.terrenos for each row execute function app.tg_terreno_controle();
