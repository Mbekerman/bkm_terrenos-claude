-- =====================================================================
-- BKM Terrenos · 0005 · dados de exemplo (opcional, para testar)
-- app.carregar_dados_exemplo(empresa): só gestor, só com a base vazia.
-- Datas relativas a hoje, para os alertas de vencimento funcionarem.
-- Os arquivos dos documentos de exemplo não existem no storage.
-- =====================================================================

create or replace function app.carregar_dados_exemplo(p_empresa uuid)
returns int
language plpgsql security definer set search_path = ''
as $$
declare
  eu uuid := auth.uid();
  hoje date := current_date;
  r record;
  v_t uuid; v_p uuid; v_v uuid; v_d uuid;
  n int := 0;
  etapas text[] := array['recebida','triagem','viabilidade','diligencia','proposta','aprovacao','contrato','ganha'];
  i int;
begin
  if not app.eh_gestor(p_empresa) then raise exception 'Só gestores carregam dados de exemplo' using errcode = '42501'; end if;
  if exists (select 1 from app.terrenos where empresa_id = p_empresa) then
    raise exception 'A empresa já tem terrenos cadastrados' using errcode = '22023';
  end if;

  for r in select * from (values
    -- bairro, endereço, área, zona, frente, matrícula, cartório, proprietário, valor pedido, origem, contato, dias atrás, etapa, status, vgv, margem, preço máx
    ('Pirituba','Rua Alto do Ipê, 1.240',4180,'ZEIS-2',58,'152.880','8º CRI','Construpar Participações Ltda.',9200000,'corretor','Lemos Imóveis · Marcos Lemos',218,'ganha','ganha',62400000,15.6,8900000),
    ('Sapopemba','Av. Campo das Pitangas, 3.050',3640,'ZEIS-2',46,'201.117','9º CRI','Maria Aparecida Lins',7600000,'proprietario',null,165,'contrato','ativo',51000000,15.0,7300000),
    ('Vila Prudente','Rua Barão do Jequitibá, 512',2950,'ZM',38,'98.442','6º CRI','Têxtil Paulistana S.A.',6900000,'corretor','Prime Terrenos · Juliana Reis',121,'aprovacao','ativo',44200000,14.2,6400000),
    ('Brasilândia','Rua Vale do Sabiá, 88',2200,'ZM',30,'176.209','18º CRI','Roberto Kenji Sato',4100000,'corretor','Zona Leste Áreas · Paulo Nunes',105,'viabilidade','perdida',null,null,null),
    ('Itaquera','Rua das Acácias Roxas, 410',3120,'ZEIS-2',42,'184.552','9º CRI','Espólio de José Ribamar Andrade',6800000,'corretor','Lemos Imóveis · Marcos Lemos',57,'proposta','ativo',46800000,14.8,6200000),
    ('Cidade Tiradentes','Estrada do Iguape Velho, 2.700',6300,'ZEIS-1',72,'233.901','9º CRI','Espólio de Antônio Ferraz',8800000,'prospeccao',null,70,'diligencia','suspensa',88000000,16.8,12600000),
    ('Guaianases','Estrada do Lajeado Velho, 1.880',5400,'ZEIS-2',64,'219.774','9º CRI','Lajeado Empreendimentos Ltda.',9800000,'proprietario',null,47,'diligencia','ativo',78300000,16.2,10900000),
    ('Perus','Rua Serra da Cantareira Nova, 640',2050,'ZM',27,'164.320','8º CRI','Helena Duarte Campos',3600000,'corretor','Zona Leste Áreas · Paulo Nunes',13,'triagem','ativo',null,null,null),
    ('Jaraguá','Rua Pico Alto, 95',1950,'ZEU',33,'171.058','8º CRI','Família Moretti (4 herdeiros)',3900000,'corretor','Prime Terrenos · Juliana Reis',20,'viabilidade','ativo',null,null,null),
    ('Campo Limpo','Av. Ponte Baixa Nova, 2.210',2680,'ZEU',40,'142.996','11º CRI','Auto Posto Ponte Baixa Ltda.',5100000,'corretor','Lemos Imóveis · Marcos Lemos',12,'triagem','ativo',null,null,null),
    ('Penha','Rua Capitão Ourinhos, 330',2420,'ZM',35,'88.615','12º CRI','Galpões Penha Ltda.',5200000,'corretor','Prime Terrenos · Juliana Reis',6,'recebida','ativo',null,null,null),
    ('Ermelino Matarazzo','Rua Monte Belo do Leste, 1.010',3300,'ZEIS-2',48,'190.402','12º CRI','Celso Ribeiro Prado',5900000,'corretor','Zona Leste Áreas · Paulo Nunes',2,'recebida','ativo',null,null,null)
  ) as x(bairro,endereco,area,zon,frente,mat,cri,prop,valor,origem,contato,dias,etapa,status,vgv,margem,pmax)
  loop
    insert into app.terrenos (empresa_id, endereco, bairro, area_m2, frente_m, zoneamento)
    values (p_empresa, r.endereco, r.bairro, r.area, r.frente, r.zon) returning id into v_t;
    insert into app.terreno_matriculas (empresa_id, terreno_id, numero, cartorio) values (p_empresa, v_t, r.mat, r.cri);
    with pe as (insert into app.pessoas (empresa_id, tipo, nome, papel)
                values (p_empresa, case when r.prop ~ '(Ltda|S\.A\.)' then 'PJ' else 'PF' end, r.prop, 'proprietário') returning id)
    insert into app.terreno_proprietarios (terreno_id, pessoa_id, empresa_id) select v_t, id, p_empresa from pe;
    insert into app.ofertas (empresa_id, terreno_id, origem, contato, recebida_em, valor_pedido)
    values (p_empresa, v_t, r.origem, r.contato, hoje - r.dias, r.valor);

    v_v := null;
    if r.vgv is not null then
      insert into app.viabilidades (empresa_id, terreno_id, nome, vgv, margem_pct, preco_max_terreno, calculado_em)
      values (p_empresa, v_t, 'Estudo base · 2 dormitórios', r.vgv, r.margem, r.pmax, hoje - r.dias + 20) returning id into v_v;
    end if;

    insert into app.processos (empresa_id, terreno_id, etapa_atual, etapa_desde, status, responsavel_id, viabilidade_id,
                               aberto_em, motivo_encerramento, detalhe_encerramento, retomar_em, encerrado_em)
    values (p_empresa, v_t, r.etapa,
            (hoje - least(r.dias, case r.etapa when 'diligencia' then 26 when 'proposta' then 26 when 'viabilidade' then 8 else 6 end))::timestamptz,
            r.status, eu, v_v, (hoje - r.dias)::timestamptz,
            case r.status when 'perdida' then 'Zoneamento ou legislação' end,
            case r.status when 'perdida' then 'Cerca de 40% do lote em área de proteção ambiental; a área útil não fecha a conta.'
                          when 'suspensa' then 'Inventário do espólio ainda não concluído; herdeiros pediram retomar depois.' end,
            case r.status when 'suspensa' then hoje + 36 end,
            case when r.status <> 'ativo' then (hoje - 10)::timestamptz end)
    returning id into v_p;

    for i in 1 .. array_position(etapas, r.etapa) loop
      insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, para_etapa, user_id, em, comentario)
      values (p_empresa, v_p, case when i = 1 then 'abertura' when etapas[i] = 'ganha' then 'ganho' else 'avanco' end,
              case when i > 1 then etapas[i-1] end, etapas[i], eu,
              (hoje - r.dias)::timestamptz + ((r.dias * (i - 1)) / array_position(etapas, r.etapa)) * interval '1 day',
              case when i = 1 then 'Negociação aberta a partir da oferta' end);
    end loop;
    if r.status in ('perdida','suspensa') then
      insert into app.processo_transicoes (empresa_id, processo_id, evento, de_etapa, user_id, em, comentario)
      values (p_empresa, v_p, case r.status when 'perdida' then 'perda' else 'suspensao' end, r.etapa, eu, (hoje - 10)::timestamptz,
              case r.status when 'perdida' then 'Zoneamento ou legislação' else 'Inventário em andamento' end);
    end if;

    -- documentos por cenário
    if r.bairro = 'Itaquera' then
      perform app._doc_exemplo(p_empresa, v_p, t, s, hoje - d)
        from (values ('matricula','validado',22),('onus_reais','validado',22),('iptu','validado',34),
                     ('certidoes_vendedor','validado',19),('planialtimetrico','validado',43),('sondagem_spt','validado',40)) z(t,s,d);
      insert into app.propostas (empresa_id, processo_id, versao, autor, valor_total, forma, permuta_pct, condicoes, situacao, viabilidade_id, criado_em) values
        (p_empresa, v_p, 1, 'nos',          5400000, 'misto',    6, 'R$ 4,0 mi em dinheiro + 6% do VGV em permuta física', 'recusada', v_v, hoje - 24),
        (p_empresa, v_p, 2, 'proprietario', 6600000, 'dinheiro', 0, 'Pagamento à vista na escritura', 'contraproposta', v_v, hoje - 15),
        (p_empresa, v_p, 3, 'nos',          6150000, 'misto',    4, 'R$ 5,2 mi em dinheiro + 4% em permuta física; condição suspensiva de aprovação', 'em_analise', v_v, hoje - 6);
      insert into app.atividades (empresa_id, processo_id, tipo, ocorreu_em, resumo, user_id) values
        (p_empresa, v_p, 'ligacao', hoje - 4, 'Inventariante achou a v3 baixa, mas topa discutir a permuta. Retorno prometido até sexta.', eu),
        (p_empresa, v_p, 'reuniao', hoje - 15, 'Reunião com o advogado do espólio. Recebida contraproposta de R$ 6,6 mi à vista.', eu);
      insert into app.tarefas (empresa_id, processo_id, titulo, responsavel_id, prazo) values
        (p_empresa, v_p, 'Responder a contraproposta do espólio', eu, hoje + 2),
        (p_empresa, v_p, 'Atualizar a matrícula antes do vencimento', eu, hoje + 6);
    elsif r.bairro = 'Guaianases' then
      perform app._doc_exemplo(p_empresa, v_p, t, s, hoje - d)
        from (values ('matricula','validado',13),('onus_reais','validado',13),('iptu','recebido',55),
                     ('certidoes_vendedor','validado',39),('ambiental','recebido',24)) z(t,s,d);
      insert into app.tarefas (empresa_id, processo_id, titulo, responsavel_id, prazo) values
        (p_empresa, v_p, 'Contratar levantamento planialtimétrico', eu, hoje - 4),
        (p_empresa, v_p, 'Cobrar novas certidões do vendedor', eu, hoje - 2);
      insert into app.atividades (empresa_id, processo_id, tipo, ocorreu_em, resumo, user_id) values
        (p_empresa, v_p, 'visita', hoje - 39, 'Visita: declive suave no fundo do lote. Pedir planialtimétrico antes da proposta.', eu);
    elsif r.bairro in ('Vila Prudente','Sapopemba','Pirituba') then
      perform app._doc_exemplo(p_empresa, v_p, t, 'validado', hoje - 12)
        from unnest(array['matricula','onus_reais','iptu','certidoes_vendedor','planialtimetrico','sondagem_spt','ambiental']) t;
      insert into app.propostas (empresa_id, processo_id, versao, autor, valor_total, forma, permuta_pct, condicoes, situacao, viabilidade_id, criado_em) values
        (p_empresa, v_p, 1, 'nos', r.pmax * 0.9, 'dinheiro', 0, 'Condição suspensiva de aprovação do projeto', 'recusada', v_v, hoje - r.dias + 50),
        (p_empresa, v_p, 2, 'nos', case when r.bairro = 'Vila Prudente' then 6500000 else r.pmax * 0.97 end, 'dinheiro', 0,
                         '40% na assinatura, 60% na aprovação', 'aceita', v_v, hoje - r.dias + 70);
      if r.bairro = 'Sapopemba' then
        perform app._doc_exemplo(p_empresa, v_p, 'minuta_promessa', 'recebido', hoje - 4);
        insert into app.tarefas (empresa_id, processo_id, titulo, responsavel_id, prazo) values (p_empresa, v_p, 'Revisar minuta com o jurídico', eu, hoje + 1);
      end if;
      if r.bairro = 'Vila Prudente' then
        insert into app.tarefas (empresa_id, processo_id, titulo, responsavel_id, prazo) values (p_empresa, v_p, 'Levar ao comitê: valor acima do preço máximo', eu, hoje + 3);
      end if;
      if r.bairro = 'Pirituba' then
        perform app._doc_exemplo(p_empresa, v_p, 'minuta_promessa', 'validado', hoje - 80);
      end if;
    elsif r.status = 'suspensa' then
      perform app._doc_exemplo(p_empresa, v_p, t, 'validado', hoje - 33) from unnest(array['matricula','onus_reais']) t;
    elsif r.etapa in ('recebida','triagem','viabilidade') and r.status = 'ativo' then
      insert into app.tarefas (empresa_id, processo_id, titulo, responsavel_id, prazo)
      values (p_empresa, v_p, case r.etapa when 'viabilidade' then 'Rodar estudo de viabilidade no BKM' else 'Triagem: localização e preço por m²' end, eu, hoje + 4);
    end if;
    n := n + 1;
  end loop;

  -- segunda oferta para o mesmo terreno (mostra a deduplicação)
  insert into app.ofertas (empresa_id, terreno_id, origem, contato, recebida_em, valor_pedido)
  select p_empresa, t.id, 'corretor', 'Lemos Imóveis · Marcos Lemos', hoje - 3, 5600000
    from app.terrenos t where t.empresa_id = p_empresa and t.bairro = 'Penha';
  insert into app.ofertas (empresa_id, terreno_id, origem, contato, recebida_em, valor_pedido)
  select p_empresa, t.id, 'corretor', 'Prime Terrenos · Juliana Reis', hoje - 42, 7100000
    from app.terrenos t where t.empresa_id = p_empresa and t.bairro = 'Itaquera';
  return n;
end $$;

create or replace function app._doc_exemplo(p_empresa uuid, p_processo uuid, p_tipo text, p_situacao text, p_emitido date)
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_d uuid;
begin
  insert into app.documentos (empresa_id, processo_id, tipo_documento, emitido_em, situacao)
  values (p_empresa, p_processo, p_tipo, p_emitido, p_situacao) returning id into v_d;
  insert into app.documento_versoes (empresa_id, documento_id, versao, storage_path, nome_arquivo, enviado_em)
  values (p_empresa, v_d, 1, p_empresa || '/exemplo/' || p_tipo || '.pdf', p_tipo || '_exemplo.pdf', p_emitido::timestamptz);
end $$;

revoke execute on function app.carregar_dados_exemplo(uuid), app._doc_exemplo(uuid, uuid, text, text, date) from public;
grant execute on function app.carregar_dados_exemplo(uuid) to authenticated;
