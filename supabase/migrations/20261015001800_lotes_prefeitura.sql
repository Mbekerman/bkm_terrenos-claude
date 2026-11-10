-- =====================================================================
-- Lotes da prefeitura guardados (pedido do Moises, 10/nov/2026)
--
-- Em São José dos Campos o GeoSanja não entrega a camada de lotes: o mapa de
-- lotes monta cada quadra perguntando lote por lote (ver apps/web/src/novo/
-- lotesSjc.ts). Cada quadra montada fica guardada aqui, e a próxima vez que
-- alguém abrir o mapa naquela quadra os lotes vêm da base, sem perguntar ao
-- GeoSanja de novo. Quadra montada há mais de 90 dias é montada outra vez (o
-- loteamento pode ter mudado), e o lote que alguém acrescenta clicando fora dos
-- lotes também entra. Só o desenho e a inscrição do lote, que são dados públicos
-- da prefeitura; nada do terreno.
--
-- app.lotes_prefeitura: um lote por linha, o desenho em UTM 23S (metros), como
--   o mapa de lotes usa, com o retângulo que o contém para achar pela área.
-- app.quadras_prefeitura: a quadra montada inteira e quando.
-- Leitura por quem é da empresa; gravação só por app.guardar_lotes_prefeitura.
-- =====================================================================

create table app.lotes_prefeitura (
  empresa_id     uuid not null references app.empresas(id) on delete cascade,
  base           text not null references app.bases_cadastrais(codigo),
  inscricao_norm text not null check (inscricao_norm ~ '^\d+$'),
  quadra         text not null check (quadra ~ '^\d+$'),
  anel           jsonb not null check (jsonb_typeof(anel) = 'array' and jsonb_array_length(anel) >= 4),  -- [[x, y], ...] UTM 23S, fechado
  x0 numeric(12,2) not null, y0 numeric(12,2) not null, x1 numeric(12,2) not null, y1 numeric(12,2) not null,
  area_m2        numeric(12,2) check (area_m2 > 0),  -- pelo desenho
  visto_em       timestamptz not null default now(),  -- a primeira vez que veio da prefeitura
  conferido_em   timestamptz not null default now(),  -- a última vez que veio da prefeitura
  check (x0 <= x1 and y0 <= y1),
  check (left(inscricao_norm, length(quadra)) = quadra),
  primary key (empresa_id, base, inscricao_norm)
);
create index on app.lotes_prefeitura (empresa_id, base, quadra);
create index on app.lotes_prefeitura (empresa_id, base, x0, x1);

create table app.quadras_prefeitura (
  empresa_id   uuid not null references app.empresas(id) on delete cascade,
  base         text not null references app.bases_cadastrais(codigo),
  quadra       text not null check (quadra ~ '^\d+$'),
  montada_em   timestamptz not null default now(),
  montada_por  uuid references auth.users(id) default auth.uid(),
  lotes        int not null default 0 check (lotes >= 0),
  primary key (empresa_id, base, quadra)
);

alter table app.lotes_prefeitura enable row level security;
alter table app.quadras_prefeitura enable row level security;
create policy ver on app.lotes_prefeitura for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy ver on app.quadras_prefeitura for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.lotes_prefeitura, app.quadras_prefeitura to authenticated;

-- Guarda os lotes que vieram da prefeitura e, das quadras montadas inteiras, a
-- data. p_lotes: [{"inscricao": "41.0024.0011.0000", "quadra": "410024", "anel": [[x, y], ...], "area_m2": 312.5}].
-- Numa quadra montada inteira, o lote guardado que não veio desta vez saiu do
-- cadastro e é apagado. O lote marcado "da_base": true veio desta mesma base
-- (não foi perguntado à prefeitura agora): conta como presente na quadra, mas
-- não é regravado nem tem a conferência renovada. Devolve quantos lotes gravou.
create or replace function app.guardar_lotes_prefeitura(p_empresa uuid, p_base text, p_lotes jsonb, p_quadras text[] default '{}')
returns int language plpgsql security definer set search_path = '' as $$
declare l jsonb; n int := 0; v_ic text; v_q text; v_an jsonb; xs numeric[]; ys numeric[];
begin
  if p_empresa is null or p_empresa not in (select app.empresas_edicao()) then
    raise exception 'Sem permissão para gravar nesta empresa' using errcode = '42501';
  end if;
  if not exists (select 1 from app.bases_cadastrais where codigo = p_base) then
    raise exception 'Base cadastral desconhecida' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_lotes, '[]')) <> 'array' or jsonb_array_length(coalesce(p_lotes, '[]')) > 3000 then
    raise exception 'Lista de lotes inválida' using errcode = '22023';
  end if;
  if coalesce(array_length(p_quadras, 1), 0) > 20 then
    raise exception 'Quadras demais de uma vez' using errcode = '22023';
  end if;
  for l in select * from jsonb_array_elements(coalesce(p_lotes, '[]')) loop
    continue when coalesce(l->>'da_base', '') = 'true';
    v_ic := regexp_replace(coalesce(l->>'inscricao', ''), '\D', '', 'g');
    v_q := regexp_replace(coalesce(l->>'quadra', ''), '\D', '', 'g');
    v_an := l->'anel';
    if v_ic = '' or v_q = '' or jsonb_typeof(v_an) <> 'array' or jsonb_array_length(v_an) < 4 or jsonb_array_length(v_an) > 2000
       or exists (select 1 from jsonb_array_elements(v_an) p where jsonb_typeof(p) <> 'array' or jsonb_array_length(p) <> 2
                  or jsonb_typeof(p->0) <> 'number' or jsonb_typeof(p->1) <> 'number') then
      raise exception 'Lote inválido: %', coalesce(l->>'inscricao', '?') using errcode = '22023';
    end if;
    select array_agg((p->>0)::numeric), array_agg((p->>1)::numeric) into xs, ys from jsonb_array_elements(v_an) p;
    insert into app.lotes_prefeitura (empresa_id, base, inscricao_norm, quadra, anel, x0, y0, x1, y1, area_m2)
    values (p_empresa, p_base, v_ic, v_q, v_an,
            (select min(x) from unnest(xs) x), (select min(y) from unnest(ys) y), (select max(x) from unnest(xs) x), (select max(y) from unnest(ys) y),
            nullif((l->>'area_m2')::numeric, 0))
    on conflict (empresa_id, base, inscricao_norm) do update
      set quadra = excluded.quadra, anel = excluded.anel, x0 = excluded.x0, y0 = excluded.y0, x1 = excluded.x1, y1 = excluded.y1,
          area_m2 = excluded.area_m2, conferido_em = now();
    n := n + 1;
  end loop;
  if coalesce(array_length(p_quadras, 1), 0) > 0 then
    -- quadra montada inteira: o que estava guardado e não veio saiu do cadastro
    delete from app.lotes_prefeitura lp
    where lp.empresa_id = p_empresa and lp.base = p_base and lp.quadra = any (p_quadras)
      and lp.inscricao_norm not in (select regexp_replace(coalesce(e->>'inscricao', ''), '\D', '', 'g') from jsonb_array_elements(coalesce(p_lotes, '[]')) e);
    insert into app.quadras_prefeitura (empresa_id, base, quadra, lotes)
    select p_empresa, p_base, q, (select count(*) from app.lotes_prefeitura where empresa_id = p_empresa and base = p_base and quadra = q)
    from unnest(p_quadras) q
    on conflict (empresa_id, base, quadra) do update set montada_em = now(), montada_por = auth.uid(), lotes = excluded.lotes;
  end if;
  return n;
end $$;
revoke execute on function app.guardar_lotes_prefeitura(uuid, text, jsonb, text[]) from public, anon;
grant execute on function app.guardar_lotes_prefeitura(uuid, text, jsonb, text[]) to authenticated;
