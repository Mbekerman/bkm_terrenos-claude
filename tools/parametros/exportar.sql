-- Catálogo padrão de parâmetros urbanísticos (zona_parametros com empresa nula)
-- como JSON, na ordem e no formato que o protótipo lê e o teste do banco confere.
select jsonb_pretty(coalesce(jsonb_agg(r order by r->>'municipio', r->>'sigla', r->>'tipo', coalesce(r->>'uso', ''), coalesce(r->>'macrozona', ''),
                                        coalesce((r->>'lote_area_min_m2')::numeric, 0), coalesce((r->>'lote_area_max_m2')::numeric, 0)), '[]'))
from (
  select jsonb_strip_nulls(jsonb_build_object(
    'municipio', m.codigo_ibge, 'sigla', z.sigla, 'tipo', p.tipo, 'uso', p.uso, 'macrozona', p.macrozona,
    'lote_area_min_m2', p.lote_area_min_m2, 'lote_area_max_m2', p.lote_area_max_m2, 'permitido', p.permitido,
    'ca_minimo', p.ca_minimo, 'ca_basico', p.ca_basico, 'ca_maximo', p.ca_maximo,
    'to_maximo', p.to_maximo, 'to_lote_grande', p.to_lote_grande, 'to_corte_m2', p.to_corte_m2,
    'gabarito_m', p.gabarito_m, 'gabarito_sem_limite', p.gabarito_sem_limite,
    'recuo_frente_m', p.recuo_frente_m, 'recuo_lateral_m', p.recuo_lateral_m, 'recuo_lateral_alto_m', p.recuo_lateral_alto_m,
    'cota_parte_m2', p.cota_parte_m2, 'max_unidades', p.max_unidades, 'permeabilidade', p.permeabilidade,
    'lote_minimo_m2', p.lote_minimo_m2, 'frente_minima_m', p.frente_minima_m, 'outorga_gratuita', p.outorga_gratuita,
    'regras', p.regras, 'fonte_norma', p.fonte_norma, 'fonte_dispositivo', p.fonte_dispositivo, 'fonte_url', p.fonte_url,
    'situacao', p.situacao)) as r
  from app.zona_parametros p
  join app.zoneamentos z on z.id = p.zoneamento_id
  join app.municipios m on m.id = z.municipio_id
  where p.empresa_id is null and p.ativo
) x;
