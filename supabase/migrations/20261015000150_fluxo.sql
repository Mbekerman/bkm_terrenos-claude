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
declare v_tipo text; v_mudou_lista boolean := tg_op = 'INSERT' or new.lista_id is distinct from old.lista_id;
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
    new.concluida_em := coalesce(new.concluida_em, now()); new.concluida_por := auth.uid();
  elsif v_tipo <> 'conclui' then
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
