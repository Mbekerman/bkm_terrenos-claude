/* Ordenação dos terrenos (pedido do Moises, 9/nov/2026): segunda aba da gaveta de filtros, com os campos das colunas da
   tabela de Terrenos do protótipo (COLS_TER em tools/prototipo/proto_tabela.js), mais código, etapa e subetapa (9/nov/2026). Um clique ordena crescente, o segundo
   decrescente e o terceiro tira aquele campo; vários campos valem juntos na ordem em que foram escolhidos (o primeiro
   manda, os seguintes desempatam). Quem não tem o dado vai sempre para o fim, nos dois sentidos. */
import type { DadosFx, TerFx } from './dados';

export interface Ord { k: string; dir: 'asc' | 'desc' }
type V = string | number | null;
export interface DefOrd { k: string; l: string; dica: string; v: (t: TerFx, D: DadosFx) => V }

const ZONA: Record<string, string> = { leste: 'Leste', oeste: 'Oeste', norte: 'Norte', sul: 'Sul', centro: 'Centro', sudeste: 'Sudeste', sudoeste: 'Sudoeste', nordeste: 'Nordeste', noroeste: 'Noroeste' };
/** posição no funil do processo aberto (ativo ou Stand By) da fase mais adiante: fase, etapa e, com `sub`, subetapa;
    sem processo aberto, null (vai para o fim) */
function posFunil(t: TerFx, D: DadosFx, sub: boolean): number | null {
  let melhor: number | null = null;
  for (const p of t.procs) {
    if (p.status !== 'ativo' && p.status !== 'stand_by') continue;
    const fi = D.fases.findIndex((f) => f.k === p.fase);
    if (fi < 0) continue;
    const et = D.fases[fi].etapas, ei = et.findIndex((e) => e.k === p.etapa);
    const si = sub && ei >= 0 && p.sub ? et[ei].subs.findIndex((s) => s.k === p.sub) + 1 : 0;
    const v = fi * 1e6 + (ei + 1) * 1e3 + si;
    if (melhor == null || fi * 1e6 > Math.floor(melhor / 1e6) * 1e6) melhor = v;
  }
  return melhor;
}
const nomeDe = (L: [string, string][], id: string | null | undefined) => (id ? L.find((x) => x[0] === id)?.[1] ?? null : null);

export const ORD: DefOrd[] = [
  { k: 'ter', l: 'Terreno', dica: 'pelo nome', v: (t) => t.nome || null },
  { k: 'cod', l: 'Código', dica: 'A001, A002…', v: (t) => t.codigo },
  { k: 'etapa', l: 'Etapa', dica: 'ordem do funil, na fase mais adiante', v: (t, D) => posFunil(t, D, false) },
  { k: 'sub', l: 'Subetapa', dica: 'ordem do funil, dentro de cada etapa', v: (t, D) => posFunil(t, D, true) },
  { k: 'cid', l: 'Cidade', dica: 'município', v: (t) => t.cidade },
  { k: 'zona', l: 'Região', dica: 'Zona Norte, Sul…', v: (t) => (t.zona ? ZONA[t.zona] ?? t.zona : null) },
  { k: 'area', l: 'Imóvel', dica: 'pela área adotada', v: (t) => t.area },
  { k: 'massa', l: 'Estudo de massa', dica: 'pelas unidades do estudo de massa válido', v: (t) => t.massaUn },
  { k: 'viab', l: 'Viabilidade', dica: 'pelo VGV do estudo válido', v: (t) => t.vgv },
  { k: 'estudo', l: 'Empreendimento', dica: 'pelo VGV do estudo válido', v: (t) => t.vgv },
  { k: 'preco', l: 'Pedida', dica: 'pelo valor em dinheiro pedido', v: (t) => t.pedido },
  { k: 'prop', l: 'Proposta', dica: 'pelo valor em dinheiro da proposta ativa', v: (t) => t.proposta },
  { k: 'corretor', l: 'Corretor', dica: 'pelo primeiro corretor', v: (t, D) => nomeDe(D.corretores, t.corretores[0]) },
  { k: 'temp', l: 'Temperatura', dica: 'de 1 a 5', v: (t) => t.temp || null },
  { k: 'resp', l: 'Responsável', dica: 'pelo nome', v: (t, D) => nomeDe(D.pessoas, t.resp) },
];
const ORDK: Record<string, DefOrd> = Object.fromEntries(ORD.map((d) => [d.k, d]));

/** ordem guardada (sessão, endereço) só com campos que existem, sem repetir */
export function soOrdValida(o: unknown): Ord[] {
  if (!Array.isArray(o)) return [];
  const vistos = new Set<string>();
  return o.filter((x): x is Ord => !!x && ORDK[x.k] && (x.dir === 'asc' || x.dir === 'desc') && !vistos.has(x.k) && !!vistos.add(x.k)).map((x) => ({ k: x.k, dir: x.dir }));
}
/** crescente → decrescente → sem ordem; campo novo entra no fim da fila (desempata os anteriores) */
export function alternar(o: Ord[], k: string): Ord[] {
  const i = o.findIndex((x) => x.k === k);
  if (i < 0) return [...o, { k, dir: 'asc' }];
  if (o[i].dir === 'asc') return o.map((x, j) => (j === i ? { k, dir: 'desc' } : x));
  return o.filter((_, j) => j !== i);
}
/** compara dois terrenos pela ordem; 0 = empate (quem chama desempata) */
export function comparar(o: Ord[], D: DadosFx, a: TerFx | undefined, b: TerFx | undefined): number {
  for (const st of o) {
    const d = ORDK[st.k];
    if (!d) continue;
    const x = a ? d.v(a, D) : null, y = b ? d.v(b, D) : null;
    if (x == null && y == null) continue;
    if (x == null) return 1;
    if (y == null) return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt', { sensitivity: 'base', numeric: true });
    if (c) return st.dir === 'desc' ? -c : c;
  }
  return 0;
}
export const ordTxt = (o: Ord[]) => o.map((x) => `${ORDK[x.k]?.l ?? x.k} ${x.dir === 'desc' ? '↓' : '↑'}`).join(', ');
