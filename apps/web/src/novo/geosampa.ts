/* eslint-disable @typescript-eslint/no-explicit-any */
// GeoSampa pelo SQL no Novo terreno (proto_geosampa.js: GEO_BASE, geoWfs, utmLatLng, geoAneis, geoTit; proto_lotesgeo.js:
// nvSqlIncluir). O servidor do GeoSampa só aceita chamada vinda dele mesmo: passa pelo Caddy em /geosampa, por isso só
// funciona na versão publicada.
import type { P } from './geo';

export const GEO_BASE: string | null = (() => {
  const m = document.querySelector<HTMLMetaElement>('meta[name="geosampa-url"]');
  if (m?.content && !m.content.includes('{%')) return m.content;
  return /^https?:$/.test(location.protocol) && !/localhost|127\.0\.0\.1/.test(location.host) ? location.origin + '/geosampa/geoserver/geoportal/' : null;
})();

/** UTM SIRGAS 2000 fuso 23S (EPSG:31983) -> [lat, lng] */
export function utmLatLng(E: number, N: number, l0 = -45): P {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), x = E - 5e5, y = N - 1e7, M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1), C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - ((N1 * t) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c;
  return [(lat * 180) / Math.PI, l0 + (lng * 180) / Math.PI];
}
export const geoAneis = (g: any): number[][][] => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
export const geoTit = (s: string) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/(^|\s)(\S)/g, (_m, a, b) => a + b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g, (x) => x.toLowerCase());

export async function geoWfs(params: Record<string, string>): Promise<any[]> {
  if (!GEO_BASE) throw new Error('A busca no GeoSampa funciona na versão publicada.');
  const u = new URL(GEO_BASE + 'ows');
  Object.entries({ service: 'WFS', version: '2.0.0', request: 'GetFeature', outputFormat: 'application/json', srsName: 'EPSG:31983', ...params }).forEach(([k, v]) => u.searchParams.set(k, v));
  /* sem resposta em 30 s, desiste com aviso, em vez de deixar o botão esperando para sempre */
  let r: Response;
  try { r = await fetch(u, { signal: AbortSignal.timeout(30_000) }); }
  catch (e: any) { throw new Error(e?.name === 'TimeoutError' ? 'O GeoSampa não respondeu em 30 segundos. Tente de novo.' : 'Não foi possível falar com o GeoSampa. Tente de novo.'); }
  if (!r.ok) throw new Error('GeoSampa respondeu ' + r.status);
  const j = await r.json();
  if (!j || !Array.isArray(j.features)) throw new Error('Resposta inesperada do GeoSampa');
  return j.features;
}

export const digitos = (s: string) => String(s || '').replace(/\D/g, '');
export const sqlFmt = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 10)}-${d[10]}`;
/** máscara do SQL enquanto digita: 000.000.0000-0 */
export function sqlMascara(s: string) {
  const d = digitos(s).slice(0, 11);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join('.') + (d.length > 10 ? '-' + d[10] : '');
}

export interface LoteSql { sql: string; area: number | null; end: string; cib: string | null; poly: P[]; q?: string }
/** o lote do SQL no GeoSampa; erro com a mensagem para o usuário quando não acha ou o dígito não confere */
export async function loteDoSql(d: string): Promise<LoteSql> {
  const fs = await geoWfs({ typeNames: 'geoportal:lote_cidadao', CQL_FILTER: `cd_setor_fiscal='${d.slice(0, 3)}' AND cd_quadra_fiscal='${d.slice(3, 6)}' AND cd_lote='${d.slice(6, 10)}'` });
  const f = fs.find((x) => String(x.properties.cd_digito_sql) === d[10] && x.properties.tx_situ_lote !== 'INATIVO' && x.geometry);
  if (!f) throw new Error(fs.length ? `O dígito do SQL não confere (no GeoSampa é ${fs[0].properties.cd_digito_sql}).` : 'SQL não encontrado no GeoSampa.');
  const p = f.properties, an = geoAneis(f.geometry)[0];
  return {
    sql: p.nr_contribuinte || sqlFmt(d), area: p.qt_area_terreno ?? null, cib: p.cd_cib || null,
    end: p.nm_logradouro_completo ? geoTit(p.nm_logradouro_completo) + (p.cd_numero_porta && p.cd_numero_porta !== '0' ? ', ' + p.cd_numero_porta : '') : '',
    poly: an.slice(0, -1).map((q) => utmLatLng(q[0], q[1]).map((v) => +v.toFixed(7)) as P), q: p.cd_setor_fiscal + '.' + p.cd_quadra_fiscal,
  };
}

/* ---------- geometria em UTM (proto_geosanja.js: latLngUtm; proto_geosampa.js: geoAreaAnel, geoNoAnel, geoWkt; proto_topo.js: topoNomeVia) ---------- */
/** [lat, lng] -> UTM SIRGAS 2000 fuso 23S (EPSG:31983) */
export function latLngUtm(lat: number, lng: number, l0 = -45): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), p = (lat * Math.PI) / 180, l = ((lng - l0) * Math.PI) / 180, s = Math.sin(p), c = Math.cos(p);
  const N = a / Math.sqrt(1 - e2 * s * s), T = Math.tan(p) ** 2, C = ep2 * c * c, A = c * l;
  const M = a * ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256) * p - ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 ** 3) / 1024) * Math.sin(2 * p) + ((15 * e2 * e2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * p) - ((35 * e2 ** 3) / 3072) * Math.sin(6 * p));
  return [5e5 + k0 * N * (A + ((1 - T + C) * A ** 3) / 6 + ((5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5) / 120),
    1e7 + k0 * (M + N * Math.tan(p) * ((A * A) / 2 + ((5 - T + 9 * C + 4 * C * C) * A ** 4) / 24 + ((61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6) / 720))];
}
export const geoAreaAnel = (r: number[][]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
export function geoNoAnel(pt: number[], r: number[][]) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
export const geoWkt = (g: any) => 'POLYGON(' + geoAneis(g).map((r) => '(' + r.map((p) => p[0] + ' ' + p[1]).join(',') + ')').join(',') + ')';
export const nomeVia = (p: any) => p ? [p.cd_tipo_logradouro, p.cd_titulo_logradouro, p.tx_preposicao_logradouro, p.nm_logradouro].filter(Boolean).join(' ').trim() : '';
