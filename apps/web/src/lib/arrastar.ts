/* Popups arrastáveis (pedido do Moises, 9/nov/2026): todo popup do sistema se move pela tela,
   segurando o título, para ver o que está atrás. Instalado uma vez no documento (como as máscaras),
   vale para todos, inclusive os que forem criados depois, sem mexer em cada componente:
     .dialog (pop-up central, com o fundo escurecido)  → título .dh
     .cc-box (quadros do mapa: setor, concorrência)    → título .cc-hd
     .mp-rt  (rota no mapa)                            → título .mp-rt-h
   Qualquer outro popup entra marcando o título com data-arrastar.
   O deslocamento vai na propriedade CSS `translate` (não mexe no `transform` de quem já usa) e
   o título nunca sai da tela (o X de fechar fica sempre à vista). Dois cliques no título voltam o popup ao lugar. Movido o pop-up
   central, o fundo escurecido clareia (classe .movido no .scrim), para enxergar o que está atrás. */

const POPUP = '.dialog, .cc-box, .mp-rt';
const TITULO = '.dialog > .dh, .dialog .dh, .cc-box .cc-hd, .mp-rt .mp-rt-h, [data-arrastar]';
const INTERATIVO = 'button, a, input, select, textarea, label, summary, [role="button"], [role="radio"], [role="tab"], [contenteditable=""], [contenteditable="true"]';
/** quanto do título fica sempre dentro da tela, à direita (o X de fechar e um pedaço para pegar) */
const SOBRA = 140;

const pos = new WeakMap<HTMLElement, { x: number; y: number }>();

function aplicar(el: HTMLElement, x: number, y: number) {
  pos.set(el, { x, y });
  el.style.translate = x || y ? `${x}px ${y}px` : '';
  el.classList.toggle('arrastado', !!(x || y));
  const scrim = el.parentElement?.classList.contains('scrim') ? el.parentElement : null;
  scrim?.classList.toggle('movido', !!(x || y));
}

export function instalarArraste() {
  document.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    const alvo = ev.target as Element | null;
    const titulo = alvo?.closest?.(TITULO) as HTMLElement | null;
    if (!titulo || alvo!.closest(INTERATIVO)) return;
    const el = titulo.closest(POPUP) as HTMLElement | null;
    if (!el) return;
    const ini = pos.get(el) ?? { x: 0, y: 0 };
    const x0 = ev.clientX, y0 = ev.clientY;
    const r0 = titulo.getBoundingClientRect();
    let andou = false;
    const mover = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      let dx = e.clientX - x0, dy = e.clientY - y0;
      if (!andou) {
        if (Math.hypot(dx, dy) < 4) return;
        andou = true;
        el.classList.add('arrastando');
        el.parentElement?.classList.add('arrastando');
        try { titulo.setPointerCapture(ev.pointerId); } catch { /* sem captura, segue pelo documento */ }
      }
      e.preventDefault();
      /* o título fica na tela: a ponta direita (com o X de fechar) nunca sai, e da esquerda sai
         no máximo até sobrar SOBRA px; na vertical, o título inteiro fica visível */
      const W = window.innerWidth, H = window.innerHeight;
      dx = Math.min(Math.max(dx, SOBRA - r0.right), W - r0.right);
      dy = Math.min(Math.max(dy, -r0.top), H - r0.height - r0.top);
      aplicar(el, ini.x + dx, ini.y + dy);
    };
    const soltar = (e: PointerEvent) => {
      if (e.pointerId !== ev.pointerId) return;
      document.removeEventListener('pointermove', mover);
      document.removeEventListener('pointerup', soltar);
      document.removeEventListener('pointercancel', soltar);
      el.classList.remove('arrastando');
      el.parentElement?.classList.remove('arrastando');
      /* o clique que vem depois do arraste não pode cair no fundo (fecharia o pop-up) nem em nada */
      if (andou) {
        const engole = (c: MouseEvent) => { c.stopPropagation(); c.preventDefault(); };
        window.addEventListener('click', engole, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', engole, { capture: true }), 0);
      }
    };
    document.addEventListener('pointermove', mover, { passive: false });
    document.addEventListener('pointerup', soltar);
    document.addEventListener('pointercancel', soltar);
    /* sem selecionar o texto do título ao arrastar com o mouse */
    if (ev.pointerType === 'mouse') ev.preventDefault();
  }, true);

  /* dois cliques no título: volta ao lugar */
  document.addEventListener('dblclick', (ev) => {
    const alvo = ev.target as Element | null;
    const titulo = alvo?.closest?.(TITULO);
    if (!titulo || alvo!.closest(INTERATIVO)) return;
    const el = titulo.closest(POPUP) as HTMLElement | null;
    if (el && pos.get(el)) aplicar(el, 0, 0);
  }, true);
}
