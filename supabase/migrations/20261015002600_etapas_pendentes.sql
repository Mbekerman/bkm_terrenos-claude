-- =====================================================================
-- Etapa deixada com pendências (pedido do Moises, 12/nov/2026)
--
-- Quem avança passando por cima do que a etapa pedia (avanço forçado, ou com justificativa)
-- escolhe na janela do avanço:
--   * "Considerar concluída": como sempre foi; a etapa fica concluída na linha do tempo;
--   * "Deixar com pendências": a etapa deixada fica marcada (app.etapas_pendentes) e, na
--     ficha, a linha do tempo mostra o alerta laranja no lugar do check, com a lista do que
--     falta, e os itens continuam na lista "Falta..." até serem cumpridos ou alguém
--     "Considerar concluída" depois.
--
-- O que falta é medido ao vivo (app._pendencias sobre a etapa deixada, como se o terreno
-- ainda estivesse nela, rumo à etapa seguinte): cumprido o item, ele sai da lista; sem nada
-- faltando, a etapa volta a aparecer concluída. Os itens do momento ficam guardados em
-- `itens`, só para o histórico.
--
-- A escolha chega em app.mover_etapa(..., p_pendencias => 'deixar') e vai junto no pedido
-- de aprovação (aprovacoes.dados->>'pendencias'), para valer também quando a passagem só
-- acontece depois de aprovada. Quem grava a linha é o trigger da transição de avanço
-- forçado; voltar de etapa encerra as linhas das etapas de onde se voltou (motivo 'retorno').
--
-- Fora daqui por ora: concluir a fase (Comprado) e trocar de subetapa com pendências.
-- Feito para rodar também no SQL Editor do Supabase sobre o banco que já existe (idempotente).
-- =====================================================================

create table if not exists app.etapas_pendentes (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references app.empresas(id),
  terreno_id       uuid not null references app.terrenos(id) on delete cascade,
  processo_id      uuid not null references app.processos(id) on delete cascade,
  fase             text not null,
  etapa            text not null,
  itens            jsonb not null default '[]'::jsonb,
  transicao_id     uuid references app.processo_transicoes(id) on delete set null,
  criado_por       uuid default auth.uid(),
  criado_em        timestamptz not null default clock_timestamp(),
  encerrada_em     timestamptz,
  encerrada_por    uuid,
  encerrada_motivo text check (encerrada_motivo in ('concluida','retorno')),
  check ((encerrada_em is null) = (encerrada_motivo is null))
);
create unique index if not exists etapas_pendentes_aberta on app.etapas_pendentes (processo_id, etapa) where encerrada_em is null;
create index if not exists etapas_pendentes_terreno on app.etapas_pendentes (terreno_id);

alter table app.etapas_pendentes enable row level security;
drop policy if exists ver on app.etapas_pendentes;
create policy ver on app.etapas_pendentes for select to authenticated using (empresa_id in (select app.minhas_empresas()));
-- escrita só pelas funções abaixo
revoke all on app.etapas_pendentes from public, anon, authenticated;
grant select on app.etapas_pendentes to authenticated;
drop trigger if exists t_aud on app.etapas_pendentes;
create trigger t_aud after insert or update or delete on app.etapas_pendentes for each row execute function app.tg_auditoria();

-- O que ainda falta da etapa deixada: as pendências de sair dela rumo à seguinte (ou concluir
-- a fase, se era a última), com o processo como se ainda estivesse nela. Só os itens não
-- cumpridos; "Só avisa" não conta.
create or replace function app._pendencias_etapa(p_processo uuid, p_etapa text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare p app.processos; v_prox text; v_tipo text := 'etapa'; itens jsonb;
begin
  select * into p from app.processos where id = p_processo;
  if not found then return '[]'::jsonb; end if;
  select e2.codigo into v_prox
    from app.etapas_modelo e1 join app.etapas_modelo e2 on e2.empresa_id = e1.empresa_id and e2.fase = e1.fase and e2.ordem > e1.ordem
   where e1.empresa_id = p.empresa_id and e1.fase = p.fase and e1.codigo = p_etapa
   order by e2.ordem limit 1;
  if v_prox is null then v_tipo := 'status'; v_prox := 'concluido'; end if;
  p.etapa_atual := p_etapa;
  p.subetapa_atual := app._subetapa_inicial(p.empresa_id, p.fase, p_etapa);
  itens := app._pendencias(p, v_tipo, v_prox);
  return coalesce((select jsonb_agg(i) from jsonb_array_elements(itens) i
                    where (i->>'ok')::boolean is not true and not coalesce((i->>'aviso')::boolean, false)), '[]'::jsonb);
end $$;

-- Grava a etapa deixada com pendências (avanço forçado com a escolha "deixar") e encerra as
-- etapas de onde se voltou.
create or replace function app.tg_transicao_pendencias()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_escolha text; p app.processos; v_itens jsonb; v_auto text := current_setting('app.automatico', true); v_ordem int;
begin
  if new.evento = 'avanco' and new.forcado then
    if new.aprovacao_id is not null then
      select dados->>'pendencias' into v_escolha from app.aprovacoes where id = new.aprovacao_id;
    else
      v_escolha := nullif(current_setting('app.pendencias_etapa', true), '');
    end if;
    if v_escolha = 'deixar' then
      v_itens := app._pendencias_etapa(new.processo_id, new.de_etapa);
      if jsonb_array_length(v_itens) > 0 then
        select * into p from app.processos where id = new.processo_id;
        perform set_config('app.automatico', '1', true);  -- consequência do avanço, que já tem o seu log
        insert into app.etapas_pendentes (empresa_id, terreno_id, processo_id, fase, etapa, itens, transicao_id, criado_por)
        select p.empresa_id, p.terreno_id, p.id, p.fase, new.de_etapa, v_itens, new.id, coalesce(new.user_id, auth.uid())
         where not exists (select 1 from app.etapas_pendentes x where x.processo_id = p.id and x.etapa = new.de_etapa and x.encerrada_em is null);
        perform set_config('app.automatico', coalesce(v_auto, ''), true);
      end if;
    end if;
  elsif new.evento = 'retorno' then
    select e.ordem into v_ordem from app.processos pr
      join app.etapas_modelo e on e.empresa_id = pr.empresa_id and e.fase = pr.fase and e.codigo = new.para_etapa
     where pr.id = new.processo_id;
    if exists (select 1 from app.etapas_pendentes where processo_id = new.processo_id and encerrada_em is null) then
      perform set_config('app.automatico', '1', true);
      update app.etapas_pendentes x set encerrada_em = clock_timestamp(), encerrada_por = coalesce(new.user_id, auth.uid()), encerrada_motivo = 'retorno'
       where x.processo_id = new.processo_id and x.encerrada_em is null
         and coalesce((select e.ordem from app.etapas_modelo e where e.empresa_id = x.empresa_id and e.fase = x.fase and e.codigo = x.etapa), 0) >= v_ordem;
      perform set_config('app.automatico', coalesce(v_auto, ''), true);
    end if;
  end if;
  return null;
end $$;
drop trigger if exists t_pendencias on app.processo_transicoes;
create trigger t_pendencias after insert on app.processo_transicoes for each row execute function app.tg_transicao_pendencias();

-- As etapas deixadas com pendências do terreno (em aberto), com o que falta agora.
-- resolvida = nada mais falta (a ficha mostra como concluída).
create or replace function app.pendencias_etapas(p_terreno uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare v_empresa uuid; out jsonb := '[]'::jsonb; r record; v_itens jsonb;
begin
  select empresa_id into v_empresa from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_membro(v_empresa);
  for r in select x.*, e.nome as etapa_nome, e.ordem, pr.parte_id, tp.nome as parte_nome
             from app.etapas_pendentes x
             join app.processos pr on pr.id = x.processo_id
             left join app.etapas_modelo e on e.empresa_id = x.empresa_id and e.fase = x.fase and e.codigo = x.etapa
             left join app.terreno_partes tp on tp.id = pr.parte_id
            where x.terreno_id = p_terreno and x.encerrada_em is null
            order by x.fase, e.ordem loop
    v_itens := app._pendencias_etapa(r.processo_id, r.etapa);
    out := out || jsonb_build_object('id', r.id, 'processo_id', r.processo_id, 'parte_id', r.parte_id, 'parte_nome', r.parte_nome,
      'fase', r.fase, 'etapa', r.etapa, 'etapa_nome', coalesce(r.etapa_nome, r.etapa), 'criado_em', r.criado_em, 'criado_por', r.criado_por,
      'itens', v_itens, 'resolvida', jsonb_array_length(v_itens) = 0);
  end loop;
  return out;
end $$;

-- "Considerar concluída" depois: a etapa deixa de ter pendências na ficha (fica no histórico).
create or replace function app.considerar_etapa_concluida(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare x app.etapas_pendentes;
begin
  select * into x from app.etapas_pendentes where id = p_id for update;
  if not found then raise exception 'Etapa pendente não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(x.empresa_id);
  if x.encerrada_em is not null then return; end if;
  update app.etapas_pendentes set encerrada_em = clock_timestamp(), encerrada_por = auth.uid(), encerrada_motivo = 'concluida' where id = p_id;
end $$;

-- mover_etapa ganha a escolha: p_pendencias = 'deixar' deixa a etapa com pendências
-- (só vale quando o avanço passa por cima de algo; senão, nada muda).
drop function if exists app.mover_etapa(uuid, boolean, text);
create or replace function app.mover_etapa(p_processo uuid, p_forcar boolean default false, p_comentario text default null, p_pendencias text default null)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare p app.processos; v_prox text; r jsonb;
begin
  if p_pendencias is not null and p_pendencias not in ('deixar','concluida') then
    raise exception 'Escolha inválida para as pendências' using errcode = '22023';
  end if;
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Processo não encontrado' using errcode = 'P0002'; end if;
  select e2.codigo into v_prox
    from app.etapas_modelo e1 join app.etapas_modelo e2 on e2.empresa_id = e1.empresa_id and e2.fase = e1.fase and e2.ordem > e1.ordem
   where e1.empresa_id = p.empresa_id and e1.fase = p.fase and e1.codigo = p.etapa_atual
   order by e2.ordem limit 1;
  if v_prox is null then raise exception 'Não há próxima etapa: na última, conclua a fase' using errcode = '22023'; end if;
  perform set_config('app.pendencias_etapa', coalesce(p_pendencias, ''), true);
  r := app._passagem(p.id, 'etapa', v_prox, p_forcar, p_comentario,
                     case when p_pendencias is null then '{}'::jsonb else jsonb_build_object('pendencias', p_pendencias) end);
  perform set_config('app.pendencias_etapa', '', true);
  return app.checar_passagem(p.id) || r;
end $$;

revoke execute on function app._pendencias_etapa(uuid, text) from public, anon, authenticated;
revoke execute on function app.tg_transicao_pendencias() from public, anon, authenticated;
revoke execute on function app.pendencias_etapas(uuid) from public, anon, authenticated;
revoke execute on function app.considerar_etapa_concluida(uuid) from public, anon, authenticated;
revoke execute on function app.mover_etapa(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function app.pendencias_etapas(uuid) to authenticated;
grant execute on function app.considerar_etapa_concluida(uuid) to authenticated;
grant execute on function app.mover_etapa(uuid, boolean, text, text) to authenticated;
