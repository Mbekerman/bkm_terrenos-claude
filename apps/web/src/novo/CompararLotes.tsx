import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Dialogo } from '../components/ui';
import { Ic } from '../components/Moldura';
import { caminho, carregar, carregarSjc, lgBB, type Dados } from './LotesGeo';
import { digitos, sqlFmt } from './geosampa';
import { icFmt } from './geosanja';

// Comparar os lotes de dois cadastros que se sobrepõem (pedido do Moises, 10/nov/2026): a lista dos SQLs de cada um e o
// mapa real das quadras da prefeitura duas vezes, lado a lado, cada um acendendo os lotes daquele cadastro (em comum numa
// cor, só dele noutra). Os lotes vêm do GeoSampa (São Paulo) ou do GeoSanja (São José dos Campos), como no mapa de lotes.

export interface LadoLotes { titulo: string; lotes: string[] }
const fmt = (d: string) => (d.length === 14 ? icFmt(d) : d.length === 11 ? sqlFmt(d) : d);

export default function CompararLotes({ a, b, empresa, fechar }: { a: LadoLotes; b: LadoLotes; empresa: string; fechar: () => void }) {
  const sjc = [...a.lotes, ...b.lotes].some((x) => digitos(x).length === 14);
  const A = new Set(a.lotes.map(digitos)), B = new Set(b.lotes.map(digitos));
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    const todos = [...new Set([...A, ...B])];
    const p = sjc ? carregarSjc({ modo: 'sql', sjc: true, ics: todos.map(icFmt) }, null, new Set(), empresa, undefined, () => {})
      : carregar({ modo: 'sql', quadras: [...new Set(todos.map((x) => x.slice(0, 3) + '.' + x.slice(3, 6)))].slice(0, 8) }, null, new Set(), empresa);
    p.then((r) => vivo && setD(r)).catch((e) => { console.warn(e); if (vivo) setErro(`O ${sjc ? 'GeoSanja' : 'GeoSampa'} não respondeu. A lista dos lotes está abaixo.`); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const lado = (eu: Set<string>, outro: Set<string>, l: LadoLotes, k: string) => {
    let svg = null;
    if (d) {
      /* enquadra os lotes dos dois cadastros, com um pouco da quadra em volta */
      const meus = d.lotes.filter((x) => x.sql && (A.has(digitos(x.sql)) || B.has(digitos(x.sql))));
      const [x0, y0, x1, y1] = lgBB((meus.length ? meus : d.lotes).flatMap((x) => x.an)), mg = 25;
      svg = <svg className="lg-svg cmp-svg" viewBox={[x0 - mg, -y1 - mg, x1 - x0 + 2 * mg, y1 - y0 + 2 * mg].join(' ')} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Lotes de ${l.titulo}`}>
        <rect x={x0 - 2000} y={-y1 - 2000} width={x1 - x0 + 4000} height={y1 - y0 + 4000} className="lg-fundo" />
        {d.fundo && <image href={d.fundo.href} width={1280} height={1280} transform={`matrix(${d.fundo.m.join(' ')})`} preserveAspectRatio="none" />}
        {d.lotes.map((x, i) => { const s = x.sql ? digitos(x.sql) : ''; const c = eu.has(s) ? (outro.has(s) ? ' cmp-c' : ' cmp-s') : '';
          return <path key={i} d={caminho(x.an)} className={`lg-l${c}`}><title>{x.sql || ''}</title></path>; })}
      </svg>;
    }
    return (
      <div className="cmp-lado" key={k}>
        <div className="cmp-t"><b>{l.titulo}</b><span className="faint"> · {l.lotes.length} lote{l.lotes.length === 1 ? '' : 's'}</span></div>
        <div className="cmp-mapa">{svg ?? (erro ? null : <div className="lg-msg"><Ic n="layers" s={20} />Buscando as quadras...</div>)}</div>
        <div className="cmp-lista">{[...eu].sort().map((s) => <span key={s} className={`etq s${outro.has(s) ? ' cmp-ec' : ''}`}><span className="etq-n num">{fmt(s)}</span></span>)}</div>
      </div>
    );
  };
  return createPortal(
    <div className="cmp-dlg"><Dialogo titulo="Comparar os lotes" sub={sjc ? 'Inscrições de cada cadastro no mapa da prefeitura' : 'SQLs de cada cadastro no mapa da prefeitura'} onFechar={fechar}
      rodape={<button className="btn" onClick={fechar}>Fechar</button>}>
      {erro && <div className="banner warn"><Ic n="warn" /><div>{erro}</div></div>}
      <div className="cmp-grade">{lado(B, A, b, 'b')}{lado(A, B, a, 'a')}</div>
      <div className="lg-leg cmp-leg"><span><i className="lg-sw cmp-c" />Em comum</span><span><i className="lg-sw cmp-s" />Só deste cadastro</span><span><i className="lg-sw" />Outros lotes da quadra</span></div>
    </Dialogo></div>, document.body);
}
