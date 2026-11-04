-- Unidades do monitor para o agrupamento (tools/mercado/agrupar.py). Só leitura.
-- Uma linha por empreendimento: id e as unidades residenciais não removidas, separadas por ";", cada uma
-- "torre,andar,dorm,vagas,area,preco_primeiro,situacao,preco_vigente,vendida_na_janela" (vazio = não informado).
--   situacao: d disponível, r reservada, v vendida, i indisponível ou não informado
--   vendida_na_janela: 1 quando há venda do monitor nas mensais completas dos últimos 3 meses (sem as de antes do
--   monitor e sem as desfeitas), senão 0
-- Rodar em partes trocando :faixa (primeiro caractere do id do empreendimento), para caber no cliente.
with mensais as (
  select id from public.im_coletas
   where tipo = 'completa_mensal' and situacao = 'completa'
     and referencia > (select max(referencia) from public.im_coletas
                        where tipo = 'completa_mensal' and situacao = 'completa') - interval '3 months'
), vj as (
  select distinct v.unidade_id from public.im_vendas v join mensais m on m.id = v.coleta_id
   where not v.antes_do_monitor and v.desfeita_coleta_id is null
)
select u.empreendimento_id id,
       string_agg(concat_ws(',', replace(replace(u.torre_norm, ',', ''), ';', ''), coalesce(u.andar::text, ''), coalesce(u.dormitorios::text, ''),
                  coalesce(u.vagas::text, ''), coalesce(round(u.area_privativa_m2, 2)::text, ''),
                  coalesce(round(u.preco_primeiro)::text, ''),
                  case s.situacao when 'disponivel' then 'd' when 'reservada' then 'r' when 'vendida' then 'v' else 'i' end,
                  coalesce(round(s.preco)::text, ''), case when vj.unidade_id is null then '0' else '1' end), ';'
                  order by u.torre_norm, u.andar nulls last, u.numero_norm) u
  from public.im_unidades u
  join public.im_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
  left join vj on vj.unidade_id = u.id
 where u.residencial and u.removida_coleta_id is null
   and left(u.empreendimento_id::text, 1) = :faixa
 group by u.empreendimento_id;
