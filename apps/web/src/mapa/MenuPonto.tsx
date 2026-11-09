import { useLayoutEffect, useRef } from 'react';
import { m2 } from '../novo/geo';
import { TOQUE } from './motor';

/* menu do ponto do rascunho, ao lado dele (proto_mod.js › vMenuDesenha) */
export function MenuPonto({ area, px, i, n, area2, desfazer, acao, editando }: {
  area: HTMLElement | null; px: { x: number; y: number } | null; i: number; n: number; area2: number; desfazer: boolean; editando?: boolean;
  acao: (a: 'v-depois' | 'v-excluir' | 'v-desfazer' | 'v-cancelar') => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m || !area || !px) return;
    const W = area.clientWidth, H = area.clientHeight, w = m.offsetWidth, h = m.offsetHeight, ar = area.getBoundingClientRect();
    /* parte visível da área do mapa (a barra superior da página pode cobrir o topo) */
    const topo = Math.max(8, (document.querySelector('.top')?.getBoundingClientRect().bottom || 0) - ar.top + 8), base = Math.min(H, innerHeight - ar.top) - 8;
    const x = px.x - w / 2;
    let y = px.y - h - 24;
    if (y < topo) y = px.y + 24;
    m.style.left = Math.max(8, Math.min(W - w - 8, x)) + 'px';
    m.style.top = Math.max(topo, Math.min(base - h, y)) + 'px';
    m.querySelector('button')?.focus({ preventScroll: true });
  });
  if (!px) return null;
  const tq = TOQUE();
  return (
    <div className="v-menu" role="menu" ref={ref}>
      <div className="v-t">Ponto {i + 1} de {n}{area2 ? ` · ${m2(area2)}` : ''}</div>
      <button role="menuitem" onClick={() => acao('v-depois')}>Adicionar ponto depois</button>
      <button role="menuitem" className="crit" onClick={() => acao('v-excluir')}>Excluir ponto</button>
      {!tq && <>
        <hr />
        <button role="menuitem" disabled={!desfazer} onClick={() => acao('v-desfazer')}>Desfazer<kbd>{/Mac/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z'}</kbd></button>
        <button role="menuitem" onClick={() => acao('v-cancelar')}>{editando ? 'Cancelar edição' : 'Cancelar desenho'}<kbd>Esc</kbd></button>
      </>}
    </div>
  );
}

