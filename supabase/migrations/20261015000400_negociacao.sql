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
  data_oferta            date not null default current_date,
  valor_pedido           numeric(14,2) check (valor_pedido > 0),
  forma_pagamento_pedida text check (forma_pagamento_pedida in ('dinheiro','permuta_fisica','permuta_financeira','permuta_geral','permuta_com_torna')),
  observacao_pagamento   text,
  aceita_permuta         text,
  comissao_pct           numeric(5,2) check (comissao_pct >= 0 and comissao_pct <= 100),
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
  status               text not null default 'ativo' check (status in ('ativo','ganha','perdida','suspensa')),
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
  check (status <> 'suspensa' or retomar_em is not null)
);
create index on app.processos (empresa_id, status, etapa_atual);
create unique index processos_um_aberto_por_terreno on app.processos (terreno_id, tipo) where status in ('ativo','suspensa');

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
  evento      text not null check (evento in ('abertura','avanco','perda','suspensao','retomada','ganho','temperatura')),
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
  tipo        text not null check (tipo in ('ligacao','visita','reuniao','email','mensagem','nota')),
  ocorreu_em  timestamptz not null default now(),
  resumo      text not null,
  user_id     uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index on app.atividades (terreno_id, ocorreu_em desc);

-- ---------------------------------------------------------------------
-- Documentos: o "documento" é estável; cada envio é uma versão.
-- ---------------------------------------------------------------------
create table app.documentos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  terreno_id     uuid not null references app.terrenos(id),
  processo_id    uuid references app.processos(id),
  proposta_id    uuid references app.propostas(id),
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
  unique (documento_id, versao)
);

-- ---------------------------------------------------------------------
-- Triggers e RLS
-- ---------------------------------------------------------------------
create trigger t_upd before update on app.processos  for each row execute function app.tg_atualizado_em();
create trigger t_upd before update on app.documentos for each row execute function app.tg_atualizado_em();
create trigger t_aud after insert or update or delete on app.ofertas     for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.processos   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.propostas   for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.documentos  for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.tarefas     for each row execute function app.tg_auditoria();

do $$
declare t text;
begin
  foreach t in array array['ofertas','viabilidades','processos','negociacoes','processo_transicoes','propostas','tarefas','atividades','documentos','documento_versoes'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
  end loop;
  -- escrita direta só onde não há regra de etapa
  foreach t in array array['ofertas','tarefas','atividades'] loop
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.minhas_empresas())) with check (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant insert, update on app.%I to authenticated', t);
    execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_mesma_empresa()', t);
  end loop;
end $$;
create policy remover on app.tarefas for delete to authenticated using (empresa_id in (select app.minhas_empresas()));
grant delete on app.tarefas to authenticated;
grant usage on sequence app.processo_seq to authenticated;
