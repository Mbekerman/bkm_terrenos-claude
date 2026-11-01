-- =====================================================================
-- BKM Terrenos · 00150 · fluxo: quadros e tarefas (bloco 1)
--
-- Módulo de quadros e tarefas, o "Trello da BKM" (decisões do Moisés,
-- 29/out/2026). Mora no esquema próprio `fluxo` e só conhece o que é da
-- base: empresas, membros e usuários. Não conhece terreno: o quadro aponta
-- para "o que ele acompanha" por tipo e id (objeto_tipo, objeto_id), sem
-- chave estrangeira, para que outros apps do mesmo Supabase usem os mesmos
-- quadros. O BKM Terrenos cria um quadro por terreno (ver terrenos) e liga
-- a tarefa ao processo (ver negociacao).
--
-- Bloco 1: quadro, listas, cartão (papéis, etiquetas, checklists com
-- responsável e prazo, comentários com reações, anexos), arquivar.
-- Cronograma, aprovações, SLA, visibilidade por cartão, campos,
-- recorrência e automações vêm nos blocos seguintes.
-- =====================================================================

create schema if not exists fluxo;
grant usage on schema fluxo to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Listas padrão de um quadro novo, por empresa (nula = modelo padrão,
-- usado pela empresa que ainda não tem as suas). Tipo: aberta, pausa ou
-- conclui (entrar nela conclui a tarefa). Editadas só pelo administrador.
-- ---------------------------------------------------------------------
create table fluxo.listas_modelo (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references app.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  ordem       int  not null,
  tipo        text not null default 'aberta' check (tipo in ('aberta','pausa','conclui')),
  ativo       boolean not null default true
);
create index on fluxo.listas_modelo (empresa_id, ordem);

insert into fluxo.listas_modelo (nome, ordem, tipo) values
  ('Backlog', 1, 'aberta'), ('Fazer', 2, 'aberta'), ('Fazendo', 3, 'aberta'),
  ('Aguardando retorno', 4, 'aberta'), ('Pausadas', 5, 'pausa'), ('Feito', 6, 'conclui');

-- ---------------------------------------------------------------------
-- Quadro: um por objeto acompanhado (no BKM Terrenos, o terreno).
-- ---------------------------------------------------------------------
create table fluxo.quadros (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  objeto_tipo  text not null check (objeto_tipo ~ '^[a-z_]+$'),  -- terreno, empreendimento, area...
  objeto_id    uuid,                                              -- nulo = quadro avulso (de uma área)
  nome         text,
  criado_por   uuid default auth.uid(),
  criado_em    timestamptz not null default now(),
  unique nulls not distinct (empresa_id, objeto_tipo, objeto_id)
);

create table fluxo.listas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  quadro_id   uuid not null references fluxo.quadros(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  posicao     double precision not null default extract(epoch from clock_timestamp()),
  tipo        text not null default 'aberta' check (tipo in ('aberta','pausa','conclui')),
  oculta      boolean not null default false
);
create index on fluxo.listas (quadro_id, posicao);

-- Etiquetas da empresa, com cor; várias por cartão.
create table fluxo.etiquetas (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  nome        text not null check (length(trim(nome)) > 0),
  cor         text not null default 'cinza' check (cor in ('cinza','azul','verde','amarelo','laranja','vermelho','roxo','rosa')),
  ativo       boolean not null default true,
  unique (empresa_id, nome)
);

-- ---------------------------------------------------------------------
-- Tarefa (o cartão). Sem status: a lista diz onde está, e concluir é
-- entrar numa lista do tipo "conclui" (ou marcar concluída). Não se apaga:
-- arquiva e restaura. "Atrasada" é calculada.
-- processo_id, etapa e subetapa: contexto do app que usa o quadro (no BKM
-- Terrenos, a fase e a etapa em que a tarefa nasceu); fluxo não confere.
-- ---------------------------------------------------------------------
create sequence fluxo.tarefa_seq;

create table fluxo.tarefas (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  codigo         text not null default 'TAR-' || lpad(nextval('fluxo.tarefa_seq')::text, 6, '0'),
  quadro_id      uuid not null references fluxo.quadros(id),
  lista_id       uuid not null references fluxo.listas(id),
  posicao        double precision not null default extract(epoch from clock_timestamp()),  -- ordem na lista
  titulo         text not null check (length(trim(titulo)) > 0),
  descricao      text,
  resultado      text,
  solicitante_id uuid references auth.users(id) default auth.uid(),
  responsavel_id uuid references auth.users(id),   -- o responsável principal: um só
  inicio         date,
  prazo          date,                              -- sem prazo = backlog
  prazo_hora     time,
  prioridade     text not null default 'media' check (prioridade in ('baixa','media','alta')),
  capa           text check (capa is null or capa in ('cinza','azul','verde','amarelo','laranja','vermelho','roxo','rosa')),
  aprovacao_modo text not null default 'paralelo' check (aprovacao_modo in ('paralelo','sequencia')),  -- bloco 3
  visibilidade   text not null default 'publico' check (visibilidade in ('publico','individual','restrito')),  -- bloco 3; o front sempre pergunta
  modelo         boolean not null default false,  -- modelo de cartão (bloco 4): fica no quadro para copiar, não conclui nem atrasa
  mae_id         uuid references fluxo.tarefas(id),  -- subtarefa (30/out): a tarefa mãe, no mesmo quadro, um nível só
  processo_id    uuid,
  etapa          text,
  subetapa       text,
  concluida_em   timestamptz,
  concluida_por  uuid,
  arquivada_em   timestamptz,
  arquivada_por  uuid,
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  unique (empresa_id, codigo),
  check (prazo_hora is null or prazo is not null),
  check (inicio is null or prazo is null or inicio <= prazo)
);
create index on fluxo.tarefas (quadro_id, lista_id, posicao);
create index on fluxo.tarefas (empresa_id, prazo) where concluida_em is null and arquivada_em is null;
create index on fluxo.tarefas (responsavel_id) where concluida_em is null and arquivada_em is null;

-- Demais pessoas do cartão, por papel. O solicitante e o responsável
-- principal ficam no próprio cartão; aqui, executores, aprovadores e quem
-- acompanha (recebe aviso de comentário e de conclusão).
create table fluxo.tarefa_pessoas (
  empresa_id  uuid not null references app.empresas(id),
  tarefa_id   uuid not null references fluxo.tarefas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  papel       text not null check (papel in ('executor','aprovador','acompanha')),
  ordem       int,                     -- aprovadores em sequência: a vez de cada um
  incluido_por uuid default auth.uid(),
  incluido_em timestamptz not null default now(),
  primary key (tarefa_id, user_id, papel)
);

create table fluxo.tarefa_etiquetas (
  empresa_id   uuid not null references app.empresas(id),
  tarefa_id    uuid not null references fluxo.tarefas(id) on delete cascade,
  etiqueta_id  uuid not null references fluxo.etiquetas(id),
  primary key (tarefa_id, etiqueta_id)
);

-- Checklists: vários por cartão; cada item com responsável e prazo próprios.
create table fluxo.checklists (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  tarefa_id   uuid not null references fluxo.tarefas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  posicao     double precision not null default extract(epoch from clock_timestamp()),
  esconder_feitos boolean not null default false
);
create index on fluxo.checklists (tarefa_id, posicao);

create table fluxo.checklist_itens (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  checklist_id   uuid not null references fluxo.checklists(id) on delete cascade,
  texto          text not null check (length(trim(texto)) > 0),
  responsavel_id uuid references auth.users(id),
  prazo          date,
  posicao        double precision not null default extract(epoch from clock_timestamp()),
  concluido_em   timestamptz,
  concluido_por  uuid,
  virou_tarefa_id uuid references fluxo.tarefas(id),  -- item convertido em cartão
  -- item em aberto ao concluir (31/out/2026): livre, justificativa ou bloqueia; nulo = regra da empresa (fluxo.regras)
  regra_branco   text check (regra_branco in ('livre','justificativa','bloqueia')),
  condicao       jsonb   -- a regra só vale quando a condição vale (sem condição, sempre)
);
create index on fluxo.checklist_itens (checklist_id, posicao);

-- Comentários: o autor edita e apaga os seus; apagar só esconde o texto
-- (o histórico guarda o que foi escrito).
create table fluxo.comentarios (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  tarefa_id    uuid not null references fluxo.tarefas(id) on delete cascade,
  resposta_a   uuid references fluxo.comentarios(id),
  autor_id     uuid not null default auth.uid() references auth.users(id),
  texto        text not null check (length(trim(texto)) > 0),
  criado_em    timestamptz not null default clock_timestamp(),
  editado_em   timestamptz,
  apagado_em   timestamptz
);
create index on fluxo.comentarios (tarefa_id, criado_em);

create table fluxo.comentario_reacoes (
  empresa_id     uuid not null references app.empresas(id),
  comentario_id  uuid not null references fluxo.comentarios(id) on delete cascade,
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji          text not null check (length(emoji) between 1 and 16),
  primary key (comentario_id, user_id, emoji)
);

-- Anexos: arquivo (no Drive da empresa), link externo ou outro cartão.
-- Remover só tira da lista (removido_em).
create table fluxo.anexos (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  tarefa_id      uuid not null references fluxo.tarefas(id) on delete cascade,
  tipo           text not null check (tipo in ('arquivo','link','tarefa')),
  nome           text not null check (length(trim(nome)) > 0),
  url            text,
  drive_file_id  text,
  tarefa_ref_id  uuid references fluxo.tarefas(id),
  criado_por     uuid default auth.uid(),
  criado_em      timestamptz not null default now(),
  removido_em    timestamptz,
  check ((tipo = 'tarefa') = (tarefa_ref_id is not null)),
  check (tipo = 'tarefa' or url is not null or drive_file_id is not null)
);
create index on fluxo.anexos (tarefa_id);

-- ---------------------------------------------------------------------
-- Regras automáticas
-- ---------------------------------------------------------------------
-- Pai e filho na mesma empresa; lista do mesmo quadro; cartão não troca de quadro.
create or replace function fluxo.tg_mesma_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new); v uuid;
begin
  if j ? 'lista_id' then
    select empresa_id into v from fluxo.listas where id = new.lista_id and quadro_id = new.quadro_id;
    if v is null then raise exception 'A lista não é deste quadro' using errcode = '23514'; end if;
  elsif j ? 'quadro_id' then select empresa_id into v from fluxo.quadros where id = (j->>'quadro_id')::uuid;
  elsif j ? 'checklist_id' then select empresa_id into v from fluxo.checklists where id = (j->>'checklist_id')::uuid;
  elsif j ? 'comentario_id' then select empresa_id into v from fluxo.comentarios where id = (j->>'comentario_id')::uuid;
  elsif j ? 'tarefa_id' then select empresa_id into v from fluxo.tarefas where id = (j->>'tarefa_id')::uuid;
  elsif j ? 'campo_id' then select empresa_id into v from fluxo.campos where id = (j->>'campo_id')::uuid;
  else return new;
  end if;
  if v is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  if j ? 'etiqueta_id' and not exists (select 1 from fluxo.etiquetas where id = (j->>'etiqueta_id')::uuid and empresa_id = new.empresa_id) then
    raise exception 'Etiqueta de outra empresa' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (old.empresa_id is distinct from new.empresa_id
     or (j ? 'quadro_id' and to_jsonb(old)->'quadro_id' is distinct from j->'quadro_id')
     or (j ? 'tarefa_id' and to_jsonb(old)->'tarefa_id' is distinct from j->'tarefa_id')) then
    raise exception 'Um registro não muda de quadro nem de tarefa' using errcode = '23514';
  end if;
  return new;
end $$;

-- Entrar numa lista "conclui" conclui; sair dela reabre. Concluir à mão
-- (concluida_em) leva o cartão para a primeira lista "conclui" do quadro, e
-- reabrir leva para a primeira aberta.
create or replace function fluxo.tg_tarefa_lista()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tipo text; v_tipo_ant text; v_lista_ant uuid; v_pend text[]; v_mudou_lista boolean := tg_op = 'INSERT' or new.lista_id is distinct from old.lista_id;
begin
  if not v_mudou_lista and tg_op = 'UPDATE' and (new.concluida_em is null) <> (old.concluida_em is null) then
    select id into new.lista_id from fluxo.listas
    where quadro_id = new.quadro_id and tipo = case when new.concluida_em is null then 'aberta' else 'conclui' end and not oculta
    order by posicao limit 1;
    if new.lista_id is null then raise exception 'O quadro não tem lista para isso' using errcode = '23514'; end if;
    new.posicao := extract(epoch from clock_timestamp());
  end if;
  select tipo into v_tipo from fluxo.listas where id = new.lista_id;
  -- pausa (bloco 3): entrar e sair da lista de pausa só por fluxo.pausar e fluxo.retomar; concluir encerra a pausa
  if tg_op = 'UPDATE' then v_lista_ant := old.lista_id; v_tipo_ant := (select tipo from fluxo.listas where id = old.lista_id); end if;
  if coalesce(current_setting('fluxo.pausando', true), '') <> '1' and new.lista_id is distinct from v_lista_ant then
    if v_tipo = 'pausa' and v_tipo_ant is distinct from 'pausa' then
      raise exception 'Para pausar, use Pausar (com o motivo)' using errcode = '23514';
    elsif v_tipo_ant = 'pausa' and v_tipo <> 'pausa' then
      if v_tipo <> 'conclui' then raise exception 'Para tirar a tarefa da pausa, use Retomar' using errcode = '23514'; end if;
      update fluxo.pausas set situacao = 'encerrada', fim = clock_timestamp(), dias = 0, retomada_por = auth.uid()
      where tarefa_id = new.id and situacao = 'ativa';
    end if;
  end if;
  if v_tipo = 'conclui' and (new.concluida_em is null or tg_op = 'INSERT' or old.concluida_em is null) then
    if new.modelo then raise exception 'Modelo de cartão não se conclui' using errcode = '23514'; end if;
    -- bloqueio de conclusão (bloco 3): aprovação e checklist; a aprovação conclui por conta própria
    if tg_op = 'UPDATE' and coalesce(current_setting('fluxo.aprovando', true), '') <> '1' then
      v_pend := fluxo.pendencias_conclusao(new.id);
      if 'aprovacao' = any (v_pend) then
        raise exception 'A tarefa precisa ser aprovada antes de concluir' using errcode = '23514';
      elsif 'checklist' = any (v_pend) then
        raise exception 'Conclua os itens do checklist antes de concluir a tarefa' using errcode = '23514';
      elsif 'subtarefas' = any (v_pend) then
        raise exception 'Conclua as subtarefas antes de concluir a tarefa' using errcode = '23514';
      elsif 'campos' = any (v_pend) then
        raise exception 'Preencha os campos obrigatórios antes de concluir a tarefa' using errcode = '23514';
      elsif 'justificar' = any (v_pend) then
        raise exception 'Há itens em branco: conclua com justificativa' using errcode = '23514';
      elsif 'predecessoras' = any (v_pend) then
        raise exception 'As predecessoras ainda não permitem concluir esta tarefa' using errcode = '23514';
      end if;
    end if;
    new.concluida_em := coalesce(new.concluida_em, now()); new.concluida_por := auth.uid();
  elsif v_tipo <> 'conclui' then
    -- reabrir: a aprovação dada deixa de valer e um pedido em aberto é cancelado
    if tg_op = 'UPDATE' and old.concluida_em is not null then
      update fluxo.aprovacoes set situacao = 'invalidada' where tarefa_id = new.id and situacao = 'aprovada';
    end if;
    new.concluida_em := null; new.concluida_por := null;
  end if;
  if tg_op = 'UPDATE' and (new.arquivada_em is null) <> (old.arquivada_em is null) then
    new.arquivada_por := case when new.arquivada_em is null then null else auth.uid() end;
  end if;
  return new;
end $$;

create or replace function fluxo.tg_item_concluido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.concluido_em is not null and (tg_op = 'INSERT' or old.concluido_em is null) then new.concluido_por := auth.uid(); end if;
  if new.concluido_em is null then new.concluido_por := null; end if;
  return new;
end $$;

-- Comentário: só o autor edita (marca editado_em) e o texto apagado some da tela.
create or replace function fluxo.tg_comentario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.autor_id is distinct from old.autor_id or new.tarefa_id is distinct from old.tarefa_id then
    raise exception 'O comentário não muda de autor' using errcode = '23514';
  end if;
  if old.apagado_em is not null then raise exception 'Comentário apagado não se edita' using errcode = '23514'; end if;
  if new.texto is distinct from old.texto then new.editado_em := now(); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Funções
-- ---------------------------------------------------------------------
-- Quadro do objeto (cria na primeira vez, com as listas do modelo da empresa).
create or replace function fluxo.quadro_de(p_empresa uuid, p_tipo text, p_objeto uuid, p_nome text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid; v_modelo uuid;
begin
  if auth.uid() is not null and not app.eh_membro(p_empresa) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;
  select id into v from fluxo.quadros where empresa_id = p_empresa and objeto_tipo = p_tipo and objeto_id is not distinct from p_objeto;
  if v is not null then return v; end if;
  insert into fluxo.quadros (empresa_id, objeto_tipo, objeto_id, nome) values (p_empresa, p_tipo, p_objeto, p_nome) returning id into v;
  v_modelo := case when exists (select 1 from fluxo.listas_modelo where empresa_id = p_empresa and ativo) then p_empresa end;
  insert into fluxo.listas (empresa_id, quadro_id, nome, posicao, tipo)
  select p_empresa, v, nome, ordem * 1000, tipo from fluxo.listas_modelo
  where empresa_id is not distinct from v_modelo and ativo;
  return v;
end $$;

-- Administrador: lista padrão da empresa (cria, renomeia, reordena, muda o
-- tipo ou desativa). Na primeira mudança, a empresa ganha a cópia do padrão.
-- Vale para quadros novos; os existentes mantêm as suas listas.
create or replace function fluxo.salvar_lista_modelo(p_empresa uuid, p_id uuid, p_nome text, p_ordem int, p_tipo text, p_ativo boolean default true)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v uuid := p_id; v_nome text;
begin
  perform app.exigir_administrador(p_empresa);
  if not exists (select 1 from fluxo.listas_modelo where empresa_id = p_empresa) then
    -- cópia do padrão; a lista que se edita passa a ser a cópia
    select nome into v_nome from fluxo.listas_modelo where id = p_id and empresa_id is null;
    insert into fluxo.listas_modelo (empresa_id, nome, ordem, tipo, ativo)
    select p_empresa, nome, ordem, tipo, ativo from fluxo.listas_modelo where empresa_id is null;
    if v_nome is not null then select id into v from fluxo.listas_modelo where empresa_id = p_empresa and nome = v_nome; end if;
  end if;
  if v is not null and not exists (select 1 from fluxo.listas_modelo where id = v and empresa_id = p_empresa) then
    raise exception 'Lista de outra empresa' using errcode = '42501';
  end if;
  if v is null then
    insert into fluxo.listas_modelo (empresa_id, nome, ordem, tipo, ativo) values (p_empresa, trim(p_nome), p_ordem, p_tipo, coalesce(p_ativo, true)) returning id into v;
  else
    update fluxo.listas_modelo set nome = trim(p_nome), ordem = p_ordem, tipo = p_tipo, ativo = coalesce(p_ativo, true) where id = v;
  end if;
  if not exists (select 1 from fluxo.listas_modelo where empresa_id = p_empresa and ativo and tipo = 'conclui') then
    raise exception 'O modelo precisa de uma lista que conclui a tarefa' using errcode = '23514';
  end if;
  return v;
end $$;

-- Item do checklist vira cartão no mesmo quadro (o item fica, apontando para ele, e conta como feito).
create or replace function fluxo.item_para_tarefa(p_item uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i fluxo.checklist_itens; k fluxo.tarefas; v uuid;
begin
  select * into i from fluxo.checklist_itens where id = p_item for update;
  if not found then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  perform fluxo.exigir_edicao_tarefa((select c.tarefa_id from fluxo.checklists c where c.id = i.checklist_id));
  if i.virou_tarefa_id is not null then return i.virou_tarefa_id; end if;
  select t.* into k from fluxo.tarefas t join fluxo.checklists c on c.tarefa_id = t.id where c.id = i.checklist_id;
  insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, prazo, processo_id, etapa, subetapa, visibilidade)
  values (k.empresa_id, k.quadro_id,
          (select id from fluxo.listas where quadro_id = k.quadro_id and tipo = 'aberta' and not oculta order by posicao limit 1),
          i.texto, 'Veio do checklist de ' || k.codigo || ' · ' || k.titulo, i.prazo, k.processo_id, k.etapa, k.subetapa, k.visibilidade)
  returning id into v;
  -- herda a visibilidade do cartão de origem (bloco 3), antes de ganhar o responsável
  insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, grupo_id, papel, excluido)
  select empresa_id, v, user_id, grupo_id, papel, excluido from fluxo.tarefa_acessos where tarefa_id = k.id;
  if i.responsavel_id is not null then update fluxo.tarefas set responsavel_id = i.responsavel_id where id = v; end if;
  insert into fluxo.anexos (empresa_id, tarefa_id, tipo, nome, tarefa_ref_id) values (k.empresa_id, v, 'tarefa', k.codigo || ' · ' || k.titulo, k.id);
  update fluxo.checklist_itens set virou_tarefa_id = v, concluido_em = coalesce(concluido_em, now()) where id = p_item;
  return v;
end $$;

-- Cartão com o atraso calculado e o andamento do checklist (base das telas).
create view fluxo.v_tarefas with (security_invoker = true) as
select k.*, l.nome as lista_nome, l.tipo as lista_tipo, q.objeto_tipo, q.objeto_id,
       (k.concluida_em is null and k.arquivada_em is null and k.prazo < current_date and l.tipo <> 'pausa' and not k.modelo) as atrasada,  -- pausada e modelo não atrasam
       coalesce(ci.total, 0) as checklist_total, coalesce(ci.feitos, 0) as checklist_feitos
from fluxo.tarefas k
join fluxo.listas l on l.id = k.lista_id
join fluxo.quadros q on q.id = k.quadro_id
left join lateral (select count(*) as total, count(*) filter (where i.concluido_em is not null) as feitos
                   from fluxo.checklists c join fluxo.checklist_itens i on i.checklist_id = c.id where c.tarefa_id = k.id) ci on true;

-- ---------------------------------------------------------------------
-- Gatilhos, RLS e permissões
-- ---------------------------------------------------------------------
create trigger t_lista before insert or update on fluxo.tarefas for each row execute function fluxo.tg_tarefa_lista();
create trigger t_concluido before insert or update on fluxo.checklist_itens for each row execute function fluxo.tg_item_concluido();
create trigger t_comentario before update on fluxo.comentarios for each row execute function fluxo.tg_comentario();

do $$
declare t text;
begin
  foreach t in array array['quadros','listas','etiquetas','tarefas','tarefa_pessoas','tarefa_etiquetas','checklists','checklist_itens','comentarios','comentario_reacoes','anexos'] loop
    execute format('alter table fluxo.%I enable row level security', t);
    execute format('create policy ver on fluxo.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on fluxo.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on fluxo.%I for each row execute function app.tg_auditoria()', t);
    if t <> 'quadros' then
      execute format('create trigger t_emp before insert or update on fluxo.%I for each row execute function fluxo.tg_mesma_empresa()', t);
    end if;
  end loop;
  -- escrita direta de quem edita; quadro nasce por fluxo.quadro_de
  foreach t in array array['listas','etiquetas','tarefas','tarefa_pessoas','tarefa_etiquetas','checklists','checklist_itens','anexos'] loop
    execute format('create policy inserir on fluxo.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on fluxo.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant insert, update on fluxo.%I to authenticated', t);
  end loop;
  -- vínculos se removem; cartão, lista e etiqueta, não (arquivar, ocultar, desativar)
  foreach t in array array['tarefa_pessoas','tarefa_etiquetas','checklists','checklist_itens'] loop
    execute format('create policy remover on fluxo.%I for delete to authenticated using (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant delete on fluxo.%I to authenticated', t);
  end loop;
end $$;

-- Comentar e reagir: quem edita. Editar e apagar (apagado_em): só o autor.
create policy inserir on fluxo.comentarios for insert to authenticated
  with check (empresa_id in (select app.empresas_edicao()) and autor_id = auth.uid());
create policy alterar on fluxo.comentarios for update to authenticated
  using (autor_id = auth.uid() and empresa_id in (select app.empresas_edicao())) with check (autor_id = auth.uid());
create policy inserir on fluxo.comentario_reacoes for insert to authenticated
  with check (empresa_id in (select app.empresas_edicao()) and user_id = auth.uid());
create policy remover on fluxo.comentario_reacoes for delete to authenticated using (user_id = auth.uid());
grant insert, update on fluxo.comentarios to authenticated;
grant insert, delete on fluxo.comentario_reacoes to authenticated;

alter table fluxo.listas_modelo enable row level security;
create policy ver on fluxo.listas_modelo for select to authenticated
  using (empresa_id is null or empresa_id in (select app.minhas_empresas()));
grant select on fluxo.listas_modelo to authenticated;
create trigger t_aud after insert or update or delete on fluxo.listas_modelo for each row execute function app.tg_auditoria();

grant select on fluxo.v_tarefas to authenticated;
grant usage on sequence fluxo.tarefa_seq to authenticated;
revoke all on function fluxo.quadro_de(uuid, text, uuid, text), fluxo.salvar_lista_modelo(uuid, uuid, text, int, text, boolean),
                       fluxo.item_para_tarefa(uuid) from public;
grant execute on function fluxo.quadro_de(uuid, text, uuid, text), fluxo.salvar_lista_modelo(uuid, uuid, text, int, text, boolean),
                          fluxo.item_para_tarefa(uuid) to authenticated;

-- =====================================================================
-- Bloco 2: cronograma no estilo do MS Project (decisões do Moisés, 29/out/2026)
--
-- Vínculos entre cartões com os quatro tipos do Project (TI término-início,
-- o padrão; II início-início; TT término-término; IT início-término) e
-- defasagem em dias (negativa adianta). As datas se refazem sozinhas como
-- no Project com "o mais cedo possível": a tarefa começa no maior entre o
-- que os vínculos pedem e o início que a pessoa digitou (inicio_min, a
-- restrição "não começar antes de"), mantendo a duração. Mexer numa tarefa
-- empurra as que dependem dela, em cascata; tarefa concluída não se move.
-- Dias corridos por padrão; a empresa pode passar a dias úteis (sem sábado,
-- domingo e feriados). II e TT juntos com durações diferentes seguem o
-- Project (a sucessora começa depois); o front pergunta se estica o prazo.
--
-- Linha de base: quem edita monta o cronograma e manda para aprovação; o
-- gestor de quem mandou (ou alguém acima, ou o administrador) aprova, e a
-- aprovada vira a linha de base. Depois disso, só gestor, diretor ou
-- administrador trocam a linha de base (o analista pode pedir; o gestor
-- aprova). As datas atuais seguem livres e a linha de base mostra o atraso;
-- quem mudou cada data fica na auditoria. Linhas de base antigas ficam
-- guardadas (substituida), nunca apagadas.
-- =====================================================================

-- Calendário da empresa: dias corridos (padrão) ou úteis
create table fluxo.calendarios (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null unique references app.empresas(id) on delete cascade,
  dias_uteis  boolean not null default false
);

-- Feriados (empresa nula = nacional). Carnaval e Corpus Christi são ponto
-- facultativo, mas entram por costume do mercado; a empresa pode ter os seus.
create table fluxo.feriados (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references app.empresas(id) on delete cascade,
  data        date not null,
  nome        text not null,
  unique nulls not distinct (empresa_id, data)
);
insert into fluxo.feriados (data, nome)
select make_date(a, m, d), n from generate_series(2026, 2030) a,
  (values (1,1,'Confraternização Universal'), (4,21,'Tiradentes'), (5,1,'Dia do Trabalho'), (9,7,'Independência'),
          (10,12,'Nossa Senhora Aparecida'), (11,2,'Finados'), (11,15,'Proclamação da República'),
          (11,20,'Dia da Consciência Negra'), (12,25,'Natal')) f(m, d, n)
union all
select x::date, n from (values
  ('2026-02-16','Carnaval'), ('2026-02-17','Carnaval'), ('2026-04-03','Sexta-feira Santa'), ('2026-06-04','Corpus Christi'),
  ('2027-02-08','Carnaval'), ('2027-02-09','Carnaval'), ('2027-03-26','Sexta-feira Santa'), ('2027-05-27','Corpus Christi'),
  ('2028-02-28','Carnaval'), ('2028-02-29','Carnaval'), ('2028-04-14','Sexta-feira Santa'), ('2028-06-15','Corpus Christi'),
  ('2029-02-12','Carnaval'), ('2029-02-13','Carnaval'), ('2029-03-30','Sexta-feira Santa'), ('2029-05-31','Corpus Christi'),
  ('2030-03-04','Carnaval'), ('2030-03-05','Carnaval'), ('2030-04-19','Sexta-feira Santa'), ('2030-06-20','Corpus Christi')) v(x, n);

create or replace function fluxo.usa_dias_uteis(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select dias_uteis from fluxo.calendarios where empresa_id = p_empresa), false) $$;

create or replace function fluxo.dia_util(p_empresa uuid, p_dia date)
returns boolean language sql stable security definer set search_path = '' as $$
  select extract(isodow from p_dia) < 6
     and not exists (select 1 from fluxo.feriados where data = p_dia and (empresa_id is null or empresa_id = p_empresa)) $$;

-- p_dia + n dias no calendário da empresa (n negativo volta). Em dias úteis,
-- um dia de folga anda primeiro para o dia útil seguinte (ou anterior, se n < 0).
create or replace function fluxo.somar_dias(p_empresa uuid, p_dia date, p_n int)
returns date language plpgsql stable security definer set search_path = '' as $$
declare x date := p_dia; passo int := case when p_n < 0 then -1 else 1 end; falta int := abs(p_n);
begin
  if p_dia is null or p_n is null then return null; end if;
  if not fluxo.usa_dias_uteis(p_empresa) then return p_dia + p_n; end if;
  while not fluxo.dia_util(p_empresa, x) loop x := x + passo; end loop;
  while falta > 0 loop
    x := x + passo;
    if fluxo.dia_util(p_empresa, x) then falta := falta - 1; end if;
  end loop;
  return x;
end $$;

-- Duração de início a prazo, contando os dois (mínimo 1).
create or replace function fluxo.duracao_dias(p_empresa uuid, p_inicio date, p_prazo date)
returns int language sql stable security definer set search_path = '' as $$
  select case when p_inicio is null or p_prazo is null then null
              when not fluxo.usa_dias_uteis(p_empresa) then p_prazo - p_inicio + 1
              else greatest(1, (select count(*)::int from generate_series(p_inicio, p_prazo, interval '1 day') g(d) where fluxo.dia_util(p_empresa, g.d::date))) end $$;

alter table fluxo.tarefas
  add column duracao    int check (duracao is null or duracao >= 1),  -- dias no calendário da empresa
  add column inicio_min date;                                         -- "não começar antes de": o início que a pessoa digitou

-- Vínculos (predecessora → sucessora)
create table fluxo.vinculos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  predecessora_id  uuid not null references fluxo.tarefas(id) on delete cascade,
  sucessora_id     uuid not null references fluxo.tarefas(id) on delete cascade,
  tipo             text not null default 'TI' check (tipo in ('TI','II','TT','IT')),
  defasagem        int  not null default 0,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default now(),
  check (predecessora_id <> sucessora_id),
  unique (predecessora_id, sucessora_id, tipo)
);
create index on fluxo.vinculos (sucessora_id);

-- O início mais cedo que os vínculos permitem para uma tarefa de duração p_dur.
create or replace function fluxo.inicio_cedo(p_tarefa uuid, p_dur int)
returns date language sql stable security definer set search_path = '' as $$
  select max(case v.tipo
    when 'TI' then fluxo.somar_dias(v.empresa_id, p.prazo, 1 + v.defasagem)
    when 'II' then fluxo.somar_dias(v.empresa_id, p.inicio, v.defasagem)
    when 'TT' then fluxo.somar_dias(v.empresa_id, fluxo.somar_dias(v.empresa_id, p.prazo, v.defasagem), -(p_dur - 1))
    when 'IT' then fluxo.somar_dias(v.empresa_id, fluxo.somar_dias(v.empresa_id, p.inicio, v.defasagem), -(p_dur - 1)) end)
  from fluxo.vinculos v join fluxo.tarefas p on p.id = v.predecessora_id
  where v.sucessora_id = p_tarefa and p.inicio is not null and p.prazo is not null and p.arquivada_em is null $$;

-- Antes de gravar: guarda o que a pessoa digitou (início mínimo e duração)
-- e põe a tarefa no início mais cedo que os vínculos deixam. Na cascata
-- (fluxo.cascata = 1) só reposiciona, sem tomar o início como digitado.
create or replace function fluxo.tg_cronograma()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_cascata boolean := coalesce(current_setting('fluxo.cascata', true), '') = '1'; r date;
begin
  if v_cascata and new.concluida_em is not null then return new; end if;
  if not v_cascata then
    if tg_op = 'INSERT' or new.inicio is distinct from old.inicio then new.inicio_min := new.inicio; end if;
    -- como no Project: mudar só o início move a tarefa inteira (mantém a duração); mudar o prazo muda a duração
    if tg_op = 'UPDATE' and new.inicio is distinct from old.inicio and new.prazo is not distinct from old.prazo
       and new.inicio is not null and old.duracao is not null then
      new.prazo := fluxo.somar_dias(new.empresa_id, new.inicio, old.duracao - 1);
    elsif tg_op = 'INSERT' or new.inicio is distinct from old.inicio or new.prazo is distinct from old.prazo then
      new.duracao := fluxo.duracao_dias(new.empresa_id, new.inicio, new.prazo);
    elsif new.duracao is distinct from old.duracao and new.inicio is not null then
      -- duração digitada (ou "esticar" do aviso de II e TT): o prazo acompanha
      new.prazo := fluxo.somar_dias(new.empresa_id, new.inicio, new.duracao - 1);
    end if;
  end if;
  if tg_op = 'UPDATE' and new.concluida_em is null then
    r := fluxo.inicio_cedo(new.id, coalesce(new.duracao, 1));
    if r is not null then
      new.duracao := coalesce(new.duracao, 1);
      new.inicio := greatest(r, coalesce(new.inicio_min, r));
      new.prazo := fluxo.somar_dias(new.empresa_id, new.inicio, new.duracao - 1);
    end if;
  end if;
  return new;
end $$;

-- Reposiciona as sucessoras de uma tarefa (e, por elas, as seguintes).
create or replace function fluxo.reprogramar_sucessoras(p_tarefas uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare v_antes text := current_setting('fluxo.cascata', true);
begin
  perform set_config('fluxo.cascata', '1', true);
  update fluxo.tarefas s set inicio = s.inicio
  where s.id in (select sucessora_id from fluxo.vinculos where predecessora_id = any (p_tarefas));
  perform set_config('fluxo.cascata', coalesce(v_antes, ''), true);
end $$;

create or replace function fluxo.tg_cronograma_cascata()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.inicio is distinct from old.inicio or new.prazo is distinct from old.prazo or (new.arquivada_em is null) <> (old.arquivada_em is null) then
    perform fluxo.reprogramar_sucessoras(array[new.id]);
  end if;
  return null;
end $$;

-- Vínculo: mesma empresa e sem ciclo; ao criar, mudar ou tirar, a sucessora se reposiciona.
create or replace function fluxo.tg_vinculo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    perform set_config('fluxo.cascata', '1', true);
    update fluxo.tarefas set inicio = inicio where id = old.sucessora_id;
    perform set_config('fluxo.cascata', '', true);
    return old;
  end if;
  if tg_op = 'UPDATE' and (new.predecessora_id <> old.predecessora_id or new.sucessora_id <> old.sucessora_id) then
    raise exception 'Para ligar outras tarefas, crie outro vínculo' using errcode = '23514';
  end if;
  if (select count(*) from fluxo.tarefas where id in (new.predecessora_id, new.sucessora_id) and empresa_id = new.empresa_id) <> 2 then
    raise exception 'Vínculo entre tarefas de outra empresa' using errcode = '42501';
  end if;
  if exists (
    with recursive adiante as (
      select sucessora_id as id, 1 as n from fluxo.vinculos where predecessora_id = new.sucessora_id
      union
      select v.sucessora_id, a.n + 1 from adiante a join fluxo.vinculos v on v.predecessora_id = a.id where a.n < 500)
    select 1 from adiante where id = new.predecessora_id) then
    raise exception 'Esse vínculo fecharia um círculo: a tarefa dependeria dela mesma' using errcode = '23514';
  end if;
  return new;
end $$;

create or replace function fluxo.tg_vinculo_depois()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_antes text := current_setting('fluxo.cascata', true);
begin
  perform set_config('fluxo.cascata', '1', true);
  update fluxo.tarefas set inicio = inicio where id = new.sucessora_id;
  perform set_config('fluxo.cascata', coalesce(v_antes, ''), true);
  return null;
end $$;

create trigger t_crono before insert or update on fluxo.tarefas for each row execute function fluxo.tg_cronograma();
create trigger t_crono_cascata after update of inicio, prazo, arquivada_em on fluxo.tarefas for each row execute function fluxo.tg_cronograma_cascata();
create trigger t_vinculo before insert or update or delete on fluxo.vinculos for each row execute function fluxo.tg_vinculo();
create trigger t_vinculo_depois after insert or update on fluxo.vinculos for each row execute function fluxo.tg_vinculo_depois();

-- Linha de base do quadro: retrato das datas aprovado pelo gestor.
create table fluxo.linhas_base (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  quadro_id       uuid not null references fluxo.quadros(id) on delete cascade,
  numero          int,                    -- 1, 2, 3... na ordem das aprovadas
  situacao        text not null default 'pendente' check (situacao in ('pendente','aprovada','recusada','substituida','cancelada')),
  motivo          text,                   -- por que mudar (obrigatório depois da primeira)
  pedida_por      uuid not null default auth.uid(),
  pedida_em       timestamptz not null default now(),
  decidida_por    uuid,
  decidida_em     timestamptz,
  motivo_decisao  text,
  check ((situacao = 'aprovada' or situacao = 'substituida') = (numero is not null))
);
create unique index on fluxo.linhas_base (quadro_id) where situacao = 'pendente';
create unique index on fluxo.linhas_base (quadro_id) where situacao = 'aprovada';
create unique index on fluxo.linhas_base (quadro_id, numero);

create table fluxo.linha_base_itens (
  linha_base_id  uuid not null references fluxo.linhas_base(id) on delete cascade,
  empresa_id     uuid not null references app.empresas(id),
  tarefa_id      uuid not null references fluxo.tarefas(id) on delete cascade,
  inicio         date not null,
  prazo          date not null,
  duracao        int,
  primary key (linha_base_id, tarefa_id)
);

-- Quem aprova a linha de base pedida por p_pedinte: o administrador, um
-- diretor, ou um gestor acima de quem pediu (o gestor que pede já tem o nível).
create or replace function fluxo.aprova_linha_base(p_empresa uuid, p_pedinte uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.eh_administrador(p_empresa) or coalesce(app.papel(p_empresa) = 'diretor', false)
      or (app.eh_gestor(p_empresa) and (p_pedinte = auth.uid() or app.eh_superior(p_empresa, auth.uid(), p_pedinte))) $$;

create or replace function fluxo.aprovar_linha_base_interna(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_quadro uuid;
begin
  select quadro_id into v_quadro from fluxo.linhas_base where id = p_id;
  update fluxo.linhas_base set situacao = 'substituida' where quadro_id = v_quadro and situacao = 'aprovada';
  update fluxo.linhas_base set situacao = 'aprovada', decidida_por = auth.uid(), decidida_em = now(),
    numero = (select coalesce(max(numero), 0) + 1 from fluxo.linhas_base where quadro_id = v_quadro)
  where id = p_id;
end $$;

-- Manda o cronograma do quadro (as tarefas não arquivadas com início e
-- prazo) para aprovação. Quem já aprova (gestor, diretor, administrador)
-- tem a sua aprovada na hora. Um pedido novo cancela o pendente.
create or replace function fluxo.enviar_cronograma(p_quadro uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_emp uuid; v uuid;
begin
  select empresa_id into v_emp from fluxo.quadros where id = p_quadro;
  if v_emp is null then raise exception 'Quadro não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v_emp);
  if exists (select 1 from fluxo.linhas_base where quadro_id = p_quadro and situacao = 'aprovada') and coalesce(trim(p_motivo), '') = '' then
    raise exception 'Diga por que a linha de base muda' using errcode = '23514';
  end if;
  if not exists (select 1 from fluxo.tarefas where quadro_id = p_quadro and arquivada_em is null and inicio is not null and prazo is not null) then
    raise exception 'O cronograma não tem tarefa com início e prazo' using errcode = '23514';
  end if;
  update fluxo.linhas_base set situacao = 'cancelada', decidida_por = auth.uid(), decidida_em = now()
  where quadro_id = p_quadro and situacao = 'pendente';
  insert into fluxo.linhas_base (empresa_id, quadro_id, motivo) values (v_emp, p_quadro, nullif(trim(p_motivo), '')) returning id into v;
  insert into fluxo.linha_base_itens (linha_base_id, empresa_id, tarefa_id, inicio, prazo, duracao)
  select v, v_emp, id, inicio, prazo, duracao from fluxo.tarefas
  where quadro_id = p_quadro and arquivada_em is null and inicio is not null and prazo is not null;
  if fluxo.aprova_linha_base(v_emp, auth.uid()) then perform fluxo.aprovar_linha_base_interna(v); end if;
  return v;
end $$;

create or replace function fluxo.decidir_linha_base(p_id uuid, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare b fluxo.linhas_base;
begin
  select * into b from fluxo.linhas_base where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if b.situacao <> 'pendente' then raise exception 'Este pedido já foi decidido' using errcode = '23514'; end if;
  if auth.uid() = b.pedida_por and p_aprovar is not true then
    -- quem pediu pode desistir
    update fluxo.linhas_base set situacao = 'cancelada', decidida_por = auth.uid(), decidida_em = now() where id = p_id;
    return;
  end if;
  if not fluxo.aprova_linha_base(b.empresa_id, b.pedida_por) then
    raise exception 'Só o gestor de quem pediu, um diretor ou o administrador decide a linha de base' using errcode = '42501';
  end if;
  if p_aprovar then
    perform fluxo.aprovar_linha_base_interna(p_id);
    update fluxo.linhas_base set motivo_decisao = nullif(trim(p_motivo), '') where id = p_id;
  else
    update fluxo.linhas_base set situacao = 'recusada', decidida_por = auth.uid(), decidida_em = now(), motivo_decisao = nullif(trim(p_motivo), '') where id = p_id;
  end if;
end $$;

-- Administrador: dias corridos ou úteis
create or replace function fluxo.salvar_calendario(p_empresa uuid, p_dias_uteis boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  insert into fluxo.calendarios (empresa_id, dias_uteis) values (p_empresa, coalesce(p_dias_uteis, false))
  on conflict (empresa_id) do update set dias_uteis = excluded.dias_uteis;
end $$;

-- Cronograma com a linha de base aprovada e o desvio em dias (positivo = atrasou).
create view fluxo.v_cronograma with (security_invoker = true) as
select k.id as tarefa_id, k.empresa_id, k.quadro_id, k.codigo, k.titulo, k.inicio, k.prazo, k.duracao, k.inicio_min, k.concluida_em,
       b.numero as linha_base, i.inicio as base_inicio, i.prazo as base_prazo,
       k.inicio - i.inicio as desvio_inicio, k.prazo - i.prazo as desvio_prazo,
       coalesce(k.prazo > i.prazo, false) as atrasada_base,
       (select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'predecessora_id', v.predecessora_id, 'tipo', v.tipo, 'defasagem', v.defasagem) order by v.criado_em), '[]')
          from fluxo.vinculos v where v.sucessora_id = k.id) as predecessoras
from fluxo.tarefas k
left join fluxo.linhas_base b on b.quadro_id = k.quadro_id and b.situacao = 'aprovada'
left join fluxo.linha_base_itens i on i.linha_base_id = b.id and i.tarefa_id = k.id
where k.arquivada_em is null;

do $$
declare t text;
begin
  foreach t in array array['calendarios','vinculos','linhas_base','linha_base_itens'] loop
    execute format('alter table fluxo.%I enable row level security', t);
    execute format('create policy ver on fluxo.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on fluxo.%I to authenticated', t);
  end loop;
  foreach t in array array['calendarios','vinculos','linhas_base'] loop
    execute format('create trigger t_aud after insert or update or delete on fluxo.%I for each row execute function app.tg_auditoria()', t);
  end loop;
end $$;
-- vínculos: quem edita cria, muda o tipo e a defasagem, e tira
create policy inserir on fluxo.vinculos for insert to authenticated with check (empresa_id in (select app.empresas_edicao()));
create policy alterar on fluxo.vinculos for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()));
create policy remover on fluxo.vinculos for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
grant insert, update, delete on fluxo.vinculos to authenticated;
alter table fluxo.feriados enable row level security;
create policy ver on fluxo.feriados for select to authenticated using (empresa_id is null or empresa_id in (select app.minhas_empresas()));
grant select on fluxo.feriados to authenticated;
grant select on fluxo.v_cronograma to authenticated;
revoke all on function fluxo.enviar_cronograma(uuid, text), fluxo.decidir_linha_base(uuid, boolean, text), fluxo.salvar_calendario(uuid, boolean),
                       fluxo.aprovar_linha_base_interna(uuid), fluxo.reprogramar_sucessoras(uuid[]) from public;
grant execute on function fluxo.enviar_cronograma(uuid, text), fluxo.decidir_linha_base(uuid, boolean, text), fluxo.salvar_calendario(uuid, boolean),
                          fluxo.somar_dias(uuid, date, int), fluxo.duracao_dias(uuid, date, date), fluxo.dia_util(uuid, date) to authenticated;

-- =====================================================================
-- Modelos de tarefas (pedido do Moisés, 29/out/2026): um conjunto de
-- cartões já configurados (lista, prazos relativos, duração, responsável,
-- aprovadores, executores, quem acompanha, etiquetas, checklists e
-- predecessoras). O modelo da empresa (dono nulo; só o administrador
-- mexe) pode ser o padrão, que entra sozinho em todo quadro novo do tipo;
-- cada pessoa tem os seus e aplica à mão em qualquer quadro. Prazos são
-- relativos à data em que o modelo é aplicado: começa inicio_dias depois e
-- dura duracao dias (no calendário da empresa). Uma pessoa do modelo pode
-- ser fixa ou "o responsável pelo objeto" (no terreno, o responsável dele).
-- =====================================================================
create table fluxo.modelos_quadro (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id) on delete cascade,
  dono_id      uuid references auth.users(id) on delete cascade,  -- nulo = modelo da empresa
  objeto_tipo  text not null default 'terreno',
  nome         text not null check (length(trim(nome)) > 0),
  padrao       boolean not null default false,                    -- entra sozinho nos quadros novos
  ativo        boolean not null default true,
  criado_por   uuid default auth.uid(),
  criado_em    timestamptz not null default now(),
  check (not padrao or dono_id is null)
);
create unique index on fluxo.modelos_quadro (empresa_id, objeto_tipo) where padrao and ativo;

create table fluxo.modelo_tarefas (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references app.empresas(id) on delete cascade,
  modelo_id           uuid not null references fluxo.modelos_quadro(id) on delete cascade,
  ordem               int  not null default 0,
  titulo              text not null check (length(trim(titulo)) > 0),
  descricao           text,
  lista_nome          text,                       -- lista do quadro com esse nome (senão, a primeira aberta)
  prioridade          text not null default 'media' check (prioridade in ('baixa','media','alta')),
  inicio_dias         int check (inicio_dias is null or inicio_dias >= 0),   -- nulo = sem datas
  duracao             int check (duracao is null or duracao >= 1),
  responsavel_id      uuid references auth.users(id),
  responsavel_objeto  boolean not null default false,   -- o responsável do terreno
  pessoas             jsonb not null default '[]',      -- [{papel, user_id} ou {papel, objeto: true}]
  etiquetas           uuid[] not null default '{}',
  checklists          jsonb not null default '[]',      -- [{nome, itens: [texto ou {texto, regra, condicao}]}]
  itens               jsonb not null default '[]',      -- itens do cartão (31/out/2026): [{chave ou campo_id, regra, condicao}]
  aprovacao_modo      text not null default 'paralelo' check (aprovacao_modo in ('paralelo','sequencia')),
  visibilidade        text not null default 'publico' check (visibilidade in ('publico','individual','restrito')),  -- restrito: só os envolvidos
  condicao            jsonb,                      -- "Vale quando" (31/out/2026): a tarefa só nasce se a condição vale para o objeto
  check (not (responsavel_objeto and responsavel_id is not null)),
  check (jsonb_typeof(pessoas) = 'array' and jsonb_typeof(checklists) = 'array' and jsonb_typeof(itens) = 'array')
);
create index on fluxo.modelo_tarefas (modelo_id, ordem);

create table fluxo.modelo_vinculos (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id) on delete cascade,
  modelo_id        uuid not null references fluxo.modelos_quadro(id) on delete cascade,
  predecessora_id  uuid not null references fluxo.modelo_tarefas(id) on delete cascade,
  sucessora_id     uuid not null references fluxo.modelo_tarefas(id) on delete cascade,
  tipo             text not null default 'TI' check (tipo in ('TI','II','TT','IT')),
  defasagem        int  not null default 0,
  check (predecessora_id <> sucessora_id),
  unique (predecessora_id, sucessora_id, tipo)
);

-- Quem mexe no modelo: o dono, ou o administrador no modelo da empresa.
create or replace function fluxo.edita_modelo(p_modelo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fluxo.modelos_quadro m where m.id = p_modelo
    and ((m.dono_id = auth.uid() and m.empresa_id in (select app.empresas_edicao()))
      or (m.dono_id is null and app.eh_administrador(m.empresa_id)))) $$;

-- Tarefas do modelo e as do modelo ligadas entre si ficam no mesmo modelo.
create or replace function fluxo.tg_modelo_filho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare j jsonb := to_jsonb(new); v_valida regproc;
begin
  if (select empresa_id from fluxo.modelos_quadro where id = new.modelo_id) is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do modelo' using errcode = '42501';
  end if;
  if j ? 'predecessora_id' and (select count(*) from fluxo.modelo_tarefas where id in ((j->>'predecessora_id')::uuid, (j->>'sucessora_id')::uuid) and modelo_id = new.modelo_id) <> 2 then
    raise exception 'Vínculo entre tarefas de outro modelo' using errcode = '23514';
  end if;
  -- condição da tarefa do modelo: o app do tipo do modelo confere (vazia vira nula)
  if tg_table_name = 'modelo_tarefas' then
    if new.condicao is null or new.condicao = 'null'::jsonb
       or coalesce(jsonb_array_length(case when jsonb_typeof(new.condicao->'itens') = 'array' then new.condicao->'itens' end), 0) = 0 then
      new.condicao := null;
    else
      select o.valida_condicao into v_valida from fluxo.modelos_quadro m join fluxo.objeto_tipos o on o.tipo = m.objeto_tipo where m.id = new.modelo_id;
      if v_valida is null then raise exception 'Este tipo de quadro não aceita condição' using errcode = '22023'; end if;
      execute format('select %s($1, $2)', v_valida) using new.empresa_id, new.condicao;
    end if;
  end if;
  return new;
end $$;
create trigger t_modelo before insert or update on fluxo.modelo_tarefas for each row execute function fluxo.tg_modelo_filho();
create trigger t_modelo before insert or update on fluxo.modelo_vinculos for each row execute function fluxo.tg_modelo_filho();

-- A condição vale para o objeto do quadro? Sem condição (ou sem quem confira), vale.
create or replace function fluxo.condicao_objeto(p_quadro uuid, p_cond jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_fn regproc; v_obj uuid; v boolean;
begin
  if p_cond is null then return true; end if;
  select o.avalia_condicao, q.objeto_id into v_fn, v_obj from fluxo.quadros q left join fluxo.objeto_tipos o on o.tipo = q.objeto_tipo where q.id = p_quadro;
  if v_fn is null or v_obj is null then return true; end if;
  execute format('select %s($1, $2)', v_fn) into v using v_obj, p_cond;
  return coalesce(v, false);
end $$;

-- Cria os cartões do modelo no quadro (sem conferir permissão: uso interno).
-- Tarefa do modelo com condição que não vale para o objeto não nasce. Devolve
-- {tarefa do modelo: cartão criado}. p_pular: tarefas do modelo que não nascem
-- (o app já as criou antes); p_existentes: {tarefa do modelo: cartão} já no
-- quadro, para ligar as predecessoras às que nascem agora.
create or replace function fluxo.aplicar_modelo_mapa(p_modelo uuid, p_quadro uuid, p_data date, p_resp_objeto uuid,
  p_pular uuid[] default '{}', p_existentes jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare m fluxo.modelos_quadro; t fluxo.modelo_tarefas; v_emp uuid; v_lista uuid; v_ini date; v_id uuid; mapa jsonb := '{}'; p jsonb; c jsonb; v_ck uuid; x jsonb; v_user uuid; v_ord int; todos jsonb;
begin
  select * into m from fluxo.modelos_quadro where id = p_modelo and ativo;
  select empresa_id into v_emp from fluxo.quadros where id = p_quadro;
  if m.id is null or v_emp is distinct from m.empresa_id then raise exception 'Modelo não encontrado nesta empresa' using errcode = 'P0002'; end if;
  for t in select * from fluxo.modelo_tarefas where modelo_id = p_modelo and not (id = any (coalesce(p_pular, '{}'))) order by ordem, titulo loop
    continue when not fluxo.condicao_objeto(p_quadro, t.condicao);
    select id into v_lista from fluxo.listas where quadro_id = p_quadro and nome = t.lista_nome and not oculta;
    if v_lista is null then
      select id into v_lista from fluxo.listas where quadro_id = p_quadro and tipo = 'aberta' and not oculta order by posicao limit 1;
    end if;
    v_ini := case when t.inicio_dias is not null then fluxo.somar_dias(v_emp, p_data, t.inicio_dias) end;
    insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, prioridade, aprovacao_modo, visibilidade, inicio, prazo, responsavel_id, posicao)
    values (v_emp, p_quadro, v_lista, t.titulo, t.descricao, t.prioridade, t.aprovacao_modo, t.visibilidade, v_ini,
            case when v_ini is not null then fluxo.somar_dias(v_emp, v_ini, coalesce(t.duracao, 1) - 1) end,
            case when t.responsavel_objeto then p_resp_objeto else t.responsavel_id end,
            extract(epoch from clock_timestamp()) + t.ordem)
    returning id into v_id;
    mapa := mapa || jsonb_build_object(t.id::text, v_id);
    v_ord := 0;
    for p in select * from jsonb_array_elements(t.pessoas) loop
      v_user := case when (p->>'objeto')::boolean then p_resp_objeto else (p->>'user_id')::uuid end;
      if v_user is not null and exists (select 1 from app.membros where empresa_id = v_emp and user_id = v_user) then
        v_ord := v_ord + 1;   -- a ordem do modelo é a ordem dos aprovadores
        insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel, ordem)
        values (v_emp, v_id, v_user, p->>'papel', case when p->>'papel' = 'aprovador' then v_ord end) on conflict do nothing;
      end if;
    end loop;
    insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id)
    select v_emp, v_id, e.id from fluxo.etiquetas e where e.id = any (t.etiquetas) and e.empresa_id = v_emp and e.ativo;
    for c in select * from jsonb_array_elements(t.checklists) loop
      insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (v_emp, v_id, coalesce(nullif(trim(c->>'nome'), ''), 'Checklist')) returning id into v_ck;
      for x in select jsonb_array_elements(coalesce(c->'itens', '[]')) loop
        insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, regra_branco, condicao)
        values (v_emp, v_ck, case when jsonb_typeof(x) = 'string' then x #>> '{}' else x->>'texto' end,
                case when jsonb_typeof(x) = 'object' then x->>'regra' end, case when jsonb_typeof(x) = 'object' then x->'condicao' end);
      end loop;
    end loop;
    for x in select jsonb_array_elements(t.itens) loop
      if (x->>'campo_id') is null or exists (select 1 from fluxo.campos where id = (x->>'campo_id')::uuid and empresa_id = v_emp and ativo) then
        insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, campo_id, regra_branco, condicao)
        values (v_emp, v_id, x->>'chave', (x->>'campo_id')::uuid, coalesce(x->>'regra', 'livre'), x->'condicao') on conflict do nothing;
      end if;
    end loop;
  end loop;
  todos := coalesce(p_existentes, '{}') || mapa;
  insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, tipo, defasagem)
  select v_emp, (todos->>v.predecessora_id::text)::uuid, (todos->>v.sucessora_id::text)::uuid, v.tipo, v.defasagem
  from fluxo.modelo_vinculos v
  where v.modelo_id = p_modelo and todos ? v.predecessora_id::text and todos ? v.sucessora_id::text
    and (mapa ? v.predecessora_id::text or mapa ? v.sucessora_id::text)
  on conflict do nothing;
  return mapa;
end $$;

create or replace function fluxo.aplicar_modelo_interno(p_modelo uuid, p_quadro uuid, p_data date, p_resp_objeto uuid)
returns int language sql security definer set search_path = '' as $$
  select count(*)::int from jsonb_object_keys(fluxo.aplicar_modelo_mapa(p_modelo, p_quadro, p_data, p_resp_objeto)) $$;


-- Aplicar à mão: quem edita, com um modelo da empresa ou dele mesmo.
create or replace function fluxo.aplicar_modelo(p_modelo uuid, p_quadro uuid, p_data date default current_date, p_resp_objeto uuid default null)
returns int language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from fluxo.modelos_quadro where id = p_modelo and (dono_id is null or dono_id = auth.uid());
  if v_emp is null then raise exception 'Modelo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v_emp);
  return fluxo.aplicar_modelo_interno(p_modelo, p_quadro, coalesce(p_data, current_date), p_resp_objeto);
end $$;

-- Quadro novo do tipo recebe o modelo padrão da empresa.
create or replace function fluxo.aplicar_padrao(p_quadro uuid, p_resp_objeto uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare q fluxo.quadros; v uuid;
begin
  select * into q from fluxo.quadros where id = p_quadro;
  select id into v from fluxo.modelos_quadro where empresa_id = q.empresa_id and objeto_tipo = q.objeto_tipo and padrao and ativo;
  if v is null then return 0; end if;
  return fluxo.aplicar_modelo_interno(v, p_quadro, current_date, p_resp_objeto);
end $$;

-- Salva os cartões abertos de um quadro como modelo (prazos relativos ao
-- primeiro início do quadro). Da empresa, só pelo administrador.
create or replace function fluxo.salvar_quadro_como_modelo(p_quadro uuid, p_nome text, p_da_empresa boolean default false, p_resp_objeto uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare q fluxo.quadros; v uuid; v_base date; k record; mapa jsonb := '{}'; v_mt uuid;
begin
  select * into q from fluxo.quadros where id = p_quadro;
  if q.id is null then raise exception 'Quadro não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(q.empresa_id);
  if p_da_empresa then perform app.exigir_administrador(q.empresa_id); end if;
  insert into fluxo.modelos_quadro (empresa_id, dono_id, objeto_tipo, nome)
  values (q.empresa_id, case when p_da_empresa then null else auth.uid() end, q.objeto_tipo, trim(p_nome)) returning id into v;
  select min(inicio) into v_base from fluxo.tarefas where quadro_id = p_quadro and arquivada_em is null and concluida_em is null
    and fluxo.papel_tarefa(id) is not null;
  for k in select t.*, l.nome as lista_nome from fluxo.tarefas t join fluxo.listas l on l.id = t.lista_id
           where t.quadro_id = p_quadro and t.arquivada_em is null and t.concluida_em is null
             and fluxo.papel_tarefa(t.id) is not null   -- só o que quem salva enxerga (bloco 3)
           order by t.inicio nulls last, t.posicao loop
    insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, descricao, lista_nome, prioridade, inicio_dias, duracao,
                                      responsavel_id, responsavel_objeto, pessoas, etiquetas, checklists, itens, aprovacao_modo, visibilidade)
    values (q.empresa_id, v, (select count(*) from fluxo.modelo_tarefas where modelo_id = v), k.titulo, k.descricao, k.lista_nome, k.prioridade,
            case when k.inicio is not null then k.inicio - v_base end, k.duracao,
            case when p_resp_objeto is not null and k.responsavel_id = p_resp_objeto then null else k.responsavel_id end,
            p_resp_objeto is not null and k.responsavel_id = p_resp_objeto,
            coalesce((select jsonb_agg(case when p_resp_objeto is not null and tp.user_id = p_resp_objeto
                                            then jsonb_build_object('papel', tp.papel, 'objeto', true)
                                            else jsonb_build_object('papel', tp.papel, 'user_id', tp.user_id) end order by tp.ordem nulls last, tp.incluido_em)
                      from fluxo.tarefa_pessoas tp where tp.tarefa_id = k.id), '[]'),
            coalesce((select array_agg(etiqueta_id) from fluxo.tarefa_etiquetas where tarefa_id = k.id), '{}'),
            coalesce((select jsonb_agg(jsonb_build_object('nome', c.nome, 'itens',
                        coalesce((select jsonb_agg(case when i.regra_branco is null and i.condicao is null then to_jsonb(i.texto)
                                                        else jsonb_build_object('texto', i.texto, 'regra', i.regra_branco, 'condicao', i.condicao) end order by i.posicao)
                                  from fluxo.checklist_itens i where i.checklist_id = c.id), '[]')) order by c.posicao)
                      from fluxo.checklists c where c.tarefa_id = k.id), '[]'),
            coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object('chave', i.chave, 'campo_id', i.campo_id, 'regra', i.regra_branco, 'condicao', i.condicao)) order by i.posicao)
                      from fluxo.tarefa_itens i where i.tarefa_id = k.id), '[]'), k.aprovacao_modo, k.visibilidade)
    returning id into v_mt;
    mapa := mapa || jsonb_build_object(k.id::text, v_mt);
  end loop;
  insert into fluxo.modelo_vinculos (empresa_id, modelo_id, predecessora_id, sucessora_id, tipo, defasagem)
  select q.empresa_id, v, (mapa->>vi.predecessora_id::text)::uuid, (mapa->>vi.sucessora_id::text)::uuid, vi.tipo, vi.defasagem
  from fluxo.vinculos vi where mapa ? vi.predecessora_id::text and mapa ? vi.sucessora_id::text;
  return v;
end $$;

-- Administrador: o modelo da empresa que entra sozinho nos quadros novos (nulo tira o padrão).
create or replace function fluxo.definir_modelo_padrao(p_empresa uuid, p_modelo uuid, p_objeto_tipo text default 'terreno')
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  if p_modelo is not null and not exists (select 1 from fluxo.modelos_quadro where id = p_modelo and empresa_id = p_empresa and dono_id is null and ativo) then
    raise exception 'O padrão precisa ser um modelo ativo da empresa' using errcode = '23514';
  end if;
  update fluxo.modelos_quadro set padrao = false where empresa_id = p_empresa and objeto_tipo = p_objeto_tipo and padrao;
  update fluxo.modelos_quadro set padrao = true where id = p_modelo;
end $$;

do $$
declare t text;
begin
  foreach t in array array['modelos_quadro','modelo_tarefas','modelo_vinculos'] loop
    execute format('alter table fluxo.%I enable row level security', t);
    execute format('create trigger t_aud after insert or update or delete on fluxo.%I for each row execute function app.tg_auditoria()', t);
    execute format('grant select, insert, update, delete on fluxo.%I to authenticated', t);
  end loop;
end $$;
-- ver: os da empresa e os próprios; mexer: o dono, ou o administrador nos da empresa
create policy ver on fluxo.modelos_quadro for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and (dono_id is null or dono_id = auth.uid()));
create policy inserir on fluxo.modelos_quadro for insert to authenticated
  with check ((dono_id = auth.uid() and empresa_id in (select app.empresas_edicao())) or (dono_id is null and app.eh_administrador(empresa_id)));
create policy alterar on fluxo.modelos_quadro for update to authenticated
  using (fluxo.edita_modelo(id)) with check ((dono_id = auth.uid() and empresa_id in (select app.empresas_edicao())) or (dono_id is null and app.eh_administrador(empresa_id)));
create policy remover on fluxo.modelos_quadro for delete to authenticated using (fluxo.edita_modelo(id) and not padrao);
create policy ver on fluxo.modelo_tarefas for select to authenticated using (exists (select 1 from fluxo.modelos_quadro m where m.id = modelo_id));
create policy mexer on fluxo.modelo_tarefas for all to authenticated using (fluxo.edita_modelo(modelo_id)) with check (fluxo.edita_modelo(modelo_id));
create policy ver on fluxo.modelo_vinculos for select to authenticated using (exists (select 1 from fluxo.modelos_quadro m where m.id = modelo_id));
create policy mexer on fluxo.modelo_vinculos for all to authenticated using (fluxo.edita_modelo(modelo_id)) with check (fluxo.edita_modelo(modelo_id));
-- o padrão só muda pela função (que confere o administrador)
revoke update (padrao) on fluxo.modelos_quadro from authenticated;
revoke all on function fluxo.aplicar_modelo_interno(uuid, uuid, date, uuid), fluxo.aplicar_padrao(uuid, uuid),
  fluxo.aplicar_modelo_mapa(uuid, uuid, date, uuid, uuid[], jsonb), fluxo.condicao_objeto(uuid, jsonb) from public;
revoke all on function fluxo.aplicar_modelo(uuid, uuid, date, uuid), fluxo.salvar_quadro_como_modelo(uuid, text, boolean, uuid),
                       fluxo.definir_modelo_padrao(uuid, uuid, text) from public;
grant execute on function fluxo.aplicar_modelo(uuid, uuid, date, uuid), fluxo.salvar_quadro_como_modelo(uuid, text, boolean, uuid),
                          fluxo.definir_modelo_padrao(uuid, uuid, text) to authenticated;

-- =====================================================================
-- Aprovação formal da tarefa (bloco 3; decisões do Moisés, 29/out/2026).
-- Quem aprova são os aprovadores do cartão (tarefa_pessoas, papel
-- aprovador); um superior de um aprovador decide no lugar dele, como no
-- funil, e o voto guarda quem decidiu. O pedido tira uma foto dos
-- aprovadores. Em paralelo (padrão) todos aprovam, em qualquer ordem; em
-- sequência, cada um na sua vez (tarefa_pessoas.ordem). Recusar exige
-- justificativa e encerra o pedido. Aprovado por todos, o cartão conclui
-- sozinho. Reabrir um cartão aprovado invalida a aprovação.
-- Bloqueio de conclusão: com aprovador, só conclui aprovado; com a regra
-- da empresa ligada (padrão), só com o checklist completo.
-- =====================================================================
create table fluxo.regras (
  empresa_id              uuid primary key references app.empresas(id) on delete cascade,
  conclui_exige_checklist boolean not null default true,
  pausa_aprova            text not null default 'gestor' check (pausa_aprova in ('ninguem','gestor','diretor')),  -- SLA (abaixo)
  -- predecessora pendente (decisão do Moisés, 30/out/2026): por padrão o app só avisa e deixa concluir; ligada, bloqueia
  conclui_exige_predecessoras boolean not null default false
);

create table fluxo.aprovacoes (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  tarefa_id    uuid not null references fluxo.tarefas(id) on delete cascade,
  modo         text not null check (modo in ('paralelo','sequencia')),
  situacao     text not null default 'pendente' check (situacao in ('pendente','aprovada','recusada','cancelada','invalidada')),
  motivo       text,                                 -- o que quem pediu escreveu
  pedida_por   uuid not null default auth.uid() references auth.users(id),
  pedida_em    timestamptz not null default clock_timestamp(),
  decidida_em  timestamptz
);
create unique index on fluxo.aprovacoes (tarefa_id) where situacao = 'pendente';
create index on fluxo.aprovacoes (tarefa_id, pedida_em);

create table fluxo.aprovacao_votos (
  aprovacao_id  uuid not null references fluxo.aprovacoes(id) on delete cascade,
  empresa_id    uuid not null references app.empresas(id),
  aprovador_id  uuid not null references auth.users(id),
  ordem         int  not null,
  decisao       text check (decisao in ('aprovou','recusou')),
  decidido_por  uuid references auth.users(id),      -- o próprio aprovador ou um superior dele
  decidido_em   timestamptz,
  justificativa text,
  primary key (aprovacao_id, aprovador_id),
  check (decisao is distinct from 'recusou' or length(trim(coalesce(justificativa, ''))) > 0)
);

-- O que impede concluir: 'aprovacao' e/ou 'checklist' (e 'campos', redefinida com os campos personalizados)
create or replace function fluxo.pendencias_conclusao(p_tarefa uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select array_remove(array[
    case when exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = p_tarefa and papel = 'aprovador')
          and not exists (select 1 from fluxo.aprovacoes where tarefa_id = p_tarefa and situacao = 'aprovada') then 'aprovacao' end,
    case when coalesce((select r.conclui_exige_checklist from fluxo.regras r join fluxo.tarefas k on k.empresa_id = r.empresa_id where k.id = p_tarefa), true)
          and exists (select 1 from fluxo.checklist_itens i join fluxo.checklists c on c.id = i.checklist_id
                      where c.tarefa_id = p_tarefa and i.concluido_em is null and i.virou_tarefa_id is null) then 'checklist' end
  ], null) $$;

-- Votos que esperam decisão agora (em sequência, só o da vez)
create or replace function fluxo.votos_da_vez(p_aprovacao uuid)
returns setof fluxo.aprovacao_votos language sql stable security definer set search_path = '' as $$
  select v.* from fluxo.aprovacao_votos v join fluxo.aprovacoes a on a.id = v.aprovacao_id
  where v.aprovacao_id = p_aprovacao and a.situacao = 'pendente' and v.decisao is null
    and (a.modo = 'paralelo' or v.ordem = (select min(ordem) from fluxo.aprovacao_votos where aprovacao_id = p_aprovacao and decisao is null)) $$;

-- Fecha o pedido aprovado por todos: aprova e conclui o cartão
create or replace function fluxo._fechar_aprovacao(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a fluxo.aprovacoes;
begin
  select * into a from fluxo.aprovacoes where id = p_id;
  if exists (select 1 from fluxo.aprovacao_votos where aprovacao_id = p_id and decisao is distinct from 'aprovou') then return; end if;
  update fluxo.aprovacoes set situacao = 'aprovada', decidida_em = clock_timestamp() where id = p_id;
  perform set_config('fluxo.aprovando', '1', true);
  update fluxo.tarefas set concluida_em = clock_timestamp() where id = a.tarefa_id and concluida_em is null;
  perform set_config('fluxo.aprovando', '', true);
end $$;

-- Pede a aprovação. Só com o resto pronto (checklist, se a regra vale).
-- Um aprovador que pede tem o próprio voto dado na hora.
create or replace function fluxo.pedir_aprovacao(p_tarefa uuid, p_motivo text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; v uuid;
begin
  select * into k from fluxo.tarefas where id = p_tarefa for update;
  if k.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  perform fluxo.exigir_edicao_tarefa(k.id);
  if k.arquivada_em is not null or k.concluida_em is not null then raise exception 'A tarefa já está concluída ou arquivada' using errcode = '23514'; end if;
  if not exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = p_tarefa and papel = 'aprovador') then
    raise exception 'A tarefa não tem aprovador' using errcode = '23514';
  end if;
  if 'checklist' = any (fluxo.pendencias_conclusao(p_tarefa)) then
    raise exception 'Conclua os itens do checklist antes de pedir a aprovação' using errcode = '23514';
  elsif 'subtarefas' = any (fluxo.pendencias_conclusao(p_tarefa)) then
    raise exception 'Conclua as subtarefas antes de pedir a aprovação' using errcode = '23514';
  elsif 'campos' = any (fluxo.pendencias_conclusao(p_tarefa)) then
    raise exception 'Preencha os campos obrigatórios antes de pedir a aprovação' using errcode = '23514';
  elsif 'justificar' = any (fluxo.pendencias_conclusao(p_tarefa)) then
    raise exception 'Há itens em branco: peça a aprovação com justificativa' using errcode = '23514';
  elsif 'predecessoras' = any (fluxo.pendencias_conclusao(p_tarefa)) then
    raise exception 'As predecessoras ainda não permitem concluir esta tarefa' using errcode = '23514';
  end if;
  update fluxo.aprovacoes set situacao = 'cancelada', decidida_em = clock_timestamp() where tarefa_id = p_tarefa and situacao = 'pendente';
  insert into fluxo.aprovacoes (empresa_id, tarefa_id, modo, motivo) values (k.empresa_id, p_tarefa, k.aprovacao_modo, nullif(trim(p_motivo), ''))
  returning id into v;
  insert into fluxo.aprovacao_votos (aprovacao_id, empresa_id, aprovador_id, ordem)
  select v, k.empresa_id, user_id, row_number() over (order by ordem nulls last, incluido_em, user_id)
  from fluxo.tarefa_pessoas where tarefa_id = p_tarefa and papel = 'aprovador';
  update fluxo.aprovacao_votos set decisao = 'aprovou', decidido_por = auth.uid(), decidido_em = clock_timestamp()
  where aprovacao_id = v and aprovador_id = auth.uid();
  perform fluxo._fechar_aprovacao(v);
  return v;
end $$;

-- Decide o pedido. O voto é o do próprio aprovador ou, por um superior,
-- o de um aprovador abaixo dele; em sequência, só o da vez.
create or replace function fluxo.decidir_aprovacao(p_aprovacao uuid, p_aprovar boolean, p_justificativa text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a fluxo.aprovacoes; v_voto uuid;
begin
  select * into a from fluxo.aprovacoes where id = p_aprovacao for update;
  if a.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if a.empresa_id not in (select app.minhas_empresas()) then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if a.situacao <> 'pendente' then raise exception 'Este pedido já foi decidido' using errcode = '23514'; end if;
  select aprovador_id into v_voto from fluxo.votos_da_vez(p_aprovacao)
  where aprovador_id = auth.uid() or app.eh_superior(a.empresa_id, auth.uid(), aprovador_id)
  order by (aprovador_id = auth.uid()) desc, ordem limit 1;
  if v_voto is null then
    raise exception 'Você não é aprovador desta tarefa (nem superior de um aprovador na vez)' using errcode = '42501';
  end if;
  if not p_aprovar and coalesce(trim(p_justificativa), '') = '' then
    raise exception 'Diga por que a tarefa foi recusada' using errcode = '23514';
  end if;
  update fluxo.aprovacao_votos set decisao = case when p_aprovar then 'aprovou' else 'recusou' end, decidido_por = auth.uid(),
         decidido_em = clock_timestamp(), justificativa = nullif(trim(p_justificativa), '')
  where aprovacao_id = p_aprovacao and aprovador_id = v_voto;
  if p_aprovar then perform fluxo._fechar_aprovacao(p_aprovacao);
  else update fluxo.aprovacoes set situacao = 'recusada', decidida_em = clock_timestamp() where id = p_aprovacao;
  end if;
end $$;

-- Quem pediu (ou quem edita a tarefa) desiste do pedido
create or replace function fluxo.cancelar_aprovacao(p_aprovacao uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare a fluxo.aprovacoes;
begin
  select * into a from fluxo.aprovacoes where id = p_aprovacao for update;
  if a.id is null then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  perform fluxo.exigir_edicao_tarefa(a.tarefa_id);
  if a.situacao <> 'pendente' then raise exception 'Este pedido já foi decidido' using errcode = '23514'; end if;
  update fluxo.aprovacoes set situacao = 'cancelada', decidida_em = clock_timestamp() where id = p_aprovacao;
end $$;

-- Administrador: concluir exige o checklist completo?
create or replace function fluxo.salvar_regras(p_empresa uuid, p_conclui_exige_checklist boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  insert into fluxo.regras (empresa_id, conclui_exige_checklist) values (p_empresa, p_conclui_exige_checklist)
  on conflict (empresa_id) do update set conclui_exige_checklist = excluded.conclui_exige_checklist;
end $$;

do $$
declare t text;
begin
  foreach t in array array['regras','aprovacoes','aprovacao_votos'] loop
    execute format('alter table fluxo.%I enable row level security', t);
    execute format('create policy ver on fluxo.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on fluxo.%I to authenticated', t);
  end loop;
end $$;
-- o pedido e os votos já são o registro (quem, quando, justificativa); só a regra vai para a auditoria
create trigger t_aud after insert or update or delete on fluxo.regras for each row execute function app.tg_auditoria();
revoke all on function fluxo._fechar_aprovacao(uuid), fluxo.pedir_aprovacao(uuid, text), fluxo.decidir_aprovacao(uuid, boolean, text),
                       fluxo.cancelar_aprovacao(uuid), fluxo.salvar_regras(uuid, boolean), fluxo.votos_da_vez(uuid) from public;
grant execute on function fluxo.pedir_aprovacao(uuid, text), fluxo.decidir_aprovacao(uuid, boolean, text), fluxo.cancelar_aprovacao(uuid),
                          fluxo.salvar_regras(uuid, boolean), fluxo.pendencias_conclusao(uuid), fluxo.votos_da_vez(uuid) to authenticated;

-- =====================================================================
-- SLA com pausa aprovada (bloco 3; decisões do Moisés, 29/out/2026).
-- O prazo que conta é o do cartão; pausada (na lista de pausa), a tarefa
-- não fica atrasada. Pausar pede motivo; quem aprova é o nível que o
-- administrador escolhe (ninguém, gestor ou diretor; padrão gestor): um
-- superior de quem pediu com esse nível ou acima, ou o administrador; quem
-- já tem o nível pausa direto. Aprovada, a pausa começa e o cartão vai para
-- a lista de pausa. Retomar volta para a lista de antes e empurra o prazo
-- pelos dias pausados (no calendário da empresa), e o cronograma leva as
-- sucessoras junto. Tempo líquido = aberta − pausada (fluxo.v_tarefa_sla).
-- =====================================================================
create table fluxo.pausas (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references app.empresas(id),
  tarefa_id         uuid not null references fluxo.tarefas(id) on delete cascade,
  situacao          text not null default 'pendente' check (situacao in ('pendente','ativa','encerrada','recusada','cancelada')),
  motivo            text not null check (length(trim(motivo)) > 0),
  pedida_por        uuid not null default auth.uid() references auth.users(id),
  pedida_em         timestamptz not null default clock_timestamp(),
  decidida_por      uuid references auth.users(id),
  decidida_em       timestamptz,
  motivo_decisao    text,
  lista_anterior_id uuid references fluxo.listas(id),
  inicio            timestamptz,                    -- quando a pausa começou a valer
  fim               timestamptz,
  retomada_por      uuid references auth.users(id),
  dias              int,                            -- dias que empurraram o prazo
  origem            text                            -- vazio = pausa da tarefa; senão quem pausou de fora (o BKM: 'stand_by' da fase), e só ele retoma
);
create unique index on fluxo.pausas (tarefa_id) where situacao in ('pendente','ativa');
create index on fluxo.pausas (tarefa_id, pedida_em);

create or replace function fluxo.nivel_pausa(p_empresa uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case coalesce((select pausa_aprova from fluxo.regras where empresa_id = p_empresa), 'gestor')
              when 'ninguem' then 0 when 'gestor' then 2 else 3 end $$;

-- Quem aprova a pausa pedida por p_pedinte
create or replace function fluxo.aprova_pausa(p_empresa uuid, p_pedinte uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select fluxo.nivel_pausa(p_empresa) = 0 or app.eh_administrador(p_empresa)
      or (app.nivel_papel(app.papel(p_empresa)) >= fluxo.nivel_pausa(p_empresa)
          and (p_pedinte = auth.uid() or app.eh_superior(p_empresa, auth.uid(), p_pedinte))) $$;

create or replace function fluxo._iniciar_pausa(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare z fluxo.pausas; k fluxo.tarefas; v_lista uuid;
begin
  select * into z from fluxo.pausas where id = p_id;
  select * into k from fluxo.tarefas where id = z.tarefa_id;
  select id into v_lista from fluxo.listas where quadro_id = k.quadro_id and tipo = 'pausa' order by oculta, posicao limit 1;
  if v_lista is null then raise exception 'O quadro não tem lista de pausa' using errcode = '23514'; end if;
  update fluxo.pausas set situacao = 'ativa', inicio = clock_timestamp(), lista_anterior_id = k.lista_id,
         decidida_por = coalesce(decidida_por, auth.uid()), decidida_em = coalesce(decidida_em, clock_timestamp())
  where id = p_id;
  perform set_config('fluxo.pausando', '1', true);
  update fluxo.tarefas set lista_id = v_lista, posicao = extract(epoch from clock_timestamp()) where id = k.id;
  perform set_config('fluxo.pausando', '', true);
end $$;

create or replace function fluxo.pausar(p_tarefa uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; v uuid;
begin
  select * into k from fluxo.tarefas where id = p_tarefa for update;
  if k.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  perform fluxo.exigir_edicao_tarefa(k.id);
  if k.concluida_em is not null or k.arquivada_em is not null then raise exception 'A tarefa já está concluída ou arquivada' using errcode = '23514'; end if;
  if exists (select 1 from fluxo.pausas where tarefa_id = p_tarefa and situacao = 'ativa') then raise exception 'A tarefa já está pausada' using errcode = '23514'; end if;
  if coalesce(trim(p_motivo), '') = '' then raise exception 'Diga por que a tarefa vai pausar' using errcode = '23514'; end if;
  update fluxo.pausas set situacao = 'cancelada', decidida_em = clock_timestamp() where tarefa_id = p_tarefa and situacao = 'pendente';
  insert into fluxo.pausas (empresa_id, tarefa_id, motivo) values (k.empresa_id, p_tarefa, trim(p_motivo)) returning id into v;
  if fluxo.aprova_pausa(k.empresa_id, auth.uid()) then perform fluxo._iniciar_pausa(v); end if;
  return v;
end $$;

-- Aprovar ou recusar (com motivo); quem pediu pode desistir (aprovar = false)
create or replace function fluxo.decidir_pausa(p_pausa uuid, p_aprovar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare z fluxo.pausas;
begin
  select * into z from fluxo.pausas where id = p_pausa for update;
  if z.id is null or z.empresa_id not in (select app.minhas_empresas()) then raise exception 'Pedido não encontrado' using errcode = 'P0002'; end if;
  if z.situacao <> 'pendente' then raise exception 'Este pedido já foi decidido' using errcode = '23514'; end if;
  if not p_aprovar and z.pedida_por = auth.uid() then
    update fluxo.pausas set situacao = 'cancelada', decidida_em = clock_timestamp() where id = p_pausa; return;
  end if;
  if not fluxo.aprova_pausa(z.empresa_id, z.pedida_por) then
    raise exception 'Só um superior de quem pediu, com o nível que a empresa exige, ou o administrador decide a pausa' using errcode = '42501';
  end if;
  if p_aprovar then
    update fluxo.pausas set decidida_por = auth.uid(), decidida_em = clock_timestamp(), motivo_decisao = nullif(trim(p_motivo), '') where id = p_pausa;
    perform fluxo._iniciar_pausa(p_pausa);
  else
    if coalesce(trim(p_motivo), '') = '' then raise exception 'Diga por que a pausa foi recusada' using errcode = '23514'; end if;
    update fluxo.pausas set situacao = 'recusada', decidida_por = auth.uid(), decidida_em = clock_timestamp(), motivo_decisao = trim(p_motivo) where id = p_pausa;
  end if;
end $$;

-- Pausa vinda de fora (o app pausa as tarefas de um objeto parado; sem pedido nem
-- conferência de permissão: uso interno). Tarefa já pausada fica como está; pedido
-- de pausa em aberto é cancelado; quadro sem lista de pausa não pausa. Devolve se pausou.
create or replace function fluxo._pausar_de_fora(p_tarefa uuid, p_motivo text, p_origem text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; v uuid;
begin
  select * into k from fluxo.tarefas where id = p_tarefa for update;
  if k.id is null or k.concluida_em is not null or k.arquivada_em is not null or k.modelo then return false; end if;
  if exists (select 1 from fluxo.pausas where tarefa_id = p_tarefa and situacao = 'ativa') then return false; end if;
  if not exists (select 1 from fluxo.listas where quadro_id = k.quadro_id and tipo = 'pausa') then return false; end if;
  update fluxo.pausas set situacao = 'cancelada', decidida_em = clock_timestamp(), motivo_decisao = p_motivo where tarefa_id = p_tarefa and situacao = 'pendente';
  insert into fluxo.pausas (empresa_id, tarefa_id, motivo, origem) values (k.empresa_id, p_tarefa, p_motivo, p_origem) returning id into v;
  perform fluxo._iniciar_pausa(v);
  return true;
end $$;

-- Retomar: volta para a lista de antes e empurra o prazo pelos dias pausados.
-- A pausa vinda de fora só o próprio objeto retoma (fluxo._retomar).
create or replace function fluxo.retomar(p_tarefa uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; v_origem text;
begin
  select * into k from fluxo.tarefas where id = p_tarefa;
  if k.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  perform fluxo.exigir_edicao_tarefa(k.id);
  select origem into v_origem from fluxo.pausas where tarefa_id = p_tarefa and situacao = 'ativa';
  if v_origem = 'stand_by' then raise exception 'A tarefa está pausada pelo Stand By da fase: ela volta quando a negociação for retomada' using errcode = '23514';
  elsif v_origem is not null then raise exception 'A tarefa foi pausada de fora e só volta com o que a pausou' using errcode = '23514';
  end if;
  return fluxo._retomar(p_tarefa);
end $$;

create or replace function fluxo._retomar(p_tarefa uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare z fluxo.pausas; k fluxo.tarefas; v_lista uuid; v_dias int;
begin
  select * into k from fluxo.tarefas where id = p_tarefa for update;
  if k.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  select * into z from fluxo.pausas where tarefa_id = p_tarefa and situacao = 'ativa' for update;
  if z.id is null then raise exception 'A tarefa não está pausada' using errcode = '23514'; end if;
  v_dias := case when fluxo.usa_dias_uteis(k.empresa_id)
                 then (select count(*)::int from generate_series(z.inicio::date, current_date - 1, interval '1 day') g(d) where fluxo.dia_util(k.empresa_id, g.d::date))
                 else current_date - z.inicio::date end;
  select id into v_lista from fluxo.listas where id = z.lista_anterior_id and quadro_id = k.quadro_id and not oculta and tipo = 'aberta';
  if v_lista is null then
    select id into v_lista from fluxo.listas where quadro_id = k.quadro_id and tipo = 'aberta' and not oculta order by posicao limit 1;
  end if;
  update fluxo.pausas set situacao = 'encerrada', fim = clock_timestamp(), retomada_por = auth.uid(), dias = v_dias where id = z.id;
  perform set_config('fluxo.pausando', '1', true);
  update fluxo.tarefas set lista_id = v_lista, posicao = extract(epoch from clock_timestamp()),
         prazo = case when prazo is not null and v_dias > 0 then fluxo.somar_dias(empresa_id, prazo, v_dias) else prazo end
  where id = p_tarefa;
  perform set_config('fluxo.pausando', '', true);
  return v_dias;
end $$;

-- Administrador: quem aprova a pausa (ninguem, gestor, diretor)
create or replace function fluxo.salvar_regra_pausa(p_empresa uuid, p_pausa_aprova text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  insert into fluxo.regras (empresa_id, pausa_aprova) values (p_empresa, p_pausa_aprova)
  on conflict (empresa_id) do update set pausa_aprova = excluded.pausa_aprova;
end $$;

-- Tempo da tarefa: dias aberta, dias pausada e tempo líquido
create view fluxo.v_tarefa_sla with (security_invoker = true) as
select k.id as tarefa_id, k.empresa_id,
       (coalesce(k.concluida_em, now())::date - k.criado_em::date) as dias_aberta,
       coalesce(ps.dias, 0) as dias_pausada,
       (coalesce(k.concluida_em, now())::date - k.criado_em::date) - coalesce(ps.dias, 0) as dias_liquidos,
       ps.vezes as pausas,
       exists (select 1 from fluxo.pausas where tarefa_id = k.id and situacao = 'ativa') as pausada,
       exists (select 1 from fluxo.pausas where tarefa_id = k.id and situacao = 'pendente') as pausa_pedida
from fluxo.tarefas k
left join lateral (select sum(coalesce(z.fim, now())::date - z.inicio::date)::int as dias, count(*)::int as vezes
                   from fluxo.pausas z where z.tarefa_id = k.id and z.inicio is not null) ps on true;

alter table fluxo.pausas enable row level security;
create policy ver on fluxo.pausas for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on fluxo.pausas, fluxo.v_tarefa_sla to authenticated;
create trigger t_aud after insert or update or delete on fluxo.pausas for each row execute function app.tg_auditoria();
revoke all on function fluxo._iniciar_pausa(uuid), fluxo._pausar_de_fora(uuid, text, text), fluxo._retomar(uuid), fluxo.pausar(uuid, text), fluxo.decidir_pausa(uuid, boolean, text), fluxo.retomar(uuid),
                       fluxo.salvar_regra_pausa(uuid, text) from public;
grant execute on function fluxo.pausar(uuid, text), fluxo.decidir_pausa(uuid, boolean, text), fluxo.retomar(uuid),
                          fluxo.salvar_regra_pausa(uuid, text), fluxo.aprova_pausa(uuid, uuid) to authenticated;

-- =====================================================================
-- Bloco 3: visibilidade por cartão (decisões do Moisés, 29/out/2026)
--
-- Ao criar, o cartão escolhe Público, Individual ou Restrito (o front
-- sempre pergunta; o atalho do pé da lista vem marcado com a última escolha
-- da pessoa). Acima de tudo vale o teto do objeto: quem não vê o terreno
-- não vê os cartões dele, nem liberado. Como fluxo não conhece terreno, o
-- app que usa o quadro registra em fluxo.objeto_tipos a função que diz se
-- a pessoa vê o objeto (no BKM Terrenos, app.ve_terreno); quadro sem objeto
-- ou de tipo não registrado tem a empresa como teto.
--   Público: todos que veem o objeto, cada um com o papel do sistema
--     (diretor, gestor e analista editam; leitura e básico leem), que um
--     acesso dado no cartão pode subir.
--   Individual: só quem criou. Só o administrador do sistema vê os
--     individuais de todos; o diretor não. Pôr outra pessoa no cartão
--     (responsável, solicitante, executor, aprovador, acompanha) o torna
--     restrito, com essa pessoa.
--   Restrito: quem criou, os envolvidos, as pessoas e os grupos liberados
--     (fluxo.tarefa_acessos) e o diretor. Exceção: tirar uma pessoa de um
--     grupo liberado. Quem tem acesso dado no cartão fica com aquele papel.
-- Papel no cartão: leitor, comentarista, editor ou administrador do cartão,
-- e pode passar o do sistema (alguém de leitura vira editor ali). Quem
-- criou é administrador do cartão. Quem dá acesso e muda a visibilidade: o
-- administrador do cartão, o administrador do sistema ou o diretor.
-- =====================================================================

-- Teto por tipo de objeto: função (objeto uuid, pessoa uuid) -> boolean
create table fluxo.objeto_tipos (
  tipo    text primary key check (tipo ~ '^[a-z_]+$'),
  funcao  regproc not null,
  -- itens do cartão (31/out/2026): condição "Vale quando" e campos do objeto no cartão
  avalia_condicao regproc,   -- (objeto uuid, condição jsonb) -> boolean
  valida_condicao regproc,   -- (empresa uuid, condição jsonb) -> void, recusa a condição inválida
  campo_objeto    regproc    -- (objeto uuid, chave text) -> jsonb {titulo, tipo, valor, editavel, cartao}; nulo = chave desconhecida
);
grant select on fluxo.objeto_tipos to authenticated;

create or replace function fluxo.ve_objeto(p_tipo text, p_id uuid, p_user uuid default auth.uid())
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare f regproc; v boolean;
begin
  if p_id is null then return true; end if;
  select funcao into f from fluxo.objeto_tipos where tipo = p_tipo;
  if f is null then return true; end if;
  execute format('select %s($1, $2)', f) into v using p_id, p_user;
  return coalesce(v, false);
end $$;

-- Grupos de pessoas da empresa (Jurídico, Diretoria...), do administrador
create table fluxo.grupos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  nome        text not null check (length(trim(nome)) > 0),
  ativo       boolean not null default true,
  unique (empresa_id, nome)
);
create table fluxo.grupo_membros (
  empresa_id  uuid not null references app.empresas(id),
  grupo_id    uuid not null references fluxo.grupos(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  primary key (grupo_id, user_id)
);

-- Acessos dados no cartão: a uma pessoa ou a um grupo, com o papel; a
-- exceção (excluido) tira uma pessoa do que os grupos liberam.
create table fluxo.tarefa_acessos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  tarefa_id   uuid not null references fluxo.tarefas(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete cascade,
  grupo_id    uuid references fluxo.grupos(id) on delete cascade,
  papel       text not null default 'editor' check (papel in ('leitor','comentarista','editor','administrador')),
  excluido    boolean not null default false,
  incluido_por uuid default auth.uid(),
  incluido_em timestamptz not null default now(),
  check ((user_id is null) <> (grupo_id is null)),
  check (not excluido or user_id is not null)
);
create unique index on fluxo.tarefa_acessos (tarefa_id, user_id) where user_id is not null;
create unique index on fluxo.tarefa_acessos (tarefa_id, grupo_id) where grupo_id is not null;

create or replace function fluxo.nivel_cartao(p text)
returns int language sql immutable set search_path = '' as $$
  select case p when 'leitor' then 1 when 'comentarista' then 2 when 'editor' then 3 when 'administrador' then 4 else 0 end $$;

-- O papel de uma pessoa no cartão (nulo = não vê); por padrão, quem está
-- lendo. Recebe as colunas da linha, para servir à RLS também no insert (a
-- linha nova ainda não aparece numa consulta por id). Com outra pessoa,
-- serve para saber se ela pode ser marcada com @ (só quem vê o cartão).
create or replace function fluxo.papel_cartao(p_id uuid, p_empresa uuid, p_quadro uuid, p_vis text, p_criado_por uuid,
                                              p_solicitante uuid, p_responsavel uuid, p_user uuid default auth.uid())
returns text language plpgsql stable security definer set search_path = '' as $$
declare u uuid := p_user; v_m app.membros; v_sis text; v_card text; v_env boolean; q fluxo.quadros;
begin
  select * into v_m from app.membros where user_id = u and empresa_id = p_empresa;
  if u is null or v_m.user_id is null then return null; end if;
  if v_m.administrador then return 'administrador'; end if;
  select * into q from fluxo.quadros where id = p_quadro;
  if not fluxo.ve_objeto(q.objeto_tipo, q.objeto_id, u) then return null; end if;
  if p_criado_por = u then return 'administrador'; end if;
  if p_vis = 'individual' then return null; end if;
  v_sis := case when v_m.papel in ('diretor','gestor','analista') then 'editor' else 'leitor' end;
  -- acesso dado no cartão: o da pessoa ou o maior dos grupos, salvo exceção
  select a.papel into v_card from fluxo.tarefa_acessos a
  where a.tarefa_id = p_id and not a.excluido
    and (a.user_id = u or (a.grupo_id is not null
         and exists (select 1 from fluxo.grupo_membros m join fluxo.grupos g on g.id = m.grupo_id
                     where m.grupo_id = a.grupo_id and m.user_id = u and g.ativo)
         and not exists (select 1 from fluxo.tarefa_acessos x where x.tarefa_id = p_id and x.user_id = u and x.excluido)))
  order by (a.user_id is not null) desc, fluxo.nivel_cartao(a.papel) desc limit 1;
  if p_vis = 'publico' then
    return case when fluxo.nivel_cartao(v_card) > fluxo.nivel_cartao(v_sis) then v_card else v_sis end;
  end if;
  -- restrito
  if v_card is not null then return v_card; end if;
  v_env := u in (p_solicitante, p_responsavel)
           or exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = p_id and user_id = u);
  if v_env then return 'editor'; end if;
  if v_m.papel = 'diretor' then return 'editor'; end if;
  return null;
end $$;

create or replace function fluxo.papel_tarefa(p_tarefa uuid, p_user uuid default auth.uid())
returns text language sql stable security definer set search_path = '' as $$
  select fluxo.papel_cartao(id, empresa_id, quadro_id, visibilidade, criado_por, solicitante_id, responsavel_id, p_user)
  from fluxo.tarefas where id = p_tarefa $$;

create or replace function fluxo.edita_tarefa(p_tarefa uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(fluxo.nivel_cartao(fluxo.papel_tarefa(p_tarefa)) >= 3, false) $$;

create or replace function fluxo.comenta_tarefa(p_tarefa uuid)
returns boolean language sql stable set search_path = '' as $$
  select coalesce(fluxo.nivel_cartao(fluxo.papel_tarefa(p_tarefa)) >= 2, false) $$;

-- Dá acesso e muda a visibilidade: administrador do cartão (quem criou ou
-- quem recebeu o papel; o do sistema também cai aqui) ou diretor que vê o cartão.
create or replace function fluxo.gerencia_tarefa(p_tarefa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(fluxo.papel_tarefa(p_tarefa) = 'administrador'
         or (fluxo.papel_tarefa(p_tarefa) is not null and app.papel(k.empresa_id) = 'diretor'), false)
  from fluxo.tarefas k where k.id = p_tarefa $$;

create or replace function fluxo.exigir_edicao_tarefa(p_tarefa uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not fluxo.edita_tarefa(p_tarefa) then
    raise exception 'Sem permissão para editar esta tarefa' using errcode = '42501';
  end if;
end $$;

-- Visibilidade só muda por quem gerencia; pôr outra pessoa num individual o torna restrito.
create or replace function fluxo.tg_visibilidade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.visibilidade is distinct from old.visibilidade
     and auth.uid() is not null and coalesce(current_setting('fluxo.restringindo', true), '') <> '1'
     and not fluxo.gerencia_tarefa(new.id) then
    raise exception 'Só o administrador do cartão, o administrador do sistema ou o diretor mudam a visibilidade' using errcode = '42501';
  end if;
  if new.visibilidade = 'individual'
     and (new.responsavel_id is distinct from new.criado_por and new.responsavel_id is not null
          or new.solicitante_id is distinct from new.criado_por and new.solicitante_id is not null) then
    new.visibilidade := 'restrito';
  end if;
  return new;
end $$;
create trigger t_visibilidade before insert or update on fluxo.tarefas for each row execute function fluxo.tg_visibilidade();

create or replace function fluxo.tg_pessoa_restringe()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('fluxo.restringindo', '1', true);
  update fluxo.tarefas set visibilidade = 'restrito'
  where id = new.tarefa_id and visibilidade = 'individual' and criado_por is distinct from new.user_id;
  perform set_config('fluxo.restringindo', '', true);
  return null;
end $$;
create trigger t_restringe after insert on fluxo.tarefa_pessoas for each row execute function fluxo.tg_pessoa_restringe();

-- Leitura e escrita pelos papéis do cartão. A escrita de quem edita o
-- cartão vale mesmo para quem é leitura no sistema (o papel do cartão passa).
drop policy ver on fluxo.tarefas;
drop policy alterar on fluxo.tarefas;
create policy ver on fluxo.tarefas for select to authenticated
  using (fluxo.papel_cartao(id, empresa_id, quadro_id, visibilidade, criado_por, solicitante_id, responsavel_id) is not null);
create policy alterar on fluxo.tarefas for update to authenticated
  using (fluxo.nivel_cartao(fluxo.papel_cartao(id, empresa_id, quadro_id, visibilidade, criado_por, solicitante_id, responsavel_id)) >= 3)
  with check (fluxo.nivel_cartao(fluxo.papel_cartao(id, empresa_id, quadro_id, visibilidade, criado_por, solicitante_id, responsavel_id)) >= 3);

do $$
declare t text;
begin
  -- filhas com tarefa_id: ver quem vê o cartão
  foreach t in array array['tarefa_pessoas','tarefa_etiquetas','checklists','comentarios','anexos','aprovacoes','pausas','linha_base_itens'] loop
    execute format('drop policy ver on fluxo.%I', t);
    execute format('create policy ver on fluxo.%I for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null)', t);
  end loop;
  -- e escrever quem edita o cartão
  foreach t in array array['tarefa_pessoas','tarefa_etiquetas','checklists','anexos'] loop
    execute format('drop policy inserir on fluxo.%I', t);
    execute format('drop policy alterar on fluxo.%I', t);
    execute format('create policy inserir on fluxo.%I for insert to authenticated with check (fluxo.edita_tarefa(tarefa_id))', t);
    execute format('create policy alterar on fluxo.%I for update to authenticated using (fluxo.edita_tarefa(tarefa_id)) with check (fluxo.edita_tarefa(tarefa_id))', t);
  end loop;
  foreach t in array array['tarefa_pessoas','tarefa_etiquetas','checklists'] loop
    execute format('drop policy remover on fluxo.%I', t);
    execute format('create policy remover on fluxo.%I for delete to authenticated using (fluxo.edita_tarefa(tarefa_id))', t);
  end loop;
end $$;

create or replace function fluxo.tarefa_do_checklist(p_checklist uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select tarefa_id from fluxo.checklists where id = p_checklist $$;
create or replace function fluxo.tarefa_do_comentario(p_comentario uuid)
returns uuid language sql stable security definer set search_path = '' as $$ select tarefa_id from fluxo.comentarios where id = p_comentario $$;

drop policy ver on fluxo.checklist_itens;
drop policy inserir on fluxo.checklist_itens;
drop policy alterar on fluxo.checklist_itens;
drop policy remover on fluxo.checklist_itens;
create policy ver on fluxo.checklist_itens for select to authenticated using (fluxo.papel_tarefa(fluxo.tarefa_do_checklist(checklist_id)) is not null);
create policy inserir on fluxo.checklist_itens for insert to authenticated with check (fluxo.edita_tarefa(fluxo.tarefa_do_checklist(checklist_id)));
create policy alterar on fluxo.checklist_itens for update to authenticated
  using (fluxo.edita_tarefa(fluxo.tarefa_do_checklist(checklist_id))) with check (fluxo.edita_tarefa(fluxo.tarefa_do_checklist(checklist_id)));
create policy remover on fluxo.checklist_itens for delete to authenticated using (fluxo.edita_tarefa(fluxo.tarefa_do_checklist(checklist_id)));

-- Comentar e reagir: comentarista para cima; editar e apagar o próprio comentário continua só do autor.
drop policy inserir on fluxo.comentarios;
drop policy alterar on fluxo.comentarios;
create policy inserir on fluxo.comentarios for insert to authenticated with check (autor_id = auth.uid() and fluxo.comenta_tarefa(tarefa_id));
create policy alterar on fluxo.comentarios for update to authenticated
  using (autor_id = auth.uid() and fluxo.comenta_tarefa(tarefa_id)) with check (autor_id = auth.uid());
drop policy ver on fluxo.comentario_reacoes;
drop policy inserir on fluxo.comentario_reacoes;
create policy ver on fluxo.comentario_reacoes for select to authenticated using (fluxo.papel_tarefa(fluxo.tarefa_do_comentario(comentario_id)) is not null);
create policy inserir on fluxo.comentario_reacoes for insert to authenticated
  with check (user_id = auth.uid() and fluxo.comenta_tarefa(fluxo.tarefa_do_comentario(comentario_id)));

drop policy ver on fluxo.aprovacao_votos;
create policy ver on fluxo.aprovacao_votos for select to authenticated
  using (fluxo.papel_tarefa((select a.tarefa_id from fluxo.aprovacoes a where a.id = aprovacao_id)) is not null);

-- Vínculo: ver quando vê as duas pontas; criar e mudar quem edita a sucessora e vê a predecessora.
drop policy ver on fluxo.vinculos;
drop policy inserir on fluxo.vinculos;
drop policy alterar on fluxo.vinculos;
drop policy remover on fluxo.vinculos;
create policy ver on fluxo.vinculos for select to authenticated
  using (fluxo.papel_tarefa(predecessora_id) is not null and fluxo.papel_tarefa(sucessora_id) is not null);
create policy inserir on fluxo.vinculos for insert to authenticated
  with check (fluxo.edita_tarefa(sucessora_id) and fluxo.papel_tarefa(predecessora_id) is not null);
create policy alterar on fluxo.vinculos for update to authenticated
  using (fluxo.edita_tarefa(sucessora_id)) with check (fluxo.edita_tarefa(sucessora_id) and fluxo.papel_tarefa(predecessora_id) is not null);
create policy remover on fluxo.vinculos for delete to authenticated using (fluxo.edita_tarefa(sucessora_id));

-- Acessos do cartão: vê quem vê o cartão; mexe quem gerencia
alter table fluxo.tarefa_acessos enable row level security;
create policy ver on fluxo.tarefa_acessos for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null);
create policy mexer on fluxo.tarefa_acessos for all to authenticated
  using (fluxo.gerencia_tarefa(tarefa_id)) with check (fluxo.gerencia_tarefa(tarefa_id));
create trigger t_emp before insert or update on fluxo.tarefa_acessos for each row execute function fluxo.tg_mesma_empresa();
create trigger t_aud after insert or update or delete on fluxo.tarefa_acessos for each row execute function app.tg_auditoria();

-- Grupos: todos da empresa veem; só o administrador mexe
alter table fluxo.grupos enable row level security;
alter table fluxo.grupo_membros enable row level security;
create policy ver on fluxo.grupos for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy mexer on fluxo.grupos for all to authenticated using (app.eh_administrador(empresa_id)) with check (app.eh_administrador(empresa_id));
create policy ver on fluxo.grupo_membros for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy mexer on fluxo.grupo_membros for all to authenticated using (app.eh_administrador(empresa_id)) with check (app.eh_administrador(empresa_id));
create trigger t_emp before insert or update on fluxo.grupo_membros for each row execute function fluxo.tg_mesma_empresa();
create trigger t_aud after insert or update or delete on fluxo.grupos for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on fluxo.grupo_membros for each row execute function app.tg_auditoria();

grant select, insert, update, delete on fluxo.tarefa_acessos, fluxo.grupos, fluxo.grupo_membros to authenticated;
grant delete on fluxo.tarefa_acessos to authenticated;

-- O histórico (app.auditoria) não mostra o que se passa num cartão que a pessoa não vê
create or replace function fluxo.tarefa_do_log(p_tabela text, p_registro uuid, p_antes jsonb, p_depois jsonb)
returns uuid language sql stable security definer set search_path = '' as $$
  select k.id from fluxo.tarefas k
  where k.id = case p_tabela
                 when 'tarefas' then p_registro
                 when 'checklist_itens' then fluxo.tarefa_do_checklist((coalesce(p_depois, p_antes)->>'checklist_id')::uuid)
                 when 'comentario_reacoes' then fluxo.tarefa_do_comentario((coalesce(p_depois, p_antes)->>'comentario_id')::uuid)
                 else (coalesce(p_depois, p_antes)->>'tarefa_id')::uuid end
    and p_tabela in ('tarefas','tarefa_pessoas','tarefa_etiquetas','checklists','checklist_itens','comentarios','comentario_reacoes',
                     'anexos','pausas','tarefa_acessos','tarefa_campos','recorrencias','apontamentos',
                     'tarefa_itens','conclusao_justificativas') $$;
drop policy auditoria_gestor_ve on app.auditoria;
create policy auditoria_gestor_ve on app.auditoria for select to authenticated
  using (app.eh_gestor(empresa_id)
         and (fluxo.tarefa_do_log(tabela, registro_id, antes, depois) is null
              or fluxo.papel_tarefa(fluxo.tarefa_do_log(tabela, registro_id, antes, depois)) is not null));

revoke all on function fluxo.ve_objeto(text, uuid, uuid), fluxo.papel_cartao(uuid, uuid, uuid, text, uuid, uuid, uuid, uuid), fluxo.papel_tarefa(uuid, uuid),
                       fluxo.edita_tarefa(uuid), fluxo.comenta_tarefa(uuid), fluxo.gerencia_tarefa(uuid), fluxo.exigir_edicao_tarefa(uuid),
                       fluxo.tarefa_do_checklist(uuid), fluxo.tarefa_do_comentario(uuid), fluxo.tarefa_do_log(text, uuid, jsonb, jsonb) from public;
grant execute on function fluxo.ve_objeto(text, uuid, uuid), fluxo.papel_cartao(uuid, uuid, uuid, text, uuid, uuid, uuid, uuid), fluxo.papel_tarefa(uuid, uuid),
                          fluxo.edita_tarefa(uuid), fluxo.comenta_tarefa(uuid), fluxo.gerencia_tarefa(uuid), fluxo.exigir_edicao_tarefa(uuid),
                          fluxo.tarefa_do_checklist(uuid), fluxo.tarefa_do_comentario(uuid), fluxo.tarefa_do_log(text, uuid, jsonb, jsonb),
                          fluxo.nivel_cartao(text) to authenticated;

-- =====================================================================
-- Bloco 4: campos personalizados (decisões do Moisés, 30/out/2026)
--
-- Os campos são da empresa, criados pelo administrador (Configurações ›
-- Tarefas), e valem para todos os quadros: texto, número, data, lista de
-- opções (uma escolha) e sim/não. Cada campo diz se aparece na frente do
-- cartão. Se ele precisa estar preenchido para concluir é escolha de cada
-- cartão (fluxo.tarefa_itens, 31/out/2026; sim/não vale como preenchido com
-- "Não"). O valor de cada cartão fica em tarefa_campos; sem linha, o campo
-- está "não informado" (nunca zero nem "não"). Campo ou opção com valor
-- não se apaga (desativa), e o tipo não muda depois de ter valor.
-- =====================================================================
create table fluxo.campos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  tipo        text not null check (tipo in ('texto','numero','data','lista','caixa')),
  ordem       int  not null default 0,
  na_frente   boolean not null default false,   -- aparece na frente do cartão
  ativo       boolean not null default true,
  unique (empresa_id, nome)
);
create table fluxo.campo_opcoes (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  campo_id    uuid not null references fluxo.campos(id) on delete cascade,
  nome        text not null check (length(trim(nome)) > 0),
  cor         text not null default 'cinza' check (cor in ('cinza','azul','verde','amarelo','laranja','vermelho','roxo','rosa')),
  ordem       int  not null default 0,
  ativo       boolean not null default true,
  unique (campo_id, nome)
);
create table fluxo.tarefa_campos (
  empresa_id  uuid not null references app.empresas(id),
  tarefa_id   uuid not null references fluxo.tarefas(id) on delete cascade,
  campo_id    uuid not null references fluxo.campos(id),
  texto       text,
  numero      numeric,
  data        date,
  opcao_id    uuid references fluxo.campo_opcoes(id),
  caixa       boolean,
  primary key (tarefa_id, campo_id),
  check (num_nonnulls(texto, numero, data, opcao_id, caixa) = 1)
);
create index on fluxo.tarefa_campos (campo_id);

-- O valor vai na coluna do tipo do campo, e a opção é do próprio campo; campo desativado não recebe valor novo.
create or replace function fluxo.tg_tarefa_campo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c fluxo.campos;
begin
  select * into c from fluxo.campos where id = new.campo_id;
  if c.empresa_id is distinct from new.empresa_id then raise exception 'Campo de outra empresa' using errcode = '42501'; end if;
  if not c.ativo and (tg_op = 'INSERT' or new is distinct from old) then
    raise exception 'O campo % está desativado', c.nome using errcode = 'P0001';
  end if;
  if (c.tipo = 'texto' and new.texto is null) or (c.tipo = 'numero' and new.numero is null) or (c.tipo = 'data' and new.data is null)
     or (c.tipo = 'lista' and new.opcao_id is null) or (c.tipo = 'caixa' and new.caixa is null) then
    raise exception 'O valor não combina com o tipo do campo %', c.nome using errcode = 'P0001';
  end if;
  if c.tipo = 'texto' and length(trim(new.texto)) = 0 then
    raise exception 'Texto vazio: apague o valor para deixar o campo % não informado', c.nome using errcode = 'P0001';
  end if;
  if c.tipo = 'lista' and not exists (select 1 from fluxo.campo_opcoes o where o.id = new.opcao_id and o.campo_id = c.id and o.ativo) then
    raise exception 'Opção que não é do campo % (ou desativada)', c.nome using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_valor before insert or update on fluxo.tarefa_campos for each row execute function fluxo.tg_tarefa_campo();

-- Tipo não muda depois de ter valor; campo e opção com valor não se apagam (desativam).
create or replace function fluxo.tg_campo_guarda()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'campos' then
    if tg_op = 'UPDATE' and new.tipo <> old.tipo and exists (select 1 from fluxo.tarefa_campos where campo_id = old.id) then
      raise exception 'O campo % já tem valores: o tipo não muda (crie outro campo)', old.nome using errcode = 'P0001';
    end if;
    if tg_op = 'DELETE' and exists (select 1 from fluxo.tarefa_campos where campo_id = old.id) then
      raise exception 'O campo % já tem valores: desative em vez de apagar', old.nome using errcode = 'P0001';
    end if;
  elsif tg_op = 'DELETE' and exists (select 1 from fluxo.tarefa_campos where opcao_id = old.id) then
    raise exception 'A opção % já foi usada: desative em vez de apagar', old.nome using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;
create trigger t_guarda before update or delete on fluxo.campos for each row execute function fluxo.tg_campo_guarda();
create trigger t_guarda before delete on fluxo.campo_opcoes for each row execute function fluxo.tg_campo_guarda();

alter table fluxo.campos enable row level security;
alter table fluxo.campo_opcoes enable row level security;
alter table fluxo.tarefa_campos enable row level security;
create policy ver on fluxo.campos for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy mexer on fluxo.campos for all to authenticated using (app.eh_administrador(empresa_id)) with check (app.eh_administrador(empresa_id));
create policy ver on fluxo.campo_opcoes for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy mexer on fluxo.campo_opcoes for all to authenticated using (app.eh_administrador(empresa_id)) with check (app.eh_administrador(empresa_id));
create policy ver on fluxo.tarefa_campos for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null);
create policy inserir on fluxo.tarefa_campos for insert to authenticated with check (fluxo.edita_tarefa(tarefa_id));
create policy alterar on fluxo.tarefa_campos for update to authenticated using (fluxo.edita_tarefa(tarefa_id)) with check (fluxo.edita_tarefa(tarefa_id));
create policy remover on fluxo.tarefa_campos for delete to authenticated using (fluxo.edita_tarefa(tarefa_id));
create trigger t_emp before insert or update on fluxo.campo_opcoes for each row execute function fluxo.tg_mesma_empresa();
create trigger t_emp before insert or update on fluxo.tarefa_campos for each row execute function fluxo.tg_mesma_empresa();
create trigger t_aud after insert or update or delete on fluxo.campos for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on fluxo.campo_opcoes for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on fluxo.tarefa_campos for each row execute function app.tg_auditoria();
grant select, insert, update, delete on fluxo.campos, fluxo.campo_opcoes, fluxo.tarefa_campos to authenticated;

-- =====================================================================
-- Itens do cartão e regra de campo em branco (decisões do Moisés, 31/out/2026)
-- Na frente do cartão, quem cria inclui o que a tarefa precisa: campos do
-- objeto do quadro (no BKM, do terreno e da negociação, pelo catálogo
-- app.campos_catalogo), campos personalizados e checklists. O valor do
-- campo do objeto não é copiado: lê e grava no próprio registro, pelas
-- funções que o app registra em fluxo.objeto_tipos.
-- Cada item tem a regra de "em branco" ao concluir: livre (padrão),
-- justificativa ou bloqueia, e uma condição opcional ("Vale quando...")
-- sobre os campos do objeto; sem condição, vale sempre. A regra é de cada
-- cartão, não global, e só o diretor, o administrador e quem criou a
-- tarefa a mudam (aba Configuração do cartão). "Bloqueia" trava analista e
-- gestor; o diretor conclui com justificativa. Item de checklist sem regra
-- própria segue a regra da empresa (conclui_exige_checklist ligada:
-- bloqueia; desligada: livre). Toda justificativa fica registrada.
-- Condição: {"modo": "todas"|"qualquer", "itens": [{"campo", "op", "valores"},
-- {"grupo": {"modo", "itens"}}]}, com um nível de grupo; quem confere é o app.
-- =====================================================================
create table fluxo.tarefa_itens (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  tarefa_id     uuid not null references fluxo.tarefas(id) on delete cascade,
  chave         text,                                  -- campo do objeto do quadro
  campo_id      uuid references fluxo.campos(id),      -- campo personalizado
  posicao       double precision not null default extract(epoch from clock_timestamp()),
  regra_branco  text not null default 'livre' check (regra_branco in ('livre','justificativa','bloqueia')),
  condicao      jsonb,
  incluido_por  uuid default auth.uid(),
  incluido_em   timestamptz not null default now(),
  check (num_nonnulls(chave, campo_id) = 1),
  unique (tarefa_id, chave),
  unique (tarefa_id, campo_id)
);
create index on fluxo.tarefa_itens (tarefa_id, posicao);

-- Justificativa de quem concluiu com item em branco (uma por conclusão)
create table fluxo.conclusao_justificativas (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  tarefa_id       uuid not null references fluxo.tarefas(id) on delete cascade,
  texto           text not null check (length(trim(texto)) > 0),
  itens           jsonb not null,                       -- [{tipo, ref, nome, regra}] em branco naquela hora
  libera_bloqueio boolean not null default false,       -- o diretor passou por item que bloqueia
  por             uuid default auth.uid(),
  em              timestamptz not null default now()
);
create index on fluxo.conclusao_justificativas (tarefa_id, em);

-- Quem configura as regras do cartão: diretor, administrador ou quem criou a tarefa (e vê o cartão)
create or replace function fluxo.configura_tarefa(p_tarefa uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fluxo.tarefas k join app.membros m on m.empresa_id = k.empresa_id and m.user_id = p_user
                 where k.id = p_tarefa and fluxo.papel_tarefa(k.id, p_user) is not null
                   and (m.papel = 'diretor' or m.administrador or k.criado_por = p_user)) $$;

-- Funções que o app registrou para o tipo do quadro da tarefa
create or replace function fluxo._objeto_da_tarefa(p_tarefa uuid, out tipo text, out objeto uuid, out avalia regproc, out valida regproc, out campo regproc)
language sql stable security definer set search_path = '' as $$
  select q.objeto_tipo, q.objeto_id, o.avalia_condicao, o.valida_condicao, o.campo_objeto
  from fluxo.tarefas k join fluxo.quadros q on q.id = k.quadro_id left join fluxo.objeto_tipos o on o.tipo = q.objeto_tipo
  where k.id = p_tarefa $$;

-- A condição vale para a tarefa? Sem condição (ou sem quem confira), vale.
create or replace function fluxo.condicao_vale(p_tarefa uuid, p_cond jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare o record; v boolean;
begin
  if p_cond is null then return true; end if;
  select * into o from fluxo._objeto_da_tarefa(p_tarefa);
  if o.avalia is null or o.objeto is null then return true; end if;
  execute format('select %s($1, $2)', o.avalia) into v using o.objeto, p_cond;
  return coalesce(v, false);
end $$;

-- Campo do objeto como o cartão mostra: {titulo, tipo, valor, editavel, cartao}
create or replace function fluxo.campo_do_objeto(p_tarefa uuid, p_chave text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare o record; v jsonb;
begin
  select * into o from fluxo._objeto_da_tarefa(p_tarefa);
  if o.campo is null or o.objeto is null then return null; end if;
  execute format('select %s($1, $2)', o.campo) into v using o.objeto, p_chave;
  return v;
end $$;

-- Confere a condição (vazia vira nula) e quem pode mexer na regra.
create or replace function fluxo._regra_item(p_tarefa uuid, p_empresa uuid, p_cond jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare o record;
begin
  if p_cond is null or p_cond = 'null'::jsonb or coalesce(jsonb_array_length(case when jsonb_typeof(p_cond->'itens') = 'array' then p_cond->'itens' end), 0) = 0 then
    return null;
  end if;
  select * into o from fluxo._objeto_da_tarefa(p_tarefa);
  if o.valida is null then raise exception 'Este quadro não aceita condição' using errcode = '22023'; end if;
  execute format('select %s($1, $2)', o.valida) using p_empresa, p_cond;
  return p_cond;
end $$;

create or replace function fluxo.tg_tarefa_item()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tarefa uuid; j jsonb; v_regra_mudou boolean; r jsonb := to_jsonb(coalesce(new, old)); v_chave text; v_campo uuid;
begin
  -- a mesma função serve a tarefa_itens e checklist_itens: os campos de cada um vêm pelo jsonb
  v_tarefa := case when tg_table_name = 'checklist_itens' then fluxo.tarefa_do_checklist((r->>'checklist_id')::uuid) else (r->>'tarefa_id')::uuid end;
  v_chave := r->>'chave'; v_campo := (r->>'campo_id')::uuid;
  if tg_op = 'DELETE' then
    if coalesce(old.regra_branco, 'livre') <> 'livre' and auth.uid() is not null and not fluxo.configura_tarefa(v_tarefa) then
      raise exception 'Este item tem regra para concluir: só o diretor, o administrador e quem criou a tarefa o tiram' using errcode = '42501';
    end if;
    return old;
  end if;
  new.condicao := fluxo._regra_item(v_tarefa, new.empresa_id, new.condicao);
  v_regra_mudou := case when tg_op = 'INSERT' then coalesce(new.regra_branco, 'livre') <> 'livre' or new.condicao is not null
                        else new.regra_branco is distinct from old.regra_branco or new.condicao is distinct from old.condicao end;
  if v_regra_mudou and auth.uid() is not null and not fluxo.configura_tarefa(v_tarefa) then
    raise exception 'Só o diretor, o administrador e quem criou a tarefa mudam a regra deste item' using errcode = '42501';
  end if;
  if v_chave is not null and (tg_op = 'INSERT' or v_chave is distinct from to_jsonb(old)->>'chave') then
    j := fluxo.campo_do_objeto(v_tarefa, v_chave);
    if j is null then raise exception 'Campo desconhecido: %', new.chave using errcode = '22023'; end if;
    if not coalesce((j->>'cartao')::boolean, false) then raise exception 'O campo % não pode ir para o cartão', j->>'titulo' using errcode = '22023'; end if;
  end if;
  if v_campo is not null and tg_op = 'INSERT' and not exists (select 1 from fluxo.campos where id = v_campo and ativo) then
    raise exception 'Campo personalizado desativado' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger t_item before insert or update or delete on fluxo.tarefa_itens for each row execute function fluxo.tg_tarefa_item();
create trigger t_regra before insert or update of regra_branco, condicao or delete on fluxo.checklist_itens for each row execute function fluxo.tg_tarefa_item();

-- Preencher um campo personalizado o inclui no cartão (se ainda não estava)
create or replace function fluxo.tg_campo_incluido()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into fluxo.tarefa_itens (empresa_id, tarefa_id, campo_id) values (new.empresa_id, new.tarefa_id, new.campo_id) on conflict do nothing;
  return new;
end $$;
create trigger t_incluido after insert on fluxo.tarefa_campos for each row execute function fluxo.tg_campo_incluido();

-- Itens em branco que pedem algo para concluir agora (regra justificativa ou bloqueia, com a condição valendo)
create or replace function fluxo.itens_em_branco(p_tarefa uuid)
returns table (tipo text, ref text, nome text, regra text) language plpgsql stable security definer set search_path = '' as $$
declare k fluxo.tarefas; r record; j jsonb; v_padrao text;
begin
  select * into k from fluxo.tarefas where id = p_tarefa;
  if k.id is null or (auth.uid() is not null and fluxo.papel_tarefa(k.id) is null) then return; end if;
  v_padrao := case when coalesce((select conclui_exige_checklist from fluxo.regras where empresa_id = k.empresa_id), true) then 'bloqueia' else 'livre' end;
  for r in select i.*, c.nome as cnome, c.ativo as cativo from fluxo.tarefa_itens i left join fluxo.campos c on c.id = i.campo_id
           where i.tarefa_id = k.id and i.regra_branco <> 'livre' order by i.posicao loop
    if r.campo_id is not null then
      if not r.cativo or exists (select 1 from fluxo.tarefa_campos v where v.tarefa_id = k.id and v.campo_id = r.campo_id) then continue; end if;
      tipo := 'campo'; ref := r.campo_id::text; nome := r.cnome;
    else
      j := fluxo.campo_do_objeto(k.id, r.chave);
      if j is null or coalesce(j->'valor', 'null'::jsonb) <> 'null'::jsonb then continue; end if;
      tipo := 'objeto'; ref := r.chave; nome := j->>'titulo';
    end if;
    if not fluxo.condicao_vale(k.id, r.condicao) then continue; end if;
    regra := r.regra_branco; return next;
  end loop;
  for r in select i.id, i.texto, coalesce(i.regra_branco, v_padrao) as rg, i.condicao
           from fluxo.checklist_itens i join fluxo.checklists c on c.id = i.checklist_id
           where c.tarefa_id = k.id and i.concluido_em is null and i.virou_tarefa_id is null order by c.posicao, i.posicao loop
    if r.rg = 'livre' or not fluxo.condicao_vale(k.id, r.condicao) then continue; end if;
    tipo := 'checklist'; ref := r.id::text; nome := r.texto; regra := r.rg; return next;
  end loop;
end $$;

-- Justificada nesta mesma gravação? (p_bloqueio: e por quem pode passar por item que bloqueia)
create or replace function fluxo._justificada(p_tarefa uuid, p_bloqueio boolean)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fluxo.conclusao_justificativas where tarefa_id = p_tarefa and em = now() and (libera_bloqueio or not p_bloqueio)) $$;

-- Concluir com item em branco: grava a justificativa e conclui (ou, com
-- aprovador, pede a aprovação). Item que bloqueia só o diretor passa.
create or replace function fluxo.concluir_justificando(p_tarefa uuid, p_texto text)
returns text language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; v_itens jsonb; v_bloq boolean; v_dir boolean;
begin
  select * into k from fluxo.tarefas where id = p_tarefa for update;
  if k.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  perform fluxo.exigir_edicao_tarefa(k.id);
  if k.concluida_em is not null or k.arquivada_em is not null then raise exception 'A tarefa já está concluída ou arquivada' using errcode = '23514'; end if;
  if nullif(trim(p_texto), '') is null then raise exception 'Escreva a justificativa' using errcode = '22023'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('tipo', b.tipo, 'ref', b.ref, 'nome', b.nome, 'regra', b.regra)), '[]'), coalesce(bool_or(b.regra = 'bloqueia'), false)
  into v_itens, v_bloq from fluxo.itens_em_branco(k.id) b;
  if jsonb_array_length(v_itens) = 0 then raise exception 'Nenhum item em branco pede justificativa' using errcode = '23514'; end if;
  v_dir := coalesce(app.papel(k.empresa_id) = 'diretor', false);
  if v_bloq and not v_dir then
    raise exception 'Há item em branco que impede concluir; só o diretor conclui assim' using errcode = '42501';
  end if;
  insert into fluxo.conclusao_justificativas (empresa_id, tarefa_id, texto, itens, libera_bloqueio)
  values (k.empresa_id, k.id, trim(p_texto), v_itens, v_dir);
  if exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = k.id and papel = 'aprovador')
     and not exists (select 1 from fluxo.aprovacoes where tarefa_id = k.id and situacao = 'aprovada') then
    perform fluxo.pedir_aprovacao(k.id);
    return 'aprovacao';
  end if;
  update fluxo.tarefas set concluida_em = now() where id = k.id;
  return 'concluida';
end $$;

alter table fluxo.tarefa_itens enable row level security;
alter table fluxo.conclusao_justificativas enable row level security;
create policy ver on fluxo.tarefa_itens for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null);
create policy inserir on fluxo.tarefa_itens for insert to authenticated with check (fluxo.edita_tarefa(tarefa_id));
create policy alterar on fluxo.tarefa_itens for update to authenticated using (fluxo.edita_tarefa(tarefa_id)) with check (fluxo.edita_tarefa(tarefa_id));
create policy remover on fluxo.tarefa_itens for delete to authenticated using (fluxo.edita_tarefa(tarefa_id));
create policy ver on fluxo.conclusao_justificativas for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null);
create trigger t_emp before insert or update on fluxo.tarefa_itens for each row execute function fluxo.tg_mesma_empresa();
create trigger t_aud after insert or update or delete on fluxo.tarefa_itens for each row execute function app.tg_auditoria();
create trigger t_aud after insert on fluxo.conclusao_justificativas for each row execute function app.tg_auditoria();
grant select, insert, update, delete on fluxo.tarefa_itens to authenticated;
grant select on fluxo.conclusao_justificativas to authenticated;
revoke all on function fluxo.configura_tarefa(uuid, uuid), fluxo.condicao_vale(uuid, jsonb), fluxo.campo_do_objeto(uuid, text),
  fluxo.itens_em_branco(uuid), fluxo.concluir_justificando(uuid, text), fluxo._objeto_da_tarefa(uuid), fluxo._regra_item(uuid, uuid, jsonb),
  fluxo._justificada(uuid, boolean) from public;
grant execute on function fluxo.configura_tarefa(uuid, uuid), fluxo.condicao_vale(uuid, jsonb), fluxo.campo_do_objeto(uuid, text),
  fluxo.itens_em_branco(uuid), fluxo.concluir_justificando(uuid, text) to authenticated;

-- Predecessoras que ainda não deixam concluir (decisão do Moisés, 30/out/2026): em TI e TT a
-- predecessora precisa estar concluída; em II e IT, ter começado (concluída ou com o início já
-- chegado, porque o início real não é guardado). Arquivada não conta. Devolve os códigos.
create or replace function fluxo.predecessoras_pendentes(p_tarefa uuid)
returns text[] language sql stable set search_path = '' as $$
  select coalesce(array_agg(distinct p.codigo order by p.codigo), '{}')
  from fluxo.vinculos v join fluxo.tarefas p on p.id = v.predecessora_id
  where v.sucessora_id = p_tarefa and p.arquivada_em is null and p.concluida_em is null
    and (v.tipo in ('TI','TT') or p.inicio is null or p.inicio > current_date) $$;

-- Administrador: predecessora pendente bloqueia a conclusão? (desligado = o app só avisa)
create or replace function fluxo.salvar_regra_predecessoras(p_empresa uuid, p_bloqueia boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  insert into fluxo.regras (empresa_id, conclui_exige_predecessoras) values (p_empresa, coalesce(p_bloqueia, false))
  on conflict (empresa_id) do update set conclui_exige_predecessoras = excluded.conclui_exige_predecessoras;
end $$;
revoke all on function fluxo.predecessoras_pendentes(uuid), fluxo.salvar_regra_predecessoras(uuid, boolean) from public;
grant execute on function fluxo.predecessoras_pendentes(uuid), fluxo.salvar_regra_predecessoras(uuid, boolean) to authenticated;

-- O que impede concluir. Itens em branco (31/out/2026): checklist e campos
-- com regra "bloqueia" (o diretor passa com justificativa) e, com regra
-- "justificativa", 'justificar' até alguém justificar nesta gravação.
create or replace function fluxo.pendencias_conclusao(p_tarefa uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  with b as (select * from fluxo.itens_em_branco(p_tarefa))
  select array_remove(array[
    case when exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = p_tarefa and papel = 'aprovador')
          and not exists (select 1 from fluxo.aprovacoes where tarefa_id = p_tarefa and situacao = 'aprovada') then 'aprovacao' end,
    case when exists (select 1 from b where b.tipo = 'checklist' and b.regra = 'bloqueia') and not fluxo._justificada(p_tarefa, true) then 'checklist' end,
    case when coalesce((select r.conclui_exige_checklist from fluxo.regras r join fluxo.tarefas k on k.empresa_id = r.empresa_id where k.id = p_tarefa), true)
          and exists (select 1 from fluxo.tarefas s where s.mae_id = p_tarefa and s.concluida_em is null and s.arquivada_em is null) then 'subtarefas' end,
    case when exists (select 1 from b where b.tipo <> 'checklist' and b.regra = 'bloqueia') and not fluxo._justificada(p_tarefa, true) then 'campos' end,
    case when exists (select 1 from b where b.regra = 'justificativa') and not fluxo._justificada(p_tarefa, false) then 'justificar' end,
    case when coalesce((select r.conclui_exige_predecessoras from fluxo.regras r join fluxo.tarefas k on k.empresa_id = r.empresa_id where k.id = p_tarefa), false)
          and cardinality(fluxo.predecessoras_pendentes(p_tarefa)) > 0 then 'predecessoras' end
  ], null) $$;

-- =====================================================================
-- Recorrência (bloco 4; decisões do Moisés, 30/out/2026)
-- O cartão de origem é o modelo e a primeira ocorrência da série. Cada
-- ocorrência nova nasce na data agendada (rotina diária), mesmo que a
-- anterior não tenha sido concluída: cópia do cartão de origem como ele
-- está naquele dia (título, descrição, pessoas, etiquetas, prioridade,
-- visibilidade, acessos e checklists em aberto), com início na data e
-- prazo N dias depois. Os valores dos campos personalizados não vão:
-- cada ocorrência preenche os seus. Termina numa data, depois de N
-- ocorrências (contando a de origem) ou quando alguém para a série.
-- =====================================================================
create table fluxo.recorrencias (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  tarefa_id   uuid not null unique references fluxo.tarefas(id) on delete cascade,  -- cartão de origem
  frequencia  text not null check (frequencia in ('diaria','semanal','mensal','anual')),
  intervalo   int  not null default 1 check (intervalo between 1 and 99),           -- a cada N dias, semanas, meses ou anos
  dias_semana int[] check (dias_semana is null or (cardinality(dias_semana) > 0 and dias_semana <@ array[0,1,2,3,4,5,6])),  -- 0 = domingo; só semanal
  dia_mes     int  check (dia_mes between 1 and 31),     -- mensal; mês sem esse dia usa o último
  proxima     date not null,                             -- data da próxima ocorrência
  termina_em  date,
  max_vezes   int  check (max_vezes >= 2),
  vezes       int  not null default 1,                   -- ocorrências já criadas, com a de origem
  prazo_dias  int  check (prazo_dias between 0 and 365), -- prazo = data + N (vazio = sem prazo)
  lista_id    uuid references fluxo.listas(id),          -- onde nasce (vazio = primeira lista aberta)
  ativa       boolean not null default true,
  criada_por  uuid default auth.uid(),
  criada_em   timestamptz not null default now()
);
create index on fluxo.recorrencias (proxima) where ativa;
alter table fluxo.tarefas add column recorrencia_id uuid references fluxo.recorrencias(id) on delete set null;  -- ocorrência criada pela série

-- Próxima data depois de p_de (p_de é sempre uma data da série).
create or replace function fluxo.proxima_ocorrencia(r fluxo.recorrencias, p_de date)
returns date language plpgsql immutable set search_path = '' as $$
declare d date; ini date; m date;
begin
  if r.frequencia = 'diaria' then return p_de + r.intervalo;
  elsif r.frequencia = 'anual' then return (p_de + make_interval(years => r.intervalo))::date;
  elsif r.frequencia = 'mensal' then
    m := (date_trunc('month', p_de) + make_interval(months => r.intervalo))::date;
    return m + least(coalesce(r.dia_mes, extract(day from p_de)::int), extract(day from (m + interval '1 month' - interval '1 day'))::int) - 1;
  end if;
  if r.dias_semana is null then return p_de + 7 * r.intervalo; end if;
  -- semanal com dias marcados: a semana de p_de e depois uma a cada N
  ini := p_de - extract(dow from p_de)::int;
  d := p_de + 1;
  while d <= p_de + 7 * r.intervalo + 7 loop
    if ((d - extract(dow from d)::int) - ini) / 7 % r.intervalo = 0 and extract(dow from d)::int = any (r.dias_semana) then return d; end if;
    d := d + 1;
  end loop;
  return null;
end $$;

-- Confere a regra: cartão de origem (não uma ocorrência), lista do quadro e aberta, e preenche dia do mês e próxima data.
create or replace function fluxo.tg_recorrencia()
returns trigger language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas;
begin
  select * into k from fluxo.tarefas where id = new.tarefa_id;
  if k.empresa_id is distinct from new.empresa_id then raise exception 'Tarefa de outra empresa' using errcode = '42501'; end if;
  if tg_op = 'UPDATE' and new.tarefa_id <> old.tarefa_id then raise exception 'A série não muda de cartão' using errcode = '23514'; end if;
  if k.recorrencia_id is not null then
    raise exception 'Este cartão é uma ocorrência: mude a recorrência no cartão de origem' using errcode = '23514';
  end if;
  if k.modelo then raise exception 'Modelo de cartão não tem recorrência' using errcode = '23514'; end if;
  if new.lista_id is not null and not exists (select 1 from fluxo.listas where id = new.lista_id and quadro_id = k.quadro_id and tipo = 'aberta') then
    raise exception 'A ocorrência nasce numa lista aberta do mesmo quadro' using errcode = '23514';
  end if;
  if new.frequencia <> 'semanal' then new.dias_semana := null; end if;
  if new.frequencia = 'mensal' and new.dia_mes is null then
    new.dia_mes := extract(day from coalesce(new.proxima, k.inicio, k.prazo, current_date))::int;
  elsif new.frequencia <> 'mensal' then new.dia_mes := null;
  end if;
  -- próxima data: na criação, depois do início do cartão; mudando a regra, depois da última ocorrência
  if new.proxima is null or (tg_op = 'UPDATE' and new.proxima = old.proxima
      and (new.frequencia, new.intervalo, new.dias_semana, new.dia_mes) is distinct from (old.frequencia, old.intervalo, old.dias_semana, old.dia_mes)) then
    new.proxima := fluxo.proxima_ocorrencia(new, coalesce((select max(inicio) from fluxo.tarefas where recorrencia_id = new.id), k.inicio, k.prazo, current_date));
  end if;
  -- data de hoje ou que já passou (cartão antigo, série retomada) não gera atrasados: a próxima é de amanhã em diante
  if new.ativa and (tg_op = 'INSERT' or new.proxima is distinct from old.proxima or not old.ativa) then
    while new.proxima <= current_date loop new.proxima := fluxo.proxima_ocorrencia(new, new.proxima); end loop;
  end if;
  if new.termina_em is not null and new.termina_em < new.proxima and new.ativa and (tg_op = 'INSERT' or old.ativa is false) then
    raise exception 'A série termina antes da próxima ocorrência' using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then new.vezes := 1; new.criada_por := auth.uid(); end if;
  return new;
end $$;
create trigger t_valida before insert or update on fluxo.recorrencias for each row execute function fluxo.tg_recorrencia();

-- Cria uma ocorrência na data, copiando o cartão de origem.
create or replace function fluxo._criar_ocorrencia(r fluxo.recorrencias, p_data date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; v uuid; c record; nc uuid; desloc int;
begin
  select * into k from fluxo.tarefas where id = r.tarefa_id;
  desloc := p_data - coalesce(k.inicio, k.prazo, p_data);
  insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, solicitante_id, inicio, prazo, prazo_hora, prioridade, capa,
                             aprovacao_modo, visibilidade, processo_id, etapa, subetapa, criado_por, recorrencia_id)
  values (k.empresa_id, k.quadro_id,
          coalesce((select id from fluxo.listas where id = r.lista_id and tipo = 'aberta'),
                   (select id from fluxo.listas where quadro_id = k.quadro_id and tipo = 'aberta' and not oculta order by posicao limit 1)),
          k.titulo, k.descricao, k.solicitante_id, p_data, p_data + r.prazo_dias, case when r.prazo_dias is not null then k.prazo_hora end,
          k.prioridade, k.capa, k.aprovacao_modo, k.visibilidade, k.processo_id, k.etapa, k.subetapa, k.criado_por, r.id)
  returning id into v;
  insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, grupo_id, papel, excluido)
  select empresa_id, v, user_id, grupo_id, papel, excluido from fluxo.tarefa_acessos where tarefa_id = k.id;
  if k.responsavel_id is not null then update fluxo.tarefas set responsavel_id = k.responsavel_id where id = v; end if;
  insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel, ordem)
  select empresa_id, v, user_id, papel, ordem from fluxo.tarefa_pessoas where tarefa_id = k.id;
  insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id)
  select empresa_id, v, etiqueta_id from fluxo.tarefa_etiquetas where tarefa_id = k.id;
  for c in select * from fluxo.checklists where tarefa_id = k.id order by posicao loop
    insert into fluxo.checklists (empresa_id, tarefa_id, nome, posicao, esconder_feitos)
    values (c.empresa_id, v, c.nome, c.posicao, c.esconder_feitos) returning id into nc;
    insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, responsavel_id, prazo, posicao, regra_branco, condicao)
    select empresa_id, nc, texto, responsavel_id, prazo + desloc, posicao, regra_branco, condicao from fluxo.checklist_itens where checklist_id = c.id;
  end loop;
  insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, campo_id, posicao, regra_branco, condicao)
  select empresa_id, v, chave, campo_id, posicao, regra_branco, condicao from fluxo.tarefa_itens where tarefa_id = k.id;
  perform fluxo._copiar_automacoes(k.id, v, null);   -- regras do cartão de origem, com o mesmo dono
  return v;
end $$;

-- Rotina diária: cria as ocorrências com data até hoje (se a rotina
-- falhou um dia, a data perdida também nasce, na ordem) e encerra as
-- séries que chegaram ao fim.
create or replace function fluxo.gerar_recorrencias(p_hoje date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare r fluxo.recorrencias; n int := 0;
begin
  for r in select * from fluxo.recorrencias where ativa and proxima <= p_hoje order by proxima for update loop
    while r.ativa and r.proxima <= p_hoje loop
      if (r.termina_em is not null and r.proxima > r.termina_em) or (r.max_vezes is not null and r.vezes >= r.max_vezes)
         or (select arquivada_em is not null from fluxo.tarefas where id = r.tarefa_id) then
        r.ativa := false;
      else
        perform fluxo._criar_ocorrencia(r, r.proxima);
        n := n + 1; r.vezes := r.vezes + 1; r.proxima := fluxo.proxima_ocorrencia(r, r.proxima);
        if r.max_vezes is not null and r.vezes >= r.max_vezes then r.ativa := false; end if;
      end if;
    end loop;
    update fluxo.recorrencias set proxima = r.proxima, vezes = r.vezes, ativa = r.ativa where id = r.id;
  end loop;
  return n;
end $$;

alter table fluxo.recorrencias enable row level security;
create policy ver on fluxo.recorrencias for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null);
create policy inserir on fluxo.recorrencias for insert to authenticated with check (fluxo.edita_tarefa(tarefa_id));
create policy alterar on fluxo.recorrencias for update to authenticated using (fluxo.edita_tarefa(tarefa_id)) with check (fluxo.edita_tarefa(tarefa_id));
create policy remover on fluxo.recorrencias for delete to authenticated using (fluxo.edita_tarefa(tarefa_id));
create trigger t_aud after insert or update or delete on fluxo.recorrencias for each row execute function app.tg_auditoria();
grant select, insert, update, delete on fluxo.recorrencias to authenticated;
grant execute on function fluxo.proxima_ocorrencia(fluxo.recorrencias, date) to authenticated;
revoke execute on function fluxo.gerar_recorrencias(date), fluxo._criar_ocorrencia(fluxo.recorrencias, date) from public;

-- =====================================================================
-- Apontamento de horas (bloco 4; decisão do Moisés, 30/out/2026: sem
-- aprovação). Cada pessoa aponta o próprio tempo na tarefa (data, minutos,
-- nota); quem edita o cartão aponta, e só o autor ou o administrador do
-- sistema mudam e apagam. A tarefa pode ter uma estimativa para comparar.
-- =====================================================================
alter table fluxo.tarefas add column estimativa_min int check (estimativa_min > 0);
create table fluxo.apontamentos (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id),
  tarefa_id   uuid not null references fluxo.tarefas(id) on delete cascade,
  user_id     uuid not null default auth.uid() references auth.users(id),
  data        date not null default current_date,
  minutos     int  not null check (minutos between 1 and 1440),
  nota        text,
  criado_em   timestamptz not null default now()
);
create index on fluxo.apontamentos (tarefa_id);
create index on fluxo.apontamentos (user_id, data);

create or replace function fluxo.tg_apontamento()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.data > current_date then raise exception 'Não se apontam horas no futuro' using errcode = '23514'; end if;
  if (select sum(minutos) from fluxo.apontamentos where user_id = new.user_id and data = new.data and id <> new.id) + new.minutos > 1440 then
    raise exception 'Mais de 24 horas apontadas no mesmo dia' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and new.user_id <> old.user_id then raise exception 'O apontamento não muda de pessoa' using errcode = '23514'; end if;
  return new;
end $$;
create trigger t_valida before insert or update on fluxo.apontamentos for each row execute function fluxo.tg_apontamento();

alter table fluxo.apontamentos enable row level security;
create policy ver on fluxo.apontamentos for select to authenticated using (fluxo.papel_tarefa(tarefa_id) is not null);
create policy inserir on fluxo.apontamentos for insert to authenticated with check (user_id = auth.uid() and fluxo.edita_tarefa(tarefa_id));
create policy alterar on fluxo.apontamentos for update to authenticated
  using (fluxo.edita_tarefa(tarefa_id) and (user_id = auth.uid() or app.eh_administrador(empresa_id)))
  with check (fluxo.edita_tarefa(tarefa_id) and (user_id = auth.uid() or app.eh_administrador(empresa_id)));
create policy remover on fluxo.apontamentos for delete to authenticated
  using (fluxo.edita_tarefa(tarefa_id) and (user_id = auth.uid() or app.eh_administrador(empresa_id)));
create trigger t_emp before insert or update on fluxo.apontamentos for each row execute function fluxo.tg_mesma_empresa();
create trigger t_aud after insert or update or delete on fluxo.apontamentos for each row execute function app.tg_auditoria();
grant select, insert, update, delete on fluxo.apontamentos to authenticated;

-- Horas por tarefa: apontado (total e por pessoa) e estimativa.
create view fluxo.v_tarefa_horas with (security_invoker = true) as
select k.id as tarefa_id, k.estimativa_min, coalesce(sum(a.minutos), 0)::int as apontado_min,
       coalesce(jsonb_object_agg(a.user_id, a.minutos) filter (where a.user_id is not null), '{}') as por_pessoa
from fluxo.tarefas k
left join (select tarefa_id, user_id, sum(minutos)::int as minutos from fluxo.apontamentos group by tarefa_id, user_id) a on a.tarefa_id = k.id
group by k.id, k.estimativa_min;
grant select on fluxo.v_tarefa_horas to authenticated;

-- =====================================================================
-- Copiar cartão e modelo de cartão (bloco 4; 30/out/2026)
-- Copiar leva o cartão para qualquer lista aberta de um quadro em que a
-- pessoa edita, com título novo e escolha do que vai junto (checklists em
-- aberto, etiquetas, pessoas, campos, anexos). Quem copia passa a ser quem
-- criou e quem pediu; a visibilidade e os acessos vão juntos. Datas,
-- comentários, horas e aprovações não vão. O modelo de cartão é um cartão
-- marcado como modelo: fica no quadro para servir de base, não conclui e
-- não atrasa; "Criar a partir de modelo" é copiar.
-- =====================================================================
create or replace function fluxo.tg_modelo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.modelo and new.recorrencia_id is not null then raise exception 'Uma ocorrência de série não vira modelo' using errcode = '23514'; end if;
  if new.modelo and exists (select 1 from fluxo.recorrencias where tarefa_id = new.id) then
    raise exception 'Cartão com recorrência não vira modelo' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_modelo before insert or update on fluxo.tarefas for each row execute function fluxo.tg_modelo();

-- Roda com os direitos de quem copia: só copia o que vê e só grava onde edita (RLS de cada tabela).
create or replace function fluxo.copiar_tarefa(p_tarefa uuid, p_lista uuid, p_titulo text default null,
  p_itens text[] default array['checklists','etiquetas','pessoas','campos','anexos','automacoes'])
returns uuid language plpgsql set search_path = '' as $$
declare k fluxo.tarefas; l fluxo.listas; v uuid; c record; nc uuid;
begin
  select * into k from fluxo.tarefas where id = p_tarefa;
  if k.id is null then raise exception 'Tarefa não encontrada' using errcode = 'P0002'; end if;
  select * into l from fluxo.listas where id = p_lista;
  if l.id is null or l.tipo <> 'aberta' then raise exception 'A cópia vai para uma lista aberta' using errcode = '23514'; end if;
  if not fluxo.ve_objeto((select objeto_tipo from fluxo.quadros where id = l.quadro_id), (select objeto_id from fluxo.quadros where id = l.quadro_id)) then
    raise exception 'Sem acesso a esse quadro' using errcode = '42501';
  end if;
  insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, prioridade, capa, aprovacao_modo, visibilidade,
                             responsavel_id, estimativa_min)
  values (l.empresa_id, l.quadro_id, l.id, coalesce(nullif(trim(p_titulo), ''), k.titulo), k.descricao, k.prioridade, k.capa, k.aprovacao_modo,
          k.visibilidade, case when 'pessoas' = any (p_itens) then k.responsavel_id end, k.estimativa_min)
  returning id into v;
  insert into fluxo.tarefa_acessos (empresa_id, tarefa_id, user_id, grupo_id, papel, excluido)
  select l.empresa_id, v, user_id, grupo_id, papel, excluido from fluxo.tarefa_acessos where tarefa_id = k.id;
  if 'pessoas' = any (p_itens) then
    insert into fluxo.tarefa_pessoas (empresa_id, tarefa_id, user_id, papel, ordem)
    select l.empresa_id, v, user_id, papel, ordem from fluxo.tarefa_pessoas where tarefa_id = k.id;
  end if;
  if 'etiquetas' = any (p_itens) then
    insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) select l.empresa_id, v, etiqueta_id from fluxo.tarefa_etiquetas where tarefa_id = k.id;
  end if;
  if 'checklists' = any (p_itens) then
    for c in select * from fluxo.checklists where tarefa_id = k.id order by posicao loop
      insert into fluxo.checklists (empresa_id, tarefa_id, nome, posicao, esconder_feitos) values (l.empresa_id, v, c.nome, c.posicao, c.esconder_feitos) returning id into nc;
      insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, responsavel_id, posicao, regra_branco, condicao)
      select l.empresa_id, nc, texto, case when 'pessoas' = any (p_itens) then responsavel_id end, posicao, regra_branco, condicao
      from fluxo.checklist_itens where checklist_id = c.id and virou_tarefa_id is null;
    end loop;
  end if;
  if 'campos' = any (p_itens) then
    -- os itens incluídos no cartão, com a regra de cada um (31/out/2026); campo do objeto que o quadro de destino não aceita fica de fora
    insert into fluxo.tarefa_itens (empresa_id, tarefa_id, chave, campo_id, posicao, regra_branco, condicao)
    select l.empresa_id, v, i.chave, i.campo_id, i.posicao, i.regra_branco, i.condicao
    from fluxo.tarefa_itens i left join fluxo.campos f on f.id = i.campo_id
    where i.tarefa_id = k.id and (i.campo_id is null or f.ativo)
      and (i.chave is null or coalesce((fluxo.campo_do_objeto(v, i.chave)->>'cartao')::boolean, false));
    insert into fluxo.tarefa_campos (empresa_id, tarefa_id, campo_id, texto, numero, data, opcao_id, caixa)
    select l.empresa_id, v, x.campo_id, x.texto, x.numero, x.data, x.opcao_id, x.caixa
    from fluxo.tarefa_campos x join fluxo.campos f on f.id = x.campo_id
    where x.tarefa_id = k.id and f.ativo and (x.opcao_id is null or exists (select 1 from fluxo.campo_opcoes o where o.id = x.opcao_id and o.ativo));
  end if;
  if 'anexos' = any (p_itens) then
    insert into fluxo.anexos (empresa_id, tarefa_id, tipo, nome, url, drive_file_id, tarefa_ref_id)
    select l.empresa_id, v, tipo, nome, url, drive_file_id, tarefa_ref_id from fluxo.anexos where tarefa_id = k.id and removido_em is null;
  end if;
  if 'automacoes' = any (p_itens) then perform fluxo._copiar_automacoes(k.id, v, auth.uid()); end if;
  return v;
end $$;
grant execute on function fluxo.copiar_tarefa(uuid, uuid, text, text[]) to authenticated;

-- =====================================================================
-- Automações (bloco 5a; 30/out/2026): "quando acontecer X, se Y, faça Z",
-- no modelo do Butler do Trello. Cada regra tem dono e se desliga. As da
-- empresa (quadro vazio) são do administrador e valem em todos os quadros,
-- com as listas pelo nome; as de um quadro são de quem edita aquele quadro,
-- com as listas pelo id, e só tocam cartões que o dono vê.
-- Gatilhos: criada (no fim da transação, com etiquetas e pessoas já
-- gravadas), entrou_lista, concluida, etiqueta, campo, checklist_completo,
-- prazo_antes (N dias antes; 0 = no dia) e prazo_venceu (rotina diária,
-- uma vez por prazo). Condições: lista, etiqueta (tem ou não tem),
-- prioridade, campo (igual, vazio ou preenchido). Ações: avisar, mover,
-- etiqueta (pôr ou tirar), responsavel, prioridade, adiar (prazo + N dias,
-- corridos ou úteis como o calendário da empresa), checklist e arquivar.
-- O que uma regra faz não dispara outra regra (fluxo.automacao = '1'), e
-- cada execução fica registrada; regra que falha registra o erro e não
-- desfaz o que a pessoa fez. Modelo de cartão e cartão arquivado não
-- disparam. Regra com execuções não se apaga: desliga.
-- Bloco 5b (30/out/2026): gatilho "botao" (a regra vira um botão nos
-- cartões que passam nas condições; quem edita o cartão aperta, por
-- fluxo.apertar_botao) e "agenda" (diária, semanal nos dias marcados ou
-- mensal no dia, com o último dia quando o mês não tem; a rotina diária
-- roda a regra em cada cartão do escopo que passa nas condições, uma vez
-- por dia, e a regra agendada precisa de pelo menos uma condição).
-- Condição "situacao": aberta, atrasada (aberta, prazo vencido e fora da
-- pausa) ou concluída.
-- =====================================================================
create table fluxo.automacoes (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references app.empresas(id) on delete cascade,
  quadro_id           uuid references fluxo.quadros(id) on delete cascade,   -- vazio = empresa toda
  tarefa_id           uuid references fluxo.tarefas(id) on delete cascade,   -- regra só deste cartão (30/out); o quadro vem dele
  nome                text not null check (length(trim(nome)) > 0),
  gatilho             text not null check (gatilho in ('criada','entrou_lista','concluida','etiqueta','campo','checklist_completo','prazo_antes','prazo_venceu','botao','agenda','etapa')),
  gatilho_etapa       text,                                  -- etapa (31/out): o código que o app dá à etapa do objeto (no BKM, 'fase:etapa'); vazio = qualquer
  gatilho_lista_id    uuid references fluxo.listas(id),      -- entrou_lista, regra do quadro (vazio = qualquer lista)
  gatilho_lista_nome  text,                                  -- entrou_lista, regra da empresa
  gatilho_etiqueta_id uuid references fluxo.etiquetas(id),   -- etiqueta (vazio = qualquer)
  gatilho_campo_id    uuid references fluxo.campos(id),      -- campo (vazio = qualquer)
  gatilho_dias        int check (gatilho_dias between 0 and 60),  -- prazo_antes
  agenda_freq         text check (agenda_freq in ('diaria','semanal','mensal')),   -- agenda
  agenda_dias         int[],                                  -- agenda: dias da semana (0 = domingo) ou do mês (1 a 31)
  condicoes           jsonb not null default '[]' check (jsonb_typeof(condicoes) = 'array'),
  acoes               jsonb not null check (jsonb_typeof(acoes) = 'array' and jsonb_array_length(acoes) > 0),
  ativa               boolean not null default true,
  dono_id             uuid not null default auth.uid() references auth.users(id),
  criada_em           timestamptz not null default now(),
  alterada_em         timestamptz not null default now()
);
create index on fluxo.automacoes (empresa_id, gatilho) where ativa;
create index on fluxo.automacoes (tarefa_id) where tarefa_id is not null;

create table fluxo.automacao_execucoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id) on delete cascade,
  automacao_id  uuid not null references fluxo.automacoes(id),
  tarefa_id     uuid not null references fluxo.tarefas(id) on delete cascade,
  gatilho       text not null,
  referencia    date,                -- prazo que disparou (gatilhos de prazo: uma vez por prazo)
  user_id       uuid default auth.uid(),  -- quem fez o que disparou (vazio = rotina diária)
  em            timestamptz not null default clock_timestamp(),
  resultado     text not null check (resultado in ('ok','erro')),
  detalhe       text
);
create index on fluxo.automacao_execucoes (automacao_id, em desc);
create index on fluxo.automacao_execucoes (tarefa_id, em desc);
create unique index on fluxo.automacao_execucoes (automacao_id, tarefa_id, referencia) where referencia is not null;

-- Lista de uma regra no quadro do cartão: pelo id (regra do quadro) ou pelo nome (regra da empresa).
create or replace function fluxo._lista_auto(p_quadro uuid, p_id uuid, p_nome text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from fluxo.listas
  where quadro_id = p_quadro and ((p_id is not null and id = p_id) or (p_id is null and lower(trim(nome)) = lower(trim(p_nome))))
  order by oculta, posicao limit 1 $$;

-- Confere a regra: escopo, gatilho, condições e ações.
create or replace function fluxo.tg_automacao()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c jsonb; t text; v_q uuid := new.quadro_id;
begin
  -- regra do cartão: o quadro é o do cartão, as listas são as dele e "cartão criado" não serve (o cartão já existe)
  if new.tarefa_id is not null then
    select quadro_id into v_q from fluxo.tarefas where id = new.tarefa_id and empresa_id = new.empresa_id;
    if v_q is null then raise exception 'Tarefa de outra empresa' using errcode = '42501'; end if;
    new.quadro_id := v_q;
    if new.gatilho = 'criada' then raise exception 'Regra do cartão não usa "cartão criado": o cartão já existe' using errcode = '23514'; end if;
  end if;
  if v_q is not null and not exists (select 1 from fluxo.quadros where id = v_q and empresa_id = new.empresa_id) then
    raise exception 'Quadro de outra empresa' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.dono_id := coalesce(auth.uid(), new.dono_id); new.criada_em := now();
    if new.tarefa_id is not null and fluxo.nivel_cartao(fluxo.papel_tarefa(new.tarefa_id, new.dono_id)) < 3 then
      raise exception 'Só quem edita o cartão cria regra nele' using errcode = '42501';
    end if;
  elsif new.dono_id <> old.dono_id or new.quadro_id is distinct from old.quadro_id or new.empresa_id <> old.empresa_id
        or new.tarefa_id is distinct from old.tarefa_id then
    raise exception 'A regra não muda de dono, de quadro nem de cartão' using errcode = '23514';
  end if;
  new.alterada_em := now();
  -- parâmetros do gatilho
  if new.gatilho <> 'entrou_lista' then new.gatilho_lista_id := null; new.gatilho_lista_nome := null; end if;
  if new.gatilho <> 'etiqueta' then new.gatilho_etiqueta_id := null; end if;
  if new.gatilho <> 'campo' then new.gatilho_campo_id := null; end if;
  if new.gatilho <> 'etapa' then new.gatilho_etapa := null; end if;
  if new.gatilho = 'prazo_antes' and new.gatilho_dias is null then raise exception 'Diga quantos dias antes do prazo' using errcode = '23514'; end if;
  if new.gatilho <> 'prazo_antes' then new.gatilho_dias := null; end if;
  if new.gatilho = 'agenda' then
    if new.agenda_freq is null then raise exception 'Diga quando a regra roda: todo dia, na semana ou no mês' using errcode = '23514'; end if;
    if new.agenda_freq = 'diaria' then new.agenda_dias := null;
    elsif coalesce(cardinality(new.agenda_dias), 0) = 0 then raise exception 'Marque os dias em que a regra roda' using errcode = '23514';
    elsif new.agenda_freq = 'semanal' and exists (select 1 from unnest(new.agenda_dias) d where d not between 0 and 6) then
      raise exception 'Dia da semana de 0 (domingo) a 6 (sábado)' using errcode = '23514';
    elsif new.agenda_freq = 'mensal' and exists (select 1 from unnest(new.agenda_dias) d where d not between 1 and 31) then
      raise exception 'Dia do mês de 1 a 31' using errcode = '23514';
    end if;
    -- sem condição, a regra agendada tocaria todos os cartões do escopo
    if jsonb_array_length(new.condicoes) = 0 then raise exception 'Regra agendada precisa de pelo menos uma condição' using errcode = '23514'; end if;
    select array_agg(distinct d order by d) into new.agenda_dias from unnest(new.agenda_dias) d;
  else new.agenda_freq := null; new.agenda_dias := null;
  end if;
  if v_q is null and new.gatilho_lista_id is not null then
    raise exception 'Regra da empresa escolhe a lista pelo nome' using errcode = '23514';
  end if;
  if v_q is not null then new.gatilho_lista_nome := null; end if;
  if new.gatilho_lista_id is not null and not exists (select 1 from fluxo.listas where id = new.gatilho_lista_id and quadro_id = v_q) then
    raise exception 'A lista não é deste quadro' using errcode = '23514';
  end if;
  if new.gatilho_etiqueta_id is not null and not exists (select 1 from fluxo.etiquetas where id = new.gatilho_etiqueta_id and empresa_id = new.empresa_id) then
    raise exception 'Etiqueta de outra empresa' using errcode = '42501';
  end if;
  if new.gatilho_campo_id is not null and not exists (select 1 from fluxo.campos where id = new.gatilho_campo_id and empresa_id = new.empresa_id) then
    raise exception 'Campo de outra empresa' using errcode = '42501';
  end if;
  -- condições
  for c in select * from jsonb_array_elements(new.condicoes) loop
    t := c->>'tipo';
    if t = 'lista' then
      if v_q is null and jsonb_typeof(c->'nomes') is distinct from 'array' then raise exception 'Regra da empresa escolhe a lista pelo nome' using errcode = '23514'; end if;
      if v_q is not null and (jsonb_typeof(c->'listas') is distinct from 'array'
         or exists (select 1 from jsonb_array_elements_text(c->'listas') x where not exists (select 1 from fluxo.listas where id = x::uuid and quadro_id = v_q))) then
        raise exception 'A lista não é deste quadro' using errcode = '23514';
      end if;
    elsif t = 'etiqueta' then
      if not exists (select 1 from fluxo.etiquetas where id = (c->>'etiqueta')::uuid and empresa_id = new.empresa_id) then raise exception 'Etiqueta de outra empresa' using errcode = '42501'; end if;
    elsif t = 'prioridade' then
      if jsonb_typeof(c->'valores') is distinct from 'array' or exists (select 1 from jsonb_array_elements_text(c->'valores') x where x not in ('baixa','media','alta')) then
        raise exception 'Prioridade inválida na condição' using errcode = '23514';
      end if;
    elsif t = 'situacao' then
      if jsonb_typeof(c->'valores') is distinct from 'array' or jsonb_array_length(c->'valores') = 0
         or exists (select 1 from jsonb_array_elements_text(c->'valores') x where x not in ('aberta','atrasada','concluida')) then
        raise exception 'Situação: aberta, atrasada ou concluída' using errcode = '23514';
      end if;
    elsif t = 'campo' then
      if not exists (select 1 from fluxo.campos where id = (c->>'campo')::uuid and empresa_id = new.empresa_id) then raise exception 'Campo de outra empresa' using errcode = '42501'; end if;
      if coalesce(c->>'op', 'igual') not in ('igual','vazio','preenchido') or (coalesce(c->>'op', 'igual') = 'igual' and not c ? 'valor') then
        raise exception 'Condição de campo: igual (com o valor), vazio ou preenchido' using errcode = '23514';
      end if;
    else raise exception 'Condição desconhecida: %', coalesce(t, '(sem tipo)') using errcode = '23514';
    end if;
  end loop;
  -- ações
  for c in select * from jsonb_array_elements(new.acoes) loop
    t := c->>'tipo';
    if t = 'avisar' then
      if coalesce(jsonb_array_length(case when jsonb_typeof(c->'para') = 'array' then c->'para' end), 0) + coalesce(jsonb_array_length(case when jsonb_typeof(c->'pessoas') = 'array' then c->'pessoas' end), 0) = 0 then
        raise exception 'Diga quem a regra avisa' using errcode = '23514';
      end if;
      if exists (select 1 from jsonb_array_elements_text(coalesce(c->'para', '[]')) x where x not in ('responsavel','executores','aprovadores','acompanham','solicitante','gestor')) then
        raise exception 'Destinatário inválido no aviso' using errcode = '23514';
      end if;
      if exists (select 1 from jsonb_array_elements_text(coalesce(c->'pessoas', '[]')) x where not exists (select 1 from app.membros where empresa_id = new.empresa_id and user_id = x::uuid)) then
        raise exception 'Quem a regra avisa tem que ser da empresa' using errcode = '23514';
      end if;
    elsif t = 'mover' then
      if v_q is null and coalesce(trim(c->>'lista_nome'), '') = '' then raise exception 'Regra da empresa escolhe a lista pelo nome' using errcode = '23514'; end if;
      if v_q is not null and not exists (select 1 from fluxo.listas where id = (c->>'lista')::uuid and quadro_id = v_q) then
        raise exception 'A lista não é deste quadro' using errcode = '23514';
      end if;
      if v_q is not null and (select tipo from fluxo.listas where id = (c->>'lista')::uuid) = 'pausa' then
        raise exception 'Regra não pausa tarefa: a pausa pede motivo' using errcode = '23514';
      end if;
    elsif t = 'etiqueta' then
      if not exists (select 1 from fluxo.etiquetas where id = (c->>'etiqueta')::uuid and empresa_id = new.empresa_id) then raise exception 'Etiqueta de outra empresa' using errcode = '42501'; end if;
    elsif t = 'responsavel' then
      if not exists (select 1 from app.membros where empresa_id = new.empresa_id and user_id = (c->>'pessoa')::uuid) then
        raise exception 'O responsável tem que ser da empresa' using errcode = '23514';
      end if;
    elsif t = 'prioridade' then
      if coalesce(c->>'valor', '') not in ('baixa','media','alta') then raise exception 'Prioridade inválida na ação' using errcode = '23514'; end if;
    elsif t = 'adiar' then
      if coalesce((c->>'dias')::int, 0) not between 1 and 365 then raise exception 'Adiar de 1 a 365 dias' using errcode = '23514'; end if;
    elsif t = 'checklist' then
      if coalesce(trim(c->>'nome'), '') = '' or jsonb_typeof(c->'itens') is distinct from 'array' or jsonb_array_length(c->'itens') = 0 then
        raise exception 'Checklist da regra precisa de nome e itens' using errcode = '23514';
      end if;
    elsif t <> 'arquivar' or t is null then raise exception 'Ação desconhecida: %', coalesce(t, '(sem tipo)') using errcode = '23514';
    end if;
  end loop;
  return new;
end $$;
create trigger t_valida before insert or update on fluxo.automacoes for each row execute function fluxo.tg_automacao();

-- Regra com execuções não se apaga (o histórico fica): desliga.
create or replace function fluxo.tg_automacao_apagar()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from fluxo.automacao_execucoes where automacao_id = old.id) then
    raise exception 'A regra já rodou: desligue em vez de apagar' using errcode = 'P0001';
  end if;
  return old;
end $$;
create trigger t_apagar before delete on fluxo.automacoes for each row execute function fluxo.tg_automacao_apagar();

-- O dono ainda pode ter a regra: administrador (regra da empresa), quem edita (regra do quadro) ou quem edita o cartão (regra do cartão).
create or replace function fluxo._dono_vale(a fluxo.automacoes)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.membros m where m.empresa_id = a.empresa_id and m.user_id = a.dono_id
                 and case when a.quadro_id is null then m.administrador else m.papel in ('diretor','gestor','analista') end)
     and (a.tarefa_id is null or fluxo.nivel_cartao(fluxo.papel_tarefa(a.tarefa_id, a.dono_id)) >= 3) $$;

-- Condições da regra no cartão.
create or replace function fluxo._condicoes_ok(a fluxo.automacoes, k fluxo.tarefas)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare c jsonb; v fluxo.tarefa_campos; f fluxo.campos; t text; igual boolean;
begin
  for c in select * from jsonb_array_elements(a.condicoes) loop
    t := c->>'tipo';
    if t = 'lista' then
      if a.quadro_id is null then
        if not exists (select 1 from fluxo.listas l, jsonb_array_elements_text(c->'nomes') x where l.id = k.lista_id and lower(trim(l.nome)) = lower(trim(x))) then return false; end if;
      elsif not (c->'listas') ? k.lista_id::text then return false;
      end if;
    elsif t = 'etiqueta' then
      if exists (select 1 from fluxo.tarefa_etiquetas where tarefa_id = k.id and etiqueta_id = (c->>'etiqueta')::uuid) <> coalesce((c->>'tem')::boolean, true) then return false; end if;
    elsif t = 'prioridade' then
      if not (c->'valores') ? k.prioridade then return false; end if;
    elsif t = 'situacao' then
      if not ((k.concluida_em is null and (c->'valores') ? 'aberta')
              or (k.concluida_em is not null and (c->'valores') ? 'concluida')
              or ((c->'valores') ? 'atrasada' and k.concluida_em is null and k.prazo < current_date
                  and not exists (select 1 from fluxo.listas l where l.id = k.lista_id and l.tipo = 'pausa'))) then return false; end if;
    elsif t = 'campo' then
      select * into f from fluxo.campos where id = (c->>'campo')::uuid;
      select * into v from fluxo.tarefa_campos where tarefa_id = k.id and campo_id = f.id;
      if coalesce(c->>'op', 'igual') = 'vazio' then if v.tarefa_id is not null then return false; end if;
      elsif c->>'op' = 'preenchido' then if v.tarefa_id is null then return false; end if;
      elsif v.tarefa_id is null then return false;
      else
        igual := case f.tipo when 'texto' then lower(trim(v.texto)) = lower(trim(c->>'valor'))
                             when 'numero' then v.numero = (c->>'valor')::numeric
                             when 'data' then v.data = (c->>'valor')::date
                             when 'lista' then v.opcao_id = (c->>'valor')::uuid
                             else v.caixa = (c->>'valor')::boolean end;
        if not coalesce(igual, false) then return false; end if;
      end if;
    end if;
  end loop;
  return true;
end $$;

-- Gancho do aviso: fluxo não sabe como o app notifica; o app troca esta função (no BKM, app._notificar).
create or replace function fluxo._avisar(p_empresa uuid, p_para uuid, p_texto text, p_tarefa uuid, p_execucao uuid)
returns void language plpgsql security definer set search_path = '' as $$ begin null; end $$;

-- Faz as ações de uma regra num cartão e devolve o resumo.
create or replace function fluxo._acoes_automacao(a fluxo.automacoes, p_tarefa uuid, p_execucao uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare c jsonb; k fluxo.tarefas; t text; feito text[] := '{}'; v_lista uuid; nc uuid; u uuid; n int;
begin
  for c in select * from jsonb_array_elements(a.acoes) loop
    select * into k from fluxo.tarefas where id = p_tarefa;
    t := c->>'tipo';
    if t = 'avisar' then
      n := 0;
      for u in
        select distinct x from (
          select k.responsavel_id as x where (c->'para') ? 'responsavel'
          union all select k.solicitante_id where (c->'para') ? 'solicitante'
          union all select user_id from fluxo.tarefa_pessoas where tarefa_id = k.id and (
              (papel = 'executor' and (c->'para') ? 'executores') or (papel = 'aprovador' and (c->'para') ? 'aprovadores')
           or (papel = 'acompanha' and (c->'para') ? 'acompanham'))
          union all select m.superior_id from app.membros m where m.empresa_id = k.empresa_id and m.user_id = k.responsavel_id and (c->'para') ? 'gestor'
          union all select x::uuid from jsonb_array_elements_text(coalesce(c->'pessoas', '[]')) x
        ) d where x is not null and fluxo.papel_tarefa(k.id, x) is not null   -- só avisa quem vê o cartão
      loop
        perform fluxo._avisar(k.empresa_id, u, coalesce(nullif(trim(c->>'texto'), ''), a.nome) || ': ' || k.titulo, k.id, p_execucao);
        n := n + 1;
      end loop;
      feito := feito || ('avisou ' || n || case when n = 1 then ' pessoa' else ' pessoas' end);
    elsif t = 'mover' then
      v_lista := fluxo._lista_auto(k.quadro_id, (c->>'lista')::uuid, c->>'lista_nome');
      if v_lista is null then raise exception 'O quadro não tem a lista %', c->>'lista_nome' using errcode = 'P0002'; end if;
      if v_lista <> k.lista_id then
        update fluxo.tarefas set lista_id = v_lista, posicao = extract(epoch from clock_timestamp()) where id = k.id;
        feito := feito || ('moveu para ' || (select nome from fluxo.listas where id = v_lista));
      end if;
    elsif t = 'etiqueta' then
      if coalesce((c->>'por')::boolean, true) then
        insert into fluxo.tarefa_etiquetas (empresa_id, tarefa_id, etiqueta_id) values (k.empresa_id, k.id, (c->>'etiqueta')::uuid) on conflict do nothing;
        get diagnostics n = row_count;
        if n > 0 then feito := feito || ('pôs a etiqueta ' || (select nome from fluxo.etiquetas where id = (c->>'etiqueta')::uuid)); end if;
      else
        delete from fluxo.tarefa_etiquetas where tarefa_id = k.id and etiqueta_id = (c->>'etiqueta')::uuid;
        get diagnostics n = row_count;
        if n > 0 then feito := feito || ('tirou a etiqueta ' || (select nome from fluxo.etiquetas where id = (c->>'etiqueta')::uuid)); end if;
      end if;
    elsif t = 'responsavel' then
      if k.responsavel_id is distinct from (c->>'pessoa')::uuid then
        update fluxo.tarefas set responsavel_id = (c->>'pessoa')::uuid where id = k.id;
        feito := feito || ('trocou o responsável');
      end if;
    elsif t = 'prioridade' then
      if k.prioridade <> c->>'valor' then
        update fluxo.tarefas set prioridade = c->>'valor' where id = k.id;
        feito := feito || ('prioridade ' || (c->>'valor'));
      end if;
    elsif t = 'adiar' then
      if k.concluida_em is null then
        update fluxo.tarefas set prazo = fluxo.somar_dias(k.empresa_id, coalesce(k.prazo, current_date), (c->>'dias')::int) where id = k.id;
        feito := feito || ('adiou o prazo em ' || (c->>'dias') || ' dias');
      end if;
    elsif t = 'checklist' then
      insert into fluxo.checklists (empresa_id, tarefa_id, nome) values (k.empresa_id, k.id, trim(c->>'nome')) returning id into nc;
      insert into fluxo.checklist_itens (empresa_id, checklist_id, texto, posicao)
      select k.empresa_id, nc, trim(x), o from jsonb_array_elements_text(c->'itens') with ordinality as i(x, o) where trim(x) <> '';
      feito := feito || ('adicionou o checklist ' || trim(c->>'nome'));
    elsif t = 'arquivar' then
      if k.arquivada_em is null then
        update fluxo.tarefas set arquivada_em = now() where id = k.id;
        feito := feito || 'arquivou';
      end if;
    end if;
  end loop;
  return coalesce(nullif(array_to_string(feito, '; '), ''), 'nada a mudar');
end $$;

-- Roda uma regra num cartão: as ações não disparam outras regras; erro vira registro, sem desfazer o que a pessoa fez.
create or replace function fluxo._executar_automacao(a fluxo.automacoes, p_tarefa uuid, p_referencia date default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_exec uuid := gen_random_uuid(); v_det text; v_ant text := coalesce(current_setting('fluxo.automacao', true), '');
begin
  begin
    perform set_config('fluxo.automacao', '1', true);
    v_det := fluxo._acoes_automacao(a, p_tarefa, v_exec);
    perform set_config('fluxo.automacao', v_ant, true);
    insert into fluxo.automacao_execucoes (id, empresa_id, automacao_id, tarefa_id, gatilho, referencia, resultado, detalhe)
    values (v_exec, a.empresa_id, a.id, p_tarefa, a.gatilho, p_referencia, 'ok', v_det);
  exception when others then
    perform set_config('fluxo.automacao', v_ant, true);
    insert into fluxo.automacao_execucoes (empresa_id, automacao_id, tarefa_id, gatilho, referencia, resultado, detalhe)
    values (a.empresa_id, a.id, p_tarefa, a.gatilho, p_referencia, 'erro', sqlerrm);
  end;
end $$;

-- Procura as regras ligadas para o que aconteceu no cartão e roda as que passam nas condições.
-- p_lista, p_etiqueta, p_campo: o que o gatilho diz (lista em que entrou, etiqueta posta, campo mudado).
create or replace function fluxo.disparar_automacoes(p_tarefa uuid, p_gatilho text, p_lista uuid default null, p_etiqueta uuid default null,
  p_campo uuid default null, p_referencia date default null, p_etapa text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare k fluxo.tarefas; a fluxo.automacoes; n int := 0;
begin
  if coalesce(current_setting('fluxo.automacao', true), '') = '1' then return 0; end if;
  select * into k from fluxo.tarefas where id = p_tarefa;
  if k.id is null or k.modelo or k.arquivada_em is not null then return 0; end if;
  for a in select * from fluxo.automacoes x
           where x.empresa_id = k.empresa_id and x.ativa and x.gatilho = p_gatilho and (x.quadro_id is null or x.quadro_id = k.quadro_id)
             and (x.tarefa_id is null or x.tarefa_id = k.id)
             and (p_gatilho <> 'entrou_lista' or (x.gatilho_lista_id is null and x.gatilho_lista_nome is null) or x.gatilho_lista_id = p_lista
                  or lower(trim(x.gatilho_lista_nome)) = (select lower(trim(nome)) from fluxo.listas where id = p_lista))
             and (p_gatilho <> 'etiqueta' or x.gatilho_etiqueta_id is null or x.gatilho_etiqueta_id = p_etiqueta)
             and (p_gatilho <> 'campo' or x.gatilho_campo_id is null or x.gatilho_campo_id = p_campo)
             and (p_gatilho <> 'etapa' or x.gatilho_etapa is null or x.gatilho_etapa = p_etapa)
             and (p_referencia is null or not exists (select 1 from fluxo.automacao_execucoes e where e.automacao_id = x.id and e.tarefa_id = k.id and e.referencia = p_referencia))
           order by x.quadro_id is not null, x.tarefa_id is not null, x.criada_em loop   -- empresa, quadro, cartão
    -- dono que perdeu o direito não roda a regra; regra do quadro só toca o cartão que o dono vê
    continue when not fluxo._dono_vale(a) or (a.quadro_id is not null and fluxo.papel_tarefa(k.id, a.dono_id) is null);
    -- uma regra anterior pode ter arquivado o cartão ou mudado o que a condição olha
    select * into k from fluxo.tarefas where id = p_tarefa;
    exit when k.arquivada_em is not null;
    continue when not fluxo._condicoes_ok(a, k);
    perform fluxo._executar_automacao(a, p_tarefa, p_referencia);
    n := n + 1;
  end loop;
  return n;
end $$;

-- Gatilhos no cartão. Cartão criado nesta transação (criado_em = now()) só dispara "criada", no fim dela,
-- com tudo gravado: etiquetas, pessoas e campos de uma cópia ou de um modelo não contam como acréscimo.
create or replace function fluxo.tg_auto_tarefa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(current_setting('fluxo.automacao', true), '') = '1' then return null; end if;
  if tg_op = 'INSERT' then perform fluxo.disparar_automacoes(new.id, 'criada'); return null; end if;
  if new.criado_em = now() then return null; end if;
  if new.lista_id is distinct from old.lista_id then perform fluxo.disparar_automacoes(new.id, 'entrou_lista', new.lista_id); end if;
  if new.concluida_em is not null and old.concluida_em is null then perform fluxo.disparar_automacoes(new.id, 'concluida'); end if;
  return null;
end $$;
create constraint trigger t_auto_criada after insert on fluxo.tarefas deferrable initially deferred
  for each row execute function fluxo.tg_auto_tarefa();
create trigger t_auto after update of lista_id, concluida_em on fluxo.tarefas for each row execute function fluxo.tg_auto_tarefa();

create or replace function fluxo.tg_auto_filho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_tarefa uuid;
begin
  if coalesce(current_setting('fluxo.automacao', true), '') = '1' then return null; end if;
  if tg_table_name = 'checklist_itens' then v_tarefa := fluxo.tarefa_do_checklist(new.checklist_id);
  elsif tg_op = 'DELETE' then v_tarefa := old.tarefa_id;
  else v_tarefa := new.tarefa_id;
  end if;
  if (select criado_em from fluxo.tarefas where id = v_tarefa) = now() then return null; end if;
  if tg_table_name = 'tarefa_etiquetas' then
    perform fluxo.disparar_automacoes(v_tarefa, 'etiqueta', p_etiqueta => new.etiqueta_id);
  elsif tg_table_name = 'tarefa_campos' then
    if tg_op = 'DELETE' then perform fluxo.disparar_automacoes(v_tarefa, 'campo', p_campo => old.campo_id);
    elsif tg_op = 'INSERT' or new is distinct from old then perform fluxo.disparar_automacoes(v_tarefa, 'campo', p_campo => new.campo_id);
    end if;
  elsif new.concluido_em is not null and old.concluido_em is null
        and not exists (select 1 from fluxo.checklist_itens i join fluxo.checklists c on c.id = i.checklist_id
                        where c.tarefa_id = v_tarefa and i.concluido_em is null and i.virou_tarefa_id is null) then
    perform fluxo.disparar_automacoes(v_tarefa, 'checklist_completo');
  end if;
  return null;
end $$;
create trigger t_auto after insert on fluxo.tarefa_etiquetas for each row execute function fluxo.tg_auto_filho();
create trigger t_auto after insert or update or delete on fluxo.tarefa_campos for each row execute function fluxo.tg_auto_filho();
create trigger t_auto after update of concluido_em on fluxo.checklist_itens for each row execute function fluxo.tg_auto_filho();

-- Rotina diária: prazo vencendo em N dias (ou hoje) e prazo vencido, uma vez por prazo; pausada não conta.
create or replace function fluxo.automacoes_prazo(p_hoje date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select a.gatilho, k.id, k.prazo from fluxo.automacoes a
           join fluxo.tarefas k on k.empresa_id = a.empresa_id and (a.quadro_id is null or k.quadro_id = a.quadro_id)
                                and (a.tarefa_id is null or a.tarefa_id = k.id)
           where a.ativa and a.gatilho in ('prazo_antes','prazo_venceu') and k.prazo is not null
             and k.concluida_em is null and k.arquivada_em is null and not k.modelo
             and not exists (select 1 from fluxo.listas l where l.id = k.lista_id and l.tipo = 'pausa')
             and case a.gatilho when 'prazo_antes' then k.prazo >= p_hoje and k.prazo - a.gatilho_dias <= p_hoje else k.prazo < p_hoje end
           group by a.gatilho, k.id, k.prazo loop
    n := n + fluxo.disparar_automacoes(r.id, r.gatilho, p_referencia => r.prazo);
  end loop;
  return n;
end $$;

-- A regra agendada roda hoje? Mensal no dia 31 roda no último dia dos meses mais curtos.
create or replace function fluxo.agenda_hoje(p_freq text, p_dias int[], p_hoje date)
returns boolean language sql immutable set search_path = '' as $$
  select case p_freq
    when 'diaria' then true
    when 'semanal' then extract(dow from p_hoje)::int = any (p_dias)
    when 'mensal' then extract(day from p_hoje)::int = any (p_dias)
                       or (p_hoje = (date_trunc('month', p_hoje) + interval '1 month - 1 day')::date
                           and exists (select 1 from unnest(p_dias) d where d > extract(day from p_hoje)))
    else false end $$;

-- Rotina diária: regras agendadas para hoje, em cada cartão do escopo que passa nas condições, uma vez por dia.
create or replace function fluxo.automacoes_agenda(p_hoje date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare a fluxo.automacoes; k fluxo.tarefas; n int := 0;
begin
  for a in select * from fluxo.automacoes x where x.ativa and x.gatilho = 'agenda' and fluxo.agenda_hoje(x.agenda_freq, x.agenda_dias, p_hoje)
           order by x.quadro_id is not null, x.tarefa_id is not null, x.criada_em loop
    continue when not fluxo._dono_vale(a);
    for k in select * from fluxo.tarefas t
             where t.empresa_id = a.empresa_id and (a.quadro_id is null or t.quadro_id = a.quadro_id) and (a.tarefa_id is null or t.id = a.tarefa_id)
               and not t.modelo and t.arquivada_em is null
               and not exists (select 1 from fluxo.automacao_execucoes e where e.automacao_id = a.id and e.tarefa_id = t.id and e.referencia = p_hoje)
             order by t.criado_em loop
      -- uma regra anterior pode ter arquivado ou mudado o cartão
      select * into k from fluxo.tarefas where id = k.id;
      continue when k.arquivada_em is not null;
      continue when a.quadro_id is not null and fluxo.papel_tarefa(k.id, a.dono_id) is null;
      continue when not fluxo._condicoes_ok(a, k);
      perform fluxo._executar_automacao(a, k.id, p_hoje);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;

-- Botões do cartão: os que valem para ele (escopo, ligado, dono com direito e condições). Quem não edita o cartão não vê botão.
create or replace function fluxo.botoes_cartao(p_tarefa uuid)
returns table (id uuid, nome text, escopo text) language plpgsql stable security definer set search_path = '' as $$
declare k fluxo.tarefas;
begin
  select * into k from fluxo.tarefas where tarefas.id = p_tarefa;
  if k.id is null or k.modelo or k.arquivada_em is not null or fluxo.nivel_cartao(fluxo.papel_tarefa(k.id)) < 3 then return; end if;
  return query
    select a.id, a.nome, case when a.tarefa_id is not null then 'cartao' when a.quadro_id is not null then 'quadro' else 'empresa' end
    from fluxo.automacoes a
    where a.empresa_id = k.empresa_id and a.ativa and a.gatilho = 'botao'
      and (a.quadro_id is null or a.quadro_id = k.quadro_id) and (a.tarefa_id is null or a.tarefa_id = k.id)
      and fluxo._dono_vale(a) and (a.quadro_id is null or fluxo.papel_tarefa(k.id, a.dono_id) is not null)
      and fluxo._condicoes_ok(a, k)
    order by a.quadro_id is not null, a.tarefa_id is not null, a.nome;
end $$;

-- Aperta um botão no cartão: quem aperta edita o cartão; as ações rodam como numa regra (sem disparar outras) e ficam registradas.
create or replace function fluxo.apertar_botao(p_botao uuid, p_tarefa uuid)
returns fluxo.automacao_execucoes language plpgsql security definer set search_path = '' as $$
declare a fluxo.automacoes; k fluxo.tarefas; e fluxo.automacao_execucoes;
begin
  select * into a from fluxo.automacoes where id = p_botao;
  select * into k from fluxo.tarefas where id = p_tarefa;
  if a.id is null or a.gatilho <> 'botao' or k.id is null or a.empresa_id <> k.empresa_id then
    raise exception 'Botão não encontrado' using errcode = 'P0002';
  end if;
  if fluxo.nivel_cartao(fluxo.papel_tarefa(k.id)) < 3 then raise exception 'Só quem edita o cartão aperta o botão' using errcode = '42501'; end if;
  if not exists (select 1 from fluxo.botoes_cartao(k.id) x where x.id = p_botao) then
    raise exception 'Este botão não vale para este cartão' using errcode = 'P0001';
  end if;
  perform fluxo._executar_automacao(a, k.id);
  select * into e from fluxo.automacao_execucoes where automacao_id = a.id and tarefa_id = k.id order by em desc limit 1;
  return e;
end $$;

alter table fluxo.automacoes enable row level security;
alter table fluxo.automacao_execucoes enable row level security;
create policy ver on fluxo.automacoes for select to authenticated
  using (empresa_id in (select app.minhas_empresas())
         and (quadro_id is null or fluxo.ve_objeto((select objeto_tipo from fluxo.quadros q where q.id = quadro_id), (select objeto_id from fluxo.quadros q where q.id = quadro_id)))
         and (tarefa_id is null or fluxo.papel_tarefa(tarefa_id) is not null));
create policy inserir on fluxo.automacoes for insert to authenticated
  with check (dono_id = auth.uid() and case when quadro_id is null then app.eh_administrador(empresa_id)
              else empresa_id in (select app.empresas_edicao())
                   and fluxo.ve_objeto((select objeto_tipo from fluxo.quadros q where q.id = quadro_id), (select objeto_id from fluxo.quadros q where q.id = quadro_id))
                   and (tarefa_id is null or fluxo.edita_tarefa(tarefa_id)) end);
create policy alterar on fluxo.automacoes for update to authenticated
  using ((dono_id = auth.uid() and (quadro_id is not null or app.eh_administrador(empresa_id)) and empresa_id in (select app.empresas_edicao()))
         or app.eh_administrador(empresa_id))
  with check ((dono_id = auth.uid() and (quadro_id is not null or app.eh_administrador(empresa_id)) and empresa_id in (select app.empresas_edicao()))
         or app.eh_administrador(empresa_id));
create policy remover on fluxo.automacoes for delete to authenticated
  using ((dono_id = auth.uid() and empresa_id in (select app.empresas_edicao())) or app.eh_administrador(empresa_id));
create policy ver on fluxo.automacao_execucoes for select to authenticated
  using (fluxo.papel_tarefa(tarefa_id) is not null or app.eh_administrador(empresa_id)
         or exists (select 1 from fluxo.automacoes a where a.id = automacao_id and a.dono_id = auth.uid()));
create trigger t_aud after insert or update or delete on fluxo.automacoes for each row execute function app.tg_auditoria();
grant select, insert, update, delete on fluxo.automacoes to authenticated;
grant select on fluxo.automacao_execucoes to authenticated;
revoke execute on function fluxo.automacoes_agenda(date) from public;
grant execute on function fluxo.botoes_cartao(uuid), fluxo.apertar_botao(uuid, uuid) to authenticated;
revoke execute on function fluxo.disparar_automacoes(uuid, text, uuid, uuid, uuid, date, text), fluxo.automacoes_prazo(date),
  fluxo._executar_automacao(fluxo.automacoes, uuid, date), fluxo._acoes_automacao(fluxo.automacoes, uuid, uuid),
  fluxo._avisar(uuid, uuid, text, uuid, uuid) from public;

-- Regras de um cartão vão para outro (cópia e ocorrência de série). No mesmo
-- quadro, as listas são as mesmas; em outro, pelo nome, e a regra cuja lista
-- não existe lá fica de fora. p_dono vazio = mantém o dono de cada regra, que
-- precisa editar o cartão novo.
create or replace function fluxo._copiar_automacoes(p_de uuid, p_para uuid, p_dono uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare kd fluxo.tarefas; kp fluxo.tarefas; a fluxo.automacoes; m jsonb; c jsonb; cs jsonb; ac jsonb; v_lista uuid; ok boolean; n int := 0;
begin
  -- chamada por uma pessoa (Copiar): ela é a dona das regras novas e precisa ver o cartão de origem
  if auth.uid() is not null then
    p_dono := auth.uid();
    if fluxo.papel_tarefa(p_de) is null then raise exception 'Sem acesso ao cartão de origem' using errcode = '42501'; end if;
  end if;
  select * into kd from fluxo.tarefas where id = p_de;
  select * into kp from fluxo.tarefas where id = p_para;
  select coalesce(jsonb_object_agg(o.id, case when kd.quadro_id = kp.quadro_id then o.id else fluxo._lista_auto(kp.quadro_id, null, o.nome) end), '{}')
  into m from fluxo.listas o where o.quadro_id = kd.quadro_id;
  for a in select * from fluxo.automacoes where tarefa_id = p_de order by criada_em loop
    continue when fluxo.nivel_cartao(fluxo.papel_tarefa(p_para, coalesce(p_dono, a.dono_id))) < 3;
    ok := true;
    v_lista := (m->>a.gatilho_lista_id::text)::uuid;
    if a.gatilho_lista_id is not null and v_lista is null then ok := false; end if;
    cs := '[]';
    for c in select * from jsonb_array_elements(a.condicoes) loop
      if c->>'tipo' = 'lista' then
        if exists (select 1 from jsonb_array_elements_text(c->'listas') x where m->>x is null) then ok := false; end if;
        c := jsonb_set(c, '{listas}', coalesce((select jsonb_agg(m->x) from jsonb_array_elements_text(c->'listas') x), '[]'));
      end if;
      cs := cs || jsonb_build_array(c);
    end loop;
    ac := '[]';
    for c in select * from jsonb_array_elements(a.acoes) loop
      if c->>'tipo' = 'mover' then
        if m->>(c->>'lista') is null then ok := false; else c := jsonb_set(c, '{lista}', m->(c->>'lista')); end if;
      end if;
      ac := ac || jsonb_build_array(c);
    end loop;
    continue when not ok;
    insert into fluxo.automacoes (empresa_id, tarefa_id, nome, gatilho, gatilho_lista_id, gatilho_etiqueta_id, gatilho_campo_id, gatilho_dias,
                                  agenda_freq, agenda_dias, condicoes, acoes, ativa, dono_id)
    values (kp.empresa_id, p_para, a.nome, a.gatilho, v_lista, a.gatilho_etiqueta_id, a.gatilho_campo_id, a.gatilho_dias,
            a.agenda_freq, a.agenda_dias, cs, ac, a.ativa, coalesce(p_dono, a.dono_id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function fluxo._copiar_automacoes(uuid, uuid, uuid) from public;
grant execute on function fluxo._copiar_automacoes(uuid, uuid, uuid) to authenticated;   -- Copiar roda com os direitos de quem copia

-- =====================================================================
-- Subtarefas (30/out/2026): a tarefa mãe fica no mesmo quadro e tem um
-- nível só (subtarefa não tem subtarefa). Com a regra do checklist ligada,
-- a mãe não conclui com subtarefa em aberto (fluxo.pendencias_conclusao).
-- =====================================================================
create or replace function fluxo.tg_subtarefa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m fluxo.tarefas;
begin
  if new.mae_id is null or (tg_op = 'UPDATE' and new.mae_id is not distinct from old.mae_id) then return new; end if;
  select * into m from fluxo.tarefas where id = new.mae_id;
  if m.id is null or m.quadro_id <> new.quadro_id then raise exception 'A tarefa mãe tem que ser do mesmo quadro' using errcode = '23514'; end if;
  if m.id = new.id then raise exception 'A tarefa não é mãe de si mesma' using errcode = '23514'; end if;
  if m.mae_id is not null then raise exception 'Subtarefa não tem subtarefa: um nível só' using errcode = '23514'; end if;
  if tg_op = 'UPDATE' and exists (select 1 from fluxo.tarefas where mae_id = new.id) then
    raise exception 'Tarefa com subtarefas não vira subtarefa' using errcode = '23514';
  end if;
  if m.modelo <> new.modelo then raise exception 'Modelo de cartão e tarefa não se misturam como mãe e subtarefa' using errcode = '23514'; end if;
  return new;
end $$;
create trigger t_subtarefa before insert or update of mae_id, quadro_id on fluxo.tarefas for each row execute function fluxo.tg_subtarefa();
create index on fluxo.tarefas (mae_id) where mae_id is not null;
