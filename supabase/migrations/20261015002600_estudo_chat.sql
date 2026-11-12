-- =====================================================================
-- Chat dos estudos (pedido do Moises, 12/nov/2026)
--
-- Uma conversa por estudo de massa e por estudo de viabilidade, na aba Chat da janela do estudo.
-- Cada mensagem pode responder a outra do mesmo estudo (a citação aparece em cima, como no
-- WhatsApp), marcar colegas com @ (só quem vê o terreno é avisado) e citar estudos do mesmo
-- terreno: [[m:<id>]] (estudo de massa) e [[v:<id>]] (viabilidade), que a tela mostra como chip.
--
-- Avisos: quem entra com @ recebe "Fulano mencionou você no estudo ... do terreno A123" (tipo
-- mencao, uma vez por mensagem; editar só avisa quem entrou agora); quem recebe uma resposta é
-- avisado (tipo mensagem_resposta), salvo se também foi mencionado nela. O aviso aponta para a
-- mensagem (origem estudo_mensagens), e o sino abre a janela do estudo na aba Chat.
--
-- Escrita só pelas funções (enviar, editar e apagar a própria); leitura por quem vê o terreno.
-- Apagar não some com a mensagem: vira "Mensagem apagada" (o texto sai do banco).
-- Feito para rodar também no SQL Editor do Supabase (idempotente).
-- =====================================================================

create table if not exists app.estudo_mensagens (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references app.empresas(id),
  terreno_id      uuid not null references app.terrenos(id) on delete cascade,
  estudo_massa_id uuid references app.estudos_massa(id) on delete cascade,
  viabilidade_id  uuid references app.viabilidades(id) on delete cascade,
  autor_id        uuid not null references auth.users(id),
  texto           text,
  resposta_a      uuid references app.estudo_mensagens(id) on delete set null,
  criada_em       timestamptz not null default clock_timestamp(),
  editada_em      timestamptz,
  apagada_em      timestamptz,
  constraint estudo_mensagens_um_estudo check ((estudo_massa_id is null) <> (viabilidade_id is null)),
  constraint estudo_mensagens_texto check (apagada_em is not null or (texto is not null and length(btrim(texto)) between 1 and 10000))
);
create index if not exists estudo_mensagens_massa on app.estudo_mensagens (estudo_massa_id, criada_em) where estudo_massa_id is not null;
create index if not exists estudo_mensagens_viab on app.estudo_mensagens (viabilidade_id, criada_em) where viabilidade_id is not null;

alter table app.estudo_mensagens enable row level security;
drop policy if exists ver on app.estudo_mensagens;
create policy ver on app.estudo_mensagens for select to authenticated
  using (empresa_id in (select app.minhas_empresas()) and app.ve_terreno(terreno_id));
grant select on app.estudo_mensagens to authenticated;

-- ao vivo: mensagem nova aparece para quem está com o chat aberto
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'app' and tablename = 'estudo_mensagens') then
    execute 'alter publication supabase_realtime add table app.estudo_mensagens';
  end if;
end $$;

-- menção numa mensagem do chat
alter table app.mencoes drop constraint if exists mencoes_origem_tabela_check;
alter table app.mencoes add constraint mencoes_origem_tabela_check
  check (origem_tabela in ('tarefas','comentarios','atividades','reunioes','estudo_mensagens'));

-- aviso de resposta
insert into app.tipos_notificacao (codigo, nome, dias_antes_padrao, email_padrao)
  values ('mensagem_resposta', 'Responderam sua mensagem no chat de um estudo', '{}', false)
on conflict do nothing;
insert into app.tipos_notificacao (empresa_id, codigo, nome, dias_antes_padrao, email_padrao, ativo)
select e.id, t.codigo, t.nome, t.dias_antes_padrao, t.email_padrao, t.ativo
  from app.empresas e cross join app.tipos_notificacao t
 where t.empresa_id is null and t.codigo = 'mensagem_resposta'
on conflict do nothing;

-- "no estudo de viabilidade "X" do terreno A123"
create or replace function app._onde_mensagem(p_msg uuid)
returns text
language sql stable security definer set search_path = ''
as $$
  select case when m.estudo_massa_id is not null
              then 'no estudo de massa "' || em.nome || '" do terreno ' || t.codigo
              else 'no estudo de viabilidade "' || v.nome || '" do terreno ' || t.codigo end
    from app.estudo_mensagens m
    join app.terrenos t on t.id = m.terreno_id
    left join app.estudos_massa em on em.id = m.estudo_massa_id
    left join app.viabilidades v on v.id = m.viabilidade_id
   where m.id = p_msg
$$;

-- os avisos de uma mensagem: os @ que entraram agora e, na mensagem nova, o autor da respondida
create or replace function app._avisar_mensagem(p_msg uuid, p_antes text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m app.estudo_mensagens; r record; v_autor text; v_onde text; v_resp uuid;
  novos text[]; antigos text[];
begin
  select * into m from app.estudo_mensagens where id = p_msg;
  if m.apagada_em is not null then return; end if;
  novos := app.arrobas_no_texto(m.texto);
  antigos := app.arrobas_no_texto(p_antes);
  v_autor := coalesce((select nome from app.usuarios where user_id = m.autor_id),
                      (select nome from app.membros where user_id = m.autor_id and empresa_id = m.empresa_id), 'Alguém');
  v_onde := app._onde_mensagem(p_msg);
  for r in select distinct u.user_id from app.usuarios u
           join app.membros mb on mb.user_id = u.user_id and mb.empresa_id = m.empresa_id
           where u.arroba = any(novos) and not (u.arroba = any(antigos)) and u.user_id <> m.autor_id
             and app.ve_terreno(m.terreno_id, u.user_id) loop
    insert into app.mencoes (empresa_id, terreno_id, origem_tabela, origem_id, user_id, por)
    values (m.empresa_id, m.terreno_id, 'estudo_mensagens', m.id, r.user_id, m.autor_id)
    on conflict do nothing;
    if found then
      perform app._notificar(m.empresa_id, r.user_id, 'mencao', v_autor || ' mencionou você ' || v_onde,
                             m.terreno_id, 'estudo_mensagens', m.id, current_date, m.autor_id);
    end if;
  end loop;
  if p_antes is null and m.resposta_a is not null then
    select autor_id into v_resp from app.estudo_mensagens where id = m.resposta_a;
    if v_resp is not null and v_resp <> m.autor_id and app.ve_terreno(m.terreno_id, v_resp)
       and not exists (select 1 from app.mencoes where origem_tabela = 'estudo_mensagens' and origem_id = m.id and user_id = v_resp) then
      perform app._notificar(m.empresa_id, v_resp, 'mensagem_resposta', v_autor || ' respondeu sua mensagem ' || v_onde,
                             m.terreno_id, 'estudo_mensagens', m.id, current_date, m.autor_id);
    end if;
  end if;
end $$;

-- confere os [[m:id]] e [[v:id]] do texto: só estudos do mesmo terreno
create or replace function app._conferir_citacoes(p_terreno uuid, p_texto text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
declare c text[];
begin
  for c in select regexp_matches(coalesce(p_texto, ''), '\[\[(m|v):([0-9a-fA-F-]{36})\]\]', 'g') loop
    if c[1] = 'm' and not exists (select 1 from app.estudos_massa where id = c[2]::uuid and terreno_id = p_terreno)
       or c[1] = 'v' and not exists (select 1 from app.viabilidades where id = c[2]::uuid and terreno_id = p_terreno) then
      raise exception 'A mensagem cita um estudo de outro terreno' using errcode = '22023';
    end if;
  end loop;
end $$;

create or replace function app.enviar_mensagem_estudo(p_tipo text, p_estudo uuid, p_texto text, p_resposta uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_emp uuid; v_ter uuid; v_id uuid; v_txt text := btrim(coalesce(p_texto, ''));
begin
  if p_tipo = 'massa' then select empresa_id, terreno_id into v_emp, v_ter from app.estudos_massa where id = p_estudo;
  elsif p_tipo = 'viabilidade' then select empresa_id, terreno_id into v_emp, v_ter from app.viabilidades where id = p_estudo;
  else raise exception 'Tipo de estudo inválido' using errcode = '22023'; end if;
  if v_ter is null then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v_emp);
  if not app.ve_terreno(v_ter) then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  if v_txt = '' then raise exception 'Mensagem em branco' using errcode = '22023'; end if;
  if length(v_txt) > 10000 then raise exception 'A mensagem passou do tamanho máximo' using errcode = '22001'; end if;
  perform app._conferir_citacoes(v_ter, v_txt);
  if p_resposta is not null and not exists (
       select 1 from app.estudo_mensagens where id = p_resposta
          and (estudo_massa_id = p_estudo or viabilidade_id = p_estudo)) then
    raise exception 'A mensagem respondida é de outro estudo' using errcode = '22023';
  end if;
  insert into app.estudo_mensagens (empresa_id, terreno_id, estudo_massa_id, viabilidade_id, autor_id, texto, resposta_a)
  values (v_emp, v_ter, case when p_tipo = 'massa' then p_estudo end, case when p_tipo = 'viabilidade' then p_estudo end,
          auth.uid(), v_txt, p_resposta)
  returning id into v_id;
  perform app._avisar_mensagem(v_id, null);
  return v_id;
end $$;

create or replace function app.editar_mensagem_estudo(p_id uuid, p_texto text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare m app.estudo_mensagens; v_txt text := btrim(coalesce(p_texto, ''));
begin
  select * into m from app.estudo_mensagens where id = p_id for update;
  if not found or m.autor_id is distinct from auth.uid() then raise exception 'Só quem escreveu edita a mensagem' using errcode = '42501'; end if;
  if m.apagada_em is not null then raise exception 'Mensagem apagada não se edita' using errcode = '22023'; end if;
  perform app.exigir_editor(m.empresa_id);
  if v_txt = '' then raise exception 'Mensagem em branco' using errcode = '22023'; end if;
  if length(v_txt) > 10000 then raise exception 'A mensagem passou do tamanho máximo' using errcode = '22001'; end if;
  if v_txt = m.texto then return; end if;
  perform app._conferir_citacoes(m.terreno_id, v_txt);
  update app.estudo_mensagens set texto = v_txt, editada_em = clock_timestamp() where id = p_id;
  perform app._avisar_mensagem(p_id, m.texto);
end $$;

create or replace function app.apagar_mensagem_estudo(p_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare m app.estudo_mensagens;
begin
  select * into m from app.estudo_mensagens where id = p_id for update;
  if not found or m.autor_id is distinct from auth.uid() then raise exception 'Só quem escreveu apaga a mensagem' using errcode = '42501'; end if;
  perform app.exigir_editor(m.empresa_id);
  update app.estudo_mensagens set texto = null, apagada_em = clock_timestamp() where id = p_id and apagada_em is null;
end $$;

revoke execute on function app._onde_mensagem(uuid), app._avisar_mensagem(uuid, text), app._conferir_citacoes(uuid, text),
  app.enviar_mensagem_estudo(text, uuid, text, uuid), app.editar_mensagem_estudo(uuid, text), app.apagar_mensagem_estudo(uuid)
  from public, anon, authenticated;
grant execute on function app.enviar_mensagem_estudo(text, uuid, text, uuid), app.editar_mensagem_estudo(uuid, text),
  app.apagar_mensagem_estudo(uuid) to authenticated;
