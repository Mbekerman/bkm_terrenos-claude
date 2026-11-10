import { useSyncExternalStore } from 'react';

/* Buscas em segundo plano por terreno (GeoSampa, cartório, zona, frentes, entorno), para os campos que vêm delas mostrarem um
   carregando enquanto a busca corre (pedido do Moises, 9/nov/2026: o cartório aparecia em branco e só depois vinha). */
export type Fonte = 'geosampa' | 'geosanja' | 'cartorio' | 'zona' | 'frentes' | 'entorno';
/** campos das seções da ficha que vêm de outra fonte: o rótulo mostra o carregando enquanto ela busca */
export const FONTE_CAMPO: Record<string, Fonte[]> = { cartorio: ['cartorio', 'geosampa'], zona: ['zona'], posicao_quadra: ['frentes'], testada_principal_m: ['frentes'] };
const EM = new Map<string, number>();              // "terreno|fonte" → buscas em curso
const ouvintes = new Set<() => void>();
let versao = 0;
const mudar = () => { versao++; ouvintes.forEach((f) => f()); };

/** marca a fonte como em busca no terreno enquanto a promessa corre */
export async function buscando<T>(terreno: string, fonte: Fonte, p: Promise<T>): Promise<T> {
  const k = terreno + '|' + fonte;
  EM.set(k, (EM.get(k) ?? 0) + 1); mudar();
  try { return await p; } finally { const n = (EM.get(k) ?? 1) - 1; if (n > 0) EM.set(k, n); else EM.delete(k); mudar(); }
}
export const emBusca = (terreno: string, fontes: Fonte[]) => fontes.some((x) => EM.has(terreno + '|' + x));
export function useBuscando(terreno: string | null | undefined, fontes: Fonte[]) {
  useSyncExternalStore((f) => { ouvintes.add(f); return () => ouvintes.delete(f); }, () => versao);
  return !!terreno && emBusca(terreno, fontes);
}

const NOME: Record<Fonte, string> = { geosampa: 'Buscando no GeoSampa', geosanja: 'Buscando no GeoSanja', cartorio: 'Buscando no GeoSampa', zona: 'Buscando no GeoSampa', frentes: 'Medindo pela poligonal', entorno: 'Buscando no Google' };
/** o carregando: um círculo girando, com o texto quando `texto` (no lugar do "Não informado") */
export function Busca({ terreno, fontes, texto }: { terreno: string | null | undefined; fontes: Fonte[]; texto?: boolean }) {
  const on = useBuscando(terreno, fontes);
  if (!on) return null;
  const rot = NOME[fontes.find((x) => emBusca(terreno!, [x]))!] + '...';
  return <span className="busca" role="status" title={rot} aria-label={rot}><span className="busca-sp" aria-hidden="true" />{texto && <span className="busca-t">{rot}</span>}</span>;
}
