-- =====================================================================
-- BKM Terrenos · 0007 · notificações e lembretes
-- Uma tabela genérica de notificações; os gatilhos ficam separados dela.
-- Na hora: triggers e RPCs (tarefa atribuída, marcado na tarefa, aprovação).
-- Por prazo: app.rotina_diaria(), rodada uma vez por dia pelo pg_cron.
-- Um tipo novo de interação só acrescenta um gatilho e uma linha em
-- tipos_notificacao. E-mail e preferências por usuário vêm depois.
-- =====================================================================

-- Configuração por empresa (empresa_id nulo = modelo padrão, copiado para
-- cada empresa nova). dias_antes_padrao: lembretes criados com o item.
create table app.tipos_notificacao (
  empresa_id        uuid references app.empresas(id) on delete cascade,
  codigo            text not null,
  nome              text not null,
  ativo             boolean not null default true,
  dias_antes_padrao int[] not null default '{}' check (0 <= all(dias_antes_padrao) and 365 >= all(dias_antes_padrao)),
  unique nulls not distinct (empresa_id, codigo)
);

insert into app.tipos_notificacao (codigo, nome, dias_antes_padrao) values
  ('tarefa_atribuida',   'Tarefa atribuída a você',          '{}'),
  ('tarefa_marcado',     'Você foi marcado numa tarefa',     '{}'),
  ('tarefa_prazo',       'Prazo de tarefa',                  '{0}'),     -- 0 = no dia: "vence hoje"
  ('tarefa_atrasada',    'Tarefa atrasada',                  '{}'),
  ('stand_by_retomar',   'Retomar negociação em stand by',   '{7,0}'),
  ('subetapa_prazo',     'Subetapa com prazo estourado',     '{}'),
  ('documento_vencendo', 'Documento vencendo',               '{30,7}'),
  ('reuniao_agendada',   'Reunião agendada',                 '{1}'),
  ('aprovacao_pendente', 'Aprovação pendente',               '{}'),
  ('aprovacao_decidida', 'Seu pedido de aprovação foi decidido', '{}');

create table app.notificacoes (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  destinatario_id uuid not null references auth.users(id),
  tipo           text not null,
  texto          text not null,
  autor_id       uuid references auth.users(id),
  terreno_id     uuid references app.terrenos(id) on delete cascade,
  origem_tabela  text not null,      -- tarefas, processos, documentos, reunioes, aprovacoes...
  origem_id      uuid not null,
  referencia     date not null,      -- data que motivou o aviso (dia, prazo, vencimento)
  criada_em      timestamptz not null default clock_timestamp(),
  lida_em        timestamptz,
  -- a rotina diária pode rodar de novo sem repetir o aviso
  unique (tipo, origem_tabela, origem_id, destinatario_id, referencia)
);
create index on app.notificacoes (destinatario_id, criada_em desc);
create index on app.notificacoes (destinatario_id) where lida_em is null;

-- Lembretes com antecedência para todo item com data futura: prazo de
-- tarefa, retomada do stand by, vencimento de documento, reunião agendada.
-- Destinatário nulo = o responsável do item. enviado_para guarda a data do
-- item já avisada: se a data mudar, o lembrete volta a valer.
create table app.lembretes (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  origem_tabela   text not null check (origem_tabela in ('tarefas','processos','documentos','reunioes')),
  origem_id       uuid not null,
  dias_antes      int  not null check (dias_antes between 0 and 365),
  destinatario_id uuid references auth.users(id),
  enviado_para    date,
  enviado_em      timestamptz,
  criado_por      uuid default auth.uid(),
  criado_em       timestamptz not null default now(),
  unique nulls not distinct (origem_tabela, origem_id, dias_antes, destinatario_id)
);
create index on app.lembretes (origem_tabela, origem_id);

-- Pessoas marcadas numa tarefa (a menção com @ em comentários usa a mesma notificação).
create table app.tarefa_marcados (
  tarefa_id  uuid not null references app.tarefas(id) on delete cascade,
  user_id    uuid not null references auth.users(id),
  empresa_id uuid not null references app.empresas(id),
  marcado_por uuid default auth.uid(),
  criado_em  timestamptz not null default now(),
  primary key (tarefa_id, user_id)
);

-- ---------------------------------------------------------------------
-- Funções internas
-- ---------------------------------------------------------------------
-- Cria a notificação (ou nada: tipo desligado, sem destinatário, avisar a si mesmo, repetida).
create or replace function app._notificar(
  p_empresa uuid, p_destinatario uuid, p_fase text, p_texto text, p_terreno uuid,
  p_origem_tabela text, p_origem_id uuid, p_referencia date default current_date, p_autor uuid default auth.uid())
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_destinatario is null or p_destinatario is not distinct from p_autor then return; end if;
  if not exists (select 1 from app.membros where empresa_id = p_empresa and user_id = p_destinatario) then return; end if;
  if not coalesce((select ativo from app.tipos_notificacao where empresa_id = p_empresa and codigo = p_fase), false) then return; end if;
  insert into app.notificacoes (empresa_id, destinatario_id, tipo, texto, autor_id, terreno_id, origem_tabela, origem_id, referencia)
  values (p_empresa, p_destinatario, p_fase, p_texto, p_autor, p_terreno, p_origem_tabela, p_origem_id, coalesce(p_referencia, current_date))
  on conflict do nothing;
end $$;

-- Lembretes padrão do tipo para um item, se ele ainda não tiver nenhum.
create or replace function app._lembretes_padrao(p_empresa uuid, p_origem_tabela text, p_origem_id uuid, p_fase text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from app.lembretes where origem_tabela = p_origem_tabela and origem_id = p_origem_id) then return; end if;
  insert into app.lembretes (empresa_id, origem_tabela, origem_id, dias_antes)
  select p_empresa, p_origem_tabela, p_origem_id, d
  from app.tipos_notificacao t, unnest(t.dias_antes_padrao) d
  where t.empresa_id = p_empresa and t.codigo = p_fase and t.ativo
  on conflict do nothing;
end $$;

-- Data, responsável e texto do item de um lembrete (null = não há o que lembrar).
create or replace function app._item_lembrete(p_origem_tabela text, p_origem_id uuid)
returns table (empresa_id uuid, terreno_id uuid, tipo text, data date, responsavel uuid, titulo text)
language sql stable security definer set search_path = ''
as $$
  select k.empresa_id, k.terreno_id, 'tarefa_prazo', k.prazo, k.responsavel_id, 'Tarefa "' || k.titulo || '"'
  from app.tarefas k where p_origem_tabela = 'tarefas' and k.id = p_origem_id and k.status not in ('concluida','cancelada')
  union all
  select p.empresa_id, p.terreno_id, 'stand_by_retomar', p.retomar_em, p.responsavel_id, 'Retomar ' || p.codigo || ' (' || t.nome || ')'
  from app.processos p join app.terrenos t on t.id = p.terreno_id
  where p_origem_tabela = 'processos' and p.id = p_origem_id and p.status = 'stand_by'
  union all
  select d.empresa_id, d.terreno_id, 'documento_vencendo', d.emitido_em + td.validade_dias,
         coalesce(p.responsavel_id, t.responsavel_id), td.nome || ' de ' || t.nome
  from app.documentos d join app.tipos_documento td on td.codigo = d.tipo_documento
  join app.terrenos t on t.id = d.terreno_id left join app.processos p on p.id = d.processo_id
  where p_origem_tabela = 'documentos' and d.id = p_origem_id and d.situacao <> 'rejeitado' and td.validade_dias is not null
  union all
  select m.empresa_id, m.terreno_id, 'reuniao_agendada', m.inicio::date,
         coalesce(p.responsavel_id, t.responsavel_id, m.criado_por), 'Reunião sobre ' || t.nome
  from app.reunioes m join app.terrenos t on t.id = m.terreno_id left join app.processos p on p.id = m.processo_id
  where p_origem_tabela = 'reunioes' and m.id = p_origem_id and m.status = 'agendada'
$$;

-- ---------------------------------------------------------------------
-- Gatilhos na hora
-- ---------------------------------------------------------------------
create or replace function app.tg_tarefa_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    perform app._notificar(new.empresa_id, new.responsavel_id, 'tarefa_atribuida', 'Tarefa para você: ' || new.titulo,
                           new.terreno_id, 'tarefas', new.id);
  end if;
  if tg_op = 'INSERT' then perform app._lembretes_padrao(new.empresa_id, 'tarefas', new.id, 'tarefa_prazo'); end if;
  return new;
end $$;
create trigger t_notificar after insert or update of responsavel_id on app.tarefas for each row execute function app.tg_tarefa_notificar();

create or replace function app.tg_marcado_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare k app.tarefas;
begin
  select * into k from app.tarefas where id = new.tarefa_id;
  if k.empresa_id is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  if not exists (select 1 from app.membros where empresa_id = new.empresa_id and user_id = new.user_id) then
    raise exception 'Só membros da empresa podem ser marcados' using errcode = '23514';
  end if;
  perform app._notificar(k.empresa_id, new.user_id, 'tarefa_marcado', 'Você foi marcado na tarefa: ' || k.titulo, k.terreno_id, 'tarefas', k.id);
  return new;
end $$;
create trigger t_notificar before insert on app.tarefa_marcados for each row execute function app.tg_marcado_notificar();

create or replace function app.tg_reuniao_lembretes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status = 'agendada' then perform app._lembretes_padrao(new.empresa_id, 'reunioes', new.id, 'reuniao_agendada'); end if;
  return new;
end $$;
create trigger t_lembretes after insert or update of status on app.reunioes for each row execute function app.tg_reuniao_lembretes();

create or replace function app.tg_documento_lembretes()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from app.tipos_documento where codigo = new.tipo_documento and validade_dias is not null) then
    perform app._lembretes_padrao(new.empresa_id, 'documentos', new.id, 'documento_vencendo');
  end if;
  return new;
end $$;
create trigger t_lembretes after insert on app.documentos for each row execute function app.tg_documento_lembretes();

-- Lembrete gravado à mão: o item tem que ser da mesma empresa; destinatário, membro dela.
create or replace function app.tg_lembrete_valido()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v uuid;
begin
  execute format('select empresa_id from app.%I where id = $1', new.origem_tabela) into v using new.origem_id;
  if v is distinct from new.empresa_id then raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501'; end if;
  if new.destinatario_id is not null and not exists (select 1 from app.membros where empresa_id = new.empresa_id and user_id = new.destinatario_id) then
    raise exception 'O destinatário tem que ser da empresa' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and (new.origem_tabela, new.origem_id) is distinct from (old.origem_tabela, old.origem_id) then
    raise exception 'Um lembrete não muda de item' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_valido before insert or update on app.lembretes for each row execute function app.tg_lembrete_valido();

-- ---------------------------------------------------------------------
-- Rotina diária (pg_cron). p_hoje permite testar outro dia.
-- ---------------------------------------------------------------------
create or replace function app.rotina_diaria(p_hoje date default current_date)
returns int
language plpgsql security definer set search_path = ''
as $$
declare r record; n int; total int := 0;
begin
  -- lembretes com antecedência (inclui "vence hoje" com 0 dias)
  for r in select l.id as lembrete_id, l.origem_tabela, l.origem_id, l.dias_antes, coalesce(l.destinatario_id, x.responsavel) as dest, x.*
           from app.lembretes l cross join lateral app._item_lembrete(l.origem_tabela, l.origem_id) x
           where x.data is not null and x.data >= p_hoje and x.data - l.dias_antes <= p_hoje
             and l.enviado_para is distinct from x.data loop
    perform app._notificar(r.empresa_id, r.dest, r.tipo,
      r.titulo || case when r.data = p_hoje then ': hoje' when r.data = p_hoje + 1 then ': amanhã'
                       else ': em ' || (r.data - p_hoje) || ' dias (' || to_char(r.data, 'DD/MM') || ')' end,
      r.terreno_id, r.origem_tabela, r.origem_id, r.data - r.dias_antes, null);
    update app.lembretes set enviado_para = r.data, enviado_em = now() where id = r.lembrete_id;
    total := total + 1;
  end loop;

  -- tarefa atrasada: uma vez, no primeiro dia de atraso (ou quando a rotina vir)
  for r in select * from app.tarefas k where k.status not in ('concluida','cancelada') and k.prazo < p_hoje and k.responsavel_id is not null loop
    perform app._notificar(r.empresa_id, r.responsavel_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || r.titulo, r.terreno_id, 'tarefas', r.id, r.prazo, null);
    get diagnostics n = row_count; total := total + n;
  end loop;

  -- subetapa com prazo estourado: uma vez por entrada na subetapa
  for r in select p.*, s.nome as sub_nome, s.prazo_dias, t.nome as terreno_nome
           from app.processos p
           join app.subetapas_modelo s on s.empresa_id = p.empresa_id and s.fase = p.fase and s.codigo = p.subetapa_atual
           join app.terrenos t on t.id = p.terreno_id
           where p.status = 'ativo' and s.prazo_dias is not null and p.subetapa_desde::date + s.prazo_dias < p_hoje loop
    perform app._notificar(r.empresa_id, r.responsavel_id, 'subetapa_prazo',
      r.terreno_nome || ': ' || r.sub_nome || ' passou do prazo de ' || r.prazo_dias || ' dias',
      r.terreno_id, 'processos', r.id, r.subetapa_desde::date + r.prazo_dias, null);
  end loop;
  return total;
end $$;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
-- Marca uma notificação (ou todas, com p_id nulo) como lida.
create or replace function app.marcar_notificacao_lida(p_id uuid default null)
returns int
language plpgsql security definer set search_path = ''
as $$
declare n int;
begin
  if auth.uid() is null then raise exception 'Faça login primeiro' using errcode = '42501'; end if;
  update app.notificacoes set lida_em = now()
   where destinatario_id = auth.uid() and lida_em is null and (p_id is null or id = p_id);
  get diagnostics n = row_count;
  return n;
end $$;

-- Administrador liga/desliga um tipo e define os lembretes padrão.
create or replace function app.configurar_notificacao(p_empresa uuid, p_codigo text, p_ativo boolean default null, p_dias_antes int[] default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  update app.tipos_notificacao set ativo = coalesce(p_ativo, ativo),
         dias_antes_padrao = coalesce((select array_agg(distinct d order by d desc) from unnest(p_dias_antes) d), dias_antes_padrao)
   where empresa_id = p_empresa and codigo = p_codigo;
  if not found then raise exception 'Tipo de notificação não encontrado' using errcode = 'P0002'; end if;
end $$;

-- ---------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------
alter table app.tipos_notificacao enable row level security;
create policy ver on app.tipos_notificacao for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.tipos_notificacao to authenticated;
create trigger t_aud after insert or update or delete on app.tipos_notificacao for each row execute function app.tg_auditoria();

-- cada um vê só as suas; criadas só pelo banco
alter table app.notificacoes enable row level security;
create policy ver on app.notificacoes for select to authenticated
  using (destinatario_id = auth.uid() and empresa_id in (select app.minhas_empresas()));
grant select on app.notificacoes to authenticated;

do $$
declare t text;
begin
  foreach t in array array['lembretes','tarefa_marcados'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy remover on app.%I for delete to authenticated using (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update, delete on app.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on app.%I for each row execute function app.tg_auditoria()', t);
  end loop;
end $$;

revoke execute on function app._notificar(uuid, uuid, text, text, uuid, text, uuid, date, uuid), app._lembretes_padrao(uuid, text, uuid, text),
  app._item_lembrete(text, uuid), app.rotina_diaria(date), app.tg_tarefa_notificar(), app.tg_marcado_notificar(),
  app.tg_reuniao_lembretes(), app.tg_documento_lembretes(), app.tg_lembrete_valido() from public;
grant execute on function app.marcar_notificacao_lida(uuid), app.configurar_notificacao(uuid, text, boolean, int[]) to authenticated;

-- Sino ao vivo (Realtime do Supabase) e rotina diária às 6h (9h UTC).
-- Fora do Supabase (testes), a publicação e o pg_cron não existem: pula.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table app.notificacoes';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('bkm-terrenos-rotina-diaria', '0 9 * * *', 'select app.rotina_diaria()');
  end if;
end $$;
