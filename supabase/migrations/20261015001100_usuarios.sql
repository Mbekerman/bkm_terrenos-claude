-- =====================================================================
-- BKM Terrenos · 0011 · usuários: login pelo Google do Workspace
-- Quem tem e-mail de um domínio cadastrado (bkm.com.br) entra pelo Google;
-- no primeiro login nasce o perfil (nome, e-mail, foto, @) e a pessoa entra
-- na empresa com o papel `basico`, que por ora só consulta, como `leitura`
-- (decisão do Moisés, 28/out/2026; os perfis definitivos virão depois). Outros domínios são recusados no Supabase Auth pelo
-- gancho "Before User Created" (app.hook_antes_de_criar_usuario).
-- =====================================================================

-- Domínios de e-mail de cada empresa: quem entra com um deles vira membro básico.
create table app.empresa_dominios (
  dominio     text primary key check (dominio = lower(dominio) and dominio ~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$'),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  criado_em   timestamptz not null default now()
);
create index on app.empresa_dominios (empresa_id);

-- Perfil do usuário, um só para todas as empresas. Nome e foto vêm do Google e
-- se atualizam a cada login; o @ nasce do e-mail e só o administrador muda.
create table app.usuarios (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  email            text not null,
  nome             text not null,
  foto_url         text,
  arroba           text not null unique check (arroba ~ '^[a-z0-9][a-z0-9._-]{0,39}$'),
  criado_em        timestamptz not null default now(),
  ultimo_login_em  timestamptz
);

-- @ a partir do texto antes do @ do e-mail: minúsculas, sem acento, só letras,
-- números, ponto, hífen e sublinhado; se já existe, ganha número no fim (joao.silva2).
create or replace function app.gerar_arroba(p_email text, p_user uuid default null)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_base text := lower(split_part(coalesce(p_email, ''), '@', 1));
  v text;
  n int := 1;
begin
  v_base := translate(v_base, 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn');
  v_base := regexp_replace(v_base, '[^a-z0-9._-]', '', 'g');
  v_base := regexp_replace(v_base, '^[._-]+', '');
  v_base := left(v_base, 36);
  if v_base = '' then v_base := 'usuario'; end if;
  v := v_base;
  while exists (select 1 from app.usuarios where arroba = v and user_id is distinct from p_user) loop
    n := n + 1;
    v := v_base || n;
  end loop;
  return v;
end $$;

-- Novo usuário no Auth: cria o perfil e, pelo domínio do e-mail, o membro básico.
create or replace function app.tg_usuario_novo()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_nome text := coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''),
                          split_part(coalesce(new.email, ''), '@', 1));
  v_empresa uuid;
begin
  if new.email is null then return new; end if;
  insert into app.usuarios (user_id, email, nome, foto_url, arroba, ultimo_login_em)
  values (new.id, lower(new.email), v_nome, coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'),
          app.gerar_arroba(new.email, new.id), new.last_sign_in_at);
  select empresa_id into v_empresa from app.empresa_dominios where dominio = lower(split_part(new.email, '@', 2));
  if v_empresa is not null then
    insert into app.membros (empresa_id, user_id, papel, nome) values (v_empresa, new.id, 'basico', v_nome)
    on conflict do nothing;
  end if;
  return new;
end $$;
create trigger t_usuario_novo after insert on auth.users for each row execute function app.tg_usuario_novo();

-- A cada login o Google manda nome e foto de novo: o perfil acompanha. O @ fica.
create or replace function app.tg_usuario_login()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update app.usuarios set
    email = coalesce(lower(new.email), email),
    nome = coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), nullif(trim(new.raw_user_meta_data->>'name'), ''), nome),
    foto_url = coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', foto_url),
    ultimo_login_em = coalesce(new.last_sign_in_at, ultimo_login_em)
  where user_id = new.id;
  return new;
end $$;
create trigger t_usuario_login after update of email, raw_user_meta_data, last_sign_in_at on auth.users
  for each row execute function app.tg_usuario_login();

-- Gancho "Before User Created" do Supabase Auth (Authentication › Auth Hooks):
-- só cria usuário com e-mail de domínio cadastrado. O parâmetro hd do Google é
-- só uma dica na tela; a barreira é esta.
create or replace function app.hook_antes_de_criar_usuario(event jsonb)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_dominio text := lower(split_part(coalesce(event->'user'->>'email', ''), '@', 2));
begin
  if v_dominio <> '' and exists (select 1 from app.empresa_dominios where dominio = v_dominio) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403, 'message', 'Entre com o seu e-mail da empresa.'));
end $$;

-- O administrador muda o @ de quem é da equipe dele.
create or replace function app.mudar_arroba(p_user uuid, p_arroba text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v text := lower(trim(both '@ ' from coalesce(p_arroba, '')));
begin
  if not exists (select 1 from app.membros m where m.user_id = p_user and app.eh_administrador(m.empresa_id)) then
    raise exception 'Só o administrador muda o @ de alguém da equipe' using errcode = '42501';
  end if;
  if v !~ '^[a-z0-9][a-z0-9._-]{0,39}$' then
    raise exception 'O @ aceita letras sem acento, números, ponto, hífen e sublinhado' using errcode = '22023';
  end if;
  if exists (select 1 from app.usuarios where arroba = v and user_id <> p_user) then
    raise exception 'O @% já é de outra pessoa', v using errcode = '23505';
  end if;
  update app.usuarios set arroba = v where user_id = p_user;
  insert into app.auditoria (empresa_id, tabela, registro_id, acao, antes, depois)
  select m.empresa_id, 'usuarios', p_user, 'update', null, jsonb_build_object('arroba', v)
  from app.membros m where m.user_id = p_user and app.eh_administrador(m.empresa_id);
  return v;
end $$;

-- ---------------------------------------------------------------------
-- Menções com @ (decisão do Moisés, 28/out/2026): quem escreve @arroba
-- numa tarefa, numa atividade ou numa reunião avisa a pessoa (no app e,
-- conforme a preferência dela, por e-mail). Só conta o @ de quem é da
-- empresa; e-mail escrito no texto (x@bkm.com.br) não é menção. Editar o
-- texto só avisa quem entrou agora.
-- ---------------------------------------------------------------------
create table app.mencoes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  terreno_id    uuid references app.terrenos(id) on delete cascade,
  origem_tabela text not null check (origem_tabela in ('tarefas','atividades','reunioes')),
  origem_id     uuid not null,
  user_id       uuid not null references auth.users(id) on delete cascade,
  por           uuid default auth.uid(),
  criado_em     timestamptz not null default now(),
  unique (origem_tabela, origem_id, user_id)
);
create index on app.mencoes (user_id, criado_em desc);

-- Os @ de um texto, em minúsculas, sem o ponto final colado ("@ana." = ana).
create or replace function app.arrobas_no_texto(p_texto text)
returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct rtrim(lower(m[1]), '._-')), '{}')
  from regexp_matches(coalesce(p_texto, ''), '(?:^|[^A-Za-z0-9._@-])@([A-Za-z0-9][A-Za-z0-9._-]{0,39})', 'g') m
$$;

-- Gatilho genérico: os argumentos são as colunas de texto da tabela.
create or replace function app.tg_mencoes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c text; v text; novos text[] := '{}'; antigos text[] := '{}';
  r record; v_autor text; v_onde text;
begin
  foreach c in array tg_argv loop
    v := to_jsonb(new)->>c; novos := novos || app.arrobas_no_texto(v);
    if tg_op = 'UPDATE' then antigos := antigos || app.arrobas_no_texto(to_jsonb(old)->>c); end if;
  end loop;
  if cardinality(novos) = 0 then return new; end if;
  v_autor := coalesce((select nome from app.usuarios where user_id = auth.uid()),
                      (select nome from app.membros where user_id = auth.uid() and empresa_id = new.empresa_id), 'Alguém');
  v_onde := case tg_table_name
    when 'tarefas' then 'na tarefa: ' || (to_jsonb(new)->>'titulo')
    when 'atividades' then 'numa atividade: ' || left(to_jsonb(new)->>'resumo', 80)
    else 'na reunião de ' || to_char((to_jsonb(new)->>'inicio')::timestamptz, 'DD/MM') end;
  for r in select distinct u.user_id from app.usuarios u
           join app.membros m on m.user_id = u.user_id and m.empresa_id = new.empresa_id
           where u.arroba = any(novos) and not (u.arroba = any(antigos)) and u.user_id is distinct from auth.uid() loop
    insert into app.mencoes (empresa_id, terreno_id, origem_tabela, origem_id, user_id)
    values (new.empresa_id, new.terreno_id, tg_table_name, new.id, r.user_id)
    on conflict do nothing;
    if found then
      perform app._notificar(new.empresa_id, r.user_id, 'mencao', v_autor || ' mencionou você ' || v_onde,
                             new.terreno_id, tg_table_name, new.id);
    end if;
  end loop;
  return new;
end $$;
create trigger t_mencoes after insert or update of descricao, resultado on app.tarefas
  for each row execute function app.tg_mencoes('descricao', 'resultado');
create trigger t_mencoes after insert or update of resumo, resultado on app.atividades
  for each row execute function app.tg_mencoes('resumo', 'resultado');
create trigger t_mencoes after insert or update of pauta, resumo, encaminhamentos on app.reunioes
  for each row execute function app.tg_mencoes('pauta', 'resumo', 'encaminhamentos');

-- ---------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------
alter table app.empresa_dominios enable row level security;
alter table app.usuarios enable row level security;
alter table app.mencoes enable row level security;
create policy ver on app.mencoes for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.mencoes to authenticated;

create policy dominios_ver on app.empresa_dominios for select to authenticated
  using (empresa_id in (select app.minhas_empresas()));
create policy dominios_admin on app.empresa_dominios for all to authenticated
  using (app.eh_administrador(empresa_id)) with check (app.eh_administrador(empresa_id));
-- Cada um vê o próprio perfil e o de quem está nas suas empresas (nomes, fotos e @ nas telas).
create policy usuarios_ver on app.usuarios for select to authenticated
  using (user_id = auth.uid() or user_id in (select user_id from app.membros where empresa_id in (select app.minhas_empresas())));

grant select on app.usuarios to authenticated;
grant select, insert, update, delete on app.empresa_dominios to authenticated;
create trigger t_aud after insert or update or delete on app.empresa_dominios for each row execute function app.tg_auditoria();

revoke execute on function app.gerar_arroba(text, uuid), app.tg_usuario_novo(), app.tg_usuario_login(),
  app.hook_antes_de_criar_usuario(jsonb), app.mudar_arroba(uuid, text), app.tg_mencoes() from public;
grant execute on function app.mudar_arroba(uuid, text) to authenticated;
grant usage on schema app to supabase_auth_admin;
grant execute on function app.hook_antes_de_criar_usuario(jsonb) to supabase_auth_admin;
