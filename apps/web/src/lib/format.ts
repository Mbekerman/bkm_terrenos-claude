const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Data local de hoje em AAAA-MM-DD. */
export function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Aceita 'AAAA-MM-DD' ou timestamp ISO; usa só a parte da data, sem fuso. */
function partes(s: string): [number, number, number] {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

export function somarDias(iso: string, n: number): string {
  const [y, m, d] = partes(iso);
  const x = new Date(y, m - 1, d + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}

export function diasEntre(a: string, b: string): number {
  const [y1, m1, d1] = partes(a);
  const [y2, m2, d2] = partes(b);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 864e5);
}

export function data(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = partes(s);
  const anoAtual = new Date().getFullYear();
  return `${d} ${MES[m - 1]}${y !== anoAtual ? ' ' + y : ''}`;
}

export function milhoes(v: number | null | undefined): string {
  if (v == null) return '—';
  return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' mi';
}

export function reais(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function m2(v: number | null | undefined): string {
  return v == null ? '—' : Number(v).toLocaleString('pt-BR') + ' m²';
}

export function iniciais(nome: string | null | undefined): string {
  if (!nome) return '?';
  return nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

/** "6.150.000" ou "6150000,50" → 6150000.5 */
export function lerValor(s: string): number {
  const limpo = s.replace(/[^\d,]/g, '').replace(',', '.');
  return Number(limpo) || 0;
}

export const ORIGEM: Record<string, string> = {
  corretor: 'Corretor',
  proprietario: 'Proprietário direto',
  prospeccao: 'Prospecção própria',
};

export const FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro',
  permuta_fisica: 'Permuta física',
  permuta_financeira: 'Permuta financeira',
  misto: 'Misto',
};

export const SITUACAO_PROPOSTA: Record<string, string> = {
  em_analise: 'Em análise',
  contraproposta: 'Contraproposta',
  aceita: 'Aceita',
  recusada: 'Recusada',
};

export const ATIVIDADE: Record<string, string> = {
  ligacao: 'Ligação',
  visita: 'Visita',
  reuniao: 'Reunião',
  email: 'E-mail',
  nota: 'Nota',
};

export const MOTIVOS_PERDA = [
  'Preço acima do teto da viabilidade',
  'Zoneamento ou legislação',
  'Documentação ou pendência jurídica',
  'Vendedor desistiu',
  'Perdido para concorrente',
  'Outro',
];

export const CARTORIOS = Array.from({ length: 18 }, (_, i) => `${i + 1}º CRI`);
