-- =====================================================================
-- Cadastro como oferta e tratativa de terreno sobreposto (pedido do Moises, 10/nov/2026)
--
-- Cadastrar um terreno é receber a primeira oferta: ela entra em Ofertas recebidas com o
-- número (A112-1, A112-2...) e o corretor fica na oferta. Cada terreno tem uma oferta
-- ativa (vigente) de cada vez.
--
-- Sobreposição pelos lotes: basta um lote (SQL ou inscrição) em comum para o imóvel já existir
-- na base. A tratativa em andamento continua valendo; a nova só fica ativa se a outra estiver
-- vencida (mais de 90 dias sem ação de uma pessoa nos Logs; o que o sistema grava sozinho não
-- conta), ou pelo diretor, à mão.
--   * Mesmos lotes: a oferta nova entra no terreno existente (vigente ou não; ou aguardando,
--     escondida, quando quem cadastra não pode assumir agora).
--   * Lotes diferentes (a mais ou a menos): terreno novo, ligado ao outro com a marca
--     "Sobreposição parcial" (app.terreno_sobreposicoes); o lote em comum fica nos dois. Dos
--     ligados, só o da tratativa ativa aparece no mapa, no funil e nas listas: o outro fica
--     com terrenos.em_espera_de apontando o ativo.
-- Quem estava esperando é avisado no sino quando a outra tratativa vence
-- (app.avisar_tratativas, todo dia pelo pg_cron).
-- Papéis (analista ver só os seus, gestor e diretor do responsável) ficam para a conversa
-- de papéis: por ora todo mundo vê tudo.
--
-- Feito para rodar também no SQL Editor do Supabase sobre o banco que já existe (idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Ofertas: número no terreno, vigente e aguardando
-- ---------------------------------------------------------------------
alter table app.ofertas add column if not exists numero int;
alter table app.ofertas add column if not exists vigente boolean not null default false;
-- quem cadastrou a oferta escondida (aguardando) foi avisado de que a outra tratativa venceu
alter table app.ofertas add column if not exists avisada_em timestamptz;
alter table app.ofertas drop constraint if exists ofertas_status_check;
alter table app.ofertas add constraint ofertas_status_check check (status in ('ativa','expirada','retirada','aguardando'));
alter table app.ofertas drop constraint if exists ofertas_vigente_check;
alter table app.ofertas add constraint ofertas_vigente_check check (not vigente or status <> 'aguardando');

-- as que já existem: número pela ordem e, vigente, a de referência da negociação aberta ou a mais recente ativa
update app.ofertas o set numero = x.n
from (select id, row_number() over (partition by terreno_id order by data_oferta, criado_em, id) as n from app.ofertas) x
where x.id = o.id and o.numero is null;
update app.ofertas o set vigente = true
from (select distinct on (x.terreno_id) x.id
      from app.ofertas x
      left join app.processos p on p.terreno_id = x.terreno_id and p.parte_id is null and p.status in ('ativo','stand_by')
      left join app.negociacoes n on n.processo_id = p.id
      where x.status <> 'aguardando'
      order by x.terreno_id, (x.id = n.oferta_referencia_id) desc nulls last, (x.status = 'ativa') desc, x.data_oferta desc, x.criado_em desc) v
where v.id = o.id and not exists (select 1 from app.ofertas y where y.terreno_id = o.terreno_id and y.vigente);
create unique index if not exists ofertas_uma_vigente on app.ofertas (terreno_id) where vigente;
create unique index if not exists ofertas_numero on app.ofertas (terreno_id, numero);

-- Mudança de tratativa só pelas RPCs deste arquivo, que ligam app.tratativa na transação.
create or replace function app._tratativa_rpc()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('app.tratativa', true), '') = '1' $$;

-- Número da oferta no terreno e a primeira oferta ativa vira a vigente. Escrita direta
-- (Registrar oferta da ficha) não marca vigente nem aguardando por conta própria.
create or replace function app.tg_oferta_tratativa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from app.terrenos where id = new.terreno_id for update;
    new.numero := coalesce((select max(numero) from app.ofertas where terreno_id = new.terreno_id), 0) + 1;
    if not app._tratativa_rpc() then
      if new.status = 'aguardando' then raise exception 'Oferta aguardando só pelo cadastro' using errcode = '42501'; end if;
      new.vigente := new.status = 'ativa' and not exists (select 1 from app.ofertas where terreno_id = new.terreno_id and vigente);
    end if;
    return new;
  end if;
  new.numero := old.numero;
  if not app._tratativa_rpc() and (new.vigente is distinct from old.vigente
       or (new.status = 'aguardando') is distinct from (old.status = 'aguardando') or new.terreno_id is distinct from old.terreno_id) then
    raise exception 'A oferta ativa só muda por Marcar como ativa' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t_tratativa on app.ofertas;
create trigger t_tratativa before insert or update on app.ofertas for each row execute function app.tg_oferta_tratativa();

-- O corretor da oferta passa a constar no terreno; a oferta escondida (aguardando) só quando é assumida.
create or replace function app.tg_oferta_corretor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.corretor_id is not null and new.status <> 'aguardando'
     and (tg_op = 'INSERT' or old.status = 'aguardando' or new.corretor_id is distinct from old.corretor_id) then
    insert into app.terreno_corretores (terreno_id, corretor_id, empresa_id, principal)
    values (new.terreno_id, new.corretor_id, new.empresa_id,
            not exists (select 1 from app.terreno_corretores where terreno_id = new.terreno_id and principal))
    on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists t_corretor_upd on app.ofertas;
create trigger t_corretor_upd after update of status, corretor_id on app.ofertas for each row execute function app.tg_oferta_corretor();

-- ---------------------------------------------------------------------
-- Terreno escondido (tratativa de outro terreno ativa) e ligação "Sobreposição parcial"
-- ---------------------------------------------------------------------
alter table app.terrenos add column if not exists em_espera_de uuid references app.terrenos(id) on delete set null;
alter table app.terrenos add column if not exists espera_avisada_em timestamptz;
create index if not exists terrenos_em_espera on app.terrenos (em_espera_de) where em_espera_de is not null;

create or replace function app.tg_terreno_espera()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if app._tratativa_rpc() then return new; end if;
  if tg_op = 'INSERT' then
    if new.em_espera_de is not null or new.espera_avisada_em is not null then raise exception 'A tratativa só muda pelo cadastro' using errcode = '42501'; end if;
  elsif new.em_espera_de is distinct from old.em_espera_de or new.espera_avisada_em is distinct from old.espera_avisada_em then
    raise exception 'A tratativa só muda pelo cadastro ou por Assumir' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists t_espera on app.terrenos;
create trigger t_espera before insert or update on app.terrenos for each row execute function app.tg_terreno_espera();

create table if not exists app.terreno_sobreposicoes (
  empresa_id  uuid not null references app.empresas(id),
  terreno_a   uuid not null references app.terrenos(id) on delete cascade,
  terreno_b   uuid not null references app.terrenos(id) on delete cascade,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now(),
  primary key (terreno_a, terreno_b),
  check (terreno_a < terreno_b)
);
create index if not exists terreno_sobreposicoes_b on app.terreno_sobreposicoes (terreno_b);
alter table app.terreno_sobreposicoes enable row level security;
drop policy if exists ver on app.terreno_sobreposicoes;
create policy ver on app.terreno_sobreposicoes for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.terreno_sobreposicoes to authenticated;

create or replace function app._ligados(p_a uuid, p_b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from app.terreno_sobreposicoes where terreno_a = least(p_a, p_b) and terreno_b = greatest(p_a, p_b)) $$;

create or replace function app._ligar(p_empresa uuid, p_a uuid, p_b uuid)
returns void language sql security definer set search_path = '' as $$
  insert into app.terreno_sobreposicoes (empresa_id, terreno_a, terreno_b) values (p_empresa, least(p_a, p_b), greatest(p_a, p_b))
  on conflict do nothing $$;

-- ---------------------------------------------------------------------
-- O mesmo lote em mais de um terreno só quando os dois estão ligados (sobreposição parcial).
-- Substitui o índice único de inscrições e de matrículas por empresa (decisão de 4/nov/2026).
-- ---------------------------------------------------------------------
do $$
declare c record;
begin
  for c in select conname, conrelid::regclass::text as tab from pg_constraint
           where contype = 'u' and conrelid in ('app.inscricoes_municipais'::regclass, 'app.matriculas'::regclass)
             and (select array_agg(attname::text order by attname) from pg_attribute where attrelid = conrelid and attnum = any(conkey))
                 in (array['empresa_id','inscricao_norm','municipio_id'], array['cartorio','empresa_id','numero_norm']) loop
    execute format('alter table %s drop constraint %I', c.tab, c.conname);
  end loop;
end $$;
create index if not exists inscricoes_empresa_norm on app.inscricoes_municipais (empresa_id, inscricao_norm);

create or replace function app.tg_inscricao_repetida()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v record;
begin
  perform pg_advisory_xact_lock(hashtext('insc:' || new.empresa_id || ':' || regexp_replace(new.inscricao, '\D', '', 'g')));
  select t.id, t.codigo into v from app.inscricoes_municipais i join app.terrenos t on t.id = i.terreno_id
  where i.empresa_id = new.empresa_id and i.inscricao_norm = regexp_replace(new.inscricao, '\D', '', 'g')
    and i.municipio_id is not distinct from new.municipio_id and i.id <> new.id
    and (i.terreno_id = new.terreno_id or not app._ligados(i.terreno_id, new.terreno_id))
  limit 1;
  if found then
    raise exception 'A inscrição % já está no terreno %', new.inscricao, v.codigo using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists t_repetida on app.inscricoes_municipais;
create trigger t_repetida before insert or update of inscricao, municipio_id, terreno_id, empresa_id on app.inscricoes_municipais
  for each row execute function app.tg_inscricao_repetida();

-- Cartório em branco conta como o mesmo (decisão do Moisés, 4/nov/2026); o mesmo número no mesmo cartório
-- (ou com um dos dois em branco) não entra noutro terreno, salvo ligado por sobreposição parcial.
create or replace function app.tg_matricula_repetida()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v text;
begin
  perform pg_advisory_xact_lock(hashtext('mat:' || new.empresa_id || ':' || regexp_replace(new.numero, '\D', '', 'g')));
  select t.codigo into v from app.matriculas m join app.terrenos t on t.id = m.terreno_id
  where m.empresa_id = new.empresa_id and m.numero_norm = regexp_replace(new.numero, '\D', '', 'g') and m.id <> new.id
    and (new.cartorio is null or m.cartorio is null or m.cartorio = new.cartorio)
    and (m.terreno_id = new.terreno_id or not app._ligados(m.terreno_id, new.terreno_id))
  limit 1;
  if v is not null then
    raise exception 'A matrícula % já está no terreno %', new.numero, v using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists t_repetida on app.matriculas;
create trigger t_repetida before insert or update of numero, cartorio, empresa_id, terreno_id on app.matriculas
  for each row execute function app.tg_matricula_repetida();

-- ---------------------------------------------------------------------
-- Vencimento: 90 dias sem ação de uma pessoa nos Logs
-- ---------------------------------------------------------------------
create or replace function app.dias_vencimento_tratativa()
returns int language sql immutable set search_path = '' as $$ select 90 $$;

-- A última ação de uma pessoa no terreno, com o mesmo recorte do painel de Logs (ficha/Painel.tsx): o que o
-- sistema grava sozinho (consultas, frentes, entorno) não conta, nem a oferta escondida de quem espera.
create or replace function app.ultima_acao_terreno(p_terreno uuid)
returns timestamptz language sql stable security definer set search_path = '' as $$
  with t as (select id, empresa_id, criado_em from app.terrenos where id = p_terreno),
  pr as (select id::text as id from app.processos where terreno_id = p_terreno),
  os as (select id::text as id from app.ofertas where terreno_id = p_terreno),
  rs as (select id::text as id from app.reunioes where terreno_id = p_terreno)
  select greatest(
    (select criado_em from t),
    (select max(a.em) from app.auditoria a, t
      where a.empresa_id = t.empresa_id and a.user_id is not null and not a.automatico
        and a.tabela not in ('processos','terreno_entorno','terreno_entorno_buscas','consultas_lote','consultas_area','tarefas_etapa','terreno_pontos_excluidos','terreno_valores')
        and not (a.tabela = 'ofertas' and coalesce(a.depois, a.antes)->>'status' = 'aguardando')
        and not (a.tabela = 'terrenos' and a.acao = 'update'
                 and (a.depois - array['em_espera_de','espera_avisada_em','versao','atualizado_em','atualizado_por'])
                     = (a.antes - array['em_espera_de','espera_avisada_em','versao','atualizado_em','atualizado_por']))
        and (a.registro_id = t.id or a.depois->>'terreno_id' = t.id::text or a.antes->>'terreno_id' = t.id::text
             or a.depois->>'processo_id' in (select id from pr) or a.antes->>'processo_id' in (select id from pr)
             or a.depois->>'oferta_id' in (select id from os) or a.antes->>'oferta_id' in (select id from os)
             or a.depois->>'reuniao_id' in (select id from rs) or a.antes->>'reuniao_id' in (select id from rs))),
    (select max(x.em) from app.processo_transicoes x join app.processos p on p.id = x.processo_id
      where p.terreno_id = p_terreno and x.user_id is not null)) $$;

-- Vencida: parada há mais de 90 dias; perdida, descartada ou arquivada também (não está em andamento).
-- Comprado nunca vence.
create or replace function app.tratativa_vencida(p_terreno uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when exists (select 1 from app.processos p where p.terreno_id = t.id and p.parte_id is null and p.status = 'concluido'
                 and p.fase = app._fase_entrada(t.empresa_id)) then false
    when t.situacao_cadastral = 'arquivado' then true
    when exists (select 1 from app.processos p where p.terreno_id = t.id and p.parte_id is null and p.fase = app._fase_entrada(t.empresa_id))
         and not exists (select 1 from app.processos p where p.terreno_id = t.id and p.parte_id is null and p.status in ('ativo','stand_by')) then true
    else app.ultima_acao_terreno(t.id) < now() - make_interval(days => app.dias_vencimento_tratativa()) end
  from app.terrenos t where t.id = p_terreno $$;

-- ---------------------------------------------------------------------
-- Conflitos do cadastro: os terrenos ativos (não escondidos, não excluídos) com algum lote em comum
-- e, quando um dos lados não tem lote, os que ocupam parte da poligonal (app.sobreposicao).
-- ---------------------------------------------------------------------
create or replace function app.conflitos_cadastro(p_empresa uuid, p_municipio uuid, p_inscricoes text[], p_poligono jsonb default null)
returns table (terreno_id uuid, codigo text, nome text, responsavel_id uuid, sou_responsavel boolean, por text, mesmos_lotes boolean,
               comuns text[], so_novo text[], so_existente text[], vencida boolean, dias_sem_acao int, pct_nova numeric, pct_existente numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
declare ns text[] := (select coalesce(array_agg(distinct regexp_replace(x, '\D', '', 'g')) filter (where regexp_replace(x, '\D', '', 'g') <> ''), '{}') from unnest(coalesce(p_inscricoes, '{}')) x);
        g extensions.geometry;
begin
  perform app.exigir_membro(p_empresa);
  if p_poligono is not null and app.geojson_poligono_valido(p_poligono) then
    g := extensions.st_makevalid(extensions.st_setsrid(extensions.st_geomfromgeojson(p_poligono::text), 4326));
  end if;
  return query
  with lotes as (
    select t.id, array_agg(distinct i.inscricao_norm) as l
    from app.terrenos t join app.inscricoes_municipais i on i.terreno_id = t.id
    where t.empresa_id = p_empresa and t.excluido_em is null and t.em_espera_de is null
      and (p_municipio is null or i.municipio_id is not distinct from p_municipio)
    group by t.id
  ), cand as (
    select l.id, 'lotes'::text as por, null::numeric as pa, null::numeric as pb from lotes l where l.l && ns
    union
    select t.id, 'area', round(s.pct_a::numeric, 1), round(s.pct_b::numeric, 1)
    from app.terrenos t cross join lateral app.sobreposicao(g, t.poligono) s
    where g is not null and t.empresa_id = p_empresa and t.excluido_em is null and t.em_espera_de is null
      and t.poligono operator(extensions.&&) g and s.conta
      and (cardinality(ns) = 0 or not exists (select 1 from lotes l where l.id = t.id))
  )
  select t.id, t.codigo, t.nome, t.responsavel_id, t.responsavel_id = auth.uid(), c.por,
         case when c.por = 'lotes' then (select l.l @> ns and ns @> l.l from lotes l where l.id = t.id) else c.pa >= 90 and c.pb >= 90 end,
         coalesce((select array(select x from unnest(l.l) x where x = any(ns) order by x) from lotes l where l.id = t.id), '{}'),
         coalesce(array(select x from unnest(ns) x where not x = any(coalesce((select l.l from lotes l where l.id = t.id), '{}')) order by x), '{}'),
         coalesce((select array(select x from unnest(l.l) x where not x = any(ns) order by x) from lotes l where l.id = t.id), '{}'),
         app.tratativa_vencida(t.id), (current_date - app.ultima_acao_terreno(t.id)::date)::int, c.pa, c.pb
  from (select distinct on (id) * from cand order by id, (por = 'lotes') desc) c join app.terrenos t on t.id = c.id
  order by (c.por = 'lotes') desc, t.codigo;
end $$;

-- ---------------------------------------------------------------------
-- Ações
-- ---------------------------------------------------------------------
-- A oferta passa a ser a vigente do terreno (e a de referência da negociação aberta).
create or replace function app._tornar_vigente(o app.ofertas)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform set_config('app.tratativa', '1', true);
  update app.ofertas set vigente = false where terreno_id = o.terreno_id and vigente and id <> o.id;
  update app.ofertas set vigente = true, status = case when status = 'aguardando' then 'ativa' else status end where id = o.id;
  update app.negociacoes n set oferta_referencia_id = o.id
    from app.processos p where p.id = n.processo_id and p.terreno_id = o.terreno_id and p.parte_id is null and p.status in ('ativo','stand_by');
  perform set_config('app.tratativa', '', true);
end $$;

-- Troca de responsável do terreno e das negociações abertas dele, avisando quem saiu.
create or replace function app._passar_responsavel(t app.terrenos, p_novo uuid, p_texto text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_novo is null or p_novo = t.responsavel_id then return; end if;
  update app.terrenos set responsavel_id = p_novo where id = t.id;
  update app.processos set responsavel_id = p_novo where terreno_id = t.id and status in ('ativo','stand_by') and responsavel_id is not distinct from t.responsavel_id;
  perform app._notificar(t.empresa_id, t.responsavel_id, 'tratativa', p_texto, t.id, 'terrenos', t.id);
end $$;

-- Marcar como ativa, na ficha: o responsável do terreno ou o diretor.
create or replace function app.definir_oferta_vigente(p_oferta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o app.ofertas; t app.terrenos;
begin
  select * into o from app.ofertas where id = p_oferta;
  if not found then raise exception 'Oferta não encontrada' using errcode = 'P0002'; end if;
  select * into t from app.terrenos where id = o.terreno_id for update;
  perform app.exigir_editor(t.empresa_id);
  if o.status = 'aguardando' then raise exception 'Esta oferta está aguardando: use Assumir' using errcode = '22023'; end if;
  if o.vigente then return; end if;
  if t.responsavel_id is distinct from auth.uid() and app.papel(t.empresa_id) is distinct from 'diretor' then
    raise exception 'Só o responsável pelo terreno ou o diretor troca a oferta ativa' using errcode = '42501';
  end if;
  perform app._tornar_vigente(o);
end $$;

-- A oferta de referência da negociação é a oferta ativa do terreno.
create or replace function app.definir_oferta_referencia(p_processo uuid, p_oferta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare p app.processos;
begin
  select * into p from app.processos where id = p_processo;
  if not found then raise exception 'Negociação não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_editor(p.empresa_id);
  if not exists (select 1 from app.ofertas where id = p_oferta and terreno_id = p.terreno_id) then
    raise exception 'A oferta não é deste terreno' using errcode = '22023';
  end if;
  if p.parte_id is null then perform app.definir_oferta_vigente(p_oferta);
  else update app.negociacoes set oferta_referencia_id = p_oferta where processo_id = p.id; end if;
end $$;

-- Cadastro com os mesmos lotes de um terreno ativo: a oferta entra nele.
--   vigente     passa a ser a oferta ativa: o responsável, o diretor ou, com a outra tratativa vencida,
--               quem assume (e vira o responsável)
--   nao_vigente entra na lista sem trocar a ativa (o responsável, o diretor, ou com a tratativa vencida)
--   aguardando  escondida, até a tratativa vencer e quem cadastrou assumir (qualquer editor)
create or replace function app.registrar_oferta_cadastro(p_terreno uuid, p_modo text, p_corretor uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare t app.terrenos; o app.ofertas; resp boolean; dir boolean; venc boolean;
begin
  select * into t from app.terrenos where id = p_terreno for update;
  if not found or t.excluido_em is not null then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if t.em_espera_de is not null then raise exception 'Este terreno está escondido: a tratativa ativa é de outro' using errcode = '22023'; end if;
  if p_modo not in ('vigente','nao_vigente','aguardando') then raise exception 'Modo inválido' using errcode = '22023'; end if;
  if p_corretor is not null and not exists (select 1 from app.corretores where id = p_corretor and empresa_id = t.empresa_id) then
    raise exception 'Corretor não encontrado' using errcode = 'P0002';
  end if;
  resp := t.responsavel_id = auth.uid(); dir := app.papel(t.empresa_id) = 'diretor'; venc := app.tratativa_vencida(t.id);
  if p_modo <> 'aguardando' and not (resp or dir or venc) then
    raise exception 'A tratativa deste imóvel está ativa: a oferta fica aguardando' using errcode = '42501';
  end if;
  perform set_config('app.tratativa', '1', true);
  insert into app.ofertas (empresa_id, terreno_id, corretor_id, status, vigente)
  values (t.empresa_id, t.id, p_corretor, case when p_modo = 'aguardando' then 'aguardando' else 'ativa' end, false)
  returning * into o;
  perform set_config('app.tratativa', '', true);
  if p_modo = 'vigente' then
    perform app._tornar_vigente(o);
    if not resp and not dir then
      perform app._passar_responsavel(t, auth.uid(), 'A tratativa do ' || t.codigo || ' estava vencida e foi assumida por outra pessoa.');
    end if;
  end if;
  return jsonb_build_object('oferta_id', o.id, 'codigo', t.codigo || '-' || o.numero);
end $$;

-- Assumir a oferta que estava aguardando: quem a cadastrou, com a tratativa vencida, ou o diretor.
create or replace function app.assumir_oferta(p_oferta uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare o app.ofertas; t app.terrenos;
begin
  select * into o from app.ofertas where id = p_oferta;
  if not found then raise exception 'Oferta não encontrada' using errcode = 'P0002'; end if;
  select * into t from app.terrenos where id = o.terreno_id for update;
  perform app.exigir_editor(t.empresa_id);
  if o.status <> 'aguardando' then raise exception 'Esta oferta não está aguardando' using errcode = '22023'; end if;
  if app.papel(t.empresa_id) is distinct from 'diretor' then
    if o.criado_por is distinct from auth.uid() then raise exception 'Só quem cadastrou a oferta ou o diretor a assume' using errcode = '42501'; end if;
    if not app.tratativa_vencida(t.id) then raise exception 'A tratativa deste imóvel ainda está ativa' using errcode = '42501'; end if;
  end if;
  perform app._tornar_vigente(o);
  perform app._passar_responsavel(t, o.criado_por, 'A tratativa do ' || t.codigo || ' passou para outra pessoa.');
end $$;

-- Ativa a tratativa do terreno p_ativo e esconde os ligados a ele que estavam ativos (e quem esperava por eles).
create or replace function app._ativar_tratativa(p_ativo uuid, p_outros uuid[])
returns void language plpgsql security definer set search_path = '' as $$
declare a app.terrenos; r record;
begin
  select * into a from app.terrenos where id = p_ativo;
  perform set_config('app.tratativa', '1', true);
  update app.terrenos set em_espera_de = null, espera_avisada_em = null where id = p_ativo;
  for r in select * from app.terrenos where id = any(p_outros) and id <> p_ativo loop
    perform app._ligar(a.empresa_id, a.id, r.id);
    update app.terrenos set em_espera_de = p_ativo, espera_avisada_em = null where id = r.id or em_espera_de = r.id;
    if r.responsavel_id is distinct from auth.uid() then
      perform app._notificar(a.empresa_id, r.responsavel_id, 'tratativa',
        'A tratativa do ' || r.codigo || ' estava vencida e passou para outro terreno com lotes em comum.', r.id, 'terrenos', r.id);
    end if;
  end loop;
  update app.terrenos set em_espera_de = p_ativo where em_espera_de = any(p_outros);
  perform set_config('app.tratativa', '', true);
end $$;

-- Cadastro com lotes diferentes (a mais ou a menos) de terrenos ativos: liga o terreno novo a eles.
--   ativa   o novo passa a ser a tratativa ativa e os outros ficam escondidos (só com todos vencidos, ou pelo diretor)
--   espera  o novo fica escondido até a tratativa dos outros vencer
create or replace function app.vincular_tratativa(p_novo uuid, p_outros uuid[], p_modo text)
returns void language plpgsql security definer set search_path = '' as $$
declare n app.terrenos; r app.terrenos;
begin
  select * into n from app.terrenos where id = p_novo for update;
  if not found or n.excluido_em is not null then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(n.empresa_id);
  if n.responsavel_id is distinct from auth.uid() and app.papel(n.empresa_id) is distinct from 'diretor' then
    raise exception 'Só o responsável pelo terreno ou o diretor' using errcode = '42501';
  end if;
  if p_modo not in ('ativa','espera') or coalesce(cardinality(p_outros), 0) = 0 then raise exception 'Modo inválido' using errcode = '22023'; end if;
  for r in select * from app.terrenos where id = any(p_outros) loop
    if r.empresa_id <> n.empresa_id or r.excluido_em is not null or r.id = n.id then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
    if p_modo = 'ativa' and r.em_espera_de is null and not app.tratativa_vencida(r.id) and app.papel(n.empresa_id) is distinct from 'diretor' then
      raise exception 'A tratativa do % está ativa: o terreno novo fica aguardando', r.codigo using errcode = '42501';
    end if;
  end loop;
  if p_modo = 'ativa' then
    perform app._ativar_tratativa(n.id, p_outros);
  else
    perform set_config('app.tratativa', '1', true);
    for r in select * from app.terrenos where id = any(p_outros) loop perform app._ligar(n.empresa_id, n.id, r.id); end loop;
    update app.terrenos set em_espera_de = (select coalesce(t.em_espera_de, t.id) from app.terrenos t where t.id = any(p_outros)
                                              order by (t.em_espera_de is null) desc, t.codigo limit 1), espera_avisada_em = null
     where id = n.id;
    perform set_config('app.tratativa', '', true);
  end if;
end $$;

-- Assumir pela ficha do terreno escondido: o responsável dele, com a tratativa ativa vencida, ou o diretor.
create or replace function app.assumir_tratativa(p_terreno uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare h app.terrenos; ativos uuid[];
begin
  select * into h from app.terrenos where id = p_terreno for update;
  if not found or h.excluido_em is not null then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(h.empresa_id);
  if h.em_espera_de is null then return; end if;
  ativos := array(select t.id from app.terrenos t where t.em_espera_de is null and t.excluido_em is null
                   and (t.id = h.em_espera_de or app._ligados(t.id, h.id)));
  if app.papel(h.empresa_id) is distinct from 'diretor' then
    if h.responsavel_id is distinct from auth.uid() then raise exception 'Só o responsável pelo terreno ou o diretor' using errcode = '42501'; end if;
    if exists (select 1 from unnest(ativos) a where not app.tratativa_vencida(a)) then
      raise exception 'A outra tratativa ainda está ativa' using errcode = '42501';
    end if;
  end if;
  perform app._ativar_tratativa(h.id, ativos);
end $$;

-- Situação da tratativa para a ficha: escondido, por quem (o código só para quem é o responsável dele ou diretor
-- fica para a conversa de papéis: por ora vai sempre), ligados, vencida e se quem vê pode assumir.
create or replace function app.tratativa_terreno(p_terreno uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare t app.terrenos; ativos uuid[]; dir boolean;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then return null; end if;
  perform app.exigir_membro(t.empresa_id);
  dir := app.papel(t.empresa_id) = 'diretor';
  ativos := array(select x.id from app.terrenos x where x.em_espera_de is null and x.excluido_em is null
                   and (x.id = t.em_espera_de or (t.em_espera_de is not null and app._ligados(x.id, t.id))));
  return jsonb_build_object(
    'escondido', t.em_espera_de is not null,
    'ativo', (select jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'nome', x.nome, 'vencida', app.tratativa_vencida(x.id),
                                                'dias', (current_date - app.ultima_acao_terreno(x.id)::date)::int)) from app.terrenos x where x.id = any(ativos)),
    'ligados', (select jsonb_agg(jsonb_build_object('id', x.id, 'codigo', x.codigo, 'nome', x.nome, 'escondido', x.em_espera_de is not null,
                                                  'lotes', (select coalesce(jsonb_agg(i.inscricao order by i.inscricao), '[]') from app.inscricoes_municipais i where i.terreno_id = x.id))
                                order by x.codigo)
                from app.terreno_sobreposicoes s join app.terrenos x on x.id = case when s.terreno_a = t.id then s.terreno_b else s.terreno_a end
                where (s.terreno_a = t.id or s.terreno_b = t.id) and x.excluido_em is null),
    'lotes', (select coalesce(jsonb_agg(i.inscricao order by i.inscricao), '[]') from app.inscricoes_municipais i where i.terreno_id = t.id),
    'vencida', app.tratativa_vencida(t.id),
    'dias_sem_acao', (current_date - app.ultima_acao_terreno(t.id)::date)::int,
    'pode_assumir', t.em_espera_de is not null and app.papel(t.empresa_id) in ('diretor','gestor','analista')
                    and (dir or (t.responsavel_id = auth.uid() and not exists (select 1 from unnest(ativos) a where not app.tratativa_vencida(a)))),
    'aguardando', (select jsonb_agg(jsonb_build_object('id', o.id, 'numero', o.numero, 'criado_por', o.criado_por, 'criado_em', o.criado_em,
                                                     'pode_assumir', app.papel(t.empresa_id) in ('diretor','gestor','analista') and (dir or (o.criado_por = auth.uid() and app.tratativa_vencida(t.id)))))
                   from app.ofertas o where o.terreno_id = t.id and o.status = 'aguardando'));
end $$;

-- ---------------------------------------------------------------------
-- Aviso de tratativa vencida (todo dia): quem espera é avisado uma vez
-- ---------------------------------------------------------------------
insert into app.tipos_notificacao (empresa_id, codigo, nome, dias_antes_padrao, email_padrao)
select e.id, 'tratativa', 'Tratativa de imóvel sobreposto', '{}', true from (select null::uuid as id union all select id from app.empresas) e
on conflict do nothing;

create or replace function app.avisar_tratativas(p_hoje date default current_date)
returns int language plpgsql security definer set search_path = '' as $$
declare r record; total int := 0;
begin
  perform set_config('app.tratativa', '1', true);
  for r in select h.* from app.terrenos h where h.em_espera_de is not null and h.espera_avisada_em is null and h.excluido_em is null loop
    if not exists (select 1 from app.terrenos a where a.em_espera_de is null and a.excluido_em is null
                   and (a.id = r.em_espera_de or app._ligados(a.id, r.id)) and not app.tratativa_vencida(a.id)) then
      perform app._notificar(r.empresa_id, r.responsavel_id, 'tratativa',
        'A outra tratativa do imóvel do ' || r.codigo || ' venceu: abra o terreno para assumir.', r.id, 'terrenos', r.id, p_hoje, null);
      update app.terrenos set espera_avisada_em = now() where id = r.id;
      total := total + 1;
    end if;
  end loop;
  for r in select o.*, t.codigo from app.ofertas o join app.terrenos t on t.id = o.terreno_id
           where o.status = 'aguardando' and o.avisada_em is null and t.excluido_em is null loop
    if app.tratativa_vencida(r.terreno_id) then
      perform app._notificar(r.empresa_id, r.criado_por, 'tratativa',
        'A tratativa do imóvel da sua oferta ' || r.codigo || '-' || r.numero || ' venceu: abra o terreno para assumir.', r.terreno_id, 'ofertas', r.id, p_hoje, null);
      update app.ofertas set avisada_em = now() where id = r.id;
      total := total + 1;
    end if;
  end loop;
  perform set_config('app.tratativa', '', true);
  return total;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('bkm-terrenos-tratativas', '15 9 * * *', 'select app.avisar_tratativas()');
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Novo corretor, na janela da oferta e no cadastro (pedido do Moises, 10/nov/2026): nome, e-mail e
-- celular obrigatórios; CPF, RG, Creci, imobiliária, Creci jurídico, CNPJ e endereço opcionais.
-- O cadastro completo de corretores, com base própria, fica para depois.
-- ---------------------------------------------------------------------
alter table app.corretores add column if not exists rg text;
alter table app.corretores add column if not exists creci_juridico text;
alter table app.corretores add column if not exists cnpj_imobiliaria text check (cnpj_imobiliaria is null or cnpj_imobiliaria ~ '^\d{14}$');
alter table app.corretores add column if not exists endereco text;
alter table app.corretores add column if not exists apelido text;

create or replace function app.criar_corretor(p_empresa uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_nome text := nullif(trim(p_dados->>'nome'), ''); v_email text := lower(nullif(trim(p_dados->>'email'), ''));
        v_cel text := nullif(regexp_replace(coalesce(p_dados->>'celular', ''), '\D', '', 'g'), '');
        v_cpf text := nullif(regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g'), '');
        v_cnpj text := nullif(regexp_replace(coalesce(p_dados->>'cnpj', ''), '\D', '', 'g'), '');
        v_pessoa uuid; v_id uuid;
begin
  perform app.exigir_editor(p_empresa);
  if v_nome is null then raise exception 'Informe o nome do corretor' using errcode = '23502'; end if;
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido' using errcode = '23502'; end if;
  if v_cel is null or length(v_cel) not between 10 and 11 then raise exception 'Informe o celular com DDD' using errcode = '23502'; end if;
  if v_cpf is not null and length(v_cpf) <> 11 then raise exception 'CPF com 11 dígitos' using errcode = '22023'; end if;
  if v_cnpj is not null and length(v_cnpj) <> 14 then raise exception 'CNPJ com 14 dígitos' using errcode = '22023'; end if;
  if v_cpf is not null then select id into v_pessoa from app.pessoas where empresa_id = p_empresa and cpf_cnpj = v_cpf; end if;
  if v_pessoa is null then
    insert into app.pessoas (empresa_id, tipo_pessoa, nome_razao_social, cpf_cnpj, telefone, email)
    values (p_empresa, 'PF', v_nome, v_cpf, v_cel, v_email) returning id into v_pessoa;
  elsif exists (select 1 from app.corretores where empresa_id = p_empresa and pessoa_id = v_pessoa) then
    raise exception 'Já existe um corretor com este CPF' using errcode = '23505';
  end if;
  insert into app.corretores (empresa_id, pessoa_id, creci, imobiliaria, rg, creci_juridico, cnpj_imobiliaria, endereco, apelido)
  values (p_empresa, v_pessoa, nullif(trim(p_dados->>'creci'), ''), nullif(trim(p_dados->>'imobiliaria'), ''), nullif(trim(p_dados->>'rg'), ''),
          nullif(trim(p_dados->>'creci_juridico'), ''), v_cnpj, nullif(trim(p_dados->>'endereco'), ''), nullif(trim(p_dados->>'apelido'), ''))
  returning id into v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Mapa: só o terreno da tratativa ativa
-- ---------------------------------------------------------------------
create or replace view app.v_mapa with (security_invoker = true) as
select v.id, v.empresa_id, v.codigo, v.nome, v.bairro, v.zona, v.municipio, v.corretor_principal,
       t.latitude, t.longitude, t.precisao_localizacao, t.poligono_geojson,
       v.area_adotada_m2, v.valor_pedido, v.temperatura, v.fase, v.fase_nome, v.fase_ordem, v.fases_abertas,
       v.etapa_nome, v.subetapa_atual, v.subetapa_nome,
       case when v.processo_id is null then 'sem_negociacao'
            when v.processo_status = 'ativo' then v.etapa_atual
            else v.processo_status end as situacao_mapa
from app.v_terrenos v
join app.terrenos t on t.id = v.id
where v.situacao_cadastral = 'ativo' and t.em_espera_de is null;

-- ---------------------------------------------------------------------
-- Permissões (as funções novas não ficam abertas a public; ver sql-avulso-revoke)
-- ---------------------------------------------------------------------
revoke execute on function app._tratativa_rpc(), app.tg_oferta_tratativa(), app.tg_oferta_corretor(), app.tg_terreno_espera(),
  app._ligados(uuid, uuid), app._ligar(uuid, uuid, uuid), app.tg_inscricao_repetida(), app.tg_matricula_repetida(),
  app.dias_vencimento_tratativa(), app.ultima_acao_terreno(uuid), app.tratativa_vencida(uuid),
  app.conflitos_cadastro(uuid, uuid, text[], jsonb), app._tornar_vigente(app.ofertas), app._passar_responsavel(app.terrenos, uuid, text),
  app.definir_oferta_vigente(uuid), app.definir_oferta_referencia(uuid, uuid), app.registrar_oferta_cadastro(uuid, text, uuid),
  app.assumir_oferta(uuid), app._ativar_tratativa(uuid, uuid[]), app.vincular_tratativa(uuid, uuid[], text),
  app.assumir_tratativa(uuid), app.tratativa_terreno(uuid), app.avisar_tratativas(date), app.criar_corretor(uuid, jsonb) from public, anon, authenticated;
grant execute on function app.conflitos_cadastro(uuid, uuid, text[], jsonb), app.definir_oferta_vigente(uuid), app.definir_oferta_referencia(uuid, uuid),
  app.registrar_oferta_cadastro(uuid, text, uuid), app.assumir_oferta(uuid), app.vincular_tratativa(uuid, uuid[], text),
  app.assumir_tratativa(uuid), app.tratativa_terreno(uuid), app.tratativa_vencida(uuid), app.criar_corretor(uuid, jsonb) to authenticated;
