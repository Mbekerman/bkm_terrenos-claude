/* eslint-disable @typescript-eslint/no-explicit-any */
// Vias do terreno (pedido do Moises, 9/nov/2026), contas puras para teste; a consulta ao GeoSampa está em consulta.ts.
//
// Classificação viária: só as ruas que são frente do terreno (frentesCalc.ts), ligadas à camada da CET pelo código do
// logradouro (codlog = cd_logradouro). A CET guarda a rua em trechos de quarteirão, cada um com a sua classificação; fica
// uma linha por rua, com a classificação mais alta entre os trechos junto do terreno e as outras ao lado.
//
// Rua sem saída: o GeoSampa não tem esse dado; sai da rede de eixos de logradouro da prefeitura (v_logradouro_segmento).
// Cada trecho de eixo é uma ligação entre duas pontas; um trecho é "sem saída" quando, cortando alguma ligação, ele fica
// separado da borda da área consultada (a rua só sai por um caminho, e esse caminho termina). Vale para o balão de retorno,
// que fecha um círculo no fim da rua. Viela, passagem e escadaria não contam como saída para carro.
import { geoAneis } from './geosampa';
import type { FrenteMedida } from './frentesCalc';

type Pt = number[];

/** ordem das classificações da CET, da mais baixa para a mais alta */
const CET_ORDEM = ['vias de pedestre', 'local', 'coletora', 'arterial', 'vtr', 'rodovia'];
export const cetNivel = (c: string | null | undefined) => CET_ORDEM.indexOf(String(c ?? '').trim().toLowerCase());

/** tipos de logradouro só de pedestre (viela, passagem, escadaria) */
export const PEDESTRE = /^(VE|VEL|PS|PSP|PSG|ESC|ESCD|PSS)$/i;

export interface CetFrente { nm_logradouro_completo: string; dc_tipo_classificacao_viaria: string | null; outras_classificacoes?: string[]; _dist_m?: number | null }

/** uma linha por rua de frente; `cet`: as feições da CET em volta (propriedades com cd_logradouro e _dist_m) */
export function classificarFrentes(frentes: FrenteMedida[], cet: any[]): CetFrente[] {
  return frentes.map((f) => {
    const cods = new Set(f.codlog ?? []);
    const fs = cet.map((x) => x.properties ?? x).filter((p) => cods.has(String(p.cd_logradouro ?? '')));
    if (!fs.length) return { nm_logradouro_completo: f.logradouro, dc_tipo_classificacao_viaria: null };
    /* só os trechos junto do terreno: o mais perto e os que estão a até 10 m além dele (o outro lado do cruzamento fica) */
    const d0 = Math.min(...fs.map((p) => p._dist_m ?? 0));
    const perto = fs.filter((p) => (p._dist_m ?? 0) <= d0 + 10);
    const cls = [...new Set(perto.map((p) => p.dc_tipo_classificacao_viaria).filter(Boolean) as string[])].sort((a, b) => cetNivel(b) - cetNivel(a));
    return {
      nm_logradouro_completo: perto[0].nm_logradouro_completo || f.logradouro,
      dc_tipo_classificacao_viaria: cls[0] ?? null,
      ...(cls.length > 1 ? { outras_classificacoes: cls.slice(1) } : {}),
      _dist_m: d0,
    };
  });
}

/** Trechos de eixo sem saída. `vias`: features de v_logradouro_segmento (UTM); `caixa`: [x0, y0, x1, y1] da área pedida
 * ao GeoSampa; ponta a menos de `margem` m da borda conta como saída (a rua continua fora da área). */
export function trechosSemSaida(vias: any[], caixa: number[], margem = 30): Set<number> {
  const chave = (p: Pt) => Math.round(p[0]) + ',' + Math.round(p[1]);
  const pts = new Map<string, Pt>();
  interface E { id: number; a: string; b: string; L: Pt[] }
  const es: E[] = [];
  for (const f of vias) {
    const p = f.properties ?? {};
    if (PEDESTRE.test(String(p.cd_tipo_logradouro ?? '').trim())) continue;
    for (const L of geoAneis(f.geometry)) {
      if (L.length < 2) continue;
      const a = chave(L[0]), b = chave(L[L.length - 1]);
      pts.set(a, L[0]); pts.set(b, L[L.length - 1]);
      es.push({ id: p.cd_identificador, a, b, L });
    }
  }
  const viz = new Map<string, { e: number; o: string }[]>();
  const liga = (u: string, v: string, e: number) => {
    (viz.get(u) ?? viz.set(u, []).get(u)!).push({ e, o: v });
    (viz.get(v) ?? viz.set(v, []).get(v)!).push({ e, o: u });
  };
  es.forEach((e, i) => liga(e.a, e.b, i));
  /* ponta solta que encosta no meio de outro trecho (o "T" sem nó no eixo): liga às pontas dele */
  const dSeg = (p: Pt, a: Pt, b: Pt) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy, t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)) : 0;
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  let extra = es.length;
  for (const [k, lst] of viz) {
    if (lst.length !== 1) continue;
    const p = pts.get(k)!;
    es.forEach((e, i) => {
      if (i === lst[0].e || e.a === k || e.b === k) return;
      for (let j = 0; j < e.L.length - 1; j++) if (dSeg(p, e.L[j], e.L[j + 1]) <= 2) { liga(k, e.a, extra++); liga(k, e.b, extra++); return; }
    });
  }
  const borda = new Set([...pts].filter(([, p]) => p[0] < caixa[0] + margem || p[0] > caixa[2] - margem || p[1] < caixa[1] + margem || p[1] > caixa[3] - margem).map(([k]) => k));
  const alcanca = (sem: number) => {
    const vis = new Set(borda), fila = [...borda];
    while (fila.length) for (const { e, o } of viz.get(fila.pop()!) ?? []) if (e !== sem && !vis.has(o)) { vis.add(o); fila.push(o); }
    return vis;
  };
  /* ponta morta: a que deixa de alcançar a borda quando se corta uma ligação (ou que nunca alcança) */
  const mortas = new Set<string>();
  const todas = alcanca(-1);
  for (const k of viz.keys()) if (!todas.has(k)) mortas.add(k);
  es.forEach((_e, i) => { const v = alcanca(i); for (const k of viz.keys()) if (!v.has(k)) mortas.add(k); });
  return new Set(es.filter((e) => mortas.has(e.a) || mortas.has(e.b)).map((e) => e.id));
}

export interface SemSaida { logradouro: string; pedestre?: boolean }
/** as frentes que dão só para trecho sem saída (ou só para viela, passagem ou escadaria) */
export function frentesSemSaida(frentes: FrenteMedida[], vias: any[], caixa: number[]): SemSaida[] {
  const mortos = trechosSemSaida(vias, caixa);
  const tipo = new Map<number, string>(vias.map((f) => [f.properties?.cd_identificador, String(f.properties?.cd_tipo_logradouro ?? '').trim()]));
  const r: SemSaida[] = [];
  for (const f of frentes) {
    const ids = f.segmentos ?? [];
    if (!ids.length) continue;
    if (ids.every((i) => PEDESTRE.test(tipo.get(i) ?? ''))) { r.push({ logradouro: f.logradouro, pedestre: true }); continue; }
    const carro = ids.filter((i) => !PEDESTRE.test(tipo.get(i) ?? ''));
    if (carro.every((i) => mortos.has(i))) r.push({ logradouro: f.logradouro });
  }
  return r;
}
