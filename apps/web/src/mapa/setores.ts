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
