-- =====================================================================
-- Pastas do terreno no Google Drive (pedido do Moises, 12/nov/2026)
--
-- Cada terreno ganha uma pasta dentro de cada pasta da pasta-mãe do Drive compartilhado da
-- BKM (hoje "DI › 01) Novos Negócios", com 01) Documentos de Terrenos ... 07) Comunicações
-- Oficiais; uma pasta nova lá ganha as dos terrenos). Quem cria e renomeia é o serviço
-- terrenos-drive do Cloud Run (services/drive), com a conta de serviço dele, chamado pela
-- ficha e pelo cadastro com o login de quem edita. O nome é montado pelo serviço:
--   SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel
--   cidade (sigla desta tabela, senão o nome inteiro) _ zona (NA sem zona) _ BAIRRO _
--   ano e mês do cadastro _ código _ rua (com o tipo abreviado)
-- e refeito quando muda cidade, zona, bairro ou rua (a pasta é renomeada, nunca recriada).
--
-- Aqui ficam só as siglas das cidades (configuração; a tela entra com Configurações) e o
-- id e o nome de cada pasta criada, que só o serviço grava, pela função abaixo.
-- Feito para rodar também no SQL Editor do Supabase (idempotente).
-- =====================================================================

create table if not exists app.cidade_siglas (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid references app.empresas(id) on delete cascade,   -- nulo = padrão para todas
  municipio_id uuid not null references app.municipios(id),
  sigla        text not null check (sigla ~ '^[A-Z0-9]{1,8}$'),
  unique nulls not distinct (empresa_id, municipio_id)
);
alter table app.cidade_siglas enable row level security;
drop policy if exists ver on app.cidade_siglas;
create policy ver on app.cidade_siglas for select to authenticated
  using (empresa_id is null or empresa_id in (select app.minhas_empresas()));
grant select on app.cidade_siglas to authenticated;

insert into app.cidade_siglas (empresa_id, municipio_id, sigla)
select null, m.id, s.sigla
  from (values ('3550308', 'SP'), ('3549904', 'SJC')) s(ibge, sigla)
  join app.municipios m on m.codigo_ibge = s.ibge
on conflict do nothing;

-- Sigla da cidade na empresa (administrador; vazio tira a da empresa e volta à padrão ou ao nome inteiro)
create or replace function app.salvar_sigla_cidade(p_empresa uuid, p_municipio uuid, p_sigla text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v text := upper(nullif(btrim(coalesce(p_sigla, '')), ''));
begin
  perform app.exigir_administrador(p_empresa);
  if v is null then
    delete from app.cidade_siglas where empresa_id = p_empresa and municipio_id = p_municipio;
    return;
  end if;
  if v !~ '^[A-Z0-9]{1,8}$' then raise exception 'A sigla da cidade tem de 1 a 8 letras ou números' using errcode = '22023'; end if;
  insert into app.cidade_siglas (empresa_id, municipio_id, sigla) values (p_empresa, p_municipio, v)
  on conflict (empresa_id, municipio_id) do update set sigla = excluded.sigla;
end $$;

create table if not exists app.terreno_pastas_drive (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references app.empresas(id),
  terreno_id     uuid not null references app.terrenos(id) on delete cascade,
  pasta_mae_id   text not null,          -- id no Drive da pasta-modelo ("01) Documentos de Terrenos")
  pasta_mae_nome text,
  pasta_id       text not null,          -- id no Drive da pasta do terreno dentro dela
  nome           text not null,          -- nome com que a pasta está no Drive
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (terreno_id, pasta_mae_id)
);
alter table app.terreno_pastas_drive enable row level security;
drop policy if exists ver on app.terreno_pastas_drive;
create policy ver on app.terreno_pastas_drive for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and app.ve_terreno(terreno_id));
grant select on app.terreno_pastas_drive to authenticated;

-- O que o serviço precisa para montar o nome (só quem edita o terreno)
create or replace function app.drive_terreno(p_terreno uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare t app.terrenos; r jsonb;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  select jsonb_build_object(
    'id', t.id, 'empresa_id', t.empresa_id, 'codigo', t.codigo, 'criado_em', t.criado_em,
    'excluido', t.excluido_em is not null,
    'municipio', m.nome,
    'sigla', (select s.sigla from app.cidade_siglas s where s.municipio_id = t.municipio_id
                and (s.empresa_id = t.empresa_id or s.empresa_id is null) order by s.empresa_id nulls last limit 1),
    'zona', t.zona, 'bairro', t.bairro, 'logradouro', t.logradouro,
    'pastas', coalesce((select jsonb_agg(jsonb_build_object('pasta_mae_id', p.pasta_mae_id, 'pasta_id', p.pasta_id, 'nome', p.nome))
                          from app.terreno_pastas_drive p where p.terreno_id = t.id), '[]'))
    into r
    from (select 1) x left join app.municipios m on m.id = t.municipio_id;
  return r;
end $$;

-- O serviço grava a pasta criada ou renomeada (uma linha por pasta-modelo)
create or replace function app.registrar_pasta_drive(p_terreno uuid, p_pasta_mae text, p_pasta_mae_nome text, p_pasta text, p_nome text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.terrenos where id = p_terreno;
  if v_emp is null then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v_emp);
  if coalesce(p_pasta_mae, '') !~ '^[A-Za-z0-9_-]{10,100}$' or coalesce(p_pasta, '') !~ '^[A-Za-z0-9_-]{10,100}$' then
    raise exception 'Id de pasta do Drive inválido' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_nome, '')), '') is null or length(p_nome) > 400 then
    raise exception 'Nome de pasta inválido' using errcode = '22023';
  end if;
  insert into app.terreno_pastas_drive (empresa_id, terreno_id, pasta_mae_id, pasta_mae_nome, pasta_id, nome)
  values (v_emp, p_terreno, p_pasta_mae, left(p_pasta_mae_nome, 400), p_pasta, p_nome)
  on conflict (terreno_id, pasta_mae_id) do update
    set pasta_id = excluded.pasta_id, nome = excluded.nome, pasta_mae_nome = excluded.pasta_mae_nome, atualizado_em = now();
end $$;

revoke execute on function app.salvar_sigla_cidade(uuid, uuid, text), app.drive_terreno(uuid),
  app.registrar_pasta_drive(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function app.salvar_sigla_cidade(uuid, uuid, text), app.drive_terreno(uuid),
  app.registrar_pasta_drive(uuid, text, text, text, text) to authenticated;
