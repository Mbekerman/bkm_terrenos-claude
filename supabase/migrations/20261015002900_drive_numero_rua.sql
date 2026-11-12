-- =====================================================================
-- Pastas do Drive: número para terrenos da mesma rua (pedido do Moises, 12/nov/2026)
--
-- Quando já há terreno na mesma rua e cidade, a pasta ganha " 2", " 3"... no fim da rua:
--   SP_ZL_VILA JACUÍ_26 11_A002_Av. São Miguel 2
-- A ordem é a de cadastro (criado_em, depois o código); o primeiro fica sem número. Terreno
-- excluído não conta. A rua é comparada sem o tipo (Rua, Av., Avenida...), sem acento, sem
-- caixa e sem o que vem depois da vírgula. Quando um terreno da rua sai ou muda de rua, os
-- números dos outros se refazem e as pastas deles são renomeadas na próxima conferência.
-- Feito para rodar também no SQL Editor do Supabase (idempotente).
-- =====================================================================

create or replace function app._rua_chave(p text)
returns text
language sql immutable set search_path = ''
as $$
  select nullif(btrim(regexp_replace(regexp_replace(regexp_replace(
    lower(translate(btrim(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN')),
    ',.*$', ''),
    '^(rua|r|avenida|av|alameda|al|travessa|trav|tv|estrada|estr|est|praca|pca|pc|rodovia|rod|largo|lgo|lg|viaduto|vd)(\.\s*|\s+)', ''),
    '\s+', ' ', 'g')), '')
$$;

create or replace function app.drive_terreno(p_terreno uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare t app.terrenos; r jsonb; v_num int;
begin
  select * into t from app.terrenos where id = p_terreno;
  if not found then raise exception 'Terreno não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(t.empresa_id);
  if app._rua_chave(t.logradouro) is not null and t.excluido_em is null then
    select count(*) + 1 into v_num
      from app.terrenos o
     where o.empresa_id = t.empresa_id and o.id <> t.id and o.excluido_em is null
       and o.municipio_id is not distinct from t.municipio_id
       and app._rua_chave(o.logradouro) = app._rua_chave(t.logradouro)
       and (o.criado_em, coalesce(o.codigo, ''), o.id) < (t.criado_em, coalesce(t.codigo, ''), t.id);
  end if;
  select jsonb_build_object(
    'id', t.id, 'empresa_id', t.empresa_id, 'codigo', t.codigo, 'criado_em', t.criado_em,
    'excluido', t.excluido_em is not null,
    'municipio', m.nome,
    'sigla', (select s.sigla from app.cidade_siglas s where s.municipio_id = t.municipio_id
                and (s.empresa_id = t.empresa_id or s.empresa_id is null) order by s.empresa_id nulls last limit 1),
    'zona', t.zona, 'bairro', t.bairro, 'logradouro', t.logradouro,
    'numero_rua', nullif(v_num, 1),
    'pastas', coalesce((select jsonb_agg(jsonb_build_object('pasta_mae_id', p.pasta_mae_id, 'pasta_id', p.pasta_id, 'nome', p.nome))
                          from app.terreno_pastas_drive p where p.terreno_id = t.id), '[]'))
    into r
    from (select 1) x left join app.municipios m on m.id = t.municipio_id;
  return r;
end $$;

revoke execute on function app._rua_chave(text), app.drive_terreno(uuid) from public, anon, authenticated;
grant execute on function app.drive_terreno(uuid) to authenticated;
