/* eslint-disable @typescript-eslint/no-explicit-any */
// Lotes da prefeitura em São José dos Campos (pedido do Moises, 10/nov/2026): o GeoSanja não deixa o visitante baixar a camada
// de lotes (no GeoSampa, o WFS traz a quadra inteira de uma vez), mas responde a inscrição do lote num ponto (/v1/inscricao/bycoord,
// x = latitude, y = longitude; vazio na rua) e o desenho do lote pela inscrição (/v1/localizar, SearchICTool). Com as duas:
// 1. a poligonal é varrida por uma grade de pontos, pulando o que já caiu num lote achado, e dá os lotes que ela toca;
// 2. as quadras são as dos lotes com 10 m² ou mais dentro da poligonal (os dois primeiros blocos da inscrição, setor e quadra);
// 3. cada quadra é montada inteira pelos vizinhos: pontos a 1,5 m para fora de cada borda dos lotes achados; o da mesma quadra
//    entra e é varrido também, o de outra quadra fica de fora e a rua não responde, o que faz a busca parar sozinha nas ruas.
// Tudo em UTM 23S (metros), como o mapa de lotes de São Paulo (LotesGeo.tsx).
// A varredura (grade, vizinhos a 1,5 m, parada na rua) mora em lotesSjcPuro.ts, compartilhada com o job
// tools/geosanja/varredura. Aqui ficam o token, o paralelo de 8, o cache de 90 dias (lotesBase.ts) e as plantas.
import { GSJ_BASE, gsjLote, gsjToken } from './geosanja';
import { anelUtm, bbDe, geoAreaAnel, montarQuadras, quadraDe, type Anel } from './lotesSjcPuro';
import type { BaseLotes } from './lotesBase';

export { quadraDe };
export interface LoteGsj { ic: string; an: Anel }

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
async function anelDe(ic: string): Promise<Anel | null> {
  const g = await gsjLote(ic);
  return g ? anelUtm(g) : null;
}

/**
 * Os lotes das quadras que a poligonal ocupa (ter, UTM fechado) ou das quadras das inscrições dadas (ics), cada quadra inteira.
 * andamento(n): quantos lotes já achou.
 */
export async function quadrasSjc(o: { ter?: Anel | null; ics?: string[]; andamento?: (n: number) => void; base?: BaseLotes }): Promise<{ lotes: LoteGsj[]; quadras: string[] }> {
  if (!GSJ_BASE) throw new Error('A busca no GeoSanja funciona na versão publicada.');
  let conhecidos: { ic: string; an: Anel }[] | undefined;
  if (o.base && o.ter) {
    const [x0, y0, x1, y1] = bbDe(o.ter);
    conhecidos = await o.base.perto([x0 - 30, y0 - 30, x1 + 30, y1 + 30]);
    o.andamento?.(conhecidos.filter((l) => l.an?.length >= 4).length);
  }
  const r = await montarQuadras({
    ter: o.ter, ics: o.ics, andamento: o.andamento, conhecidos,
    filtrarProntas: o.base ? (qs) => o.base!.quadras(qs) : undefined,
    aoTermino: o.base ? (s) => {
      const novas = s.completo ? s.quadras.filter((k) => !s.prontas.includes(k)) : [];
      const ls = s.todos.filter((l) => (novas.includes(quadraDe(l.ic)) || !l.daBase) && !(l.daBase && s.prontas.includes(quadraDe(l.ic))));
      void o.base!.guardar(ls, novas, quadraDe, geoAreaAnel);
    } : undefined,
    cliente: { noPonto: (lat, lng) => gsjNoPonto(lat, lng), anel: (ic) => anelDe(ic) },
  });
  return { lotes: r.lotes.map(({ ic, an }) => ({ ic, an })), quadras: r.quadras };
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
