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
  virou_tarefa_id uuid references fluxo.tarefas(id)   -- item convertido em cartão
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
declare v_tipo text; v_pend text[]; v_mudou_lista boolean := tg_op = 'INSERT' or new.lista_id is distinct from old.lista_id;
begin
  if not v_mudou_lista and tg_op = 'UPDATE' and (new.concluida_em is null) <> (old.concluida_em is null) then
    select id into new.lista_id from fluxo.listas
    where quadro_id = new.quadro_id and tipo = case when new.concluida_em is null then 'aberta' else 'conclui' end and not oculta
    order by posicao limit 1;
    if new.lista_id is null then raise exception 'O quadro não tem lista para isso' using errcode = '23514'; end if;
    new.posicao := extract(epoch from clock_timestamp());
  end if;
  select tipo into v_tipo from fluxo.listas where id = new.lista_id;
  if v_tipo = 'conclui' and (new.concluida_em is null or tg_op = 'INSERT' or old.concluida_em is null) then
    -- bloqueio de conclusão (bloco 3): aprovação e checklist; a aprovação conclui por conta própria
    if tg_op = 'UPDATE' and coalesce(current_setting('fluxo.aprovando', true), '') <> '1' then
      v_pend := fluxo.pendencias_conclusao(new.id);
      if 'aprovacao' = any (v_pend) then
        raise exception 'A tarefa precisa ser aprovada antes de concluir' using errcode = '23514';
      elsif 'checklist' = any (v_pend) then
        raise exception 'Conclua os itens do checklist antes de concluir a tarefa' using errcode = '23514';
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
  perform app.exigir_editor(i.empresa_id);
  if i.virou_tarefa_id is not null then return i.virou_tarefa_id; end if;
  select t.* into k from fluxo.tarefas t join fluxo.checklists c on c.tarefa_id = t.id where c.id = i.checklist_id;
  insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, responsavel_id, prazo, processo_id, etapa, subetapa)
  values (k.empresa_id, k.quadro_id,
          (select id from fluxo.listas where quadro_id = k.quadro_id and tipo = 'aberta' and not oculta order by posicao limit 1),
          i.texto, 'Veio do checklist de ' || k.codigo || ' · ' || k.titulo, i.responsavel_id, i.prazo, k.processo_id, k.etapa, k.subetapa)
  returning id into v;
  insert into fluxo.anexos (empresa_id, tarefa_id, tipo, nome, tarefa_ref_id) values (k.empresa_id, v, 'tarefa', k.codigo || ' · ' || k.titulo, k.id);
  update fluxo.checklist_itens set virou_tarefa_id = v, concluido_em = coalesce(concluido_em, now()) where id = p_item;
  return v;
end $$;

-- Cartão com o atraso calculado e o andamento do checklist (base das telas).
create view fluxo.v_tarefas with (security_invoker = true) as
select k.*, l.nome as lista_nome, l.tipo as lista_tipo, q.objeto_tipo, q.objeto_id,
       (k.concluida_em is null and k.arquivada_em is null and k.prazo < current_date) as atrasada,
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
  checklists          jsonb not null default '[]',      -- [{nome, itens: [texto]}]
  aprovacao_modo      text not null default 'paralelo' check (aprovacao_modo in ('paralelo','sequencia')),
  check (not (responsavel_objeto and responsavel_id is not null)),
  check (jsonb_typeof(pessoas) = 'array' and jsonb_typeof(checklists) = 'array')
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
declare j jsonb := to_jsonb(new);
begin
  if (select empresa_id from fluxo.modelos_quadro where id = new.modelo_id) is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do modelo' using errcode = '42501';
  end if;
  if j ? 'predecessora_id' and (select count(*) from fluxo.modelo_tarefas where id in ((j->>'predecessora_id')::uuid, (j->>'sucessora_id')::uuid) and modelo_id = new.modelo_id) <> 2 then
    raise exception 'Vínculo entre tarefas de outro modelo' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_modelo before insert or update on fluxo.modelo_tarefas for each row execute function fluxo.tg_modelo_filho();
create trigger t_modelo before insert or update on fluxo.modelo_vinculos for each row execute function fluxo.tg_modelo_filho();

-- Cria os cartões do modelo no quadro (sem conferir permissão: uso interno).
create or replace function fluxo.aplicar_modelo_interno(p_modelo uuid, p_quadro uuid, p_data date, p_resp_objeto uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare m fluxo.modelos_quadro; t fluxo.modelo_tarefas; v_emp uuid; v_lista uuid; v_ini date; v_id uuid; v_n int := 0; mapa jsonb := '{}'; p jsonb; c jsonb; v_ck uuid; x text; v_user uuid; v_ord int;
begin
  select * into m from fluxo.modelos_quadro where id = p_modelo and ativo;
  select empresa_id into v_emp from fluxo.quadros where id = p_quadro;
  if m.id is null or v_emp is distinct from m.empresa_id then raise exception 'Modelo não encontrado nesta empresa' using errcode = 'P0002'; end if;
  for t in select * from fluxo.modelo_tarefas where modelo_id = p_modelo order by ordem, titulo loop
    select id into v_lista from fluxo.listas where quadro_id = p_quadro and nome = t.lista_nome and not oculta;
    if v_lista is null then
      select id into v_lista from fluxo.listas where quadro_id = p_quadro and tipo = 'aberta' and not oculta order by posicao limit 1;
    end if;
    v_ini := case when t.inicio_dias is not null then fluxo.somar_dias(v_emp, p_data, t.inicio_dias) end;
    insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, prioridade, aprovacao_modo, inicio, prazo, responsavel_id, posicao)
    values (v_emp, p_quadro, v_lista, t.titulo, t.descricao, t.prioridade, t.aprovacao_modo, v_ini,
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
      for x in select jsonb_array_elements_text(coalesce(c->'itens', '[]')) loop
        insert into fluxo.checklist_itens (empresa_id, checklist_id, texto) values (v_emp, v_ck, x);
      end loop;
    end loop;
    v_n := v_n + 1;
  end loop;
  insert into fluxo.vinculos (empresa_id, predecessora_id, sucessora_id, tipo, defasagem)
  select v_emp, (mapa->>v.predecessora_id::text)::uuid, (mapa->>v.sucessora_id::text)::uuid, v.tipo, v.defasagem
  from fluxo.modelo_vinculos v where v.modelo_id = p_modelo;
  return v_n;
end $$;

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
  select min(inicio) into v_base from fluxo.tarefas where quadro_id = p_quadro and arquivada_em is null and concluida_em is null;
  for k in select t.*, l.nome as lista_nome from fluxo.tarefas t join fluxo.listas l on l.id = t.lista_id
           where t.quadro_id = p_quadro and t.arquivada_em is null and t.concluida_em is null order by t.inicio nulls last, t.posicao loop
    insert into fluxo.modelo_tarefas (empresa_id, modelo_id, ordem, titulo, descricao, lista_nome, prioridade, inicio_dias, duracao,
                                      responsavel_id, responsavel_objeto, pessoas, etiquetas, checklists, aprovacao_modo)
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
                        coalesce((select jsonb_agg(i.texto order by i.posicao) from fluxo.checklist_itens i where i.checklist_id = c.id), '[]')) order by c.posicao)
                      from fluxo.checklists c where c.tarefa_id = k.id), '[]'), k.aprovacao_modo)
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
revoke all on function fluxo.aplicar_modelo_interno(uuid, uuid, date, uuid), fluxo.aplicar_padrao(uuid, uuid) from public;
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
  conclui_exige_checklist boolean not null default true
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

-- O que impede concluir: 'aprovacao' e/ou 'checklist'
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
  perform app.exigir_editor(k.empresa_id);
  if k.arquivada_em is not null or k.concluida_em is not null then raise exception 'A tarefa já está concluída ou arquivada' using errcode = '23514'; end if;
  if not exists (select 1 from fluxo.tarefa_pessoas where tarefa_id = p_tarefa and papel = 'aprovador') then
    raise exception 'A tarefa não tem aprovador' using errcode = '23514';
  end if;
  if 'checklist' = any (fluxo.pendencias_conclusao(p_tarefa)) then
    raise exception 'Conclua os itens do checklist antes de pedir a aprovação' using errcode = '23514';
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
  perform app.exigir_editor(a.empresa_id);
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
