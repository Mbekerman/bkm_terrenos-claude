import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Ic } from '../components/Moldura';
import { Carregando, Erro } from '../components/ui';
import Ficha, { abaN, TempTopo, useFicha } from './Ficha';
import { ativarLojaQd, LojaQdCtx, type LojaQd } from './edicao';
import MenuTerreno from '../components/MenuTerreno';
import { useNavigate } from 'react-router-dom';
import { guardarPos, lerPos } from './lembrar';

// Gaveta da ficha na página Mapa (/mapa/A123/ficha; proto_tabela.js › pgFicha com UI.gav, tgavPosMapa): à direita, sobre o
// mapa, do fim da lista mais 240 px até a borda (entre 600 e 900 px); X ou Esc fecham; "Abrir página" leva à ficha própria.
// A aba fica só na gaveta, como no protótipo. A largura se arrasta pela borda esquerda, como a da lista do mapa (pedido do
// Moisés, 5/nov/2026): guardada no navegador, nunca cobre a lista nem fica abaixo de 800 px, a largura em que a barra das abas cabe inteira, com o Histórico, o alerta,
// a pastinha e o ⋮ (pedido do Moises, 11/nov/2026; antes 640); dois cliques voltam ao padrão.
const GAV_KEY = 'bkm-terrenos-ficha-gaveta', GAV_MIN = 800;
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
  const [wG, setWG] = useState(lerW);
  const maxW = () => Math.max(GAV_MIN, innerWidth - Math.round(lado?.getBoundingClientRect().right || 0));
  const limitar = (w: number) => Math.round(Math.max(GAV_MIN, Math.min(maxW(), w)));
  const guardar = (w: number | null) => { setWG(w == null ? null : limitar(w)); try { if (w == null) localStorage.removeItem(GAV_KEY); else localStorage.setItem(GAV_KEY, String(limitar(w))); } catch { /* sem storage */ } };
  const pos = () => {
    const g = el.current;
    if (!g) return;
    const top = innerWidth < 900 || cheia ? 0 : (document.querySelector('.top')?.getBoundingClientRect().bottom || 0), l = lado?.getBoundingClientRect().right || 0;
    const w = Math.min(900, Math.max(GAV_MIN, Math.round(innerWidth * 0.5)));
    const left = innerWidth < 900 ? 0 : wG ? innerWidth - limitar(wG) : naTabela ? Math.round(l) : Math.max(Math.round(l) + 240, innerWidth - w);
    g.style.left = Math.max(0, Math.min(left, innerWidth - GAV_MIN)) + 'px';
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
    const w = el.current?.getBoundingClientRect().width ?? GAV_MIN, d = ev.shiftKey ? 80 : 20;
    const n = ev.key === 'ArrowLeft' ? w + d : ev.key === 'ArrowRight' ? w - d : ev.key === 'Home' ? maxW() : ev.key === 'End' ? GAV_MIN : null;
    if (n == null) return;
    ev.preventDefault(); guardar(n);
  }
  const navegar = useNavigate();
  const fecharR = useRef(fechar);
  fecharR.current = fechar;
  useEffect(() => {
    const k = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || ev.defaultPrevented || document.querySelector('.adv-mais.aberto,.mp-ctx,.dialog,.scrim')) return;
      if ((ev.target as HTMLElement).matches?.('input,textarea,select')) return;
      fecharR.current(); ev.preventDefault();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, []);
  const f = q.data;
  return (
    <aside className={naTabela ? 'tgav' : 'tgav tgav-mapa'} id="tgav" role="dialog" aria-label={`Ficha de ${f?.nome ?? codigo}`} ref={el}>
      <div className="tgav-redim" role="separator" aria-orientation="vertical" aria-label="Largura da ficha" tabIndex={0}
        title="Arraste para mudar a largura da ficha (dois cliques voltam ao padrão)" onPointerDown={arrastar} onDoubleClick={() => guardar(null)} onKeyDown={tecla} />
      <div className="tgav-h"><span className="num">{codigo}</span><span className="tgav-n">{f?.nome ?? ''}</span>
        {f && <span className="fi-temp tgav-temp"><TempTopo f={f} /></span>}
        {f && <MenuTerreno t={f} aoSair={aoSair ?? (() => navegar('/mapa', { replace: true }))} />}
        <button className="iconbtn" aria-label="Abrir página" title="Abrir página" onClick={() => abrirPagina(aba)}><Ic n="tela" s={20} /></button>
        <button className="iconbtn" aria-label="Fechar a ficha" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={22} /></button>
      </div>
      <div className="tgav-b" ref={corpo} onScroll={rolou}>
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !f ? <div className="empty">Terreno {codigo} não encontrado.</div>
          : <LojaQdCtx.Provider value={loja}><Ficha f={f} aba={aba} irAba={(k) => {
            setAba(k); gravarRol();
            corpo.current?.querySelector('.fi-abas')?.scrollIntoView({ block: 'nearest' });
            guardarPos(codigo, { aba: k, top: Math.round(corpo.current?.scrollTop ?? 0) });
          }} abrirMapa={abrirMapa} naGaveta /></LojaQdCtx.Provider>}
      </div>
    </aside>
  );
}
