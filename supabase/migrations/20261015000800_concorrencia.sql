-- =====================================================================
-- BKM Terrenos · 0008 · concorrência
-- Empreendimentos de outras empresas, marcados no mapa (decisão do Moisés,
-- 24/out/2026): empresa concorrente → empreendimento → tipologias → preços
-- apurados. O preço médio de cada tipologia nunca é sobrescrito: cada data
-- de apuração é uma linha nova. O preço por m² do empreendimento não é
-- digitado; sai das tipologias (app.concorrencia_resumo).
-- Cadastro sem regra de funil: escrita direta pelo front, com auditoria.
-- =====================================================================

create table app.concorrentes (
  id            uuid primary key default gen_random_uuid(),
  empresa_id    uuid not null references app.empresas(id),
  nome          text not null check (btrim(nome) <> ''),
  cnpj          text check (cnpj ~ '^\d{14}$'),
  site          text,
  observacao    text,
  ativo         boolean not null default true,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (empresa_id, cnpj)
);
create unique index concorrentes_nome on app.concorrentes (empresa_id, lower(btrim(nome))) where ativo;

create table app.concorrencia_empreendimentos (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  concorrente_id  uuid not null references app.concorrentes(id),
  nome            text not null check (btrim(nome) <> ''),
  latitude        double precision not null check (latitude between -90 and 90),
  longitude       double precision not null check (longitude between -180 and 180),
  endereco        text,
  municipio_id    uuid references app.municipios(id),
  unidades        int check (unidades > 0),                       -- nulo = não informado
  situacao        text not null default 'nao_informado'
                  check (situacao in ('lancamento','breve_lancamento','em_obras','pronto','usado','nao_informado')),
  data_lancamento date,
  previsao_entrega date,
  torres          smallint check (torres is null or torres > 0),
  programa_social text not null default 'nao_informado'
                  check (programa_social in ('sim','nao','nao_informado')),
  -- vertical entra no monitor; o resto é "fora sempre" (migration do mercado)
  tipo            text not null default 'nao_informado'
                  check (tipo in ('vertical','horizontal','unidade_avulsa','sobrado','loteamento','industrial','galpao','nao_informado')),
  finalidade      text not null default 'nao_informado'
                  check (finalidade in ('residencial','comercial','misto','nao_informado')),
  origem          text not null default 'manual' check (origem in ('manual','importado')),
  bairro          text,
  link_fonte      text,
  primeira_coleta_id uuid,                                       -- fk na migration do mercado
  ultima_coleta_id   uuid,
  observacao      text,
  ativo           boolean not null default true,                  -- desativar tira do mapa; o histórico fica
  criado_por      uuid references auth.users(id) default auth.uid(),
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index on app.concorrencia_empreendimentos (empresa_id) where ativo;

-- Faixa social da tipologia (São Paulo): HIS 1, HIS 2, HMP, R2V e NR. Fica na
-- tipologia, e não no empreendimento, porque um mesmo empreendimento mistura faixas.
create table app.concorrencia_tipologias (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references app.empresas(id),
  empreendimento_id uuid not null references app.concorrencia_empreendimentos(id),
  descricao         text,
  area_privativa_m2 numeric(10,2) not null check (area_privativa_m2 > 0),
  dormitorios       smallint check (dormitorios between 0 and 10),  -- 0 = studio; nulo = não informado
  unidades          int check (unidades > 0),                       -- nulo = não informado
  faixa             text not null default 'nao_informado'
                    check (faixa in ('his1','his2','hmp','r2v','nr','nao_informado')),
  ativo             boolean not null default true,
  criado_em         timestamptz not null default now()
);
create index on app.concorrencia_tipologias (empreendimento_id);

-- Um preço por tipologia e data: lançar de novo na mesma data corrige aquele
-- valor; data nova é linha nova.
create table app.concorrencia_precos (
  id           uuid primary key default gen_random_uuid(),
  empresa_id   uuid not null references app.empresas(id),
  tipologia_id uuid not null references app.concorrencia_tipologias(id),
  apurado_em   date not null,
  preco_medio  numeric(14,2) not null check (preco_medio > 0),
  fonte        text not null default 'nao_informado'
               check (fonte in ('stand','site','corretor','portal','outra','nao_informado')),
  observacao   text,
  criado_por   uuid references auth.users(id) default auth.uid(),
  criado_em    timestamptz not null default now(),
  unique (tipologia_id, apurado_em)
);

-- Filho na mesma empresa do pai, sem trocar de pai; apuração sem data futura.
create or replace function app.tg_concorrencia_integridade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v uuid; pai text; j jsonb := to_jsonb(new);
begin
  pai := case tg_table_name when 'concorrencia_empreendimentos' then 'concorrente_id'
                            when 'concorrencia_tipologias' then 'empreendimento_id'
                            else 'tipologia_id' end;
  if tg_table_name = 'concorrencia_empreendimentos' then
    select empresa_id into v from app.concorrentes where id = new.concorrente_id;
  elsif tg_table_name = 'concorrencia_tipologias' then
    select empresa_id into v from app.concorrencia_empreendimentos where id = new.empreendimento_id;
  else
    select empresa_id into v from app.concorrencia_tipologias where id = new.tipologia_id;
    if new.apurado_em > current_date then
      raise exception 'Data de apuração no futuro' using errcode = '23514';
    end if;
  end if;
  if v is distinct from new.empresa_id then
    raise exception 'Registro não pertence à mesma empresa do pai' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (old.empresa_id is distinct from new.empresa_id
       or (pai <> 'concorrente_id' and to_jsonb(old)->pai is distinct from j->pai)) then
    raise exception 'O registro não pode mudar de empreendimento ou de tipologia' using errcode = '23514';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['concorrentes','concorrencia_empreendimentos','concorrencia_tipologias','concorrencia_precos'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('create policy inserir on app.%I for insert to authenticated with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('create policy alterar on app.%I for update to authenticated using (empresa_id in (select app.empresas_edicao())) with check (empresa_id in (select app.empresas_edicao()))', t);
    execute format('grant select, insert, update on app.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on app.%I for each row execute function app.tg_auditoria()', t);
    if t <> 'concorrentes' then
      execute format('create trigger t_emp before insert or update on app.%I for each row execute function app.tg_concorrencia_integridade()', t);
    end if;
  end loop;
end $$;
-- empresa, empreendimento e tipologia são desativados; um preço lançado errado pode ser apagado (fica na auditoria)
create policy remover on app.concorrencia_precos for delete to authenticated using (empresa_id in (select app.empresas_edicao()));
grant delete on app.concorrencia_precos to authenticated;
create trigger t_upd before update on app.concorrentes for each row execute function app.tg_atualizado_em();
create trigger t_upd before update on app.concorrencia_empreendimentos for each row execute function app.tg_atualizado_em();

-- ---------------------------------------------------------------------
-- Preços vigentes numa data (padrão: hoje)
-- ---------------------------------------------------------------------
-- Cada tipologia ativa com o último preço apurado até p_data.
create or replace function app.concorrencia_tipologias_em(p_data date default current_date)
returns table (tipologia_id uuid, empresa_id uuid, empreendimento_id uuid, descricao text, area_privativa_m2 numeric,
               dormitorios smallint, unidades int, faixa text, preco_medio numeric, apurado_em date, fonte text, preco_m2 numeric)
language sql stable security invoker set search_path = '' as $$
  select t.id, t.empresa_id, t.empreendimento_id, t.descricao, t.area_privativa_m2, t.dormitorios, t.unidades, t.faixa,
         p.preco_medio, p.apurado_em, p.fonte, round(p.preco_medio / t.area_privativa_m2, 2)
  from app.concorrencia_tipologias t
  left join lateral (select pr.preco_medio, pr.apurado_em, pr.fonte from app.concorrencia_precos pr
                     where pr.tipologia_id = t.id and pr.apurado_em <= p_data
                     order by pr.apurado_em desc limit 1) p on true
  where t.ativo
$$;

-- Preço por m² do empreendimento: com as unidades de todas as tipologias
-- precificadas, média ponderada pelo mix (soma de preço × unidades ÷ soma de
-- área × unidades); faltando alguma, média simples do preço por m² das
-- tipologias (mix_completo = false). apurado_de/ate: período dos preços usados.
create or replace function app.concorrencia_resumo(p_data date default current_date)
returns table (empreendimento_id uuid, empresa_id uuid, tipologias int, tipologias_com_preco int,
               preco_m2 numeric, mix_completo boolean, apurado_de date, apurado_ate date, faixas text[])
language sql stable security invoker set search_path = '' as $$
  select e.id, e.empresa_id,
         count(t.tipologia_id)::int,
         count(t.preco_medio)::int,
         case when count(t.preco_medio) = 0 then null
              when bool_and(t.unidades is not null) filter (where t.preco_medio is not null)
                then round(sum(t.preco_medio * t.unidades) / sum(t.area_privativa_m2 * t.unidades), 2)
              else round(avg(t.preco_m2), 2) end,
         coalesce(bool_and(t.unidades is not null) filter (where t.preco_medio is not null), false),
         min(t.apurado_em), max(t.apurado_em),
         coalesce(array_agg(distinct t.faixa order by t.faixa) filter (where t.faixa is not null and t.faixa <> 'nao_informado'), '{}')
  from app.concorrencia_empreendimentos e
  left join app.concorrencia_tipologias_em(p_data) t on t.empreendimento_id = e.id
  group by e.id, e.empresa_id
$$;

-- O que o mapa e o quadro do empreendimento leem.
create view app.v_concorrencia with (security_invoker = true) as
select e.id, e.empresa_id, e.nome, e.concorrente_id, c.nome as concorrente, e.latitude, e.longitude, e.endereco,
       e.municipio_id, e.unidades, e.situacao, e.data_lancamento, e.observacao,
       r.tipologias, r.tipologias_com_preco, r.preco_m2, r.mix_completo, r.apurado_de, r.apurado_ate, r.faixas
from app.concorrencia_empreendimentos e
join app.concorrentes c on c.id = e.concorrente_id
join app.concorrencia_resumo() r on r.empreendimento_id = e.id
where e.ativo;

grant execute on function app.concorrencia_tipologias_em(date), app.concorrencia_resumo(date) to authenticated;
grant select on app.v_concorrencia to authenticated;
revoke execute on function app.tg_concorrencia_integridade() from public;
