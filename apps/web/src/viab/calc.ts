import CFG from '../../../../tools/viabilidade/despesas.json';

// Estudo de viabilidade estática: o mesmo cálculo de app.calcular_viabilidade (migration 20261015001000_viabilidade.sql)
// e, até 11/nov/2026, do protótipo (tools/prototipo/proto_viab.js › vbCalc, congelado com a conta antiga, em que o VGV
// líquido era também a receita), para o resultado se refazer enquanto se digita. O banco
// recalcula e guarda os totais a cada gravação; aqui é só a conta da tela. Grupos, seções e bases vêm de
// tools/viabilidade/despesas.json, o mesmo arquivo que o protótipo e o teste do banco leem; os itens são os da empresa
// (app.viabilidade_despesas).

export type Tipo = 'area' | 'pct_obra_tipica' | 'pct_obra_raso' | 'pct_obra_total' | 'pct_vgv' | 'pct_lucro' | 'verba' | 'verba_unidade' | 'verba_mensal'
  | 'pct_aporte_permuta' | 'pct_aporte_pagamento';
export interface Grupo { nome: string; secao: string; fixo: boolean; tipos: Tipo[] }
export const VB_TIPO = CFG.tipos as Record<Tipo, string>;
export const VB_GRUPO = CFG.grupos as Record<string, Grupo>;
export const VB_SECAO = CFG.secoes as Record<string, string>;
export const VB_DG = ['terreno', 'incorporacao', 'cef', 'adm_financeiro'];
export const gruposDe = (sec: string) => Object.keys(VB_GRUPO).filter((g) => VB_GRUPO[g].secao === sec);
export const VB_FIN = gruposDe('financeiro');
/** Despesas financeiras e Taxas: só a diretoria ou o administrador vê as abas e muda os valores */
export const VB_RESTRITO = ['financeiro', 'taxas'];

export interface Desp { codigo: string; nome: string; grupo: string; tipo_padrao: Tipo | null; valor_padrao: number | null; deduz_vgv: boolean; ordem: number; ativo: boolean }
export interface Tip {
  id: string; ordem: number; nome: string; area_privativa: number | null; quantidade: number; quantidade_permuta: number; quantidade_comissao: number;
  preco_unitario: number | null; preco_m2: number | null; massa_tipologia_id?: string | null;
}
export interface Linha { id: string; ordem: number; despesa: string; tipo: Tipo; valor: number | null; quantidade: number }
export interface Viab {
  id: string; terreno_id: string; nome: string; custo_m2: number | null; obra_base: 'privativa' | 'construida'; area_construida: number | null;
  permuta_fin_pct: number | null; deducao_vgv_pct: number | null; minimo_garantido: number | null; deduz_vgv: string[];
  pagamento_dinheiro: number | null; comissao_dinheiro: number | null; estudo_massa_id: string | null; segue_massa_valido: boolean;
  atualizado_em: string; criado_em: string;
  /** totais guardados pelo banco: Taxas e Despesas financeiras, que fora da diretoria só se veem pelo total */
  taxas: number | null; despesas_financeiras: number | null;
  tips: Tip[]; linhas: Linha[];
}

export const r2 = (x: number) => Math.round((x + Math.sign(x) * Number.EPSILON) * 100) / 100;
export const ehPct = (t: string) => t.startsWith('pct');

/** preço unitário, preço por m² e área ligados (o mesmo de app.tg_viabilidade_tipologia): com a área, mudar o unitário
    refaz o m² e mudar o m² refaz o unitário; mudar a área refaz o m² quando há os dois preços e completa o que falta
    quando há um só; apagar um preço não refaz o outro */
export function normTip(p: Tip, campo: 'area_privativa' | 'preco_unitario' | 'preco_m2') {
  if (p.area_privativa == null) return;
  const a = p.area_privativa;
  if (campo === 'preco_m2') { if (p.preco_m2 != null) p.preco_unitario = r2(p.preco_m2 * a); }
  else if (campo === 'preco_unitario') { if (p.preco_unitario != null) p.preco_m2 = r2(p.preco_unitario / a); }
  else if (p.preco_unitario != null) p.preco_m2 = r2(p.preco_unitario / a);
  else if (p.preco_m2 != null) p.preco_unitario = r2(p.preco_m2 * a);
}

export interface Calc {
  A: number; Ab: number; un: number; unp: number; unc: number; unl: number; ap: number; ac: number;
  vgv: number; vp: number; vc: number; vv: number; dedp: number; dedc: number; liq: number;
  oi: number; raso: number; ot: number; obras: number; pfc: number; pf: number; minimo: boolean; terr: number;
  SEC: Record<string, number>; GR: Record<string, number>; lb: number;
  semTaxas: number; ebitda: number; lucro: number; margem: number | null;
  L: Record<string, { base: number | null; valor: number | null; ded: boolean }>;
}

/** cálculo, na ordem (vbCalc do protótipo):
    VGV vendido = VGV − permuta física − unidades da comissão (é o "VGV" das bases % do VGV);
    VGV líquido = vendido − % de dedução − despesas comerciais marcadas para deduzir: só a base da permuta financeira, nunca
    a receita (decisão do Moises, 11/nov/2026; a receita é o VGV vendido e as despesas marcadas continuam nas comerciais);
    obra: típico = R$/m² × área (privativa ou construída); incidente (raso) = típico + atípicos; total = raso + não incidente;
    + projetos e pós-obra; terreno: permuta financeira = % × VGV líquido, nunca abaixo do mínimo garantido; + dinheiro +
    comissão em dinheiro; % do lucro líquido: lucro = L0 ÷ (1 + Σ%), zero quando L0 ≤ 0; custo de capital: % sobre o Aporte;
    margem líquida = lucro ÷ VGV vendido.
    `restritoGuardado`: fora da diretoria as linhas de Taxas e Despesas financeiras não chegam (RLS); entram os totais
    que o banco guardou na última gravação. */
export function calcular(v: Viab, desp: Desp[], restritoGuardado: boolean): Calc {
  const dp = new Map(desp.map((d) => [d.codigo, d]));
  const grupoLn = (l: Linha) => dp.get(l.despesa)?.grupo ?? '';
  let A = 0, un = 0, unp = 0, unc = 0, ap = 0, ac = 0, vgv = 0, vp = 0, vc = 0;
  for (const p of v.tips) {
    const q = p.quantidade || 0, pe = p.quantidade_permuta || 0, co = p.quantidade_comissao || 0;
    un += q; unp += pe; unc += co;
    if (p.area_privativa != null) { A += p.area_privativa * q; ap += p.area_privativa * pe; ac += p.area_privativa * co; }
    if (p.preco_unitario != null) { vgv += q * p.preco_unitario; vp += pe * p.preco_unitario; vc += co * p.preco_unitario; }
  }
  A = r2(A); ap = r2(ap); ac = r2(ac); vgv = r2(vgv); vp = r2(vp); vc = r2(vc);
  const vv = r2(vgv - vp - vc), unl = un - unp - unc;
  const b: Record<string, number> = { area: A, unidades: unl, pct_vgv: vv };
  const val = (l: Linha): number | null => {
    if (l.valor == null) return null;
    const x = l.valor;
    switch (l.tipo) {
      case 'verba': return r2(x);
      case 'verba_mensal': return r2(x * (l.quantidade || 1));
      case 'verba_unidade': return r2(b.unidades * x);
      case 'area': return r2(b.area * x);
      default: return r2((b[l.tipo] || 0) * x / 100);
    }
  };
  const soma = (gs: string[], semLucro = false) => r2(v.linhas.filter((l) => gs.includes(grupoLn(l)) && !(semLucro && l.tipo === 'pct_lucro')).reduce((s, l) => s + (val(l) || 0), 0));
  const ded = (l: Linha) => grupoLn(l) === 'comercial' && !!dp.get(l.despesa)?.deduz_vgv && v.deduz_vgv.includes(l.despesa);
  const com = soma(['comercial']), dedc = r2(v.linhas.filter(ded).reduce((s, l) => s + (val(l) || 0), 0));
  const dedp = r2(vv * (v.deducao_vgv_pct || 0) / 100), liq = r2(vv - dedp - dedc);
  const Ab = v.obra_base === 'construida' ? (v.area_construida || 0) : A, oi = r2((v.custo_m2 || 0) * Ab);
  b.pct_obra_tipica = oi;
  const raso = r2(oi + soma(['obra_atipica'])); b.pct_obra_raso = raso;
  const ot = r2(raso + soma(['obra_nao_incidente'])); b.pct_obra_total = ot;
  const obras = r2(ot + soma(['projetos', 'pos_obra']));
  const pfc = r2(liq * (v.permuta_fin_pct || 0) / 100), pf = Math.max(pfc, v.minimo_garantido || 0);
  const terr = r2(pf + (v.pagamento_dinheiro || 0) + (v.comissao_dinheiro || 0));
  b.pct_aporte_permuta = pf; b.pct_aporte_pagamento = v.pagamento_dinheiro || 0;
  const DT = [...VB_DG, 'taxas', ...VB_FIN];
  /* fora da diretoria, Taxas e Financeiras entram pelo total guardado, como verba */
  const guard = restritoGuardado ? r2((v.taxas || 0) + (v.despesas_financeiras || 0)) : 0;
  const pl = v.linhas.filter((l) => l.tipo === 'pct_lucro' && DT.includes(grupoLn(l))).reduce((s, l) => s + (l.valor || 0), 0);
  const l0 = r2(vv - terr - obras - com - soma(DT, true) - guard), lb = l0 > 0 ? r2(l0 / (1 + pl / 100)) : 0;
  b.pct_lucro = lb;
  const L: Calc['L'] = {}, GR: Record<string, number> = {};
  let lu = 0;
  for (const l of v.linhas) {
    const x = val(l), g = grupoLn(l);
    L[l.id] = { base: l.tipo === 'verba_unidade' ? unl : ehPct(l.tipo) || l.tipo === 'area' ? b[l.tipo] ?? null : null, valor: x, ded: ded(l) };
    GR[g] = r2((GR[g] || 0) + (x || 0));
    if (l.tipo === 'pct_lucro') lu += x || 0;
  }
  const sg = (gs: string[]) => r2(gs.reduce((s, g) => s + (GR[g] || 0), 0));
  const SEC: Record<string, number> = {
    obra: obras, terreno: terr, despesas: sg(VB_DG),
    taxas: restritoGuardado ? v.taxas || 0 : sg(['taxas']), financeiro: restritoGuardado ? v.despesas_financeiras || 0 : sg(VB_FIN), comercial: com,
  };
  const lucro = r2(l0 - lu);
  return {
    A, Ab, un, unp, unc, unl, ap, ac, vgv, vp, vc, vv, dedp, dedc, liq, oi, raso, ot, obras, pfc, pf, minimo: pf > pfc, terr, SEC, GR, lb,
    semTaxas: r2(lucro + SEC.taxas), ebitda: r2(lucro + SEC.taxas + SEC.financeiro), lucro, margem: vv > 0 ? r2(lucro / vv * 100) : null, L,
  };
}

/* formatos do estudo (os do protótipo: brl, mi, num) */
export const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
export const mi = (v: number | null | undefined) => (v == null ? '—' : 'R$\u00a0' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0mi');
export const nf = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
export const vin = (v: number | null | undefined, d = 2) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
/** % do VGV vendido, a mesma base dos itens em % do VGV e da margem */
export const pctVgv = (x: number, c: Calc) => (c.vv > 0 ? nf(x / c.vv * 100, 1) + '% do VGV' : '');
