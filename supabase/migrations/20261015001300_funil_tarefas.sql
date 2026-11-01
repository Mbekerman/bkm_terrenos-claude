-- =====================================================================
-- Ligação funil × quadros, lote B (decisões do Moisés, 30 e 31/out/2026;
-- simulação "Funil e quadros", pontos 1 a 6, 9 e 10).
--
-- 1. Tarefas da etapa: cada etapa de cada fase tem regras (app.etapa_regras).
--    Cada regra diz quando nasce (ao entrar na etapa ou numa subetapa dela),
--    o quê (um modelo de tarefas da empresa, ou uma tarefa só), a condição
--    opcional ("Vale quando") e se trava a saída. Os prazos contam do dia da
--    entrada; "responsável do terreno" é o do terreno naquela hora; cada
--    tarefa fica marcada com a etapa (fluxo.tarefas.processo_id, etapa,
--    subetapa) e com a regra que a criou (app.tarefas_etapa).
-- 2. Trava: tarefa aberta de regra com a trava ligada entra nas pendências da
--    passagem (app._pendencias): a de etapa trava a saída da etapa e a de
--    subetapa, a saída da subetapa. A tarefa criada à mão na etapa trava a
--    etapa quando alguma regra da etapa (sem subetapa) tem a trava ligada.
--    O gestor e o diretor forçam com justificativa, como nas outras pendências.
-- 3. A tarefa criada à mão nasce na etapa atual do terreno (app.tg_tarefa_processo);
--    quem edita troca a etapa ou põe "Nenhuma" (nunca trava).
-- 4. Stand By pausa as tarefas abertas da fase (fluxo._pausar_de_fora, sem
--    pedido); a retomada as devolve, com os prazos andando os dias parados.
-- 5. Perdido e Descartado arquivam as tarefas abertas da fase, ou as mantêm,
--    à escolha (encerrar_processo, p_tarefas). A conclusão não mexe nelas.
-- 6. Concluída a última tarefa que trava, o responsável do terreno recebe
--    "TER-... pode avançar" (tipo pode_avancar). O sistema não avança sozinho.
--    Entrar na etapa dispara o gatilho de automação "Terreno entrou na etapa"
--    nos cartões daquela etapa.
-- 9. Condição deixou de valer: a tarefa fica, não trava e mostra "Não se
--    aplica mais" (situação nao_se_aplica, calculada).
-- 10. Voltar de etapa: tarefa aberta das etapas deixadas sem trabalho
--    (comentário, anexo, item marcado, subtarefa, campo preenchido ou troca de
--    lista) é arquivada sozinha; com trabalho, fica "Etapa deixada", não trava
--    e o responsável dela é avisado. Ao voltar à etapa, as arquivadas sozinhas
--    voltam (mesmo código, prazos refeitos) e as deixadas voltam a travar; a
--    regra só cria a tarefa que ainda não existe; concluída continua concluída.
-- Condição também no checklist de documentos e nos pré-requisitos (colunas
-- condicao em 000200; conferidas em app._pendencias).
-- =====================================================================

create table app.etapa_regras (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references app.empresas(id) on delete cascade,
  fase                text not null,
  etapa               text not null,
  subetapa            text,                                   -- vazio = ao entrar na etapa
  modelo_id           uuid references fluxo.modelos_quadro(id),  -- um modelo da empresa inteiro...
  titulo              text check (titulo is null or length(trim(titulo)) > 0),  -- ...ou uma tarefa só
  descricao           text,
  lista_nome          text,                                   -- lista do quadro com esse nome (senão, a primeira aberta)
  prioridade          text not null default 'media' check (prioridade in ('baixa','media','alta')),
  prazo_dias          int check (prazo_dias is null or prazo_dias between 0 and 3650),  -- prazo N dias depois de entrar; vazio = sem prazo
  responsavel_objeto  boolean not null default true,          -- o responsável do terreno
  responsavel_id      uuid references auth.users(id),
  condicao            jsonb,                                  -- "Vale quando"; vazio = sempre
  trava               boolean not null default false,         -- pode travar a saída (= regra <> livre ou com regra condicional)
  regra               text not null default 'livre' check (regra in ('bloqueia','justifica','livre')),  -- tarefa aberta ao sair (jornada, 1/nov/2026)
  regra_cond          jsonb,                                  -- regra condicional [{condicao, regra}]
  ordem               int not null default 0,
  ativo               boolean not null default true,
  criado_por          uuid default auth.uid(),
  criado_em           timestamptz not null default now(),
  check ((modelo_id is null) <> (titulo is null)),
  check (not (responsavel_objeto and responsavel_id is not null)),
  foreign key (empresa_id, fase, etapa) references app.etapas_modelo(empresa_id, fase, codigo) on delete cascade,
  foreign key (empresa_id, fase, subetapa) references app.subetapas_modelo(empresa_id, fase, codigo) on delete cascade
);
create index on app.etapa_regras (empresa_id, fase, etapa) where ativo;

-- A tarefa que uma regra criou (ou que ficou para trás numa volta de etapa).
create table app.tarefas_etapa (
  tarefa_id         uuid primary key references fluxo.tarefas(id) on delete cascade,
  empresa_id        uuid not null references app.empresas(id) on delete cascade,
  processo_id       uuid not null references app.processos(id) on delete cascade,
  regra_id          uuid references app.etapa_regras(id) on delete set null,
  modelo_tarefa_id  uuid references fluxo.modelo_tarefas(id) on delete set null,  -- a tarefa do modelo (não nasce de novo)
  condicao          jsonb,              -- a da tarefa do modelo (a da regra fica na regra)
  inicio_dias       int,                -- para refazer as datas ao voltar
  duracao           int,
  situacao          text not null default 'ativa' check (situacao in ('ativa','deixada','arquivada_auto')),
  situacao_em       timestamptz not null default now()
);
create index on app.tarefas_etapa (processo_id, regra_id);

-- ---------------------------------------------------------------------
-- Leitura
-- ---------------------------------------------------------------------
create or replace function app._ordem_subetapa(p_empresa uuid, p_fase text, p_subetapa text)
returns int language sql stable security definer set search_path = '' as $$
  select ordem from app.subetapas_modelo where empresa_id = p_empresa and fase = p_fase and codigo = p_subetapa $$;

-- Situação da tarefa na etapa: nivel (o que ela trava: etapa, subetapa ou nada),
-- situacao (ativa, deixada, arquivada_auto, nao_se_aplica) e trava (trava agora,
-- se estiver aberta).
create or replace function app._trava_tarefa(p_tarefa uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare k fluxo.tarefas; x app.tarefas_etapa; r app.etapa_regras; p app.processos; v_nivel text; v_sit text := 'ativa'; v_regra text;
begin
  select * into k from fluxo.tarefas where id = p_tarefa;
  if k.processo_id is null or k.etapa is null then return null; end if;
  select * into p from app.processos where id = k.processo_id;
  select * into x from app.tarefas_etapa where tarefa_id = k.id;
  if x.regra_id is not null then
    select * into r from app.etapa_regras g where g.id = x.regra_id and g.ativo and g.etapa = k.etapa and g.subetapa is not distinct from k.subetapa;
  end if;
  if r.id is not null then
    v_regra := app._regra_branco(p.terreno_id, r.regra, r.regra_cond);
    if v_regra <> 'livre' then v_nivel := case when r.subetapa is null then 'etapa' else 'subetapa' end; end if;
    if not (app.avaliar_condicao(p.terreno_id, r.condicao) and app.avaliar_condicao(p.terreno_id, x.condicao)) then v_sit := 'nao_se_aplica'; end if;
  else
    -- tarefa à mão (ou que mudou de etapa): trava se a etapa trava, pela regra mais forte das regras da etapa
    select g.regra into v_regra from (select app._regra_branco(p.terreno_id, g.regra, g.regra_cond) as regra from app.etapa_regras g
      where g.empresa_id = p.empresa_id and g.fase = p.fase and g.etapa = k.etapa and g.subetapa is null and g.trava and g.ativo) g
      where g.regra <> 'livre' order by g.regra = 'justifica' limit 1;
    if v_regra is not null then v_nivel := 'etapa'; end if;
  end if;
  if x.situacao in ('deixada','arquivada_auto') then v_sit := x.situacao; end if;
  return jsonb_build_object('nivel', v_nivel, 'situacao', v_sit, 'trava', v_nivel is not null and v_sit = 'ativa',
                            'regra', case when v_nivel is not null then v_regra end);
end $$;

-- Para a tela: quem vê o cartão vê a situação dele na etapa.
create or replace function app.trava_tarefa(p_tarefa uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when fluxo.papel_tarefa(p_tarefa) is not null then app._trava_tarefa(p_tarefa) end $$;

-- Tarefas abertas que travam a saída (p_saida: etapa ou subetapa), como itens de pendência.
create or replace function app._tarefas_travando(p app.processos, p_saida text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'ok', false, 'tipo', 'tarefa', 'bloqueio_gestor', false, 'justifica', t.j->>'regra' = 'justifica', 'tarefa_id', k.id, 'codigo', k.codigo, 'lista', l.nome,
           'nivel', t.j->>'nivel', 'atrasada', k.prazo < current_date and l.tipo <> 'pausa',
           'texto', 'Tarefa ' || k.codigo || ': ' || case when auth.uid() is null or fluxo.papel_tarefa(k.id) is not null then k.titulo else 'restrita' end)
           order by k.prazo nulls last, k.codigo), '[]'::jsonb)
  from fluxo.tarefas k
  join fluxo.listas l on l.id = k.lista_id
  cross join lateral (select app._trava_tarefa(k.id) as j) t
  where k.processo_id = p.id and k.etapa = p.etapa_atual and k.concluida_em is null and k.arquivada_em is null and not k.modelo
    and (t.j->>'trava')::boolean
    and case when p_saida = 'subetapa' then t.j->>'nivel' = 'subetapa' and k.subetapa = p.subetapa_atual
             else t.j->>'nivel' = 'etapa' or (t.j->>'nivel' = 'subetapa' and k.subetapa = p.subetapa_atual) end $$;

-- Cartões dos terrenos com a etapa do funil: fase, etapa e subetapa em que
-- nasceu, o que trava e a situação (ativa, deixada, arquivada_auto, nao_se_aplica).
create view app.v_tarefas_etapa with (security_invoker = true) as
select k.id as tarefa_id, k.codigo, k.processo_id, p.fase, k.etapa, k.subetapa,
       e.nome as etapa_nome, s.nome as subetapa_nome, f.nome as fase_nome,
       x.regra_id, coalesce(m.nome, g.titulo) as regra_nome,
       j.j->>'nivel' as trava_nivel, j.j->>'situacao' as situacao, coalesce((j.j->>'trava')::boolean, false) as trava
from fluxo.tarefas k
join app.processos p on p.id = k.processo_id
join app.fases_modelo f on f.empresa_id = p.empresa_id and f.codigo = p.fase
left join app.etapas_modelo e on e.empresa_id = p.empresa_id and e.fase = p.fase and e.codigo = k.etapa
left join app.subetapas_modelo s on s.empresa_id = p.empresa_id and s.fase = p.fase and s.codigo = k.subetapa
left join app.tarefas_etapa x on x.tarefa_id = k.id
left join app.etapa_regras g on g.id = x.regra_id
left join fluxo.modelos_quadro m on m.id = g.modelo_id
cross join lateral (select app.trava_tarefa(k.id) as j) j
where k.etapa is not null;

-- Quantas tarefas abertas a fase tem (para os formulários de Stand By, Perdido e Descartado).
create or replace function app.tarefas_abertas_fase(p_processo uuid)
returns int language sql stable security definer set search_path = '' as $$
  select count(*)::int from fluxo.tarefas k
  where (k.processo_id = p_processo or k.processo_id in (select id from app.processos where principal_id = p_processo))
    and k.concluida_em is null and k.arquivada_em is null and not k.modelo
    and (select empresa_id from app.processos where id = p_processo) in (select app.minhas_empresas()) $$;

-- ---------------------------------------------------------------------
-- Entrar, voltar, parar e retomar
-- ---------------------------------------------------------------------
-- Entrar na etapa (p_tipo etapa, já com a subetapa inicial) ou numa subetapa.
create or replace function app._tarefas_ao_entrar(p_processo uuid, p_tipo text, p_codigo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  p app.processos; t app.terrenos; v_quadro uuid; v_sub text; r app.etapa_regras; x record; v_hoje date := current_date;
  v_existentes jsonb; v_pular uuid[]; v_mapa jsonb; v_id uuid; v_lista uuid; v_d int; v_ini date; v_prazo date;
begin
  select * into p from app.processos where id = p_processo;
  select * into t from app.terrenos where id = p.terreno_id;
  select id into v_quadro from fluxo.quadros where objeto_tipo = 'terreno' and objeto_id = t.id;
  if v_quadro is null then return; end if;
  v_sub := case p_tipo when 'etapa' then app._subetapa_inicial(p.empresa_id, p.fase, p_codigo) else p_codigo end;

  -- reentrada: arquivadas sozinhas voltam com as datas refeitas; deixadas voltam a travar
  for x in select e.*, k.inicio, k.prazo from app.tarefas_etapa e join fluxo.tarefas k on k.id = e.tarefa_id
           where e.processo_id = p.id and e.situacao in ('arquivada_auto','deixada') and k.concluida_em is null
             and k.etapa = case p_tipo when 'etapa' then p_codigo else p.etapa_atual end
             and case p_tipo when 'etapa' then k.subetapa is null or k.subetapa = v_sub else k.subetapa = p_codigo end loop
    if x.situacao = 'arquivada_auto' then
      if x.inicio_dias is not null then
        v_ini := fluxo.somar_dias(p.empresa_id, v_hoje, x.inicio_dias);
        v_prazo := fluxo.somar_dias(p.empresa_id, v_ini, coalesce(x.duracao, 1) - 1);
      else
        v_d := greatest(v_hoje - x.situacao_em::date, 0);
        v_ini := x.inicio + v_d; v_prazo := x.prazo + v_d;
      end if;
      update fluxo.tarefas set arquivada_em = null, inicio = v_ini, prazo = v_prazo where id = x.tarefa_id;
    end if;
    update app.tarefas_etapa set situacao = 'ativa', situacao_em = now() where tarefa_id = x.tarefa_id;
  end loop;

  -- regras da etapa (e da subetapa inicial) ou da subetapa
  for r in select * from app.etapa_regras g
           where g.empresa_id = p.empresa_id and g.fase = p.fase and g.ativo
             and case p_tipo when 'etapa' then g.etapa = p_codigo and (g.subetapa is null or g.subetapa = v_sub)
                             else g.etapa = p.etapa_atual and g.subetapa = p_codigo end
           order by g.subetapa nulls first, g.ordem, g.criado_em loop
    continue when not app.avaliar_condicao(t.id, r.condicao);
    if r.modelo_id is not null then
      select coalesce(jsonb_object_agg(e.modelo_tarefa_id::text, e.tarefa_id), '{}'), coalesce(array_agg(e.modelo_tarefa_id), '{}')
        into v_existentes, v_pular
        from app.tarefas_etapa e where e.processo_id = p.id and e.regra_id = r.id and e.modelo_tarefa_id is not null;
      v_mapa := fluxo.aplicar_modelo_mapa(r.modelo_id, v_quadro, v_hoje, t.responsavel_id, v_pular, v_existentes);
      update fluxo.tarefas set processo_id = p.id, etapa = r.etapa, subetapa = r.subetapa
       where id in (select (value #>> '{}')::uuid from jsonb_each(v_mapa));
      insert into app.tarefas_etapa (tarefa_id, empresa_id, processo_id, regra_id, modelo_tarefa_id, condicao, inicio_dias, duracao)
      select (m.value #>> '{}')::uuid, p.empresa_id, p.id, r.id, mt.id, mt.condicao, mt.inicio_dias, mt.duracao
      from jsonb_each(v_mapa) m join fluxo.modelo_tarefas mt on mt.id = m.key::uuid;
    else
      continue when exists (select 1 from app.tarefas_etapa e where e.processo_id = p.id and e.regra_id = r.id);
      select id into v_lista from fluxo.listas where quadro_id = v_quadro and nome = r.lista_nome and not oculta and tipo = 'aberta';
      if v_lista is null then
        select id into v_lista from fluxo.listas where quadro_id = v_quadro and tipo = 'aberta' and not oculta order by posicao limit 1;
      end if;
      insert into fluxo.tarefas (empresa_id, quadro_id, lista_id, titulo, descricao, prioridade, inicio, prazo, responsavel_id, processo_id, etapa, subetapa)
      values (p.empresa_id, v_quadro, v_lista, r.titulo, r.descricao, r.prioridade,
              case when r.prazo_dias is not null then v_hoje end,
              case when r.prazo_dias is not null then fluxo.somar_dias(p.empresa_id, v_hoje, r.prazo_dias) end,
              case when r.responsavel_objeto then t.responsavel_id else r.responsavel_id end, p.id, r.etapa, r.subetapa)
      returning id into v_id;
      insert into app.tarefas_etapa (tarefa_id, empresa_id, processo_id, regra_id, inicio_dias, duracao)
      values (v_id, p.empresa_id, p.id, r.id, case when r.prazo_dias is not null then 0 end, r.prazo_dias + 1);
    end if;
  end loop;

  -- gatilho das automações "Terreno entrou na etapa", nos cartões abertos da etapa
  if p_tipo = 'etapa' then
    for x in select k.id from fluxo.tarefas k
             where k.processo_id = p.id and k.etapa = p_codigo and k.concluida_em is null and k.arquivada_em is null and not k.modelo loop
      perform fluxo.disparar_automacoes(x.id, 'etapa', p_etapa => p.fase || ':' || p_codigo);
    end loop;
  end if;
end $$;

-- Teve trabalho? Comentário, anexo, item marcado, subtarefa, campo preenchido ou troca de lista.
create or replace function app._tarefa_tem_trabalho(p_tarefa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from fluxo.comentarios where tarefa_id = p_tarefa and apagado_em is null)
      or exists (select 1 from fluxo.anexos where tarefa_id = p_tarefa)
      or exists (select 1 from fluxo.checklist_itens i join fluxo.checklists c on c.id = i.checklist_id where c.tarefa_id = p_tarefa and i.concluido_em is not null)
      or exists (select 1 from fluxo.tarefas where mae_id = p_tarefa)
      or exists (select 1 from fluxo.tarefa_campos where tarefa_id = p_tarefa)
      or exists (select 1 from app.auditoria a where a.tabela = 'tarefas' and a.registro_id = p_tarefa and a.acao = 'update'
                   and a.antes->>'lista_id' is distinct from a.depois->>'lista_id') $$;

-- Voltar de etapa: as tarefas abertas das etapas que ficaram à frente do destino.
create or replace function app._tarefas_ao_voltar(p_processo uuid, p_ordem_destino int)
returns void language plpgsql security definer set search_path = '' as $$
declare p app.processos; k record; v_ter app.terrenos; v_dest text;
begin
  select * into p from app.processos where id = p_processo;
  select * into v_ter from app.terrenos where id = p.terreno_id;
  select nome into v_dest from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and ordem = p_ordem_destino;
  for k in select f.id, f.titulo, f.responsavel_id, e.nome as etapa_nome, x.situacao
           from fluxo.tarefas f
           join app.etapas_modelo e on e.empresa_id = p.empresa_id and e.fase = p.fase and e.codigo = f.etapa
           left join app.tarefas_etapa x on x.tarefa_id = f.id
           where f.processo_id = p.id and e.ordem > p_ordem_destino and f.concluida_em is null and f.arquivada_em is null and not f.modelo loop
    continue when k.situacao = 'deixada';
    if app._tarefa_tem_trabalho(k.id) then
      insert into app.tarefas_etapa (tarefa_id, empresa_id, processo_id, situacao) values (k.id, p.empresa_id, p.id, 'deixada')
      on conflict (tarefa_id) do update set situacao = 'deixada', situacao_em = now();
      perform app._notificar(p.empresa_id, k.responsavel_id, 'etapa_deixada',
        'Etapa deixada: "' || k.titulo || '" é de ' || k.etapa_nome || ', e ' || v_ter.codigo || ' voltou para ' || coalesce(v_dest, 'uma etapa anterior') || '. A tarefa não trava mais.',
        v_ter.id, 'tarefas', k.id);
    else
      insert into app.tarefas_etapa (tarefa_id, empresa_id, processo_id, situacao) values (k.id, p.empresa_id, p.id, 'arquivada_auto')
      on conflict (tarefa_id) do update set situacao = 'arquivada_auto', situacao_em = now();
      update fluxo.tarefas set arquivada_em = now() where id = k.id;
    end if;
  end loop;
end $$;

-- Encerrar a fase: Stand By pausa as tarefas abertas dela (sem pedido); Perdido e
-- Descartado arquivam (padrão) ou mantêm (dados.tarefas = 'manter'). Concluir não mexe.
create or replace function app._tarefas_ao_encerrar(p_processo uuid, p_status text, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare k record;
begin
  if p_status = 'stand_by' then
    for k in select id from fluxo.tarefas where processo_id = p_processo and concluida_em is null and arquivada_em is null and not modelo loop
      perform fluxo._pausar_de_fora(k.id, 'Stand By da fase' || coalesce(': ' || nullif(trim(p_dados->>'detalhe'), ''), ''), 'stand_by');
    end loop;
  elsif p_status in ('perdido','descartado') and coalesce(p_dados->>'tarefas', 'arquivar') = 'arquivar' then
    update fluxo.pausas z set situacao = 'encerrada', fim = clock_timestamp(), dias = 0
     where z.situacao = 'ativa' and z.tarefa_id in (select id from fluxo.tarefas where processo_id = p_processo and concluida_em is null and arquivada_em is null);
    update fluxo.tarefas set arquivada_em = now()
     where processo_id = p_processo and concluida_em is null and arquivada_em is null and not modelo;
  end if;
end $$;

-- Retomar a fase: as tarefas que o Stand By pausou voltam (prazo + dias parados).
create or replace function app._tarefas_ao_retomar(p_processo uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare k record;
begin
  for k in select z.tarefa_id from fluxo.pausas z join fluxo.tarefas f on f.id = z.tarefa_id
           where f.processo_id = p_processo and z.situacao = 'ativa' and z.origem = 'stand_by' loop
    perform fluxo._retomar(k.tarefa_id);
  end loop;
end $$;

-- Concluída a última tarefa que trava: o responsável do terreno fica sabendo que pode avançar.
create or replace function app.tg_tarefa_pode_avancar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p app.processos; j jsonb; v_nome text; v_ter app.terrenos;
begin
  if new.concluida_em is null or old.concluida_em is not null or new.processo_id is null then return null; end if;
  select * into p from app.processos where id = new.processo_id;
  if p.status <> 'ativo' or new.etapa is distinct from p.etapa_atual then return null; end if;
  j := app._trava_tarefa(new.id);
  if j->>'nivel' is null or j->>'situacao' <> 'ativa' then return null; end if;
  if j->>'nivel' = 'subetapa' and new.subetapa is distinct from p.subetapa_atual then return null; end if;
  if jsonb_array_length(app._tarefas_travando(p, j->>'nivel')) > 0 then return null; end if;
  v_nome := case j->>'nivel'
    when 'subetapa' then (select nome from app.subetapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p.subetapa_atual)
    else (select nome from app.etapas_modelo where empresa_id = p.empresa_id and fase = p.fase and codigo = p.etapa_atual) end;
  select * into v_ter from app.terrenos where id = p.terreno_id;
  perform app._notificar(p.empresa_id, coalesce(v_ter.responsavel_id, p.responsavel_id), 'pode_avancar',
    v_ter.codigo || ' pode avançar. As tarefas de ' || v_nome || ' estão concluídas.', v_ter.id, 'tarefas', new.id);
  return null;
end $$;
create trigger t_pode_avancar after update of concluida_em on fluxo.tarefas for each row execute function app.tg_tarefa_pode_avancar();

-- ---------------------------------------------------------------------
-- Configuração (só administrador)
-- ---------------------------------------------------------------------
-- Regra de tarefas da etapa: cria (p_id nulo) ou altera.
create or replace function app.salvar_regra_etapa(p_empresa uuid, p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare g app.etapa_regras; v_cond jsonb;
begin
  perform app.exigir_administrador(p_empresa);
  perform app._chaves_permitidas(p_dados, array['fase','etapa','subetapa','modelo_id','titulo','descricao','lista_nome','prioridade','prazo_dias',
                                                'responsavel_objeto','responsavel_id','condicao','trava','regra','regra_cond','ordem','ativo']);
  if p_id is not null then
    select * into g from app.etapa_regras where id = p_id and empresa_id = p_empresa for update;
    if g.id is null then raise exception 'Regra não encontrada' using errcode = 'P0002'; end if;
  end if;
  g := jsonb_populate_record(g, p_dados);
  g.empresa_id := p_empresa;
  g.titulo := nullif(trim(g.titulo), ''); g.subetapa := nullif(g.subetapa, '');
  if (p_dados ? 'responsavel_id') and g.responsavel_id is not null then g.responsavel_objeto := false; end if;
  if not exists (select 1 from app.etapas_modelo where empresa_id = p_empresa and fase = g.fase and codigo = g.etapa) then
    raise exception 'Etapa não encontrada' using errcode = 'P0002';
  end if;
  if g.subetapa is not null and not exists (select 1 from app.subetapas_modelo where empresa_id = p_empresa and fase = g.fase and codigo = g.subetapa and etapa = g.etapa) then
    raise exception 'A subetapa é de outra etapa' using errcode = '22023';
  end if;
  if (g.modelo_id is null) = (g.titulo is null) then raise exception 'Escolha um modelo de tarefas ou escreva a tarefa' using errcode = '22023'; end if;
  if g.modelo_id is not null and not exists (select 1 from fluxo.modelos_quadro where id = g.modelo_id and empresa_id = p_empresa and dono_id is null and ativo) then
    raise exception 'Use um modelo de tarefas da empresa' using errcode = '22023';
  end if;
  if g.responsavel_id is not null and not exists (select 1 from app.membros where empresa_id = p_empresa and user_id = g.responsavel_id) then
    raise exception 'Responsável fora da equipe' using errcode = '22023';
  end if;
  v_cond := g.condicao;
  if v_cond = 'null'::jsonb or coalesce(jsonb_array_length(case when jsonb_typeof(v_cond->'itens') = 'array' then v_cond->'itens' end), 0) = 0 then
    g.condicao := null;
  else
    perform app.validar_condicao(p_empresa, v_cond);
  end if;
  -- regra em branco (jornada): 'trava' sozinho vira bloqueia/livre; com regra, trava = pode travar
  if not (p_dados ? 'regra') and (p_dados ? 'trava') then
    g.regra := case when coalesce((p_dados->>'trava')::boolean, false) then 'bloqueia' else 'livre' end;
  end if;
  g.regra := coalesce(g.regra, 'livre');
  if g.regra not in ('bloqueia','justifica','livre') then raise exception 'Regra inválida: %', g.regra using errcode = '22023'; end if;
  g.regra_cond := case when p_dados ? 'regra_cond' then app._regra_cond_config(p_empresa, p_dados->'regra_cond') else g.regra_cond end;
  g.trava := g.regra <> 'livre' or g.regra_cond is not null;
  g.prioridade := coalesce(g.prioridade, 'media'); g.ativo := coalesce(g.ativo, true);
  g.responsavel_objeto := coalesce(g.responsavel_objeto, g.responsavel_id is null);
  if p_id is null then
    g.id := gen_random_uuid(); g.criado_por := auth.uid(); g.criado_em := now();
    g.ordem := coalesce((p_dados->>'ordem')::int, (select coalesce(max(ordem), 0) + 1 from app.etapa_regras where empresa_id = p_empresa and fase = g.fase and etapa = g.etapa));
    insert into app.etapa_regras select g.*;
  else
    update app.etapa_regras set fase = g.fase, etapa = g.etapa, subetapa = g.subetapa, modelo_id = g.modelo_id, titulo = g.titulo, descricao = g.descricao,
           lista_nome = g.lista_nome, prioridade = g.prioridade, prazo_dias = g.prazo_dias, responsavel_objeto = g.responsavel_objeto,
           responsavel_id = g.responsavel_id, condicao = g.condicao, trava = g.trava, regra = g.regra, regra_cond = g.regra_cond, ordem = coalesce(g.ordem, 0), ativo = g.ativo
     where id = p_id;
  end if;
  return g.id;
end $$;

-- Apagar: regra que já criou tarefa só se desliga.
create or replace function app.apagar_regra_etapa(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.etapa_regras where id = p_id;
  if v_emp is null then raise exception 'Regra não encontrada' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  if exists (select 1 from app.tarefas_etapa where regra_id = p_id) then
    update app.etapa_regras set ativo = false where id = p_id;
    return 'desativada';
  end if;
  delete from app.etapa_regras where id = p_id;
  return 'apagada';
end $$;

-- "Vale quando" do documento do checklist e do pré-requisito (vazio = sempre).
create or replace function app._condicao_config(p_empresa uuid, p_cond jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_cond is null or p_cond = 'null'::jsonb or coalesce(jsonb_array_length(case when jsonb_typeof(p_cond->'itens') = 'array' then p_cond->'itens' end), 0) = 0 then
    return null;
  end if;
  perform app.validar_condicao(p_empresa, p_cond);
  return p_cond;
end $$;

-- Regra condicional (jornada, 1/nov/2026): [{condicao, regra}], cada uma com
-- condição; nulo ou '[]' = sem regra condicional.
create or replace function app._regra_cond_config(p_empresa uuid, p_cond jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare e jsonb; v jsonb := '[]'::jsonb;
begin
  if p_cond is null or p_cond = 'null'::jsonb then return null; end if;
  if jsonb_typeof(p_cond) <> 'array' then raise exception 'Regra condicional inválida' using errcode = '22023'; end if;
  for e in select * from jsonb_array_elements(p_cond) loop
    if coalesce(e->>'regra', '') not in ('bloqueia','justifica','livre') then
      raise exception 'Regra inválida: %', coalesce(e->>'regra', 'vazia') using errcode = '22023';
    end if;
    if app._condicao_config(p_empresa, e->'condicao') is null then
      raise exception 'Cada comportamento condicional precisa de uma condição' using errcode = '22023';
    end if;
    v := v || jsonb_build_array(jsonb_build_object('condicao', e->'condicao', 'regra', e->>'regra'));
  end loop;
  return nullif(v, '[]'::jsonb);
end $$;

create or replace function app.condicao_checklist(p_empresa uuid, p_fase text, p_etapa text, p_tipo_documento text, p_condicao jsonb)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform app.exigir_administrador(p_empresa);
  update app.checklist_modelo set condicao = app._condicao_config(p_empresa, p_condicao)
   where empresa_id = p_empresa and fase = p_fase and etapa = p_etapa and tipo_documento = p_tipo_documento;
  if not found then raise exception 'Documento fora do checklist da etapa' using errcode = 'P0002'; end if;
end $$;

create or replace function app.condicao_prerequisito(p_id uuid, p_condicao jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.prerequisitos_modelo where id = p_id;
  if v_emp is null then raise exception 'Pré-requisito não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_administrador(v_emp);
  update app.prerequisitos_modelo set condicao = app._condicao_config(v_emp, p_condicao) where id = p_id;
end $$;

-- ---------------------------------------------------------------------
-- RLS e permissões
-- ---------------------------------------------------------------------
alter table app.etapa_regras enable row level security;
alter table app.tarefas_etapa enable row level security;
create policy ver on app.etapa_regras for select to authenticated using (empresa_id in (select app.minhas_empresas()));
create policy ver on app.tarefas_etapa for select to authenticated using (empresa_id in (select app.minhas_empresas()));
grant select on app.etapa_regras, app.tarefas_etapa, app.v_tarefas_etapa to authenticated;
create trigger t_aud after insert or update or delete on app.etapa_regras for each row execute function app.tg_auditoria();
create trigger t_aud after insert or update or delete on app.tarefas_etapa for each row execute function app.tg_auditoria();

revoke all on function app._ordem_subetapa(uuid, text, text), app._trava_tarefa(uuid), app._tarefas_travando(app.processos, text),
  app._tarefas_ao_entrar(uuid, text, text), app._tarefa_tem_trabalho(uuid), app._tarefas_ao_voltar(uuid, int),
  app._tarefas_ao_encerrar(uuid, text, jsonb), app._tarefas_ao_retomar(uuid), app._condicao_config(uuid, jsonb), app._regra_cond_config(uuid, jsonb),
  app.trava_tarefa(uuid), app.tarefas_abertas_fase(uuid), app.salvar_regra_etapa(uuid, uuid, jsonb), app.apagar_regra_etapa(uuid),
  app.condicao_checklist(uuid, text, text, text, jsonb), app.condicao_prerequisito(uuid, jsonb) from public;
grant execute on function app.trava_tarefa(uuid), app.tarefas_abertas_fase(uuid), app.salvar_regra_etapa(uuid, uuid, jsonb),
  app.apagar_regra_etapa(uuid), app.condicao_checklist(uuid, text, text, text, jsonb), app.condicao_prerequisito(uuid, jsonb) to authenticated;
