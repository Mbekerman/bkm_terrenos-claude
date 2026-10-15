-- =====================================================================
-- BKM Terrenos · 0001 · base: schema, multi-tenant, auditoria
-- Tudo deste sistema vive no schema `app`, isolado do BKM até a
-- decisão de unificar tenancy (ver CLAUDE.md, decisões em aberto).
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Empresas e membros
-- ---------------------------------------------------------------------
create table app.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  criado_em   timestamptz not null default now()
);

create table app.membros (
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  papel       text not null check (papel in ('gestor','analista','leitura')),  -- leitura: consulta sem editar
  nome        text not null,
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, user_id)
);
create index on app.membros (user_id);

-- Funções de acesso. SECURITY DEFINER para não recursar na RLS de membros.
create or replace function app.minhas_empresas()
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select empresa_id from app.membros where user_id = auth.uid() $$;

create or replace function app.papel(p_empresa uuid)
returns text
language sql stable security definer set search_path = ''
as $$ select papel from app.membros where user_id = auth.uid() and empresa_id = p_empresa $$;

create or replace function app.eh_membro(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.membros where user_id = auth.uid() and empresa_id = p_empresa) $$;

create or replace function app.eh_gestor(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(app.papel(p_empresa) = 'gestor', false) $$;

-- Empresas em que o usuário pode editar (gestor ou analista).
create or replace function app.empresas_edicao()
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select empresa_id from app.membros where user_id = auth.uid() and papel in ('gestor','analista') $$;

create or replace function app.exigir_editor(p_empresa uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(app.papel(p_empresa), '') not in ('gestor','analista') then
    raise exception 'Seu acesso é somente leitura' using errcode = '42501';
  end if;
end $$;

create or replace function app.exigir_membro(p_empresa uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not app.eh_membro(p_empresa) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;
end $$;

-- Cria a empresa e torna quem chamou gestor. Usado no primeiro acesso.
create or replace function app.criar_empresa(p_nome text, p_meu_nome text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Faça login primeiro' using errcode = '42501';
  end if;
  insert into app.empresas (nome) values (p_nome) returning id into v_id;
  insert into app.membros (empresa_id, user_id, papel, nome) values (v_id, auth.uid(), 'gestor', p_meu_nome);
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Utilitários: atualizado_em e auditoria
-- ---------------------------------------------------------------------
-- Preenche atualizado_em e, quando a tabela tiver a coluna, atualizado_por.
create or replace function app.tg_atualizado_em()
returns trigger language plpgsql as $$
begin
  new.atualizado_em := now();
  if to_jsonb(new) ? 'atualizado_por' then
    new := jsonb_populate_record(new, jsonb_build_object('atualizado_por', auth.uid()));
  end if;
  -- versão para controle de edição simultânea
  if to_jsonb(new) ? 'versao' then
    new := jsonb_populate_record(new, jsonb_build_object('versao', (to_jsonb(old)->>'versao')::int + 1));
  end if;
  return new;
end $$;

create table app.auditoria (
  id          bigint generated always as identity primary key,
  empresa_id  uuid,
  tabela      text not null,
  registro_id uuid,
  acao        text not null,
  antes       jsonb,
  depois      jsonb,
  user_id     uuid default auth.uid(),
  em          timestamptz not null default now()
);
create index on app.auditoria (empresa_id, tabela, registro_id);

create or replace function app.tg_auditoria()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  if tg_op = 'UPDATE' and v_old = v_new then return new; end if;
  insert into app.auditoria (empresa_id, tabela, registro_id, acao, antes, depois)
  values ((v_row->>'empresa_id')::uuid, tg_table_name, (v_row->>'id')::uuid, lower(tg_op), v_old, v_new);
  return coalesce(new, old);
end $$;

-- ---------------------------------------------------------------------
-- RLS das tabelas base
-- ---------------------------------------------------------------------
alter table app.empresas  enable row level security;
alter table app.membros   enable row level security;
alter table app.auditoria enable row level security;

create policy empresas_ver on app.empresas for select to authenticated
  using (id in (select app.minhas_empresas()));
create policy membros_ver on app.membros for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy membros_gestor_gerencia on app.membros for all to authenticated
  using (app.eh_gestor(empresa_id)) with check (app.eh_gestor(empresa_id));
create policy auditoria_gestor_ve on app.auditoria for select to authenticated
  using (app.eh_gestor(empresa_id));

grant select on app.empresas, app.auditoria to authenticated;
grant select, insert, update, delete on app.membros to authenticated;
grant execute on function app.criar_empresa(text, text) to authenticated;
