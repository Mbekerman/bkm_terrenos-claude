-- Prova: o diretor de OUTRA empresa (intruso) chama cada função exposta a `authenticated`
-- com ids da empresa BKM Teste. Tudo numa transação desfeita no fim.
\set QUIET on
begin;
create temp table ids(k text primary key, v text);
insert into ids select 'emp', id::text from app.empresas where nome='BKM Teste';
insert into ids values
 ('ter',(select id::text from app.terrenos where empresa_id=(select v::uuid from ids where k='emp') limit 1)),
 ('proc',(select id::text from app.processos where status='ativo' limit 1)),
 ('tar',(select id::text from fluxo.tarefas where visibilidade='restrito' limit 1)),
 ('quadro',(select id::text from fluxo.quadros limit 1)),
 ('viab',(select id::text from app.viabilidades limit 1)),
 ('massa',(select id::text from app.estudos_massa limit 1)),
 ('reun',(select id::text from app.reunioes limit 1)),
 ('prop',(select id::text from app.propostas limit 1)),
 ('doc',(select id::text from app.documentos limit 1)),
 ('parte',(select id::text from app.terreno_partes limit 1)),
 ('insc',(select id::text from app.inscricoes_municipais limit 1)),
 ('aud',(select max(id)::text from app.auditoria where tabela='terrenos' and acao='update')),
 ('aprov',(select id::text from fluxo.aprovacoes limit 1)),
 ('pedido',(select id::text from app.aprovacoes limit 1)),
 ('campo',(select id::text from app.campos_terreno limit 1)),
 ('notif',(select id::text from app.notificacoes limit 1)),
 ('modelo',(select id::text from fluxo.modelos_quadro limit 1)),
 ('checklist',(select id::text from fluxo.checklists limit 1)),
 ('comentario',(select id::text from fluxo.comentarios limit 1)),
 ('pausa',(select id::text from fluxo.pausas limit 1)),
 ('lbase',(select id::text from fluxo.linhas_base limit 1)),
 ('item',(select id::text from fluxo.checklist_itens limit 1)),
 ('jitem',(select id::text from app.jornada_itens limit 1)),
 ('eregra',(select id::text from app.etapa_regras limit 1)),
 ('jregra',(select id::text from app.jornada_regras limit 1)),
 ('ponto',(select id::text from app.pontos_interesse limit 1)),
 ('oferta',(select id::text from app.ofertas limit 1)),
 ('dep',(select id::text from app.fase_dependencias limit 1)),
 ('prereq',(select id::text from app.prerequisitos_modelo limit 1)),
 ('botao',(select id::text from fluxo.automacoes where gatilho='botao' limit 1)),
 ('zp',(select id::text from app.zona_parametros where empresa_id is not null limit 1)),
 ('user',(select id::text from auth.users where email='analista@bkm.test'));
grant select on ids to authenticated;
grant usage on schema app, fluxo to anon; grant select on ids to anon; select set_config('request.jwt.claim.sub', '', false);
set role anon;
do $$
declare f record; a text; args text[]; i int; nm text; ty text; sql text; r text; ids jsonb;
begin
  select jsonb_object_agg(k, v) into ids from ids;
  for f in
    select p.oid, n.nspname, p.proname, p.proargnames, p.proargtypes::regtype[] as tps, p.pronargs, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app','fluxo') and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prorettype <> 'trigger'::regtype and p.prokind = 'f'
    order by 2,3
  loop
    args := '{}';
    for i in 1..f.pronargs loop
      nm := coalesce(f.proargnames[i], ''); ty := f.tps[i-1]::text;
      a := case
        when ty = 'uuid' then quote_nullable(case
          when nm = 'p_empresa' then ids->>'emp'
          when nm in ('p_terreno') then ids->>'ter'
          when nm in ('p_processo') then ids->>'proc'
          when nm in ('p_tarefa','p_de','p_para','p_tarefa_id') then ids->>'tar'
          when nm in ('p_quadro') then ids->>'quadro'
          when nm in ('p_viab','p_viabilidade') then ids->>'viab'
          when nm in ('p_estudo') then ids->>'massa'
          when nm = 'p_reuniao' then ids->>'reun'
          when nm = 'p_proposta' then ids->>'prop'
          when nm = 'p_documento' then ids->>'doc'
          when nm = 'p_parte' then ids->>'parte'
          when nm = 'p_inscricao' then ids->>'insc'
          when nm = 'p_aprovacao' then ids->>'aprov'
          when nm = 'p_pedido' then ids->>'pedido'
          when nm = 'p_modelo' then case when f.nspname='fluxo' then ids->>'modelo' end
          when nm = 'p_pausa' then ids->>'pausa'
          when nm = 'p_item' then ids->>'item'
          when nm = 'p_checklist' then ids->>'checklist'
          when nm = 'p_comentario' then ids->>'comentario'
          when nm = 'p_botao' then ids->>'botao'
          when nm = 'p_ponto' then ids->>'ponto'
          when nm = 'p_oferta' then ids->>'oferta'
          when nm in ('p_user','p_membro','p_chefe','p_pedinte','p_arquiteto','p_dono','p_resp_objeto') then ids->>'user'
          when nm = 'p_id' then case
              when f.proname like '%viabilidade%' then ids->>'viab' when f.proname like '%massa%' then ids->>'massa'
              when f.proname like '%campo%' then ids->>'campo' when f.proname like '%item_jornada%' then ids->>'jitem'
              when f.proname like '%regra_etapa%' then ids->>'eregra' when f.proname like '%regra_jornada%' then ids->>'jregra'
              when f.proname like '%dependencia%' then ids->>'dep' when f.proname like '%prerequisito%' then ids->>'prereq'
              when f.proname like '%linha_base%' then ids->>'lbase' when f.proname like '%notificacao%' then ids->>'notif'
              when f.proname like '%zona%' then ids->>'zp' else ids->>'ter' end
          else null end) || '::uuid'
        when ty = 'bigint' and nm = 'p_auditoria' then (ids->>'aud') || '::bigint'
        when ty in ('text') then quote_literal(case nm when 'p_fase' then 'novos_negocios' when 'p_codigo' then 'novos_negocios'
             when 'p_chave' then 'terreno.nome' when 'p_status' then 'perdido' when 'p_tipo' then 'terreno' when 'p_subetapa' then 'x'
             when 'p_etapa' then 'x' else 'x' end)
        when ty = 'jsonb' then quote_literal('{}') || '::jsonb'
        when ty = 'boolean' then 'true'
        when ty in ('integer','bigint','numeric','double precision','smallint') then '1::' || ty
        when ty = 'date' then 'current_date'
        when ty = 'timestamp with time zone' then 'now()'
        else 'null::' || ty end;
      args := args || a;
    end loop;
    sql := case when (select proretset from pg_proc where oid = f.oid) then format('select count(*)::text || '' linhas'' from %I.%I(%s)', f.nspname, f.proname, array_to_string(args, ',')) else format('select left(coalesce((%I.%I(%s))::text, ''<null>''), 160)', f.nspname, f.proname, array_to_string(args, ',')) end;
    begin
      execute sql into r;
      raise notice 'RET % %.%: %', case when f.prosecdef then 'SD' else 'INV' end, f.nspname, f.proname, r;
    exception when others then
      raise notice 'ERR % %.%: [%] %', case when f.prosecdef then 'SD' else 'INV' end, f.nspname, f.proname, sqlstate, left(sqlerrm, 120);
    end;
  end loop;
end $$;
reset role;
rollback;
