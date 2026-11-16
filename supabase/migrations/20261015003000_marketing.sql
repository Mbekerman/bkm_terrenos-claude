-- =====================================================================
-- BKM Terrenos · papel Marketing (pedido do Moises, 16/nov/2026)
-- Quem é do Marketing entra só na página Mapa e vê a concorrência (Órulo), as camadas de renda e de
-- densidade do IBGE e os terrenos comprados, sem clique nem ficha. Os outros terrenos (prospecção,
-- negociação, Stand By, perdidos, descartados) não chegam ao navegador dela.
--
-- A barreira é o banco, não a tela: `app.minhas_empresas()`, `app.eh_membro()` e `app.ve_terreno()`,
-- que abrem a leitura de todas as tabelas, visões, funções e arquivos da empresa, deixam o marketing
-- de fora. O que o marketing lê do sistema sai só por `app.mapa_comprados()`: código, nome, ponto e
-- poligonal dos terrenos comprados. A concorrência e os setores do IBGE não passam por aqui (vêm do
-- monitor do Órulo e de arquivos públicos do próprio site).
--
-- "Comprado" = o processo do terreno inteiro (sem parte) na fase de entrada (Novos Negócios) com o
-- status `concluido`; com partes, ele só fica assim quando todas as partes ativas estão compradas.
-- O terreno continua comprado quando passa às fases seguintes (Aprovação, Obras...).
-- =====================================================================

alter table app.membros drop constraint membros_papel_check;
alter table app.membros add constraint membros_papel_check
  check (papel in ('diretor','gestor','analista','leitura','basico','marketing'));
-- marketing não administra nem entra na hierarquia (não aprova nem responde a ninguém)
alter table app.membros add constraint membros_marketing_check
  check (papel <> 'marketing' or (not administrador and superior_id is null));

alter table app.equipe_prevista drop constraint equipe_prevista_papel_check;
alter table app.equipe_prevista add constraint equipe_prevista_papel_check
  check (papel in ('diretor','gestor','analista','leitura','basico','marketing'));
alter table app.equipe_prevista add constraint equipe_prevista_marketing_check
  check (papel <> 'marketing' or (not administrador and superior_email is null));

-- Leitura da empresa: todos os papéis menos o marketing.
create or replace function app.minhas_empresas()
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select empresa_id from app.membros where user_id = auth.uid() and papel <> 'marketing' $$;

create or replace function app.eh_membro(p_empresa uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from app.membros where user_id = auth.uid() and empresa_id = p_empresa and papel <> 'marketing') $$;

create or replace function app.ve_terreno(p_terreno uuid, p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.terrenos t join app.membros m on m.empresa_id = t.empresa_id and m.user_id = p_user
                 where t.id = p_terreno and t.excluido_em is null and m.papel <> 'marketing') $$;

-- Empresas em que a pessoa é do marketing: só para ela ler o próprio vínculo e o nome da empresa.
create or replace function app.empresas_marketing()
returns setof uuid
language sql stable security definer set search_path = ''
as $$ select empresa_id from app.membros where user_id = auth.uid() and papel = 'marketing' $$;

-- Cada um sempre lê o próprio vínculo (é por ele que a tela sabe o papel); o marketing, também o nome da empresa.
create policy membros_eu on app.membros for select to authenticated using (user_id = auth.uid());
create policy empresas_marketing on app.empresas for select to authenticated using (id in (select app.empresas_marketing()));

-- Terrenos comprados para o mapa do marketing: só o que o mapa desenha.
create or replace function app.mapa_comprados(p_empresa uuid)
returns table (codigo text, nome text, latitude double precision, longitude double precision, poligono_geojson jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (select 1 from app.membros where user_id = auth.uid() and empresa_id = p_empresa) then
    raise exception 'Sem acesso a esta empresa' using errcode = '42501';
  end if;
  return query
    select t.codigo, t.nome, t.latitude::double precision, t.longitude::double precision, t.poligono_geojson
      from app.terrenos t
     where t.empresa_id = p_empresa and t.excluido_em is null and t.situacao_cadastral = 'ativo' and t.em_espera_de is null
       and t.latitude is not null and t.longitude is not null
       and exists (select 1 from app.processos p join app.fases_modelo f on f.empresa_id = p.empresa_id and f.codigo = p.fase and f.entrada
                    where p.terreno_id = t.id and p.parte_id is null and p.status = 'concluido')
     order by t.codigo;
end $$;

revoke execute on function app.empresas_marketing(), app.mapa_comprados(uuid) from public, anon, authenticated;
grant execute on function app.empresas_marketing(), app.mapa_comprados(uuid) to authenticated;
