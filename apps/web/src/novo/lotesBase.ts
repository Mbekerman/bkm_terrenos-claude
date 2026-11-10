// Lotes da prefeitura guardados no banco (pedido do Moises, 10/nov/2026): cada quadra de São José montada pelo GeoSanja fica em
// app.lotes_prefeitura / app.quadras_prefeitura, e a próxima abertura do mapa naquela quadra lê daqui, sem perguntar à
// prefeitura. Quadra ou lote guardado há mais de VALIDADE_DIAS é tratado como não guardado e vem da prefeitura de novo.
// Qualquer falha do banco aqui é ignorada: o mapa segue perguntando ao GeoSanja, como antes.
import { supabase } from '../lib/supabase';

type An = number[][];
export interface LoteBase { ic: string; an: An; daBase?: boolean }
export const VALIDADE_DIAS = 90;
const dig = (s: string) => s.replace(/\D/g, '');
const limite = () => new Date(Date.now() - VALIDADE_DIAS * 864e5).toISOString();
/** "41002400110000" → "41.0024.0011.0000" */
const icFmt = (d: string) => (d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 6)}.${d.slice(6, 10)}.${d.slice(10)}` : d);

export interface BaseLotes {
  /** lotes guardados (e ainda válidos) cujo retângulo cruza o retângulo [x0, y0, x1, y1] */
  perto(bb: number[]): Promise<LoteBase[]>;
  /** das quadras pedidas ("41.0024"), as montadas há menos de VALIDADE_DIAS e os lotes delas */
  quadras(qs: string[]): Promise<{ prontas: string[]; lotes: LoteBase[] }>;
  /** guarda os lotes; as quadras dadas foram montadas inteiras agora */
  guardar(lotes: LoteBase[], quadras: string[], quadraDe: (ic: string) => string, area: (an: An) => number): Promise<void>;
}

export function baseLotes(empresa: string, base = 'geosanja'): BaseLotes {
  const lote = (r: { inscricao_norm: string; anel: An }): LoteBase => ({ ic: icFmt(r.inscricao_norm), an: r.anel, daBase: true });
  return {
    async perto([x0, y0, x1, y1]) {
      try {
        const { data, error } = await supabase.from('lotes_prefeitura').select('inscricao_norm,anel').eq('empresa_id', empresa).eq('base', base)
          .lte('x0', x1).gte('x1', x0).lte('y0', y1).gte('y1', y0).gte('conferido_em', limite()).limit(1000).abortSignal(AbortSignal.timeout(15_000));
        if (error) throw error;
        return (data || []).map(lote);
      } catch { return []; }
    },
    async quadras(qs) {
      try {
        if (!qs.length) return { prontas: [], lotes: [] };
        const { data: q, error } = await supabase.from('quadras_prefeitura').select('quadra').eq('empresa_id', empresa).eq('base', base)
          .in('quadra', qs.map(dig)).gte('montada_em', limite()).abortSignal(AbortSignal.timeout(15_000));
        if (error) throw error;
        const ok = (q || []).map((r) => r.quadra as string);
        if (!ok.length) return { prontas: [], lotes: [] };
        const { data, error: e2 } = await supabase.from('lotes_prefeitura').select('inscricao_norm,anel').eq('empresa_id', empresa).eq('base', base)
          .in('quadra', ok).limit(3000).abortSignal(AbortSignal.timeout(15_000));
        if (e2) throw e2;
        return { prontas: qs.filter((k) => ok.includes(dig(k))), lotes: (data || []).map(lote) };
      } catch { return { prontas: [], lotes: [] }; }
    },
    async guardar(lotes, quadras, quadraDe, area) {
      if (!lotes.length && !quadras.length) return;
      const p_lotes = lotes.map((l) => (l.daBase ? { inscricao: l.ic, quadra: dig(quadraDe(l.ic)), da_base: true }
        : { inscricao: l.ic, quadra: dig(quadraDe(l.ic)), anel: l.an.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]), area_m2: Math.round(area(l.an) * 100) / 100 || null }));
      try {
        await supabase.rpc('guardar_lotes_prefeitura', { p_empresa: empresa, p_base: base, p_lotes, p_quadras: quadras.map(dig) }).abortSignal(AbortSignal.timeout(30_000));
      } catch { /* não guardar não atrapalha o mapa */ }
    },
  };
}
