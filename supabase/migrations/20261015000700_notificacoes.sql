-- =====================================================================
-- BKM Terrenos · 0007 · notificações e lembretes
-- Uma tabela genérica de notificações; os gatilhos ficam separados dela.
-- Na hora: triggers e RPCs (tarefa atribuída, menção com @, aprovação). Só
-- quem é chamado com @ é avisado: não há lista de marcados (decisão do
-- Moisés, 29/out/2026, para não virar spam).
-- Por prazo: app.rotina_diaria(), rodada uma vez por dia pelo pg_cron.
-- Um tipo novo de interação só acrescenta um gatilho e uma linha em
-- tipos_notificacao. E-mail: cada tipo tem o padrão da empresa e cada
-- pessoa escolhe por tipo (preferencias_notificacao); a notificação nasce com
-- email_status 'pendente' e uma função do servidor envia pela conta do
-- sistema. WhatsApp fica para depois (decisão do Moisés, 28/out/2026).
-- =====================================================================

-- Configuração por empresa (empresa_id nulo = modelo padrão, copiado para
-- cada empresa nova). dias_antes_padrao: lembretes criados com o item.
create table app.tipos_notificacao (
  empresa_id        uuid references app.empresas(id) on delete cascade,
  codigo            text not null,
  nome              text not null,
  ativo             boolean not null default true,
  dias_antes_padrao int[] not null default '{}' check (0 <= all(dias_antes_padrao) and 365 >= all(dias_antes_padrao)),
  email_padrao      boolean not null default false,   -- também por e-mail, para quem não escolheu
  unique nulls not distinct (empresa_id, codigo)
);

insert into app.tipos_notificacao (codigo, nome, dias_antes_padrao, email_padrao) values
  ('tarefa_atribuida',   'Tarefa atribuída a você',          '{}',    true),
  ('mencao',             'Você foi mencionado com @',        '{}',    true),
  ('tarefa_prazo',       'Prazo de tarefa',                  '{0}',   false),  -- 0 = no dia: "vence hoje"
  ('tarefa_atrasada',    'Tarefa atrasada',                  '{}',    false),
  ('tarefa_acompanhada', 'Tarefa que você acompanha',        '{}',    false),  -- comentário novo ou tarefa concluída
  ('stand_by_retomar',   'Retomar negociação em stand by',   '{7,0}', false),
  ('subetapa_prazo',     'Subetapa com prazo estourado',     '{}',    false),
  ('documento_vencendo', 'Documento vencendo',               '{30,7}', false),
  ('reuniao_agendada',   'Reunião agendada',                 '{1}',   false),
  ('aprovacao_pendente', 'Aprovação pendente',               '{}',    true),
  ('aprovacao_decidida', 'Seu pedido de aprovação foi decidido', '{}', true);

-- O que cada pessoa quer receber por e-mail, por tipo. Sem linha = o padrão do tipo.
-- No app a notificação sempre aparece (o administrador desliga o tipo inteiro).
create table app.preferencias_notificacao (
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  tipo        text not null,
  email       boolean not null,
  alterado_em timestamptz not null default now(),
  primary key (empresa_id, user_id, tipo)
);

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
  email_status   text check (email_status in ('pendente','enviado','falhou')),  -- nulo = não vai por e-mail
  email_em       timestamptz,
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
  insert into app.notificacoes (empresa_id, destinatario_id, tipo, texto, autor_id, terreno_id, origem_tabela, origem_id, referencia, email_status)
  values (p_empresa, p_destinatario, p_fase, p_texto, p_autor, p_terreno, p_origem_tabela, p_origem_id, coalesce(p_referencia, current_date),
          case when coalesce((select email from app.preferencias_notificacao
                               where empresa_id = p_empresa and user_id = p_destinatario and tipo = p_fase),
                             (select email_padrao from app.tipos_notificacao where empresa_id = p_empresa and codigo = p_fase))
               then 'pendente' end)
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
  select k.empresa_id, app.terreno_da_tarefa(k.id), 'tarefa_prazo', k.prazo, k.responsavel_id, 'Tarefa "' || k.titulo || '"'
  from fluxo.tarefas k where p_origem_tabela = 'tarefas' and k.id = p_origem_id and k.concluida_em is null and k.arquivada_em is null
    and k.prazo is not null
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
-- Tarefas (esquema fluxo): o responsável e quem entra como executor são
-- avisados; quem acompanha recebe a conclusão e cada comentário novo.
create or replace function app.tg_tarefa_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_ter uuid := app.terreno_da_tarefa(new.id); r record;
begin
  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    perform app._notificar(new.empresa_id, new.responsavel_id, 'tarefa_atribuida', 'Tarefa para você: ' || new.titulo,
                           v_ter, 'tarefas', new.id);
  end if;
  if tg_op = 'INSERT' then perform app._lembretes_padrao(new.empresa_id, 'tarefas', new.id, 'tarefa_prazo'); end if;
  if tg_op = 'UPDATE' and new.concluida_em is not null and old.concluida_em is null then
    for r in select user_id from fluxo.tarefa_pessoas where tarefa_id = new.id and papel = 'acompanha' loop
      perform app._notificar(new.empresa_id, r.user_id, 'tarefa_acompanhada', 'Tarefa concluída: ' || new.titulo, v_ter, 'tarefas', new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger t_notificar after insert or update of responsavel_id, concluida_em on fluxo.tarefas for each row execute function app.tg_tarefa_notificar();

create or replace function app.tg_tarefa_pessoa_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.papel = 'executor' then
    perform app._notificar(new.empresa_id, new.user_id, 'tarefa_atribuida',
                           'Tarefa para você: ' || (select titulo from fluxo.tarefas where id = new.tarefa_id),
                           app.terreno_da_tarefa(new.tarefa_id), 'tarefas', new.tarefa_id);
  end if;
  return new;
end $$;
create trigger t_notificar after insert on fluxo.tarefa_pessoas for each row execute function app.tg_tarefa_pessoa_notificar();

create or replace function app.tg_item_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare k fluxo.tarefas;
begin
  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    select t.* into k from fluxo.tarefas t join fluxo.checklists c on c.tarefa_id = t.id where c.id = new.checklist_id;
    perform app._notificar(new.empresa_id, new.responsavel_id, 'tarefa_atribuida',
                           'Item para você em ' || k.titulo || ': ' || new.texto, app.terreno_da_tarefa(k.id), 'tarefas', k.id);
  end if;
  return new;
end $$;
create trigger t_notificar after insert or update of responsavel_id on fluxo.checklist_itens for each row execute function app.tg_item_notificar();

create or replace function app.tg_comentario_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare r record; v_tit text := (select titulo from fluxo.tarefas where id = new.tarefa_id);
begin
  for r in select user_id from fluxo.tarefa_pessoas where tarefa_id = new.tarefa_id and papel = 'acompanha' loop
    perform app._notificar(new.empresa_id, r.user_id, 'tarefa_acompanhada', 'Comentário novo em ' || v_tit,
                           app.terreno_da_tarefa(new.tarefa_id), 'tarefas', new.tarefa_id);
  end loop;
  return new;
end $$;
create trigger t_notificar after insert on fluxo.comentarios for each row execute function app.tg_comentario_notificar();

-- Aprovação da tarefa (bloco 3): o aprovador na vez recebe o pedido (em
-- sequência, o próximo quando o anterior aprova); quem pediu e o
-- responsável recebem a decisão.
create or replace function app.tg_voto_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare a fluxo.aprovacoes; v_tit text; r record;
begin
  select * into a from fluxo.aprovacoes where id = new.aprovacao_id;
  if a.situacao <> 'pendente' then return new; end if;
  v_tit := (select titulo from fluxo.tarefas where id = a.tarefa_id);
  for r in select aprovador_id from fluxo.votos_da_vez(a.id) loop
    perform app._notificar(a.empresa_id, r.aprovador_id, 'aprovacao_pendente', 'Aprovar a tarefa: ' || v_tit,
                           app.terreno_da_tarefa(a.tarefa_id), 'tarefa_aprovacoes', a.id);
  end loop;
  return new;
end $$;
create trigger t_notificar after insert or update of decisao on fluxo.aprovacao_votos for each row execute function app.tg_voto_notificar();

create or replace function app.tg_aprovacao_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare k fluxo.tarefas; v_txt text; u uuid;
begin
  if new.situacao not in ('aprovada','recusada') or old.situacao <> 'pendente' then return new; end if;
  select * into k from fluxo.tarefas where id = new.tarefa_id;
  v_txt := case when new.situacao = 'aprovada' then 'Tarefa aprovada: ' else 'Tarefa recusada: ' end || k.titulo
           || coalesce(' (' || (select justificativa from fluxo.aprovacao_votos where aprovacao_id = new.id and decisao = 'recusou' limit 1) || ')', '');
  foreach u in array array[new.pedida_por, k.responsavel_id] loop
    perform app._notificar(new.empresa_id, u, 'aprovacao_decidida', v_txt, app.terreno_da_tarefa(k.id), 'tarefa_aprovacoes', new.id);
  end loop;
  return new;
end $$;
create trigger t_notificar after update of situacao on fluxo.aprovacoes for each row execute function app.tg_aprovacao_notificar();

-- Pausa (SLA): o pedido vai ao primeiro superior de quem pediu com o nível
-- que a empresa exige; a decisão volta para quem pediu e para o responsável.
create or replace function app.tg_pausa_notificar()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare k fluxo.tarefas; v_aprov uuid; u uuid;
begin
  select * into k from fluxo.tarefas where id = new.tarefa_id;
  if tg_op = 'INSERT' and new.situacao = 'pendente' and not fluxo.aprova_pausa(new.empresa_id, new.pedida_por) then
    with recursive acima as (
      select m.superior_id as u, 1 as n from app.membros m where m.empresa_id = new.empresa_id and m.user_id = new.pedida_por
      union all
      select m.superior_id, a.n + 1 from acima a join app.membros m on m.empresa_id = new.empresa_id and m.user_id = a.u where a.n < 10)
    select a.u into v_aprov from acima a join app.membros m on m.empresa_id = new.empresa_id and m.user_id = a.u
    where app.nivel_papel(m.papel) >= fluxo.nivel_pausa(new.empresa_id) order by a.n limit 1;
    perform app._notificar(new.empresa_id, v_aprov, 'aprovacao_pendente', 'Aprovar a pausa de ' || k.titulo || ': ' || new.motivo,
                           app.terreno_da_tarefa(k.id), 'tarefa_pausas', new.id);
  elsif tg_op = 'UPDATE' and old.situacao = 'pendente' and new.situacao in ('ativa','recusada') and new.decidida_por is distinct from new.pedida_por then
    foreach u in array array[new.pedida_por, k.responsavel_id] loop
      perform app._notificar(new.empresa_id, u, 'aprovacao_decidida',
        case when new.situacao = 'ativa' then 'Pausa aprovada: ' else 'Pausa recusada: ' end || k.titulo || coalesce(' (' || new.motivo_decisao || ')', ''),
        app.terreno_da_tarefa(k.id), 'tarefa_pausas', new.id);
    end loop;
  end if;
  return new;
end $$;
create trigger t_notificar after insert or update of situacao on fluxo.pausas for each row execute function app.tg_pausa_notificar();

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
  execute format('select empresa_id from %s.%I where id = $1', case new.origem_tabela when 'tarefas' then 'fluxo' else 'app' end, new.origem_tabela)
    into v using new.origem_id;
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

  -- cartões recorrentes: as ocorrências com data até hoje nascem antes dos avisos
  total := total + fluxo.gerar_recorrencias(p_hoje);

  -- tarefa atrasada: uma vez, no primeiro dia de atraso (ou quando a rotina vir)
  for r in select * from fluxo.tarefas k where k.concluida_em is null and k.arquivada_em is null and k.prazo < p_hoje and k.responsavel_id is not null
             and not exists (select 1 from fluxo.listas l where l.id = k.lista_id and l.tipo = 'pausa') loop
    perform app._notificar(r.empresa_id, r.responsavel_id, 'tarefa_atrasada', 'Tarefa atrasada: ' || r.titulo, app.terreno_da_tarefa(r.id), 'tarefas', r.id, r.prazo, null);
    get diagnostics n = row_count; total := total + n;
  end loop;

  -- subetapa com prazo estourado: uma vez por entrada na subetapa
  for r in select p.*, s.nome as sub_nome, s.prazo_dias, t.nome as terreno_nome
           from app.processos p
           join app.subetapas_modelo s on s.empresa_id = p.empresa_id and s.fase = p.fase and s.codigo = p.subetapa_atual
           join app.terrenos t on t.id = p.terreno_id
           where p.status = 'ativo' and s.prazo_dias is not null and p.subetapa_desde::date + s.prazo_dias < p_hoje
             -- negociação do terreno dividida em partes: o aviso vem de cada parte
             and not exists (select 1 from app.processos c where c.principal_id = p.id and c.status in ('ativo','stand_by')) loop
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

-- Administrador liga/desliga um tipo, define os lembretes padrão e se vai por e-mail para quem não escolheu.
create or replace function app.configurar_notificacao(p_empresa uuid, p_codigo text, p_ativo boolean default null, p_dias_antes int[] default null,
  p_email_padrao boolean default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform app.exigir_administrador(p_empresa);
  update app.tipos_notificacao set ativo = coalesce(p_ativo, ativo),
         dias_antes_padrao = coalesce((select array_agg(distinct d order by d desc) from unnest(p_dias_antes) d), dias_antes_padrao),
         email_padrao = coalesce(p_email_padrao, email_padrao)
   where empresa_id = p_empresa and codigo = p_codigo;
  if not found then raise exception 'Tipo de notificação não encontrado' using errcode = 'P0002'; end if;
end $$;

-- Cada pessoa escolhe, por tipo, se recebe também por e-mail (nulo = volta ao padrão do tipo).
create or replace function app.salvar_preferencia_notificacao(p_empresa uuid, p_tipo text, p_email boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_empresa is null or p_empresa not in (select app.minhas_empresas()) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;
  if not exists (select 1 from app.tipos_notificacao where empresa_id = p_empresa and codigo = p_tipo) then
    raise exception 'Tipo de notificação não encontrado' using errcode = 'P0002';
  end if;
  if p_email is null then
    delete from app.preferencias_notificacao where empresa_id = p_empresa and user_id = auth.uid() and tipo = p_tipo;
  else
    insert into app.preferencias_notificacao (empresa_id, user_id, tipo, email) values (p_empresa, auth.uid(), p_tipo, p_email)
    on conflict (empresa_id, user_id, tipo) do update set email = excluded.email, alterado_em = now();
  end if;
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

-- cada um vê as próprias preferências; grava só pela RPC
alter table app.preferencias_notificacao enable row level security;
create policy ver on app.preferencias_notificacao for select to authenticated
  using (user_id = auth.uid() and empresa_id in (select app.minhas_empresas()));
grant select on app.preferencias_notificacao to authenticated;

do $$
declare t text;
begin
  foreach t in array array['lembretes'] loop
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
  app._item_lembrete(text, uuid), app.rotina_diaria(date), app.tg_tarefa_notificar(), app.tg_tarefa_pessoa_notificar(), app.tg_item_notificar(), app.tg_comentario_notificar(),
  app.tg_reuniao_lembretes(), app.tg_documento_lembretes(), app.tg_lembrete_valido() from public;
grant execute on function app.marcar_notificacao_lida(uuid), app.configurar_notificacao(uuid, text, boolean, int[], boolean),
  app.salvar_preferencia_notificacao(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- Visões salvas dos filtros (Terrenos, Mapa e Fases): nome + filtros.
-- Pessoal (user_id = quem criou; só ele vê e altera) ou da empresa
-- (user_id nulo; todos veem, só o administrador cria, altera ou apaga).
-- Os filtros são do front (jsonb); o banco só guarda.
-- ---------------------------------------------------------------------
create table app.filtros_salvos (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  user_id       uuid references auth.users(id) on delete cascade default auth.uid(),
  nome          text not null check (btrim(nome) <> ''),
  filtros       jsonb not null default '{}' check (jsonb_typeof(filtros) = 'object'),
  ordem         int not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique nulls not distinct (empresa_id, user_id, nome)
);
create trigger t_upd before update on app.filtros_salvos for each row execute function app.tg_atualizado_em();
alter table app.filtros_salvos enable row level security;
create policy ver on app.filtros_salvos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and (user_id is null or user_id = auth.uid()));
create policy gravar on app.filtros_salvos for all to authenticated
  using (empresa_id in (select app.minhas_empresas())
         and (user_id = auth.uid() or (user_id is null and app.eh_administrador(empresa_id))))
  with check (empresa_id in (select app.minhas_empresas())
              and (user_id = auth.uid() or (user_id is null and app.eh_administrador(empresa_id))));
grant select, insert, update, delete on app.filtros_salvos to authenticated;

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
