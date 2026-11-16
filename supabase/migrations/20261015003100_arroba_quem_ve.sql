-- =====================================================================
-- BKM Terrenos · o @ só alcança quem vê o lugar (regra geral do Moises, 16/nov/2026)
-- A menção nos textos (tarefas, comentários, atividades, reuniões) e o participante marcado na reunião só avisam
-- quem vê o terreno (app.ve_terreno), além da regra do cartão que já existia. O Marketing nunca é avisado: não vê
-- terreno nenhum. O chat dos estudos já seguia a regra (20261015002700_estudo_chat.sql).
-- =====================================================================

create or replace function app.tg_mencoes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  c text; v text; novos text[] := '{}'; antigos text[] := '{}';
  r record; v_autor text; v_onde text; v_ter uuid; v_tarefa uuid;
begin
  foreach c in array tg_argv loop
    v := to_jsonb(new)->>c; novos := novos || app.arrobas_no_texto(v);
    if tg_op = 'UPDATE' then antigos := antigos || app.arrobas_no_texto(to_jsonb(old)->>c); end if;
  end loop;
  if cardinality(novos) = 0 then return new; end if;
  v_autor := coalesce((select nome from app.usuarios where user_id = auth.uid()),
                      (select nome from app.membros where user_id = auth.uid() and empresa_id = new.empresa_id), 'Alguém');
  -- tarefas e comentários moram no fluxo: o terreno é o do quadro, e o aviso leva à tarefa
  v_tarefa := case tg_table_name when 'tarefas' then new.id when 'comentarios' then (to_jsonb(new)->>'tarefa_id')::uuid end;
  v_ter := case when v_tarefa is not null then app.terreno_da_tarefa(v_tarefa) else (to_jsonb(new)->>'terreno_id')::uuid end;
  v_onde := case tg_table_name
    when 'tarefas' then 'na tarefa: ' || (to_jsonb(new)->>'titulo')
    when 'comentarios' then 'num comentário da tarefa: ' || (select titulo from fluxo.tarefas where id = v_tarefa)
    when 'atividades' then 'numa atividade: ' || left(to_jsonb(new)->>'resumo', 80)
    else 'na reunião de ' || to_char((to_jsonb(new)->>'inicio')::timestamptz, 'DD/MM') end;
  for r in select distinct u.user_id from app.usuarios u
           join app.membros m on m.user_id = u.user_id and m.empresa_id = new.empresa_id
           where u.arroba = any(novos) and not (u.arroba = any(antigos)) and u.user_id is distinct from auth.uid()
             -- num cartão, só avisa quem vê o cartão (visibilidade por cartão)
             and (v_tarefa is null or fluxo.papel_tarefa(v_tarefa, u.user_id) is not null)
             -- só quem vê o terreno (regra geral do @, Moises 16/nov/2026; o Marketing não vê terreno)
             and (v_ter is null or app.ve_terreno(v_ter, u.user_id))
             and m.papel <> 'marketing' loop
    insert into app.mencoes (empresa_id, terreno_id, origem_tabela, origem_id, user_id)
    values (new.empresa_id, v_ter, tg_table_name, new.id, r.user_id)
    on conflict do nothing;
    if found then
      perform app._notificar(new.empresa_id, r.user_id, 'mencao', v_autor || ' mencionou você ' || v_onde,
                             v_ter, coalesce(case when v_tarefa is not null then 'tarefas' end, tg_table_name), coalesce(v_tarefa, new.id));
    end if;
  end loop;
  return new;
end $$;

create or replace function app.tg_participante_mencao()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare r app.reunioes; v_autor text;
begin
  if new.user_id is null or new.user_id is not distinct from auth.uid() then return new; end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return new; end if;
  if not exists (select 1 from app.membros where empresa_id = new.empresa_id and user_id = new.user_id and papel <> 'marketing') then return new; end if;
  select * into r from app.reunioes where id = new.reuniao_id;
  if r.terreno_id is not null and not app.ve_terreno(r.terreno_id, new.user_id) then return new; end if;
  insert into app.mencoes (empresa_id, terreno_id, origem_tabela, origem_id, user_id)
  values (new.empresa_id, r.terreno_id, 'reunioes', r.id, new.user_id)
  on conflict do nothing;
  if found then
    v_autor := coalesce((select nome from app.usuarios where user_id = auth.uid()),
                        (select nome from app.membros where user_id = auth.uid() and empresa_id = new.empresa_id), 'Alguém');
    perform app._notificar(new.empresa_id, new.user_id, 'mencao',
      v_autor || ' marcou você na reunião de ' || to_char(r.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'),
      r.terreno_id, 'reunioes', r.id);
  end if;
  return new;
end $$;
