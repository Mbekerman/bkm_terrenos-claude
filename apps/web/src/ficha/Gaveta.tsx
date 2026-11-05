import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ic } from '../components/Moldura';
import { Carregando, Erro } from '../components/ui';
import Ficha, { useFicha } from './Ficha';

// Gaveta da ficha na página Mapa (/mapa/A123/ficha; proto_tabela.js › pgFicha com UI.gav, tgavPosMapa): à direita, sobre o
// mapa, do fim da lista mais 240 px até a borda (entre 600 e 900 px); X ou Esc fecham; "Abrir página" leva à ficha própria.
// A aba fica só na gaveta, como no protótipo.
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
  const pos = () => {
    const g = el.current;
    if (!g) return;
    const top = innerWidth < 900 ? 0 : (document.querySelector('.top')?.getBoundingClientRect().bottom || 0), l = lado?.getBoundingClientRect().right || 0;
    const w = Math.min(900, Math.max(600, Math.round(innerWidth * 0.5))), left = innerWidth < 900 ? 0 : Math.max(Math.round(l) + 240, innerWidth - w);
    g.style.left = Math.min(left, innerWidth - 480) + 'px';
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
      <div className="tgav-h"><span className="num">{codigo}</span><span className="tgav-n">{f?.nome ?? ''}</span>
        <button className="btn text sm" title="Abrir a ficha na página dela" onClick={() => abrirPagina(aba)}>Abrir página</button>
        <button className="iconbtn" aria-label="Fechar a ficha" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={22} /></button>
      </div>
      <div className="tgav-b" ref={corpo}>
        {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !f ? <div className="empty">Terreno {codigo} não encontrado.</div>
          : <Ficha f={f} aba={aba} irAba={(k) => { setAba(k); corpo.current?.querySelector('.fi-abas')?.scrollIntoView({ block: 'nearest' }); }} abrirMapa={abrirMapa} />}
      </div>
    </aside>
  );
}
