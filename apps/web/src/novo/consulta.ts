/* eslint-disable @typescript-eslint/no-explicit-any */
// Consulta completa do GeoSampa depois do cadastro (pedido do Moisés, 4/nov/2026), igual ao protótipo
// (proto_geosampa.js: GEO_CAMADAS, geoDentro, geoAreaZonas, geoDist, geoConsultar, geoPA, geoBuscar; proto_lotesgeo.js: lgConsultar;
// proto_restricoes.js: restConsultar). Em cada SQL: o lote, as zonas com a área no lote e todas as camadas que tocam o lote
// (app.registrar_consulta_lote, que também completa área, CIB, zona fiscal, cartório e a análise urbanística); uma nova tentativa
// se falhar. Depois, as mesmas camadas pela poligonal do terreno (Restrições e entorno; app.registrar_consulta_area).
// A planta (PDF) e o desenho (DXF) do lote vão para Documentos quando a ficha tiver a aba Documentos.
import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import { GEO_BASE, digitos, geoAneis, geoAreaAnel, geoNoAnel, geoWfs, geoWkt, latLngUtm, utmLatLng } from './geosampa';
import type { P } from './geo';
import { medirFrentes } from './frentesCalc';
import { classificarFrentes, frentesSemSaida } from './viasCalc';

/** [camada ("camada@raio" = a mesma com outro raio), geometria, raio em metros (0 = só o que toca), atributos guardados (todos se vazio)] */
const GEO_CAMADAS: [string, string, number?, string[]?][] = [
  ['perimetro_zona_lei_18081_24', 'ge_multipoligono'], ['perimetro_zona_lei_18177_24', 'ge_poligono'],
  ['pde2014_v_zeis_04_map_v2', 'ge_poligono'], ['pde2014_v_zeis_04a_map_v2', 'ge_poligono'],
  ['pde2014_v_eetr_03_map_v2', 'ge_poligono'], ['pde2014_v_eixo_prv_03a_map_v2', 'ge_poligono'], ['eixo_ativado_decreto', 'ge_poligono'],
  ['pde_macroarea_lei_18209', 'ge_poligono'], ['pde_fator_planejamento_residencial', 'ge_poligono'],
  ['operacao_urbana', 'ge_poligono'], ['subsetor_operacao_urbana', 'ge_poligono'],
  ['manancial_guarapiranga', 'ge_poligono'], ['manancial_billings', 'ge_poligono'], ['manancial_juquery', 'ge_poligono'],
  ['patrimonio_cultural_bem_tombado', 'ge_poligono'], ['patrimonio_cultural_area_envoltoria_CONPRESP', 'ge_poligono'],
  ['patrimonio_cultural_area_envoltoria_CONDEPHAAT', 'ge_poligono'], ['patrimonio_cultural_area_envoltoria_IPHAN', 'ge_poligono'],
  ['zona_especial_preservacao_cultural_apc', 'ge_poligono'], ['patrimonio_cultural_area_arqueologica', 'ge_poligono'],
  ['area_contaminada_reabilitada_svma', 'ge_multipoligono'], ['GEOSAMPA_area_contaminada_sigac', 'ge_poligono'],
  ['geoconvias_lei_melhoramento_vigente', 'ge_poligono'], ['geoconvias_faixa_nao_edificavel', 'ge_poligono'],
  ['drenagem', 'ge_linha', 30], ['area_risco_geologico_v2', 'ge_poligono'], ['restricao_geotecnica', 'ge_poligono'],
  ['mancha_inundacao_5', 'ge_poligono', 0, ['nm_bacia_hidrografica', 'qt_profundidade_maxima']],
  ['mancha_inundacao_25', 'ge_poligono', 0, ['nm_bacia_hidrografica', 'qt_profundidade_maxima']],
  ['mancha_inundacao_100', 'ge_poligono', 0, ['nm_bacia_hidrografica', 'qt_profundidade_maxima']],
  ['area_influencia_metro', 'ge_poligono'], ['area_influencia_trem', 'ge_poligono'], ['GEOSAMPA_cgpabi_vegetacao_significativa', 'ge_multipoligono'],
  ['area_contaminada_reabilitada_svma@30', 'ge_multipoligono', 30], ['GEOSAMPA_area_contaminada_sigac@30', 'ge_poligono', 30],
  ['GEOSAMPA_cadparcs_parque_unidade_conservacao', 'ge_multipoligono'], ['pde_outra_unidade_conservacao', 'ge_multipoligono'],
  ['arvore_v2', 'ge_ponto', 30, ['cd_identificador']],
  ['classificacao_viaria_cet', 'ge_linha', 45, ['nm_logradouro_completo', 'dc_tipo_classificacao_viaria', 'cd_logradouro']],
  ['enquadramento_vila', 'ge_poligono', 20, ['tx_indicador_enquadramento_vila', 'tx_link_despacho_diario_oficial']],
  ['linha_alta_tensao_v2', 'ge_linha', 30, ['cd_identificador_alta_tensao']],
  ['linha_subterranea_alta_tensao', 'ge_linha', 30, ['nm_linha_subterranea_alta_tensao']],
  ['ferrovia_mdc_v2', 'ge_linha', 30, ['cd_identificador_ferrovia_mdc']],
  ['rede_comgas', 'ge_linha', 100, ['cd_identificador_comgas']],
  ['zona_fiscal', 'ge_poligono'], ['cartorio_registro_imovel', 'ge_poligono'],
];

/* ---------- geometria em UTM ---------- */
const geoDentro = (pt: number[], g: any) => (g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [])
  .some((poly: number[][][]) => geoNoAnel(pt, poly[0]) && !poly.slice(1).some((h) => geoNoAnel(pt, h)));
/** área de cada zona dentro do lote, por amostragem em grade (~2.500 pontos): erro abaixo de 1% */
function geoAreaZonas(lote: any, feicoes: any[], cod: (p: any) => string) {
  const r = geoAneis(lote)[0], xs = r.map((p) => p[0]), ys = r.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
  const passo = Math.max(0.2, Math.sqrt(((x1 - x0) * (y1 - y0)) / 2500)), area = geoAreaAnel(r), cont: Record<string, number> = {};
  let n = 0;
  for (let x = x0 + passo / 2; x < x1; x += passo) for (let y = y0 + passo / 2; y < y1; y += passo) {
    const pt = [x, y]; if (!geoDentro(pt, lote)) continue; n++;
    const f = feicoes.find((q) => geoDentro(pt, q.geometry)); if (f) { const k = cod(f.properties); cont[k] = (cont[k] || 0) + 1; }
  }
  return Object.entries(cont).map(([sigla, c]) => ({ sigla, area_m2: Math.round(((area * c) / n) * 100) / 100 })).sort((a, b) => b.area_m2 - a.area_m2);
}
/** distância em metros entre a área e uma feição: 0 quando se tocam */
function geoDist(area: any, g: any) {
  const A = geoAneis(area), G: number[][][] = g.type === 'Point' ? [[g.coordinates]] : g.type === 'MultiPoint' ? g.coordinates.map((c: number[]) => [c]) : geoAneis(g);
  if (!A.length || !G.length) return null;
  const pol = /Polygon/.test(g.type);
  if (G.some((r) => r.some((pt) => geoDentro(pt, area))) || (pol && A.some((r) => r.some((pt) => geoDentro(pt, g))))) return 0;
  const dps = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, u = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0; return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); };
  const o = (p: number[], q: number[], r: number[]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  const cruza = (a: number[], b: number[], c: number[], d: number[]) => o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
  let m = Infinity;
  for (const r of A) for (let i = 0; i < r.length - 1; i++) for (const q of G) {
    if (q.length === 1) { m = Math.min(m, dps(q[0], r[i], r[i + 1])); continue; }
    for (let j = 0; j < q.length - 1; j++) {
      if (cruza(r[i], r[i + 1], q[j], q[j + 1])) return 0;
      m = Math.min(m, dps(q[j], r[i], r[i + 1]), dps(q[j + 1], r[i], r[i + 1]), dps(r[i], q[j], q[j + 1]), dps(r[i + 1], q[j], q[j + 1]));
    }
  }
  return m === Infinity ? null : Math.round(m * 10) / 10;
}
/** todas as camadas em volta de uma área (lote ou poligonal do terreno) */
async function geoConsultar(area: any) {
  const wkt = geoWkt(area), camadas: Record<string, any[]> = {}, erros: string[] = [];
  await Promise.all(GEO_CAMADAS.map(async ([k, geom, dist, campos]) => {
    const cam = k.split('@')[0];
    try {
      const fs = await geoWfs({ typeNames: 'geoportal:' + cam, count: '300', CQL_FILTER: dist ? `DWITHIN(${geom},${wkt},${dist},meters)` : `INTERSECTS(${geom},${wkt})` });
      camadas[k] = fs.map((f) => {
        const p: any = campos ? Object.fromEntries(campos.map((c) => [c, f.properties[c]])) : { ...f.properties };
        if (dist && f.geometry) p._dist_m = geoDist(area, f.geometry);
        /* melhoramento viário e faixa não edificável: quanto do terreno a faixa atinge */
        if (/^geoconvias_/.test(cam) && f.geometry) p._area_m2 = geoAreaZonas(area, [f], () => 'a')[0]?.area_m2 ?? 0;
        return { ...f, properties: p };
      }).sort((a, b) => (a.properties._dist_m ?? 0) - (b.properties._dist_m ?? 0));
    } catch { erros.push(k); }
  }));
  return { camadas, erros };
}
const atributos = (camadas: Record<string, any[]>) => Object.fromEntries(Object.entries(camadas).map(([k, fs]) => [k, fs.map((f) => f.properties)]));

/** Classificação viária e rua sem saída só das ruas que são frente da área (pedido do Moises, 9/nov/2026; viasCalc.ts):
 * a CET em volta (30 m pegava as ruas do outro lado do cruzamento) vira uma linha por rua de frente, e a rede de eixos
 * da prefeitura até 400 m em volta diz se a rua de frente tem saída. Sem resposta, as duas camadas ficam como erro. */
const VIAS_RAIO = 400;
async function viasDaArea(anel: number[][], camadas: Record<string, any[]>, props: Record<string, any[]>, erros: string[]) {
  const ter = anel.slice(0, -1), xs = ter.map((p) => p[0]), ys = ter.map((p) => p[1]);
  const cx = (m: number) => [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  const bb = (m: number) => cx(m).join(',') + ',urn:ogc:def:crs:EPSG::31983';
  try {
    if (erros.includes('classificacao_viaria_cet')) throw new Error('CET sem resposta');
    const [ls, vs] = await Promise.all([
      geoWfs({ typeNames: 'geoportal:lote_cidadao', count: '5000', propertyName: 'ge_poligono', bbox: bb(20) }),
      geoWfs({ typeNames: 'geoportal:v_logradouro_segmento', count: '5000', bbox: bb(VIAS_RAIO) }),
    ]);
    const med = medirFrentes(ter, ls.flatMap((f) => geoAneis(f.geometry).slice(0, 1)), vs);
    props.classificacao_viaria_cet = classificarFrentes(med.frentes, camadas.classificacao_viaria_cet || []);
    props.rua_sem_saida = frentesSemSaida(med.frentes, vs, cx(VIAS_RAIO));
  } catch {
    delete props.classificacao_viaria_cet;
    for (const k of ['classificacao_viaria_cet', 'rua_sem_saida']) if (!erros.includes(k)) erros.push(k);
  }
}

/* perímetro de qualificação ambiental (Quota Ambiental, Lei 16.402, Mapa 3), de docs/dados/quota-ambiental-3550308.json */
let qa: Promise<any> | null = null;
const qaCarregar = () => (qa ??= fetch('/prototipo/dados/quota-ambiental-3550308.json').then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).catch((e) => { qa = null; throw e; }));
async function geoPA(poly: P[]) {
  if (poly.length < 3) return null;
  const d = await qaCarregar();
  const anel = poly.map(([la, ln]) => [ln, la]), xs = anel.map((p) => p[0]), ys = anel.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), pts: number[][] = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { const pt = [x0 + ((x1 - x0) * i) / 8, y0 + ((y1 - y0) * j) / 8]; if (geoNoAnel(pt, anel)) pts.push(pt); }
  if (!pts.length) pts.push([(x0 + x1) / 2, (y0 + y1) / 2]);
  const cont: Record<string, number> = {};
  for (const f of d.features) for (const pt of pts) if (geoDentro(pt, f.geometry)) cont[f.properties.pa] = (cont[f.properties.pa] || 0) + 1;
  const r = Object.entries(cont).sort((a, b) => b[1] - a[1]);
  return r.length ? r.map(([k]) => k.replace('-', ' ')).join(' / ') : null;
}
const geojsonUtm = (an: number[][]) => ({ type: 'Polygon', coordinates: [an.map((p) => { const [la, ln] = utmLatLng(p[0], p[1]); return [+ln.toFixed(7), +la.toFixed(7)]; })] });

/** consulta completa de um SQL; false quando o GeoSampa não achou o lote ou não respondeu */
export async function consultarLote(inscricaoId: string, sql: string) {
  const d = digitos(sql);
  const lotes = await geoWfs({ typeNames: 'geoportal:lote_cidadao', CQL_FILTER: `cd_setor_fiscal='${d.slice(0, 3)}' AND cd_quadra_fiscal='${d.slice(3, 6)}' AND cd_lote='${d.slice(6, 10)}'` });
  const lote = lotes.find((f) => String(f.properties.cd_digito_sql) === d[10] && f.properties.tx_situ_lote !== 'INATIVO' && f.geometry);
  if (!lote) return false;
  const { camadas, erros } = await geoConsultar(lote.geometry);
  const zf = camadas.perimetro_zona_lei_18081_24 || [], zonas = zf.length ? geoAreaZonas(lote.geometry, zf, (p) => p.cd_zoneamento_perimetro) : [];
  const anel = geoAneis(lote.geometry)[0], props = atributos(camadas);
  await viasDaArea(anel, camadas, props, erros);
  const pa = await geoPA(anel.slice(0, -1).map((p) => utmLatLng(p[0], p[1]))).catch(() => null);
  if (pa) props.quota_ambiental = [{ pa }];
  const { error } = await supabase.rpc('registrar_consulta_lote', {
    p_inscricao: inscricaoId, p_lote: lote.properties, p_poligono: geojsonUtm(anel), p_area_poligono: Math.round(geoAreaAnel(anel) * 100) / 100,
    p_camadas: props, p_zonas: zonas, p_camadas_com_erro: erros,
  });
  if (error) throw error;
  return true;
}
/** as mesmas camadas pela poligonal do terreno (Restrições e entorno) */
export async function consultarArea(terrenoId: string, poly: P[]) {
  const anel = poly.map(([la, ln]) => latLngUtm(la, ln)); anel.push(anel[0]);
  const { camadas, erros } = await geoConsultar({ type: 'Polygon', coordinates: [anel] });
  const props = atributos(camadas);
  await viasDaArea(anel, camadas, props, erros);
  const pa = await geoPA(poly).catch(() => null);
  if (pa) props.quota_ambiental = [{ pa }];
  const { error } = await supabase.rpc('registrar_consulta_area', { p_terreno: terrenoId, p_camadas: props, p_camadas_com_erro: erros });
  if (error) throw error;
  return erros.length;
}

/* ---------- andamento ("Consultando o GeoSampa: N de M"), lido pela lista do mapa ---------- */
export interface Andamento { terreno: string; feitos: number; total: number }
let A: Andamento | null = null;
const ouvintes = new Set<() => void>();
const mudar = (a: Andamento | null) => { A = a; ouvintes.forEach((f) => f()); };
export const useConsultaGeo = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => A);
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** avisa a ficha aberta que o terreno mudou no banco (ela se refaz; ficha/Ficha.tsx, useFicha) */
const gravado = (id: string) => window.dispatchEvent(new CustomEvent('terreno-gravado', { detail: id }));

/** depois do cadastro: cada SQL (com uma nova tentativa) e depois a poligonal; avisa no fim */
export async function consultarTerreno(terrenoId: string, poly: P[] | null, ins: { id: string; sql: string }[], aviso: (m: string, erro?: boolean) => void) {
  if (!GEO_BASE || A || !ins.length) return;
  mudar({ terreno: terrenoId, feitos: 0, total: ins.length });
  let falhas = 0, areaOk = true;
  try {
    for (const i of ins) {
      let ok = false;
      for (let t = 0; t < 2 && !ok; t++) {
        if (t) await espera(1500);
        try { ok = await consultarLote(i.id, i.sql); } catch (e) { console.warn('GeoSampa', i.sql, e); }
      }
      if (!ok) falhas++;
      else gravado(terrenoId);
      mudar({ terreno: terrenoId, feitos: A!.feitos + 1, total: ins.length });
    }
    if (poly && poly.length >= 3) { try { await consultarArea(terrenoId, poly); gravado(terrenoId); } catch (e) { areaOk = false; console.warn('GeoSampa área', e); } }
  } finally { mudar(null); }
  const n = ins.length;
  if (falhas) aviso(`GeoSampa consultado; ${falhas} SQL${falhas > 1 ? 's' : ''} não respondeu. Use "Buscar no GeoSampa" no SQL.`, true);
  else if (!areaOk) aviso('GeoSampa consultado nos SQLs, mas a consulta pela poligonal falhou. Tente de novo na ficha.', true);
  else aviso(`GeoSampa consultado ${n > 1 ? `nos ${n} SQLs` : 'no SQL'} e pela poligonal: parâmetros e restrições preenchidos.`);
}
