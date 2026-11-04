-- Retrato do monitor de mercado para o protótipo (docs/dados/mercado.json).
-- Roda no Supabase do monitor (tabelas public.im_*), só leitura. Uma linha por
-- empreendimento ativo dentro do filtro do monitor, já somada: o protótipo não
-- recebe unidade nenhuma, só os totais que o mapa e a ficha usam.
--   estoque  = unidades residenciais à venda (disponível ou reservada)
--   preco/area = soma dos preços vigentes e das áreas do estoque com os dois
--               (R$/m² médio = soma dos preços ÷ soma das áreas)
--   vendas   = vendas do monitor nas mensais completas dos últimos 3 meses,
--              sem as de antes do monitor e sem as desfeitas
--   VSO      = vendas ÷ (vendas + estoque), calculado no protótipo
--   estoque_un = as unidades à venda, "dorm,área,preço" separadas por ";"
--               (preço vazio quando a tabela não traz), para os filtros do mapa
with mensais as (
  select id, referencia from public.im_coletas
   where tipo = 'completa_mensal' and situacao = 'completa'
     and referencia > (select max(referencia) from public.im_coletas
                        where tipo = 'completa_mensal' and situacao = 'completa') - interval '3 months'
), un as (
  select u.empreendimento_id e, u.area_privativa_m2 a, u.dormitorios d, s.situacao, s.preco,
         vj.unidade_id is not null vendida_janela
    from public.im_unidades u
    join public.im_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
    left join (select distinct v.unidade_id from public.im_vendas v join mensais m on m.id = v.coleta_id
                where not v.antes_do_monitor and v.desfeita_coleta_id is null) vj on vj.unidade_id = u.id
   where u.residencial and u.removida_coleta_id is null
), ag as (
  select e,
         count(*) unidades,
         count(*) filter (where situacao in ('disponivel','reservada')) estoque,
         round(sum(preco) filter (where situacao in ('disponivel','reservada') and preco > 0 and a > 0)) preco,
         round(sum(a) filter (where situacao in ('disponivel','reservada') and preco > 0 and a > 0), 2) area,
         count(*) filter (where vendida_janela) vendas,
         string_agg(concat_ws(',', coalesce(d::text, ''), coalesce(round(a, 2)::text, ''), coalesce(round(preco)::text, '')), ';'
                    order by d, a, preco) filter (where situacao in ('disponivel','reservada')) estoque_un
    from un group by e
)
select json_build_object(
  'gerado_em', current_date,
  'janela', (select json_build_object('de', min(v.vendida_de), 'ate', max(v.vendida_ate), 'vendas', count(*))
               from public.im_vendas v join mensais m on m.id = v.coleta_id
              where not v.antes_do_monitor and v.desfeita_coleta_id is null),
  'campos', json_build_array('id','nome','incorporadora','bairro','municipio','lat','lng','situacao','lancamento','entrega','programa_social','unidades','estoque','preco','area','vendas','estoque_un'),
  'emps', (select json_agg(json_build_array(
      e.id, e.nome, i.nome, e.bairro, m.codigo_ibge, round(e.latitude::numeric, 5), round(e.longitude::numeric, 5), e.situacao,
      e.data_lancamento, e.previsao_entrega, e.programa_social, coalesce(ag.unidades, 0), coalesce(ag.estoque, 0),
      ag.preco, ag.area, coalesce(ag.vendas, 0), ag.estoque_un) order by e.nome)
    from public.im_empreendimentos e
    join public.im_empreendimento_estados es on es.empreendimento_id = e.id and es.ate_coleta_id is null
    join public.im_incorporadoras i on i.id = e.incorporadora_id
    left join public.im_municipios m on m.id = e.municipio_id
    left join ag on ag.e = e.id
   where e.ativo and es.no_filtro)
) dados;
