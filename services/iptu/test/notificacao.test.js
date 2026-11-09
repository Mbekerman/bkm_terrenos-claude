import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerItens, lerPdf, paraBanco, numero, ErroLeitura } from '../src/notificacao.js';

// Notificação fictícia montada com a disposição do modelo da Prefeitura (posições em pt,
// y crescendo para baixo). Os números são inventados.
export function itens({ semTotal = false } = {}) {
  const L = [];
  const p = (y, x, text) => L.push({ y, x, text });
  p(52, 210, 'CADASTRO DO IMÓVEL'); p(52, 342, 'EXERCÍCIO'); p(52, 427, 'NL');
  p(71, 223, '123.456.0789-1'); p(71, 355, '2026'); p(71, 427, '02');
  p(338, 16, 'Dados cadastrais do terreno:'); p(338, 322, 'Dados cadastrais da construção:');
  p(354, 16, 'Área incorporada (m²):'); p(354, 168, '1.250'); p(355, 321, 'Área construída (m²):'); p(355, 506, '0');
  p(368, 16, 'Área não incorporada (m²):'); p(368, 168, '0'); p(369, 320, 'Área ocupada pela construção (m²):'); p(369, 506, '0');
  p(382, 16, 'Área total (m²):'); p(382, 168, '1.250'); p(383, 321, 'Ano da construção corrigido:');
  p(396, 16, 'Testada (m):'); p(397, 168, '25,40'); p(398, 321, 'Padrão da construção:');
  p(413, 344, 'terreno'); p(414, 321, 'Uso:');
  p(477, 16, 'BASES DE CÁLCULO (R$):');
  p(500, 17, 'CONSTRUÍDA'); p(500, 98, 'CONSTRUÇÃO'); p(500, 178, 'OBSOLESC'); p(500, 390, 'CONSTRUÇÃO'); p(500, 489, 'ESPECIAL');
  p(506, 88, 'X'); p(506, 381, '='); p(506, 541, '= (A)');
  p(523.5, 17, 'TERRENO INCORP'); p(523.5, 98, 'TERRENO'); p(523.5, 178, 'PROFUND'); p(523.5, 229, 'TIPO TERR'); p(523.5, 280, 'CONDOMIN');
  p(523.5, 331, 'FRAÇÃO IDEAL'); p(523.5, 390, 'TERR INCORPORADO'); p(523.5, 489, 'ESPECIAL');
  p(534.8, 40, '1.250'); p(534.8, 116, '2.100,00'); p(534.8, 185, '1,0000'); p(534.8, 235, '0,9000'); p(534.8, 287, '1,0000');
  p(534.8, 341, '1,0000'); p(534.8, 408, '2.362.500,00'); p(534.8, 493, '1,000000');
  p(546.8, 17, 'TERRENO NÃO INCORP'); p(546.8, 98, 'TERRENO'); p(546.8, 178, 'PROFUND'); p(546.8, 229, 'TIPO TERR'); p(546.8, 280, 'CONDOMIN');
  p(546.8, 331, 'FRAÇÃO IDEAL'); p(546.8, 390, 'TERR NÃO INCORPORADO'); p(546.8, 489, 'ESPECIAL');
  p(583, 16, 'CÁLCULO DO IMPOSTO PREDIAL'); p(583, 152, '(R$):');
  p(594, 23, 'BASE DE CÁLCULO'); p(600, 98, 'ALÍQUOTA'); p(600, 144, 'DESCONTO/ACRÉSCIMO'); p(600, 229, 'IMPOSTO CALCULADO');
  p(600, 313, 'FAT ESPEC'); p(600, 365, 'DEDUÇÕES/ACRÉSCIMOS'); p(600, 467, 'IMPOSTO A PAGAR');
  p(612, 487, '0,00');
  p(636, 16, 'CÁLCULO DO IMPOSTO TERRITORIAL'); p(636, 171, '(R$):');
  p(648, 18, 'BASE DE CÁLCULO (C)'); p(648, 98, 'ALÍQUOTA'); p(648, 144, 'DESCONTO/ACRÉSCIMO'); p(648, 229, 'IMPOSTO CALCULADO');
  p(648, 313, 'FAT ESPEC'); p(648, 365, 'DEDUÇÕES/ACRÉSCIMOS'); p(648, 467, 'IMPOSTO A PAGAR');
  p(660, 28, '2.362.500,00'); p(660, 100, '0,015'); p(660, 165, '-2.500,00'); p(660, 240, '33.937,50'); p(660, 314, '1,000000'); p(660, 386, '0,00'); p(660, 478, '33.937,50');
  p(691, 16, 'VALOR A PAGAR'); p(703, 18, 'TOTAL DOS IMPOSTOS (D) + (E)'); p(703, 139, 'VALOR COMPENSADO E/OU');
  p(703, 258, 'ATUALIZAÇÃO MONETÁRIA'); p(703, 391, 'TOTAL A PAGAR'); p(703, 482, 'DATA DE VENCIMENTO');
  p(710, 138, 'CRÉDITO DA NF ELETRÔNICA'); p(710, 490, 'DA 1ª PRESTAÇÃO');
  if (!semTotal) { p(725, 72, '33.937,50'); p(725, 173, '0,00'); p(725, 290, '0,00'); p(725, 420, '33.937,50'); p(725, 499, '09/02/2026'); }
  return L;
}

test('números no formato brasileiro', () => {
  assert.equal(numero('1.499,00'), 1499);
  assert.equal(numero('-479,96'), -479.96);
  assert.equal(numero('0,010'), 0.01);
  assert.equal(numero(''), null);
  assert.equal(numero('X'), null);
});

test('lê a notificação de um terreno vazio', () => {
  const n = lerItens(itens());
  assert.equal(n.sql, '123.456.0789-1');
  assert.equal(n.exercicio, 2026);
  assert.equal(n.notificacao, '02');
  assert.equal(n.terreno.area_total_m2, 1250);
  assert.equal(n.terreno.testada_m, 25.4);
  assert.equal(n.construcao.area_construida_m2, 0);
  assert.equal(n.construcao.ano_corrigido, null); // célula vazia não vira zero
  assert.equal(n.construcao.uso, 'terreno');
  assert.equal(n.bases.terreno_incorporado.valor_m2, 2100);
  assert.equal(n.bases.terreno_incorporado.fator_tipo_terreno, 0.9);
  assert.equal(n.bases.terreno_incorporado.base_calculo, 2362500);
  assert.equal(n.bases.terreno_nao_incorporado.base_calculo, null);
  assert.equal(n.bases.construcao.base_calculo, null);
  assert.equal(n.territorial.aliquota, 0.015);
  assert.equal(n.territorial.desconto_acrescimo, -2500);
  assert.equal(n.predial.imposto_a_pagar, 0);
  assert.equal(n.pagar.total, 33937.5);
  assert.equal(n.pagar.vencimento_1a_prestacao, '2026-02-09');
});

test('valores para o banco: venal pelas bases, IPTU pelo total a pagar', () => {
  const b = paraBanco(lerItens(itens()));
  assert.equal(b.valor_venal_terreno, 2362500);
  assert.equal(b.valor_venal_construcao, null);
  assert.equal(b.valor_venal_imovel, 2362500);
  assert.equal(b.situacao_iptu, 'tributado');
  assert.equal(b.iptu_valor_anual, 33937.5);
  assert.match(b.fonte, /NL 02/);
});

test('sem o quadro do valor a pagar, falha em vez de gravar zero', () => {
  assert.throws(() => lerItens(itens({ semTotal: true })), ErroLeitura);
});

test('PDF que não é a notificação é recusado', () => {
  assert.throws(() => lerItens([{ text: 'Outro documento', x: 10, y: 10 }]), ErroLeitura);
});

// PDF mínimo com os mesmos textos, para conferir a leitura pelo pdf.js.
export function pdf(L) {
  const esc = (s) => [...s].map((c) => { const k = c.codePointAt(0); return k >= 128 ? '\\' + k.toString(8).padStart(3, '0') : c.replace(/([\\()])/g, '\\$1'); }).join('');
  const conteudo = L.map((i) => `BT /F1 5 Tf 1 0 0 1 ${i.x} ${(841.89 - i.y).toFixed(2)} Tm (${esc(i.text.replace('ª', 'a').replace('²', '2'))}) Tj ET`).join('\n');
  const obj = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  let s = '%PDF-1.4\n'; const pos = [];
  obj.forEach((o, i) => { pos.push(Buffer.byteLength(s, 'latin1')); s += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(s, 'latin1');
  s += `xref\n0 ${obj.length + 1}\n0000000000 65535 f \n${pos.map((p) => String(p).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${obj.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(s, 'latin1');
}

test('lê o PDF de verdade pelo pdf.js', async () => {
  const n = await lerPdf(pdf(itens()));
  assert.equal(n.exercicio, 2026);
  assert.equal(n.pagar.total, 33937.5);
  assert.equal(n.bases.terreno_incorporado.base_calculo, 2362500);
});
