/* eslint-disable @typescript-eslint/no-explicit-any */
// Topográfico preliminar do terreno, porte de tools/prototipo/proto_topo.js (decisões do Moisés, 26 e 27/out/2026), por
// enquanto só fora de São Paulo (pedido do Moises, 10/nov/2026): em São Paulo as cotas vêm sempre do laser da prefeitura,
// que entra num passo seguinte.
// Contorno: a soma dos lotes da prefeitura quando todas as inscrições com base (GeoSanja) têm o lote; senão, a poligonal
// desenhada. O levantamento cobre até 30 m em volta. Cotas do Google Elevation numa grade de 5 m (a origem do Google tem
// 9,5 m; mais denso só encarece), interpoladas para 1 m; curvas de 1 em 1 m (mestra de 5 em 5) por quadrados marchantes.
// Imagem por trás: a de satélite do Google com os nomes das ruas (Maps Static, híbrido); em São José dos Campos, se o Google
// falhar, a ortofoto 8 cm da prefeitura (GeoSanja). Sem reserva de outro fornecedor (decisão do Moises, 10/nov/2026). Saídas: PDF A3 (a página em imagem) e ZIP com
// o DXF 2000, a imagem referenciada e o mesmo PDF. Com cotas do Google, o DXF leva só as curvas com o texto da cota, sem
// os pontos do Google (decisão do Moisés com o advogado, 27/out/2026). Os arquivos se baixam na hora; guardar em
// Documentos entra com a aba Documentos.
import JSZip from 'jszip';
import { supabase } from '../lib/supabase';
import { GMAPS_KEY } from '../lib/config';
import { carregarGoogle } from '../mapa/google';
import { geoAneis, geoAreaAnel, geoNoAnel, latLngUtm, utmLatLng } from '../novo/geosampa';
import { GSJ_BASE, gsjInfoBB, gsjPoligono, gsjToken } from '../novo/geosanja';
import { centroPoly, lotesUniao, type P } from '../novo/geo';
import MODELO from './modelo.dxf?raw';

export const TOPO_FOLGA = 30;
const PASSO_G = 5, DPI = 160;
const num = (v: number, d = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const distSeg = (p: number[], a: number[], b: number[]) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
const ext = (pts: number[][]) => pts.reduce((b, p) => [Math.min(b[0], p[0]), Math.min(b[1], p[1]), Math.max(b[2], p[0]), Math.max(b[3], p[1])], [Infinity, Infinity, -Infinity, -Infinity]);
const mapCoord = (c: any, f: (p: number[]) => number[]): any => (!c.length ? c : typeof c[0] === 'number' ? f(c) : c.map((x: any) => mapCoord(x, f)));
const geoMapa = (g: any, f: (p: number[]) => number[]) => g && { ...g, coordinates: mapCoord(g.coordinates, f) };

export interface TerrenoTopo { id: string; codigo: string; nome: string; municipio: string | null; uf: string | null; municipioId: string | null; poly: P[] | null }
export interface Resultado { pdf: Blob; zip: Blob; previa: string; nome: string; resumo: Resumo }
export interface Resumo { contorno: string; cotas: string; imagem: string; curvas: string; area: number; min: number; max: number; dec: number | null; erros: string[]; escala: number; papel: string }
type Passo = (t: string) => void;

/* ---------- contorno: lotes da prefeitura (São José dos Campos) ou a poligonal desenhada ---------- */
async function contorno(t: TerrenoTopo, base: string | null) {
  const polys: P[][] = [], faltam: string[] = [];
  let ins: any[] = [];
  if (base === 'geosanja') {
    const [{ data: i }, { data: cs }] = await Promise.all([
      supabase.from('inscricoes_municipais').select('id,inscricao').eq('terreno_id', t.id),
      supabase.from('consultas_lote').select('inscricao_id,poligono_geojson,consultado_em').eq('terreno_id', t.id).order('consultado_em', { ascending: false }),
    ]);
    ins = i ?? [];
    for (const x of ins) {
      const c = (cs ?? []).find((y: any) => y.inscricao_id === x.id && y.poligono_geojson);
      let p: P[] | null = c ? (geoAneis(c.poligono_geojson)[0] as number[][]).slice(0, -1).map(([ln, la]) => [la, ln] as P) : null;
      if (!p && GSJ_BASE) try { p = await gsjPoligono(x.inscricao); } catch (e) { console.warn(e); }
      if (p) polys.push(p); else faltam.push(x.inscricao);
    }
  }
  if (ins.length && !faltam.length) { const u = lotesUniao(polys); return { polys: u ? [u] : polys, fonte: 'lotes' as const, n: polys.length, faltam }; }
  if (t.poly && t.poly.length >= 3) return { polys: [t.poly], fonte: 'desenhada' as const, n: 0, faltam };
  return polys.length ? { polys: [lotesUniao(polys) || polys[0]], fonte: 'lotes' as const, n: polys.length, faltam } : null;
}

/* ---------- grade de 1 m sobre a área do levantamento; D = distância ao contorno (0 dentro) ---------- */
function grade(P: number[][][], bb: number[], s: number) {
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
type Grade = ReturnType<typeof grade>;

/* ---------- cotas pelo Google: grade de 5 m (até 512 pontos por pedido) e Catmull-Rom para 1 m ---------- */
async function cotasGoogle(G: Grade, l0: number, av: Passo) {
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

/* ---------- camadas da prefeitura de São José dos Campos (GeoSanja), recortadas no quadro ---------- */
const TOPO_SJC: [string, string][] = [['arruamentos', 'EIXO_VIAS'], ['anexo_16', 'CURSO_DAGUA_FAIXA'], ['curva_igc_1_1000', 'CURVAS_PREFEITURA']];
async function camadas(base: string | null, bb: number[], l0: number) {
  const out: Record<string, any[]> = {}, erros: string[] = [];
  if (base === 'geosanja' && GSJ_BASE) {
    const a = utmLatLng(bb[0], bb[1], l0), b = utmLatLng(bb[2], bb[3], l0), bbg = [a[1], a[0], b[1], b[0]];
    await Promise.all(TOPO_SJC.map(async ([c, ly]) => {
      try { const fs = await gsjInfoBB(c, bbg); (out[ly] = out[ly] || []).push(...fs.filter((f) => f.geometry).map((f) => ({ g: geoMapa(f.geometry, ([x, y]) => latLngUtm(y, x, l0)), p: f.properties, c }))); }
      catch { erros.push(c); }
    }));
  }
  Object.keys(out).forEach((ly) => { out[ly] = out[ly].map((f) => ({ ...f, g: recorte(f.g, bb) })).filter((f) => f.g); });
  return { camadas: out, erros };
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

/* ---------- imagem por trás: ortofoto do GeoSanja em SJC; senão o satélite do Google ---------- */
const bitmap = async (u: string | URL) => {
  const r = await fetch(u, { signal: AbortSignal.timeout(30000) });
  if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) throw new Error('imagem ' + r.status);
  return createImageBitmap(await r.blob());
};
async function imagem(base: string | null, bb: number[], w: number, h: number, l0: number, epsg: number): Promise<{ img: CanvasImageSource | null; fonte: string }> {
  /* o satélite do Google com os nomes das ruas (híbrido) vem primeiro, para reconhecer as ruas e a vizinhança (pedido do Moises,
     10/nov/2026); a ortofoto do GeoSanja, mais nítida mas sem nomes (os arruamentos do GeoSanja não trazem o nome), fica se o Google falhar */
  if (GMAPS_KEY) try { return await imgGoogle(bb, w, h, l0); } catch (e) { console.warn('Google Maps Static indisponível', e); }
  if (base === 'geosanja' && GSJ_BASE && epsg === 31983) {
    try {
      const tk = await gsjToken(), nx = Math.ceil(w / 4000), ny = Math.ceil(h / 4000), cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const g = cv.getContext('2d')!, tw = Math.ceil(w / nx), th = Math.ceil(h / ny), sx = (bb[2] - bb[0]) / w, sy = (bb[3] - bb[1]) / h;
      await Promise.all(Array.from({ length: nx * ny }, async (_v, k) => {
        const i = k % nx, j = Math.floor(k / nx), pw = Math.min(tw, w - i * tw), ph = Math.min(th, h - j * th), u = new URL(GSJ_BASE + 'proxy');
        const q: Record<string, string | number> = { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: 'geoSJC:pm_sjc_ortomosaico_8cm_nov25', STYLES: '', SRS: 'EPSG:' + epsg,
          BBOX: [bb[0] + i * tw * sx, bb[3] - (j * th + ph) * sy, bb[0] + (i * tw + pw) * sx, bb[3] - j * th * sy].join(','), WIDTH: pw, HEIGHT: ph, FORMAT: 'image/jpeg', authToken: tk };
        Object.entries(q).forEach(([a, v]) => u.searchParams.set(a, String(v)));
        g.drawImage(await bitmap(u), i * tw, j * th);
      }));
      return { img: cv, fonte: 'Ortofoto 8 cm (nov/2025) da Prefeitura de São José dos Campos (GeoSanja)' };
    } catch (e) { console.warn('ortofoto do GeoSanja', e); }
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
function quadroDe(lev: number[]) {
  const mm = (px: number) => (px / DPI) * 25.4, cx = (lev[0] + lev[2]) / 2, cy = (lev[1] + lev[3]) / 2, pag = pagina(PAPEIS[0]);
  const fw = pag.w - 2 * pag.m - pag.lat - 28, fh = pag.h - 2 * pag.m;
  const esc = ESCALAS.find((e) => (mm(fw) * e) / 1000 >= lev[2] - lev[0] + 16 && (mm(fh) * e) / 1000 >= lev[3] - lev[1] + 16) || ESCALAS[ESCALAS.length - 1];
  const gw = (mm(fw) * esc) / 1000, gh = (mm(fh) * esc) / 1000, wi = Math.min(4000, Math.round(fw * 1.4));
  return { bb: [cx - gw / 2, cy - gh / 2, cx + gw / 2, cy + gh / 2], esc, pag, fx: pag.m, fy: pag.m, fw, fh, wi, hi: Math.round((wi * fh) / fw) };
}
const MM = (mm: number) => (mm / 25.4) * DPI;
const COR = { lwT: MM(2), lwI: MM(0.75), lwM: MM(1), casca: 'rgba(0,0,0,.85)', terreno: '#00e5ff', folga: '#ffffff', inter: ['#00b81f', '#1ee81e', '#5cff3a', '#b2ff73'], mestra: '#b026ff', eixo: 'rgba(255,255,255,.9)', faixa: '#7fd3ff', curvaPref: 'rgba(255,170,60,.7)' };
/** intermediárias em tons: a mais alta entre duas mestras a mais escura, a mais baixa a mais clara (Moisés, 27/out/2026); 0 a 3 */
const tomInter = (z: number, R: any) => { const n = Math.max(1, Math.round(R.mestra / R.iv) - 1), k = (((Math.round(z / R.iv) % (n + 1)) + n + 1) % (n + 1)); return n < 2 ? 0 : Math.round(((n - k) * 3) / (n - 1)); };
const nomeVia = (p: any) => (p ? String(p.nome_logra || p.logradouro || p.nome || p.rotulo || '').trim() : '');
const fonteTxt = (fz: { n: number; res: number }) => `Google Elevation, ${num(fz.n)} pontos a cada ${PASSO_G} m; grade de origem de ${num(fz.res, 1)} m e erro típico de 3 a 4 m`;

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
  linhas('CURSO_DAGUA_FAIXA', COR.faixa, 2, [10, 6], 'rgba(127,211,255,.12)');
  linhas('EIXO_VIAS', COR.eixo, 1.4, [18, 8, 4, 8]);
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
  const vistos = new Set<string>();
  (R.cam.EIXO_VIAS || []).forEach((f: any) => {
    const L = geoAneis(f.g)[0], nome = nomeVia(f.p);
    if (!L || !nome || L.length < 2) return;
    const m = Math.floor((L.length - 1) / 2), a = L[m], b = L[m + 1], cx = (X(a[0]) + X(b[0])) / 2, cy = (Y(a[1]) + Y(b[1])) / 2, ch = nome + Math.round(cx / 300) + Math.round(cy / 300);
    if (cx < Q.fx || cy < Q.fy || cx > Q.fx + Q.fw || cy > Q.fy + Q.fh || vistos.has(ch)) return;
    vistos.add(ch);
    halo(nome, cx, cy, leg(Math.atan2(Y(b[1]) - Y(a[1]), X(b[0]) - X(a[0]))), 17, '#fff', 500);
  });
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
  kv('Área levantada', `Contorno + ${TOPO_FOLGA} m em volta`);
  kv('Cotas no terreno', `mínima ${num(R.dz.min, 1)} m · máxima ${num(R.dz.max, 1)} m · desnível ${num(R.dz.max - R.dz.min, 1)} m` + (R.dec != null ? ` · declividade média ${num(R.dec, 1)}%` : ''));
  kv('Fonte das cotas', fonteTxt(R.fz)); kv('Curvas de nível', `de ${R.iv} em ${R.iv} m; mestra de ${R.mestra} em ${R.mestra} m (roxa, com a cota)`);
  kv('Imagem', R.im.fonte);
  const extras = [R.cam.EIXO_VIAS?.length && 'eixos de via', R.cam.CURSO_DAGUA_FAIXA?.length && "faixa de curso d'água", R.cam.CURVAS_PREFEITURA?.length && 'curvas do IGC 1:10.000 (só no DXF)'].filter(Boolean);
  if (extras.length) kv('Do GeoSanja', extras.join(', ').replace(/^./, (c) => c.toUpperCase()));
  kv('Coordenadas', `SIRGAS 2000 / UTM ${R.zona}S (EPSG:${R.epsg}); cotas em metros, altitude ortométrica`);
  y += 4; g.fillStyle = '#c4c7c5'; g.fillRect(x0, y, lat, 1.5); y += 16; txt('Legenda', 16, '#1f1f1f', 500); y += 4;
  const fundo = '#5d6b63';
  const item = (desenho: () => void, rot: string) => { g.save(); g.translate(x0, y + 9); g.fillStyle = fundo; g.fillRect(0, -9, 44, 18); desenho(); g.restore(); g.font = `14px ${F}`; g.fillStyle = '#1f1f1f'; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText(rot, x0 + 56, y + 9); y += 26; };
  const traco = (cor: string, lw: number, dash?: number[]) => () => { g.setLineDash(dash || []); g.strokeStyle = cor; g.lineWidth = lw; g.beginPath(); g.moveTo(0, 0); g.lineTo(44, 0); g.stroke(); g.setLineDash([]); };
  item(() => { g.strokeStyle = COR.terreno; g.lineWidth = 6; g.strokeRect(4, -5, 36, 10); }, 'Terreno (contorno)');
  item(traco(COR.folga, 2, [8, 5]), `Limite do levantamento (${TOPO_FOLGA} m)`);
  item(() => { traco(COR.casca, COR.lwM + 2.4)(); traco(COR.mestra, COR.lwM)(); }, `Curva mestra (${R.mestra} m)`);
  item(() => { traco(COR.casca, COR.lwI + 2.4)(); COR.inter.forEach((c, i, a) => { g.save(); g.beginPath(); g.rect((i * 44) / a.length, -9, 44 / a.length, 18); g.clip(); traco(c, COR.lwI)(); g.restore(); }); }, `Curvas intermediárias (${R.iv} m; mais alta escura, mais baixa clara)`);
  if (R.cam.EIXO_VIAS?.length) item(traco(COR.eixo, 1.4, [10, 4, 3, 4]), 'Eixo da via');
  if (R.cam.CURSO_DAGUA_FAIXA?.length) item(traco(COR.faixa, 2, [10, 6]), "Faixa de curso d'água (PDDI)");
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
  Object.entries(R.cam as Record<string, any[]>).forEach(([ly, fs]) => fs.forEach((ft) => {
    const pol = /Polygon/.test(ft.g.type), z = ly === 'CURVAS_PREFEITURA' ? ft.p.avg_z : 0;
    geoAneis(ft.g).forEach((r) => poli(ly, pol && r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1] ? r.slice(0, -1) : r, pol, z));
  }));
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
    '  Curvas com a cota como elevacao e o texto da cota em cada uma (CURVA_MESTRA; CURVA_INTERMEDIARIA_1 a _4, da mais escura, a mais alta, a mais clara, a mais baixa; COTA_CURVA); sem os pontos do Google,',
    '  terreno, limite do levantamento (30 m) e as camadas da prefeitura, quando houver (eixos, faixas de curso d agua, curvas do IGC).',
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
  if (base === 'geosampa') throw new Error('em São Paulo as cotas vêm do laser da prefeitura, que ainda não está no sistema novo.');
  passo('Contorno do terreno');
  const ct = await contorno(t, base);
  if (!ct) throw new Error('o terreno não tem poligonal nem lote da prefeitura.');
  const c0 = centroPoly(ct.polys[0]), zona = Math.floor((c0[1] + 180) / 6) + 1, l0 = -183 + 6 * zona, epsg = 31960 + zona;
  const P = ct.polys.map((r) => r.map(([la, lo]) => latLngUtm(la, lo, l0) as number[]));
  const e = ext(P.flat()), lev = [e[0] - TOPO_FOLGA - 2, e[1] - TOPO_FOLGA - 2, e[2] + TOPO_FOLGA + 2, e[3] + TOPO_FOLGA + 2].map((v) => Math.round(v));
  const G = grade(P, lev, (lev[2] - lev[0]) * (lev[3] - lev[1]) > 1.5e6 ? 2 : 1);
  passo('Cotas pelo Google (grade de 5 m)');
  const fz = await cotasGoogle(G, l0, av);
  for (let c = 0; c < G.Z.length; c++) if (G.D[c] > TOPO_FOLGA) G.Z[c] = NaN;
  passo('Curvas de nível');
  const dentro: number[] = [], todas: number[] = [];
  for (let c = 0; c < G.Z.length; c++) { const z = G.Z[c]; if (z !== z) continue; todas.push(z); if (G.D[c] === 0) dentro.push(z); }
  if (!todas.length) throw new Error('nenhuma cota na área do levantamento.');
  const zmin = todas.reduce((a, b2) => (a < b2 ? a : b2)), zmax = todas.reduce((a, b2) => (a > b2 ? a : b2));
  const iv = zmax - zmin > 300 ? 5 : zmax - zmin > 120 ? 2 : 1, mestra = iv * 5, niveis: number[] = [];
  for (let z = Math.ceil(zmin / iv) * iv; z <= zmax; z += iv) niveis.push(z);
  const curvas = isolinhas(G.nx, G.ny, G.x0, G.y0, G.s, G.Z, niveis).map((c) => ({ ...c, mestra: Math.abs(c.z / mestra - Math.round(c.z / mestra)) < 1e-6 }));
  const folga = isolinhas(G.nx, G.ny, G.x0, G.y0, G.s, G.D.map((v) => -v), [-TOPO_FOLGA]).map((c) => c.pts);
  let dec = 0, nd = 0;
  for (let j = 1; j < G.ny - 1; j++) for (let i = 1; i < G.nx - 1; i++) {
    const c = j * G.nx + i;
    if (G.D[c] !== 0) continue;
    const v = Math.hypot((G.Z[c + 1] - G.Z[c - 1]) / (2 * G.s), (G.Z[c + G.nx] - G.Z[c - G.nx]) / (2 * G.s));
    if (v === v) { dec += v; nd++; }
  }
  const dz = dentro.length ? { min: dentro.reduce((a, b2) => (a < b2 ? a : b2)), max: dentro.reduce((a, b2) => (a > b2 ? a : b2)) } : { min: zmin, max: zmax };
  const quadro = quadroDe(lev);
  passo(base === 'geosanja' ? 'Vias e cursos d’água do GeoSanja' : 'Camadas da prefeitura');
  const cam = await camadas(base, quadro.bb, l0);
  passo('Imagem de fundo');
  const im = await imagem(base, quadro.bb, quadro.wi, quadro.hi, l0, epsg);
  passo('PDF e DXF');
  const nome = `topografico_${t.codigo}`, area = Math.round(P.reduce((s, r) => s + geoAreaAnel(r), 0));
  const resumo: Resumo = {
    contorno: ct.fonte === 'lotes' ? `Lotes da prefeitura (${ct.n} inscriç${ct.n > 1 ? 'ões' : 'ão'})` : 'Poligonal desenhada' + (ct.faltam.length ? ` (sem o lote de ${ct.faltam.join(', ')})` : ''),
    cotas: fonteTxt(fz), imagem: im.fonte, curvas: `de ${iv} em ${iv} m (mestra de ${mestra} em ${mestra} m)`, area, min: dz.min, max: dz.max, dec: nd ? (dec / nd) * 100 : null,
    erros: cam.erros, escala: quadro.esc, papel: quadro.pag.papel,
  };
  const R = { t, P, curvas, folga, cam: cam.camadas, im, quadro, fz, iv, mestra, zona, epsg, area, dz, dec: resumo.dec, em: new Date(), quem, resumo };
  const pg = desenharPagina(R);
  const jpg = new Uint8Array(await (await new Promise<Blob>((ok) => pg.toBlob((x) => ok(x!), 'image/jpeg', 0.88))).arrayBuffer());
  const pdf = pdfDe([{ w: pg.width, h: pg.height, jpg }], quadro.pag.pw, quadro.pag.ph);
  const zip = await zipDe(R, nome, pdf);
  const k = 900 / pg.width, pv = document.createElement('canvas'); pv.width = 900; pv.height = Math.round(pg.height * k); pv.getContext('2d')!.drawImage(pg, 0, 0, pv.width, pv.height);
  return { pdf, zip, previa: pv.toDataURL('image/jpeg', 0.82), nome, resumo };
}
