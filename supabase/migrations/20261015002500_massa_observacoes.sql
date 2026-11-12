-- =====================================================================
-- Observações e Premissas do estudo de massa (pedido do Moises, 12/nov/2026)
--
-- O mesmo texto livre formatado da viabilidade (20261015002400_viabilidade_observacoes.sql), um por
-- estudo de massa, na aba "Observações e Premissas" da janela do estudo. Substitui na tela o campo
-- simples Observações da Análise: o texto que já existia passa para cá (escapado, uma linha por
-- parágrafo); a coluna antiga fica no banco, sem uso.
--
-- Segurança: o HTML é limpo no navegador antes de gravar, ao colar e antes de mostrar
-- (apps/web/src/viab/texto.ts); aqui o banco recusa script, on… e javascript: como segunda barreira.
-- Feito para rodar também no SQL Editor do Supabase (idempotente).
-- =====================================================================

alter table app.estudos_massa add column if not exists observacoes_html text;

alter table app.estudos_massa drop constraint if exists estudos_massa_observacoes_html_tam;
alter table app.estudos_massa add constraint estudos_massa_observacoes_html_tam
  check (observacoes_html is null or length(observacoes_html) <= 200000);

-- o texto simples que já existia vira parágrafos
update app.estudos_massa
   set observacoes_html = (select string_agg('<p>' || case when l = '' then '<br>' else l end || '</p>', '' order by n)
                             from unnest(string_to_array(replace(replace(replace(observacoes, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n'))
                                  with ordinality as x(l, n))
 where observacoes is not null and observacoes_html is null;

-- Conteúdo que nunca sai do editor (segunda barreira; a limpeza de verdade é no navegador).
create or replace function app._html_rico(p_html text)
returns text
language plpgsql immutable set search_path = ''
as $$
declare v text := nullif(trim(coalesce(p_html, '')), '');
begin
  if v is null then return null; end if;
  if length(v) > 200000 then raise exception 'O texto passou do tamanho máximo' using errcode = '22001'; end if;
  if v ~* '<\s*/?\s*(script|iframe|object|embed|style|link|meta|base|form|input|button|textarea|select|svg|math|img|video|audio|source)\y'
     or v ~* '<[^>]*\son[a-z]+\s*='
     or v ~* '<[^>]*=\s*["'']?\s*(javascript|vbscript|data)\s*:' then
    raise exception 'Texto com conteúdo não permitido' using errcode = '22023';
  end if;
  -- só etiquetas vazias (<p><br></p>) contam como em branco
  if length(trim(regexp_replace(regexp_replace(v, '<[^>]*>', '', 'g'), '&nbsp;', '', 'g'))) = 0 then return null; end if;
  return v;
end $$;

create or replace function app.salvar_observacoes_massa(p_id uuid, p_html text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare m app.estudos_massa; v_em timestamptz := now();
begin
  select * into m from app.estudos_massa where id = p_id for update;
  if not found then raise exception 'Estudo de massa não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(m.empresa_id);
  update app.estudos_massa set observacoes_html = app._html_rico(p_html) where id = p_id;
  return v_em;
end $$;

revoke execute on function app._html_rico(text), app.salvar_observacoes_massa(uuid, text) from public, anon, authenticated;
grant execute on function app.salvar_observacoes_massa(uuid, text) to authenticated;
