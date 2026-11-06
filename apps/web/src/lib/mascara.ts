/* Máscaras ao digitar, como o proto_ui.js do protótipo: todo campo de número
   (inputMode "decimal", ou data-fmt) se formata enquanto se digita, com ponto de
   milhar e vírgula decimal. O R$ e o % ficam dentro do campo pelo componente
   <Adorno> (a máscara não mexe na estrutura da página, que é do React).
     data-fmt="moeda"  até 2 casas          data-fmt="pct"   até 2 casas; ao sair, completa as 2
     data-fmt="num"    até 3 casas          data-fmt="int"   inteiro
     data-fmt="tel"    (11) 98765-4321      data-fmt="doc"   CPF ou CNPJ, pelo número de dígitos
     data-fmt="cep"    00000-000            data-fmt="none"  não mexe (coordenadas, filtros com "12 mi")
   Sem data-fmt, o tipo sai do rótulo: "R$" vira moeda, "%" vira pct, o resto num.
   O valor é trocado pelo setter nativo do campo, para o React ver a mudança e
   chamar o onChange com o texto já formatado; lerNum lê os dois jeitos. */
import { type ReactNode, createElement } from 'react';

const DEC: Record<string, number> = { moeda: 2, pct: 2, num: 3, int: 0 };
const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;

function rotulo(el: HTMLInputElement): string {
  const l = (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) || el.closest('label') || el.closest('.field')?.querySelector('label');
  return `${l?.textContent ?? ''} ${el.getAttribute('aria-label') ?? ''} ${el.placeholder ?? ''}`;
}
export function tipoFmt(el: HTMLInputElement): string | null {
  if (el.dataset.fmt) return el.dataset.fmt;
  if (el.inputMode !== 'decimal' || el.classList.contains('fx-in')) return null;
  const t = rotulo(el);
  return /R\$/.test(t) ? 'moeda' : /%/.test(t) ? 'pct' : 'num';
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
  cep: () => '00000-000',
};

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
/* percentual: ao sair do campo, completa as duas casas ("66" → "66,00"; pedido do Moisés, 5/nov/2026) */
function aoSair(e: Event) {
  const el = e.target as HTMLInputElement;
  if (el?.tagName !== 'INPUT' || tipoFmt(el) !== 'pct' || !/\d/.test(el.value) || /[a-z]/i.test(el.value)) return;
  const [i, f = ''] = el.value.split(',');
  const novo = `${i || '0'},${(f + '00').slice(0, 2)}`;
  if (novo === el.value) return;
  setter.call(el, novo);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

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
  document.addEventListener('focusout', aoSair, true);
  const tocou = () => matchMedia('(pointer: coarse)').matches;
  document.addEventListener('focusin', (e) => {
    if (!tocou() || !ehCampo(e.target as Element)) return;
    const el = e.target as HTMLElement;
    // o teclado leva um instante para abrir; confere de novo depois
    setTimeout(() => document.activeElement === el && campoVisivel(el), 300);
    setTimeout(() => document.activeElement === el && campoVisivel(el), 700);
  }, true);
  window.visualViewport?.addEventListener('resize', () => {
    const el = document.activeElement;
    if (tocou() && ehCampo(el)) campoVisivel(el);
  });
}

/** R$ ou % dentro do campo, como o .adorno do protótipo */
export function Adorno({ t, children }: { t: 'moeda' | 'pct'; children: ReactNode }) {
  return createElement('span', { className: `adorno ${t}` }, children, createElement('span', { className: 'adorno-t', 'aria-hidden': true }, t === 'moeda' ? 'R$' : '%'));
}
