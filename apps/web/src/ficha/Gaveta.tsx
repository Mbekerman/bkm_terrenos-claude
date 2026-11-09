import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ic } from '../components/Moldura';
import { Carregando, Erro } from '../components/ui';
import Ficha, { useFicha } from './Ficha';

// Gaveta da ficha na página Mapa (/mapa/A123/ficha; proto_tabela.js › pgFicha com UI.gav, tgavPosMapa): à direita, sobre o
// mapa, do fim da lista mais 240 px até a borda (entre 600 e 900 px); X ou Esc fecham; "Abrir página" leva à ficha própria.
// A aba fica só na gaveta, como no protótipo. A largura se arrasta pela borda esquerda, como a da lista do mapa (pedido do
// Moisés, 5/nov/2026): guardada no navegador, nunca cobre a lista nem fica abaixo de 640 px; dois cliques voltam ao padrão.
const GAV_KEY = 'bkm-terrenos-ficha-gaveta', GAV_MIN = 640;
const lerW = () => { try { return Number(localStorage.getItem(GAV_KEY)) || null; } catch { return null; } };
export default function GavetaFicha({ codigo, lado, fechar, abrirPagina, abrirMapa }: {
  codigo: string; lado: HTMLElement | null; fechar: () => void; abrirPagina: (aba: string) => void;
  abrirMapa: (lat: number, lng: number, z: number) => void;
}) {
  const q = useFicha(codigo);
  const [aba, setAba] = useState('geral');
  const el = useRef<HTMLElement>(null), corpo = useRef<HTMLDivElement>(null);
  const ult = useRef(codigo);
  if (ult.current !== codigo) { ult.current = codigo; if (aba !== 'geral') setAba('geral'); }
  useEffect(() => { corpo.current?.scrollTo({ top: 0 }); }, [codigo]);
  const [wG, setWG] = useState(lerW);
  const maxW = () => Math.max(GAV_MIN, innerWidth - Math.round(lado?.getBoundingClientRect().right || 0));
  const limitar = (w: number) => Math.round(Math.max(GAV_MIN, Math.min(maxW(), w)));
  const guardar = (w: number | null) => { setWG(w == null ? null : limitar(w)); try { if (w == null) localStorage.removeItem(GAV_KEY); else localStorage.setItem(GAV_KEY, String(limitar(w))); } catch { /* sem storage */ } };
  const pos = () => {
    const g = el.current;
    if (!g) return;
    const top = innerWidth < 900 ? 0 : (document.querySelector('.top')?.getBoundingClientRect().bottom || 0), l = lado?.getBoundingClientRect().right || 0;
    const w = Math.min(900, Math.max(600, Math.round(innerWidth * 0.5)));
    const left = innerWidth < 900 ? 0 : wG ? innerWidth - limitar(wG) : Math.max(Math.round(l) + 240, innerWidth - w);
    g.style.left = Math.max(0, Math.min(left, innerWidth - GAV_MIN)) + 'px';
    g.style.top = top + 'px';
    g.style.setProperty('--gav-h', innerHeight - top + 'px');
  };
  useLayoutEffect(pos);
  useEffect(() => {
    addEventListener('resize', pos);
    document.body.classList.add('tgav-on');
    document.body.dataset.rota = 'mapa';
    return () => { removeEventListener('resize', pos); document.body.classList.remove('tgav-on'); delete document.body.dataset.rota; };
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
    <aside className="tgav tgav-mapa" id="tgav" role="dialog" aria-label={`Ficha de ${f?.nome ?? codigo}`} ref={el}>
      <div className="tgav-redim" role="separator" aria-orientation="vertical" aria-label="Largura da ficha" tabIndex={0}
        title="Arraste para mudar a largura da ficha (dois cliques voltam ao padrão)" onPointerDown={arrastar} onDoubleClick={() => guardar(null)} onKeyDown={tecla} />
      <div className="tgav-h"><span className="num">{codigo}</span><span className="tgav-n">{f?.nome ?? ''}</span>
        <button className="btn text sm" title="Abrir a ficha na página dela" onClick={() => abrirPagina(aba)}>Abrir página</button>
        <button className="iconbtn" aria-label="Fechar a ficha" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={22} /></button>
      </div>
      <div className="tgav-b" ref={corpo}>
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !f ? <div className="empty">Terreno {codigo} não encontrado.</div>
          : <Ficha f={f} aba={aba} irAba={(k) => { setAba(k); corpo.current?.querySelector('.fi-abas')?.scrollIntoView({ block: 'nearest' }); }} abrirMapa={abrirMapa} naGaveta />}
      </div>
    </aside>
  );
}
