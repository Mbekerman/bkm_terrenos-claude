// Limpeza do HTML das Observações e Premissas do estudo de viabilidade (12/nov/2026).
// Lista fechada: só as etiquetas e os estilos que a barra do editor produz passam; o resto vira texto
// ou some. Roda antes de gravar, ao colar e antes de mostrar (o banco recusa script, on… e javascript:
// como segunda barreira, em app.salvar_observacoes_viabilidade). Sem biblioteca: DOMParser do navegador,
// que monta o documento sem rodar script nem carregar imagem.

const BLOCOS = new Set(['P', 'DIV', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI', 'BLOCKQUOTE']);
const LINHA = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'SPAN', 'A', 'BR', 'SUB', 'SUP']);
/** etiquetas que somem com o conteúdo (nunca viram texto) */
const FORA = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'TEMPLATE', 'NOSCRIPT', 'SVG', 'MATH', 'HEAD', 'TITLE', 'META', 'LINK', 'BASE', 'FORM', 'INPUT', 'BUTTON', 'TEXTAREA', 'SELECT', 'IMG', 'VIDEO', 'AUDIO', 'SOURCE', 'CANVAS']);

const COR = /^(#[0-9a-f]{3,8}|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+)\s*)?\))$/i;
const TAM = /^(\d{1,2}(\.\d+)?)(pt|px)$/;
const ESTILOS: Record<string, (v: string) => string | null> = {
  color: (v) => (COR.test(v) ? v : null),
  'background-color': (v) => (COR.test(v) ? v : null),
  'font-size': (v) => {
    const m = TAM.exec(v);
    if (!m) return null;
    const n = +m[1];
    return n >= 6 && n <= 96 ? v : null;
  },
  'font-weight': (v) => (/^(bold|normal|[1-9]00)$/.test(v) ? v : null),
  'font-style': (v) => (/^(italic|normal)$/.test(v) ? v : null),
  'text-decoration': (v) => (/^(underline|line-through|none)( (underline|line-through))?$/.test(v) ? v : null),
  'text-decoration-line': (v) => (/^(underline|line-through|none)( (underline|line-through))?$/.test(v) ? v : null),
  'text-align': (v) => (/^(left|center|right|justify)$/.test(v) ? v : null),
  'margin-left': (v) => (/^\d{1,3}(px|pt)$/.test(v) ? v : null),
  'padding-left': (v) => (/^\d{1,3}(px|pt)$/.test(v) ? v : null),
};

const linkOk = (h: string) => /^(https?:\/\/|mailto:)/i.test(h.trim());

function estilo(el: Element): string {
  const css = (el as HTMLElement).style;
  if (!css) return '';
  const fora: string[] = [];
  for (let i = 0; i < css.length; i++) {
    const p = css[i];
    const f = ESTILOS[p];
    const v = f?.(css.getPropertyValue(p).trim());
    if (v) fora.push(`${p}: ${v}`);
  }
  return fora.join('; ');
}

function limparNo(no: Node, doc: Document): Node[] {
  if (no.nodeType === Node.TEXT_NODE) return [doc.createTextNode(no.textContent ?? '')];
  if (no.nodeType !== Node.ELEMENT_NODE) return [];
  const el = no as Element;
  const tag = el.tagName.toUpperCase();
  if (FORA.has(tag)) return [];
  const filhos = () => Array.from(el.childNodes).flatMap((c) => limparNo(c, doc));
  // <font> (do execCommand ou de colagem) vira span com a cor; o tamanho em 1–7 se perde de propósito
  if (tag === 'FONT') {
    const s = doc.createElement('span');
    const cor = el.getAttribute('color') ?? '';
    if (COR.test(cor)) s.style.color = cor;
    const st = estilo(el);
    if (st) s.setAttribute('style', [s.getAttribute('style'), st].filter(Boolean).join('; '));
    filhos().forEach((c) => s.appendChild(c));
    return s.getAttribute('style') ? [s] : Array.from(s.childNodes);
  }
  if (!BLOCOS.has(tag) && !LINHA.has(tag)) {
    // etiqueta desconhecida: fica o conteúdo (um bloco estranho vira parágrafo, para não colar linhas)
    const f = filhos();
    if (/^(H[4-6]|SECTION|ARTICLE|HEADER|FOOTER|TABLE|TR|PRE|ADDRESS)$/.test(tag)) {
      const p = doc.createElement('p');
      f.forEach((c) => p.appendChild(c));
      return [p];
    }
    return f;
  }
  const novo = doc.createElement(tag.toLowerCase());
  const st = estilo(el);
  if (st) novo.setAttribute('style', st);
  if (tag === 'A') {
    const h = el.getAttribute('href') ?? '';
    if (!linkOk(h)) return filhos();
    novo.setAttribute('href', h.trim());
    novo.setAttribute('target', '_blank');
    novo.setAttribute('rel', 'noopener noreferrer nofollow');
  }
  filhos().forEach((c) => novo.appendChild(c));
  return [novo];
}

/** HTML limpo, pronto para gravar ou para pôr na página. Vazio quando só sobra espaço. */
export function limparHtml(html: string | null | undefined): string {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const saida = doc.createElement('div');
  Array.from(doc.body.childNodes).flatMap((c) => limparNo(c, doc)).forEach((c) => saida.appendChild(c));
  return vazio(saida) ? '' : saida.innerHTML;
}

function vazio(el: Element) {
  return !(el.textContent ?? '').replace(/ /g, ' ').trim();
}
