-- =====================================================================
-- BKM Terrenos · 0001 · base: schema, multi-tenant, auditoria
-- Tudo deste sistema vive no schema `app`, isolado do BKM até a
-- decisão de unificar tenancy (ver CLAUDE.md, decisões em aberto).
-- =====================================================================

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
-- Poligonal do terreno e sobreposição entre terrenos (no Supabase: Database → Extensions → postgis).
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Empresas e membros
-- ---------------------------------------------------------------------
create table app.empresas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) > 0),
  criado_em   timestamptz not null default now()
);

create table app.membros (
  empresa_id    uuid not null references app.empresas(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  -- diretor > gestor > analista; leitura só consulta; basico é quem entrou pelo
  -- domínio da empresa e, até os perfis definitivos, consulta como leitura
  papel         text not null check (papel in ('diretor','gestor','analista','leitura','basico')),
  nome          text not null,
  criado_em     timestamptz not null default now(),
  -- a quem responde: analista -> gestor, gestor -> diretor (sempre um nível acima)
  superior_id   uuid,
  -- permissão à parte, em qualquer papel: edita a configuração do funil e a equipe
  administrador boolean not null default false,
  primary key (empresa_id, user_id),
  foreign key (empresa_id, superior_id) references app.membros(empresa_id, user_id),
  check (superior_id is distinct from user_id)
);
create index on app.membros (user_id);
create index on app.membros (empresa_id, superior_id);

-- Nível do papel: o superior está sempre num nível acima. Quem tem o nível exigido
-- por uma aprovação fica dispensado dela.
create or replace function app.nivel_papel(p_papel text)
returns int language sql immutable set search_path = ''
as $$ select case p_papel when 'diretor' then 3 when 'gestor' then 2 when 'analista' then 1 else 0 end $$;

create or replace function app.tg_membro_hierarquia()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare sup app.membros;
begin
  if tg_op = 'DELETE' then
    if exists (select 1 from app.membros where empresa_id = old.empresa_id and superior_id = old.user_id) then
      raise exception 'Antes de remover, troque o superior de quem responde a %', old.nome using errcode = '23503';
    end if;
    if old.administrador and not exists (select 1 from app.membros where empresa_id = old.empresa_id and administrador and user_id <> old.user_id) then
      raise exception 'A empresa precisa de ao menos um administrador' using errcode = '23514';
    end if;
    return old;
  end if;
  if new.superior_id is not null then
    select * into sup from app.membros where empresa_id = new.empresa_id and user_id = new.superior_id;
    if app.nivel_papel(sup.papel) <> app.nivel_papel(new.papel) + 1 or new.papel in ('leitura','basico') then
      raise exception 'O superior de um % é um %', new.papel,
        case new.papel when 'analista' then 'gestor' when 'gestor' then 'diretor' else 'nível acima (diretor não tem superior)' end
        using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.papel <> old.papel and exists (select 1 from app.membros where empresa_id = new.empresa_id and superior_id = new.user_id) then
      raise exception 'Troque o superior de quem responde a % antes de mudar o papel', new.nome using errcode = '23514';
    end if;
    if old.administrador and not new.administrador
       and not exists (select 1 from app.membros where empresa_id = new.empresa_id and administrador and user_id <> new.user_id) then
      raise exception 'A empresa precisa de ao menos um administrador' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;
create trigger t_hierarquia before insert or update or delete on app.membros for each row execute function app.tg_membro_hierarquia();

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

-- Gestor ou acima (diretor): força avanço, vê a auditoria.
create or replace function app.eh_gestor(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(app.papel(p_empresa) in ('gestor','diretor'), false) $$;

create or replace function app.eh_administrador(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.membros where user_id = auth.uid() and empresa_id = p_empresa and administrador) $$;

-- Diretoria ou administrador: mexe nas taxas e despesas financeiras do estudo de viabilidade.
create or replace function app.eh_diretoria(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select coalesce(app.papel(p_empresa) = 'diretor', false) or app.eh_administrador(p_empresa) $$;

create or replace function app.exigir_administrador(p_empresa uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not app.eh_administrador(p_empresa) then
    raise exception 'Só o administrador muda a configuração' using errcode = '42501';
  end if;
end $$;

-- Verdadeiro se p_chefe está acima de p_membro na hierarquia (superior, superior do superior...).
create or replace function app.eh_superior(p_empresa uuid, p_chefe uuid, p_membro uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  with recursive acima as (
    select superior_id, 1 as n from app.membros where empresa_id = p_empresa and user_id = p_membro
    union all
    select m.superior_id, a.n + 1 from acima a join app.membros m on m.empresa_id = p_empresa and m.user_id = a.superior_id
    where a.n < 10
  )
  select exists (select 1 from acima where superior_id = p_chefe)
$$;

-- Empresas em que o usuário pode editar (diretor, gestor ou analista).
create or replace function app.empresas_edicao()
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select empresa_id from app.membros where user_id = auth.uid() and papel in ('diretor','gestor','analista') $$;

create or replace function app.exigir_editor(p_empresa uuid)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or coalesce(app.papel(p_empresa), '') not in ('diretor','gestor','analista') then
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

-- Cria a empresa e torna quem chamou diretor e administrador. Usado no primeiro acesso.
-- A configuração do funil é copiada do modelo padrão por trigger (ver cadastros).
-- Empresa nova: só pela carga do sistema (service role ou SQL do dono do banco), nunca pelo usuário
-- logado (revisão de 4/nov/2026: com o login aberto a todo e-mail do domínio, qualquer um criava
-- uma empresa e virava diretor dela). p_dono entra como diretor e administrador; sem dono, a empresa
-- nasce sem equipe e recebe as pessoas pela equipe prevista (app.equipe_prevista) no primeiro login.
create or replace function app.criar_empresa(p_nome text, p_meu_nome text default null, p_dono uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  insert into app.empresas (nome) values (p_nome) returning id into v_id;
  if p_dono is not null then
    insert into app.membros (empresa_id, user_id, papel, nome, administrador) values (v_id, p_dono, 'diretor', p_meu_nome, true);
  end if;
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
  -- clock_timestamp, não now(): várias alterações na mesma transação (uma RPC) ficam em instantes distintos e ordenáveis
  em          timestamptz not null default clock_timestamp(),
  -- lixeira do log (app.desfazer_alteracao): o registro nunca some; fica marcado como desfeito,
  -- e o registro da volta ao valor de antes aponta para ele
  desfeito_em  timestamptz,
  desfeito_por uuid,
  desfaz_id    bigint references app.auditoria(id)
);
create index on app.auditoria (empresa_id, tabela, registro_id);
create index on app.auditoria (empresa_id, em desc, id desc);

-- Cliques seguidos no mesmo campo (ex.: temperatura 2 → 3 → 4) não viram
-- vários logs: se o último registro daquele registro é uma alteração do mesmo
-- usuário, nas mesmas colunas, há menos de app.janela_log(), ele passa a
-- mostrar o valor final; se o valor final é o de antes da sequência, o
-- registro some. Grava na hora (nada se perde se a aba fechar); só o
-- histórico é que junta. Processos ficam de fora: o histórico do funil
-- (processo_transicoes) é a base do SLA e cada passagem conta.
-- Ajuste na poligonal do terreno (só ela mudou, com o que vem junto) junta
-- por 2 minutos: quem ajusta salva várias vezes seguidas e o histórico
-- mostra um "Ajuste na poligonal" só (decisão do Moisés, 24/out/2026).
create or replace function app.janela_log(p_tabela text default null, p_cols text[] default null)
returns interval language sql immutable as $$
  select case when p_tabela = 'terrenos' and 'poligono_geojson' = any(p_cols)
                   and p_cols <@ array['poligono_geojson','poligono','area_poligonal_m2','area_adotada_m2','latitude','longitude','precisao_localizacao','sobreposicoes_aceitas']
              then interval '2 minutes' else interval '7 seconds' end $$;

-- Colunas que mudaram entre dois retratos, sem as de controle.
create or replace function app.colunas_mudadas(a jsonb, b jsonb)
returns text[] language sql immutable set search_path = '' as $$
  select coalesce(array_agg(k order by k), '{}')
  from (select jsonb_object_keys(coalesce(a, '{}') || coalesce(b, '{}')) k) x
  where k not in ('atualizado_em', 'atualizado_por', 'versao')
    and (a -> k) is distinct from (b -> k) $$;

create or replace function app.juntar_auditoria(p_tabela text, p_old jsonb, p_new jsonb)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := p_new;
  v_cols text[] := app.colunas_mudadas(p_old, p_new);
  u app.auditoria;
begin
  if cardinality(v_cols) = 0 then return false; end if;
  select * into u from app.auditoria
  where tabela = p_tabela and registro_id = coalesce(v_row->>'id', v_row->>'tarefa_id', v_row->>'comentario_id', v_row->>'user_id')::uuid
  order by em desc, id desc limit 1;
  if not found or u.acao <> 'update' or u.user_id is distinct from auth.uid()
     or u.desfeito_em is not null or u.desfaz_id is not null  -- o desfazer e o desfeito não se juntam com nada
     or u.em < clock_timestamp() - app.janela_log(p_tabela, v_cols)
     or app.colunas_mudadas(u.antes, u.depois) <> v_cols then
    return false;
  end if;
  if app.colunas_mudadas(u.antes, p_new) && v_cols then
    update app.auditoria set depois = p_new, em = clock_timestamp() where id = u.id;
  else
    delete from app.auditoria where id = u.id;  -- voltou ao valor de antes: nada mudou
  end if;
  return true;
end $$;

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
  if tg_op = 'UPDATE' and tg_table_name <> 'processos' and coalesce(current_setting('app.desfazendo', true), '') <> '1'
     and app.juntar_auditoria(tg_table_name, v_old, v_new) then return new; end if;
  insert into app.auditoria (empresa_id, tabela, registro_id, acao, antes, depois)
  values ((v_row->>'empresa_id')::uuid, tg_table_name, coalesce(v_row->>'id', v_row->>'tarefa_id', v_row->>'comentario_id', v_row->>'user_id')::uuid, lower(tg_op), v_old, v_new);
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
create policy membros_admin_gerencia on app.membros for all to authenticated
  using (app.eh_administrador(empresa_id)) with check (app.eh_administrador(empresa_id));
create policy auditoria_gestor_ve on app.auditoria for select to authenticated
  using (app.eh_gestor(empresa_id));

grant select on app.empresas, app.auditoria to authenticated;
grant select, insert, update, delete on app.membros to authenticated;
revoke execute on function app.criar_empresa(text, text, uuid) from public, anon, authenticated;
create trigger t_aud after insert or update or delete on app.membros for each row execute function app.tg_auditoria();
