import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRoleta } from '../components/Roleta';
import { abrirQuadro, chipEscolhido, ChipsCtx, LojaQdCtx, QD } from './edicao';

// Seções da ficha em chips (pedido do Moises, 10/nov/2026): os quadros que abriam e fechavam viram chips numa barra logo
// abaixo das abas, como as subabas de Estudos Técnicos; um quadro de cada vez, o do chip escolhido. A barra é uma roleta
// (useRoleta: arrasta com o mouse, segue com inércia e freia) e, quando mais de um chip não cabe, ganha o ⋮ com todos.

const SVG_DOTS = <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01" /></svg>;

/** quantos chips ficam de fora mesmo com a melhor rolagem, numa largura `w` (a maior sequência que cabe inteira) */
function foraDaVista(larg: number[], gap: number, w: number) {
  let melhor = 0;
  for (let i = 0; i < larg.length; i++) {
    let s = 0, n = 0;
    for (let j = i; j < larg.length; j++) { s += larg[j] + (j > i ? gap : 0); if (s > w) break; n++; }
    melhor = Math.max(melhor, n);
  }
  return larg.length - melhor;
}

/** a barra de chips: roleta + ⋮ com todos quando mais de um não cabe */
export function BarraChips({ itens, ativo, ir, rotulo, sub }: {
  itens: [string, string][]; ativo: string | null; ir: (k: string) => void; rotulo: string; sub?: boolean;
}) {
  const barra = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null);
  useRoleta(barra, ativo, itens.length);
  const [mais, setMais] = useState(false), [menu, setMenu] = useState(false);
  const chave = itens.map((x) => x.join('\u0001')).join('\u0002');
  useLayoutEffect(() => {
    const w = wrap.current, b = barra.current;
    if (!w || !b) return;
    /* a decisão usa a largura sem o ⋮ (44 px), para o botão não aparecer e sumir sozinho ao entrar */
    const medir = () => {
      const bs = [...b.children] as HTMLElement[];
      const gap = parseFloat(getComputedStyle(b).columnGap) || 0;
      setMais(foraDaVista(bs.map((x) => x.offsetWidth), gap, w.clientWidth - 44) > 1);
    };
    medir();
    const ro = window.ResizeObserver ? new ResizeObserver(medir) : null;
    ro?.observe(w);
    return () => ro?.disconnect();
  }, [chave]);
  useEffect(() => {
    if (!menu) return;
    const fecha = (ev: PointerEvent) => { if (!wrap.current?.contains(ev.target as Node)) setMenu(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setMenu(false); ev.preventDefault(); ev.stopPropagation(); } };
    document.addEventListener('pointerdown', fecha, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', fecha, true); document.removeEventListener('keydown', esc, true); };
  }, [menu]);
  return (
    <div className={`fi-chips-w${sub ? ' sub' : ''}`} ref={wrap}>
      <div className="fi-subabas roleta" role="tablist" aria-label={rotulo} ref={barra}>
        {itens.map(([k, l]) => <button key={k} type="button" role="tab" data-t={k} aria-selected={k === ativo} aria-controls={`sec-${k}`} onClick={() => k !== ativo && ir(k)}>{l}</button>)}
      </div>
      {mais && (
        <div className={`adv-mais fi-mais${menu ? ' aberto' : ''}`}>
          <button type="button" className="iconbtn adv-mb" aria-haspopup="menu" aria-expanded={menu} aria-label={`Todas as seções de ${rotulo}`} title="Todas as seções" onClick={() => setMenu(!menu)}>{SVG_DOTS}</button>
          <div className="adv-menu" role="menu">
            {itens.map(([k, l]) => <button key={k} type="button" role="menuitemradio" aria-checked={k === ativo} className={k === ativo ? 'atual' : undefined} onClick={() => { setMenu(false); if (k !== ativo) ir(k); }}>{l}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}

/** os quadros da aba viram chips: cada Quadro se registra aqui; com dois ou mais, a barra aparece acima deles */
export function SecoesChips({ aba, rotulo, sub, children }: { aba: string; rotulo: string; sub?: boolean; children: ReactNode }) {
  const loja = useContext(LojaQdCtx), L = loja?.mapa ?? QD;
  const regs = useRef(new Map<string, { rot: string; el: HTMLElement }>());
  const [lista, setLista] = useState<[string, string][]>([]);
  const [, re] = useState(0);
  const refazer = useCallback(() => {
    const xs = [...regs.current.entries()].sort((a, b) => (a[1].el.compareDocumentPosition(b[1].el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const nova = xs.map(([k, v]) => [k, v.rot] as [string, string]);
    setLista((v) => (v.length === nova.length && v.every((x, i) => x[0] === nova[i][0] && x[1] === nova[i][1]) ? v : nova));
  }, []);
  const reg = useCallback((id: string, rot: string, el: HTMLElement) => {
    regs.current.set(id, { rot, el }); refazer();
    return () => { if (regs.current.get(id)?.el === el) { regs.current.delete(id); refazer(); } };
  }, [refazer]);
  /* Logs, avisos e "ir ao campo" escolhem o chip pelo abrirQuadro */
  useEffect(() => { const f = () => re((x) => x + 1); window.addEventListener('ficha-quadro', f); return () => window.removeEventListener('ficha-quadro', f); }, []);
  const esc = chipEscolhido(L, aba);
  const ativo = esc && lista.some((x) => x[0] === esc) ? esc : lista[0]?.[0] ?? null;
  const ctx = useMemo(() => ({ reg, ativo }), [reg, ativo]);
  const ir = (k: string) => {
    abrirQuadro(aba, k);
    /* rolada a página para baixo do começo da aba, ela volta até o que vem logo abaixo das abas presas */
    const abas = document.querySelector('.ficha-main .fi-abas-w') as HTMLElement | null, alvo = abas?.nextElementSibling as HTMLElement | null;
    if (!abas || !alvo) return;
    const d = alvo.getBoundingClientRect().top - abas.getBoundingClientRect().bottom;
    if (d >= 0) return;
    let p: HTMLElement | null = alvo.parentElement;
    while (p && p !== document.body && !(p.scrollHeight > p.clientHeight && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    if (p && p !== document.body) p.scrollTop += d; else window.scrollBy(0, d);
  };
  return (
    <ChipsCtx.Provider value={ctx}>
      {lista.length > 1 && <BarraChips itens={lista} ativo={ativo} ir={ir} rotulo={rotulo} sub={sub} />}
      {children}
    </ChipsCtx.Provider>
  );
}
