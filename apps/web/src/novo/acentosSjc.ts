// Remendo dos nomes do GeoSanja (pedido do Moises, 10/nov/2026): a prefeitura entrega as letras acentuadas como "?"
// ("Setville Altos de S?o Jos?", "Bosque dos Ip?s"). A palavra com "?" é trocada pela da lista, levantada nas camadas que o
// visitante vê (subsetor, setor, centralidade, parques, APA, núcleos, riscos, zonas); fora da lista, "?o" no fim vira "ão".
// O que não se resolve fica como veio.
const PALAVRAS = ['Alemães', 'América', 'Araújo', 'Betânia', 'César', 'Cambuí', 'Capão', 'Cecília', 'Chácara', 'Chácaras', 'Colônia',
  'Condomínio', 'Esperança', 'Eugênio', 'Flórida', 'Galvão', 'Guimarães', 'Hermínia', 'Inês', 'Indústrias', 'Ipês', 'Ismênia',
  'Itapuã', 'Júlia', 'Jatobá', 'João', 'José', 'Lúcia', 'Março', 'Maringá', 'Paraíso', 'Polícia', 'República', 'São', 'Sítio',
  'Sapé', 'Satélite', 'Tecnológico', 'Torrão', 'Uirá', 'União', 'Valparaíba',
  /* comuns em nomes de bairro e de lei, que podem aparecer em outras camadas */
  'Vila', 'Jardim', 'Parque', 'Área', 'Áreas', 'Proteção', 'Preservação', 'Conservação', 'Ambiental', 'Urbanização', 'Habitação',
  'Residencial', 'Paulo', 'Francisco', 'Antônio', 'Benedito', 'Conceição', 'Esplanada', 'Bosque', 'Ribeirão', 'Córrego', 'Rio',
  'Estação', 'Industrial', 'Comercial', 'Econômico', 'Econômica', 'Estratégico', 'Estratégica', 'Região', 'Municipal', 'Público',
  'Pública', 'Médio', 'Média', 'Alto', 'Muito', 'Escorregamento', 'Inundação', 'Erosão', 'Solapamento', 'Núcleo', 'Ocupação',
  'Aquífero', 'Cônego', 'Padre', 'Santa', 'Santana', 'Vitória', 'Glória', 'Floresta', 'Itaú', 'Tatuapé', 'Jacareí', 'Caçapava',
  'Eucaliptos', 'Mônica', 'Mônaco', 'Lírios', 'Ipiranga', 'Ângela', 'Aparecida', 'Bandeirantes', 'Pão', 'Açúcar', 'Limoeiro'];
const tira = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
function palavra(w: string): string {
  /* a candidata tem o mesmo tamanho, letra acentuada onde veio "?" e o resto igual */
  const ok = PALAVRAS.filter((p) => p.length === w.length && [...w].every((c, i) => (c === '?' ? /[^\x00-\x7f]/.test(p[i]) : tira(p[i]).toLowerCase() === c.toLowerCase())));
  const p = ok.length === 1 ? ok[0] : null;
  const caixa = (x: string) => (w === w.toUpperCase() && /[A-Z]/.test(w) ? x.toUpperCase() : /^[A-Z?]/.test(w) && w[0] !== '?' ? x[0].toUpperCase() + x.slice(1) : x);
  if (p) return caixa(p);
  if (/\?o$/i.test(w) && (w.match(/\?/g) || []).length === 1) return w.replace(/\?o$/, 'ão').replace(/\?O$/, 'ÃO');
  return w;
}
/** troca as palavras com "?" de um texto do GeoSanja; o "?" solto (pergunta, separador) fica */
export const consertarAcentos = (s: string) => (s.includes('?') ? s.replace(/[A-Za-zÀ-ÿ]*\?[A-Za-zÀ-ÿ?]*/g, (w) => (/[A-Za-z]/.test(w) ? palavra(w) : w)) : s);
/** o mesmo em todas as propriedades de texto de uma feição */
export function consertarProps<T extends Record<string, unknown>>(p: T | null | undefined): T | null | undefined {
  if (!p) return p;
  const o: Record<string, unknown> = { ...p };
  for (const k in o) if (typeof o[k] === 'string') o[k] = consertarAcentos(o[k] as string);
  return o as T;
}
