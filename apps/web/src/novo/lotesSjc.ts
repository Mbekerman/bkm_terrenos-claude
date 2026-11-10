/* eslint-disable @typescript-eslint/no-explicit-any */
// Lotes da prefeitura em São José dos Campos (pedido do Moises, 10/nov/2026): o GeoSanja não deixa o visitante baixar a camada
// de lotes (no GeoSampa, o WFS traz a quadra inteira de uma vez), mas responde a inscrição do lote num ponto (/v1/inscricao/bycoord,
// x = latitude, y = longitude; vazio na rua) e o desenho do lote pela inscrição (/v1/localizar, SearchICTool). Com as duas:
// 1. a poligonal é varrida por uma grade de pontos, pulando o que já caiu num lote achado, e dá os lotes que ela toca;
// 2. as quadras são as dos lotes com 10 m² ou mais dentro da poligonal (os dois primeiros blocos da inscrição, setor e quadra);
// 3. cada quadra é montada inteira pelos vizinhos: pontos a 1,5 m para fora de cada borda dos lotes achados; o da mesma quadra
//    entra e é varrido também, o de outra quadra fica de fora e a rua não responde, o que faz a busca parar sozinha nas ruas.
// Tudo em UTM 23S (metros), como o mapa de lotes de São Paulo (LotesGeo.tsx).
import { GSJ_BASE, gsjLote, gsjToken } from './geosanja';
import { geoAneis, geoAreaAnel, geoNoAnel, latLngUtm, utmLatLng } from './geosampa';

type An = number[][];
export interface LoteGsj { ic: string; an: An }
/** limites para não varrer sem fim (gleba enorme, quadra sem rua em volta) */
const MAX_LOTES = 300, MAX_PONTOS = 1500, PARALELO = 8;

/** inscrição do lote no ponto; null na rua ou fora do cadastro */
export async function gsjNoPonto(lat: number, lng: number): Promise<string | null> {
  const ped = async (tk: string) => fetch(`${GSJ_BASE}inscricao/bycoord?x=${lat.toFixed(8)}&y=${lng.toFixed(8)}`, { headers: { Authorization: 'Bearer ' + tk }, signal: AbortSignal.timeout(30_000) });
  let r = await ped(await gsjToken());
  if (r.status === 401) r = await ped(await gsjToken(true));
  if (!r.ok) throw new Error('GeoSanja respondeu ' + r.status);
  const t = (await r.text()).trim();
  return /^\d{2}\.\d{4}\.\d{4}\.\d{4}$/.test(t) ? t : null;
}
/** o lote da inscrição em UTM (anel fechado), ou null */
async function anelDe(ic: string): Promise<An | null> {
  const g = await gsjLote(ic);
  if (!g) return null;
  const r = geoAneis(g)[0].map(([lng, lat]) => latLngUtm(lat, lng) as number[]);
  if (r.length && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1])) r.push(r[0]);
  return r;
}
/** a quadra da inscrição: setor e quadra ("41.0024") */
export const quadraDe = (ic: string) => ic.slice(0, 7);

async function emLotes<T, R>(xs: T[], f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(PARALELO, xs.length) }, async () => { while (i < xs.length) { const k = i++; out[k] = await f(xs[k]); } }));
  return out;
}
const bbDe = (an: An) => { const xs = an.map((p) => p[0]), ys = an.map((p) => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
function fracao(an: An, ter: An) {
  const [x0, y0, x1, y1] = bbDe(an); let n = 0, d = 0;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) { const pt = [x0 + ((x1 - x0) * (i + 0.5)) / 16, y0 + ((y1 - y0) * (j + 0.5)) / 16]; if (!geoNoAnel(pt, an)) continue; n++; if (geoNoAnel(pt, ter)) d++; }
  return n ? d / n : 0;
}

/**
 * Os lotes das quadras que a poligonal ocupa (ter, UTM fechado) ou das quadras das inscrições dadas (ics), cada quadra inteira.
 * andamento(n): quantos lotes já achou.
 */
export async function quadrasSjc(o: { ter?: An | null; ics?: string[]; andamento?: (n: number) => void }): Promise<{ lotes: LoteGsj[]; quadras: string[] }> {
  if (!GSJ_BASE) throw new Error('A busca no GeoSanja funciona na versão publicada.');
  const lotes = new Map<string, An>(), vazios: number[][] = [], fora = new Set<string>();
  let pontos = 0;
  const cobre = (p: number[]) => [...lotes.values()].some((an) => { const b = bbDe(an); return p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3] && geoNoAnel(p, an); });
  const perto = (p: number[]) => vazios.some((v) => Math.hypot(v[0] - p[0], v[1] - p[1]) < 1.2);
  /** consulta os pontos (UTM) e devolve as inscrições novas, ainda sem desenho */
  async function sondar(pts: number[][]): Promise<string[]> {
    const ok = pts.filter((p) => !cobre(p) && !perto(p)).slice(0, Math.max(0, MAX_PONTOS - pontos));
    pontos += ok.length;
    const res = await emLotes(ok, async (p) => { const [la, ln] = utmLatLng(p[0], p[1]); try { return await gsjNoPonto(la, ln); } catch { return undefined; } });
    if (ok.length && res.every((r) => r === undefined)) throw new Error('O GeoSanja não respondeu. Tente de novo em instantes.');
    const novas = new Set<string>();
    res.forEach((ic, k) => { if (ic === null) vazios.push(ok[k]); else if (ic && !lotes.has(ic)) novas.add(ic); });
    return [...novas];
  }
  /** busca o desenho das inscrições e guarda os lotes (os sem desenho viram "fora") */
  async function trazer(ics: string[]) {
    const ans = await emLotes(ics, async (ic) => { try { return await anelDe(ic); } catch { return null; } });
    ics.forEach((ic, k) => { const an = ans[k]; if (an && an.length >= 4) lotes.set(ic, an); else fora.add(ic); });
    o.andamento?.(lotes.size);
  }

  let quadras: string[];
  if (o.ter) {
    /* 1. a grade na poligonal: passo pelo tamanho (4 a 15 m), sempre pulando o que já caiu num lote */
    const ter = o.ter, area = geoAreaAnel(ter), [x0, y0, x1, y1] = bbDe(ter), s = Math.max(4, Math.min(15, Math.sqrt(area / 250)));
    const grade: number[][] = [];
    for (let x = x0 + s / 2; x < x1; x += s) for (let y = y0 + s / 2; y < y1; y += s) if (geoNoAnel([x, y], ter)) grade.push([x, y]);
    if (!grade.length) grade.push([(x0 + x1) / 2, (y0 + y1) / 2]);
    while (pontos < MAX_PONTOS && lotes.size < MAX_LOTES) {
      const resta = grade.filter((p) => !cobre(p) && !perto(p));
      if (!resta.length) break;
      /* um ponto por vez em cada frente: os primeiros da fila e espalhados, para um lote grande cobrir muitos de uma vez */
      const lote = resta.filter((_p, i) => i % Math.max(1, Math.floor(resta.length / PARALELO)) === 0).slice(0, PARALELO);
      const novas = await sondar(lote);
      if (novas.length) await trazer(novas);
      lote.forEach((p) => { if (!cobre(p) && !perto(p)) vazios.push(p); });
    }
    const peso: Record<string, number> = {};
    lotes.forEach((an, ic) => { const k = quadraDe(ic); peso[k] = Math.max(peso[k] || 0, fracao(an, ter) * geoAreaAnel(an)); });
    quadras = Object.entries(peso).filter(([, v]) => v >= 10).sort((a, b) => b[1] - a[1]).map(([k]) => k);
    if (!quadras.length) quadras = Object.keys(peso);
    if (!quadras.length) throw new Error('A poligonal não ocupa nenhum lote do cadastro do GeoSanja.');
    quadras = quadras.slice(0, 8);
  } else {
    const ics = [...new Set(o.ics || [])];
    await trazer(ics);
    quadras = [...new Set([...lotes.keys()].map(quadraDe))].slice(0, 8);
    if (!quadras.length) throw new Error('O GeoSanja não achou o lote destas inscrições.');
  }

  /* 2. cada quadra inteira pelos vizinhos: pontos a 1,5 m para fora de cada borda, a cada 8 m no máximo */
  /* os lotes de outras quadras ficam guardados só para não perguntar de novo pelos pontos deles; saem no fim */
  const daQuadra = (ic: string) => quadras.includes(quadraDe(ic));
  let fila = [...lotes.keys()].filter(daQuadra);
  const feitos = new Set<string>();
  while (fila.length && pontos < MAX_PONTOS && lotes.size < MAX_LOTES) {
    const pts: number[][] = [];
    fila.forEach((ic) => {
      feitos.add(ic);
      const r = lotes.get(ic)!;
      for (let i = 0; i < r.length - 1; i++) {
        const a = r[i], b = r[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1) continue;
        const nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L, n = Math.max(1, Math.floor(L / 8));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
          for (const sg of [1, -1]) { const p = [m[0] + sg * nx * 1.5, m[1] + sg * ny * 1.5]; if (!geoNoAnel(p, r)) pts.push(p); }
        }
      }
    });
    const novas = (await sondar(pts)).filter((ic) => !fora.has(ic));
    if (novas.length) await trazer(novas);
    fila = [...lotes.keys()].filter((ic) => daQuadra(ic) && !feitos.has(ic));
  }
  return { lotes: [...lotes].filter(([ic]) => daQuadra(ic)).map(([ic, an]) => ({ ic, an })), quadras };
}

/* ---------- planta do loteamento aprovado (pedido do Moises, 10/nov/2026) ---------- */
// O grupo "14 - LOTEAMENTOS APROVADOS" do GeoSanja tem uma camada raster por folha de planta escaneada, sem o retângulo de cada
// uma na lista de camadas: o índice (camada, título, [oeste, sul, leste, norte]) fica em loteamentos-sjc.json, gerado por
// tools/geosanja/loteamentos.py. A planta sai pelo WMS (GetMap) em blocos de até 4000 px (o servidor recusa imagem maior) e é
// montada numa imagem só, com até 8000 px no lado maior.
export interface PlantaSjc { camada: string; titulo: string; bb: number[] }
/** quanto da folha há em volta do ponto (uns 60 m): pixels opacos e, deles, os que não são papel branco */
async function amostraPlanta(camada: string, lat: number, lng: number): Promise<[number, number]> {
  const d = 0.0003, u = new URL(GSJ_BASE + 'proxy');
  const q: Record<string, string | number> = { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: camada, STYLES: '', SRS: 'EPSG:4326', BBOX: [lng - d, lat - d, lng + d, lat + d].join(','),
    WIDTH: 16, HEIGHT: 16, FORMAT: 'image/png', TRANSPARENT: 'true', authToken: await gsjToken() };
  Object.entries(q).forEach(([a, v]) => u.searchParams.set(a, String(v)));
  const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
  if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) throw new Error('amostra');
  const cv = document.createElement('canvas'); cv.width = 16; cv.height = 16;
  const g = cv.getContext('2d')!; g.drawImage(await createImageBitmap(await r.blob()), 0, 0);
  const px = g.getImageData(0, 0, 16, 16).data; let op = 0, cor = 0;
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 0) { op++; if (px[i] + px[i + 1] + px[i + 2] < 720) cor++; }
  return [op, cor];
}
/** as folhas que cobrem o ponto: pelo retângulo do índice e, conferindo a imagem em volta do ponto, sem as que ali são vazias;
 * primeiro as que têm desenho em volta do ponto, depois as menores */
export async function plantasNoPonto(lat: number, lng: number): Promise<PlantaSjc[]> {
  const idx = (await import('./loteamentos-sjc.json')).default as [string, string, number[]][];
  const area = (b: number[]) => (b[2] - b[0]) * (b[3] - b[1]);
  const cs = idx.filter(([, , b]) => lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3]).map(([camada, titulo, bb]) => ({ camada, titulo, bb }));
  const am = await Promise.all(cs.slice(0, 12).map(async (c) => { try { return await amostraPlanta(c.camada, lat, lng); } catch { return null; } }));
  return cs.slice(0, 12).map((c, i) => ({ c, a: am[i] })).filter((x) => !x.a || x.a[0] > 0)
    .sort((x, y) => (y.a?.[1] ?? 0) - (x.a?.[1] ?? 0) || area(x.c.bb) - area(y.c.bb)).map((x) => x.c);
}
/** a folha inteira em JPEG */
export async function baixarPlanta(p: PlantaSjc): Promise<Blob> {
  if (!GSJ_BASE) throw new Error('A busca no GeoSanja funciona na versão publicada.');
  const [w0, s0, e0, n0] = p.bb, k = Math.cos((((s0 + n0) / 2) * Math.PI) / 180), lw = (e0 - w0) * k, lh = n0 - s0;
  const W = Math.round(lw >= lh ? 8000 : (8000 * lw) / lh), H = Math.round(lw >= lh ? (8000 * lh) / lw : 8000);
  const nx = Math.ceil(W / 4000), ny = Math.ceil(H / 4000), tw = Math.ceil(W / nx), th = Math.ceil(H / ny), tk = await gsjToken();
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  const sx = (e0 - w0) / W, sy = (n0 - s0) / H;
  await Promise.all(Array.from({ length: nx * ny }, async (_v, i) => {
    const cx = i % nx, cy = Math.floor(i / nx), x = cx * tw, y = cy * th, pw = Math.min(tw, W - x), ph = Math.min(th, H - y), u = new URL(GSJ_BASE + 'proxy');
    const q: Record<string, string | number> = { SERVICE: 'WMS', VERSION: '1.1.1', REQUEST: 'GetMap', LAYERS: p.camada, STYLES: '', SRS: 'EPSG:4326',
      BBOX: [w0 + x * sx, n0 - (y + ph) * sy, w0 + (x + pw) * sx, n0 - y * sy].join(','), WIDTH: pw, HEIGHT: ph, FORMAT: 'image/jpeg', BGCOLOR: '0xFFFFFF', authToken: tk };
    Object.entries(q).forEach(([a, v]) => u.searchParams.set(a, String(v)));
    const r = await fetch(u, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok || !/image/.test(r.headers.get('content-type') || '')) throw new Error('O GeoSanja não devolveu a planta. Tente de novo em instantes.');
    g.drawImage(await createImageBitmap(await r.blob()), x, y);
  }));
  return new Promise((ok, falha) => cv.toBlob((b) => (b ? ok(b) : falha(new Error('Não deu para montar a imagem da planta.'))), 'image/jpeg', 0.9));
}
