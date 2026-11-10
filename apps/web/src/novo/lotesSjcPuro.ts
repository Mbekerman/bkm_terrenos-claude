// Montagem de quadra do GeoSanja sem navegador (pedido do Moises, 10/nov/2026).
// O app (lotesSjc.ts) e o job da varredura (tools/geosanja/varredura) usam este arquivo.
// Não pode usar document, window nem fetch: o job roda no Node.
// Geometria igual à de geosampa.ts (UTM SIRGAS 2000, fuso 23S). Cópia de propósito:
// geosampa.ts lê a página ao carregar e o job não pode importá-lo.

export type Anel = number[][];
export interface LoteMontado { ic: string; an: Anel; daBase: boolean }

/** limites do mapa de lotes na ficha; o job passa os dele */
export const MAX_LOTES_APP = 300, MAX_PONTOS_APP = 1500, PARALELO_APP = 8;

/** UTM SIRGAS 2000 fuso 23S (EPSG:31983) -> [lat, lng] */
export function utmLatLng(E: number, N: number, l0 = -45): [number, number] {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2), x = E - 5e5, y = N - 1e7, M = y / k0;
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 ** 3) / 256)), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const p1 = mu + ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) + ((21 * e1 * e1) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) + ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) + ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1), C1 = ep2 * c * c, T1 = t * t, N1 = a / Math.sqrt(1 - e2 * s * s), R1 = (a * (1 - e2)) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - ((N1 * t) / R1) * ((D * D) / 2 - ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4) / 24 + ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6) / 720);
  const lng = (D - ((1 + 2 * T1 + C1) * D ** 3) / 6 + ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5) / 120) / c;
  return [(lat * 180) / Math.PI, l0 + (lng * 180) / Math.PI];
}
/** [lat, lng] -> UTM SIRGAS 2000 fuso 23S */
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
type Geom = { type?: string; coordinates?: unknown } | null | undefined;
export function geoAneis(g: Geom): number[][][] {
  if (!g?.type || g.coordinates == null) return [];
  const c = g.coordinates as number[][][];
  if (g.type === 'Polygon') return c;
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).flat();
  if (g.type === 'LineString') return [g.coordinates as number[][]];
  if (g.type === 'MultiLineString') return c;
  return [];
}
/** anel UTM fechado a partir do GeoJSON em graus (lng, lat), ou null */
export function anelUtm(g: Geom): Anel | null {
  const a = geoAneis(g)[0];
  if (!a?.length) return null;
  const r = a.map(([lng, lat]) => latLngUtm(lat, lng) as number[]);
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]);
  return r.length >= 4 ? r : null;
}

/** a quadra da inscrição: setor e quadra ("41.0024") */
export const quadraDe = (ic: string) => ic.slice(0, 7);
/** "41.0024.0011.0000" ou "41002400110000" → "41.0024.0011.0000" */
export function icFmt(s: string) {
  const d = s.replace(/\D/g, '');
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 6)}.${d.slice(6, 10)}.${d.slice(10)}` : s.trim();
}
/** quadra só com dígitos ("410024"), como app.lotes_prefeitura.quadra */
export function quadraDigitos(ic: string) {
  const d = ic.replace(/\D/g, '');
  return d.length >= 6 ? d.slice(0, 6) : d;
}
/** "410024" → "41.0024" */
export function quadraComPonto(dig: string) {
  const d = dig.replace(/\D/g, '');
  return d.length === 6 ? `${d.slice(0, 2)}.${d.slice(2)}` : dig;
}

export const bbDe = (an: Anel) => {
  const xs = an.map((p) => p[0]), ys = an.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
/** pontos a 1,5 m para fora de cada borda, a cada 8 m no máximo; o lado de dentro do anel fica de fora */
export function pontosVizinhos(r: Anel): number[][] {
  const pts: number[][] = [];
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1) continue;
    const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L, n = Math.max(1, Math.floor(L / 8));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      for (const sg of [1, -1]) {
        const p = [m[0] + sg * nx * 1.5, m[1] + sg * ny * 1.5];
        if (!geoNoAnel(p, r)) pts.push(p);
      }
    }
  }
  return pts;
}

export interface ClienteMontagem {
  /** inscrição no ponto; null na rua ou fora do cadastro; erro sobe (o app engole, o job não) */
  noPonto(lat: number, lng: number): Promise<string | null>;
  /** anel UTM fechado, ou null quando a inscrição não tem desenho */
  anel(ic: string): Promise<Anel | null>;
}
export interface OpcoesMontagem {
  ter?: Anel | null;
  ics?: string[];
  /** lotes já conhecidos: cobrem ponto e não são pedidos de novo */
  conhecidos?: { ic: string; an: Anel }[];
  /** das quadras achadas, quais já estão montadas e os lotes delas (não varre vizinho) */
  filtrarProntas?: (quadras: string[]) => Promise<{ prontas: string[]; lotes: { ic: string; an: Anel }[] }>;
  /** cada lote novo que chegou da prefeitura, para gravar sem esperar a célula inteira */
  aoLotes?: (lotes: LoteMontado[]) => Promise<void>;
  andamento?: (n: number) => void;
  /** true no meio de um lote: devolve o que já tem, sem erro */
  parar?: () => boolean;
  /** no fim da montagem, com todos os lotes achados (também os de quadra que não entrou na lista) */
  aoTermino?: (s: { todos: LoteMontado[]; quadras: string[]; prontas: string[]; completo: boolean }) => void | Promise<void>;
  /** célula vazia (parque, rio) não é erro; na ficha, poligonal sem lote continua sendo */
  vazioOk?: boolean;
  maxLotes?: number;
  maxPontos?: number;
  maxQuadras?: number;
  paralelo?: number;
  /** false: erro de rede sobe. true (ficha): vira ponto pulado e, se o lote inteiro falhar, a mensagem de sempre */
  engolirErro?: boolean;
  cliente: ClienteMontagem;
}
export interface ResultadoMontagem {
  lotes: LoteMontado[];
  quadras: string[];
  prontas: string[];
  pontos: number;
  completo: boolean;
  interrompido: boolean;
}

async function emLotes<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}
function fracao(an: Anel, ter: Anel) {
  const [x0, y0, x1, y1] = bbDe(an); let n = 0, d = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const pt = [x0 + ((x1 - x0) * (i + 0.5)) / 16, y0 + ((y1 - y0) * (j + 0.5)) / 16];
    if (!geoNoAnel(pt, an)) continue;
    n++;
    if (geoNoAnel(pt, ter)) d++;
  }
  return n ? d / n : 0;
}

/**
 * Os lotes das quadras que a poligonal ocupa (ter, UTM fechado) ou das quadras das inscrições dadas (ics).
 * Grade na poligonal (passo de 4 a 15 m) e, em seguida, vizinhos a 1,5 m até a rua.
 */
export async function montarQuadras(o: OpcoesMontagem): Promise<ResultadoMontagem> {
  const maxLotes = o.maxLotes ?? MAX_LOTES_APP, maxPontos = o.maxPontos ?? MAX_PONTOS_APP, paralelo = o.paralelo ?? PARALELO_APP;
  const maxQuadras = o.maxQuadras ?? 8, engolir = o.engolirErro !== false;
  const lotes = new Map<string, Anel>(), vazios: number[][] = [], fora = new Set<string>(), daBase = new Set<string>();
  let pontos = 0, interrompido = false;
  const porBase = (ls: { ic: string; an: Anel }[]) => {
    for (const l of ls) if (!lotes.has(l.ic) && l.an?.length >= 4) { lotes.set(l.ic, l.an); daBase.add(l.ic); }
  };
  porBase(o.conhecidos ?? []);
  const cobre = (p: number[]) => [...lotes.values()].some((an) => { const b = bbDe(an); return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && geoNoAnel(p, an); });
  const perto = (p: number[]) => vazios.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 1.2);
  const resultado = (quadras: string[], prontas: string[], completo: boolean): ResultadoMontagem => ({
    lotes: [...lotes].filter(([ic]) => quadras.includes(quadraDe(ic))).map(([ic, an]) => ({ ic, an, daBase: daBase.has(ic) })),
    quadras, prontas, pontos, completo, interrompido,
  });

  async function sondar(pts: number[][]): Promise<string[] | 'parar'> {
    if (o.parar?.()) { interrompido = true; return 'parar'; }
    const ok = pts.filter((p) => !cobre(p) && !perto(p)).slice(0, Math.max(0, maxPontos - pontos));
    pontos += ok.length;
    const res = await emLotes(ok, paralelo, async (p) => {
      const [la, ln] = utmLatLng(p[0], p[1]);
      try { return await o.cliente.noPonto(la, ln); }
      catch (e) { if (!engolir) throw e; return undefined; }
    });
    if (ok.length && res.every((r) => r === undefined)) throw new Error('O GeoSanja não respondeu. Tente de novo em instantes.');
    const novas = new Set<string>();
    res.forEach((ic, k) => { if (ic === null) vazios.push(ok[k]); else if (ic && !lotes.has(ic)) novas.add(ic); });
    return [...novas];
  }
  async function trazer(ics: string[]) {
    const ans = await emLotes(ics, paralelo, async (ic) => {
      try { return await o.cliente.anel(ic); }
      catch (e) { if (!engolir) throw e; return null; }
    });
    const novos: LoteMontado[] = [];
    ics.forEach((ic, k) => {
      const an = ans[k];
      if (an && an.length >= 4) { lotes.set(ic, an); novos.push({ ic, an, daBase: false }); }
      else fora.add(ic);
    });
    o.andamento?.(lotes.size);
    if (novos.length && o.aoLotes) await o.aoLotes(novos);
  }

  let quadras: string[] = [], prontas: string[] = [];
  if (o.ter) {
    const ter = o.ter, area = geoAreaAnel(ter), [x0, y0, x1, y1] = bbDe(ter), s = Math.max(4, Math.min(15, Math.sqrt(area / 250)));
    const grade: number[][] = [];
    for (let x = x0 + s / 2; x < x1; x += s) for (let y = y0 + s / 2; y < y1; y += s) if (geoNoAnel([x, y], ter)) grade.push([x, y]);
    if (!grade.length) grade.push([(x0 + x1) / 2, (y0 + y1) / 2]);
    while (!interrompido && pontos < maxPontos && lotes.size < maxLotes) {
      const resta = grade.filter((p) => !cobre(p) && !perto(p));
      if (!resta.length) break;
      const lote = resta.filter((_p, i) => i % Math.max(1, Math.floor(resta.length / paralelo)) === 0).slice(0, paralelo);
      const novas = await sondar(lote);
      if (novas === 'parar') break;
      if (novas.length) await trazer(novas);
      lote.forEach((p) => { if (!cobre(p) && !perto(p)) vazios.push(p); });
    }
    const peso: Record<string, number> = {};
    lotes.forEach((an, ic) => { const k = quadraDe(ic); peso[k] = Math.max(peso[k] || 0, fracao(an, ter) * geoAreaAnel(an)); });
    quadras = Object.entries(peso).filter(([, v]) => v >= 10).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!quadras.length) quadras = Object.keys(peso);
    if (!quadras.length) {
      if (interrompido || o.vazioOk) return resultado([], [], o.vazioOk === true && !interrompido);
      throw new Error('A poligonal não ocupa nenhum lote do cadastro do GeoSanja.');
    }
    quadras = quadras.slice(0, maxQuadras);
  } else {
    const ics = [...new Set(o.ics || [])];
    if (o.filtrarProntas) {
      const b = await o.filtrarProntas([...new Set(ics.map(quadraDe))]);
      porBase(b.lotes);
      prontas = b.prontas;
    }
    await trazer(ics.filter((ic) => !lotes.has(ic)));
    quadras = [...new Set([...lotes.keys()].map(quadraDe))].slice(0, maxQuadras);
    if (!quadras.length) {
      if (interrompido || o.vazioOk) return resultado([], [], o.vazioOk === true && !interrompido);
      throw new Error('O GeoSanja não achou o lote destas inscrições.');
    }
  }

  if (o.ter && o.filtrarProntas && !interrompido) {
    const b = await o.filtrarProntas(quadras);
    porBase(b.lotes);
    prontas = b.prontas;
    o.andamento?.(lotes.size);
  }
  if (interrompido) return resultado(quadras, prontas, false);

  const daQuadra = (ic: string) => quadras.includes(quadraDe(ic));
  const feitos = new Set<string>([...lotes.keys()].filter((ic) => prontas.includes(quadraDe(ic))));
  let fila = [...lotes.keys()].filter((ic) => daQuadra(ic) && !feitos.has(ic));
  while (fila.length && pontos < maxPontos && lotes.size < maxLotes) {
    if (o.parar?.()) { interrompido = true; break; }
    const pts: number[][] = [];
    fila.forEach((ic) => {
      feitos.add(ic);
      pts.push(...pontosVizinhos(lotes.get(ic)!));
    });
    const novas = await sondar(pts);
    if (novas === 'parar') break;
    const pedidas = novas.filter((ic) => !fora.has(ic));
    if (pedidas.length) await trazer(pedidas);
    fila = [...lotes.keys()].filter((ic) => daQuadra(ic) && !feitos.has(ic));
  }
  const completo = !interrompido && pontos < maxPontos && lotes.size < maxLotes;
  if (o.aoTermino) await o.aoTermino({
    todos: [...lotes].map(([ic, an]) => ({ ic, an, daBase: daBase.has(ic) })),
    quadras, prontas, completo,
  });
  return resultado(quadras, prontas, completo);
}
