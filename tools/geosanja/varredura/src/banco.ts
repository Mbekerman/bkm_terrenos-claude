import { createClient } from '@supabase/supabase-js';
import {
  geoAreaAnel, icFmt, quadraComPonto, quadraDigitos,
  type Anel, type LoteMontado,
} from '../../../../apps/web/src/novo/lotesSjcPuro.ts';

export interface CelulaSeed {
  id: string; ordem: number;
  x0: number; y0: number; x1: number; y1: number;
  lat: number; lng: number; densidade: number;
}
export interface CelulaRow {
  id: string; ordem: number;
  x0: number; y0: number; x1: number; y1: number;
  tentativas: number;
}
export interface Contagem { novos: number; atualizados: number; apagados: number }
export interface Stats {
  consultas: number; novos: number; atualizados: number; apagados: number; quadras: number; celulas: number;
}

export interface BancoVarredura {
  tabelasLotes(): Promise<boolean>;
  garantir(celulas: CelulaSeed[]): Promise<void>;
  abrirExecucao(): Promise<number>;
  anotar(id: number, s: Stats): Promise<void>;
  fecharExecucao(id: number, motivo: string, s: Stats, detalhe: string): Promise<void>;
  proxima(): Promise<CelulaRow | null>;
  fecharCelula(id: string, situacao: 'pendente' | 'concluida' | 'vazia', consultas: number, lotes: number, erro: string | null): Promise<void>;
  conhecidos(bb: number[]): Promise<{ ic: string; an: Anel }[]>;
  prontas(quadras: string[]): Promise<{ prontas: string[]; lotes: { ic: string; an: Anel }[] }>;
  guardar(lotes: LoteMontado[], quadras: string[]): Promise<Contagem>;
}

type LoteJson = { inscricao: string; quadra: string; anel: Anel };

/** O mesmo corpo que o app manda em guardar_lotes_prefeitura. */
export function loteParaJson(l: LoteMontado) {
  if (l.daBase) return { inscricao: icFmt(l.ic), quadra: quadraDigitos(l.ic), da_base: true as const };
  const anel = l.an.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
  const area = Math.round(geoAreaAnel(l.an) * 100) / 100;
  return { inscricao: icFmt(l.ic), quadra: quadraDigitos(l.ic), anel, area_m2: area || null };
}

function loteDoBanco(r: LoteJson): { ic: string; an: Anel } {
  return { ic: icFmt(String(r.inscricao)), an: r.anel };
}

export function criarBanco(url: string, chave: string, empresa: string, base = 'geosanja'): BancoVarredura {
  const sb = createClient(url, chave, {
    db: { schema: 'app' },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data as T;
  }
  const num = (v: unknown) => typeof v === 'number' ? v : Number(v);
  return {
    tabelasLotes: () => rpc<boolean>('varredura_sjc_tabelas_lotes', {}),
    async garantir(celulas) {
      for (let i = 0; i < celulas.length; i += 500) {
        await rpc('varredura_sjc_garantir_celulas', { p_empresa: empresa, p_celulas: celulas.slice(i, i + 500) });
      }
    },
    abrirExecucao: () => rpc<number>('varredura_sjc_abrir_execucao', { p_empresa: empresa }),
    anotar: (id, s) => rpc('varredura_sjc_anotar_execucao', {
      p_id: id, p_consultas: s.consultas, p_novos: s.novos, p_atualizados: s.atualizados,
      p_apagados: s.apagados, p_quadras: s.quadras, p_celulas: s.celulas,
    }),
    fecharExecucao: (id, motivo, s, detalhe) => rpc('varredura_sjc_fechar_execucao', {
      p_id: id, p_motivo: motivo, p_consultas: s.consultas, p_novos: s.novos, p_atualizados: s.atualizados,
      p_apagados: s.apagados, p_quadras: s.quadras, p_celulas: s.celulas, p_detalhe: detalhe,
    }),
    async proxima() {
      const r = await rpc<CelulaRow | null>('varredura_sjc_proxima_celula', { p_empresa: empresa });
      if (!r) return null;
      return { ...r, x0: num(r.x0), y0: num(r.y0), x1: num(r.x1), y1: num(r.y1), tentativas: num(r.tentativas), ordem: num(r.ordem) };
    },
    fecharCelula: (id, situacao, consultas, lotes, erro) => rpc('varredura_sjc_fechar_celula', {
      p_empresa: empresa, p_id: id, p_situacao: situacao, p_consultas: consultas, p_lotes: lotes, p_erro: erro,
    }),
    async conhecidos([x0, y0, x1, y1]) {
      const rows = await rpc<LoteJson[] | null>('varredura_sjc_lotes_conhecidos', {
        p_empresa: empresa, p_base: base, p_x0: x0, p_y0: y0, p_x1: x1, p_y1: y1,
      });
      return (rows || []).map(loteDoBanco);
    },
    async prontas(quadras) {
      const j = await rpc<{ prontas: string[] | null; lotes: LoteJson[] | null }>('varredura_sjc_quadras_prontas', {
        p_empresa: empresa, p_base: base, p_quadras: quadras,
      });
      return {
        prontas: (j?.prontas || []).map((q) => quadraComPonto(String(q))),
        lotes: (j?.lotes || []).map(loteDoBanco),
      };
    },
    async guardar(lotes, quadras) {
      const j = await rpc<{ novos?: number; atualizados?: number; apagados?: number }>('varredura_sjc_guardar', {
        p_empresa: empresa, p_base: base, p_lotes: lotes.map(loteParaJson), p_quadras: quadras.map(quadraDigitos),
      });
      return { novos: j?.novos ?? 0, atualizados: j?.atualizados ?? 0, apagados: j?.apagados ?? 0 };
    },
  };
}
