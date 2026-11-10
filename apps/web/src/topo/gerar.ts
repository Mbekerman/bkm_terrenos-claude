/* eslint-disable @typescript-eslint/no-explicit-any */
// Topográfico preliminar do terreno, porte de tools/prototipo/proto_topo.js (decisões do Moisés, 26 e 27/out/2026).
// Contorno: a soma dos lotes da prefeitura quando todas as inscrições com base (GeoSampa, GeoSanja) têm o lote; senão, a
// poligonal desenhada. O levantamento cobre até 30 m em volta; em São Paulo sem SQL, as quadras (quarteirões) que a
// poligonal ocupa, inteiras, com os lotes numerados pelo SQL, numa folha maior se precisar (A2 a A0, na escala do terreno).
// Cotas: em São Paulo, sempre o laser 2020 da prefeitura (se falhar, erro e "Tentar de novo", nunca o Google; 27/out/2026);
// fora dele, o Google Elevation numa grade de 5 m (a origem do Google tem 9,5 m; mais denso só encarece), interpolado para
// 1 m. Curvas de 1 em 1 m (mestra de 5 em 5) por quadrados marchantes.
// Imagem por trás: a de satélite do Google com os nomes das ruas (Maps Static, híbrido); se o Google falhar, a ortofoto da
// prefeitura (GeoSampa 2023/24, GeoSanja 8 cm). Sem reserva de outro fornecedor (decisão do Moises, 10/nov/2026). Saídas:
// PDF (a página em imagem) e ZIP com o DXF 2000, a imagem referenciada e o mesmo PDF. Com cotas do Google, o DXF leva só
// as curvas com o texto da cota, sem os pontos do Google (decisão do Moisés com o advogado, 27/out/2026); com o laser, também
// a malha de pontos cotados. Os arquivos se baixam na hora; guardar em Documentos entra com a aba Documentos.
import JSZip from 'jszip';
import { supabase } from '../lib/supabase';
import { GMAPS_KEY } from '../lib/config';
import { carregarGoogle } from '../mapa/google';
import { GEO_BASE, digitos, geoAneis, geoAreaAnel, geoNoAnel, geoWfs, latLngUtm, loteDoSql, nomeVia as nomeViaSp, utmLatLng } from '../novo/geosampa';
import { geoDentro } from '../novo/consulta';
import { GSJ_BASE, gsjInfoBB, gsjPoligono, gsjToken } from '../novo/geosanja';
import { centroPoly, lotesUniao, type P } from '../novo/geo';
import { quadrasSjc } from '../novo/lotesSjc';
import { baseLotes } from '../novo/lotesBase';
import MODELO from './modelo.dxf?raw';

export const TOPO_FOLGA = 30;
export const PASSO_G = 5;
const DPI = 160;
const num = (v: number, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const distSeg = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const ext = (pts: number[][]) => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const mapCoord = (c: any, f: (p: number[]) => number[]): any => (!c.length ? c : typeof c[0] === 'number' ? f(c) : c.map((x: any) => mapCoord(x, f)));
const geoMapa = (g: any, f: (p: number[]) => number[]) => g && { ...g, coordinates: mapCoord(g.coordinates, f) };

export interface TerrenoTopo { id: string; codigo: string; nome: string; municipio: string | null; uf: string | null; municipioId: string | null; poly: P[] | null; empresa?: string | null }
export interface Resultado { pdf: Blob; zip: Blob; previa: string; nome: string; resumo: Resumo }
export interface Resumo { contorno: string; cotas: string; imagem: string; curvas: string; area: number; min: number; max: number; dec: number | null; erros: string[]; escala: number; papel: string; levantado: string }
export type Passo = (t: string) => void;

/* ---------- contorno: lotes da prefeitura (GeoSampa, GeoSanja) ou a poligonal desenhada ---------- */
async function contorno(t: TerrenoTopo, base: string | null) {
  const polys: P[][] = [], faltam: string[] = [];
  let ins: any[] = [];
  if (base === 'geosanja' || base === 'geosampa') {
    const [{ data: i }, { data: cs }] = await Promise.all([
      supabase.from('inscricoes_municipais').select('id,inscricao').eq('terreno_id', t.id),
      supabase.from('consultas_lote').select('inscricao_id,poligono_geojson,consultado_em').eq('terreno_id', t.id).order('consultado_em', { ascending: false }),
    ]);
    ins = i ?? [];
    for (const x of ins) {
      const c = (cs ?? []).find((y: any) => y.inscricao_id === x.id && y.poligono_geojson);
      let p: P[] | null = c ? (geoAneis(c.poligono_geojson)[0] as number[][]).slice(0, -1).map(([ln, la]) => [la, ln] as P) : null;
      if (!p && base === 'geosanja' && GSJ_BASE) try { p = await gsjPoligono(x.inscricao); } catch (e) { console.warn(e); }
      if (!p && base === 'geosampa' && GEO_BASE && digitos(x.inscricao).length === 11) try { p = (await tenta(() => loteDoSql(digitos(x.inscricao)))).poly; } catch (e) { console.warn(e); }
      if (p) polys.push(p); else faltam.push(x.inscricao);
    }
  }
  if (ins.length && !faltam.length) { const u = lotesUniao(polys); return { polys: u ? [u] : polys, fonte: 'lotes' as const, n: polys.length, faltam }; }
  if (t.poly && t.poly.length >= 3) return { polys: [t.poly], fonte: 'desenhada' as const, n: 0, faltam };
  return polys.length ? { polys: [lotesUniao(polys) || polys[0]], fonte: 'lotes' as const, n: polys.length, faltam } : null;
}

/* ---------- grade de 1 m sobre a área do levantamento; D = distância ao contorno (0 dentro) ---------- */
export function grade(P: number[][][], bb: number[], s: number) {
  const nx = Math.ceil((bb[2] - bb[0]) / s) + 1, ny = Math.ceil((bb[3] - bb[1]) / s) + 1, D = new Float32Array(nx * ny), ed: number[][][] = [];
  P.forEach((r) => r.forEach((p, i) => ed.push([p, r[(i + 1) % r.length]])));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const pt = [bb[0] + i * s, bb[1] + j * s];
    let d = Infinity;
    if (!P.some((r) => geoNoAnel(pt, r))) { for (const [a, b] of ed) { const v = distSeg(pt, a, b); if (v < d) d = v; } } else d = 0;
    D[j * nx + i] = d;
  }
  return { nx, ny, x0: bb[0], y0: bb[1], s, D, Z: new Float32Array(nx * ny).fill(NaN) };
}
export type Grade = ReturnType<typeof grade>;

/* ---------- cotas pelo Google: grade de 5 m (até 512 pontos por pedido) e Catmull-Rom para 1 m ---------- */
export async function cotasGoogle(G: Grade, l0: number, av: Passo) {
  if (!(await carregarGoogle())) throw new Error('as cotas fora de São Paulo vêm do Google, que não respondeu (só funciona na versão publicada).');
  const { ElevationService } = await window.google.maps.importLibrary('elevation');
  const k = Math.round(PASSO_G / G.s), cx = Math.ceil((G.nx - 1) / k) + 3, cy = Math.ceil((G.ny - 1) / k) + 3, C = new Float32Array(cx * cy).fill(NaN), pts: [number, P][] = [];
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) {
    const x = G.x0 + (i - 1) * PASSO_G, y = G.y0 + (j - 1) * PASSO_G;
    const gi = Math.min(G.nx - 1, Math.max(0, Math.round((x - G.x0) / G.s))), gj = Math.min(G.ny - 1, Math.max(0, Math.round((y - G.y0) / G.s)));
    if (G.D[gj * G.nx + gi] <= TOPO_FOLGA + 3 * PASSO_G) pts.push([j * cx + i, utmLatLng(x, y, l0)]);
  }
  const svc = new ElevationService(), lotes: [number, P][][] = [];
  for (let i = 0; i < pts.length; i += 512) lotes.push(pts.slice(i, i + 512));
  let res = 0;
  const pedir = async (lt: [number, P][]) => {
    for (let tent = 0; ; tent++) {
      try {
        const { results } = await svc.getElevationForLocations({ locations: lt.map((p) => ({ lat: p[1][0], lng: p[1][1] })) });
        results.forEach((r: any, q: number) => { C[lt[q][0]] = r.elevation; res = Math.max(res, r.resolution || 0); });
        return;
      } catch (e: any) {
        if (tent >= 3 || !/OVER_QUERY_LIMIT|UNKNOWN_ERROR/.test(e?.code || e?.message || '')) throw e;
        await new Promise((ok) => setTimeout(ok, 800 * (tent + 1)));
      }
    }
  };
  for (let i = 0; i < lotes.length; i += 3) { await Promise.all(lotes.slice(i, i + 3).map(pedir)); av(`${Math.min(lotes.length, i + 3)} de ${lotes.length} pedidos ao Google`); }
  const cr = (p0: number, p1: number, p2: number, p3: number, t: number) => p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));
  for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
    const u = (G.x0 + i * G.s - (G.x0 - PASSO_G)) / PASSO_G, v = (G.y0 + j * G.s - (G.y0 - PASSO_G)) / PASSO_G, iu = Math.floor(u), iv = Math.floor(v);
    if (iu < 1 || iv < 1 || iu > cx - 3 || iv > cy - 3) continue;
    const lin: number[] = [];
    for (let m = -1; m <= 2; m++) { const r = (iv + m) * cx; lin.push(cr(C[r + iu - 1], C[r + iu], C[r + iu + 1], C[r + iu + 2], u - iu)); }
    const z = cr(lin[0], lin[1], lin[2], lin[3], v - iv);
    if (z === z) G.Z[j * G.nx + i] = z;
  }
  return { n: pts.length, res: res || 9.5 };
}

/* ---------- cotas pelo laser 2020 da prefeitura (São Paulo; proto_topo.js › topoLaser): as folhas do MDT que tocam a área,
   baixadas pelo repasse do Caddy (/geosampa/Download/File/125) e lidas com o laz-perf (npm) no navegador; média por célula,
   buracos preenchidos pelos vizinhos e leve suavização ---------- */
export const MDT = () => (GEO_BASE ? GEO_BASE.replace(/geoserver\/geoportal\/$/, '') + 'Download/File/125?key=cd_quadricula&value=' : null);
/* leitor das folhas .laz: o laz-perf 0.0.7 do npm, empacotado com o app (sem CDN) e carregado só quando o laser é usado */
let LZ: any = null;
async function lazPerf() {
  if (LZ) return LZ;
  const [m, w] = await Promise.all([import('laz-perf/lib/web/laz-perf.js'), import('laz-perf/lib/web/laz-perf.wasm?url')]);
  const criar = (m as any).default ?? (m as any).createLazPerf ?? m;
  LZ = await criar({ locateFile: () => w.default });
  return LZ;
}
/** tenta de novo o que depende da prefeitura (o GeoSampa às vezes demora ou cai): 3 vezes, com espera crescente */
export async function tenta<T>(fn: () => Promise<T>, n = 3): Promise<T> {
  for (let k = 1; ; k++) { try { return await fn(); } catch (e) { if (k >= n) throw e; await new Promise((ok) => setTimeout(ok, 1500 * k)); } }
}
/** bb em UTM 23S (EPSG:31983), como a grade */
export async function cotasLaser(G: Grade, bb: number[], av: Passo) {
  const base = MDT();
  if (!base) throw new Error('o laser da prefeitura só responde na versão publicada.');
  const fol = await tenta(() => geoWfs({ typeNames: 'geoportal:quadricula_folha_mdt_mds_2020', bbox: bb.join(',') + ',urn:ogc:def:crs:EPSG::31983' }));
  if (!fol.length) throw new Error('nenhuma folha do laser cobre o terreno.');
  const M = await lazPerf(), S = new Float64Array(G.nx * G.ny), N = new Uint16Array(G.nx * G.ny);
  let k = 0;
  for (const f of fol) {
    const q = f.properties.cd_quadricula;
    av(`folha ${++k} de ${fol.length} do laser (${q})`);
    const buf = await tenta(async () => {
      const r = await fetch(base + encodeURIComponent(q));
      if (!r.ok) throw new Error('GeoSampa respondeu ' + r.status);
      const z = await JSZip.loadAsync(await r.arrayBuffer()), arq = Object.values(z.files).find((x) => /\.laz$/i.test(x.name));
      if (!arq) throw new Error('folha do laser sem o arquivo .laz');
      return arq.async('uint8array');
    });
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    const sx = dv.getFloat64(131, true), sy = dv.getFloat64(139, true), sz = dv.getFloat64(147, true), ox = dv.getFloat64(155, true), oy = dv.getFloat64(163, true), oz = dv.getFloat64(171, true);
    const p = M._malloc(buf.length); M.HEAPU8.set(buf, p);
    const lz = new M.LASZip();
    try {
      lz.open(p, buf.length);
      const n = lz.getCount(), len = lz.getPointLength(), pp = M._malloc(len);
      try {
        for (let i = 0; i < n; i++) {
          lz.getPoint(pp);
          const d = new DataView(M.HEAPU8.buffer, pp, len), x = d.getInt32(0, true) * sx + ox, y = d.getInt32(4, true) * sy + oy;
          const gi = Math.round((x - G.x0) / G.s), gj = Math.round((y - G.y0) / G.s);
          if (gi < 0 || gj < 0 || gi >= G.nx || gj >= G.ny) continue;
          const c = gj * G.nx + gi; S[c] += d.getInt32(8, true) * sz + oz; N[c]++;
        }
      } finally { M._free(pp); }
    } finally { lz.delete(); M._free(p); }
  }
  const Z = G.Z;
  for (let c = 0; c < Z.length; c++) if (N[c]) Z[c] = S[c] / N[c];
  const viz = (A: Float32Array, i: number, j: number, f?: number[]) => {
    let s = 0, n = 0;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
      const x = i + a, y = j + b;
      if (x < 0 || y < 0 || x >= G.nx || y >= G.ny) continue;
      const v = A[y * G.nx + x], w = f ? f[(b + 1) * 3 + a + 1] : 1;
      if (v === v) { s += v * w; n += w; }
    }
    return n ? s / n : NaN;
  };
  for (let it = 0; it < 40; it++) {
    const B = Z.slice(); let falta = 0;
    for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) {
      const c = j * G.nx + i;
      if (Z[c] === Z[c] || G.D[c] > TOPO_FOLGA + 2) continue;
      const v = viz(B, i, j); if (v === v) Z[c] = v; else falta++;
    }
    if (!falta) break;
  }
  const ker = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  for (let it = 0; it < 4; it++) { const B = Z.slice(); for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { const c = j * G.nx + i; if (B[c] === B[c]) Z[c] = viz(B, i, j, ker); } }
  let ok = 0, tot = 0;
  for (let c = 0; c < Z.length; c++) if (G.D[c] <= TOPO_FOLGA) { tot++; if (Z[c] === Z[c]) ok++; }
  if (ok < tot * 0.97) throw new Error('o laser não cobre a área toda.');
  return { folhas: fol.map((f) => f.properties.cd_quadricula as string) };
}

/* ---------- São Paulo sem SQL (proto_topo.js › topoQuadras): as quadras (o quarteirão entre as ruas, quadra_viaria_editada do
   GeoSampa; a quadra fiscal pode juntar vários quarteirões) que a poligonal ocupa e os lotes ativos de dentro delas, um por SQL.
   Tudo em UTM 23S (EPSG:31983), como vem do GeoSampa ---------- */
export interface LoteQ { g: any; p: any; sql: string; c: string; pt: number[]; folga: number }
async function quadras(P: number[][][]) {
  const bb = ext(P.flat()), bbs = (b: number[]) => b.join(',') + ',urn:ogc:def:crs:EPSG::31983';
  const qs = (await tenta(() => geoWfs({ typeNames: 'geoportal:quadra_viaria_editada', bbox: bbs(bb), count: '500' })))
    .filter((f) => f.geometry && /Polygon/.test(f.geometry.type));
  const passo = Math.max(0.5, Math.sqrt(((bb[2] - bb[0]) * (bb[3] - bb[1])) / 1600)), cont = new Map<number, number>();
  let n = 0;
  for (let x = bb[0] + passo / 2; x < bb[2]; x += passo) for (let y = bb[1] + passo / 2; y < bb[3]; y += passo) {
    const pt = [x, y];
    if (!P.some((r) => geoNoAnel(pt, r))) continue;
    n++;
    const q = qs.findIndex((f) => geoDentro(pt, f.geometry));
    if (q >= 0) cont.set(q, (cont.get(q) || 0) + 1);
  }
  /* a quadra conta com 5% ou mais da poligonal (o desenho costuma passar um pouco da divisa); quadra enorme (acima de 6 ha e de
     3 vezes o terreno, como as que margeiam a ferrovia) fica de fora: dela, só os lotes até 30 m do terreno */
  const areaT = P.reduce((a, r) => a + geoAreaAnel(r), 0);
  const ocup = [...cont].filter(([, c]) => c >= Math.max(1, n * 0.05)).map(([q]) => qs[q].geometry);
  const grande = (g: any) => geoAneis(g).slice(0, 1).reduce((a, r) => a + geoAreaAnel(r), 0) > Math.max(6e4, 3 * areaT);
  const sel = ocup.filter((g) => !grande(g)), grandes = ocup.filter(grande);
  if (!ocup.length) return null;
  const perto = (pt: number[]) => P.some((r) => geoNoAnel(pt, r)) || Math.min(...P.flatMap((r) => r.map((p, i) => distSeg(pt, p, r[(i + 1) % r.length])))) <= TOPO_FOLGA;
  const aneis = sel.flatMap((g) => (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).map((pl: number[][][]) => pl[0])) as number[][][];
  const e = ext([...aneis.flat(), [bb[0] - TOPO_FOLGA, bb[1] - TOPO_FOLGA], [bb[2] + TOPO_FOLGA, bb[3] + TOPO_FOLGA]]);
  const fs = await tenta(() => geoWfs({ typeNames: 'geoportal:lote_cidadao', bbox: bbs(e), count: '5000' }));
  const lotes: LoteQ[] = [], vistos = new Set<string>(), fiscais = new Set<string>();
  for (const f of fs) {
    const p = f.properties;
    if (!f.geometry || p.tx_situ_lote === 'INATIVO') continue;
    const r = geoAneis(f.geometry)[0];
    if (!r) continue;
    const m = miolo(r);
    if (!sel.some((g) => geoDentro(m.pt, g)) && !(grandes.some((g) => geoDentro(m.pt, g)) && perto(m.pt))) continue;
    const sql = p.nr_contribuinte || `${p.cd_setor_fiscal}.${p.cd_quadra_fiscal}.${p.cd_lote}-${p.cd_digito_sql}`;
    if (vistos.has(sql)) continue;
    vistos.add(sql); fiscais.add(p.cd_setor_fiscal + '.' + p.cd_quadra_fiscal);
    lotes.push({ g: f.geometry, p, sql, c: 'lote_cidadao', ...m });
  }
  return { n: sel.length, grandes: grandes.length, quadras: [...fiscais].sort(), lotes, aneis };
}
/** ponto para o número do lote: o mais longe das bordas numa amostra dentro dele (o centro pode cair fora num lote em L) */
function miolo(r: number[][]) {
  const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys), s = Math.max(x1 - x0, y1 - y0) / 14;
  let best: number[] | null = null, bd = -1;
  for (let x = x0 + s / 2; x < x1; x += s) for (let y = y0 + s / 2; y < y1; y += s) {
    const pt = [x, y];
    if (!geoNoAnel(pt, r)) continue;
    const d = Math.min(...r.map((p, i) => distSeg(pt, p, r[(i + 1) % r.length])));
    if (d > bd) { bd = d; best = pt; }
  }
  return best ? { pt: best, folga: bd } : { pt: [(x0 + x1) / 2, (y0 + y1) / 2], folga: Math.min(x1 - x0, y1 - y0) / 2 };
}

/* ---------- curvas de nível: quadrados marchantes nível a nível, segmentos encadeados em linhas ---------- */
function isolinhas(nx: number, ny: number, x0: number, y0: number, s: number, V: ArrayLike<number>, niveis: number[]) {
  const out: { z: number; pts: number[][] }[] = [];
  for (const L of niveis) {
    const segs: [string, number[], string, number[]][] = [], porChave = new Map<string, number[]>();
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = V[j * nx + i], b = V[j * nx + i + 1], c = V[(j + 1) * nx + i + 1], d = V[(j + 1) * nx + i];
      if (!(a === a && b === b && c === c && d === d) || L < Math.min(a, b, c, d) || L >= Math.max(a, b, c, d)) continue;
      const X = (v: number) => x0 + v * s, Y = (v: number) => y0 + v * s, cr: [string, number[]][] = [];
      if ((a >= L) !== (b >= L)) cr.push(['h' + i + '_' + j, [X(i + (L - a) / (b - a)), Y(j)]]);
      if ((b >= L) !== (c >= L)) cr.push(['v' + (i + 1) + '_' + j, [X(i + 1), Y(j + (L - b) / (c - b))]]);
      if ((d >= L) !== (c >= L)) cr.push(['h' + i + '_' + (j + 1), [X(i + (L - d) / (c - d)), Y(j + 1)]]);
      if ((a >= L) !== (d >= L)) cr.push(['v' + i + '_' + j, [X(i), Y(j + (L - a) / (d - a))]]);
      const par = (p: [string, number[]], q: [string, number[]]) => { const n = segs.length; segs.push([p[0], p[1], q[0], q[1]]); [p[0], q[0]].forEach((k) => (porChave.get(k) || porChave.set(k, []).get(k)!).push(n)); };
      if (cr.length === 2) par(cr[0], cr[1]);
      else if (cr.length === 4) { const m = (a + b + c + d) / 4; if ((m >= L) === (a >= L)) { par(cr[0], cr[1]); par(cr[2], cr[3]); } else { par(cr[3], cr[0]); par(cr[1], cr[2]); } }
    }
    const usado = new Uint8Array(segs.length);
    for (let n = 0; n < segs.length; n++) {
      if (usado[n]) continue;
      usado[n] = 1;
      const [k1, p1, k2, p2] = segs[n], linha = [p1, p2];
      for (const [fim, lado] of [[k2, 1], [k1, 0]] as [string, number][]) {
        let k = fim;
        for (;;) {
          const prox = (porChave.get(k) || []).find((m) => !usado[m]);
          if (prox == null) break;
          usado[prox] = 1;
          const sg = segs[prox], o: [string, number[]] = sg[0] === k ? [sg[2], sg[3]] : [sg[0], sg[1]];
          if (lado) linha.push(o[1]); else linha.unshift(o[1]);
          k = o[0];
        }
      }
      if (linha.length >= 3) out.push({ z: L, pts: simplifica(linha, 0.12) });
    }
  }
  return out;
}
function simplifica(P: number[][], tol: number) {
  if (P.length < 3) return P;
  const ok = new Uint8Array(P.length); ok[0] = ok[P.length - 1] = 1;
  const pilha = [[0, P.length - 1]];
  while (pilha.length) {
    const [a, b] = pilha.pop()!;
    let m = -1, dm = tol;
    for (let i = a + 1; i < b; i++) { const d = distSeg(P[i], P[a], P[b]); if (d > dm) { dm = d; m = i; } }
    if (m > 0) { ok[m] = 1; pilha.push([a, m], [m, b]); }
  }
  return P.filter((_p, i) => ok[i]);
}

/* ---------- camadas da prefeitura (GeoSampa por WFS; GeoSanja pelo GetFeatureInfo), recortadas no quadro ---------- */
const TOPO_SP: [string, string][] = [['lote_cidadao', 'LOTES'], ['quadra_viaria_editada', 'QUADRAS'], ['calcada', 'CALCADAS'], ['v_logradouro_segmento', 'EIXO_VIAS'], ['edificacao_v3', 'EDIFICACOES'],
  ['drenagem', 'CORREGOS'], ['hidrografia_poligono_v2', 'MASSA_DAGUA'], ['massa_d_agua', 'MASSA_DAGUA'], ['represa_v2', 'MASSA_DAGUA'], ['geoconvias_lei_melhoramento_vigente', 'MELHORAMENTO_VIARIO']];
const TOPO_SJC: [string, string][] = [['arruamentos', 'EIXO_VIAS'], ['anexo_16', 'CURSO_DAGUA_FAIXA'], ['curva_igc_1_1000', 'CURVAS_PREFEITURA']];
async function camadas(base: string | null, bb: number[], l0: number) {
  const out: Record<string, any[]> = {}, erros: string[] = [];
  if (base === 'geosampa' && GEO_BASE) await Promise.all(TOPO_SP.map(async ([c, ly]) => {
    try { const fs = await geoWfs({ typeNames: 'geoportal:' + c, bbox: bb.join(',') + ',urn:ogc:def:crs:EPSG::31983', count: '3000' }); (out[ly] = out[ly] || []).push(...fs.filter((f) => f.geometry).map((f) => ({ g: f.geometry, p: f.properties, c }))); }
    catch { erros.push(c); }
  }));
  if (base === 'geosanja' && GSJ_BASE) {
    const a = utmLatLng(bb[0], bb[1], l0), b = utmLatLng(bb[2], bb[3], l0), bbg = [a[1], a[0], b[1], b[0]];
    await Promise.all(TOPO_SJC.map(async ([c, ly]) => {
      try { const fs = await gsjInfoBB(c, bbg); (out[ly] = out[ly] || []).push(...fs.filter((f) => f.geometry).map((f) => ({ g: geoMapa(f.geometry, ([x, y]) => latLngUtm(y, x, l0)), p: f.properties, c }))); }
      catch { erros.push(c); }
    }));
  }
  Object.keys(out).forEach((ly) => { out[ly] = out[ly].map((f) => ({ ...f, g: recorte(f.g, bb) })).filter((f) => f.g); });
  /* córrego canalizado (trecho fechado) vai para outra layer, tracejada */
  if (out.CORREGOS) {
    const can = (f: any) => /fechado|subterr/i.test((f.p.nm_tipo_trecho || '') + (f.p.nm_tipo_curso_hidrografia || ''));
    out.CORREGOS_CANALIZADOS = out.CORREGOS.filter(can); out.CORREGOS = out.CORREGOS.filter((f) => !can(f));
  }
  return { camadas: out, erros };
}
/** largura da via: do meio do eixo, uma perpendicular para cada lado até as calçadas; a primeira borda é o meio-fio e a segunda, o alinhamento */
function larguras(cam: Record<string, any[]>, P: number[][][]) {
  const eixos = cam.EIXO_VIAS || [], calc = (cam.CALCADAS || []).flatMap((f) => geoAneis(f.g)), res: any[] = [];
  if (!calc.length) return res;
  const corta = (o: number[], d: number[], a: number[], b: number[]) => {
    const ex = b[0] - a[0], ey = b[1] - a[1], den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den, u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
    return t > 0 && u >= 0 && u <= 1 ? t : null;
  };
  const lado = (o: number[], d: number[]) => { const ts: number[] = []; calc.forEach((r) => r.forEach((p, i) => { const t = corta(o, d, p, r[(i + 1) % r.length]); if (t != null && t < 40) ts.push(t); })); return ts.sort((a, b) => a - b); };
  const perto = (pt: number[]) => Math.min(...P.flatMap((r) => r.map((p, i) => distSeg(pt, p, r[(i + 1) % r.length]))));
  for (const e of eixos) {
    const L = geoAneis(e.g)[0];
    if (!L || L.length < 2) continue;
    const comp = L.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - L[i][0], p[1] - L[i][1]), 0);
    if (comp < 15) continue;
    let acc = 0, o: number[] | null = null, dir: number[] | null = null;
    for (let i = 1; i < L.length; i++) {
      const sg = Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]);
      if (acc + sg >= comp / 2) { const f = (comp / 2 - acc) / sg; o = [L[i - 1][0] + f * (L[i][0] - L[i - 1][0]), L[i - 1][1] + f * (L[i][1] - L[i - 1][1])]; dir = [(L[i][0] - L[i - 1][0]) / sg, (L[i][1] - L[i - 1][1]) / sg]; break; }
      acc += sg;
    }
    if (!o || !dir || perto(o) > TOPO_FOLGA + 10) continue;
    const n = [-dir[1], dir[0]], a = lado(o, n), b = lado(o, [-n[0], -n[1]]);
    if (a.length < 2 || b.length < 2) continue;
    /* meio-fio dos dois lados a distâncias parecidas do eixo e calçadas de 0,8 a 8 m; senão, a medida não é confiável */
    const leito = a[0] + b[0], via = a[1] + b[1], ca = a[1] - a[0], cb = b[1] - b[0];
    if (leito < 4 || via > 60 || ca < 0.8 || cb < 0.8 || ca > 8 || cb > 8 || Math.max(a[0], b[0]) > 2.2 * Math.min(a[0], b[0])) continue;
    res.push({ o, dir, leito, via, ca, cb, nome: nomeVia(e.p) });
  }
  return res;
}
/** recorte no retângulo: polígonos por Sutherland-Hodgman, linhas em pedaços */
function recorte(g: any, bb: number[]) {
  const dentro = (p: number[]) => p[0] >= bb[0] && p[0] <= bb[2] && p[1] >= bb[1] && p[1] <= bb[3];
  if (/Polygon/.test(g.type)) {
    const lados: [number, number, number][] = [[0, 1, bb[0]], [0, -1, bb[2]], [1, 1, bb[1]], [1, -1, bb[3]]], an: number[][][] = [];
    for (const r0 of geoAneis(g)) {
      let r = r0;
      for (const [e, sg, v] of lados) {
        const ok = (p: number[]) => sg * (p[e] - v) >= 0, n: number[][] = [];
        r.forEach((p, i) => { const q = r[(i + 1) % r.length]; if (ok(p)) n.push(p); if (ok(p) !== ok(q)) { const t = (v - p[e]) / (q[e] - p[e]); n.push([p[0] + t * (q[0] - p[0]), p[1] + t * (q[1] - p[1])]); } });
        r = n;
        if (!r.length) break;
      }
      if (r.length >= 3) an.push(r);
    }
    return an.length ? { type: 'MultiPolygon', coordinates: an.map((r) => [r]) } : null;
  }
  const out: number[][][] = [];
  for (const L of geoAneis(g)) {
    let cur: number[][] = [];
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (dentro(p)) { if (!cur.length && i > 0) cur.push(L[i - 1]); cur.push(p); } else if (cur.length) { cur.push(p); out.push(cur); cur = []; }
    }
    if (cur.length > 1) out.push(cur);
  }
  return out.length ? { type: 'MultiLineString', coordinates: out } : null;
}

/* ---------- imagem por trás: o satélite do Google; senão a ortofoto da prefeitura ---------- */
const bitmap = async (u: string | URL) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) throw new Error('imagem ' + r.status);
  return createImageBitmap(await r.blob());
};
/** WMS em pedaços de até 4.000 px (o servidor recusa imagem maior), montados num canvas */
async function wmsPedacos(base: string, ly: string, bb: number[], w: number, h: number, epsg: number, extra: Record<string, string> = {}) {
  const nx = Math.ceil(w / 4000), ny = Math.ceil(h / 4000), cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!, tw = Math.ceil(w / nx), th = Math.ceil(h / ny), sx = (bb[2] - bb[0]) / w, sy = (bb[3] - bb[1]) / h;
  await Promise.all(Array.from({ length: nx * ny }, async (_v, k) => {
    const i = k % nx, j = Math.floor(k / nx), pw = Math.min(tw, w - i * tw), ph = Math.min(th, h - j * th), u = new URL(base);
    const q: Record<string, string | number> = { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: ly, STYLES: '', SRS: 'EPSG:' + epsg,
      BBOX: [bb[0] + i * tw * sx, bb[3] - (j * th + ph) * sy, bb[0] + (i * tw + pw) * sx, bb[3] - j * th * sy].join(','), WIDTH: pw, HEIGHT: ph, FORMAT: 'image/jpeg', ...extra };
    Object.entries(q).forEach(([a, v]) => u.searchParams.set(a, String(v)));
    g.drawImage(await bitmap(u), i * tw, j * th);
  }));
  return cv;
}
async function imagem(base: string | null, bb: number[], w: number, h: number, l0: number, epsg: number): Promise<{ img: CanvasImageSource | null; fonte: string }> {
  /* o satélite do Google com os nomes das ruas (híbrido) vem primeiro, para reconhecer as ruas e a vizinhança (pedido do Moises,
     10/nov/2026); a ortofoto da prefeitura, mais nítida mas sem nomes, fica se o Google falhar */
  if (GMAPS_KEY) try { return await imgGoogle(bb, w, h, l0); } catch (e) { console.warn('Google Maps Static indisponível', e); }
  if (base === 'geosampa' && GEO_BASE && epsg === 31983) {
    try { return { img: await wmsPedacos(GEO_BASE + 'ows', 'Orto_IGC_2023', bb, w, h, epsg), fonte: 'Ortofoto 2023/2024 da Prefeitura de São Paulo (GeoSampa)' }; }
    catch (e) { console.warn('ortofoto do GeoSampa', e); }
  }
  if (base === 'geosanja' && GSJ_BASE && epsg === 31983) {
    try { return { img: await wmsPedacos(GSJ_BASE + 'proxy', 'geoSJC:pm_sjc_ortomosaico_8cm_nov25', bb, w, h, epsg, { authToken: await gsjToken() }), fonte: 'Ortofoto 8 cm (nov/2025) da Prefeitura de São José dos Campos (GeoSanja)' }; }
    catch (e) { console.warn('ortofoto do GeoSanja', e); }
  }
  return { img: null, fonte: 'Sem imagem de fundo (o Google não respondeu)' };
}
/** uma imagem do Maps Static (até 1280 px) no nível que cabe; os cantos levados ao UTM fazem o ajuste (afim) ao quadro */
async function imgGoogle(bb: number[], w: number, h: number, l0: number) {
  const c = utmLatLng((bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2, l0), a = utmLatLng(bb[0], bb[1], l0), b = utmLatLng(bb[2], bb[3], l0);
  const merc = (la: number, lo: number, z: number) => { const s = 256 * 2 ** z, y = Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)); return [((lo + 180) / 360) * s, ((1 - y / Math.PI) / 2) * s]; };
  let z = 21;
  while (z > 10) { const p = merc(a[0], a[1], z), q = merc(b[0], b[1], z); if (Math.abs(q[0] - p[0]) < 620 && Math.abs(q[1] - p[1]) < 620) break; z--; }
  const im = await bitmap(`https://maps.googleapis.com/maps/api/staticmap?center=${c[0].toFixed(7)},${c[1].toFixed(7)}&zoom=${z}&size=640x640&scale=2&maptype=hybrid&key=${GMAPS_KEY}`);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!, m0 = merc(c[0], c[1], z), px = (la: number, lo: number) => { const m = merc(la, lo, z); return [(m[0] - m0[0]) * 2 + 640, (m[1] - m0[1]) * 2 + 640]; };
  const Q = [[bb[0], bb[3], 0, 0], [bb[2], bb[3], w, 0], [bb[0], bb[1], 0, h]].map(([x, y, X, Y]) => [...px(...utmLatLng(x, y, l0)), X, Y]);
  const [[u0, v0, X0, Y0], [u1, v1, X1, Y1], [u2, v2, X2, Y2]] = Q, det = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0);
  const A = ((X1 - X0) * (v2 - v0) - (X2 - X0) * (v1 - v0)) / det, C = ((X2 - X0) * (u1 - u0) - (X1 - X0) * (u2 - u0)) / det;
  const B = ((Y1 - Y0) * (v2 - v0) - (Y2 - Y0) * (v1 - v0)) / det, D = ((Y2 - Y0) * (u1 - u0) - (Y1 - Y0) * (u2 - u0)) / det;
  g.setTransform(A, B, C, D, X0 - A * u0 - C * v0, Y0 - B * u0 - D * v0); g.drawImage(im, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0);
  return { img: cv, fonte: 'Imagem de satélite do Google, com os nomes das ruas' };
}

/* ---------- folha: A3 deitada a 160 dpi, mapa à esquerda, legenda e dados à direita ---------- */
const PAPEIS: [string, number, number][] = [['A3', 420, 297], ['A2', 594, 420], ['A1', 841, 594], ['A0', 1189, 841]];
const pagina = ([papel, wmm, hmm]: [string, number, number]) => ({ papel, w: Math.round((wmm / 25.4) * DPI), h: Math.round((hmm / 25.4) * DPI), pw: (wmm / 25.4) * 72, ph: (hmm / 25.4) * 72, m: 44, lat: 640 });
const ESCALAS = [200, 250, 500, 750, 1000, 1250, 1500, 2000, 2500, 3000, 4000, 5000, 7500, 10000, 15000, 20000];
/** quadro do mapa. Sem escala dada: A3 e a maior escala padrão que cabe. Com escala dada (quadra inteira sem SQL, na escala do
 *  terreno): a menor folha em que cabe nessa escala; se nem o A0 couber, A0 na maior escala que caiba (decisão do Moisés, 27/out/2026) */
function quadroDe(lev: number[], escDada?: number) {
  const mm = (px: number) => (px / DPI) * 25.4, cx = (lev[0] + lev[2]) / 2, cy = (lev[1] + lev[3]) / 2;
  const dim = (pg: ReturnType<typeof pagina>) => [pg.w - 2 * pg.m - pg.lat - 28, pg.h - 2 * pg.m];
  const cabe = (pg: ReturnType<typeof pagina>, e: number) => { const [fw, fh] = dim(pg); return (mm(fw) * e) / 1000 >= lev[2] - lev[0] + 16 && (mm(fh) * e) / 1000 >= lev[3] - lev[1] + 16; };
  let pag = pagina(PAPEIS[0]), esc: number;
  if (escDada) {
    const p = PAPEIS.map(pagina).find((pg) => cabe(pg, escDada));
    if (p) { pag = p; esc = escDada; } else { pag = pagina(PAPEIS[PAPEIS.length - 1]); esc = ESCALAS.find((e) => e >= escDada && cabe(pag, e)) || ESCALAS[ESCALAS.length - 1]; }
  } else esc = ESCALAS.find((e) => cabe(pag, e)) || ESCALAS[ESCALAS.length - 1];
  const [fw, fh] = dim(pag), gw = (mm(fw) * esc) / 1000, gh = (mm(fh) * esc) / 1000, wi = Math.min(pag.papel === 'A3' ? 4000 : 8000, Math.round(fw * 1.4));
  return { bb: [cx - gw / 2, cy - gh / 2, cx + gw / 2, cy + gh / 2], esc, pag, fx: pag.m, fy: pag.m, fw, fh, wi, hi: Math.round((wi * fh) / fw) };
}
const MM = (mm: number) => (mm / 25.4) * DPI;
const COR = { lwT: MM(2), lwI: MM(0.75), lwM: MM(1), casca: 'rgba(0,0,0,.85)', terreno: '#00e5ff', folga: '#ffffff', inter: ['#00b81f', '#1ee81e', '#5cff3a', '#b2ff73'], mestra: '#b026ff', eixo: 'rgba(255,255,255,.9)', faixa: '#7fd3ff', curvaPref: 'rgba(255,170,60,.7)', lote: 'rgba(255,255,255,.75)',
  calc: 'rgba(77,208,225,.8)', quadra: 'rgba(255,255,255,.75)', loteSp: 'rgba(255,255,255,.3)', loteq: 'rgba(255,255,255,.8)', corrego: '#2f8cff', agua: 'rgba(47,140,255,.35)', melh: '#ff4fd8' };
/** intermediárias em tons: a mais alta entre duas mestras a mais escura, a mais baixa a mais clara (Moisés, 27/out/2026); 0 a 3 */
const tomInter = (z: number, R: any) => { const n = Math.max(1, Math.round(R.mestra / R.iv) - 1), k = (((Math.round(z / R.iv) % (n + 1)) + n + 1) % (n + 1)); return n < 2 ? 0 : Math.round(((n - k) * 3) / (n - 1)); };
/** "41.0024.0011.0000" → "0011" (com o sublote: "0011.0002"): a quadra vai na legenda */
const rotLote = (ic: string) => { const s = String(ic).split('.'); return s.length === 4 ? (s[3] !== '0000' ? `${s[2]}.${s[3]}` : s[2]) : String(ic); };
/** nome da via: os campos do GeoSampa (tipo, título, preposição, nome) ou os do GeoSanja */
const nomeVia = (p: any) => (p ? nomeViaSp(p) || String(p.nome_logra || p.logradouro || p.nome || p.rotulo || '').trim() : '');
type Fz = { fonte: 'laser'; folhas: string[] } | { fonte: 'google'; n: number; res: number };
const fonteTxt = (fz: Fz) => fz.fonte === 'laser'
  ? `Laser 2020 da Prefeitura de São Paulo (MDT 1:1000, folha${fz.folhas.length > 1 ? 's' : ''} ${fz.folhas.join(', ')}); diferença típica de 0,2 m nas cotas de esquina da prefeitura`
  : `Google Elevation, ${num(fz.n)} pontos a cada ${PASSO_G} m; grade de origem de ${num(fz.res, 1)} m e erro típico de 3 a 4 m`;
const levTxt = (R: any) => (R.PB !== R.P ? (R.qd.n > 1 ? `As ${R.qd.n} quadras que o terreno ocupa, inteiras` : 'A quadra do terreno inteira') + ` (${R.qd.lotes.length} lotes)` + (R.qd.grandes ? ' e o contorno na parte em quadra grande demais (acima de 6 ha)' : '') : 'Contorno') + ` + ${TOPO_FOLGA} m em volta`;

function desenharPagina(R: any) {
  const Q = R.quadro, { w, h } = Q.pag, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!, F = '"Google Sans Flex", Arial, sans-serif';
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
  const X = (x: number) => Q.fx + ((x - Q.bb[0]) / (Q.bb[2] - Q.bb[0])) * Q.fw, Y = (y: number) => Q.fy + ((Q.bb[3] - y) / (Q.bb[3] - Q.bb[1])) * Q.fh, pxm = Q.fw / (Q.bb[2] - Q.bb[0]);
  g.save(); g.beginPath(); g.rect(Q.fx, Q.fy, Q.fw, Q.fh); g.clip(); g.fillStyle = '#2b2b2b'; g.fillRect(Q.fx, Q.fy, Q.fw, Q.fh);
  if (R.im.img) g.drawImage(R.im.img, Q.fx, Q.fy, Q.fw, Q.fh);
  const caminho = (L: number[][][], fechar?: boolean) => { g.beginPath(); L.forEach((pts) => { pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); if (fechar) g.closePath(); }); };
  /* fora da área levantada, a imagem fica mais escura */
  g.save(); g.beginPath(); g.rect(Q.fx, Q.fy, Q.fw, Q.fh); R.folga.forEach((pts: number[][]) => { pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.closePath(); }); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill('evenodd'); g.restore();
  const linhas = (ly: string, cor: string, lw: number, dash?: number[], fill?: string) => {
    (R.cam[ly] || []).forEach((f: any) => { const an = geoAneis(f.g), pol = /Polygon/.test(f.g.type); caminho(an, pol); if (fill && pol) { g.fillStyle = fill; g.fill('evenodd'); } g.setLineDash(dash || []); g.strokeStyle = cor; g.lineWidth = lw; g.stroke(); });
    g.setLineDash([]);
  };
  linhas('LOTES', COR.loteSp, 1); linhas('LOTES_QUADRA', COR.loteq, 1.3); linhas('CALCADAS', COR.calc, 1.2, undefined, 'rgba(77,208,225,.14)'); linhas('QUADRAS', COR.quadra, 1.6);
  linhas('MELHORAMENTO_VIARIO', COR.melh, 2.4, [14, 8], 'rgba(255,79,216,.12)');
  linhas('CURSO_DAGUA_FAIXA', COR.faixa, 2, [10, 6], 'rgba(127,211,255,.12)');
  linhas('EIXO_VIAS', COR.eixo, 1.4, [18, 8, 4, 8]);
  linhas('LOTES_PREFEITURA', COR.lote, 1.2);
  linhas('MASSA_DAGUA', COR.corrego, 2, undefined, COR.agua); linhas('CORREGOS', COR.corrego, 4.5); linhas('CORREGOS_CANALIZADOS', COR.corrego, 3.5, [12, 7]);
  /* curvas: casca escura por baixo, intermediárias finas em tons, mestras grossas com a cota */
  R.curvas.forEach((c: any) => { caminho([c.pts]); g.strokeStyle = COR.casca; g.lineWidth = (c.mestra ? COR.lwM : COR.lwI) + 2.4; g.stroke(); });
  R.curvas.forEach((c: any) => { caminho([c.pts]); g.strokeStyle = c.mestra ? COR.mestra : COR.inter[tomInter(c.z, R)]; g.lineWidth = c.mestra ? COR.lwM : COR.lwI; g.stroke(); });
  caminho(R.folga); g.setLineDash([16, 10]); g.strokeStyle = COR.folga; g.lineWidth = 2.2; g.stroke(); g.setLineDash([]);
  const halo = (txt: string, x: number, y: number, ang: number, tam: number, cor: string, peso = 500) => {
    g.save(); g.translate(x, y); g.rotate(ang); g.font = `${peso} ${tam}px ${F}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.lineWidth = Math.max(3, tam / 4); g.strokeStyle = 'rgba(0,0,0,.85)'; g.strokeText(txt, 0, 0); g.fillStyle = cor; g.fillText(txt, 0, 0); g.restore();
  };
  const leg = (a: number) => { a = ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI); return a > Math.PI / 2 && a < (3 * Math.PI) / 2 ? a - Math.PI : a; };
  R.curvas.filter((c: any) => c.mestra).forEach((c: any) => {
    let acc = 90;
    for (let i = 1; i < c.pts.length; i++) {
      const a = c.pts[i - 1], b = c.pts[i], d = Math.hypot(X(b[0]) - X(a[0]), Y(b[1]) - Y(a[1]));
      acc += d;
      if (acc >= 320 && d > 8) { acc = 0; halo(num(c.z, 0), (X(a[0]) + X(b[0])) / 2, (Y(a[1]) + Y(b[1])) / 2, leg(Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0]))), 19, '#fff', 600); }
    }
  });
  /* número do lote (a quadra está na legenda) no meio de cada lote, se couber */
  (R.cam.LOTES_PREFEITURA || []).forEach((f: any) => {
    const r = geoAneis(f.g)[0]; if (!r || r.length < 3) return;
    const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]), lado = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * pxm;
    if (lado < 34) return;
    halo(rotLote(f.p.ic), X(xs.reduce((a, b) => a + b, 0) / xs.length), Y(ys.reduce((a, b) => a + b, 0) / ys.length), 0, Math.min(16, lado / 3), '#fff', 500);
  });
  const vistos = new Set<string>();
  (R.cam.EIXO_VIAS || []).forEach((f: any) => {
    const L = geoAneis(f.g)[0], nome = nomeVia(f.p);
    if (!L || !nome || L.length < 2) return;
    const m = Math.floor((L.length - 1) / 2), a = L[m], b = L[m + 1], cx = (X(a[0]) + X(b[0])) / 2, cy = (Y(a[1]) + Y(b[1])) / 2, ch = nome + Math.round(cx / 300) + Math.round(cy / 300);
    if (cx < Q.fx || cy < Q.fy || cx > Q.fx + Q.fw || cy > Q.fy + Q.fh || vistos.has(ch)) return;
    vistos.add(ch);
    halo(nome, cx, cy, leg(Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0]))), 17, '#fff', 500);
  });
  /* larguras medidas das vias */
  R.larg.forEach((v: any) => {
    const x = X(v.o[0] + v.dir[0] * 12), y = Y(v.o[1] + v.dir[1] * 12), txt = `via ${num(v.via, 1)} m · leito ${num(v.leito, 1)} m`;
    g.font = `600 16px ${F}`; const tw = g.measureText(txt).width;
    g.fillStyle = 'rgba(255,213,79,.95)'; g.fillRect(x - tw / 2 - 8, y - 14, tw + 16, 28); g.fillStyle = '#1f1f1f'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, y);
    const n = [-v.dir[1], v.dir[0]];
    g.strokeStyle = 'rgba(255,213,79,.95)'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(v.o[0] + (n[0] * v.via) / 2), Y(v.o[1] + (n[1] * v.via) / 2)); g.lineTo(X(v.o[0] - (n[0] * v.via) / 2), Y(v.o[1] - (n[1] * v.via) / 2)); g.stroke();
  });
  /* calçadas que encostam no levantamento: largura média */
  const vc = new Set<string>();
  (R.cam.CALCADAS || []).forEach((f: any) => {
    const r = geoAneis(f.g)[0], lm = f.p.qt_largura_media_trecho;
    if (!r || lm == null) return;
    const c = r.reduce((a, p) => [a[0] + p[0] / r.length, a[1] + p[1] / r.length], [0, 0]);
    if (Math.min(...R.PB.flatMap((an: number[][]) => an.map((p, i) => distSeg(c, p, an[(i + 1) % an.length])))) > 18) return;
    const k = String(f.p.cd_identificador_segmento_logradouro);
    if (vc.has(k)) return;
    vc.add(k); halo(`calçada ${num(lm, 1)} m`, X(c[0]), Y(c[1]), 0, 14, '#b2f5ff', 600);
  });
  /* número de cada lote da quadra (lote-dígito do SQL; setor e quadra vão na lateral), do tamanho que cabe nele */
  (R.cam.LOTES_QUADRA || []).forEach((l: LoteQ) => { const tam = Math.min(15, l.folga * pxm * 0.9); if (tam >= 7) halo(l.p.cd_lote + (l.p.cd_digito_sql != null ? '-' + l.p.cd_digito_sql : ''), X(l.pt[0]), Y(l.pt[1]), 0, tam, '#fff', 500); });
  /* terreno e medidas dos lados */
  caminho(R.P, true); g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = COR.lwT + 3.5; g.stroke(); g.strokeStyle = COR.terreno; g.lineWidth = COR.lwT; g.stroke();
  R.P.forEach((r: number[][]) => r.forEach((p, i) => {
    const q = r[(i + 1) % r.length], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < 3 || d * pxm < 70) return;
    g.save(); g.translate((X(p[0]) + X(q[0])) / 2, (Y(p[1]) + Y(q[1])) / 2); g.rotate(leg(Math.atan2(Y(q[1]) - Y(p[1]), X(q[0]) - X(p[0]))));
    g.font = `600 15px ${F}`; const txt = num(d, 2) + ' m', tw = g.measureText(txt).width;
    g.fillStyle = '#111'; g.fillRect(-tw / 2 - 6, -12, tw + 12, 24); g.fillStyle = COR.terreno; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, 0, 0); g.restore();
  }));
  g.restore();
  /* coordenadas UTM nas bordas */
  const passoC = [10, 20, 25, 50, 100, 200, 250, 500, 1000].find((s) => s * pxm >= 140) || 1000;
  g.font = `13px ${F}`; g.fillStyle = '#444746'; g.strokeStyle = '#1f1f1f'; g.lineWidth = 1;
  for (let x = Math.ceil(Q.bb[0] / passoC) * passoC; x < Q.bb[2]; x += passoC) { const px = X(x); g.beginPath(); g.moveTo(px, Q.fy); g.lineTo(px, Q.fy + 10); g.moveTo(px, Q.fy + Q.fh); g.lineTo(px, Q.fy + Q.fh - 10); g.stroke(); g.textAlign = 'center'; g.fillText('E ' + num(x, 0), px, Q.fy + Q.fh + 16); }
  for (let y = Math.ceil(Q.bb[1] / passoC) * passoC; y < Q.bb[3]; y += passoC) { const py = Y(y); g.beginPath(); g.moveTo(Q.fx, py); g.lineTo(Q.fx + 10, py); g.moveTo(Q.fx + Q.fw, py); g.lineTo(Q.fx + Q.fw - 10, py); g.stroke(); g.save(); g.translate(Q.fx - 8, py); g.rotate(-Math.PI / 2); g.textAlign = 'center'; g.fillText('N ' + num(y, 0), 0, 0); g.restore(); }
  g.strokeStyle = '#1f1f1f'; g.lineWidth = 2; g.strokeRect(Q.fx, Q.fy, Q.fw, Q.fh);
  lateral(g, R, F, pxm);
  return cv;
}
function lateral(g: CanvasRenderingContext2D, R: any, F: string, pxm: number) {
  const { w, h, m, lat } = R.quadro.pag, x0 = w - m - lat, t: TerrenoTopo = R.t;
  let y = m;
  const txt = (s: string, tam: number, cor = '#1f1f1f', peso = 400, lh?: number, larg?: number) => {
    g.font = `${peso} ${tam}px ${F}`; g.fillStyle = cor; g.textAlign = 'left'; g.textBaseline = 'top';
    let l = '';
    for (const p of String(s).split(' ')) { const tst = l ? l + ' ' + p : p; if (g.measureText(tst).width > (larg || lat) && l) { g.fillText(l, x0, y); y += lh || tam * 1.3; l = p; } else l = tst; }
    if (l) { g.fillText(l, x0, y); y += lh || tam * 1.3; }
  };
  txt('PLANTA TOPOGRÁFICA PRELIMINAR', 30, '#1f1f1f', 500); y += 4; txt(`${t.nome} · ${t.codigo}`, 20, '#1f1f1f', 500);
  txt(`${[t.municipio, t.uf].filter(Boolean).join(' - ')} · Área do contorno: ${num(R.area, 0)} m²`, 16, '#444746'); y += 14;
  g.fillStyle = '#c4c7c5'; g.fillRect(x0, y, lat, 1.5); y += 16;
  const kv = (k: string, v: string) => { txt(k, 13, '#5f6368', 500); y -= 2; txt(v, 15); y += 6; };
  kv('Contorno', R.resumo.contorno);
  kv('Área levantada', levTxt(R));
  if (R.qd?.lotes.length && R.PB !== R.P) kv('Lotes numerados pelo SQL', `setor e quadra fiscal ${R.qd.quadras.join(', ')}; em cada lote, o número do lote e o dígito`);
  kv('Cotas no terreno', `mínima ${num(R.dz.min, 1)} m · máxima ${num(R.dz.max, 1)} m · desnível ${num(R.dz.max - R.dz.min, 1)} m` + (R.dec != null ? ` · declividade média ${num(R.dec, 1)}%` : ''));
  kv('Fonte das cotas', fonteTxt(R.fz)); kv('Curvas de nível', `de ${R.iv} em ${R.iv} m; mestra de ${R.mestra} em ${R.mestra} m (roxa, com a cota)`);
  kv('Imagem', R.im.fonte);
  const cm = R.cam;
  const extras = R.base === 'geosampa'
    ? [cm.CALCADAS?.length && 'calçadas', cm.EIXO_VIAS?.length && 'eixos de via', R.larg.length && 'largura das vias medida entre as calçadas', (cm.CORREGOS?.length || cm.CORREGOS_CANALIZADOS?.length) && 'córregos', cm.MASSA_DAGUA?.length && "corpos d'água", cm.MELHORAMENTO_VIARIO?.length && 'melhoramento viário', (cm.LOTES?.length || cm.LOTES_QUADRA?.length) && 'lotes'].filter(Boolean)
    : [cm.LOTES_PREFEITURA?.length && `lotes da quadra ${[...new Set(cm.LOTES_PREFEITURA.map((f: any) => String(f.p.ic).slice(0, 7)))].join(', ')}`, cm.EIXO_VIAS?.length && 'eixos de via', cm.CURSO_DAGUA_FAIXA?.length && "faixa de curso d'água", cm.CURVAS_PREFEITURA?.length && 'curvas do IGC 1:10.000 (só no DXF)'].filter(Boolean);
  if (extras.length) kv(R.base === 'geosampa' ? 'Do GeoSampa' : 'Do GeoSanja', extras.join(', ').replace(/^./, (c) => c.toUpperCase()));
  kv('Coordenadas', `SIRGAS 2000 / UTM ${R.zona}S (EPSG:${R.epsg}); cotas em metros, altitude ortométrica`);
  y += 4; g.fillStyle = '#c4c7c5'; g.fillRect(x0, y, lat, 1.5); y += 16; txt('Legenda', 16, '#1f1f1f', 500); y += 4;
  const fundo = '#5d6b63';
  const item = (desenho: () => void, rot: string) => { g.save(); g.translate(x0, y + 9); g.fillStyle = fundo; g.fillRect(0, -9, 44, 18); desenho(); g.restore(); g.font = `14px ${F}`; g.fillStyle = '#1f1f1f'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(rot, x0 + 56, y + 9); y += 26; };
  const traco = (cor: string, lw: number, dash?: number[]) => () => { g.setLineDash(dash || []); g.strokeStyle = cor; g.lineWidth = lw; g.beginPath(); g.moveTo(0, 0); g.lineTo(44, 0); g.stroke(); g.setLineDash([]); };
  item(() => { g.strokeStyle = COR.terreno; g.lineWidth = 6; g.strokeRect(4, -5, 36, 10); }, 'Terreno (contorno)');
  item(traco(COR.folga, 2, [8, 5]), `Limite do levantamento (${TOPO_FOLGA} m)`);
  item(() => { traco(COR.casca, COR.lwM + 2.4)(); traco(COR.mestra, COR.lwM)(); }, `Curva mestra (${R.mestra} m)`);
  item(() => { traco(COR.casca, COR.lwI + 2.4)(); COR.inter.forEach((c, i, a) => { g.save(); g.beginPath(); g.rect((i * 44) / a.length, -9, 44 / a.length, 18); g.clip(); traco(c, COR.lwI)(); g.restore(); }); }, `Curvas intermediárias (${R.iv} m; mais alta escura, mais baixa clara)`);
  if (cm.CALCADAS?.length) item(() => { g.fillStyle = 'rgba(77,208,225,.35)'; g.fillRect(4, -6, 36, 12); g.strokeStyle = COR.calc; g.lineWidth = 1.6; g.strokeRect(4, -6, 36, 12); }, 'Calçada');
  if (cm.QUADRAS?.length) item(traco(COR.quadra, 1.6), 'Alinhamento da quadra');
  if (cm.LOTES_PREFEITURA?.length) item(traco(COR.lote, 1.2), 'Lotes da quadra (número do lote)');
  if (cm.EIXO_VIAS?.length) item(traco(COR.eixo, 1.4, [10, 4, 3, 4]), 'Eixo da via');
  if (cm.LOTES_QUADRA?.length) item(traco(COR.loteq, 1.4), 'Lotes da quadra (número = lote-dígito do SQL)');
  if (cm.LOTES?.length) item(traco(COR.loteSp, 1.2), cm.LOTES_QUADRA?.length ? 'Outros lotes' : 'Lotes');
  if (cm.CORREGOS?.length) item(traco(COR.corrego, 4.5), 'Córrego a céu aberto');
  if (cm.CORREGOS_CANALIZADOS?.length) item(traco(COR.corrego, 3.5, [10, 6]), 'Córrego canalizado');
  if (cm.MASSA_DAGUA?.length) item(() => { g.fillStyle = COR.agua; g.fillRect(0, -8, 44, 16); g.strokeStyle = COR.corrego; g.lineWidth = 2; g.strokeRect(0, -8, 44, 16); }, "Corpo d'água");
  if (cm.MELHORAMENTO_VIARIO?.length) item(traco(COR.melh, 2.4, [10, 6]), 'Melhoramento viário (lei)');
  if (cm.CURSO_DAGUA_FAIXA?.length) item(traco(COR.faixa, 2, [10, 6]), "Faixa de curso d'água (PDDI)");
  if (R.larg.length) item(() => { g.fillStyle = 'rgba(255,213,79,.95)'; g.fillRect(0, -9, 44, 18); }, 'Largura da via e do leito (medida)');
  /* escala, norte, aviso e data no pé da coluna */
  let yb = h - m - 250;
  g.fillStyle = '#c4c7c5'; g.fillRect(x0, yb, lat, 1.5); yb += 18;
  g.font = `500 16px ${F}`; g.fillStyle = '#1f1f1f'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(`Escala 1:${num(R.quadro.esc)} (impressão em ${R.quadro.pag.papel})`, x0, yb); yb += 30;
  const L = [5, 10, 20, 25, 50, 100, 200, 250, 500].find((s) => s * pxm >= (lat * 0.5) / 4) || 500;
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#fff' : '#1f1f1f'; g.fillRect(x0 + i * L * pxm, yb, L * pxm, 10); }
  g.strokeStyle = '#1f1f1f'; g.lineWidth = 1; g.strokeRect(x0, yb, 4 * L * pxm, 10);
  g.font = `13px ${F}`; g.fillStyle = '#1f1f1f'; g.textAlign = 'center'; for (let i = 0; i <= 4; i++) g.fillText(num(i * L) + (i === 4 ? ' m' : ''), x0 + i * L * pxm, yb + 16);
  const nx = x0 + lat - 40, ny = yb - 28;
  g.beginPath(); g.moveTo(nx, ny - 34); g.lineTo(nx + 14, ny + 10); g.lineTo(nx, ny); g.closePath(); g.fillStyle = '#1f1f1f'; g.fill();
  g.beginPath(); g.moveTo(nx, ny - 34); g.lineTo(nx - 14, ny + 10); g.lineTo(nx, ny); g.closePath(); g.strokeStyle = '#1f1f1f'; g.lineWidth = 1.5; g.stroke();
  g.font = `600 16px ${F}`; g.fillText('N', nx, ny - 58); yb += 48;
  g.fillStyle = '#fff6e0'; g.fillRect(x0, yb, lat, 128); g.strokeStyle = '#e8c66d'; g.strokeRect(x0, yb, lat, 128); y = yb + 12;
  g.save(); g.translate(14, 0);
  txt('Levantamento preliminar, gerado automaticamente para estudo de viabilidade. Não substitui o levantamento planialtimétrico cadastral feito por profissional habilitado (ART/RRT). Distâncias e cotas podem divergir das medidas de campo.', 14, '#5c4300', 400, 19, lat - 28);
  g.restore();
  g.font = `13px ${F}`; g.fillStyle = '#5f6368'; g.textAlign = 'left'; g.textBaseline = 'top';
  g.fillText(`BKM Terrenos · gerado em ${R.em.toLocaleDateString('pt-BR')} ${R.em.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} por ${R.quem}`, x0, h - m - 6);
}
function pdfDe(pags: { w: number; h: number; jpg: Uint8Array }[], pw: number, ph: number) {
  const enc = new TextEncoder(), partes: Uint8Array[] = [], offs: number[] = [];
  let n = 0;
  const add = (x: string | Uint8Array) => { const b = typeof x === 'string' ? enc.encode(x) : x; partes.push(b); n += b.length; };
  const W = pw.toFixed(2), H = ph.toFixed(2), obj = (i: number, o: string) => { offs[i - 1] = n; add(`${i} 0 obj\n${o}\nendobj\n`); }, k = pags.length;
  add('%PDF-1.4\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>'); obj(2, `<< /Type /Pages /Kids [${pags.map((_p, i) => `${3 + 3 * i} 0 R`).join(' ')}] /Count ${k} >>`);
  pags.forEach((p, i) => {
    const a = 3 + 3 * i, cont = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
    obj(a, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${a + 1} 0 R >> >> /Contents ${a + 2} 0 R >>`);
    offs[a] = n; add(`${a + 1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`); add(p.jpg); add('\nendstream\nendobj\n');
    obj(a + 2, `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`);
  });
  const x = n, tot = 3 + 3 * k;
  add(`xref\n0 ${tot}\n0000000000 65535 f \n${offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${tot} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF\n`);
  return new Blob(partes as BlobPart[], { type: 'application/pdf' });
}

/* ---------- DXF 2000 a partir do modelo (tools/prototipo/topo_dxf_modelo.py) + imagem ao lado, num ZIP ---------- */
function dxfDe(R: any, arqImg: string, wi: number, hi: number) {
  const asc = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[^\x20-\x7e]/g, ''), f = (v: number) => (+v).toFixed(3), L: string[] = [];
  let hnd = 0x100;
  const ent = (tipo: string, ly: string, sub: string, pares: string[]) => { L.push('0', tipo, '5', (hnd++).toString(16).toUpperCase(), '330', '17', '100', 'AcDbEntity', '8', ly, '100', sub, ...pares); };
  const poli = (ly: string, pts: number[][], fech: boolean, z = 0) => { if (pts.length < 2) return; ent('LWPOLYLINE', ly, 'AcDbPolyline', ['90', String(pts.length), '70', fech ? '1' : '0', '38', f(z || 0), ...pts.flatMap((p) => ['10', f(p[0]), '20', f(p[1])])]); };
  const texto = (ly: string, x: number, y: number, alt: number, s: string, rot = 0) => ent('TEXT', ly, 'AcDbText', ['10', f(x), '20', f(y), '30', '0', '40', f(alt), '1', asc(s), '50', f(rot), '7', 'BKM', '72', '1', '11', f(x), '21', f(y), '31', '0', '100', 'AcDbText', '73', '2']);
  const angLeg = (a: number[], b: number[]) => { let ang = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI; if (ang > 90 || ang < -90) ang += 180; return ang; };
  R.P.forEach((r: number[][]) => poli('TERRENO', r, true)); R.folga.forEach((p: number[][]) => poli('FOLGA_30M', p, false));
  R.P.forEach((r: number[][]) => r.forEach((p, i) => { const q = r[(i + 1) % r.length], d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < 3) return; texto('MEDIDAS', (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, 1, num(d, 2) + ' m', angLeg(p, q)); }));
  /* curvas com a cota como elevação e o texto da cota; com cotas do Google, sem a malha de pontos */
  R.curvas.forEach((c: any) => {
    poli(c.mestra ? 'CURVA_MESTRA' : 'CURVA_INTERMEDIARIA_' + (tomInter(c.z, R) + 1), c.pts, false, c.z);
    if (c.pts.length > 4) { const m = Math.floor(c.pts.length / 2), a = c.pts[m - 1], b = c.pts[m]; texto('COTA_CURVA', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, c.mestra ? 1.2 : 0.8, num(c.z, 0), angLeg(a, b)); }
  });
  /* pontos cotados só do laser: os do Google não são guardados */
  const G = R.G, k = Math.round(PASSO_G / G.s);
  if (R.fz.fonte === 'laser') for (let j = 0; j < G.ny; j += k) for (let i = 0; i < G.nx; i += k) { const z = G.Z[j * G.nx + i]; if (z === z) ent('POINT', 'MALHA_COTAS', 'AcDbPoint', ['10', f(G.x0 + i * G.s), '20', f(G.y0 + j * G.s), '30', f(z)]); }
  Object.entries(R.cam as Record<string, any[]>).forEach(([ly, fs]) => fs.forEach((ft) => {
    const pol = /Polygon/.test(ft.g.type), z = ly === 'CURVAS_PREFEITURA' ? ft.p.avg_z : 0;
    geoAneis(ft.g).forEach((r) => poli(ly, pol && r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r, pol, z));
  }));
  (R.cam.LOTES_PREFEITURA || []).forEach((ft: any) => { const r = geoAneis(ft.g)[0]; if (!r || r.length < 3) return; texto('TEXTO_LOTES', r.reduce((a, p) => a + p[0], 0) / r.length, r.reduce((a, p) => a + p[1], 0) / r.length, 0.8, ft.p.ic); });
  (R.cam.LOTES_QUADRA || []).forEach((l: LoteQ) => texto('NUMERO_LOTES', l.pt[0], l.pt[1], Math.max(0.4, Math.min(1.2, l.folga * 0.25)), l.sql));
  R.larg.forEach((v: any) => {
    const n = [-v.dir[1], v.dir[0]];
    poli('LARGURA_VIAS', [[v.o[0] + (n[0] * v.via) / 2, v.o[1] + (n[1] * v.via) / 2], [v.o[0] - (n[0] * v.via) / 2, v.o[1] - (n[1] * v.via) / 2]], false);
    texto('LARGURA_VIAS', v.o[0] + v.dir[0] * 6, v.o[1] + v.dir[1] * 6, 1.2, `via ${num(v.via, 1)} m / leito ${num(v.leito, 1)} m`, angLeg([0, 0], n));
  });
  (R.cam.EIXO_VIAS || []).forEach((ft: any) => { const Lh = geoAneis(ft.g)[0], n = nomeVia(ft.p); if (!Lh || !n || Lh.length < 2) return; const m = Math.floor((Lh.length - 1) / 2), a = Lh[m], b = Lh[m + 1]; texto('TEXTO_VIAS', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 2, n, angLeg(a, b)); });
  const Q = R.quadro.bb, ps = (Q[2] - Q[0]) / wi, psy = (Q[3] - Q[1]) / hi;
  let s = MODELO;
  s = s.replace('911111.25', f(Q[0])).replace('922222.25', f(Q[1])).replace('\n 11\n0.125\n', `\n 11\n${ps.toFixed(6)}\n`).replace('\n 22\n0.125\n', `\n 22\n${psy.toFixed(6)}\n`)
    .replace(/7771\.0/g, wi + '.0').replace(/7772\.0/g, hi + '.0').replace('\n7770.5\n', `\n${wi - 0.5}\n`).replace('\n7771.5\n', `\n${hi - 0.5}\n`).replace(/__IMAGEM__\.jpg/g, arqImg)
    .replace(/\$EXTMIN\n 10\n[^\n]+\n 20\n[^\n]+\n 30\n[^\n]+/, `$EXTMIN\n 10\n${f(Q[0])}\n 20\n${f(Q[1])}\n 30\n0.0`).replace(/\$EXTMAX\n 10\n[^\n]+\n 20\n[^\n]+\n 30\n[^\n]+/, `$EXTMAX\n 10\n${f(Q[2])}\n 20\n${f(Q[3])}\n 30\n0.0`)
    .replace('977777.25', f((Q[0] + Q[2]) / 2)).replace('988888.25', f((Q[1] + Q[3]) / 2)).replace('99999.25', f((Q[3] - Q[1]) * 1.05));
  if (!R.im.img) s = s.replace(/\n {2}0\nIMAGE\n[\s\S]*?(?=\n {2}0\nENDSEC)/, '');
  const i = s.indexOf('\nENTITIES\n'), j = s.indexOf('\n  0\nENDSEC\n', i);
  s = s.slice(0, j) + '\n' + L.join('\n') + s.slice(j);
  return s.replace(/(\$HANDSEED\n {2}5\n)[0-9A-F]+/, '$1' + hnd.toString(16).toUpperCase()).replace(/\n/g, '\r\n');
}
async function zipDe(R: any, nome: string, pdf: Blob) {
  const Q = R.quadro, z = new JSZip(), arqImg = nome + '_imagem.jpg', wi = Q.wi, hi = Q.hi;
  z.file(nome + '.pdf', pdf);
  if (R.im.img) {
    const c = document.createElement('canvas'); c.width = wi; c.height = hi; c.getContext('2d')!.drawImage(R.im.img, 0, 0, wi, hi);
    z.file(arqImg, await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/jpeg', 0.9)));
    const ps = (Q.bb[2] - Q.bb[0]) / wi, py = (Q.bb[3] - Q.bb[1]) / hi;
    z.file(nome + '_imagem.jgw', [ps, 0, 0, -py, Q.bb[0] + ps / 2, Q.bb[3] - py / 2].map((v) => v.toFixed(6)).join('\r\n') + '\r\n');
  }
  z.file(nome + '.dxf', dxfDe(R, arqImg, wi, hi));
  z.file('LEIA-ME.txt', [`Topografico preliminar - ${R.t.codigo}`, '', `${nome}.dxf: DXF 2000 em SIRGAS 2000 / UTM ${R.zona}S (EPSG:${R.epsg}), em metros.`,
    R.fz.fonte === 'laser'
      ? '  Curvas com a cota como elevacao (CURVA_MESTRA; CURVA_INTERMEDIARIA_1 a _4, da mais escura, a mais alta, a mais clara, a mais baixa; COTA_CURVA), malha de pontos cotados a cada 5 m (MALHA_COTAS),'
      : '  Curvas com a cota como elevacao e o texto da cota em cada uma (CURVA_MESTRA; CURVA_INTERMEDIARIA_1 a _4, da mais escura, a mais alta, a mais clara, a mais baixa; COTA_CURVA); sem os pontos do Google,',
    R.base === 'geosampa'
      ? '  terreno, limite do levantamento (30 m) e as camadas da prefeitura (lotes, quadras, calcadas, eixos, edificacoes, corregos, melhoramentos, larguras das vias).'
      : '  terreno, limite do levantamento (30 m) e as camadas da prefeitura, quando houver (eixos, faixas de curso d agua, curvas do IGC).',
    R.cam.LOTES_QUADRA?.length ? '  Lotes da quadra em LOTES_QUADRA, com o SQL de cada um em NUMERO_LOTES.' : '',
    `${nome}.pdf: a planta para imprimir (a mesma do botao PDF).`,
    R.im.img ? `${arqImg}: imagem de fundo, referenciada pelo DXF. Deixe os dois na mesma pasta.` : 'Sem imagem de fundo.',
    '', 'No AutoCAD: abra o DXF e use Salvar como > DWG. A imagem continua como arquivo a parte (o AutoCAD nunca guarda imagem dentro do DWG);',
    'para enviar, use eTransmit, que junta o DWG e a imagem.', '', `Fonte das cotas: ${fonteTxt(R.fz).normalize('NFD').replace(/[^\x20-\x7e]/g, '')}`,
    'Levantamento preliminar para estudo: nao substitui o levantamento planialtimetrico feito por profissional habilitado.'].join('\r\n'));
  return z.generateAsync({ type: 'blob' });
}

/** gera o topográfico; passo(texto) abre uma etapa nova, av(texto) detalha a etapa em andamento */
export async function gerarTopografico(t: TerrenoTopo, quem: string, passo: Passo, av: Passo): Promise<Resultado> {
  const { data: b } = t.municipioId ? await supabase.from('bases_cadastrais').select('codigo').eq('municipio_id', t.municipioId).maybeSingle() : { data: null };
  const base = (b as any)?.codigo ?? null;
  passo('Contorno do terreno');
  const ct = await contorno(t, base);
  if (!ct) throw new Error('o terreno não tem poligonal nem lote da prefeitura.');
  const c0 = centroPoly(ct.polys[0]), zona = Math.floor((c0[1] + 180) / 6) + 1, l0 = -183 + 6 * zona, epsg = 31960 + zona;
  const P = ct.polys.map((r) => r.map(([la, lo]) => latLngUtm(la, lo, l0) as number[]));
  const sp = base === 'geosampa' && epsg === 31983;
  if (base === 'geosampa' && !GEO_BASE) throw new Error('em São Paulo as cotas vêm do laser da prefeitura, e o GeoSampa só responde na versão publicada.');
  /* São Paulo sem SQL: o levantamento cobre as quadras inteiras que a poligonal ocupa */
  let qd: Awaited<ReturnType<typeof quadras>> = null;
  if (sp) {
    passo('Quadra e lotes da prefeitura');
    try { qd = await quadras(P); } catch (e: any) { throw new Error(`o GeoSampa não respondeu ao buscar os lotes da quadra (${e?.message ?? e}).`); }
    if (qd) av(`${qd.n} quadra${qd.n !== 1 ? 's' : ''} · ${qd.lotes.length} lotes`);
  }
  const PB = ct.fonte === 'desenhada' && qd && qd.aneis.length ? [...qd.aneis, ...P] : P, e = ext(PB.flat());
  const lev = [e[0] - TOPO_FOLGA - 2, e[1] - TOPO_FOLGA - 2, e[2] + TOPO_FOLGA + 2, e[3] + TOPO_FOLGA + 2].map((v) => Math.round(v));
  const G = grade(PB, lev, (lev[2] - lev[0]) * (lev[3] - lev[1]) > 1.5e6 ? 2 : 1);
  /* células dentro do terreno (com a quadra inteira, D = 0 vale para todos os lotes dela) */
  const noT = PB === P ? (c: number) => G.D[c] === 0 : (() => {
    const m = new Uint8Array(G.nx * G.ny);
    for (let j = 0; j < G.ny; j++) for (let i = 0; i < G.nx; i++) { const c = j * G.nx + i; if (G.D[c] === 0 && P.some((r) => geoNoAnel([G.x0 + i * G.s, G.y0 + j * G.s], r))) m[c] = 1; }
    return (c: number) => m[c] === 1;
  })();
  let fz: Fz;
  if (sp) {
    passo('Cotas pelo laser de 2020 da prefeitura');
    try { fz = { fonte: 'laser', ...(await cotasLaser(G, lev, av)) }; }
    catch (e2: any) { throw new Error(`o laser da prefeitura não respondeu (${e2?.message ?? e2}). Em São Paulo o topográfico não usa o Google.`); }
  } else {
    passo('Cotas pelo Google (grade de 5 m)');
    fz = { fonte: 'google', ...(await cotasGoogle(G, l0, av)) };
  }
  for (let c = 0; c < G.Z.length; c++) if (G.D[c] > TOPO_FOLGA) G.Z[c] = NaN;
  passo('Curvas de nível');
  const dentro: number[] = [], todas: number[] = [];
  for (let c = 0; c < G.Z.length; c++) { const z = G.Z[c]; if (z !== z) continue; todas.push(z); if (noT(c)) dentro.push(z); }
  if (!todas.length) throw new Error('nenhuma cota na área do levantamento.');
  const zmin = todas.reduce((a2, b2) => (a2 < b2 ? a2 : b2)), zmax = todas.reduce((a2, b2) => (a2 > b2 ? a2 : b2));
  const iv = zmax - zmin > 300 ? 5 : zmax - zmin > 120 ? 2 : 1, mestra = iv * 5, niveis: number[] = [];
  for (let z = Math.ceil(zmin / iv) * iv; z <= zmax; z += iv) niveis.push(z);
  const curvas = isolinhas(G.nx, G.ny, G.x0, G.y0, G.s, G.Z, niveis).map((c) => ({ ...c, mestra: Math.abs(c.z / mestra - Math.round(c.z / mestra)) < 1e-6 }));
  const folga = isolinhas(G.nx, G.ny, G.x0, G.y0, G.s, G.D.map((v) => -v), [-TOPO_FOLGA]).map((c) => c.pts);
  let dec = 0, nd = 0;
  for (let j = 1; j < G.ny - 1; j++) for (let i = 1; i < G.nx - 1; i++) {
    const c = j * G.nx + i;
    if (!noT(c)) continue;
    const v = Math.hypot((G.Z[c + 1] - G.Z[c - 1]) / (2 * G.s), (G.Z[c + G.nx] - G.Z[c - G.nx]) / (2 * G.s));
    if (v === v) { dec += v; nd++; }
  }
  const dz = dentro.length ? { min: dentro.reduce((a2, b2) => (a2 < b2 ? a2 : b2)), max: dentro.reduce((a2, b2) => (a2 > b2 ? a2 : b2)) } : { min: zmin, max: zmax };
  /* a escala é sempre a do terreno + 30 m em A3 (com ou sem SQL); com a quadra inteira, a menor folha em que ela cabe nessa escala */
  const eT = ext(P.flat()), quadroT = quadroDe([eT[0] - TOPO_FOLGA - 2, eT[1] - TOPO_FOLGA - 2, eT[2] + TOPO_FOLGA + 2, eT[3] + TOPO_FOLGA + 2].map((v) => Math.round(v)));
  const quadro = PB === P ? quadroT : quadroDe(lev, quadroT.esc);
  passo(base === 'geosanja' ? 'Vias e cursos d’água do GeoSanja' : base === 'geosampa' ? 'Vias, calçadas e córregos da prefeitura' : 'Camadas da prefeitura');
  const cam = await camadas(base, quadro.bb, l0);
  const larg = larguras(cam.camadas, P);
  /* lotes das quadras do terreno numa layer própria, com o número (SQL); os demais lotes do quadro ficam como estão */
  if (qd) {
    const sqls = new Set(qd.lotes.map((l) => l.sql));
    cam.camadas.LOTES = (cam.camadas.LOTES || []).filter((f) => !sqls.has(f.p.nr_contribuinte));
    cam.camadas.LOTES_QUADRA = qd.lotes;
  }
  /* os lotes das quadras do terreno, numerados pela inscrição (pedido do Moises, 10/nov/2026; como o de São Paulo sem SQL):
     montados pelo GeoSanja, do banco quando a quadra já foi montada; falha não impede o topográfico */
  if (base === 'geosanja' && GSJ_BASE && l0 === -45) {
    passo('Lotes da quadra (GeoSanja)');
    try {
      const r = await quadrasSjc({ ter: P[0], andamento: (n) => av(`${n} lote${n > 1 ? 's' : ''}`), base: t.empresa ? baseLotes(t.empresa) : undefined });
      const fs = r.lotes.map((l) => ({ g: recorte({ type: 'Polygon', coordinates: [l.an] }, quadro.bb), p: { ic: l.ic }, c: 'lotes' })).filter((x) => x.g);
      if (fs.length) cam.camadas.LOTES_PREFEITURA = fs;
    } catch (e2) { console.warn('lotes da quadra', e2); cam.erros.push('lotes da quadra'); }
  }
  passo('Imagem de fundo');
  const im = await imagem(base, quadro.bb, quadro.wi, quadro.hi, l0, epsg);
  passo('PDF e DXF');
  const nome = `topografico_${t.codigo}`, area = Math.round(P.reduce((a2, r) => a2 + geoAreaAnel(r), 0));
  const resumo: Resumo = {
    contorno: ct.fonte === 'lotes' ? `Lotes da prefeitura (${ct.n} inscriç${ct.n > 1 ? 'ões' : 'ão'})` : 'Poligonal desenhada' + (ct.faltam.length ? ` (sem o lote de ${ct.faltam.join(', ')})` : ''),
    cotas: fonteTxt(fz), imagem: im.fonte, curvas: `de ${iv} em ${iv} m (mestra de ${mestra} em ${mestra} m)`, area, min: dz.min, max: dz.max, dec: nd ? (dec / nd) * 100 : null,
    erros: cam.erros, escala: quadro.esc, papel: quadro.pag.papel, levantado: '',
  };
  const R = { t, base, P, PB, qd, G, curvas, folga, cam: cam.camadas, larg, im, quadro, fz, iv, mestra, zona, epsg, area, dz, dec: resumo.dec, em: new Date(), quem, resumo };
  resumo.levantado = levTxt(R);
  const pg = desenharPagina(R);
  const jpg = new Uint8Array(await (await new Promise<Blob>((ok) => pg.toBlob((x) => ok(x!), 'image/jpeg', 0.88))).arrayBuffer());
  const pdf = pdfDe([{ w: pg.width, h: pg.height, jpg }], quadro.pag.pw, quadro.pag.ph);
  const zip = await zipDe(R, nome, pdf);
  const k = 900 / pg.width, pv = document.createElement('canvas'); pv.width = 900; pv.height = Math.round(pg.height * k); pv.getContext('2d')!.drawImage(pg, 0, 0, pv.width, pv.height);
  return { pdf, zip, previa: pv.toDataURL('image/jpeg', 0.82), nome, resumo };
}
