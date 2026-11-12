// Nome da pasta do terreno no Drive (pedido do Moises, 12/nov/2026):
//   CIDADE_ZONA_BAIRRO_AA MM_CÓDIGO_Rua
//   SP_ZL_VILA JACUÍ_26 11_A001_Av. São Miguel
// Terreno seguinte na mesma rua e cidade ganha " 2", " 3"... no fim da rua (numero_rua, que o
// banco conta pela ordem de cadastro; o primeiro fica sem número).
// A ordem segue a ordem alfabética que ele quer no Drive: cidade, zona, bairro e data de cadastro.
// Sem zona (ou sem bairro, rua, cidade): NA. Cidade sem sigla cadastrada: o nome inteiro.
// Acentos ficam. O "_" só separa as partes: dentro delas vira "-".

export const ZONAS = {
  norte: 'ZN', sul: 'ZS', leste: 'ZL', oeste: 'ZO', centro: 'ZC',
  sudeste: 'ZSE', sudoeste: 'ZSO', nordeste: 'ZNE', noroeste: 'ZNO',
};

// tipo do logradouro abreviado; Rua fica Rua
const TIPOS = [
  [/^avenida\b\.?/i, 'Av.'], [/^av\b\.?/i, 'Av.'],
  [/^alameda\b\.?/i, 'Al.'], [/^travessa\b\.?/i, 'Tv.'], [/^praça\b\.?/i, 'Pç.'],
  [/^estrada\b\.?/i, 'Estr.'], [/^rodovia\b\.?/i, 'Rod.'], [/^largo\b\.?/i, 'Lg.'],
  [/^viaduto\b\.?/i, 'Vd.'], [/^r\.\s*/i, 'Rua '],
];

const limpar = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/_/g, '-').replace(/\s+/g, ' ').trim();

export function rua(logradouro) {
  let r = limpar(logradouro);
  if (!r) return '';
  for (const [re, ab] of TIPOS) {
    if (re.test(r)) { r = (ab.endsWith(' ') ? ab : ab + ' ') + r.replace(re, '').trim(); break; }
  }
  return r.replace(/\s+/g, ' ').trim();
}

export function anoMes(data) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: '2-digit', month: '2-digit' }).formatToParts(new Date(data));
  return `${p.find((x) => x.type === 'year').value} ${p.find((x) => x.type === 'month').value}`;
}

/** t: o que app.drive_terreno devolve */
export function nomePasta(t) {
  const partes = [
    limpar(t.sigla) || limpar(t.municipio),
    ZONAS[t.zona] ?? '',
    limpar(t.bairro).toLocaleUpperCase('pt-BR'),
    anoMes(t.criado_em),
    limpar(t.codigo),
    [rua(t.logradouro), rua(t.logradouro) && t.numero_rua > 1 ? String(t.numero_rua) : ''].filter(Boolean).join(' '),
  ];
  return partes.map((x) => x || 'NA').join('_').slice(0, 250);
}
