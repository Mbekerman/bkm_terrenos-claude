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
  margem_pct         numeric(6,2),
  preco_max_terreno  numeric(14,2),
  calculado_em       date not null default current_date,
  criado_em          timestamptz not null default now(),
  check (num_nonnulls(terreno_id, area_interesse_id) = 1)
);

-- ---------------------------------------------------------------------
-- Processo: núcleo genérico (negociação hoje; aprovação, incorporação,
-- financiamento depois). Etapas, transições, checklist e tarefas penduram aqui.
-- ---------------------------------------------------------------------
create sequence app.processo_seq;
create table app.processos (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references app.empresas(id),
  codigo               text not null default ('NEG-' || lpad(nextval('app.processo_seq')::text, 5, '0')),
  tipo                 text not null default 'negociacao',
  terreno_id           uuid not null references app.terrenos(id),
  etapa_atual          text not null,
  etapa_desde          timestamptz not null default now(),
  status               text not null default 'ativo' check (status in ('ativo','ganha','perdida','stand_by')),
  responsavel_id       uuid references auth.users(id),
  viabilidade_id       uuid references app.viabilidades(id),
  motivo_encerramento  text,
  detalhe_encerramento text,
  retomar_em           date,
  data_inicio          timestamptz not null default now(),
  data_encerramento    timestamptz,
  criado_por           uuid default auth.uid(),
  atualizado_em        timestamptz not null default now(),
  unique (empresa_id, codigo),
  foreign key (tipo, etapa_atual) references app.etapas_modelo(tipo_processo, codigo),
  check (status <> 'perdida' or motivo_encerramento is not null),
  check (status <> 'stand_by' or retomar_em is not null)
);
create index on app.processos (empresa_id, status, etapa_atual);
create unique index processos_um_aberto_por_terreno on app.processos (terreno_id, tipo) where status in ('ativo','stand_by');

-- Dados próprios da negociação (1:1 com o processo).
create table app.negociacoes (
  processo_id          uuid primary key references app.processos(id) on delete cascade,
  empresa_id           uuid not null references app.empresas(id),
  oferta_referencia_id uuid references app.ofertas(id),
  temperatura          smallint check (temperatura between 1 and 5),  -- null = não avaliada
  temperatura_em       timestamptz
);

create table app.processo_transicoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  processo_id uuid not null references app.processos(id) on delete cascade,
  evento      text not null check (evento in ('abertura','avanco','perda','stand_by','retomada','ganho','temperatura')),
  de_etapa    text,
  para_etapa  text,
  forcado     boolean not null default false,
  comentario  text,
  user_id     uuid default auth.uid(),
  em          timestamptz not null default now()
);
create index on app.processo_transicoes (processo_id, em);

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

-- ---------------------------------------------------------------------
-- Tarefas: sempre do terreno; negociação opcional. "Atrasada" é calculada.
-- ---------------------------------------------------------------------
create table app.tarefas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  terreno_id     uuid not null references app.terrenos(id) on delete cascade,
  processo_id    uuid references app.processos(id),
  titulo         text not null,
  descricao      text,
  responsavel_id uuid references auth.users(id),
  prazo          date not null,
  prazo_hora     time,
  status         text not null default 'pendente' check (status in ('pendente','em_andamento','aguardando_terceiro','concluida','cancelada')),
  prioridade     text not null default 'media' check (prioridade in ('baixa','media','alta')),
  concluida_em   timestamptz,
  resultado      text,
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  check ((status = 'concluida') = (concluida_em is not null))
);
create index on app.tarefas (terreno_id);
create index on app.tarefas (empresa_id, prazo) where status not in ('concluida','cancelada');

create or replace function app.tg_tarefa_conclusao()
returns trigger language plpgsql as $$
begin
  if new.status = 'concluida' and new.concluida_em is null then new.concluida_em := now(); end if;
  if new.status <> 'concluida' then new.concluida_em := null; end if;
  return new;
end $$;
create trigger t_conclusao before insert or update on app.tarefas for each row execute function app.tg_tarefa_conclusao();

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
  pauta           text,
  resumo          text,                                           -- o que foi tratado, escrito por quem participou
  encaminhamentos text,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  uuid,
  constraint reuniao_local_so_presencial check ((modalidade = 'presencial') = (local is not null)),
  constraint reuniao_endereco_so_externo check (local is distinct from 'bkm' or endereco is null)
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
create trigger t_aud after insert or update or delete on app.processos   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.propostas   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.documentos  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.tarefas     for each row execute function app.tg_auditoria();
create trigger t_upd before update on app.reunioes for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.reunioes    for each row execute function app.tg_auditoria();

do $$
declare t text;
begin
  foreach t in array array['ofertas','viabilidades','processos','negociacoes','processo_transicoes','propostas','tarefas','atividades','reunioes','reuniao_participantes','diligencias','documentos','documento_versoes'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
  -- escrita direta só onde não há regra de etapa
  foreach t in array array['ofertas','tarefas','atividades','reunioes','reuniao_participantes','diligencias'] loop
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant insert, update on app.%I to authenticated', t);
    execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_mesma_empresa()', t);
  end loop;
end $$;
create policy remover on app.tarefas for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
create policy remover on app.reuniao_participantes for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
grant delete on app.tarefas, app.reuniao_participantes to authenticated;
grant usage on sequence app.processo_seq to authenticated;
