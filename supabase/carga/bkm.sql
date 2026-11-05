-- =====================================================================
-- Carga da BKM: empresa, domínio do login e equipe do primeiro uso
-- (decisões do Moisés, sabatina de 4/nov/2026). Roda uma vez, como dono do
-- banco (SQL Editor do Supabase ou psql), depois das migrations. Pode rodar de
-- novo: não duplica nada e atualiza a equipe prevista.
--
-- Quem mais entrar pelo Google com e-mail @bkm.com.br fica `basico` até ser
-- promovido. A bkm@bkm.com.br é só a conta do sistema e não entra aqui.
-- =====================================================================
do $$
declare v_emp uuid;
begin
  select empresa_id into v_emp from app.empresa_dominios where dominio = 'bkm.com.br';
  if v_emp is null then
    v_emp := app.criar_empresa('BKM');
    insert into app.empresa_dominios (dominio, empresa_id) values ('bkm.com.br', v_emp);
  end if;

  insert into app.equipe_prevista (empresa_id, email, papel, administrador, superior_email, nome) values
    (v_emp, 'moises@bkm.com.br',              'diretor',  true,  null,                            null),
    (v_emp, 'rafael.gava@bkm.com.br',         'diretor',  true,  null,                            null),
    (v_emp, 'cecilia.scheydegger@bkm.com.br', 'gestor',   false, 'moises@bkm.com.br',             null),
    (v_emp, 'arnon.cugola@bkm.com.br',        'analista', false, 'cecilia.scheydegger@bkm.com.br', 'Arnon Cugola')
  on conflict (empresa_id, email) do update set
    papel = excluded.papel, administrador = excluded.administrador,
    superior_email = excluded.superior_email, nome = excluded.nome;
end $$;
