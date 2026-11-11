/* Modalidades do pedido e da proposta (pedido do Moises, 11/nov/2026): dinheiro, permuta financeira em % do VGV
   líquido e permuta física em % ou em unidades, combináveis. A forma de pagamento é derivada delas no banco. */
/* Mínimos garantidos (pedido do Moises, 11/nov/2026): em R$ na permuta financeira (finMin) e em unidades na
   permuta física em % (fisMinUn); opcionais, só valem com a modalidade deles. */
export interface Modalidades { din: number | null; fin: number | null; fisPct: number | null; fisUn: number | null; finMin?: number | null; fisMinUn?: number | null }

export const modDe = (x: { valor?: unknown; fin?: unknown; fisPct?: unknown; fisUn?: unknown; finMin?: unknown; fisMinUn?: unknown }): Modalidades => {
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  return { din: n(x.valor), fin: n(x.fin), fisPct: n(x.fisPct), fisUn: n(x.fisUn), finMin: n(x.finMin), fisMinUn: n(x.fisMinUn) };
};
/** R$ curto para o mínimo: "R$ 2 mi", "R$ 850 mil" */
export const rsCurto = (v: number) => {
  const f = (x: number) => x.toLocaleString('pt-BR', { maximumFractionDigits: x < 10 ? 2 : 1 });
  return v >= 1e6 ? `R$ ${f(v / 1e6)} mi` : v >= 1e3 ? `R$ ${f(v / 1e3)} mil` : `R$ ${f(v)}`;
};
export const temMod = (m: Modalidades) => m.din != null || m.fin != null || m.fisPct != null || m.fisUn != null;

export const pctTxt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: v % 1 ? 1 : 0, maximumFractionDigits: 2 }) + '%';
/** permuta física: "8 unid." ou "12,5% física"; com as duas (soma de partes diferentes), as duas */
export const fisTxt = (m: Modalidades) => [m.fisUn != null ? `${m.fisUn.toLocaleString('pt-BR')} Unid.` : null,
  m.fisPct != null ? `${pctTxt(m.fisPct)} física${m.fisMinUn != null ? ` (mín. ${m.fisMinUn.toLocaleString('pt-BR')} Unid.)` : ''}` : null]
  .filter(Boolean).join(' + ') || null;
export const finTxt = (m: Modalidades) => (m.fin != null ? `${pctTxt(m.fin)} VGVL${m.finMin != null ? ` (mín. ${rsCurto(m.finMin)})` : ''}` : null);
/** a proposta (ou o pedido) numa linha: "R$ 1,2 mi + 6% VGVL + 8 unid." */
export const resumoMod = (m: Modalidades, dinheiro: (v: number) => string) =>
  [m.din != null ? dinheiro(m.din) : null, finTxt(m), fisTxt(m)].filter(Boolean).join(' + ') || '—';
export const modProposta = (p: { valor_total?: unknown; permuta_fin_pct?: unknown; permuta_fis_pct?: unknown; permuta_fis_unidades?: unknown; permuta_fin_minimo?: unknown; permuta_fis_min_unidades?: unknown }) =>
  modDe({ valor: p.valor_total, fin: p.permuta_fin_pct, fisPct: p.permuta_fis_pct, fisUn: p.permuta_fis_unidades, finMin: p.permuta_fin_minimo, fisMinUn: p.permuta_fis_min_unidades });
