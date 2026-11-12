import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ic } from '../components/Moldura';
import { Carregando, Erro } from '../components/ui';
import Ficha, { abaN, TempTopo, useFicha } from './Ficha';
import { ativarLojaQd, LojaQdCtx, segurarRolagem, type LojaQd } from './edicao';
import MenuTerreno from '../components/MenuTerreno';
import { useNavigate } from 'react-router-dom';
import { guardarPos, lerPos } from './lembrar';

// Gaveta da ficha na página Mapa (/mapa/A123/ficha; proto_tabela.js › pgFicha com UI.gav, tgavPosMapa): à direita, sobre o
// mapa, do fim da lista mais 240 px até a borda (entre 600 e 900 px); X ou Esc fecham; "Abrir página" leva à ficha própria.
// A aba fica só na gaveta, como no protótipo. A largura se arrasta pela borda esquerda, como a da lista do mapa (pedido do
// Moisés, 5/nov/2026): guardada no navegador, nunca cobre a lista nem fica mais estreita que o necessário para a barra das
// abas caber inteira, com a pastinha e, quando falta algo na ficha, o alerta (pedidos do Moises, 11/nov/2026: antes 640,
// depois 800 fixos; agora medido na própria barra, `minimo`); dois cliques voltam ao padrão.
const GAV_KEY = 'bkm-terrenos-ficha-gaveta', GAV_MIN = 800;
/** a menor largura da gaveta em que a barra das abas cabe inteira: a largura de agora, menos o espaço da roleta, mais o
 *  comprimento das abas, e o lugar do alerta quando ele pode aparecer (a ficha tem o que falta) e ainda não está na barra */
function minimo(g: HTMLElement | null) {
  const a = g?.querySelector<HTMLElement>('.fi-abas');
  const bs = a ? [...a.children] as HTMLElement[] : [];
  if (!g || !a || !bs.length) return null;
  const cs = getComputedStyle(a);
  const conteudo = bs[bs.length - 1].getBoundingClientRect().right - bs[0].getBoundingClientRect().left
    + (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0);
  const fim = g.querySelector('.fi-fim');
  const alerta = g.querySelector('.complete .fi-comp-n') && !fim?.querySelector('.fi-alerta') ? 40 : 0;
  return Math.ceil(g.getBoundingClientRect().width - a.clientWidth + conteudo + alerta + 1);
}
const POR_CIMA = '.adv-mais.aberto,.mp-ctx,.dialog,.scrim,[role=dialog]:not(#tgav),[role=menu]:not([hidden]),[role=listbox]:not([hidden]),[role=tooltip]';
const CAMPO = 'input,textarea,select,[contenteditable=""],[contenteditable="true"]';
/** os menus ⋮ ficam montados e escondidos pelo CSS: só conta o que aparece */
const visivel = (e: HTMLElement) => (e.checkVisibility ? e.checkVisibility({ visibilityProperty: true }) : e.getClientRects().length > 0);
/** pede à gaveta encolhida que volte a abrir (o clique no mesmo pino ou na mesma linha) */
export const expandirGaveta = () => dispatchEvent(new Event('bkm-gaveta-expandir'));
export const gavetaEncolhida = () => document.body.classList.contains('tgav-encolhida');
/* Tab abre e fecha a gaveta (pedido do Moises, 12/nov/2026), no Mapa e no Pipeline: fechada, abre o último terreno que
   esteve na gaveta naquela tela (guardado no navegador, `bkm-terrenos-gaveta-ultimo`, por tela); aberta, encolhe (fica a
   seta, como a aba `.tgav-aba`; correção do Moises, 12/nov/2026: o Tab não fecha); encolhida, volta a abrir. Nessas telas
   o Tab não passa mais de campo (o Enter faz isso): um campo em edição é gravado (blur) antes de a gaveta encolher. Com janela, menu ou lista de sugestões aberta por cima, o Tab segue como era. */
const ULT_KEY = 'bkm-terrenos-gaveta-ultimo';
export function lerUltimo(tela: string): string | null {
  try { return (JSON.parse(localStorage.getItem(ULT_KEY) || '{}') as Record<string, string>)[tela] || null; } catch { return null; }
}
function gravarUltimo(tela: string, cod: string) {
  try { const o = JSON.parse(localStorage.getItem(ULT_KEY) || '{}'); o[tela] = cod; localStorage.setItem(ULT_KEY, JSON.stringify(o)); } catch { /* sem storage */ }
}
export function useTabGaveta(tela: string, aberto: string | null, abrir: (cod: string) => void) {
  useEffect(() => { if (aberto) gravarUltimo(tela, aberto); }, [tela, aberto]);
  const r = useRef({ aberto, abrir });
  r.current = { aberto, abrir };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key !== 'Tab' || ev.defaultPrevented || ev.ctrlKey || ev.altKey || ev.metaKey || ev.isComposing) return;
      if ([...document.querySelectorAll<HTMLElement>(POR_CIMA + ',#fx-dr')].some(visivel)) return;
      ev.preventDefault();
      const { aberto, abrir } = r.current;
      if (aberto) {
        if (gavetaEncolhida()) { expandirGaveta(); return; }
        const a = document.activeElement as HTMLElement | null;
        if (a?.matches(CAMPO)) a.blur();
        dispatchEvent(new Event('bkm-gaveta-encolher'));
        return;
      }
      const cod = lerUltimo(tela);
      if (cod) abrir(cod);
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [tela]);
}
const lerW = () => { try { return Number(localStorage.getItem(GAV_KEY)) || null; } catch { return null; } };
// No Pipeline (/terrenos/A123/gaveta; proto_tabela.js › tgavPos), `naTabela`: a gaveta cobre a tabela a partir do fim da
// coluna 1 (`lado` é o título dela) e, com a tabela em tela cheia, começa no alto da tela.
export default function GavetaFicha({ codigo, lado, fechar, abrirPagina, abrirMapa, naTabela, cheia, aoSair }: {
  codigo: string; lado: HTMLElement | null; fechar: () => void; abrirPagina: (aba: string) => void;
  abrirMapa: (lat: number, lng: number, z: number) => void; naTabela?: boolean; cheia?: boolean; aoSair?: () => void;
}) {
  const q = useFicha(codigo);
  /* onde a pessoa parou neste terreno (pedido do Moises, 9/nov/2026; lembrar.ts): a aba, a rolagem e os quadros
     abertos e fechados voltam como estavam ao reabrir a gaveta, também depois de fechar o navegador */
  const abaGuardada = (c: string) => abaN(lerPos(c)?.aba);
  const [aba, setAba] = useState(() => abaGuardada(codigo));
  const el = useRef<HTMLElement>(null), corpo = useRef<HTMLDivElement>(null);
  const ult = useRef(codigo);
  if (ult.current !== codigo) { ult.current = codigo; const a = abaGuardada(codigo); if (aba !== a) setAba(a); }
  const loja = useMemo<LojaQd>(() => {
    const mapa: LojaQd['mapa'] = {};
    for (const [a, ids] of Object.entries(lerPos(codigo)?.qd ?? {})) mapa[a] = new Set(ids);
    return { mapa, mudou: () => guardarPos(codigo, { qd: Object.fromEntries(Object.entries(mapa).map(([a, s]) => [a, [...s]])) }) };
  }, [codigo]);
  ativarLojaQd(loja);
  useEffect(() => () => ativarLojaQd(null), []);
  /* rolagem: guardada logo depois de parar (e na hora, ao trocar de terreno ou fechar); enquanto volta à posição
     guardada, não grava (o conteúdo das abas ainda pode estar carregando e a gaveta crescendo) */
  const pronto = !!q.data;
  const rol = useRef<{ cod: string; top: number } | null>(null), rolT = useRef(0), voltando = useRef(false), prog = useRef(0);
  const gravarRol = () => { clearTimeout(rolT.current); if (rol.current) guardarPos(rol.current.cod, { top: rol.current.top }); rol.current = null; };
  useEffect(() => gravarRol, [codigo]);
  const rolou = () => {
    if (voltando.current || !corpo.current || !pronto || performance.now() - prog.current < 150) return;
    rol.current = { cod: codigo, top: Math.round(corpo.current.scrollTop) };
    clearTimeout(rolT.current); rolT.current = window.setTimeout(gravarRol, 200);
  };
  useLayoutEffect(() => {
    const c = corpo.current;
    if (!c) return;
    prog.current = performance.now();
    if (!pronto) { c.scrollTop = 0; return; }
    const alvo = lerPos(codigo)?.top ?? 0;
    c.scrollTop = alvo;
    if (!alvo || c.scrollTop >= alvo - 1) return;
    /* a aba ainda não tem altura para a posição guardada: segue tentando enquanto ela cresce, até 6 s ou até a pessoa mexer */
    voltando.current = true;
    const ro = new ResizeObserver(() => { c.scrollTop = alvo; if (c.scrollTop >= alvo - 1) parar(); });
    const t = window.setTimeout(() => parar(), 6000);
    const parar = () => {
      ro.disconnect(); clearTimeout(t); voltando.current = false;
      for (const e of ['wheel', 'touchstart', 'pointerdown', 'keydown']) c.removeEventListener(e, parar);
    };
    for (const k of c.children) ro.observe(k);
    for (const e of ['wheel', 'touchstart', 'pointerdown', 'keydown']) c.addEventListener(e, parar, { passive: true });
    return parar;
  }, [codigo, pronto]);
  /* encolher sem fechar, como o painel do Google Maps (pedido do Moises, 11/nov/2026): a aba com a seta na borda esquerda
     tira a gaveta para fora da tela, ficando só a aba, e o clique nela traz de volta; outro terreno, o mesmo pino ou a
     mesma linha também a abrem. Não fica guardada: a gaveta sempre abre aberta. */
  const [encolhida, setEncolhida] = useState(false);
  useEffect(() => { setEncolhida(false); }, [codigo]);
  useEffect(() => {
    const ab = () => setEncolhida(false), en = () => setEncolhida(true);
    addEventListener('bkm-gaveta-expandir', ab); addEventListener('bkm-gaveta-encolher', en);
    return () => { removeEventListener('bkm-gaveta-expandir', ab); removeEventListener('bkm-gaveta-encolher', en); };
  }, []);
  useEffect(() => {
    document.body.classList.toggle('tgav-encolhida', encolhida);
    return () => document.body.classList.remove('tgav-encolhida');
  }, [encolhida]);
  const [wG, setWG] = useState(lerW);
  /* a largura mínima, medida depois que a ficha aparece (antes dela, 800) */
  const minR = useRef(GAV_MIN);
  const gMin = () => minR.current;
  const maxW = () => Math.max(gMin(), innerWidth - Math.round(lado?.getBoundingClientRect().right || 0));
  const limitar = (w: number) => Math.round(Math.max(gMin(), Math.min(maxW(), w)));
  const guardar = (w: number | null) => { setWG(w == null ? null : limitar(w)); try { if (w == null) localStorage.removeItem(GAV_KEY); else localStorage.setItem(GAV_KEY, String(limitar(w))); } catch { /* sem storage */ } };
  const pos = () => {
    const g = el.current;
    if (!g) return;
    const m = minimo(g);
    if (m) minR.current = m;
    const top = innerWidth < 900 || cheia ? 0 : (document.querySelector('.top')?.getBoundingClientRect().bottom || 0), l = lado?.getBoundingClientRect().right || 0;
    const w = Math.min(900, Math.max(gMin(), Math.round(innerWidth * 0.5)));
    const left = innerWidth < 900 ? 0 : wG ? innerWidth - limitar(wG) : naTabela ? Math.round(l) : Math.max(Math.round(l) + 240, innerWidth - w);
    g.style.left = Math.max(0, Math.min(left, innerWidth - gMin())) + 'px';
    g.style.top = top + 'px';
    g.style.setProperty('--gav-h', innerHeight - top + 'px');
  };
  useLayoutEffect(pos);
  useEffect(() => {
    addEventListener('resize', pos);
    document.body.classList.add('tgav-on');
    if (!naTabela) document.body.dataset.rota = 'mapa';
    return () => { removeEventListener('resize', pos); document.body.classList.remove('tgav-on'); if (!naTabela) delete document.body.dataset.rota; };
  });
  function arrastar(ev: React.PointerEvent<HTMLDivElement>) {
    if (ev.button > 0) return;
    ev.preventDefault();
    const g = el.current!, x0 = ev.clientX, w0 = g.getBoundingClientRect().width;
    document.body.classList.add('mp-arrastando');
    const mover = (e: PointerEvent) => { g.style.left = Math.max(0, innerWidth - limitar(w0 - (e.clientX - x0))) + 'px'; };
    const soltar = (e: PointerEvent) => {
      removeEventListener('pointermove', mover); removeEventListener('pointerup', soltar);
      document.body.classList.remove('mp-arrastando'); guardar(w0 - (e.clientX - x0));
    };
    addEventListener('pointermove', mover); addEventListener('pointerup', soltar);
  }
  function tecla(ev: React.KeyboardEvent) {
    const w = el.current?.getBoundingClientRect().width ?? gMin(), d = ev.shiftKey ? 80 : 20;
    const n = ev.key === 'ArrowLeft' ? w + d : ev.key === 'ArrowRight' ? w - d : ev.key === 'Home' ? maxW() : ev.key === 'End' ? gMin() : null;
    if (n == null) return;
    ev.preventDefault(); guardar(n);
  }
  const navegar = useNavigate();
  const fecharR = useRef(fechar);
  fecharR.current = fechar;
  /* algo aberto por cima (janela, menu, lista, balão) ou um campo em edição na gaveta: o Esc e o clique fora fecham
     primeiro isso, e só o seguinte fecha a gaveta (pedido do Moises, 11/nov/2026) */
  const temPorCima = () => [...document.querySelectorAll<HTMLElement>(POR_CIMA)].some(visivel);
  const editando = () => { const a = document.activeElement; return !!a && !!el.current?.contains(a) && a.matches(CAMPO); };
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented || temPorCima()) return;
      if ((ev.target as HTMLElement).matches?.(CAMPO)) return;
      fecharR.current(); ev.preventDefault();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  /* no Pipeline, o clique fora da tabela e da gaveta fecha a gaveta; o clique na tabela continua trocando o terreno */
  useEffect(() => {
    if (!naTabela) return;
    const p = (ev: PointerEvent) => {
      if (ev.button > 0) return;
      const t = ev.target as Element | null;
      if (!t?.isConnected || !document.getElementById('root')?.contains(t)) return; // janelas e listas soltas no body
      if (t.closest('#tgav,table.lista-ter') || temPorCima() || editando() || gavetaEncolhida()) return;
      fecharR.current();
    };
    document.addEventListener('pointerdown', p, true);
    return () => document.removeEventListener('pointerdown', p, true);
  }, [naTabela]);
  const f = q.data;
  const irAba = (k: string) => {
    setAba(k); gravarRol();
    corpo.current?.querySelector('.fi-abas')?.scrollIntoView({ block: 'nearest' });
    guardarPos(codigo, { aba: k, top: Math.round(corpo.current?.scrollTop ?? 0) });
  };
  return (
    <aside className={(naTabela ? 'tgav' : 'tgav tgav-mapa') + (encolhida ? ' encolhida' : '')} id="tgav" role="dialog" aria-label={`Ficha de ${f?.nome ?? codigo}`} ref={el}>
      <div className="tgav-redim" role="separator" aria-orientation="vertical" aria-label="Largura da ficha" tabIndex={0}
        title="Arraste para mudar a largura da ficha (dois cliques voltam ao padrão)" onPointerDown={arrastar} onDoubleClick={() => guardar(null)} onKeyDown={tecla} />
      <button type="button" className="tgav-aba" aria-expanded={!encolhida} aria-label={encolhida ? 'Expandir a ficha' : 'Recolher a ficha'}
        title={encolhida ? 'Expandir a ficha' : 'Recolher a ficha'} onClick={() => setEncolhida((e) => !e)}><Ic n="chev" s={20} /></button>
      <div className="tgav-h"><span className="num">{codigo}</span><span className="tgav-n">{f?.nome ?? ''}</span>
        {f && <span className="fi-temp tgav-temp"><TempTopo f={f} /></span>}
        {f && <MenuTerreno t={f} aba={aba} ir={(k) => { segurarRolagem(corpo.current?.querySelector('.ficha-main')); irAba(k); }} aoSair={aoSair ?? (() => navegar('/mapa', { replace: true }))} />}
        <button className="iconbtn" aria-label="Abrir página" title="Abrir página" onClick={() => abrirPagina(aba)}><Ic n="tela" s={20} /></button>
        <button className="iconbtn" aria-label="Fechar a ficha" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={22} /></button>
      </div>
      <div className="tgav-b" ref={corpo} onScroll={rolou}>
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !f ? <div className="empty">Terreno {codigo} não encontrado.</div>
          : <LojaQdCtx.Provider value={loja}><Ficha f={f} aba={aba} irAba={irAba} abrirMapa={abrirMapa} naGaveta /></LojaQdCtx.Provider>}
      </div>
    </aside>
  );
}
