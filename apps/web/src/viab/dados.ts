import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import type { Desp, Linha, Tip, Viab } from './calc';

// Dados do estudo de viabilidade: a lista do terreno (totais guardados pelo banco), o estudo aberto inteiro (dados,
// tipologias e linhas) e a lista de itens da empresa. Regras no banco (CLAUDE.md, regra 2): criar, salvar os dados do
// estudo, apagar e vincular à negociação por RPC (app.criar_viabilidade, app.salvar_viabilidade, app.apagar_viabilidade,
// app.vincular_estudo); tipologias e linhas são escrita direta, e os gatilhos do banco recalculam o estudo.

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const n = (x: unknown) => (x == null ? null : Number(x));

export interface ResumoViab {
  id: string; nome: string; vgv: number | null; liq: number | null; lucro: number | null; margem: number | null; unidades: number | null;
  atualizado: string; criado: string;
}

const COLS = 'id,nome,vgv,vgv_liquido,lucro_liquido,margem_pct,unidades,atualizado_em,criado_em';

/** os estudos estáticos do terreno, na ordem em que foram criados (a ordem é o número do endereço, /viabilidade/2) e o
    válido (o da negociação, processos.viabilidade_id); `margemMin`: a rentabilidade mínima da empresa */
export function useEstudos(terreno: string, negId: string | null, empresa: string | undefined) {
  return useQuery({
    queryKey: ['viabs', terreno, negId], enabled: !!empresa,
    queryFn: async () => {
      const [vs, pr, cf, up] = await Promise.all([
        supabase.from('viabilidades').select(COLS).eq('terreno_id', terreno).eq('tipo', 'estatica').order('criado_em'),
        negId ? supabase.from('processos').select('viabilidade_id,status').eq('id', negId).maybeSingle() : Promise.resolve({ data: null, error: null }),
        supabase.from('viabilidade_config').select('margem_minima_pct').eq('empresa_id', empresa!).maybeSingle(),
        negId ? supabase.from('propostas').select('valor_total').eq('processo_id', negId).order('versao', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      for (const r of [vs, pr, cf, up]) if (r.error) throw r.error;
      const lista: ResumoViab[] = ((vs.data ?? []) as R[]).map((x) => ({
        id: x.id, nome: x.nome, vgv: n(x.vgv), liq: n(x.vgv_liquido), lucro: n(x.lucro_liquido), margem: n(x.margem_pct), unidades: n(x.unidades),
        atualizado: x.atualizado_em, criado: x.criado_em,
      }));
      const p = pr.data as R | null;
      return { lista, valido: (p?.viabilidade_id as string | null) ?? null, negAtiva: p?.status === 'ativo', margemMin: n((cf.data as R | null)?.margem_minima_pct),
        ultProposta: n((up.data as R | null)?.valor_total) };
    },
  });
}

/** a lista de itens da empresa (Configurações › Viabilidade), na ordem dela */
export function useDespesas(empresa: string | undefined) {
  return useQuery({
    queryKey: ['viab-desp', empresa], enabled: !!empresa, staleTime: 5 * 60_000,
    queryFn: async (): Promise<Desp[]> => {
      const { data, error } = await supabase.from('viabilidade_despesas').select('codigo,nome,grupo,tipo_padrao,valor_padrao,deduz_vgv,ordem,ativo')
        .eq('empresa_id', empresa!).order('ordem');
      if (error) throw error;
      return (data as R[]).map((d) => ({ ...d, valor_padrao: n(d.valor_padrao) })) as Desp[];
    },
  });
}

/** o estudo inteiro, para o popup */
export async function carregarEstudo(id: string): Promise<Viab | null> {
  const [v, t, l] = await Promise.all([
    supabase.from('viabilidades').select('id,terreno_id,nome,custo_m2,obra_base,area_construida,permuta_fin_pct,deducao_vgv_pct,minimo_garantido,deduz_vgv,pagamento_dinheiro,comissao_dinheiro,estudo_massa_id,segue_massa_valido,atualizado_em,criado_em,taxas,despesas_financeiras')
      .eq('id', id).maybeSingle(),
    supabase.from('viabilidade_tipologias').select('id,ordem,nome,area_privativa,quantidade,quantidade_permuta,quantidade_comissao,preco_unitario,preco_m2,massa_tipologia_id')
      .eq('viabilidade_id', id).order('ordem').order('criado_em'),
    supabase.from('viabilidade_linhas').select('id,ordem,despesa,tipo,valor,quantidade').eq('viabilidade_id', id).order('ordem').order('criado_em'),
  ]);
  for (const r of [v, t, l]) if (r.error) throw r.error;
  const x = v.data as R | null;
  if (!x) return null;
  return {
    ...x, custo_m2: n(x.custo_m2), area_construida: n(x.area_construida), permuta_fin_pct: n(x.permuta_fin_pct), deducao_vgv_pct: n(x.deducao_vgv_pct),
    minimo_garantido: n(x.minimo_garantido), pagamento_dinheiro: n(x.pagamento_dinheiro), comissao_dinheiro: n(x.comissao_dinheiro),
    taxas: n(x.taxas), despesas_financeiras: n(x.despesas_financeiras), deduz_vgv: x.deduz_vgv ?? [],
    tips: ((t.data ?? []) as R[]).map((p) => ({ ...p, area_privativa: n(p.area_privativa), preco_unitario: n(p.preco_unitario), preco_m2: n(p.preco_m2) }) as Tip),
    linhas: ((l.data ?? []) as R[]).map((y) => ({ ...y, valor: n(y.valor), quantidade: Number(y.quantidade ?? 1) }) as Linha),
  } as Viab;
}

/** recarrega o que mostra os totais do estudo: a lista, a ficha (VGV e unidades do estudo válido) e os filtros */
export function useRecarregar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['viabs'] });
    void qc.invalidateQueries({ queryKey: ['ficha'] });
    void qc.invalidateQueries({ queryKey: ['filtros'] });
  };
}

export const erroTxt = (e: unknown) => (e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : 'Não foi possível gravar.');
