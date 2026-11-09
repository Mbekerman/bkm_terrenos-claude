-- =====================================================================
-- Excluir e deletar terreno (pedido do Moises, 9/nov/2026)
--
-- Excluir (diretor ou administrador): o terreno some de todos os lugares
--   (lista, mapa, funil, Backlog, busca, tarefas, sino). Nada é apagado: a RLS
--   de leitura esconde o terreno e o que se lê dele pela empresa (processos,
--   notificações). Fica guardado 180 dias; depois a rotina diária apaga de vez.
--   O administrador vê a lista em Configurações › Terrenos excluídos e restaura.
-- Deletar (só administrador): apaga na hora tudo o que é do terreno, inclusive
--   os logs dele, depois de digitar o nome do terreno. Fica só uma linha em
--   app.terrenos_apagados (código, nome, quem, quando) com as pendências de fora
--   do banco: os arquivos do storage e, quando existir, a pasta do Drive. Uma
--   função do servidor apaga essas pendências e marca limpo_em (gancho).
-- =====================================================================

-- verdadeiro se o terreno existe e está excluído (para as rotinas, que leem sem RLS)
create or replace function app.terreno_excluido(p_terreno uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.terrenos where id = p_terreno and excluido_em is not null) $$;
revoke execute on function app.terreno_excluido(uuid) from public;
grant execute on function app.terreno_excluido(uuid) to authenticated;

-- ids dos terrenos excluídos das empresas de quem lê (uma vez por consulta nas políticas)
create or replace function app.terrenos_ocultos()
returns setof uuid language sql stable security definer set search_path = '' as $$
  select id from app.terrenos
  where excluido_em is not null and empresa_id in (select app.minhas_empresas()) $$;
revoke execute on function app.terrenos_ocultos() from public;
grant execute on function app.terrenos_ocultos() to authenticated;

-- Leitura: o terreno excluído não aparece em nenhuma consulta do app (as views são security_invoker)
drop policy if exists ver on app.terrenos;
create policy ver on app.terrenos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and excluido_em is null);
-- processos e notificações são lidos pela empresa inteira (funil, mapa, filtros, sino): escondem os do excluído
drop policy if exists ver on app.processos;
create policy ver on app.processos for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and terreno_id not in (select app.terrenos_ocultos()));
drop policy if exists ver on app.notificacoes;
create policy ver on app.notificacoes for select to authenticated
  using (destinatario_id = auth.uid() and empresa_id in (select app.minhas_empresas())
         and (terreno_id is null or terreno_id not in (select app.terrenos_ocultos())));

-- Excluído não se edita (salvar_terreno e as RPCs que mexem no terreno): só restaurar tira a marca
create or replace function app.tg_terreno_excluido()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.excluido_em is not null and new.excluido_em is not null then
    raise exception 'Terreno não encontrado' using errcode = 'P0002';
  end if;
  return new;
end $$;
drop trigger if exists t_excluido on app.terrenos;
create trigger t_excluido before update on app.terrenos for each row execute function app.tg_terreno_excluido();

-- Registro do que foi apagado de vez e gancho para a limpeza fora do banco
create table if not exists app.terrenos_apagados (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  terreno_id    uuid not null,
  codigo        text not null,
  nome          text not null,
  apagado_em    timestamptz not null default now(),
  apagado_por   uuid,                         -- nulo = a rotina, 180 dias depois da exclusão
  -- fora do banco: {"storage": ["caminho", ...], "drive": ["id da pasta", ...]}; quem apaga marca limpo_em
  pendencias    jsonb not null default '{}',
  limpo_em      timestamptz
);
alter table app.terrenos_apagados enable row level security;
drop policy if exists ver on app.terrenos_apagados;
create policy ver on app.terrenos_apagados for select to authenticated using (app.eh_administrador(empresa_id));
grant select on app.terrenos_apagados to authenticated;

-- ---------------------------------------------------------------------
-- Excluir e restaurar
-- ---------------------------------------------------------------------
create or replace function app.excluir_terreno(p_terreno uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found or t.empresa_id not in (select app.minhas_empresas()) or t.excluido_em is not null then
    raise exception 'Terreno não encontrado' using errcode = 'P0002';
  end if;
  if not app.eh_diretoria(t.empresa_id) then
    raise exception 'Só diretor ou administrador excluem terreno' using errcode = '42501';
  end if;
  update app.terrenos set excluido_em = now(), excluido_por = auth.uid() where id = t.id;
end $$;

create or replace function app.restaurar_terreno(p_terreno uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare t app.terrenos;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found or t.empresa_id not in (select app.minhas_empresas()) or t.excluido_em is null then
    raise exception 'Terreno excluído não encontrado' using errcode = 'P0002';
  end if;
  if not app.eh_diretoria(t.empresa_id) then
    raise exception 'Só diretor ou administrador restauram terreno' using errcode = '42501';
  end if;
  update app.terrenos set excluido_em = null, excluido_por = null where id = t.id;
  return t.codigo;
end $$;

-- Lista do administrador: os excluídos, do mais recente ao mais antigo, com o dia em que somem de vez
create or replace function app.terrenos_excluidos(p_empresa uuid)
returns table (id uuid, codigo text, nome text, municipio text, excluido_em timestamptz, excluido_por_nome text, apagar_em date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  return query
    select t.id, t.codigo, t.nome, m.nome || '/' || m.uf, t.excluido_em, coalesce(nullif(trim(mb.nome), ''), u.nome, u.email),
           (t.excluido_em + interval '180 days')::date
    from app.terrenos t
    left join app.municipios m on m.id = t.municipio_id
    left join app.usuarios u on u.user_id = t.excluido_por
    left join app.membros mb on mb.empresa_id = t.empresa_id and mb.user_id = t.excluido_por
    where t.empresa_id = p_empresa and t.excluido_em is not null
    order by t.excluido_em desc;
end $$;

-- ---------------------------------------------------------------------
-- Apagar de vez
-- ---------------------------------------------------------------------
-- Apaga o terreno e tudo o que é dele, sem conferir permissão (quem chama confere).
-- A ordem respeita as chaves estrangeiras que não apagam em cascata; o resto vai
-- pelo "on delete cascade" do terreno. Os logs do terreno e das linhas dele saem
-- também. Devolve o id da linha em app.terrenos_apagados.
create or replace function app._apagar_terreno(p_terreno uuid, p_por uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare t app.terrenos; v_arqs jsonb; v_id uuid; v_procs uuid[]; v_quadros uuid[]; v_tarefas uuid[]; v_ids uuid[];
        v_aud0 bigint := coalesce((select max(id) from app.auditoria), 0);
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform set_config('app.apagando_terreno', '1', true);   -- as travas de "não se apaga" deixam passar

  -- arquivos no storage: apagados fora do banco (a API do storage não deixa apagar pelo SQL)
  select coalesce(jsonb_agg(distinct v.storage_path), '[]') into v_arqs
  from app.documento_versoes v join app.documentos d on d.id = v.documento_id where d.terreno_id = t.id;

  v_procs := array(select id from app.processos where terreno_id = t.id);
  v_quadros := array(select id from fluxo.quadros where objeto_tipo = 'terreno' and objeto_id = t.id);
  v_tarefas := array(select id from fluxo.tarefas where quadro_id = any(v_quadros) or processo_id = any(v_procs));
  -- tudo o que tem log e é do terreno, para apagar os logs no fim
  v_ids := array[t.id] || v_procs || v_tarefas
    || array(select id from app.propostas where processo_id = any(v_procs))
    || array(select id from app.documentos where terreno_id = t.id)
    || array(select id from app.reunioes where terreno_id = t.id)
    || array(select id from app.ofertas where terreno_id = t.id)
    || array(select id from app.viabilidades where terreno_id = t.id)
    || array(select id from app.matriculas where terreno_id = t.id)
    || array(select id from app.inscricoes_municipais where terreno_id = t.id)
    || array(select id from app.terreno_partes where terreno_id = t.id);

  -- quadro e cartões do terreno (fluxo não conhece terreno: aponta pelo tipo e id)
  delete from fluxo.automacao_execucoes where tarefa_id = any(v_tarefas);
  delete from fluxo.anexos where tarefa_id = any(v_tarefas) or tarefa_ref_id = any(v_tarefas);
  update fluxo.checklist_itens set virou_tarefa_id = null where virou_tarefa_id = any(v_tarefas);
  delete from fluxo.tarefas where id = any(v_tarefas);
  delete from fluxo.quadros where id = any(v_quadros);

  delete from app.diligencias where terreno_id = t.id or processo_id = any(v_procs);
  delete from app.documentos where terreno_id = t.id or processo_id = any(v_procs);
  delete from app.atividades where terreno_id = t.id or processo_id = any(v_procs);
  delete from app.reunioes where terreno_id = t.id or processo_id = any(v_procs);
  delete from app.propostas where processo_id = any(v_procs);
  delete from app.negociacoes where processo_id = any(v_procs) or oferta_referencia_id in (select id from app.ofertas where terreno_id = t.id);
  delete from app.processos where id = any(v_procs);
  delete from app.ofertas where terreno_id = t.id;
  delete from app.viabilidades where terreno_id = t.id;
  delete from app.terreno_pessoas where terreno_id = t.id;
  delete from app.terrenos where id = t.id;   -- o resto vai em cascata

  -- logs: os antigos do terreno e das linhas dele, e os que esta própria exclusão acabou de gravar
  delete from app.auditoria where registro_id = any(v_ids)
     or (antes ->> 'terreno_id') = t.id::text or (depois ->> 'terreno_id') = t.id::text
     or (id > v_aud0 and xmin = pg_current_xact_id()::xid);
  perform set_config('app.apagando_terreno', '', true);

  -- sem nada fora do banco, já nasce limpo; senão, a função do servidor apaga e chama app.limpeza_feita
  insert into app.terrenos_apagados (empresa_id, terreno_id, codigo, nome, apagado_por, pendencias, limpo_em)
  values (t.empresa_id, t.id, t.codigo, t.nome, p_por,
          jsonb_build_object('storage', v_arqs, 'drive', '[]'::jsonb),   -- Drive: a pasta do terreno, quando existir
          case when jsonb_array_length(v_arqs) = 0 then now() end)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function app._apagar_terreno(uuid, uuid) from public;

-- Deletar pela ficha ou pela lista de excluídos: só o administrador, digitando o nome do terreno.
-- O storage não deixa o app apagar arquivo (sem política de delete, de propósito): os caminhos ficam em
-- app.terrenos_apagados.pendencias para a função do servidor (a fazer, junto com o Drive).
create or replace function app.deletar_terreno(p_terreno uuid, p_nome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.terrenos; v_id uuid;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found or t.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Terreno não encontrado' using errcode = 'P0002';
  end if;
  if not app.eh_administrador(t.empresa_id) then
    raise exception 'Só o administrador deleta terreno' using errcode = '42501';
  end if;
  if lower(regexp_replace(trim(coalesce(p_nome, '')), '\s+', ' ', 'g')) <> lower(regexp_replace(trim(t.nome), '\s+', ' ', 'g')) then
    raise exception 'Digite o nome do terreno para confirmar' using errcode = '22023';
  end if;
  v_id := app._apagar_terreno(t.id, auth.uid());
  return (select jsonb_build_object('id', id, 'codigo', codigo, 'storage', pendencias -> 'storage') from app.terrenos_apagados where id = v_id);
end $$;

-- A função do servidor (ou o administrador) avisa que apagou os arquivos de fora do banco
create or replace function app.limpeza_feita(p_apagado uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update app.terrenos_apagados set limpo_em = now()
  where id = p_apagado and limpo_em is null and app.eh_administrador(empresa_id);
end $$;

-- Rotina diária: apaga de vez os excluídos há mais de 180 dias
create or replace function app.purgar_terrenos_excluidos(p_hoje date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0;
begin
  for r in select id from app.terrenos where excluido_em is not null and excluido_em::date + 180 <= p_hoje loop
    perform app._apagar_terreno(r.id, null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function app.purgar_terrenos_excluidos(date) from public;

-- funções criadas depois da migration de regras nascem executáveis por public: fecha e libera só as da tela
revoke execute on function app.excluir_terreno(uuid), app.restaurar_terreno(uuid), app.terrenos_excluidos(uuid),
  app.deletar_terreno(uuid, text), app.limpeza_feita(uuid), app.tg_terreno_excluido() from public;
grant execute on function app.excluir_terreno(uuid), app.restaurar_terreno(uuid), app.terrenos_excluidos(uuid),
  app.deletar_terreno(uuid, text), app.limpeza_feita(uuid) to authenticated;
