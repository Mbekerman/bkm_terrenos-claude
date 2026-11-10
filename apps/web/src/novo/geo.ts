/* eslint-disable @typescript-eslint/no-explicit-any */
// Geometria e localização do Novo terreno, portadas de tools/prototipo/proto_mod.js (areaPoly, centro, centroPoly,
// dentroPoly, lerKmz) e proto_novo.js (nvProj, uniaoPoly, localDoPonto, nvLados, nvFrentes, nomeRef).
// Pontos sempre em [lat, lng].

export type P = [number, number];

export function areaPoly(pts: P[] | null | undefined): number | null {
  if (!pts || pts.length < 3) return null;
  const lat0 = (pts.reduce((s, p) => s + p[0], 0) / pts.length) * Math.PI / 180, R = 6371008;
  const xy = pts.map(([la, lo]) => [R * lo * Math.PI / 180 * Math.cos(lat0), R * la * Math.PI / 180]);
  let a = 0;
  for (let i = 0; i < xy.length; i++) { const [x1, y1] = xy[i], [x2, y2] = xy[(i + 1) % xy.length]; a += x1 * y2 - x2 * y1; }
  return Math.abs(a) / 2;
}
export const centro = (pts: P[]): P => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
export function dentroPoly(lat: number, lng: number, p: P[]) {
  let d = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [yi, xi] = p[i], [yj, xj] = p[j]; if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) d = !d; }
  return d;
}
/* ponto do pino dentro da poligonal: o centro de massa; se cai fora (forma em L ou em U), a média dos vértices;
   se também cai fora, o meio do maior trecho de uma linha horizontal que passa pelo centro */
export function centroPoly(p: P[]): P {
  let A = 0, x = 0, y = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const f = p[j][1] * p[i][0] - p[i][1] * p[j][0]; A += f; x += (p[j][1] + p[i][1]) * f; y += (p[j][0] + p[i][0]) * f; }
  const c: P = A ? [y / (3 * A), x / (3 * A)] : centro(p);
  if (dentroPoly(c[0], c[1], p)) return c;
  const m = centro(p);
  if (dentroPoly(m[0], m[1], p)) return m;
  const lat = c[0], xs: number[] = [];
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const [yi, xi] = p[i], [yj, xj] = p[j]; if ((yi > lat) !== (yj > lat)) xs.push(xi + ((lat - yi) * (xj - xi)) / (yj - yi)); }
  xs.sort((a, b) => a - b);
  let best: number[] | null = null;
  for (let k = 0; k + 1 < xs.length; k += 2) if (!best || xs[k + 1] - xs[k] > best[1] - best[0]) best = [xs[k], xs[k + 1]];
  return best ? [lat, (best[0] + best[1]) / 2] : m;
}
export const m2 = (v: number | null | undefined) => (v == null ? '—' : Math.round(v).toLocaleString('pt-BR') + ' m²');
export const fixa = (p: P[]): P[] => p.map((x) => [+(+x[0]).toFixed(7), +(+x[1]).toFixed(7)]);
/** GeoJSON (lng, lat), fechado */
export const geojson = (p: P[]) => ({ type: 'Polygon', coordinates: [[...p, p[0]].map(([la, lo]) => [lo, la])] });

/* graus -> metros locais (x para leste, y para norte) e de volta */
const nvProj = (lat0: number) => { const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574; return { xy: (p: P): P => [p[1] * kx, p[0] * ky], ll: (q: P): P => [q[1] / ky, q[0] / kx] }; };

/* União de duas poligonais (Greiner-Hormann; a segunda é deslocada 1 mm para não cair em divisa comum exata).
   Devolve o contorno externo; no banco, ST_Union. */
export function uniaoPoly(a: P[], b: P[]): P[] | null {
  const pj = nvProj(centro(a)[0]), A = a.map(pj.xy), B = b.map(pj.xy).map(([x, y]) => [x + 0.0007, y + 0.0011] as P);
  const no = (p: P, inter: boolean): any => ({ x: p[0], y: p[1], inter, entry: false, viz: null, vis: false, alfa: 0 });
  const LA = A.map((p) => [no(p, false)]), LB = B.map((p) => [no(p, false)]);
  let tem = false;
  A.forEach((p, i) => {
    const p2 = A[(i + 1) % A.length];
    B.forEach((q, j) => {
      const q2 = B[(j + 1) % B.length], d = (p2[0] - p[0]) * (q2[1] - q[1]) - (p2[1] - p[1]) * (q2[0] - q[0]);
      if (!d) return;
      const t = ((q[0] - p[0]) * (q2[1] - q[1]) - (q[1] - p[1]) * (q2[0] - q[0])) / d, u = ((q[0] - p[0]) * (p2[1] - p[1]) - (q[1] - p[1]) * (p2[0] - p[0])) / d;
      if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return;
      const x: P = [p[0] + t * (p2[0] - p[0]), p[1] + t * (p2[1] - p[1])], ia = no(x, true), ib = no(x, true);
      ia.alfa = t; ib.alfa = u; ia.viz = ib; ib.viz = ia; LA[i].push(ia); LB[j].push(ib); tem = true;
    });
  });
  const dentro = (p: P, Q: P[]) => { let c = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
  if (!tem) return dentro(A[0], B) ? b : dentro(B[0], A) ? a : null;
  const lista = (L: any[][]) => L.flatMap((e) => [e[0], ...e.slice(1).sort((m, n) => m.alfa - n.alfa)]);
  const SA = lista(LA), SB = lista(LB);
  ([[SA, B], [SB, A]] as [any[], P[]][]).forEach(([L, Q]) => { let st = dentro([L[0].x, L[0].y], Q); L.forEach((n, i) => { n.L = L; n.i = i; if (n.inter) { n.entry = st; st = !st; } }); });
  const aneis: P[][] = [];
  for (const s of SA) {
    if (!s.inter || s.vis) continue;
    const anel: P[] = [];
    let c = s, g = 0;
    do {
      c.vis = c.viz.vis = true;
      const passo = c.entry ? 1 : -1;
      do { anel.push([c.x, c.y]); c = c.L[(c.i + passo + c.L.length) % c.L.length]; } while (!c.inter && ++g < 1e5);
      c = c.viz;
    } while (c !== s && c.viz !== s && ++g < 1e5);
    aneis.push(anel);
  }
  const area = (r: P[]) => Math.abs(r.reduce((s, p, i) => { const q = r[(i + 1) % r.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
  const maior = aneis.sort((x, y) => area(y) - area(x))[0];
  return maior && maior.length >= 3 ? maior.map((q) => pj.ll(q).map((v) => +v.toFixed(7)) as P) : null;
}

/* ---------- KMZ / KML ---------- */
export interface ItemKml { nome: string; tipo: 'poligono' | 'ponto'; pts: P[] }
export async function lerKmz(file: File): Promise<ItemKml[]> {
  let txt: string;
  if (/\.kmz$/i.test(file.name)) {
    const { default: JSZip } = await import('jszip');
    const z = await JSZip.loadAsync(file), f = Object.values(z.files).find((x) => /\.kml$/i.test(x.name));
    if (!f) throw new Error('O KMZ não tem um arquivo KML dentro.');
    txt = await f.async('text');
  } else txt = await file.text();
  const x = new DOMParser().parseFromString(txt, 'application/xml');
  if (x.getElementsByTagName('parsererror').length) throw new Error('O arquivo não é um KML válido.');
  const crd = (s: string | null | undefined): P[] => String(s || '').trim().split(/\s+/).map((p) => { const [lng, lat] = p.split(',').map(Number); return [lat, lng] as P; }).filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  const out = [...x.getElementsByTagName('Placemark')].map((p, i): ItemKml | null => {
    const nome = (p.getElementsByTagName('name')[0]?.textContent || '').trim() || `Item ${i + 1}`;
    const pol = p.getElementsByTagName('Polygon')[0];
    if (pol) {
      const ob = pol.getElementsByTagName('outerBoundaryIs')[0] || pol;
      let pts = crd(ob.getElementsByTagName('coordinates')[0]?.textContent);
      if (pts.length > 3 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]) pts = pts.slice(0, -1);
      if (pts.length >= 3) return { nome, tipo: 'poligono', pts };
    }
    const pt = p.getElementsByTagName('Point')[0];
    if (pt) { const c = crd(pt.getElementsByTagName('coordinates')[0]?.textContent); if (c.length) return { nome, tipo: 'ponto', pts: c }; }
    return null;
  }).filter((v): v is ItemKml => !!v);
  if (!out.length) throw new Error('Nenhum ponto ou polígono encontrado no arquivo.');
  return out;
}

/* ---------- município e frentes pela localização (Google Geocoding) ---------- */
export interface Local { cidade: string; uf: string; logradouro: string; numero: string; bairro: string; cep: string }
export interface Frente { logradouro: string; numero: string; m: number | null; lados: number[] }
const digitos = (s: string) => (s || '').replace(/\D/g, '');
export async function localDoPonto(lat: number, lng: number): Promise<Local> {
  const { google } = window as any;
  const { results } = await new google.maps.Geocoder().geocode({ location: { lat, lng } });
  if (!results?.length) throw new Error('sem resultado');
  const comp = (tipo: string, c = 'long_name') => ((results.find((x: any) => x.address_components.some((a: any) => a.types.includes(tipo)))?.address_components.find((a: any) => a.types.includes(tipo)) || {}) as any)[c] || '';
  const rua = results.find((x: any) => x.types.includes('street_address') || x.types.includes('premise') || x.types.includes('route'))?.address_components || [];
  const rc = (t: string) => rua.find((a: any) => a.types.includes(t))?.long_name || '';
  return { cidade: comp('administrative_area_level_2') || comp('locality'), uf: comp('administrative_area_level_1', 'short_name'), logradouro: rc('route'), numero: rc('street_number'),
    bairro: comp('sublocality_level_1') || comp('sublocality') || comp('neighborhood'), cep: digitos(comp('postal_code')) };
}
/* um ponto 10 m para fora do meio de cada lado com 6 m ou mais (os 8 maiores) */
function nvLados(poly: P[]) {
  const pj = nvProj(centro(poly)[0]), Q = poly.map(pj.xy), sinal = Math.sign(Q.reduce((s, p, i) => { const q = Q[(i + 1) % Q.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) || 1;
  return Q.map((p, i) => { const q = Q[(i + 1) % Q.length], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy); return { i, L, fora: pj.ll([(p[0] + q[0]) / 2 + (sinal * dy / L) * 10, (p[1] + q[1]) / 2 - (sinal * dx / L) * 10]) }; })
    .filter((l) => l.L >= 6).sort((x, y) => y.L - x.L).slice(0, 8);
}
export const normRua = (s: string) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
export async function frentes(poly: P[]): Promise<Frente[]> {
  const ruas = new Map<string, Frente>();
  for (const l of nvLados(poly)) {
    let r: Local | null = null;
    try { r = await localDoPonto(l.fora[0], l.fora[1]); } catch { continue; }
    if (!r?.logradouro) continue;
    const k = normRua(r.logradouro), x = ruas.get(k) || { logradouro: r.logradouro, numero: '', m: 0, lados: [] };
    x.m = (x.m || 0) + l.L; x.lados.push(l.i); if (!x.numero && r.numero) x.numero = r.numero; ruas.set(k, x);
  }
  return [...ruas.values()].sort((a, b) => (b.m || 0) - (a.m || 0));
}
/* nome de referência: o logradouro sem o tipo (Rua, Avenida...) e sem o número (decisão do Moisés, 4/nov/2026) */
const NV_TIPO_LOG = /^(rua|r\.|avenida|av\.?|alameda|al\.?|travessa|trav\.?|tv\.?|estrada|estr\.?|est\.|pra[çc]a|p[çc]a\.?|rodovia|rod\.?|largo|lgo\.?|viela|via|viaduto|ladeira|passagem|beco|vila|parque|pq\.?|servid[ãa]o|acesso|caminho|marginal)\s+/i;
export const nomeRef = (log: string | null | undefined) => (log || '').trim().replace(NV_TIPO_LOG, '').replace(/,.*$/, '').trim();
/** nome padrão: "Bairro - Rua" (rua sem o tipo e sem número; pedido do Moisés, 5/nov/2026) */
export const nomeBase = (bairro: string | null | undefined, log: string | null | undefined) => [(bairro || '').trim(), nomeRef(log)].filter(Boolean).join(' - ');
const nomeNorm = (s: string | null | undefined) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
/** repetido na base ganha 2, 3... (o primeiro fica sem número) */
export function nomeUnico(base: string, nomes: string[]) {
  const b = nomeNorm(base); if (!b) return base;
  let n = 0;
  for (const x of nomes) {
    const y = nomeNorm(x);
    if (y === b) n = Math.max(n, 1);
    else if (y.startsWith(b + ' ') && /^\d+$/.test(y.slice(b.length + 1))) n = Math.max(n, +y.slice(b.length + 1));
  }
  return n ? base + ' ' + (n + 1) : base;
}

/* ---------- lotes da prefeitura: soma das poligonais (proto_novo.js: engorda, lotesUniao, limpaPoly) ---------- */
/** cresce a poligonal m metros para fora (cada lote cresce 1 cm para os vizinhos se juntarem) */
function engorda(poly: P[], m: number): P[] {
  const pj = nvProj(centro(poly)[0]), Q = poly.map(pj.xy), n = Q.length;
  const s = Math.sign(Q.reduce((a, p, i) => { const q = Q[(i + 1) % n]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) || 1;
  const nor = (p: P, q: P): P => { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1; return [(s * dy) / L, (-s * dx) / L]; };
  return Q.map((p, i) => { const a = nor(Q[(i - 1 + n) % n], p), b = nor(p, Q[(i + 1) % n]), bx = a[0] + b[0], by = a[1] + b[1], k = (bx * bx + by * by) / 2 || 1; return pj.ll([p[0] + (m * bx) / k, p[1] + (m * by) / k]); });
}
/** tira os pontos que sobram da junção: colados (< 5 cm) ou em linha reta com os vizinhos */
function limpaPoly(poly: P[]): P[] {
  const pj = nvProj(centro(poly)[0]), Q = poly.map(pj.xy);
  let mudou = true;
  while (mudou && Q.length > 3) {
    mudou = false;
    for (let i = 0; i < Q.length && Q.length > 3; i++) {
      const a = Q[(i - 1 + Q.length) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.05 || Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2 < 0.02) { Q.splice(i, 1); mudou = true; i--; }
    }
  }
  return fixa(Q.map(pj.ll));
}
/** soma das poligonais dos lotes, em qualquer ordem; null quando algum não encosta nos outros */
export function lotesUniao(polys: P[][]): P[] | null {
  if (!polys.length) return null;
  if (polys.length === 1) return polys[0];
  const resto = polys.map((p) => engorda(p, 0.01));
  let u = resto.shift()!, mudou = true;
  while (resto.length && mudou) {
    mudou = false;
    for (let i = 0; i < resto.length; i++) { const j = uniaoPoly(u, resto[i]); if (j) { u = j; resto.splice(i, 1); i--; mudou = true; } }
  }
  return resto.length ? null : limpaPoly(u);
}

/** o pino depois de mudar a poligonal (pedido do Moisés, 6/nov/2026): o que a pessoa arrastou fica onde ela pôs; senão, o de
    antes fica se ainda cai dentro da poligonal nova; senão, vai para o centro dela */
export function pinoNovo(poly: P[], antes: P | null, movido: boolean): P {
  if (antes && (movido || dentroPoly(antes[0], antes[1], poly))) return antes;
  return centroPoly(poly);
}
