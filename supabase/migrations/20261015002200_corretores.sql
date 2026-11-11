-- =====================================================================
-- Cadastro de corretores (pedido do Moises, 11/nov/2026)
--
-- O protótipo não tinha tela de corretores: só a lista fixa, o corretor na oferta e a criação
-- rápida. O React ganha a página Corretores (lista com busca e quantos terrenos e ofertas cada
-- um tem) e a ficha do corretor (campos editados no lugar, Desativar, os terrenos e ofertas onde
-- ele aparece e o histórico das alterações).
--
--   * app.v_corretores: um corretor por linha, com os dados da pessoa e as contagens. Terreno
--     excluído não conta (a RLS de app.terrenos o esconde; a view é security_invoker).
--   * app.salvar_corretor(id, dados): grava só as chaves que vierem, com as mesmas regras do
--     app.criar_corretor (nome, e-mail e celular não ficam em branco; CPF com 11 dígitos e único
--     na empresa; CNPJ com 14). Corretor não se apaga: "ativo = false" o tira das listas de
--     escolha e mantém as ofertas.
--   * Auditoria em app.corretores e app.pessoas (antes nenhuma das duas registrava alteração).
--
-- Feito para rodar também no SQL Editor do Supabase sobre o banco que já existe (idempotente).
-- =====================================================================

drop trigger if exists t_aud on app.corretores;
create trigger t_aud after insert or update or delete on app.corretores for each row execute function app.tg_auditoria();
drop trigger if exists t_aud on app.pessoas;
create trigger t_aud after insert or update or delete on app.pessoas for each row execute function app.tg_auditoria();

create or replace view app.v_corretores with (security_invoker = true) as
select c.id, c.empresa_id, c.pessoa_id, p.nome_razao_social as nome, c.apelido, p.email, p.telefone as celular,
       p.cpf_cnpj as cpf, c.rg, c.creci, c.imobiliaria, c.creci_juridico, c.cnpj_imobiliaria as cnpj, c.endereco,
       c.observacoes, c.ativo, c.criado_em,
       (select count(distinct x.terreno_id) from (
          select tc.terreno_id from app.terreno_corretores tc where tc.corretor_id = c.id
          union
          select o.terreno_id from app.oferta_corretores oc join app.ofertas o on o.id = oc.oferta_id where oc.corretor_id = c.id
        ) x join app.terrenos t on t.id = x.terreno_id) as qtd_terrenos,
       (select count(*) from app.oferta_corretores oc join app.ofertas o on o.id = oc.oferta_id join app.terrenos t on t.id = o.terreno_id
         where oc.corretor_id = c.id) as qtd_ofertas,
       (select max(o.data_oferta) from app.oferta_corretores oc join app.ofertas o on o.id = oc.oferta_id join app.terrenos t on t.id = o.terreno_id
         where oc.corretor_id = c.id) as ultima_oferta
from app.corretores c
join app.pessoas p on p.id = c.pessoa_id;
grant select on app.v_corretores to authenticated;

create or replace function app.salvar_corretor(p_corretor uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare c app.corretores; v text; v_outro uuid;
begin
  select * into c from app.corretores where id = p_corretor;
  if not found or c.empresa_id not in (select app.minhas_empresas()) then
    raise exception 'Corretor não encontrado' using errcode = 'P0002';
  end if;
  perform app.exigir_editor(c.empresa_id);

  if p_dados ? 'nome' then
    v := nullif(trim(p_dados->>'nome'), '');
    if v is null then raise exception 'Informe o nome do corretor' using errcode = '23502'; end if;
    update app.pessoas set nome_razao_social = v where id = c.pessoa_id;
  end if;
  if p_dados ? 'email' then
    v := lower(nullif(trim(p_dados->>'email'), ''));
    if v is null or v !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Informe um e-mail válido' using errcode = '23502'; end if;
    update app.pessoas set email = v where id = c.pessoa_id;
  end if;
  if p_dados ? 'celular' then
    v := nullif(regexp_replace(coalesce(p_dados->>'celular', ''), '\D', '', 'g'), '');
    if v is null or length(v) not between 10 and 11 then raise exception 'Informe o celular com DDD' using errcode = '23502'; end if;
    update app.pessoas set telefone = v where id = c.pessoa_id;
  end if;
  if p_dados ? 'cpf' then
    v := nullif(regexp_replace(coalesce(p_dados->>'cpf', ''), '\D', '', 'g'), '');
    if v is not null and length(v) <> 11 then raise exception 'CPF com 11 dígitos' using errcode = '22023'; end if;
    if v is not null then
      select id into v_outro from app.pessoas where empresa_id = c.empresa_id and cpf_cnpj = v and id <> c.pessoa_id;
      if v_outro is not null then raise exception 'Já existe uma pessoa com este CPF no cadastro' using errcode = '23505'; end if;
    end if;
    update app.pessoas set cpf_cnpj = v where id = c.pessoa_id;
  end if;
  if p_dados ? 'cnpj' then
    v := nullif(regexp_replace(coalesce(p_dados->>'cnpj', ''), '\D', '', 'g'), '');
    if v is not null and length(v) <> 14 then raise exception 'CNPJ com 14 dígitos' using errcode = '22023'; end if;
    update app.corretores set cnpj_imobiliaria = v where id = c.id;
  end if;
  if p_dados ? 'apelido' then update app.corretores set apelido = nullif(trim(p_dados->>'apelido'), '') where id = c.id; end if;
  if p_dados ? 'rg' then update app.corretores set rg = nullif(trim(p_dados->>'rg'), '') where id = c.id; end if;
  if p_dados ? 'creci' then update app.corretores set creci = nullif(trim(p_dados->>'creci'), '') where id = c.id; end if;
  if p_dados ? 'imobiliaria' then update app.corretores set imobiliaria = nullif(trim(p_dados->>'imobiliaria'), '') where id = c.id; end if;
  if p_dados ? 'creci_juridico' then update app.corretores set creci_juridico = nullif(trim(p_dados->>'creci_juridico'), '') where id = c.id; end if;
  if p_dados ? 'endereco' then update app.corretores set endereco = nullif(trim(p_dados->>'endereco'), '') where id = c.id; end if;
  if p_dados ? 'observacoes' then update app.corretores set observacoes = nullif(trim(p_dados->>'observacoes'), '') where id = c.id; end if;
  if p_dados ? 'ativo' then
    if jsonb_typeof(p_dados->'ativo') <> 'boolean' then raise exception 'ativo é sim ou não' using errcode = '22023'; end if;
    update app.corretores set ativo = (p_dados->>'ativo')::boolean where id = c.id;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Permissões (as funções novas não ficam abertas a public; ver sql-avulso-revoke)
-- ---------------------------------------------------------------------
revoke execute on function app.salvar_corretor(uuid, jsonb) from public, anon, authenticated;
grant execute on function app.salvar_corretor(uuid, jsonb) to authenticated;
