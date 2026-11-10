/* Máscaras ao digitar, como o proto_ui.js do protótipo: todo campo de número
   (inputMode "decimal", ou data-fmt) se formata enquanto se digita, com ponto de
   milhar e vírgula decimal. O R$ e o % ficam dentro do campo pelo componente
   <Adorno> (a máscara não mexe na estrutura da página, que é do React).
     data-fmt="moeda"  até 2 casas          data-fmt="pct"   até 2 casas; ao sair, completa as 2
     data-fmt="num"    até 3 casas          data-fmt="int"   inteiro
     data-fmt="m"      metros, até 2 casas; ao sair, completa as 2 (pedido do Moisés, 6/nov/2026)
     data-fmt="tel"    (11) 98765-4321      data-fmt="doc"   CPF ou CNPJ, pelo número de dígitos
     data-fmt="cep"    00.000-000           data-fmt="none"  não mexe (coordenadas, filtros com "12 mi")
   Sem data-fmt, o tipo sai do rótulo: "R$" vira moeda, "%" vira pct, "(m)" ou "metros" vira m, o resto num.
   O valor é trocado pelo setter nativo do campo, para o React ver a mudança e
   chamar o onChange com o texto já formatado; lerNum lê os dois jeitos. */
import { type ReactNode, createElement } from 'react';

const DEC: Record<string, number> = { moeda: 2, pct: 2, m: 2, num: 3, int: 0 };
/** tipos que, ao sair do campo, completam as duas casas */
const DUAS = new Set(['pct', 'm']);
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

function rotulo(el: HTMLInputElement): string {
  const l = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label') || el.closest('.field')?.querySelector('label');
  return `${l?.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.placeholder ?? ''}`;
}
export function tipoFmt(el: HTMLInputElement): string | null {
  if (el.dataset.fmt) return el.dataset.fmt;
  if (el.inputMode !== 'decimal' || el.classList.contains('fx-in')) return null;
  const t = rotulo(el);
  return /R\$/.test(t) ? 'moeda' : /%/.test(t) ? 'pct' : /\(m\)|\bmetros\b/.test(t) ? 'm' : 'num';
}

/** número no padrão brasileiro, mantendo o cursor no lugar (conta só dígitos e vírgula) */
function numero(v: string, c: number, dec: number, neg: boolean): [string, number] {
  if (/\d\s*(m|mi|mil|b|bi|k)\s*$/i.test(v)) return [v, c]; // "270 mil" e "12 mi" ficam como digitados
  const sig = (s: string) => (s.match(/[\d,]/g) || []).length;
  let antes = sig(v.slice(0, c));
  const menos = neg && /^\s*-/.test(v);
  const s = v.replace(/[^\d,]/g, ''), i = s.indexOf(',');
  let int = i < 0 ? s : s.slice(0, i);
  const fr = i < 0 || dec === 0 ? null : s.slice(i + 1).replace(/,/g, '').slice(0, dec);
  const z = int.length;
  int = int.replace(/^0+(?=\d)/, '');
  antes -= Math.min(antes, z - int.length);
  if (int === '' && fr != null) { int = '0'; antes++; }
  const novo = (menos ? '-' : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (fr != null ? ',' + fr : '');
  let n = 0, p = menos ? 1 : 0;
  while (p < novo.length && n < antes) { if (/[\d,]/.test(novo[p])) n++; p++; }
  return [novo, p];
}
/** máscara de dígitos ("(00) 00000-0000"); o cursor vai para o fim do que foi digitado até ele */
function digitos(v: string, c: number, m: string): [string, number] {
  const d = v.replace(/\D/g, ''), antes = v.slice(0, c).replace(/\D/g, '').length;
  let o = '', i = 0, p = 0;
  for (const ch of m) {
    if (i >= d.length) break;
    if (ch === '0') { o += d[i++]; if (i === antes) p = o.length; } else o += ch;
  }
  return [o, antes === 0 ? 0 : p || o.length];
}
const MASC = {
  tel: (d: number) => (d > 10 ? '(00) 00000-0000' : '(00) 0000-0000'),
  doc: (d: number) => (d > 11 ? '00.000.000/0000-00' : '000.000.000-00'),
  cep: () => '00.000-000', // pedido do Moisés, 10/nov/2026 (o banco guarda só os 8 dígitos)
};

/** CEP para mostrar: 00.000-000 (pedido do Moisés, 10/nov/2026); o que não tem 8 dígitos fica como está */
export function fmtCep(v: unknown): string {
  const s = v == null ? '' : String(v), d = s.replace(/\D/g, '');
  return d.length === 8 ? `${d.slice(0, 2)}.${d.slice(2, 5)}-${d.slice(5)}` : s;
}

export function formatar(v: string, c: number, t: string, el?: HTMLInputElement): [string, number] {
  if (t in DEC) return numero(v, c, el?.dataset.dec != null ? +el.dataset.dec : DEC[t], el?.dataset.neg != null);
  if (t in MASC) return digitos(v, c, MASC[t as keyof typeof MASC](v.replace(/\D/g, '').length));
  return [v, c];
}

function aoDigitar(e: Event) {
  const el = e.target as HTMLInputElement;
  if (el?.tagName !== 'INPUT') return;
  const t = tipoFmt(el);
  if (!t || t === 'none') return;
  const v = el.value, [novo, p] = formatar(v, el.selectionStart ?? v.length, t, el);
  if (novo === v) return;
  setter.call(el, novo);
  try { el.setSelectionRange(p, p); } catch { /* campos sem cursor */ }
}
function aoDigitarSombra(e: Event) { const el = e.target as HTMLInputElement; if (el?.tagName === 'INPUT') mostrarSombra(el); }
/* percentual e metros: ao sair do campo, completa as duas casas ("66" → "66,00"; pedidos do Moisés, 5 e 6/nov/2026) */
function aoSair(e: Event) {
  const el = e.target as HTMLInputElement;
  if (el?.tagName !== 'INPUT' || !DUAS.has(tipoFmt(el) ?? '') || !/\d/.test(el.value) || /[a-z]/i.test(el.value)) return;
  const [i, f = ''] = el.value.split(',');
  const novo = `${i || '0'},${(f + '00').slice(0, 2)}`;
  if (novo === el.value) return;
  setter.call(el, novo);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* Máscara à vista enquanto se digita (pedido do Moisés, 6/nov/2026): o que falta do formato aparece em cinza logo depois
   do texto, sem entrar no valor: ",00" no percentual e em metros (que se completam ao sair) e o resto do desenho em
   telefone, CPF ou CNPJ e CEP ("(11) 9876_-____"). Campo alinhado à direita fica sem a sombra. */
let sombra: HTMLSpanElement | null = null;
let regua: CanvasRenderingContext2D | null = null;
function falta(el: HTMLInputElement, t: string): string {
  const v = el.value;
  if (!/\d/.test(v) || /[a-z]/i.test(v)) return '';
  if (DUAS.has(t)) { const i = v.indexOf(','); return i < 0 ? ',00' : '0'.repeat(Math.max(0, 2 - (v.length - i - 1))); }
  if (t in MASC) {
    const d = v.replace(/\D/g, '').length, m = MASC[t as keyof typeof MASC](t === 'doc' ? Math.min(d, 11) : d);
    let n = 0, i = 0;
    for (; i < m.length && n < d; i++) if (m[i] === '0') n++;
    if (n < d) return '';
    return m.slice(i).replace(/0/g, '_');
  }
  return '';
}
function mostrarSombra(el: HTMLInputElement) {
  const t = tipoFmt(el), r = t && t !== 'none' && document.activeElement === el ? falta(el, t) : '';
  const cs = r ? getComputedStyle(el) : null;
  if (!r || !cs || /right|end|center/.test(cs.textAlign) || el.scrollWidth > el.clientWidth + 1) { if (sombra) sombra.hidden = true; return; }
  if (!sombra) { sombra = document.createElement('span'); sombra.className = 'masc-sombra'; sombra.setAttribute('aria-hidden', 'true'); document.body.appendChild(sombra); }
  regua ??= document.createElement('canvas').getContext('2d');
  if (!regua) return;
  regua.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const b = el.getBoundingClientRect(), x = b.left + el.clientLeft + parseFloat(cs.paddingLeft) + regua.measureText(el.value).width - el.scrollLeft;
  const sobra = b.right - el.clientLeft - parseFloat(cs.paddingRight) - x;
  if (sobra < 8) { sombra.hidden = true; return; }
  sombra.style.font = regua.font;
  Object.assign(sombra.style, { left: x + 'px', top: b.top + 'px', height: b.height + 'px', lineHeight: b.height + 'px', maxWidth: sobra + 'px' });
  sombra.textContent = r;
  sombra.hidden = false;
}
const esconderSombra = () => { if (sombra) sombra.hidden = true; };

/* No celular, o campo que ganha o foco não pode ficar atrás do teclado (pedido do Moisés,
   5/nov/2026): quando o teclado abre, a área visível (visualViewport) encolhe, e com
   qualquer tamanho de teclado (o numérico é mais baixo) o campo rola para o meio do que
   sobrou. Também ao chegar no campo por "ir ao campo" (o foco vem antes do teclado). */
function campoVisivel(el: Element) {
  const vv = window.visualViewport;
  if (!vv) return;
  const r = el.getBoundingClientRect(), topo = vv.offsetTop + 8, fundo = vv.offsetTop + vv.height - 8;
  if (r.top >= topo + 48 && r.bottom <= fundo) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  // a página pode não rolar o bastante (rolagem presa num contêiner): ajusta pela diferença
  setTimeout(() => {
    const r2 = el.getBoundingClientRect();
    if (r2.bottom > vv.offsetTop + vv.height - 8) window.scrollBy({ top: r2.bottom - (vv.offsetTop + vv.height / 2), behavior: 'smooth' });
  }, 350);
}
function ehCampo(el: Element | null): el is HTMLElement {
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|range|color|file)$/.test((el as HTMLInputElement).type)));
}

let instalado = false;
export function instalarMascaras() {
  if (instalado) return;
  instalado = true;
  document.addEventListener('input', aoDigitar, true);
  document.addEventListener('input', aoDigitarSombra);
  document.addEventListener('focusout', aoSair, true);
  document.addEventListener('focusout', esconderSombra);
  document.addEventListener('focusin', (e) => { const el = e.target as HTMLInputElement; if (el?.tagName === 'INPUT') setTimeout(() => mostrarSombra(el), 0); else esconderSombra(); });
  addEventListener('scroll', esconderSombra, true);
  addEventListener('resize', esconderSombra);
  const tocou = () => matchMedia('(pointer: coarse)').matches;
  document.addEventListener('focusin', (e) => {
    if (!tocou() || !ehCampo(e.target as Element)) return;
    const el = e.target as HTMLElement;
    // o teclado leva um instante para abrir; confere de novo depois
    setTimeout(() => document.activeElement === el && campoVisivel(el), 300);
    setTimeout(() => document.activeElement === el && campoVisivel(el), 700);
  }, true);
  /* clicar (ou tocar) num campo de texto ou número seleciona todo o conteúdo; o segundo clique, já no campo, põe o cursor;
     arrastar para marcar um pedaço continua valendo; foco dado pelo sistema não seleciona (proto_ui.js, decisão do Moisés de 28/out/2026) */
  const TXT = 'input:not([type]),input[type=text],input[type=number],input[type=email],input[type=tel],input[type=url],input[type=password],input[type=search]';
  let alvo: HTMLInputElement | null = null;
  document.addEventListener('pointerdown', (e) => {
    const el = e.target;
    alvo = el instanceof HTMLInputElement && el.matches(TXT) && document.activeElement !== el && !el.closest('[data-enter=manter]') ? el : null;
  }, true);
  const selecionar = () => {
    const el = alvo;
    if (!el || document.activeElement !== el) return;
    alvo = null;
    let a: number | null = null, b: number | null = null;
    try { a = el.selectionStart; b = el.selectionEnd; } catch { /* sem cursor */ }
    if (a !== b) return;
    const sel = () => { try { el.select(); } catch { /* sem seleção */ } };
    sel();
    let tecla = false;
    el.addEventListener('keydown', () => { tecla = true; }, { once: true });
    // no toque o navegador ainda põe o cursor depois do click: seleciona de novo se nada foi marcado à mão
    setTimeout(() => {
      let x = 0, y = 0;
      try { x = el.selectionStart ?? 0; y = el.selectionEnd ?? 0; } catch { /* sem cursor */ }
      if (!tecla && document.activeElement === el && x === y) sel();
    }, 60);
  };
  // no mouse o foco vem no apertar, no toque só no soltar (por isso também no click)
  document.addEventListener('pointerup', selecionar, true);
  document.addEventListener('click', selecionar, true);
  window.visualViewport?.addEventListener('resize', () => {
    const el = document.activeElement;
    if (tocou() && ehCampo(el)) campoVisivel(el);
  });
}

/** a unidade dentro do campo, como o .adorno do protótipo: R$ antes do número; %, m e m² depois (pedido do Moisés, 6/nov/2026) */
export type Unidade = 'moeda' | 'pct' | 'm' | 'm2';
const UN: Record<Unidade, string> = { moeda: 'R$', pct: '%', m: 'm', m2: 'm²' };
export function Adorno({ t, children }: { t: Unidade; children: ReactNode }) {
  return createElement('span', { className: `adorno ${t}` }, children, createElement('span', { className: 'adorno-t', 'aria-hidden': true }, UN[t]));
}

/** metros com duas casas (leitura e valor inicial do campo): 12,5 → "12,50" */
export const metros = (v: unknown) => (v == null || v === '' ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
