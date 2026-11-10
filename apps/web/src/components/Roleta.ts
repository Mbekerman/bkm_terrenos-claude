import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';

/** faixa de botões que rola de lado como uma roleta (pedido do Moisés, 6/nov/2026; levada às barras de seções da ficha
    em 10/nov/2026): o dedo, o mouse arrastado, Shift + roda (ou Ctrl + Shift + roda) e o deslize de lado do trackpad a
    movem pixel a pixel, e solta com força ela segue rodando e freia aos poucos (inércia). Arrastar não aperta o botão;
    trocar o ativo (`ativo`, o `data-t` do botão) traz ele para a vista, com 70% do vizinho de cada lado quando cabe.
    Devolve se há botões fora da vista. `conta` refaz a medida quando muda o número de botões. */
export function useRoleta(barra: RefObject<HTMLDivElement>, ativo: string | null, conta = 0) {
  const [sobra, setSobra] = useState(false);
  const anim = useRef(0), ultimo = useRef(-1);
  useLayoutEffect(() => {
    const b = barra.current, a = ativo != null ? b?.querySelector<HTMLElement>(`[data-t="${CSS.escape(ativo)}"]`) : null;
    if (!b || !a || !b.firstElementChild) return;
    const ant = a.previousElementSibling as HTMLElement | null, prox = a.nextElementSibling as HTMLElement | null;
    const L = b.clientWidth, x0 = a.offsetLeft - (b.firstElementChild as HTMLElement).offsetLeft, aw = a.offsetWidth;
    /* o ativo nunca fica na ponta da vista: aparecem pelo menos 70% do vizinho de cada lado (pedido do Moises, 10/nov/2026) */
    const V = 0.7, gap = parseFloat(getComputedStyle(b).columnGap) || 0;
    let e = ant ? x0 - gap - ant.offsetWidth * V : 0, d = prox ? x0 + aw + gap + prox.offsetWidth * V : b.scrollWidth;
    if (d - e > L) {
      /* não cabem os dois: vale o vizinho do lado para onde a pessoa foi (para a direita, o próximo); nem ele cabe, o ativo no meio */
      const idx = [...b.children].indexOf(a), praTras = idx < ultimo.current;
      if (praTras && ant && x0 + aw - e <= L) d = e + L;
      else if (prox && d - x0 <= L) e = d - L;
      else { e = x0 - (L - aw) / 2; d = e + L; }
    }
    ultimo.current = [...b.children].indexOf(a);
    let alvo = b.scrollLeft;
    if (e < alvo) alvo = e; else if (d > alvo + L) alvo = d - L;
    if (alvo !== b.scrollLeft) { cancelAnimationFrame(anim.current); b.scrollTo({ left: alvo, behavior: 'smooth' }); }
  }, [ativo, conta]);
  useEffect(() => {
    const b = barra.current;
    if (!b) return;
    const medir = () => setSobra(b.scrollWidth > b.clientWidth + 1);
    medir();
    const ro = window.ResizeObserver ? new ResizeObserver(medir) : null;
    ro?.observe(b);
    /* inércia: a velocidade (px/ms) cai a cada quadro até parar; bater na ponta para */
    const rodar = (v: number) => {
      cancelAnimationFrame(anim.current);
      let t0 = performance.now();
      const passo = (t: number) => {
        const dt = Math.min(32, t - t0); t0 = t;
        const antes = b.scrollLeft;
        b.scrollLeft = antes + v * dt;
        v *= Math.pow(0.9965, dt); // atrito: perde ~30% da velocidade a cada 100 ms
        if (Math.abs(v) > 0.02 && b.scrollLeft !== antes) anim.current = requestAnimationFrame(passo);
      };
      anim.current = requestAnimationFrame(passo);
    };
    /* Shift + roda do mouse: cada dente empurra a roleta, que segue com inércia (o trackpad já tem a dele) */
    const roda = (ev: WheelEvent) => {
      if (b.scrollWidth <= b.clientWidth + 1) return;
      if (ev.shiftKey) {
        const d = (ev.deltaY || ev.deltaX) * (ev.deltaMode === 1 ? 40 : 1);
        if (!d) return;
        ev.preventDefault();
        rodar(Math.max(-6, Math.min(6, d / 60)));
      }
    };
    /* mouse arrastado (no toque, a rolagem do navegador já desliza com inércia) */
    let px: number | null = null, sx = 0, arrastou = false, id = -1, ult: [number, number][] = [];
    const baixo = (ev: PointerEvent) => {
      if (ev.pointerType !== 'mouse' || ev.button !== 0) return;
      cancelAnimationFrame(anim.current);
      px = ev.clientX; sx = b.scrollLeft; arrastou = false; id = ev.pointerId; ult = [[performance.now(), b.scrollLeft]];
      if (b.scrollWidth > b.clientWidth + 1) { // mão fechada só com o botão apertado, mesmo se soltar fora da barra
        b.classList.add('segurando');
        window.addEventListener('pointerup', () => b.classList.remove('segurando'), { once: true });
      }
    };
    const move = (ev: PointerEvent) => {
      if (px == null || ev.pointerId !== id) return;
      const dx = ev.clientX - px;
      if (!arrastou) {
        if (Math.abs(dx) < 6 || b.scrollWidth <= b.clientWidth + 1) return;
        arrastou = true;
        try { b.setPointerCapture(id); } catch { /* sem captura */ }
        b.classList.add('arrastando');
      }
      ev.preventDefault();
      b.scrollLeft = sx - dx;
      ult.push([performance.now(), b.scrollLeft]); if (ult.length > 6) ult.shift();
    };
    const cima = (ev: PointerEvent) => {
      if (ev.pointerId !== id || px == null) return;
      px = null;
      if (!arrastou) return;
      b.classList.remove('arrastando');
      const z = ult[ult.length - 1], a0 = ult.find((u) => z[0] - u[0] < 100) ?? ult[0], dt = z[0] - a0[0];
      if (dt > 0 && performance.now() - z[0] < 60) rodar(Math.max(-8, Math.min(8, (z[1] - a0[1]) / dt)));
    };
    const clique = (ev: MouseEvent) => { if (arrastou) { ev.preventDefault(); ev.stopPropagation(); arrastou = false; } };
    const parar = () => cancelAnimationFrame(anim.current); // o dedo na barra segura a roleta
    b.addEventListener('wheel', roda, { passive: false });
    b.addEventListener('pointerdown', baixo);
    b.addEventListener('pointermove', move);
    b.addEventListener('pointerup', cima);
    b.addEventListener('pointercancel', cima);
    b.addEventListener('touchstart', parar, { passive: true });
    b.addEventListener('click', clique, true);
    return () => {
      ro?.disconnect(); cancelAnimationFrame(anim.current);
      b.removeEventListener('wheel', roda); b.removeEventListener('pointerdown', baixo); b.removeEventListener('pointermove', move);
      b.removeEventListener('pointerup', cima); b.removeEventListener('pointercancel', cima); b.removeEventListener('touchstart', parar);
      b.removeEventListener('click', clique, true);
    };
  }, []);
  /* botões novos (seções que aparecem depois) mudam a largura do conteúdo, não a da barra */
  useLayoutEffect(() => { const b = barra.current; if (b) setSobra(b.scrollWidth > b.clientWidth + 1); }, [conta]);
  return sobra;
}
