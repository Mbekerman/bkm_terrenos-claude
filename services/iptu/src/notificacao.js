// Leitura da Notificação de Lançamento do IPTU de São Paulo (PDF da 2ª via).
//
// O PDF tem texto (não é imagem). Cada pedaço de texto vem com a posição na página;
// os valores são achados pelos rótulos do modelo da Prefeitura: na lista de dados
// cadastrais, o valor fica na mesma linha, à direita do rótulo; nas tabelas do
// demonstrativo, o valor fica logo abaixo da linha de rótulos, na coluna do rótulo
// mais próximo à esquerda. Nada é calculado nem inventado: célula vazia vira null e
// rótulo que falta faz a leitura falhar (o layout mudou), em vez de gravar zero.

export class ErroLeitura extends Error {
  constructor(msg) { super(msg); this.code = 'PDF_NAO_RECONHECIDO'; }
}

const sem = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** "1.499,00" → 1499; "-479,96" → -479.96; "" → null */
export function numero(s) {
  if (s == null) return null;
  const t = String(s).trim().replace(/^R\$\s*/, '');
  if (!/^-?[\d.]*\d(,\d+)?$/.test(t)) return null;
  return Number(t.replace(/\./g, '').replace(',', '.'));
}
/** "10/02/2026" → "2026-02-10" */
export function data(s) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s ?? '').trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Junta pedaços de texto vizinhos da mesma linha (o PDF às vezes quebra um rótulo em dois). */
function linhas(itens) {
  const ord = itens.filter((i) => String(i.text).trim()).map((i) => ({ t: String(i.text).trim(), x: i.x, y: i.y }))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  return ord;
}

function acharRotulo(itens, re, depoisDeY = -Infinity) {
  return itens.find((i) => i.y > depoisDeY && re.test(sem(i.t)));
}

/** Valor à direita de um rótulo, na mesma linha (tolerância de altura de 3 pt). */
function aDireita(itens, rot, xMax = Infinity) {
  if (!rot) return null;
  const c = itens.filter((i) => i !== rot && i.x > rot.x + 10 && i.x < xMax && Math.abs(i.y - rot.y) <= 3 && !/:$/.test(i.t));
  c.sort((a, b) => Math.abs(a.y - rot.y) - Math.abs(b.y - rot.y) || a.x - b.x);
  return c[0]?.t ?? null;
}

/**
 * Tabela em que a linha de rótulos está em [y0, y1] e os valores logo abaixo (até y1 + 22).
 * Cada coluna é definida por um rótulo; um valor pertence ao rótulo mais à direita que
 * começa antes dele. Devolve { chave: texto }.
 */
function tabela(itens, y0, y1, colunas, reserva = {}) {
  const rots = [];
  for (const [chave, re] of colunas) {
    const r = itens.find((i) => i.y >= y0 - 0.5 && i.y <= y1 + 0.5 && re.test(sem(i.t)));
    // o leitor de PDF às vezes junta rótulos vizinhos; aí vale a posição da mesma coluna na linha de cima
    const x = r?.x ?? reserva[chave];
    if (x == null) throw new ErroLeitura(`Coluna não encontrada no PDF: ${chave}`);
    rots.push({ chave, x });
  }
  rots.sort((a, b) => a.x - b.x);
  tabela.ultimo = Object.fromEntries(rots.map((r) => [r.chave, r.x]));
  const vals = itens.filter((i) => i.y > y1 + 2 && i.y <= y1 + 22 && (numero(i.t) != null || data(i.t)));
  const out = Object.fromEntries(colunas.map(([k]) => [k, null]));
  for (const v of vals) {
    const i = rots.findLastIndex((r) => r.x <= v.x + 4);
    if (i < 0) continue;
    const col = rots[i];
    // a última coluna não vai até a borda: o que estiver bem à direita dela é outro quadro
    if (i === rots.length - 1 && v.x > col.x + 110) continue;
    if (out[col.chave] != null) throw new ErroLeitura(`Dois valores na coluna ${col.chave}`);
    out[col.chave] = v.t;
  }
  return out;
}

/** Faixa de y de uma linha de rótulos: do primeiro rótulo achado até 12 pt abaixo. */
function faixa(rot) { return [rot.y - 8, rot.y + 4]; }

/**
 * Lê os itens de texto da primeira página ({text, x, y}, y crescendo para baixo) e
 * devolve os dados da notificação.
 */
export function lerItens(itensBrutos) {
  const it = linhas(itensBrutos);

  // Cabeçalho: cadastro, exercício e número da notificação, logo abaixo dos rótulos.
  const rCad = acharRotulo(it, /^CADASTRO DO IMOVEL$/);
  if (!rCad) throw new ErroLeitura('Cabeçalho "Cadastro do imóvel" não encontrado: o PDF não é a notificação de lançamento.');
  // cada valor fica logo abaixo do seu rótulo (até 30 pt abaixo e 30 pt de lado), com o formato dele
  const abaixo = (rot, re) => {
    if (!rot) return null;
    const v = it.filter((i) => i.y > rot.y + 2 && i.y < rot.y + 30 && Math.abs(i.x - rot.x) < 30 && re.test(i.t));
    if (v.length > 1) throw new ErroLeitura(`Dois valores para ${rot.t} no cabeçalho`);
    return v[0]?.t ?? null;
  };
  const naLinha = (re) => it.find((i) => Math.abs(i.y - rCad.y) <= 2 && re.test(sem(i.t)));
  const cab = { exercicio: abaixo(naLinha(/^EXERCICIO$/), /^\d{4}$/), nl: abaixo(naLinha(/^NL$/), /^\d{1,3}$/) };
  if (!cab.exercicio) throw new ErroLeitura('Exercício não encontrado no cabeçalho do PDF.');
  const sqlTxt = it.find((i) => i.y > rCad.y && i.y < rCad.y + 30 && /^\d{3}\.\d{3}\.\d{4}-\d$/.test(i.t))?.t ?? null;

  // Dados cadastrais: rótulo à esquerda, valor à direita na mesma linha.
  const rTer = acharRotulo(it, /^DADOS CADASTRAIS DO TERRENO/);
  const rCon = acharRotulo(it, /^DADOS CADASTRAIS DA CONSTRUCAO/);
  if (!rTer || !rCon) throw new ErroLeitura('Dados cadastrais não encontrados no PDF.');
  const xMeio = rCon.x - 5;
  const esq = (re) => aDireita(it, acharRotulo(it, re, rTer.y), xMeio);
  const dir = (re) => aDireita(it, acharRotulo(it, re, rCon.y));
  const rUso = acharRotulo(it, /^USO:?$/, rCon.y);
  const uso = rUso ? (aDireita(it, rUso) ?? it.find((i) => i !== rUso && i.x > rUso.x && Math.abs(i.y - rUso.y) <= 4 && !/:$/.test(i.t))?.t ?? null) : null;

  // Bases de cálculo: três linhas (A construção, B terreno incorporado, C não incorporado).
  const linhaBase = (re, comFatoresTerreno, reserva) => {
    const r = acharRotulo(it, re);
    if (!r) throw new ErroLeitura('Linha das bases de cálculo não encontrada.');
    const cols = comFatoresTerreno
      ? [['area', re], ['valor_m2', /^TERRENO$/], ['profundidade', /^PROFUND/], ['tipo', /^TIPO TERR/], ['condominio', /^CONDOMIN/], ['fracao', /^FRACAO IDEAL/], ['base', /^TERR (NAO )?INCORPORADO$/], ['especial', /^ESPECIAL$/]]
      : [['area', re], ['valor_m2', /^CONSTRUCAO$/], ['obsolescencia', /^OBSOLESC/], ['base', /^CONSTRUCAO$/], ['especial', /^ESPECIAL$/]];
    if (!comFatoresTerreno) {
      // "CONSTRUÇÃO" aparece duas vezes na linha (valor do m² e base): separa pela posição.
      const dois = it.filter((i) => Math.abs(i.y - r.y) <= 1 && sem(i.t) === 'CONSTRUCAO').sort((a, b) => a.x - b.x);
      const esp = it.find((i) => Math.abs(i.y - r.y) <= 1 && sem(i.t) === 'ESPECIAL');
      const obs = it.find((i) => Math.abs(i.y - r.y) <= 1 && /^OBSOLESC/.test(sem(i.t)));
      if (dois.length !== 2 || !esp || !obs) throw new ErroLeitura('Linha da construção fora do padrão.');
      const rots = [['area', r.x], ['valor_m2', dois[0].x], ['obsolescencia', obs.x], ['base', dois[1].x], ['especial', esp.x]];
      const out = Object.fromEntries(rots.map(([k]) => [k, null]));
      for (const v of it.filter((i) => i.y > r.y + 2 && i.y <= r.y + 22 && numero(i.t) != null)) {
        const col = [...rots].sort((a, b) => b[1] - a[1]).find(([, x]) => x <= v.x + 4);
        if (col) out[col[0]] = v.t;
      }
      return out;
    }
    return tabela(it, ...faixa(r), cols, reserva);
  };
  const A = linhaBase(/^CONSTRUIDA/, false);
  const B = linhaBase(/^TERRENO INCORP(?!ORADO)/, true);
  const C = linhaBase(/^TERRENO NAO INCORP(?!ORADO)/, true, tabela.ultimo);

  // Impostos predial (D) e territorial (E).
  const imposto = (re) => {
    const r = acharRotulo(it, re);
    if (!r) throw new ErroLeitura('Quadro do imposto não encontrado.');
    const rAl = it.find((i) => i.y > r.y && i.y < r.y + 25 && sem(i.t) === 'ALIQUOTA');
    if (!rAl) throw new ErroLeitura('Cabeçalho do imposto não encontrado.');
    return tabela(it, rAl.y - 8, rAl.y + 1, [
      ['base', /^BASE DE CALCULO/], ['aliquota', /^ALIQUOTA$/], ['desconto', /^DESCONTO\/ACRESCIMO$/], ['calculado', /^IMPOSTO CALCULADO$/],
      ['especial', /^FAT ESPEC$/], ['deducoes', /^DEDUCOES\/ACRESCIMOS$/], ['a_pagar', /^IMPOSTO A PAGAR$/],
    ]);
  };
  const D = imposto(/^CALCULO DO IMPOSTO PREDIAL/);
  const E = imposto(/^CALCULO DO IMPOSTO TERRITORIAL/);

  // Valor a pagar.
  const rTot = acharRotulo(it, /^TOTAL DOS IMPOSTOS/);
  if (!rTot) throw new ErroLeitura('Quadro "Valor a pagar" não encontrado.');
  const P = tabela(it, rTot.y - 1, rTot.y + 8, [
    ['total_impostos', /^TOTAL DOS IMPOSTOS/], ['compensado', /^VALOR COMPENSADO/], ['atualizacao', /^ATUALIZACAO MONETARIA$/],
    ['total', /^TOTAL A PAGAR$/], ['vencimento', /^DATA DE VENCIMENTO$/],
  ]);
  // a tabela pega os valores logo abaixo da última linha de rótulos (rótulo em duas linhas)
  const exercicio = parseInt(cab.exercicio, 10);
  const nb = (o, k) => numero(o[k]);
  const fatoresTerreno = (o) => ({ area_m2: nb(o, 'area'), valor_m2: nb(o, 'valor_m2'), fator_profundidade: nb(o, 'profundidade'), fator_tipo_terreno: nb(o, 'tipo'), fator_condominio: nb(o, 'condominio'), fator_fracao_ideal: nb(o, 'fracao'), base_calculo: nb(o, 'base'), fator_especial: nb(o, 'especial') });
  const imp = (o) => ({ base_calculo: nb(o, 'base'), aliquota: nb(o, 'aliquota'), desconto_acrescimo: nb(o, 'desconto'), imposto_calculado: nb(o, 'calculado'), fator_especial: nb(o, 'especial'), deducoes_acrescimos: nb(o, 'deducoes'), imposto_a_pagar: nb(o, 'a_pagar') });
  const out = {
    versao: 1,
    sql: sqlTxt,
    exercicio: Number.isFinite(exercicio) ? exercicio : null,
    notificacao: cab.nl ?? null,
    terreno: { area_incorporada_m2: numero(esq(/^AREA INCORPORADA/)), area_nao_incorporada_m2: numero(esq(/^AREA NAO INCORPORADA/)), area_total_m2: numero(esq(/^AREA TOTAL/)), testada_m: numero(esq(/^TESTADA/)) },
    construcao: { area_construida_m2: numero(dir(/^AREA CONSTRUIDA/)), area_ocupada_m2: numero(dir(/^AREA OCUPADA/)), ano_corrigido: numero(dir(/^ANO DA CONSTRUCAO/)), padrao: dir(/^PADRAO DA CONSTRUCAO/), uso },
    bases: {
      construcao: { area_m2: nb(A, 'area'), valor_m2: nb(A, 'valor_m2'), fator_obsolescencia: nb(A, 'obsolescencia'), base_calculo: nb(A, 'base'), fator_especial: nb(A, 'especial') },
      terreno_incorporado: fatoresTerreno(B),
      terreno_nao_incorporado: fatoresTerreno(C),
    },
    predial: imp(D),
    territorial: imp(E),
    pagar: { total_impostos: nb(P, 'total_impostos'), compensado_nf: nb(P, 'compensado'), atualizacao_monetaria: nb(P, 'atualizacao'), total: nb(P, 'total'), vencimento_1a_prestacao: data(P.vencimento) },
  };
  if (out.pagar.total == null && out.pagar.total_impostos == null) throw new ErroLeitura('Valor a pagar não encontrado no PDF.');
  return out;
}

/**
 * Valores que vão para app.inscricao_valores. Valor venal = bases de cálculo: terreno
 * (incorporado + não incorporado) e construção. IPTU anual = total a pagar do exercício.
 */
export function paraBanco(n) {
  const soma = (...v) => (v.every((x) => x == null) ? null : v.reduce((a, x) => a + (x ?? 0), 0));
  const vt = soma(n.bases.terreno_incorporado.base_calculo, n.bases.terreno_nao_incorporado.base_calculo);
  const vc = n.bases.construcao.base_calculo;
  const anual = n.pagar.total ?? n.pagar.total_impostos;
  return {
    exercicio: n.exercicio,
    valor_venal_terreno: vt,
    valor_venal_construcao: vc,
    valor_venal_imovel: vt == null && vc == null ? null : (vt ?? 0) + (vc ?? 0),
    situacao_iptu: anual === 0 ? 'isento' : anual != null ? 'tributado' : 'nao_informada',
    iptu_valor_anual: anual === 0 ? null : anual,
    fonte: `Prefeitura de São Paulo: notificação de lançamento${n.notificacao ? ' NL ' + n.notificacao : ''}`,
    notificacao: n,
  };
}

/** PDF → itens de texto da 1ª página, com y crescendo para baixo. */
export async function lerPdf(buf) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: false }).promise; }
  catch { throw new ErroLeitura('O arquivo não é um PDF legível.'); }
  const pg = await doc.getPage(1);
  const alt = pg.getViewport({ scale: 1 }).height;
  const tc = await pg.getTextContent();
  const itens = tc.items.filter((i) => 'str' in i).map((i) => ({ text: i.str, x: i.transform[4], y: alt - i.transform[5] }));
  await doc.destroy();
  if (!itens.some((i) => i.text.trim())) throw new ErroLeitura('O PDF não tem texto legível.');
  return lerItens(itens);
}
