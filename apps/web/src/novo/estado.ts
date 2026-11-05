import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabase';
import type { LoteSql } from './geosampa';
import { areaPoly, centroPoly, fixa, frentes, geojson, localDoPonto, type Frente, type ItemKml, type Local, type P } from './geo';

// Estado do Novo terreno (proto_novo.js: UI.nv, UI.nvKmz e o pedido de desenho no mapa), num store pequeno que
// a janela do cadastro (NovoTerreno.tsx) e a página Mapa leem.

export interface Sobre {
  id: string; codigo: string; nome: string; situacao: string; motivo: 'mesma_area' | 'parcial';
  area: number; pctNova: number; pctExist: number;
}
export interface Nv {
  poly: P[]; ponto: P; area: number; fonte: 'mapa' | 'kmz' | 'sql'; nomeKmz?: string;
  sqls?: LoteSql[];               // fonte 'sql': os lotes que entram no terreno, sem parte
  sobre: Sobre[] | null;          // null: procurando
  ignorados?: Sobre[];            // "É outro terreno, cadastrar mesmo assim"
  local: Local | null; frentes: Frente[] | null; buscando: boolean;
  nome?: string;
  pri?: number;                   // a frente escolhida como acesso principal (índice em frentes)
  lgFeito?: boolean;              // o mapa de lotes da prefeitura já foi aberto (abre sozinho uma vez, em São Paulo)
  porLotes?: boolean;             // a poligonal é a soma dos lotes marcados
  polyDesenho?: P[];              // a desenhada, guardada quando a poligonal passa a ser a dos lotes
}
/** mapa de lotes da prefeitura: depois da poligonal (nv) ou pela janela Incluir por SQL (sql, com as quadras dos SQLs) */
export interface Lotes { modo: 'nv' | 'sql'; quadras?: string[] }
interface Estado { aberto: boolean; kmz: ItemKml[] | null; nv: Nv | null; sql: LoteSql[] | null; lotes: Lotes | null; desenho: { p0?: P; n: number } | null; erro?: string }

let E: Estado = { aberto: false, kmz: null, nv: null, sql: null, lotes: null, desenho: null };
const ouvintes = new Set<() => void>();
const mudar = (p: Partial<Estado>) => { E = { ...E, ...p }; ouvintes.forEach((f) => f()); };
export const useNovo = () => useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => E);
export const novoEstado = () => E;

export const abrirNovo = () => mudar({ aberto: true, nv: null, kmz: null, sql: null, lotes: null });
export const fecharNovo = () => mudar({ aberto: false, nv: null, kmz: null, sql: null, lotes: null });
export const voltarPasso1 = () => mudar({ aberto: true, nv: null, kmz: null, sql: null, lotes: null });
/** "Incluir por SQL" (São Paulo): a lista dos lotes digitados; null fora dessa tela */
export const listaSql = (sql: LoteSql[] | null) => mudar({ sql });
export const abrirLotes = (lotes: Lotes | null) => mudar({ lotes });
export const escolherKmz = (kmz: ItemKml[] | null) => mudar({ aberto: true, kmz, nv: null });
/** pede à página Mapa que entre no modo de desenho (com o primeiro ponto, se veio do clique direito) */
let nDes = 0;
export const pedirDesenho = (p0?: P) => mudar({ aberto: false, nv: null, kmz: null, desenho: { p0, n: ++nDes } });
export const desenhoAtendido = () => mudar({ desenho: null });
export const atualizarNv = (p: Partial<Nv>) => { if (E.nv) mudar({ nv: { ...E.nv, ...p } }); };

/** a poligonal pronta (desenhada ou do KMZ): procura sobreposição e o endereço */
export async function poligonal(poly0: P[], fonte: 'mapa' | 'kmz' | 'sql', empresa: string, nomeKmz?: string, sqls?: LoteSql[], extra?: Partial<Nv>) {
  const poly = fixa(poly0);
  const nv: Nv = { poly, ponto: centroPoly(poly), area: areaPoly(poly) || 0, fonte, nomeKmz, sqls, sobre: null, local: null, frentes: null, buscando: true, ...extra };
  mudar({ aberto: true, kmz: null, sql: null, lotes: null, nv });
  const atual = () => E.nv && E.nv.poly === poly;
  /* terrenos que já ocupam parte da área (app.terrenos_sobrepostos; a faixa de até 5 m na divisa não conta) */
  supabase.rpc('terrenos_sobrepostos', { p_empresa: empresa, p_poligono: geojson(poly) }).then(({ data, error }) => {
    if (!atual()) return;
    if (error) { console.warn('sobreposição', error); atualizarNv({ sobre: [] }); return; }
    atualizarNv({ sobre: (data || []).map((r: Record<string, unknown>) => ({ id: r.terreno_id as string, codigo: r.codigo as string, nome: r.nome as string, situacao: r.situacao as string,
      motivo: r.motivo as Sobre['motivo'], area: Number(r.area_sobreposta_m2), pctNova: Number(r.pct_da_nova), pctExist: Number(r.pct_do_existente) })) });
  });
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
