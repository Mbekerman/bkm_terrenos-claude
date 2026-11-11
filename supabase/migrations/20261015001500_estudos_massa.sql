-- =====================================================================
-- Estudos de massa (lote 4 da ficha em abas; pedido do Moisés de 3/nov/2026)
-- O analista pede o estudo ao arquiteto (interno, um membro da empresa) com
-- o briefing e o prazo; o arquiteto lança as tipologias (título, área
-- privativa, quantidade), as áreas (lazer coberto e descoberto na torre e
-- fora dela, circulação, anexos, estacionamento coberto e descoberto,
-- contenção até 1,5 m e acima), as vagas cobertas e descobertas, a área
-- construída total e os CAs legal e venal (digitados), e envia o PDF e o DWG.
-- Área privativa total = Σ área × quantidade das tipologias; eficiência =
-- privativa ÷ construída. Situação: solicitado → em elaboração (ao lançar o
-- primeiro dado) → entregue (Salvar; basta uma unidade lançada). O analista
-- marca o estudo válido (um por terreno, só entregue) e escreve observações.
-- Tudo pelas RPCs (as tabelas só se leem).
--
-- Viabilidade presa ao estudo (decisões do Moisés, 3/nov/2026): o estudo de
-- viabilidade pode usar um estudo de massa fixo ou "seguir o válido" (trocou
-- o válido, a viabilidade troca junto). Preso, o nome, a área e a quantidade
-- das tipologias e a área construída vêm do estudo de massa e não se editam
-- lá; preços, permuta e comissão continuam da viabilidade (casados pela
-- tipologia do estudo de massa e, na troca de estudo, pelo nome). O botão
-- do estudo de massa cria a viabilidade já presa a ele
-- (app.criar_viabilidade_da_massa). A obra incidente usa o R$/m² × área
-- privativa ou × área construída (viabilidades.obra_base).
-- =====================================================================

create table app.estudos_massa (
  id                          uuid primary key default gen_random_uuid(),
  empresa_id                  uuid not null references app.empresas(id),
  terreno_id                  uuid not null references app.terrenos(id) on delete cascade,
  ordem                       int  not null,
  nome                        text not null check (length(trim(nome)) > 0),
  situacao                    text not null default 'solicitado' check (situacao in ('solicitado','em_elaboracao','entregue')),
  -- pedido
  solicitante_id              uuid references auth.users(id) default auth.uid(),
  solicitado_em               timestamptz not null default now(),
  arquiteto_id                uuid not null references auth.users(id),
  briefing                    text,
  prazo                       date,
  -- lançado pelo arquiteto (m²)
  lazer_coberto_torre_m2      numeric(12,2) check (lazer_coberto_torre_m2 >= 0),
  lazer_descoberto_torre_m2   numeric(12,2) check (lazer_descoberto_torre_m2 >= 0),
  lazer_coberto_fora_m2       numeric(12,2) check (lazer_coberto_fora_m2 >= 0),
  lazer_descoberto_fora_m2    numeric(12,2) check (lazer_descoberto_fora_m2 >= 0),
  circulacao_m2               numeric(12,2) check (circulacao_m2 >= 0),
  anexos_m2                   numeric(12,2) check (anexos_m2 >= 0),
  vagas_cobertas              int check (vagas_cobertas >= 0),
  vagas_descobertas           int check (vagas_descobertas >= 0),
  estacionamento_coberto_m2   numeric(12,2) check (estacionamento_coberto_m2 >= 0),
  estacionamento_descoberto_m2 numeric(12,2) check (estacionamento_descoberto_m2 >= 0),
  contencao_ate_1_5_m2        numeric(12,2) check (contencao_ate_1_5_m2 >= 0),
  contencao_acima_1_5_m2      numeric(12,2) check (contencao_acima_1_5_m2 >= 0),
  area_construida_m2          numeric(14,2) check (area_construida_m2 > 0),
  ca_legal                    numeric(6,3) check (ca_legal >= 0),
  ca_venal                    numeric(6,3) check (ca_venal >= 0),
  -- calculados das tipologias
  area_privativa_m2           numeric(14,2),
  unidades                    int,
  eficiencia_pct              numeric(7,2) generated always as (case when area_construida_m2 > 0 then round(area_privativa_m2 / area_construida_m2 * 100, 2) end) stored,
  -- do analista
  valido                      boolean not null default false,
  observacoes                 text,
  entregue_em                 timestamptz,
  criado_em                   timestamptz not null default now(),
  atualizado_em               timestamptz not null default now(),
  unique (terreno_id, ordem),
  check (not valido or situacao = 'entregue')
);
create unique index estudos_massa_um_valido on app.estudos_massa (terreno_id) where valido;
create trigger t_upd before update on app.estudos_massa for each row execute function app.tg_atualizado_em();
create trigger t_emp before insert or update on app.estudos_massa for each row execute function app.tg_mesma_empresa();

create table app.estudo_massa_tipologias (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  estudo_id       uuid not null references app.estudos_massa(id) on delete cascade,
  ordem           int  not null default 0,
  nome            text not null check (length(trim(nome)) > 0),
  area_privativa  numeric(10,2) check (area_privativa > 0),
  quantidade      int not null default 0 check (quantidade >= 0)
);
create index on app.estudo_massa_tipologias (estudo_id, ordem);
create unique index estudo_massa_tipologias_nome on app.estudo_massa_tipologias (estudo_id, lower(trim(nome)));

do $$
declare t text;
begin
  foreach t in array array['estudos_massa','estudo_massa_tipologias'] loop
    execute format('alter table app.%I enable row level security', t);
    execute format('create policy ver on app.%I for select to authenticated using (empresa_id in (select app.minhas_empresas()))', t);
    execute format('grant select on app.%I to authenticated', t);
    execute format('create trigger t_aud after insert or update or delete on app.%I for each row execute function app.tg_auditoria()', t);
  end loop;
end $$;

-- Arquivos do estudo: PDF e DWG em Documentos, um documento de cada tipo por
-- estudo e cada envio uma versão nova (regra 4).
insert into app.tipos_documento (codigo, nome, categoria, validade_dias, unico_por_processo) values
  ('massa_pdf', 'Estudo de massa (PDF)', 'Técnico', null, false),
  ('massa_dwg', 'Estudo de massa (DWG)', 'Técnico', null, false)
on conflict (codigo) do nothing;
alter table app.documentos add column estudo_massa_id uuid references app.estudos_massa(id) on delete set null;
create unique index documentos_um_por_estudo_massa on app.documentos (estudo_massa_id, tipo_documento) where estudo_massa_id is not null;

-- Avisos: o pedido para o arquiteto; a entrega para quem pediu.
insert into app.tipos_notificacao (codigo, nome, dias_antes_padrao, email_padrao) values
  ('massa_solicitado', 'Estudo de massa pedido a você', '{}', true),
  ('massa_entregue',   'Estudo de massa entregue',      '{}', true);
insert into app.tipos_notificacao (empresa_id, codigo, nome, dias_antes_padrao, email_padrao, ativo)
select e.id, t.codigo, t.nome, t.dias_antes_padrao, t.email_padrao, t.ativo
  from app.empresas e cross join app.tipos_notificacao t
 where t.empresa_id is null and t.codigo in ('massa_solicitado','massa_entregue')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Viabilidade presa ao estudo de massa
-- ---------------------------------------------------------------------
alter table app.viabilidades
  add column estudo_massa_id    uuid references app.estudos_massa(id),
  add column segue_massa_valido boolean not null default false,
  add constraint viabilidade_segue_com_estudo check (not segue_massa_valido or estudo_massa_id is not null);
alter table app.viabilidade_tipologias
  add column massa_tipologia_id uuid references app.estudo_massa_tipologias(id) on delete set null;

-- Presa ao estudo, a viabilidade não inclui, não tira nem muda o nome, a área
-- ou a quantidade de uma tipologia (só app._sincronizar_massa, com app.massa_sync).
create or replace function app.tg_viab_tipologia_massa()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v app.viabilidades;
begin
  select * into v from app.viabilidades where id = coalesce(new.viabilidade_id, old.viabilidade_id);
  if v.id is null or v.estudo_massa_id is null or coalesce(current_setting('app.massa_sync', true), '') = 'on' then
    return coalesce(new, old);
  end if;
  if tg_op <> 'UPDATE' or (new.nome, new.area_privativa, new.quantidade, new.massa_tipologia_id)
                          is distinct from (old.nome, old.area_privativa, old.quantidade, old.massa_tipologia_id) then
    raise exception 'As tipologias vêm do estudo de massa: mude lá (aqui, só preços, permuta e comissão)' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger t_massa before insert or update or delete on app.viabilidade_tipologias for each row execute function app.tg_viab_tipologia_massa();

-- Traz do estudo de massa as tipologias e a área construída. "Seguir o
-- válido" troca antes o estudo pelo válido do terreno (sem válido, fica o último).
create or replace function app._sincronizar_massa(p_viab uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v app.viabilidades; m app.estudos_massa;
begin
  select * into v from app.viabilidades where id = p_viab for update;
  if v.estudo_massa_id is null then return; end if;
  if v.segue_massa_valido then
    select * into m from app.estudos_massa where terreno_id = v.terreno_id and valido;
  end if;
  if m.id is null then select * into m from app.estudos_massa where id = v.estudo_massa_id; end if;
  perform set_config('app.massa_sync', 'on', true);
  -- na troca de estudo, casa pelo nome
  update app.viabilidade_tipologias x set massa_tipologia_id = mt.id
    from app.estudo_massa_tipologias mt
   where x.viabilidade_id = v.id and mt.estudo_id = m.id
     and (x.massa_tipologia_id is null or x.massa_tipologia_id not in (select id from app.estudo_massa_tipologias where estudo_id = m.id))
     and lower(trim(x.nome)) = lower(trim(mt.nome))
     and not exists (select 1 from app.viabilidade_tipologias y where y.viabilidade_id = v.id and y.massa_tipologia_id = mt.id);
  delete from app.viabilidade_tipologias x
   where x.viabilidade_id = v.id
     and (x.massa_tipologia_id is null or x.massa_tipologia_id not in (select id from app.estudo_massa_tipologias where estudo_id = m.id));
  update app.viabilidade_tipologias x set nome = mt.nome, area_privativa = mt.area_privativa, quantidade = mt.quantidade, ordem = mt.ordem,
         quantidade_permuta = least(x.quantidade_permuta, mt.quantidade),
         quantidade_comissao = least(x.quantidade_comissao, mt.quantidade - least(x.quantidade_permuta, mt.quantidade))
    from app.estudo_massa_tipologias mt
   where x.viabilidade_id = v.id and x.massa_tipologia_id = mt.id
     and (x.nome, x.area_privativa, x.quantidade, x.ordem) is distinct from (mt.nome, mt.area_privativa, mt.quantidade, mt.ordem);
  insert into app.viabilidade_tipologias (empresa_id, viabilidade_id, ordem, nome, area_privativa, quantidade, massa_tipologia_id)
  select v.empresa_id, v.id, mt.ordem, mt.nome, mt.area_privativa, mt.quantidade, mt.id
    from app.estudo_massa_tipologias mt
   where mt.estudo_id = m.id and not exists (select 1 from app.viabilidade_tipologias x where x.viabilidade_id = v.id and x.massa_tipologia_id = mt.id)
   order by mt.ordem;
  perform set_config('app.massa_sync', '', true);
  update app.viabilidades set estudo_massa_id = m.id, area_construida = m.area_construida_m2 where id = v.id;
  perform app._recalcular_viabilidade(v.id);
end $$;

-- As viabilidades presas a um estudo (ou que seguem o válido do terreno).
create or replace function app._massa_propagar(p_estudo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare m app.estudos_massa;
begin
  select * into m from app.estudos_massa where id = p_estudo;
  perform app._sincronizar_massa(v.id) from app.viabilidades v
   where v.estudo_massa_id = p_estudo or (v.segue_massa_valido and v.terreno_id = m.terreno_id and m.valido);
end $$;

-- ---------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------
create or replace function app.solicitar_estudo_massa(p_terreno uuid, p_arquiteto uuid, p_briefing text default null,
                                                      p_prazo date default null, p_nome text default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare t app.terrenos; v_ordem int; v_id uuid;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if p_arquiteto is null or not exists (select 1 from app.membros where empresa_id = t.empresa_id and user_id = p_arquiteto) then
    raise exception 'Marque o arquiteto (alguém da equipe)' using errcode = '22023';
  end if;
  select coalesce(max(ordem), 0) + 1 into v_ordem from app.estudos_massa where terreno_id = t.id;
  insert into app.estudos_massa (empresa_id, terreno_id, ordem, nome, arquiteto_id, briefing, prazo)
  values (t.empresa_id, t.id, v_ordem, coalesce(nullif(trim(p_nome), ''), 'Estudo de massa ' || v_ordem), p_arquiteto,
          nullif(trim(coalesce(p_briefing, '')), ''), p_prazo)
  returning id into v_id;
  perform app._notificar(t.empresa_id, p_arquiteto, 'massa_solicitado',
                         format('%s pediu o estudo de massa %s do %s', coalesce((select nome from app.membros where empresa_id = t.empresa_id and user_id = auth.uid()), 'Alguém'), v_ordem, t.codigo),
                         t.id, 'estudos_massa', v_id);
  return v_id;
end $$;

-- Dados do estudo e, em "tipologias", a lista inteira (as que têm id são
-- atualizadas, as sem id entram, as que faltam saem).
create or replace function app.salvar_estudo_massa(p_id uuid, p_dados jsonb)
returns void
language plpgsql security definer set search_path = ''
as $$
declare m app.estudos_massa; t app.terrenos; j jsonb; n int := 0; v_sit text; v_area numeric; v_un int;
  CAMPOS constant text[] := array['lazer_coberto_torre_m2','lazer_descoberto_torre_m2','lazer_coberto_fora_m2','lazer_descoberto_fora_m2',
    'circulacao_m2','anexos_m2','vagas_cobertas','vagas_descobertas','estacionamento_coberto_m2','estacionamento_descoberto_m2',
    'contencao_ate_1_5_m2','contencao_acima_1_5_m2','area_construida_m2','ca_legal','ca_venal'];
begin
  select * into m from app.estudos_massa where id = p_id for update;
  if not found then raise exception 'Estudo de massa não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(m.empresa_id);
  select * into t from app.terrenos where id = m.terreno_id;
  perform app._chaves_permitidas(p_dados, CAMPOS || array['nome','arquiteto_id','briefing','prazo','observacoes','situacao','tipologias']);
  if p_dados ? 'nome' and length(trim(coalesce(p_dados->>'nome', ''))) = 0 then raise exception 'Dê um nome ao estudo' using errcode = '22023'; end if;
  if p_dados ? 'arquiteto_id' and not exists (select 1 from app.membros where empresa_id = m.empresa_id and user_id = (p_dados->>'arquiteto_id')::uuid) then
    raise exception 'Marque o arquiteto (alguém da equipe)' using errcode = '22023';
  end if;
  update app.estudos_massa set
    nome = case when p_dados ? 'nome' then trim(p_dados->>'nome') else nome end,
    arquiteto_id = case when p_dados ? 'arquiteto_id' then (p_dados->>'arquiteto_id')::uuid else arquiteto_id end,
    briefing = case when p_dados ? 'briefing' then nullif(trim(coalesce(p_dados->>'briefing', '')), '') else briefing end,
    prazo = case when p_dados ? 'prazo' then (p_dados->>'prazo')::date else prazo end,
    observacoes = case when p_dados ? 'observacoes' then nullif(trim(coalesce(p_dados->>'observacoes', '')), '') else observacoes end,
    lazer_coberto_torre_m2 = case when p_dados ? 'lazer_coberto_torre_m2' then (p_dados->>'lazer_coberto_torre_m2')::numeric else lazer_coberto_torre_m2 end,
    lazer_descoberto_torre_m2 = case when p_dados ? 'lazer_descoberto_torre_m2' then (p_dados->>'lazer_descoberto_torre_m2')::numeric else lazer_descoberto_torre_m2 end,
    lazer_coberto_fora_m2 = case when p_dados ? 'lazer_coberto_fora_m2' then (p_dados->>'lazer_coberto_fora_m2')::numeric else lazer_coberto_fora_m2 end,
    lazer_descoberto_fora_m2 = case when p_dados ? 'lazer_descoberto_fora_m2' then (p_dados->>'lazer_descoberto_fora_m2')::numeric else lazer_descoberto_fora_m2 end,
    circulacao_m2 = case when p_dados ? 'circulacao_m2' then (p_dados->>'circulacao_m2')::numeric else circulacao_m2 end,
    anexos_m2 = case when p_dados ? 'anexos_m2' then (p_dados->>'anexos_m2')::numeric else anexos_m2 end,
    vagas_cobertas = case when p_dados ? 'vagas_cobertas' then (p_dados->>'vagas_cobertas')::int else vagas_cobertas end,
    vagas_descobertas = case when p_dados ? 'vagas_descobertas' then (p_dados->>'vagas_descobertas')::int else vagas_descobertas end,
    estacionamento_coberto_m2 = case when p_dados ? 'estacionamento_coberto_m2' then (p_dados->>'estacionamento_coberto_m2')::numeric else estacionamento_coberto_m2 end,
    estacionamento_descoberto_m2 = case when p_dados ? 'estacionamento_descoberto_m2' then (p_dados->>'estacionamento_descoberto_m2')::numeric else estacionamento_descoberto_m2 end,
    contencao_ate_1_5_m2 = case when p_dados ? 'contencao_ate_1_5_m2' then (p_dados->>'contencao_ate_1_5_m2')::numeric else contencao_ate_1_5_m2 end,
    contencao_acima_1_5_m2 = case when p_dados ? 'contencao_acima_1_5_m2' then (p_dados->>'contencao_acima_1_5_m2')::numeric else contencao_acima_1_5_m2 end,
    area_construida_m2 = case when p_dados ? 'area_construida_m2' then (p_dados->>'area_construida_m2')::numeric else area_construida_m2 end,
    ca_legal = case when p_dados ? 'ca_legal' then (p_dados->>'ca_legal')::numeric else ca_legal end,
    ca_venal = case when p_dados ? 'ca_venal' then (p_dados->>'ca_venal')::numeric else ca_venal end
  where id = m.id;
  if p_dados ? 'tipologias' then
    if jsonb_typeof(p_dados->'tipologias') <> 'array' then raise exception 'tipologias: lista' using errcode = '22023'; end if;
    perform set_config('app.massa_sync', 'on', true);
    delete from app.estudo_massa_tipologias where estudo_id = m.id
       and id::text not in (select x->>'id' from jsonb_array_elements(p_dados->'tipologias') x where x ? 'id');
    for j in select x from jsonb_array_elements(p_dados->'tipologias') x loop
      n := n + 1;
      if length(trim(coalesce(j->>'nome', ''))) = 0 then raise exception 'Toda tipologia precisa de um título' using errcode = '22023'; end if;
      if j ? 'id' then
        update app.estudo_massa_tipologias set ordem = n, nome = trim(j->>'nome'), area_privativa = (j->>'area_privativa')::numeric,
               quantidade = coalesce((j->>'quantidade')::int, 0)
         where id = (j->>'id')::uuid and estudo_id = m.id;
        if not found then raise exception 'Tipologia de outro estudo' using errcode = '22023'; end if;
      else
        insert into app.estudo_massa_tipologias (empresa_id, estudo_id, ordem, nome, area_privativa, quantidade)
        values (m.empresa_id, m.id, n, trim(j->>'nome'), (j->>'area_privativa')::numeric, coalesce((j->>'quantidade')::int, 0));
      end if;
    end loop;
    perform set_config('app.massa_sync', '', true);
  end if;
  select sum(area_privativa * quantidade), coalesce(sum(quantidade), 0) into v_area, v_un from app.estudo_massa_tipologias where estudo_id = m.id;
  -- situação: o primeiro dado põe em elaboração; entregue (o Salvar do estudo) só pede uma unidade lançada
  v_sit := coalesce(p_dados->>'situacao', case when m.situacao = 'solicitado' and (p_dados ?| CAMPOS or p_dados ? 'tipologias') then 'em_elaboracao' else m.situacao end);
  if v_sit not in ('solicitado','em_elaboracao','entregue') then raise exception 'Situação inválida' using errcode = '22023'; end if;
  if v_sit = 'entregue' and v_un = 0 then
    raise exception 'Para salvar, lance pelo menos uma unidade' using errcode = '23514';
  end if;
  if v_sit <> 'entregue' and m.valido then
    raise exception 'O estudo válido continua entregue: marque outro como válido antes' using errcode = '23514';
  end if;
  update app.estudos_massa set area_privativa_m2 = v_area, unidades = v_un, situacao = v_sit,
         entregue_em = case when v_sit = 'entregue' then coalesce(entregue_em, now()) end
   where id = m.id;
  if v_sit = 'entregue' and m.situacao <> 'entregue' then
    perform app._notificar(m.empresa_id, m.solicitante_id, 'massa_entregue', format('%s entregue no %s', m.nome, t.codigo), t.id, 'estudos_massa', m.id);
  end if;
  if p_dados ? 'arquiteto_id' and (p_dados->>'arquiteto_id')::uuid is distinct from m.arquiteto_id then
    perform app._notificar(m.empresa_id, (p_dados->>'arquiteto_id')::uuid, 'massa_solicitado', format('%s do %s passou para você', m.nome, t.codigo), t.id, 'estudos_massa', m.id);
  end if;
  perform app._massa_propagar(m.id);
end $$;

-- O válido do terreno (um só, entregue); p_valido false tira a marca.
create or replace function app.marcar_massa_valido(p_id uuid, p_valido boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
declare m app.estudos_massa;
begin
  select * into m from app.estudos_massa where id = p_id for update;
  if not found then raise exception 'Estudo de massa não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(m.empresa_id);
  if p_valido and m.situacao <> 'entregue' then raise exception 'Só o estudo entregue pode ser o válido' using errcode = '23514'; end if;
  if p_valido then
    update app.estudos_massa set valido = false where terreno_id = m.terreno_id and valido and id <> m.id;
  end if;
  update app.estudos_massa set valido = p_valido where id = m.id;
  if p_valido then perform app._massa_propagar(m.id); end if;
end $$;

-- Some só o que não é válido nem tem viabilidade presa a ele; os arquivos
-- ficam em Documentos.
create or replace function app.apagar_estudo_massa(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare m app.estudos_massa;
begin
  select * into m from app.estudos_massa where id = p_id for update;
  if not found then raise exception 'Estudo de massa não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(m.empresa_id);
  if m.valido then raise exception 'O estudo válido não se apaga' using errcode = '23503'; end if;
  if exists (select 1 from app.viabilidades where estudo_massa_id = p_id) then
    raise exception 'Há estudo de viabilidade preso a este estudo de massa: solte-o antes' using errcode = '23503';
  end if;
  delete from app.estudos_massa where id = p_id;
end $$;

-- Prende a viabilidade a um estudo de massa (entregue) ou ao válido do
-- terreno; sem estudo e sem seguir, solta (as tipologias ficam e voltam a se editar).
create or replace function app.vincular_massa(p_viab uuid, p_estudo uuid, p_seguir_valido boolean default false)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades; m app.estudos_massa;
begin
  select * into v from app.viabilidades where id = p_viab and tipo = 'estatica' for update;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  if p_seguir_valido then
    select * into m from app.estudos_massa where terreno_id = v.terreno_id and valido;
    if not found then raise exception 'O terreno ainda não tem estudo de massa válido' using errcode = '23514'; end if;
  elsif p_estudo is not null then
    select * into m from app.estudos_massa where id = p_estudo;
    if not found or m.terreno_id <> v.terreno_id then raise exception 'Estudo de massa de outro terreno' using errcode = '23514'; end if;
    if m.situacao <> 'entregue' then raise exception 'Use um estudo de massa entregue' using errcode = '23514'; end if;
  end if;
  if m.id is null then
    update app.viabilidades set estudo_massa_id = null, segue_massa_valido = false where id = v.id;
    perform set_config('app.massa_sync', 'on', true);
    update app.viabilidade_tipologias set massa_tipologia_id = null where viabilidade_id = v.id;
    perform set_config('app.massa_sync', '', true);
    return;
  end if;
  update app.viabilidades set estudo_massa_id = m.id, segue_massa_valido = p_seguir_valido where id = v.id;
  perform app._sincronizar_massa(v.id);
end $$;

-- O botão do estudo de massa: estudo de viabilidade novo (modelo padrão da
-- empresa, como o Novo estudo) já preso a ele.
create or replace function app.criar_viabilidade_da_massa(p_estudo uuid, p_nome text default null, p_seguir_valido boolean default false)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare m app.estudos_massa; v_id uuid;
begin
  select * into m from app.estudos_massa where id = p_estudo;
  if not found then raise exception 'Estudo de massa não encontrado' using errcode = 'P0002'; end if;
  if p_seguir_valido and not m.valido then raise exception 'Só o estudo válido pode ser seguido' using errcode = '23514'; end if;
  v_id := app.criar_viabilidade(m.terreno_id, coalesce(nullif(trim(p_nome), ''), 'Viabilidade do ' || m.nome));
  perform app.vincular_massa(v_id, m.id, p_seguir_valido);
  return v_id;
end $$;

-- PDF e DWG do estudo, em Documentos (cada envio é uma versão).
create or replace function app.anexar_arquivo_massa(p_estudo uuid, p_tipo text, p_storage_path text, p_nome_arquivo text, p_tamanho bigint default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare m app.estudos_massa; d uuid; v_id uuid;
begin
  select * into m from app.estudos_massa where id = p_estudo;
  if not found then raise exception 'Estudo de massa não encontrado' using errcode = 'P0002'; end if;
  if p_tipo not in ('massa_pdf','massa_dwg') then raise exception 'O estudo de massa leva o PDF e o DWG' using errcode = '22023'; end if;
  if lower(p_nome_arquivo) not like '%.' || substr(p_tipo, 7) then
    raise exception 'Envie um arquivo .%', substr(p_tipo, 7) using errcode = '22023';
  end if;
  select id into d from app.documentos where estudo_massa_id = m.id and tipo_documento = p_tipo;
  v_id := app.registrar_documento(m.terreno_id, p_tipo, p_storage_path, p_nome_arquivo, p_documento => d,
                                  p_nome => m.nome || ' (' || upper(substr(p_tipo, 7)) || ')', p_tamanho => p_tamanho);
  update app.documentos set estudo_massa_id = m.id where id = v_id and estudo_massa_id is null;
  return v_id;
end $$;

revoke execute on function app._sincronizar_massa(uuid), app._massa_propagar(uuid) from public;
revoke execute on function app.solicitar_estudo_massa(uuid, uuid, text, date, text), app.salvar_estudo_massa(uuid, jsonb),
  app.marcar_massa_valido(uuid, boolean), app.apagar_estudo_massa(uuid), app.vincular_massa(uuid, uuid, boolean),
  app.criar_viabilidade_da_massa(uuid, text, boolean), app.anexar_arquivo_massa(uuid, text, text, text, bigint) from public;
grant execute on function app.solicitar_estudo_massa(uuid, uuid, text, date, text), app.salvar_estudo_massa(uuid, jsonb),
  app.marcar_massa_valido(uuid, boolean), app.apagar_estudo_massa(uuid), app.vincular_massa(uuid, uuid, boolean),
  app.criar_viabilidade_da_massa(uuid, text, boolean), app.anexar_arquivo_massa(uuid, text, text, text, bigint) to authenticated;
