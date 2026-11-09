/* eslint-disable @typescript-eslint/no-explicit-any */
import RENDA_JSON from '../../../../tools/setores/metodologia_renda.json';
import DENS_JSON from '../../../../tools/setores/metodologia_densidade.json';

// Setores censitários do IBGE (Censo 2022) no mapa, portado de tools/prototipo/proto_setores.js (setCarregar,
// setJuntar, setPreparar, setEm, setDesenhaLadrilho). Uma camada por vez: renda familiar estimada ou densidade
// demográfica bruta. A metodologia (faixas, cores, fatores) é a de tools/setores, a mesma do protótipo e do banco.
// Os arquivos por município são os do protótipo, servidos em /prototipo/dados.

export const RENDA_MET: any = { ...RENDA_JSON, fatorPnad: RENDA_JSON.pnadValorAtual / RENDA_JSON.pnadValorBase };
export const DENS_MET: any = DENS_JSON;
export type Camada = 'renda' | 'dens';
export const CAMADAS: Record<Camada, { nome: string; curto: string; met: any }> = {
  renda: { nome: 'Renda familiar estimada', curto: 'Renda', met: RENDA_MET },
  dens: { nome: 'Densidade demográfica', curto: 'Densidade', met: DENS_MET },
};
const SET_MUN: Record<string, string> = { '3550308': 'São Paulo', '3549904': 'São José dos Campos' };
const arq = (mun: string) => `/prototipo/dados/setores-${mun}-2022.json`;

const faixaDe = (fx: { ate: number | null }[], v: number | null) => {
  if (v == null) return null;
  for (let i = 0; i < fx.length; i++) { const a = fx[i].ate; if (a == null || v <= a) return i; }
  return null;
};
export const rdFaixa = (v: number | null) => faixaDe(RENDA_MET.faixas, v == null ? null : Math.round(v));
export const dsFaixa = (v: number | null) => faixaDe(DENS_MET.faixas, v);
export const rgba = (h: string, a: number) => `rgba(${parseInt(h.slice(1, 3), 16)},${parseInt(h.slice(3, 5), 16)},${parseInt(h.slice(5, 7), 16)},${a})`;

export interface Setores {
  n: number; cd: string[]; mun: string[]; distritos: string[]; di: number[]; area: number[]; pop: number[]; dom: number[];
  v4: (number | null)[]; v6: (number | null)[]; sit: number[];
  rings: Float64Array[][]; bb: Float64Array; idx: Map<string, number[]>; G: number;
  rAt: (number | null)[]; faixa: (number | null)[]; dens: (number | null)[]; dfaixa: (number | null)[];
}
export const setLocal = (d: Setores, i: number) => { const di = d.distritos[d.di[i]] || '', m = SET_MUN[d.mun[i]] || ''; return di && di !== m ? di + ' · ' + m : (m || di); };

/* junta os arquivos dos municípios: vetores em sequência, código completo do setor em cd, distritos deslocados */
function juntar(js: any[]) {
  const o: any = { ...js[0], cd: [], mun: [], distritos: [], di: [], n: 0 };
  const vet = Object.keys(js[0]).filter((k) => Array.isArray(js[0][k]) && js[0][k].length === js[0].n && !['cd', 'di'].includes(k));
  vet.forEach((k) => (o[k] = []));
  for (const j of js) {
    const base = o.distritos.length;
    o.distritos.push(...j.distritos);
    j.di.forEach((x: number) => o.di.push(x + base));
    j.cd.forEach((c: string) => { o.cd.push(j.municipio + c); o.mun.push(j.municipio); });
    vet.forEach((k) => { for (const x of j[k]) o[k].push(x); });
    o.n += j.n;
  }
  return o;
}
/* geometria em inteiros de 1e-5 grau, em diferenças; índice em grade de 0,002 grau (~220 m) */
function preparar(j: any): Setores {
  const n = j.n, Q = 1e5, G = 0.002, bb = new Float64Array(n * 4), rings = new Array(n), idx = new Map<string, number[]>();
  for (let i = 0; i < n; i++) {
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    rings[i] = j.g[i].map((r: number[]) => {
      const a = new Float64Array(r.length);
      let x = 0, y = 0;
      for (let k = 0; k < r.length; k += 2) {
        x += r[k]; y += r[k + 1]; a[k] = x / Q; a[k + 1] = y / Q;
        if (a[k] < x0) x0 = a[k]; if (a[k] > x1) x1 = a[k]; if (a[k + 1] < y0) y0 = a[k + 1]; if (a[k + 1] > y1) y1 = a[k + 1];
      }
      return a;
    });
    bb.set([x0, y0, x1, y1], i * 4);
    for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++) {
      const k = gx + ':' + gy; let l = idx.get(k); if (!l) idx.set(k, (l = [])); l.push(i);
    }
  }
  const ff = RENDA_MET.fatorFamiliar, fp = RENDA_MET.fatorPnad;
  const rAt = j.v4.map((v: number | null) => (v == null ? null : Math.round(v * ff * fp * 100) / 100));
  const dens = j.pop.map((p: number, i: number) => (j.area[i] > 0 ? p / (j.area[i] / 1e6) : null));
  delete j.g;
  return { ...j, rings, bb, idx, G, rAt, faixa: rAt.map(rdFaixa), dens, dfaixa: dens.map(dsFaixa) };
}

let SET: Setores | null = null;
let promessa: Promise<Setores> | null = null;
export const setores = () => SET;
export function carregarSetores(): Promise<Setores> {
  if (SET) return Promise.resolve(SET);
  if (promessa) return promessa;
  promessa = Promise.all(Object.keys(SET_MUN).map((m) => fetch(arq(m)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })))
    .then((js) => (SET = preparar(juntar(js))))
    .catch((e) => { console.warn('setores', e); promessa = null; throw e; });
  return promessa;
}

function candidatos(x0: number, y0: number, x1: number, y1: number) {
  const d = SET!, G = d.G, s = new Set<number>();
  for (let gx = Math.floor(x0 / G); gx <= Math.floor(x1 / G); gx++) for (let gy = Math.floor(y0 / G); gy <= Math.floor(y1 / G); gy++) {
    const l = d.idx.get(gx + ':' + gy); if (l) for (const i of l) s.add(i);
  }
  return s;
}
function dentro(i: number, x: number, y: number) {
  const d = SET!, b = i * 4;
  if (x < d.bb[b] || x > d.bb[b + 2] || y < d.bb[b + 1] || y > d.bb[b + 3]) return false;
  let ok = false;
  for (const a of d.rings[i]) {
    const n = a.length;
    for (let k = 0, m = n - 2; k < n; m = k, k += 2) { const yi = a[k + 1], yj = a[m + 1]; if ((yi > y) !== (yj > y) && x < ((a[m] - a[k]) * (y - yi)) / (yj - yi) + a[k]) ok = !ok; }
  }
  return ok;
}
/** setor que contém o ponto */
export function setorEm(lat: number, lng: number): number | null {
  if (!SET) return null;
  for (const i of candidatos(lng, lat, lng, lat)) if (dentro(i, lng, lat)) return i;
  return null;
}
/** contorno do setor em [lat, lng] */
export const aneis = (i: number) => SET!.rings[i].map((a) => { const p: [number, number][] = []; for (let k = 0; k < a.length; k += 2) p.push([a[k + 1], a[k]]); return p; });

const corDe = (c: Camada, i: number) => {
  const d = SET!, f = c === 'renda' ? d.faixa[i] : d.dfaixa[i];
  return f == null ? null : CAMADAS[c].met.faixas[f].cor as string;
};
/** desenho em ladrilhos de 256 px, como no protótipo */
export function desenhaLadrilho(cv: HTMLCanvasElement, x: number, y: number, z: number, camada: Camada) {
  const T = 256, dpr = Math.min(2, window.devicePixelRatio || 1), ctx = cv.getContext('2d')!;
  cv.width = cv.height = T * dpr; cv.style.width = cv.style.height = T + 'px';
  if (!SET) return;
  ctx.scale(dpr, dpr);
  const W = T * 2 ** z, lon = (px: number) => (px / W) * 360 - 180, lat = (py: number) => { const n = Math.PI - (2 * Math.PI * py) / W; return (180 / Math.PI) * Math.atan(Math.sinh(n)); };
  const x0 = lon(x * T), x1 = lon((x + 1) * T), y1 = lat(y * T), y0 = lat((y + 1) * T), op = CAMADAS[camada].met.opacidade;
  const PX = (g: number) => ((g + 180) / 360) * W - x * T, PY = (g: number) => { const s = Math.sin((g * Math.PI) / 180); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * W - y * T; };
  const borda = z >= 14, sem = 'rgba(60,64,67,.45)', d = SET;
  for (const i of candidatos(x0, y0, x1, y1)) {
    const b = i * 4;
    if (d.bb[b] > x1 || d.bb[b + 2] < x0 || d.bb[b + 1] > y1 || d.bb[b + 3] < y0) continue;
    ctx.beginPath();
    for (const a of d.rings[i]) { for (let k = 0; k < a.length; k += 2) { const px = PX(a[k]), py = PY(a[k + 1]); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); } ctx.closePath(); }
    const cor = corDe(camada, i);
    if (cor) { ctx.fillStyle = rgba(cor, op); ctx.fill('evenodd'); if (borda) { ctx.lineWidth = 0.6; ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.stroke(); } }
    else if (z >= 13) { ctx.setLineDash([3, 3]); ctx.lineWidth = 0.8; ctx.strokeStyle = sem; ctx.stroke(); ctx.setLineDash([]); }
  }
}

/* ---------- ficha: renda e população do entorno (proto_setores.js › setEstat) ----------
   Estatística de uma área por amostragem (~30 mil pontos): cada setor entra pela fração da área dele que cai
   dentro (moradores espalhados por igual no setor). No banco: app.estatisticas_area, exata. */
export type Raio = number | 'poly';
export const RD_RAIOS: [Raio, string][] = [[500, '500 m'], [1000, '1 km'], [2000, '2 km'], [3000, '3 km'], ['poly', 'Poligonal']];
export interface Estat { area: number; setores: number; pes: number; dom: number; dens: number; renda: number | null; cob: number | null; porF: number[]; dist: number; foraPct: number; frs: Map<number, number> }
const dentroPoly = (lat: number, lng: number, p: [number, number][]) => {
  let d = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [yi, xi] = p[i], [yj, xj] = p[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d; }
  return d;
};
/** área em m² de uma poligonal [lat, lng] (projeção local) */
export function areaPoly(p: [number, number][]) {
  const lat0 = (p.reduce((s, x) => s + x[0], 0) / p.length) * Math.PI / 180, mx = 111320 * Math.cos(lat0), my = 110574;
  let a = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) a += p[j][1] * mx * p[i][0] * my - p[i][1] * mx * p[j][0] * my;
  return Math.abs(a / 2);
}
const CACHE = new Map<string, Estat>();
export function estatArea(lat: number, lng: number, poly: [number, number][] | null, raio: Raio): Estat | null {
  if (!SET) return null;
  const pl = raio === 'poly' ? poly : null;
  if (raio === 'poly' && !(pl && pl.length >= 3)) return null;
  const ch = [raio, lat, lng, pl ? JSON.stringify(pl) : ''].join('|');
  const c0 = CACHE.get(ch); if (c0) return c0;
  const lat0 = lat * Math.PI / 180, mx = 111320 * Math.cos(lat0), my = 110574, d = SET;
  let x0: number, x1: number, y0: number, y1: number, den: (x: number, y: number) => boolean;
  if (pl) { const xs = pl.map((p) => p[1]), ys = pl.map((p) => p[0]); x0 = Math.min(...xs); x1 = Math.max(...xs); y0 = Math.min(...ys); y1 = Math.max(...ys); den = (x, y) => dentroPoly(y, x, pl); }
  else { const r = raio as number, dx = r / mx, dy = r / my; x0 = lng - dx; x1 = lng + dx; y0 = lat - dy; y1 = lat + dy; den = (x, y) => ((x - lng) * mx) ** 2 + ((y - lat) * my) ** 2 <= r * r; }
  const area = pl ? areaPoly(pl) : Math.PI * (raio as number) ** 2, passo = Math.sqrt(area / 30000), sx = passo / mx, sy = passo / my, cont = new Map<number, number>();
  let fora = 0;
  for (let y = y0 + sy / 2; y < y1; y += sy) for (let x = x0 + sx / 2; x < x1; x += sx) {
    if (!den(x, y)) continue;
    let achou: number | null = null;
    for (const i of candidatos(x, y, x, y)) if (dentro(i, x, y)) { achou = i; break; }
    if (achou == null) fora++; else cont.set(achou, (cont.get(achou) || 0) + 1);
  }
  let pes = 0, dom = 0, resp = 0, respR = 0, soma = 0, dist = 0;
  const porF = new Array(RENDA_MET.faixas.length).fill(0), frs = new Map<number, number>();
  const v1 = (d as any).v1 as (number | null)[];
  for (const [i, c] of cont) {
    const fr = Math.min(1, (c * passo * passo) / Math.max(d.area[i], 1)); frs.set(i, fr);
    pes += d.pop[i] * fr; dom += d.dom[i] * fr; const w = (v1?.[i] || 0) * fr; resp += w;
    if (d.rAt[i] != null) { respR += w; soma += d.rAt[i]! * w; porF[d.faixa[i]!] += w; if (d.v6[i] != null && d.v4[i]! > RENDA_MET.distorcidaRazao * d.v6[i]!) dist++; }
  }
  const n = [...cont.values()].reduce((a, b) => a + b, 0);
  const r: Estat = { area, setores: cont.size, pes, dom, dens: pes / (area / 1e6), renda: respR ? soma / respR : null, cob: resp ? (respR / resp) * 100 : null,
    porF: porF.map((w) => (respR ? (w / respR) * 100 : 0)), dist, foraPct: fora + n ? (fora / (fora + n)) * 100 : 0, frs };
  CACHE.set(ch, r);
  return r;
}
/** há setores perto do ponto? (só São Paulo e São José dos Campos por ora) */
export const temSetores = (lat: number, lng: number) => !!SET && (setorEm(lat, lng) != null || candidatos(lng - 0.01, lat - 0.01, lng + 0.01, lat + 0.01).size > 0);
export const MUNICIPIOS_SETORES = Object.values(SET_MUN);

/* ---------- perfil da população (proto_setores.js › demoCarregar, demoEstat) ---------- */
export interface Demo { n: number; cd: string[]; vars: string[]; v: (number | null)[][]; col: Record<string, number> }
let DEMO: Demo | null = null, promDemo: Promise<Demo> | null = null;
export function carregarDemo(): Promise<Demo> {
  if (DEMO) return Promise.resolve(DEMO);
  if (promDemo) return promDemo;
  promDemo = Promise.all(Object.keys(SET_MUN).map((m) => fetch(`/prototipo/dados/demografia-${m}-2022.json`).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })))
    .then((js: any[]) => {
      if (js.some((j) => j.vars.join() !== js[0].vars.join())) throw new Error('variáveis diferentes entre os municípios');
      const j: any = { ...js[0], n: 0, cd: [], v: [] };
      for (const x of js) { x.cd.forEach((c: string) => j.cd.push(x.municipio + c)); x.v.forEach((l: any) => j.v.push(l)); j.n += x.n; }
      j.col = Object.fromEntries(j.vars.map((v: string, k: number) => [v, k]));
      return (DEMO = j as Demo);
    })
    .catch((e) => { console.warn('demografia', e); promDemo = null; throw e; });
  return promDemo;
}
export interface Perfil { pes: number; h: number; m: number; idade: { t: number; h: number; m: number }[]; morD: number; domD: number; tam: number[]; dppo: number; esp: number[]; vag: number; oca: number; idadeND: number; tamND: number; espND: number;
  /** idade média estimada: soma de (ponto médio × pessoas) e as pessoas dos setores com os 11 cortes divulgados */
  idSoma: number; idPes: number }
const PERF = new WeakMap<Estat, Perfil | null>();
export function perfilArea(r: Estat, c: any): Perfil | null {
  if (!SET || !DEMO) return null;
  if (PERF.has(r)) return PERF.get(r)!;
  const d = SET, D = DEMO;
  if (D.n !== d.n || D.cd[0] !== d.cd[0] || D.cd[d.n - 1] !== d.cd[d.n - 1]) { PERF.set(r, null); return null; }
  const soma = (i: number, vs: string[]) => { const l = D.v[i]; let s = 0; for (const v of vs) { const x = l[D.col[v]]; if (x == null) return null; s += x; } return s; };
  const M = c.moradores;
  const o: Perfil = { pes: 0, h: 0, m: 0, idade: c.idade.map(() => ({ t: 0, h: 0, m: 0 })), morD: 0, domD: 0, tam: new Array(c.tamanho.length + 1).fill(0), dppo: 0, esp: c.especie.map(() => 0), vag: 0, oca: 0, idadeND: 0, tamND: 0, espND: 0, idSoma: 0, idPes: 0 };
  const IM: [string, number][] = c.idadeMedia?.faixas ?? [];
  for (const [i, fr] of r.frs) {
    o.pes += d.pop[i] * fr;
    const h = soma(i, [c.sexo.homens]), m = soma(i, [c.sexo.mulheres]); if (h != null && m != null) { o.h += h * fr; o.m += m * fr; }
    c.idade.forEach((g: any, k: number) => { const a = soma(i, g.total), b = soma(i, g.homens), e = soma(i, g.mulheres); if (a != null) o.idade[k].t += a * fr; if (b != null) o.idade[k].h += b * fr; if (e != null) o.idade[k].m += e * fr; });
    const mor = soma(i, [M.moradoresDppo, M.moradoresDpio]), dd = soma(i, [M.dppo, M.dpio]); if (mor != null && dd != null) { o.morD += mor * fr; o.domD += dd * fr; }
    const dppo = soma(i, [M.dppo]);
    if (dppo != null) {
      o.dppo += dppo * fr; const ts = c.tamanho.map((x: any) => soma(i, [x.var]));
      if (ts.every((x: any) => x != null)) { ts.forEach((x: number, k: number) => (o.tam[k] += x * fr)); o.tam[c.tamanho.length] += Math.max(0, dppo - ts.reduce((a: number, b: number) => a + b, 0)) * fr; }
      else ts.forEach((x: number | null, k: number) => { if (x != null) o.tam[k] += x * fr; });
    }
    c.especie.forEach((e: any, k: number) => { const x = soma(i, [e.var]); if (x != null) o.esp[k] += x * fr; });
    if (IM.length) {
      let sp = 0, sm = 0, ok = true;
      for (const [v, mid] of IM) { const x = soma(i, [v]); if (x == null) { ok = false; break; } sp += x; sm += x * mid; }
      if (ok) { o.idPes += sp * fr; o.idSoma += sm * fr; }
    }
    const vg = soma(i, [c.vagos]), oc = soma(i, [c.usoOcasional]); if (vg != null) o.vag += vg * fr; if (oc != null) o.oca += oc * fr;
  }
  o.idadeND = Math.max(0, o.pes - o.idade.reduce((a, g) => a + g.t, 0));
  o.tamND = Math.max(0, o.dppo - o.tam.reduce((a, b) => a + b, 0)); o.espND = Math.max(0, o.dppo - o.esp.reduce((a, b) => a + b, 0));
  PERF.set(r, o);
  return o;
}
