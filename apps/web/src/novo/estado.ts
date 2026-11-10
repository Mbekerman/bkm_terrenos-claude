import { useSyncExternalStore } from 'react';
import type { LoteSql } from './geosampa';
import { areaPoly, centroPoly, fixa, frentes, localDoPonto, type Frente, type ItemKml, type Local, type P } from './geo';

// Estado do Novo terreno (proto_novo.js: UI.nv, UI.nvKmz e o pedido de desenho no mapa), num store pequeno que
// a janela do cadastro (NovoTerreno.tsx) e a página Mapa leem.

/** terreno ativo que tem lote em comum com o cadastro (app.conflitos_cadastro), ou que ocupa parte da poligonal quando um
 *  dos lados não tem lote; a janela da sobreposição decide ao cadastrar (pedido do Moises, 10/nov/2026) */
export interface Conflito {
  terreno_id: string; codigo: string; nome: string; responsavel_id: string; sou_responsavel: boolean; por: 'lotes' | 'area'; mesmos_lotes: boolean;
  comuns: string[]; so_novo: string[]; so_existente: string[]; vencida: boolean; dias_sem_acao: number;
}
/** @deprecated a sobreposição pela poligonal no passo 1 saiu (10/nov/2026); fica o tipo para o "ignorados" antigo */
export interface Sobre { id: string; codigo: string }
export interface Nv {
  poly: P[]; ponto: P; area: number; fonte: 'mapa' | 'kmz' | 'sql'; nomeKmz?: string;
  sqls?: LoteSql[];               // fonte 'sql': os lotes que entram no terreno, sem parte
  sobre: Sobre[] | null;          // sempre []: a sobreposição se decide ao cadastrar (conflitos)
  ignorados?: Sobre[];
  origem?: string;                // origem do cadastro (passo 2)
  corretor?: string;              // corretor da primeira oferta (passo 2)
  conflitos?: Conflito[] | null;  // a janela da sobreposição, aberta ao cadastrar
  local: Local | null; frentes: Frente[] | null; buscando: boolean;
  nome?: string;
  pri?: number;                   // a frente escolhida como acesso principal (índice em frentes)
  lgFeito?: boolean;              // o mapa de lotes da prefeitura já foi aberto (abre sozinho uma vez, em São Paulo)
  porLotes?: boolean;             // a poligonal é a soma dos lotes marcados
  polyDesenho?: P[];              // a desenhada, guardada quando a poligonal passa a ser a dos lotes
}
/** mapa de lotes da prefeitura: depois da poligonal (nv) ou pela janela Incluir por SQL (sql, com as quadras dos SQLs) */
/** modo 'ficha': reaberto pelo "Escolher no mapa" da aba Terreno, com o terreno já cadastrado */
export interface LotesFicha { codigo: string; nome: string; poly: P[]; sqls: string[]; fechar: () => void; incluir: (marcados: LoteSql[], quadras: string[]) => void }
/** sjc: São José dos Campos, lotes pelo GeoSanja (lotesSjc.ts); ics: as inscrições digitadas, cujas quadras abrem no modo 'sql' */
export interface Lotes { modo: 'nv' | 'sql' | 'ficha'; quadras?: string[]; ics?: string[]; sjc?: boolean; ficha?: LotesFicha }
interface Estado { aberto: boolean; kmz: ItemKml[] | null; nv: Nv | null; sql: LoteSql[] | null; sqlSjc?: boolean; lotes: Lotes | null; desenho: { p0?: P; n: number } | null; erro?: string }

let E: Estado = { aberto: false, kmz: null, nv: null, sql: null, lotes: null, desenho: null };
const ouvintes = new Set<() => void>();
const mudar = (p: Partial<Estado>) => { E = { ...E, ...p }; ouvintes.forEach((f) => f()); };
export const useNovo = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => E);
export const novoEstado = () => E;

export const abrirNovo = () => mudar({ aberto: true, nv: null, kmz: null, sql: null, lotes: null });
export const fecharNovo = () => mudar({ aberto: false, nv: null, kmz: null, sql: null, lotes: null });
export const voltarPasso1 = () => mudar({ aberto: true, nv: null, kmz: null, sql: null, lotes: null });
/** "Incluir por SQL" (São Paulo) ou "Incluir por inscrição" (São José dos Campos, sjc): a lista dos lotes digitados; null fora dessa tela */
export const listaSql = (sql: LoteSql[] | null, sjc?: boolean) => mudar(sjc === undefined ? { sql } : { sql, sqlSjc: sjc });
export const abrirLotes = (lotes: Lotes | null) => mudar({ lotes });
export const escolherKmz = (kmz: ItemKml[] | null) => mudar({ aberto: true, kmz, nv: null });
/** pede à página Mapa que entre no modo de desenho (com o primeiro ponto, se veio do clique direito) */
let nDes = 0;
export const pedirDesenho = (p0?: P) => mudar({ aberto: false, nv: null, kmz: null, desenho: { p0, n: ++nDes } });
export const desenhoAtendido = () => mudar({ desenho: null });
export const atualizarNv = (p: Partial<Nv>) => { if (E.nv) mudar({ nv: { ...E.nv, ...p } }); };

/** a poligonal pronta (desenhada ou do KMZ): procura o endereço (a sobreposição se confere ao cadastrar, pelos lotes) */
export async function poligonal(poly0: P[], fonte: 'mapa' | 'kmz' | 'sql', _empresa: string, nomeKmz?: string, sqls?: LoteSql[], extra?: Partial<Nv>) {
  const poly = fixa(poly0);
  const nv: Nv = { poly, ponto: centroPoly(poly), area: areaPoly(poly) || 0, fonte, nomeKmz, sqls, sobre: [], local: null, frentes: null, buscando: true, ...extra };
  mudar({ aberto: true, kmz: null, sql: null, lotes: null, nv });
  const atual = () => E.nv && E.nv.poly === poly;
  /* município e frentes pela localização */
  let l: Local | null = null, fr: Frente[] = [];
  try { l = await localDoPonto(nv.ponto[0], nv.ponto[1]); } catch (e) { console.warn('local', e); }
  if (!atual()) return;
  atualizarNv({ local: l });
  try { fr = await frentes(poly); } catch (e) { console.warn('frentes', e); }
  if (!atual()) return;
  if (!fr.length && l?.logradouro) fr = [{ logradouro: l.logradouro, numero: l.numero, m: null, lados: [] }];
  atualizarNv({ frentes: fr, buscando: false });
}
