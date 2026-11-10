-- =====================================================================
-- Vários corretores por oferta e o card da oferta (pedido do Moises, 10/nov/2026)
--
-- Registrar oferta pede só o corretor e a observação (texto livre, ofertas.observacoes); o
-- valor pedido, a forma de pagamento e o resto ficam em Condições pedidas. O card da oferta
-- (o "i" na lista de ofertas) edita a data, a observação e a lista de corretores da oferta.
--
-- app.oferta_corretores guarda todos os corretores da oferta. ofertas.corretor_id continua
-- sendo o principal (o primeiro posto), que o resto do sistema lê (Resumo, filtros, funil):
--   * corretor posto na oferta (ofertas.corretor_id) entra na lista;
--   * o primeiro corretor da lista vira o principal quando a oferta não tem;
--   * tirado o principal, o mais antigo que sobrou passa a ser o principal (ou nenhum).
-- Todo corretor da oferta passa a constar no terreno (terreno_corretores), como antes.
-- Escrita direta (oferta é tabela sem regra, CLAUDE.md regra 2), com RLS e auditoria.
--
-- Feito para rodar também no SQL Editor do Supabase sobre o banco que já existe (idempotente).
-- =====================================================================

create table if not exists app.oferta_corretores (
  id          uuid primary key default gen_random_uuid(),
  oferta_id   uuid not null references app.ofertas(id) on delete cascade,
  corretor_id uuid not null references app.corretores(id),
  empresa_id  uuid not null references app.empresas(id),
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default clock_timestamp(),
  unique (oferta_id, corretor_id)
);
create index if not exists oferta_corretores_corretor on app.oferta_corretores (corretor_id);

-- os que já existem: o corretor de cada oferta entra na lista
insert into app.oferta_corretores (oferta_id, corretor_id, empresa_id, criado_por, criado_em)
select o.id, o.corretor_id, o.empresa_id, o.criado_por, o.criado_em from app.ofertas o
where o.corretor_id is not null
on conflict (oferta_id, corretor_id) do nothing;

-- oferta e corretor da mesma empresa da linha
create or replace function app.tg_oferta_corretor_lista()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.oferta_id <> old.oferta_id or new.corretor_id <> old.corretor_id) then
    raise exception 'Tire o corretor e ponha o outro' using errcode = '23514';
  end if;
  if not exists (select 1 from app.ofertas where id = new.oferta_id and empresa_id = new.empresa_id)
     or not exists (select 1 from app.corretores where id = new.corretor_id and empresa_id = new.empresa_id) then
    raise exception 'Corretor ou oferta de outra empresa' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t_lista on app.oferta_corretores;
create trigger t_lista before insert or update on app.oferta_corretores for each row execute function app.tg_oferta_corretor_lista();

-- depois de pôr ou tirar: o principal da oferta e o corretor no terreno
create or replace function app.tg_oferta_corretor_sync()
returns trigger language plpgsql security definer set search_path = '' as $$
declare o app.ofertas; v text := current_setting('app.automatico', true);
begin
  select * into o from app.ofertas where id = coalesce(new.oferta_id, old.oferta_id);
  if not found then return null; end if;  -- a oferta foi apagada (cascata)
  perform set_config('app.automatico', '1', true);  -- a troca do principal é consequência
  if tg_op = 'DELETE' then
    -- tirado o principal, o mais antigo que sobrou passa a ser o principal
    if o.corretor_id = old.corretor_id then
      update app.ofertas set corretor_id = (select x.corretor_id from app.oferta_corretores x where x.oferta_id = o.id order by x.criado_em, x.id limit 1)
       where id = o.id;
    end if;
  elsif o.corretor_id is null then
    update app.ofertas set corretor_id = new.corretor_id where id = o.id;  -- o trigger da oferta põe no terreno
  elsif o.status <> 'aguardando' then
    insert into app.terreno_corretores (terreno_id, corretor_id, empresa_id, principal)
    values (o.terreno_id, new.corretor_id, o.empresa_id, not exists (select 1 from app.terreno_corretores where terreno_id = o.terreno_id and principal))
    on conflict do nothing;
  end if;
  perform set_config('app.automatico', coalesce(v, ''), true);
  return null;
end $$;
drop trigger if exists t_lista_del on app.oferta_corretores;
drop trigger if exists t_sync on app.oferta_corretores;
create trigger t_sync after insert or delete on app.oferta_corretores for each row execute function app.tg_oferta_corretor_sync();
drop trigger if exists t_aud on app.oferta_corretores;
create trigger t_aud after insert or update or delete on app.oferta_corretores for each row execute function app.tg_auditoria();

-- o corretor posto na oferta (registro, cadastro ou Condições pedidas) entra na lista
create or replace function app.tg_oferta_corretor_principal()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text := current_setting('app.automatico', true);
begin
  if new.corretor_id is not null and (tg_op = 'INSERT' or new.corretor_id is distinct from old.corretor_id) then
    -- consequência da oferta: nos Logs fica dentro da ação de quem a fez, não como outra linha
    perform set_config('app.automatico', '1', true);
    insert into app.oferta_corretores (oferta_id, corretor_id, empresa_id) values (new.id, new.corretor_id, new.empresa_id)
    on conflict (oferta_id, corretor_id) do nothing;
    perform set_config('app.automatico', coalesce(v, ''), true);
  end if;
  return new;
end $$;
drop trigger if exists t_corretor_lista on app.ofertas;
create trigger t_corretor_lista after insert or update of corretor_id on app.ofertas for each row execute function app.tg_oferta_corretor_principal();

alter table app.oferta_corretores enable row level security;
drop policy if exists ver on app.oferta_corretores;
create policy ver on app.oferta_corretores for select to authenticated using (empresa_id in (select app.minhas_empresas()));
drop policy if exists inserir on app.oferta_corretores;
create policy inserir on app.oferta_corretores for insert to authenticated with check (empresa_id in (select app.empresas_edicao()));
drop policy if exists remover on app.oferta_corretores;
create policy remover on app.oferta_corretores for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
grant select, insert, delete on app.oferta_corretores to authenticated;

-- ---------------------------------------------------------------------
-- Permissões (as funções novas não ficam abertas a public; ver sql-avulso-revoke)
-- ---------------------------------------------------------------------
revoke execute on function app.tg_oferta_corretor_lista(), app.tg_oferta_corretor_sync(), app.tg_oferta_corretor_principal() from public, anon, authenticated;
