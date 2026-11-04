-- =====================================================================
-- BKM Terrenos · 0016 · reuniões com o Google Agenda (lote 6 da ficha em abas)
-- A reunião marcada no sistema vira evento na agenda de quem marcou, com o
-- convite aos participantes que têm e-mail e, online, o link do Meet. O
-- sistema é a origem: mudar data, duração, local, pauta, participantes ou
-- cancelar põe o evento na fila (reuniao_agenda.situacao = 'pendente') e a
-- função do servidor, com o token do "Conectar Agenda e Gmail", grava no
-- Google e devolve o resultado por app.agenda_confirmar. O caminho inverso
-- vale (mudança feita direto na Agenda e respostas dos convidados), por
-- app.agenda_evento_mudou e app.agenda_resposta.
-- Depois da reunião online, a função do servidor lê a gravação e a
-- transcrição do Meet (app.registrar_gravacao) e a IA escreve o rascunho do
-- que foi tratado e dos encaminhamentos (app.registrar_resumo_ia); quem
-- edita confere e aceita ou descarta (app.decidir_resumo_ia).
-- O que vem do Google mora em reuniao_agenda, que o usuário só lê; as
-- funções do servidor só rodam como service_role.
-- =====================================================================

alter table app.reunioes
  add column na_agenda  boolean not null default false,   -- criar o evento no Google Agenda
  add column gerar_meet boolean not null default false,   -- online: link do Meet no evento
  add constraint reuniao_meet_so_online check (not gerar_meet or (modalidade = 'online' and na_agenda));

alter table app.reuniao_participantes
  add column email    text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),  -- quem não está cadastrado
  add column resposta text not null default 'sem_resposta'
    check (resposta in ('sem_resposta','aceito','recusado','talvez'));               -- vem do Google

create table app.reuniao_agenda (
  reuniao_id         uuid primary key references app.reunioes(id) on delete cascade,
  empresa_id         uuid not null references app.empresas(id),
  organizador_id     uuid references auth.users(id),          -- dono do evento: quem marcou
  situacao           text not null default 'pendente' check (situacao in ('pendente','sincronizada','erro')),
  acao               text not null default 'criar' check (acao in ('criar','atualizar','cancelar','remover')),
  evento_id          text,
  evento_link        text,
  meet_link          text,
  erro               text,
  pedido_em          timestamptz not null default now(),
  sincronizada_em    timestamptz,
  gravacao_url       text,
  transcricao_url    text,
  transcricao        text,
  gravacao_em        timestamptz,
  resumo_ia          text,
  encaminhamentos_ia text,
  resumo_ia_em       timestamptz,
  resumo_situacao    text check (resumo_situacao in ('rascunho','aceito','descartado')),
  resumo_decidido_por uuid,
  resumo_decidido_em timestamptz
);
create index on app.reuniao_agenda (situacao) where situacao <> 'sincronizada';
alter table app.reuniao_agenda enable row level security;
create policy ler on app.reuniao_agenda for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.reuniao_agenda to authenticated;
grant select, insert, update, delete on app.reuniao_agenda to service_role;

-- Aviso do rascunho do resumo para quem marcou a reunião.
insert into app.tipos_notificacao (codigo, nome, dias_antes_padrao, email_padrao) values
  ('reuniao_resumo', 'Resumo da reunião pronto para conferir', '{}', true)
on conflict do nothing;
insert into app.tipos_notificacao (empresa_id, codigo, nome, dias_antes_padrao, email_padrao, ativo)
select e.id, t.codigo, t.nome, t.dias_antes_padrao, t.email_padrao, t.ativo
  from app.empresas e cross join app.tipos_notificacao t
 where t.empresa_id is null and t.codigo = 'reuniao_resumo'
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Fila: toda mudança que o convite mostra põe o evento como pendente.
-- Mudança vinda do próprio Google (app.agenda_sync = on) não volta para lá.
-- ---------------------------------------------------------------------
create or replace function app._agenda_marcar(p_reuniao uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r app.reunioes; a app.reuniao_agenda; v_acao text;
begin
  if coalesce(current_setting('app.agenda_sync', true), '') = 'on' then return; end if;
  select * into r from app.reunioes where id = p_reuniao;
  if not found then return; end if;
  select * into a from app.reuniao_agenda where reuniao_id = p_reuniao;
  if a.reuniao_id is null then
    if not r.na_agenda or r.status <> 'agendada' then return; end if;
    insert into app.reuniao_agenda (reuniao_id, empresa_id, organizador_id)
    values (r.id, r.empresa_id, coalesce(auth.uid(), r.criado_por));
    return;
  end if;
  v_acao := case when a.evento_id is null then (case when r.na_agenda and r.status = 'agendada' then 'criar' end)
                 when not r.na_agenda then 'remover'
                 when r.status = 'cancelada' then 'cancelar'
                 else 'atualizar' end;
  if v_acao is null then  -- nunca chegou ao Google e saiu da Agenda: nada a fazer
    update app.reuniao_agenda set situacao = 'sincronizada', acao = 'remover', erro = null, sincronizada_em = now() where reuniao_id = p_reuniao;
    return;
  end if;
  update app.reuniao_agenda set situacao = 'pendente', acao = v_acao, erro = null, pedido_em = now() where reuniao_id = p_reuniao;
end $$;

create or replace function app.tg_reuniao_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.na_agenda and new.status = 'realizada' then
      raise exception 'Reunião já realizada não vai para a Agenda' using errcode = '23514';
    end if;
  elsif (new.status = 'realizada' and old.status <> 'realizada')
        and (new.inicio, new.duracao_min, new.modalidade, new.local, new.endereco, new.pauta, new.na_agenda, new.gerar_meet)
            is not distinct from (old.inicio, old.duracao_min, old.modalidade, old.local, old.endereco, old.pauta, old.na_agenda, old.gerar_meet) then
    return new;  -- marcar como realizada não mexe no evento
  elsif (new.inicio, new.duracao_min, new.status, new.modalidade, new.local, new.endereco, new.pauta, new.na_agenda, new.gerar_meet)
        is not distinct from (old.inicio, old.duracao_min, old.status, old.modalidade, old.local, old.endereco, old.pauta, old.na_agenda, old.gerar_meet) then
    return new;
  end if;
  perform app._agenda_marcar(new.id);
  return new;
end $$;
create trigger t_agenda after insert or update on app.reunioes for each row execute function app.tg_reuniao_agenda();

create or replace function app.tg_participante_agenda()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.resposta is distinct from old.resposta and coalesce(current_setting('app.agenda_sync', true), '') <> 'on' then
      raise exception 'A resposta ao convite vem do Google Agenda' using errcode = '42501';
    end if;
    if (new.user_id, new.pessoa_id, new.nome, new.email) is not distinct from (old.user_id, old.pessoa_id, old.nome, old.email) then
      return new;
    end if;
  elsif tg_op = 'INSERT' and new.resposta <> 'sem_resposta' and coalesce(current_setting('app.agenda_sync', true), '') <> 'on' then
    raise exception 'A resposta ao convite vem do Google Agenda' using errcode = '42501';
  end if;
  if exists (select 1 from app.reuniao_agenda where reuniao_id = coalesce(new.reuniao_id, old.reuniao_id)) then
    perform app._agenda_marcar(coalesce(new.reuniao_id, old.reuniao_id));
  end if;
  return coalesce(new, old);
end $$;
create trigger t_agenda_resp before insert or update on app.reuniao_participantes for each row execute function app.tg_participante_agenda();
create trigger t_agenda_del after delete on app.reuniao_participantes for each row execute function app.tg_participante_agenda();

-- E-mail de cada participante para o convite: o do usuário, o da pessoa ou o digitado.
create view app.v_reuniao_convidados with (security_invoker = true) as
select x.reuniao_id, x.id as participante_id, x.lado,
       coalesce(nullif(trim(x.nome), ''), pe.nome_razao_social, u.nome, u.email) as nome,
       lower(coalesce(x.email, pe.email, u.email)) as email,
       x.resposta
  from app.reuniao_participantes x
  left join app.pessoas pe on pe.id = x.pessoa_id
  left join app.usuarios u on u.user_id = x.user_id;
grant select on app.v_reuniao_convidados to authenticated, service_role;

-- ---------------------------------------------------------------------
-- Funções do servidor (service_role): o que o Google respondeu.
-- ---------------------------------------------------------------------
create or replace function app.agenda_confirmar(p_reuniao uuid, p_evento_id text, p_evento_link text default null,
                                                p_meet_link text default null, p_erro text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a app.reuniao_agenda;
begin
  select * into a from app.reuniao_agenda where reuniao_id = p_reuniao for update;
  if not found then raise exception 'Reunião sem evento na Agenda' using errcode = 'P0002'; end if;
  if nullif(trim(p_erro), '') is not null then
    update app.reuniao_agenda set situacao = 'erro', erro = p_erro where reuniao_id = p_reuniao;
    return;
  end if;
  if a.acao = 'remover' then
    update app.reuniao_agenda set situacao = 'sincronizada', evento_id = null, evento_link = null, meet_link = null,
           erro = null, sincronizada_em = now() where reuniao_id = p_reuniao;
  else
    if nullif(trim(p_evento_id), '') is null then raise exception 'Falta o id do evento' using errcode = '22023'; end if;
    update app.reuniao_agenda set situacao = 'sincronizada', evento_id = p_evento_id,
           evento_link = coalesce(p_evento_link, evento_link), meet_link = coalesce(p_meet_link, meet_link),
           erro = null, sincronizada_em = now() where reuniao_id = p_reuniao;
  end if;
end $$;

-- Mudança feita direto na Agenda (data, duração ou cancelamento) volta para a reunião.
create or replace function app.agenda_evento_mudou(p_reuniao uuid, p_inicio timestamptz, p_duracao_min int default null,
                                                   p_cancelado boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from app.reuniao_agenda where reuniao_id = p_reuniao and evento_id is not null) then
    raise exception 'Reunião sem evento na Agenda' using errcode = 'P0002';
  end if;
  perform set_config('app.agenda_sync', 'on', true);
  update app.reunioes set inicio = coalesce(p_inicio, inicio), duracao_min = coalesce(p_duracao_min, duracao_min),
         status = case when p_cancelado and status = 'agendada' then 'cancelada' else status end
   where id = p_reuniao and status <> 'realizada';
  update app.reuniao_agenda set sincronizada_em = now() where reuniao_id = p_reuniao;
  perform set_config('app.agenda_sync', 'off', true);
end $$;

create or replace function app.agenda_resposta(p_reuniao uuid, p_email text, p_resposta text)
returns int language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  if p_resposta not in ('sem_resposta','aceito','recusado','talvez') then raise exception 'Resposta inválida' using errcode = '22023'; end if;
  perform set_config('app.agenda_sync', 'on', true);
  update app.reuniao_participantes x set resposta = p_resposta
    from app.v_reuniao_convidados c
   where c.participante_id = x.id and x.reuniao_id = p_reuniao and c.email = lower(trim(p_email));
  get diagnostics n = row_count;
  perform set_config('app.agenda_sync', 'off', true);
  return n;
end $$;

create or replace function app.registrar_gravacao(p_reuniao uuid, p_gravacao_url text, p_transcricao_url text default null,
                                                  p_transcricao text default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update app.reuniao_agenda set gravacao_url = coalesce(p_gravacao_url, gravacao_url), transcricao_url = coalesce(p_transcricao_url, transcricao_url),
         transcricao = coalesce(p_transcricao, transcricao), gravacao_em = now()
   where reuniao_id = p_reuniao;
  if not found then raise exception 'Reunião sem evento na Agenda' using errcode = 'P0002'; end if;
end $$;

-- Rascunho da IA: não toca no resumo da reunião; quem marcou é avisado para conferir.
create or replace function app.registrar_resumo_ia(p_reuniao uuid, p_resumo text, p_encaminhamentos text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a app.reuniao_agenda; r app.reunioes; v_cod text;
begin
  if nullif(trim(p_resumo), '') is null then raise exception 'Resumo vazio' using errcode = '22023'; end if;
  select * into a from app.reuniao_agenda where reuniao_id = p_reuniao for update;
  if not found then raise exception 'Reunião sem evento na Agenda' using errcode = 'P0002'; end if;
  if a.resumo_situacao = 'aceito' then raise exception 'O resumo desta reunião já foi aceito' using errcode = '55000'; end if;
  update app.reuniao_agenda set resumo_ia = p_resumo, encaminhamentos_ia = p_encaminhamentos, resumo_ia_em = now(),
         resumo_situacao = 'rascunho', resumo_decidido_por = null, resumo_decidido_em = null where reuniao_id = p_reuniao;
  select * into r from app.reunioes where id = p_reuniao;
  select codigo into v_cod from app.terrenos where id = r.terreno_id;
  perform app._notificar(r.empresa_id, a.organizador_id, 'reuniao_resumo',
    format('Resumo da reunião de %s no %s pronto para conferir', to_char(r.inicio at time zone 'America/Sao_Paulo', 'DD/MM'), v_cod),
    r.terreno_id, 'reunioes', r.id, current_date, null);
end $$;

-- ---------------------------------------------------------------------
-- Quem edita confere o rascunho: aceitar (com o texto ajustado ou não)
-- grava no que foi tratado e nos encaminhamentos; descartar só marca.
-- ---------------------------------------------------------------------
create or replace function app.decidir_resumo_ia(p_reuniao uuid, p_aceitar boolean, p_resumo text default null,
                                                  p_encaminhamentos text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare a app.reuniao_agenda; r app.reunioes;
begin
  select * into r from app.reunioes where id = p_reuniao;
  if not found then raise exception 'Reunião não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(r.empresa_id);
  select * into a from app.reuniao_agenda where reuniao_id = p_reuniao for update;
  if a.resumo_situacao is distinct from 'rascunho' then raise exception 'Não há rascunho de resumo para conferir' using errcode = '55000'; end if;
  if p_aceitar then
    if r.status <> 'realizada' then raise exception 'Marque a reunião como realizada antes de aceitar o resumo' using errcode = '55000'; end if;
    update app.reunioes set resumo = coalesce(nullif(trim(p_resumo), ''), a.resumo_ia),
           encaminhamentos = coalesce(nullif(trim(p_encaminhamentos), ''), a.encaminhamentos_ia, encaminhamentos),
           atualizado_por = auth.uid()
     where id = p_reuniao;
  end if;
  update app.reuniao_agenda set resumo_situacao = case when p_aceitar then 'aceito' else 'descartado' end,
         resumo_decidido_por = auth.uid(), resumo_decidido_em = now() where reuniao_id = p_reuniao;
end $$;

revoke execute on function app._agenda_marcar(uuid), app.agenda_confirmar(uuid, text, text, text, text),
  app.agenda_evento_mudou(uuid, timestamptz, int, boolean), app.agenda_resposta(uuid, text, text),
  app.registrar_gravacao(uuid, text, text, text), app.registrar_resumo_ia(uuid, text, text),
  app.decidir_resumo_ia(uuid, boolean, text, text) from public;
grant execute on function app.agenda_confirmar(uuid, text, text, text, text), app.agenda_evento_mudou(uuid, timestamptz, int, boolean),
  app.agenda_resposta(uuid, text, text), app.registrar_gravacao(uuid, text, text, text), app.registrar_resumo_ia(uuid, text, text)
  to service_role;
grant execute on function app.decidir_resumo_ia(uuid, boolean, text, text) to authenticated;
