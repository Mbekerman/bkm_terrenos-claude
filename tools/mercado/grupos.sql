-- Resumo do empreendimento: os grupos do banco do monitor (im_grupos, im_unidade_grupos; regra em
-- Mbekerman/bkm-monitor-mercado, migration 20261104120000_grupos.sql), já somados. Só leitura.
-- Uma linha por empreendimento ativo no filtro: id e g = lista de grupos abertos, cada um
-- [dorm, vagas, area_min, area_max, unidades, estoque, vendas, preco_estoque, area_estoque, preco_primeiro, area_primeiro, pequeno]
--   unidades: residenciais não removidas no grupo; estoque: disponível ou reservada; vendas: nas mensais completas
--   dos últimos 3 meses (sem as de antes do monitor e sem as desfeitas); preço e área do estoque com preço vigente;
--   preço e área do primeiro preço visto.
-- Rodar em partes trocando :faixa (primeiros caracteres do id), para caber no cliente.
with mensais as (
  select id from public.im_coletas
   where tipo = 'completa_mensal' and situacao = 'completa'
     and referencia > (select max(referencia) from public.im_coletas
                        where tipo = 'completa_mensal' and situacao = 'completa') - interval '3 months'
), vj as (
  select distinct v.unidade_id from public.im_vendas v join mensais m on m.id = v.coleta_id
   where not v.antes_do_monitor and v.desfeita_coleta_id is null
), un as (
  select g.id gid, g.empreendimento_id e, g.dormitorios d, g.vagas vg, g.pequeno pq, u.area_privativa_m2 a, u.preco_primeiro p1,
         s.situacao in ('disponivel','reservada') est, s.preco pv, vj.unidade_id is not null vendida
    from public.im_grupos g
    join public.im_unidade_grupos ug on ug.grupo_id = g.id and ug.ate is null
    join public.im_unidades u on u.id = ug.unidade_id and u.residencial and u.removida_coleta_id is null
    join public.im_unidade_estados s on s.unidade_id = u.id and s.ate_coleta_id is null
    left join vj on vj.unidade_id = u.id
   where g.encerrado_em is null
), gr as (
  select e, d, vg, min(a) amin, max(a) amax, count(*) n, count(*) filter (where est) est, count(*) filter (where vendida) vend,
         round(sum(pv) filter (where est and pv > 0)) pe, round(sum(a) filter (where est and pv > 0), 2) ae,
         round(sum(p1) filter (where p1 > 0)) pp, round(sum(a) filter (where p1 > 0), 2) ap, bool_or(pq) pq
    from un group by gid, e, d, vg
)
select gr.e id, json_agg(json_build_array(d, vg, round(amin, 2), round(amax, 2), n, est, vend, pe, ae, pp, ap, case when pq then 1 else 0 end)
         order by coalesce(d, 99), coalesce(vg, 99), amin, coalesce(pp / nullif(ap, 0), 0)) g
  from gr
  join public.im_empreendimentos x on x.id = gr.e and x.ativo
  join public.im_empreendimento_estados es on es.empreendimento_id = x.id and es.ate_coleta_id is null and es.no_filtro
 where left(gr.e::text, 1) = any(:faixa)
 group by gr.e;
