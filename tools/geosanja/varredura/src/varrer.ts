import { quadraDe, montarQuadras, type Anel, type ClienteMontagem, type LoteMontado } from '../../../../apps/web/src/novo/lotesSjcPuro.ts';
import { Freio } from './cliente.ts';
import type { BancoVarredura } from './banco.ts';

const FOLGA_M = 30;
const MAX_PONTOS = 4000;
const MAX_LOTES = 500;
const MAX_QUADRAS = 16;

export interface ResultadoCelula {
  completo: boolean;
  vazio: boolean;
  lotes: number;
  quadras: number;
  novos: number;
  atualizados: number;
  apagados: number;
  freio: Freio | null;
}

type Memoria = Pick<BancoVarredura, 'conhecidos' | 'prontas' | 'guardar'>;

async function guardarQuadras(mem: Memoria, lotes: LoteMontado[], quadras: string[]) {
  let apagados = 0;
  for (let i = 0; i < quadras.length; i += 20) {
    const qs = quadras.slice(i, i + 20);
    const ls = lotes.filter((l) => qs.includes(quadraDe(l.ic)));
    if (!ls.length) continue;
    if (ls.length > 3000) {
      await mem.guardar(ls.slice(0, 3000), []);
      continue;
    }
    apagados += (await mem.guardar(ls, qs)).apagados;
  }
  return apagados;
}

/** Uma célula: grade + vizinhos a 1,5 m. Quadra pronta ou ponto em lote conhecido não pede de novo. */
export async function varrerCelula(
  cel: { x0: number; y0: number; x1: number; y1: number },
  cliente: ClienteMontagem,
  mem: Memoria,
): Promise<ResultadoCelula> {
  const conta = { novos: 0, atualizados: 0, apagados: 0, quadras: 0 };
  const ter: Anel = [[cel.x0, cel.y0], [cel.x1, cel.y0], [cel.x1, cel.y1], [cel.x0, cel.y1], [cel.x0, cel.y0]];
  const conhecidos = await mem.conhecidos([cel.x0 - FOLGA_M, cel.y0 - FOLGA_M, cel.x1 + FOLGA_M, cel.y1 + FOLGA_M]);
  try {
    const r = await montarQuadras({
      ter, conhecidos, vazioOk: true, paralelo: 1, engolirErro: false,
      maxPontos: MAX_PONTOS, maxLotes: MAX_LOTES, maxQuadras: MAX_QUADRAS,
      cliente,
      filtrarProntas: (qs) => mem.prontas(qs),
      aoLotes: async (ls) => {
        for (let i = 0; i < ls.length; i += 3000) {
          const g = await mem.guardar(ls.slice(i, i + 3000), []);
          conta.novos += g.novos;
          conta.atualizados += g.atualizados;
        }
      },
    });
    if (r.completo && !r.interrompido) {
      const novas = r.quadras.filter((q) => !r.prontas.includes(q));
      conta.apagados += await guardarQuadras(mem, r.lotes.filter((l) => novas.includes(quadraDe(l.ic))), novas);
      conta.quadras += novas.length;
    }
    return {
      completo: r.completo && !r.interrompido,
      vazio: r.completo && !r.interrompido && r.lotes.length === 0,
      lotes: r.lotes.length,
      ...conta,
      freio: null,
    };
  } catch (e) {
    if (e instanceof Freio) return { completo: false, vazio: false, lotes: 0, ...conta, freio: e };
    throw e;
  }
}
