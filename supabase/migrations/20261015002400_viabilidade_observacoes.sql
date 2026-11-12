-- =====================================================================
-- Observações e Premissas do estudo de viabilidade (pedido do Moises, 12/nov/2026)
--
-- Texto livre com formatação (negrito, itálico, sublinhado, tamanho, cor, listas, títulos e links),
-- um por estudo, na aba "Observações e Premissas" do popup. Guardado como HTML.
--
-- Segurança: o HTML é limpo no navegador antes de gravar e de novo antes de mostrar (lista fechada de
-- etiquetas e estilos, apps/web/src/viab/texto.ts). Aqui o banco recusa o que nunca sai do editor
-- (script, iframe, atributos on…, javascript:), como segunda barreira, e limita o tamanho.
-- Feito para rodar também no SQL Editor do Supabase (idempotente).
-- =====================================================================

alter table app.viabilidades add column if not exists observacoes text;

alter table app.viabilidades drop constraint if exists viabilidades_observacoes_tam;
alter table app.viabilidades add constraint viabilidades_observacoes_tam
  check (observacoes is null or length(observacoes) <= 200000);

create or replace function app.salvar_observacoes_viabilidade(p_id uuid, p_html text)
returns timestamptz
language plpgsql security definer set search_path = ''
as $$
declare v app.viabilidades; v_html text := nullif(trim(coalesce(p_html, '')), ''); v_em timestamptz;
begin
  select * into v from app.viabilidades where id = p_id for update;
  if not found then raise exception 'Estudo não encontrado' using errcode = 'P0002'; end if;
  perform app.exigir_editor(v.empresa_id);
  if v_html is not null and length(v_html) > 200000 then
    raise exception 'O texto passou do tamanho máximo' using errcode = '22001';
  end if;
  if v_html ~* '<\s*/?\s*(script|iframe|object|embed|style|link|meta|base|form|input|button|textarea|select|svg|math|img|video|audio|source)\y'
     or v_html ~* '<[^>]*\son[a-z]+\s*='
     or v_html ~* '<[^>]*=\s*["'']?\s*(javascript|vbscript|data)\s*:' then
    raise exception 'Texto com conteúdo não permitido' using errcode = '22023';
  end if;
  -- texto só com etiquetas vazias (<p><br></p>) conta como em branco
  if v_html is not null and length(trim(regexp_replace(regexp_replace(v_html, '<[^>]*>', '', 'g'), '&nbsp;', '', 'g'))) = 0 then
    v_html := null;
  end if;
  v_em := now();
  update app.viabilidades set observacoes = v_html, atualizado_em = v_em where id = p_id;
  return v_em;
end $$;

revoke execute on function app.salvar_observacoes_viabilidade(uuid, text) from public, anon, authenticated;
grant execute on function app.salvar_observacoes_viabilidade(uuid, text) to authenticated;
