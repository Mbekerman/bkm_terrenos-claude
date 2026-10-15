import { diasEntre, hojeISO } from './format';
import type { DocumentoLinha, ProcessoResumo } from './types';

/** Dias até vencer; negativo = já venceu; null = não vence. */
export function diasParaVencer(validoAte: string | null): number | null {
  return validoAte ? diasEntre(hojeISO(), validoAte) : null;
}

export const JANELA_ALERTA = 15;

export function docEmAlerta(d: Pick<DocumentoLinha, 'situacao_efetiva' | 'valido_ate'>): boolean {
  if (d.situacao_efetiva === 'vencido') return true;
  const n = diasParaVencer(d.valido_ate);
  return d.situacao_efetiva !== 'rejeitado' && n != null && n >= 0 && n <= JANELA_ALERTA;
}

/** Documentos de negociações ativas que venceram ou vencem em 15 dias. */
export function contarAlertasDocs(docs: DocumentoLinha[], ativos: ProcessoResumo[]): number {
  const ids = new Set(ativos.map((p) => p.id));
  return docs.filter((d) => ids.has(d.processo_id) && docEmAlerta(d)).length;
}
