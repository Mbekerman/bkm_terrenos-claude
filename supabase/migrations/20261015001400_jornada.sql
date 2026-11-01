-- =====================================================================
-- Jornada do terreno (decisões do Moisés, 1/nov/2026; simulação "Jornada do
-- terreno"). O administrador monta, em Configurações › Funil › Jornada, tudo
-- o que cada etapa e subetapa de cada fase pede para avançar:
--   - perguntas e campos (app.jornada_itens): cada item aponta para um campo
--     do terreno (catálogo, app.campos_catalogo) ou para um campo novo do
--     terreno (personalizado.<codigo>, app.campos_terreno). A resposta grava
--     no próprio campo: a ficha, o cartão da tarefa e a jornada leem e gravam
--     o mesmo valor (fonte única). A forma de responder segue o tipo do campo
--     (fluxo.formas);
--   - documentos (app.checklist_modelo), pré-requisitos de passagem
--     (app.prerequisitos_modelo) e tarefas da etapa (app.etapa_regras), que
--     continuam nas suas tabelas e aparecem na mesma tela;
--   - regras pelo valor da resposta (app.jornada_regras): quando a condição
--     vale, não avança (bloqueia), pede aprovação do gestor ou do diretor, ou
--     só avisa.
-- Cada item tem a regra se estiver em branco: bloqueia (não avança; gestor e
-- diretor passam com justificativa), justifica (qualquer editor passa com
-- justificativa) ou livre (aparece, não trava), e o "Vale quando": fora da
-- condição, o item não aparece nem trava.
-- Saída: item da etapa (sem subetapa) vale para sair da etapa para frente ou
-- concluir a fase; item de uma subetapa vale para sair dela para frente, e
-- também para sair da etapa (inclusive pulando a subetapa). Voltar não exige.
-- =====================================================================
create table app.jornada_itens (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  fase        text not null,
  etapa       text not null,
  subetapa    text,                -- vazio = a etapa toda
  campo       text not null,       -- chave do campo (catálogo ou personalizado.<codigo>)
  pergunta    text check (pergunta is null or length(trim(pergunta)) > 0),   -- vazio = o título do campo
  ajuda       text,
  forma       text check (forma in ('menu','radio','chips','segmentado','chave','botoes','caixas','linha','paragrafo','campo')),
  regra       text not null default 'bloqueia' check (regra in ('bloqueia','justifica','livre')),
  condicao    jsonb,
  ordem       int not null default 0,
  ativo       boolean not null default true,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now(),
  unique nulls not distinct (empresa_id, fase, etapa, subetapa, campo),
  foreign key (empresa_id, fase, etapa) references app.etapas_modelo(empresa_id, fase, codigo) on delete cascade,
  foreign key (empresa_id, fase, subetapa) references app.subetapas_modelo(empresa_id, fase, codigo) on delete cascade
);
create index on app.jornada_itens (empresa_id, fase, etapa) where ativo;

create table app.jornada_regras (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references app.empresas(id) on delete cascade,
  fase        text not null,
  etapa       text not null,
  subetapa    text,
  condicao    jsonb not null,
  acao        text not null check (acao in ('bloqueia','gestor','diretor','avisa')),
  mensagem    text not null check (length(trim(mensagem)) > 0),
  ordem       int not null default 0,
  ativo       boolean not null default true,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now(),
  foreign key (empresa_id, fase, etapa) references app.etapas_modelo(empresa_id, fase, codigo) on delete cascade,
  foreign key (empresa_id, fase, subetapa) references app.subetapas_modelo(empresa_id, fase, codigo) on delete cascade
);
create index on app.jornada_regras (empresa_id, fase, etapa) where ativo;

alter table app.jornada_itens enable row level security;
alter table app.jornada_regras enable row level security;
create policy ver on app.jornada_itens for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy ver on app.jornada_regras for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.jornada_itens, app.jornada_regras to authenticated;
create trigger t_aud after insert or update or delete on app.jornada_itens for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.jornada_regras for each row execute function app.tg_auditoria();

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------
-- O item (ou a regra) de p_etapa/p_sub vale para esta passagem?
create or replace function app._jornada_na_saida(p app.processos, p_destino_tipo text, p_destino text, p_etapa text, p_sub text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_etapa = p.etapa_atual and case
    when p_destino_tipo = 'status' then p_destino = 'concluido'
    when p_destino_tipo = 'etapa' then app._ordem_etapa(p.empresa_id, p.fase, p_destino) > app._ordem_etapa(p.empresa_id, p.fase, p.etapa_atual)
    when p_destino_tipo = 'subetapa' then p_sub is not null
      and app._ordem_subetapa(p.empresa_id, p.fase, p_sub) >= app._ordem_subetapa(p.empresa_id, p.fase, p.subetapa_atual)
      and app._ordem_subetapa(p.empresa_id, p.fase, p_sub) < app._ordem_subetapa(p.empresa_id, p.fase, p_destino)
    else false end $$;

-- Pendências da jornada para a passagem (entram em app._pendencias)
create or replace function app._jornada_pendencias(p app.processos, p_destino_tipo text, p_destino text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare itens jsonb := '[]'::jsonb; r record; ok boolean;
begin
  if p.parte_id is not null then return itens; end if;   -- a jornada é do terreno; a parte anda pela negociação dela
  for r in select i.*, d.titulo from app.jornada_itens i cross join lateral app.campo_def(i.empresa_id, i.campo) d
           where i.empresa_id = p.empresa_id and i.fase = p.fase and i.ativo and i.regra <> 'livre'
             and app._jornada_na_saida(p, p_destino_tipo, p_destino, i.etapa, i.subetapa)
             and app.avaliar_condicao(p.terreno_id, i.condicao)
           order by app._ordem_subetapa(p.empresa_id, p.fase, i.subetapa) nulls last, i.ordem loop
    ok := app._valor_campo(p.terreno_id, r.campo) is not null;
    itens := itens || jsonb_build_object('ok', ok, 'tipo', 'jornada', 'bloqueio_gestor', false, 'justifica', r.regra = 'justifica',
      'item_id', r.id, 'campo', r.campo, 'condicao', r.condicao,
      'texto', coalesce(r.pergunta, r.titulo) || case when ok then '' else ': não informado' end);
  end loop;
  for r in select x.* from app.jornada_regras x
           where x.empresa_id = p.empresa_id and x.fase = p.fase and x.ativo and x.acao in ('bloqueia','avisa')
             and app._jornada_na_saida(p, p_destino_tipo, p_destino, x.etapa, x.subetapa)
             and app.avaliar_condicao(p.terreno_id, x.condicao)
           order by x.ordem loop
    itens := itens || jsonb_build_object('ok', r.acao = 'avisa', 'tipo', 'regra_valor', 'aviso', r.acao = 'avisa', 'bloqueio_gestor', false,
      'regra_id', r.id, 'texto', r.mensagem, 'condicao', r.condicao);
  end loop;
  return itens;
end $$;

-- Alguma regra pelo valor pede este nível de aprovação nesta passagem?
create or replace function app._jornada_pede(p app.processos, p_destino_tipo text, p_destino text, p_nivel text)
returns boolean language sql stable security definer set search_path = '' as $$
  select p.parte_id is null and exists (select 1 from app.jornada_regras x
    where x.empresa_id = p.empresa_id and x.fase = p.fase and x.ativo and x.acao = p_nivel
      and app._jornada_na_saida(p, p_destino_tipo, p_destino, x.etapa, x.subetapa)
      and app.avaliar_condicao(p.terreno_id, x.condicao)) $$;

-- A jornada da etapa atual do processo, para o quadro de avanço: os itens que
-- valem agora (com o valor), os que não se aplicam e as regras que valem.
-- Leitura sem permissão de ver o terreno devolve nulo.
create or replace function app.jornada_processo(p_processo uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p app.processos;
begin
  select * into p from app.processos where id = p_processo;
  if p.id is null or (auth.uid() is not null and not app.ve_terreno(p.terreno_id)) then return null; end if;
  return jsonb_build_object(
    'fase', p.fase, 'etapa', p.etapa_atual, 'subetapa', p.subetapa_atual,
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'id', i.id, 'subetapa', i.subetapa, 'campo', i.campo, 'pergunta', coalesce(i.pergunta, d.titulo), 'ajuda', i.ajuda,
        'forma', i.forma, 'regra', i.regra, 'condicao', i.condicao, 'tipo', d.tipo, 'unidade', d.unidade, 'opcoes', to_jsonb(d.opcoes),
        'formato', d.formato, 'editavel', d.editavel, 'aplica', app.avaliar_condicao(p.terreno_id, i.condicao),
        'valor', app._valor_campo(p.terreno_id, i.campo))
        order by app._ordem_subetapa(p.empresa_id, p.fase, i.subetapa) nulls first, i.ordem)
      from app.jornada_itens i cross join lateral app.campo_def(i.empresa_id, i.campo) d
      where i.empresa_id = p.empresa_id and i.fase = p.fase and i.etapa = p.etapa_atual and i.ativo), '[]'::jsonb),
    'regras', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'subetapa', x.subetapa, 'acao', x.acao, 'mensagem', x.mensagem,
        'vale', app.avaliar_condicao(p.terreno_id, x.condicao)) order by x.ordem)
      from app.jornada_regras x where x.empresa_id = p.empresa_id and x.fase = p.fase and x.etapa = p.etapa_atual and x.ativo), '[]'::jsonb));
end $$;

-- ---------------------------------------------------------------------
-- Configuração (só administrador)
-- ---------------------------------------------------------------------
create or replace function app._jornada_lugar(p_empresa uuid, p_fase text, p_etapa text, p_sub text)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not exists (select 1 from app.etapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_etapa) then
    raise exception 'Etapa inválida' using errcode = '22023';
  end if;
  if p_sub is not null and not exists (select 1 from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_sub and etapa = p_etapa) then
    raise exception 'A subetapa não é desta etapa' using errcode = '22023';
  end if;
end $$;

-- p_dados: fase, etapa, subetapa, campo, pergunta, ajuda, forma, regra, condicao, ordem, ativo
create or replace function app.salvar_item_jornada(p_empresa uuid, p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare i app.jornada_itens; d record; v_id uuid := coalesce(p_id, gen_random_uuid()); v_forma text;
begin
  perform app.exigir_administrador(p_empresa);
  if p_id is not null then
    select * into i from app.jornada_itens where id = p_id and empresa_id = p_empresa;
    if i.id is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  end if;
  i.fase := coalesce(p_dados->>'fase', i.fase); i.etapa := coalesce(p_dados->>'etapa', i.etapa);
  i.subetapa := case when p_dados ? 'subetapa' then nullif(p_dados->>'subetapa', '') else i.subetapa end;
  i.campo := coalesce(p_dados->>'campo', i.campo);
  perform app._jornada_lugar(p_empresa, i.fase, i.etapa, i.subetapa);
  select * into d from app.campo_def(p_empresa, i.campo);
  if d.chave is null then raise exception 'Campo desconhecido: %', i.campo using errcode = '22023'; end if;
  v_forma := case when p_dados ? 'forma' then nullif(p_dados->>'forma', '') else i.forma end;
  if v_forma is not null and not (v_forma = any (fluxo.formas(d.tipo, cardinality(d.opcoes)))) then
    raise exception 'A forma % não serve para o campo %', v_forma, d.titulo using errcode = '22023';
  end if;
  insert into app.jornada_itens (id, empresa_id, fase, etapa, subetapa, campo, pergunta, ajuda, forma, regra, condicao, ordem, ativo)
  values (v_id, p_empresa, i.fase, i.etapa, i.subetapa, i.campo,
          case when p_dados ? 'pergunta' then nullif(trim(p_dados->>'pergunta'), '') else i.pergunta end,
          case when p_dados ? 'ajuda' then nullif(trim(p_dados->>'ajuda'), '') else i.ajuda end,
          v_forma, coalesce(p_dados->>'regra', i.regra, 'bloqueia'),
          case when p_dados ? 'condicao' then app._condicao_config(p_empresa, p_dados->'condicao') else i.condicao end,
          coalesce((p_dados->>'ordem')::int, i.ordem,
                   (select coalesce(max(ordem), 0) + 1 from app.jornada_itens where empresa_id = p_empresa and fase = i.fase and etapa = i.etapa)),
          coalesce((p_dados->>'ativo')::boolean, i.ativo, true))
  on conflict (id) do update set fase = excluded.fase, etapa = excluded.etapa, subetapa = excluded.subetapa, campo = excluded.campo,
    pergunta = excluded.pergunta, ajuda = excluded.ajuda, forma = excluded.forma, regra = excluded.regra, condicao = excluded.condicao,
    ordem = excluded.ordem, ativo = excluded.ativo;
  return v_id;
exception when unique_violation then
  raise exception 'O campo % já está nesta etapa', d.titulo using errcode = '23505';
end $$;

-- Tirar da jornada: o valor já respondido fica no terreno (é do campo, não do item).
create or replace function app.apagar_item_jornada(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.jornada_itens where id = p_id;
  if v_emp is null then raise exception 'Item não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  delete from app.jornada_itens where id = p_id;
end $$;

-- p_dados: fase, etapa, subetapa, condicao (obrigatória), acao, mensagem, ordem, ativo
create or replace function app.salvar_regra_jornada(p_empresa uuid, p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare x app.jornada_regras; v_id uuid := coalesce(p_id, gen_random_uuid()); v_cond jsonb;
begin
  perform app.exigir_administrador(p_empresa);
  if p_id is not null then
    select * into x from app.jornada_regras where id = p_id and empresa_id = p_empresa;
    if x.id is null then raise exception 'Regra não encontrada' using errcode = 'P0002'; end if;
  end if;
  x.fase := coalesce(p_dados->>'fase', x.fase); x.etapa := coalesce(p_dados->>'etapa', x.etapa);
  x.subetapa := case when p_dados ? 'subetapa' then nullif(p_dados->>'subetapa', '') else x.subetapa end;
  perform app._jornada_lugar(p_empresa, x.fase, x.etapa, x.subetapa);
  v_cond := case when p_dados ? 'condicao' then app._condicao_config(p_empresa, p_dados->'condicao') else x.condicao end;
  if v_cond is null then raise exception 'A regra precisa de uma condição' using errcode = '22023'; end if;
  insert into app.jornada_regras (id, empresa_id, fase, etapa, subetapa, condicao, acao, mensagem, ordem, ativo)
  values (v_id, p_empresa, x.fase, x.etapa, x.subetapa, v_cond, coalesce(p_dados->>'acao', x.acao),
          coalesce(nullif(trim(p_dados->>'mensagem'), ''), x.mensagem),
          coalesce((p_dados->>'ordem')::int, x.ordem, (select coalesce(max(ordem), 0) + 1 from app.jornada_regras where empresa_id = p_empresa and fase = x.fase and etapa = x.etapa)),
          coalesce((p_dados->>'ativo')::boolean, x.ativo, true))
  on conflict (id) do update set fase = excluded.fase, etapa = excluded.etapa, subetapa = excluded.subetapa, condicao = excluded.condicao,
    acao = excluded.acao, mensagem = excluded.mensagem, ordem = excluded.ordem, ativo = excluded.ativo;
  return v_id;
end $$;

create or replace function app.apagar_regra_jornada(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.jornada_regras where id = p_id;
  if v_emp is null then raise exception 'Regra não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  delete from app.jornada_regras where id = p_id;
end $$;

-- Regra do pré-requisito na jornada: bloqueia ou justifica
create or replace function app.regra_prerequisito(p_id uuid, p_regra text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.prerequisitos_modelo where id = p_id;
  if v_emp is null then raise exception 'Pré-requisito não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  update app.prerequisitos_modelo set regra = p_regra where id = p_id;
end $$;

revoke all on function app._jornada_na_saida(app.processos, text, text, text, text), app._jornada_pendencias(app.processos, text, text),
  app._jornada_pede(app.processos, text, text, text), app._jornada_lugar(uuid, text, text, text) from public;
revoke all on function app.jornada_processo(uuid), app.salvar_item_jornada(uuid, uuid, jsonb), app.apagar_item_jornada(uuid),
  app.salvar_regra_jornada(uuid, uuid, jsonb), app.apagar_regra_jornada(uuid), app.regra_prerequisito(uuid, text) from public;
grant execute on function app.jornada_processo(uuid), app.salvar_item_jornada(uuid, uuid, jsonb), app.apagar_item_jornada(uuid),
  app.salvar_regra_jornada(uuid, uuid, jsonb), app.apagar_regra_jornada(uuid), app.regra_prerequisito(uuid, text) to authenticated;
