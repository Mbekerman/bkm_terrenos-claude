/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '../components/Moldura';
import { supabase } from '../lib/supabase';
import {
  MF_DT, MF_UN, MK_SIT, brl, lerNum, mercado, mfAtivos, mfPassa, mkAreaN, mkData, mkDias, mkDormN, mkGrupos, mkM2, mkMarcaHtml, mkFxMarcaHtml, mkFxInfo, mkFxK, MK_FX_CHAVES, mkVisivel, mkPct, mkPeriodo,
  mkSitK, mkSitNome, mkVagaN, mkVso, num, type Emp, type Filtro,
} from './mercado';

// Marcação da Concorrência, igual à do protótipo (tools/prototipo/proto_mercado.js: mfBotao, mfDrawer, mfRodape,
// o item da legenda, mkBoxHtml, mkResumoHtml e mkTabelaHtml).

const Marca = ({ sit, fx }: { sit?: string; fx?: string }) => <span style={{ display: 'contents' }} dangerouslySetInnerHTML={{ __html: fx ? mkFxMarcaHtml(fx) : mkMarcaHtml({ sit }) }} />;

/** três pontinhos da barra do mapa: filtro da concorrência e tipo de mapa (pedido do Moisés, 5/nov/2026, no lugar do botão
 *  Concorrência; o filtro dos terrenos entra aqui quando a página Mapa do React tiver o painel de filtros) */
export function BotaoMais({ f, base, abrirConc, escolherBase }: { f: Filtro; base: 'mapa' | 'satelite'; abrirConc: () => void; escolherBase: (b: 'mapa' | 'satelite') => void }) {
  const [aberto, setAberto] = useState(false);
  const w = useRef<HTMLDivElement>(null);
  const n = mfAtivos(f).length;
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: PointerEvent) => { if (!w.current?.contains(ev.target as Node)) setAberto(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setAberto(false); ev.preventDefault(); ev.stopImmediatePropagation(); } };
    document.addEventListener('pointerdown', fora, true); document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', fora, true); document.removeEventListener('keydown', esc, true); };
  }, [aberto]);
  const tipo = (v: 'mapa' | 'satelite', l: string) => (
    <button type="button" role="menuitemradio" aria-checked={base === v} onClick={() => { setAberto(false); escolherBase(v); }}><span className="mm-ck"><Ic n="check" s={18} /></span>{l}</button>
  );
  return (
    <div className="mp-maisw" ref={w}>
      <button type="button" className="mp-renda-b mp-mais" aria-haspopup="menu" aria-expanded={aberto} aria-pressed={n > 0} title="Filtros e tipo de mapa" aria-label="Filtros e tipo de mapa" onClick={() => setAberto(!aberto)}>
        <Ic n="mais" s={22} />{n > 0 && <span className="mf-n">{n}</span>}
      </button>
      {aberto && <div className="mp-cam-m mp-mais-m" role="menu" aria-label="Filtros e tipo de mapa">
        <button type="button" role="menuitem" onClick={() => { setAberto(false); abrirConc(); }}><Ic n="filtro" s={18} /><span className="mm-l">Filtro da concorrência</span>{n > 0 && <span className="mf-n">{n}</span>}</button>
        <div className="mm-t" role="presentation">Tipo de mapa</div>
        {tipo('mapa', 'Mapa')}{tipo('satelite', 'Satélite')}
      </div>}
    </div>
  );
}

/** gaveta do filtro da concorrência, à direita */
export function FiltroConc({ f, mudar, fechar, aviso }: { f: Filtro; mudar: (f: Filtro) => void; fechar: () => void; aviso: (m: string) => void }) {
  const [busca, setBusca] = useState('');
  const [ver, setVer] = useState(0);          // redesenha os campos (formata o número digitado ao sair do campo)
  const [res, setRes] = useState(f);           // enquanto digita, só o rodapé muda
  const tempo = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => setRes(f), [f]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { fechar(); e.preventDefault(); e.stopImmediatePropagation(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [fechar]);
  const base = mercado()?.emps ?? [];
  const cont = (k: string, teste: (e: Emp) => boolean) => base.filter((e) => mfPassa(f, e, k) && teste(e)).length;
  const comFaixa = (fx: Filtro, k: string, p: string, v: any, data: boolean) => {
    const w = { ...(fx[k] || {}), [p]: v }, n = { ...fx, [k]: w };
    if ((w.min == null && w.max == null) || (data && !w.min && !w.max)) delete n[k];
    return n;
  };
  const digitado = (k: string, p: string, el: HTMLInputElement, final: boolean) => {
    const data = el.type === 'date', n = comFaixa(f, k, p, data ? el.value || null : lerNum(el.value), data);
    if (final) { mudar(n); setVer((x) => x + 1); } else setRes(n);
  };
  const op = (k: 'inc' | 'prog', v: string, l: string) => {
    const on = (f[k] || []).includes(v), n = cont(k, (e: any) => e[k] === v);
    return (
      <button key={v} className="fx-op" aria-pressed={on} data-zero={!on && !n ? '1' : undefined}
        onClick={() => { const c = f[k] || [], nv = c.includes(v) ? c.filter((x) => x !== v) : [...c, v], nf = { ...f, [k]: nv }; if (!nv.length) delete nf[k]; mudar(nf); }}>
        {on && <Ic n="check" s={16} />}{l} <span className="q">{num(n)}</span>
      </button>
    );
  };
  const q = busca.toLowerCase(), incs = (mercado()?.incs || []).filter((i) => (f.inc || []).includes(i) || !q || String(i).toLowerCase().includes(q));
  const nAt = mfAtivos(f).length, nRes = mfAtivos(res).length, tot = base.filter((e) => mfPassa(res, e)).length;
  return createPortal(<>
    <div id="mf-scrim" className="fx-scrim" onClick={fechar} />
    <aside id="mf-dr" className="fx-dr mf-dr" role="dialog" aria-label="Filtro da concorrência">
      <div className="fx-h"><h2>Filtro da concorrência</h2>{nAt > 0 && <button className="linkbtn" onClick={() => { mudar({}); setBusca(''); setVer((x) => x + 1); aviso('Filtro da concorrência limpo.'); }}>Limpar tudo</button>}
        <button className="iconbtn" aria-label="Fechar filtro" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={22} /></button></div>
      <div className="fx-b"><div className="fx-sb" key={ver}>
        <div className="fx-hint">Dormitórios, área, preço e preço por m² olham as unidades à venda: o empreendimento aparece se pelo menos uma unidade estiver dentro de todos eles ao mesmo tempo.</div>
        {MF_UN.map(([k, l, un]) => {
          const w = f[k] || {}, v = (x: any) => (x == null ? '' : num(x, k === 'area' ? 2 : 0));
          const inp = (p: 'min' | 'max', ph: string) => (
            <input className="fx-in" inputMode="decimal" placeholder={ph} defaultValue={v(w[p])} aria-label={`${l} ${ph.toLowerCase()}`}
              onInput={(ev) => { const el = ev.currentTarget; clearTimeout(tempo.current); tempo.current = setTimeout(() => digitado(k, p, el, false), 250); }}
              onBlur={(ev) => { clearTimeout(tempo.current); digitado(k, p, ev.currentTarget, true); }}
              onKeyDown={(ev) => { if (ev.key === 'Enter') { clearTimeout(tempo.current); digitado(k, p, ev.currentTarget, true); } }} />
          );
          return <div className="fx-c" key={k}><div className="fx-l">{l}{un ? ' (' + un + ')' : ''}</div><div className="fx-r">{inp('min', 'Mínimo')}<span>até</span>{inp('max', 'Máximo')}</div>{k === 'preco' && <div className="fx-hint">Aceita "270 mil" ou "1,2 mi".</div>}</div>;
        })}
        {MF_DT.map(([k, l]) => {
          const w = f[k] || {}, sem = cont(k, (e: any) => !e[k]);
          const inp = (p: 'min' | 'max', a: string) => <input className="fx-in" type="date" defaultValue={w[p] || ''} aria-label={`${l}: ${a}`} onChange={(ev) => digitado(k, p, ev.currentTarget, true)} />;
          return (
            <div className="fx-c" key={k}><div className="fx-l">{l}</div><div className="fx-r">{inp('min', 'de')}<span>até</span>{inp('max', 'até')}</div>
              {(w.min || w.max) && sem > 0 && <button className="fx-op fx-mk fx-sem" aria-pressed={!!w.semInfo} onClick={() => mudar({ ...f, [k]: { ...w, semInfo: !w.semInfo } })}>{w.semInfo && <Ic n="check" s={16} />}Incluir sem informação <span className="q">{sem}</span></button>}
            </div>
          );
        })}
        <div className="fx-c"><div className="fx-l">Programa social</div><div className="fx-ops">{op('prog', 'sim', 'Sim')}{op('prog', 'nao', 'Não')}</div><div className="fx-hint">Como o Órulo marca o empreendimento; não separa HIS de HMP.</div></div>
        <div className="fx-c"><div className="fx-l">Incorporadora</div>
          <input className="fx-in" type="search" placeholder="Buscar incorporadora…" value={busca} aria-label="Buscar incorporadora" onChange={(ev) => setBusca(ev.target.value)} />
          <div className="fx-ops">{incs.length ? incs.slice(0, q ? 200 : 40).map((i) => op('inc', i, i)) : <span className="fx-hint">Nada encontrado.</span>}</div>
          {!q && incs.length > 40 && <div className="fx-hint">Mais {incs.length - 40} na busca.</div>}
        </div>
      </div></div>
      <div className="fx-f" id="mf-f"><span className="fx-tot">{nRes ? nRes + ' filtro' + (nRes > 1 ? 's' : '') : 'Sem filtros'}</span><button className="btn primary sm" onClick={fechar}>Ver {num(tot)} empreendimento{tot === 1 ? '' : 's'}</button></div>
    </aside>
  </>, document.body);
}

/** "Concorrência" na legenda: liga e desliga a camada; a seta abre as faixas do R$/m² e, embaixo, as situações; cada linha liga e desliga a sua */
export function ItensConc({ lista, erro, ligada, off, arv, alternar, alternarArv, alternarSit }: {
  lista: Emp[] | null; erro: boolean; ligada: boolean; off: string[]; arv: boolean; alternar: () => void; alternarArv: () => void; alternarSit: (k: string) => void;
}) {
  const cont: Record<string, number> = {};
  (lista || []).forEach((e) => { const k = mkSitK(e), f = mkFxK(e); cont[k] = (cont[k] || 0) + 1; cont[f] = (cont[f] || 0) + 1; });
  const n = lista ? lista.filter((e) => mkVisivel(e, off)).length : null;
  return (
    <>
      <div className="lg-row">
        <button type="button" className="lg-sb" aria-expanded={arv} aria-label={`${arv ? 'Fechar' : 'Abrir'} as faixas de preço e as situações da concorrência`} title="Por preço e situação" onClick={alternarArv}>
          <span className={`lg-s${arv ? ' ab' : ''}`} aria-hidden="true"><Ic n="chev" s={14} /></span>
        </button>
        <button type="button" className="lg-i" aria-pressed={ligada} onClick={alternar}><span className="lg-poi"><Marca sit="pronto" /></span>Concorrência<span className="n">{n == null ? (erro ? '—' : '…') : num(n)}</span></button>
      </div>
      {arv && lista && <>
        <div className="lg-sub">R$/m² médio à venda</div>
        {MK_FX_CHAVES.filter((k) => cont[k]).map((k) => (
          <button key={k} type="button" className="lg-i lg-a lg-msit" style={{ '--p': 2 } as React.CSSProperties} aria-pressed={!off.includes(k)} disabled={!ligada} onClick={() => alternarSit(k)}>
            <span className="lg-poi"><Marca fx={k} /></span>{mkFxInfo(k)[0]}<span className="n">{num(cont[k])}</span>
          </button>
        ))}
        <div className="lg-sub">Situação</div>
        {Object.keys(MK_SIT).filter((k) => cont[k]).map((k) => (
          <button key={k} type="button" className="lg-i lg-a lg-msit" style={{ '--p': 2 } as React.CSSProperties} aria-pressed={!off.includes(k)} disabled={!ligada} onClick={() => alternarSit(k)}>
            <span className="lg-poi"><Marca sit={k} /></span>{MK_SIT[k][0]}<span className="n">{num(cont[k])}</span>
          </button>
        ))}
      </>}
    </>
  );
}

/* tipologias agrupadas; grupo com menos de min_unidades_grupo é ponto fora do padrão e sai do resumo */
function Resumo({ e }: { e: Emp }) {
  const cfg = mercado()!.cfg, min = cfg?.min_unidades_grupo ?? 3, todos = mkGrupos(e), gs = todos.filter((g) => g.unidades >= min), fora = todos.filter((g) => g.unidades < min).reduce((s, g) => s + g.unidades, 0);
  const nota = fora > 0 && <div className="faint mk-fora">{num(fora)} {fora > 1 ? 'unidades fora do padrão' : 'unidade fora do padrão'} (sem tipologia com {min} ou mais parecidas) não {fora > 1 ? 'entram' : 'entra'} no resumo.</div>;
  if (!gs.length) return <>{nota}</>;
  return (
    <>
      <div className="cc-tw"><table className="cc-t mk-t">
        <thead><tr><th>Tipologia</th><th className="num">Total</th><th className="num">Estoque</th><th className="num">R$/m²</th><th className="num" title="Vendas ÷ (vendas + estoque)">VSO</th></tr></thead>
        <tbody>{gs.map((g, i) => (
          <tr key={i}>
            <td><span className="cc-tn">{mkDormN(g.dorm)}{!!g.pequeno && <> <span className="faint" title={`Grupo com menos de ${min} unidades juntado ao vizinho`}>· pequeno</span></>}</span><div className="faint">{mkVagaN(g.vagas)} · {mkAreaN(g)}</div></td>
            <td className="num">{num(g.unidades)}</td><td className="num">{num(g.estoque)}</td>
            <td className="num">{g.m2 != null ? brl(g.m2) : g.m2p1 != null ? <span className="faint" title="Sem unidade à venda com preço: pelo primeiro preço visto">{brl(g.m2p1)}*</span> : '—'}</td>
            <td className="num">{mkPct(g.vso)}</td>
          </tr>
        ))}</tbody>
      </table></div>
      {nota}
    </>
  );
}

/** card do empreendimento tocado */
export function CaixaEmp({ e, fechar, tabela }: { e: Emp; fechar: () => void; tabela: (id: string) => void }) {
  const m2 = mkM2(e.preco, e.area), vso = mkVso(e.vendas, e.estoque), pct = e.unidades ? Math.round((100 * e.estoque) / e.unidades) : 0, dias = mkDias();
  const kv = (k: string, v: string, f?: string) => <div className="mk-kv"><span className="muted">{k}</span><span className="num">{v}</span>{f && <span className="faint">{f}</span>}</div>;
  return (
    <div id="mk-box"><div className="cc-box mk-box" role="dialog" aria-label={e.nome}>
      <div className="cc-hd"><div className="cc-ti"><div className="cc-n">{e.nome}</div><div className="muted">{[e.inc, mkSitNome(e.sit), e.bairro].filter(Boolean).join(' · ')}</div></div>
        <button type="button" className="iconbtn" aria-label="Fechar" title="Fechar (Esc)" onClick={fechar}><Ic n="close" s={20} /></button></div>
      <div className="cc-k mk-k"><div className="cc-big">{m2 != null ? brl(Math.round(m2)) + '/m²' : 'Sem estoque com preço'}</div>
        <div className="faint">{m2 != null ? 'preço médio por m² das unidades à venda' : e.estoque ? 'as unidades à venda estão sem preço na tabela' : 'nenhuma unidade à venda'}</div>
        <div className="mk-prog">Enquadramento social: <b>{e.prog === 'sim' ? 'Sim' : e.prog === 'nao' ? 'Não' : 'Não informado'}</b></div></div>
      <div className="mk-grid">{kv('Lançamento', mkData(e.lanc))}{kv('Entrega', mkData(e.ent))}{kv('Unidades', num(e.unidades))}{kv('Estoque', num(e.estoque), pct + '%')}
        {kv('Vendas', num(e.vendas), mkPeriodo())}{kv('VSO', mkPct(vso), dias ? `em ${dias} dias` : '')}</div>
      <Resumo e={e} />
      <div className="mk-tab"><button type="button" className="btn text" onClick={() => tabela(e.id)}><Ic n="doc" s={18} />Ver tabela completa</button></div>
      <div className="cc-meta faint mk-nota">Monitor de mercado (Órulo), retrato de {mkData(mercado()!.gerado)} · Tipologias agrupadas pelo resumo do empreendimento · R$/m² das unidades à venda (* pelo primeiro preço visto, sem unidade à venda) · VSO = vendas ÷ (vendas + à venda){mkPeriodo() ? ', ' + mkPeriodo() : ''}</div>
    </div></div>
  );
}

/* ---------- tabela completa do empreendimento, ao vivo do monitor (public.im_tabela_empreendimento) ---------- */
const MK_SIT_UN: Record<string, string> = { disponivel: 'À venda', reservada: 'Reservada', vendida: 'Vendida' };
const MK_TP_UN: Record<string, string> = { apartamento: 'Apto', garden: 'Garden', cobertura: 'Cobertura', duplex: 'Duplex', studio: 'Studio', loft: 'Loft', casa: 'Casa', sala: 'Sala', loja: 'Loja' };
const simNao = (v: string | null) => (v === 'sim' ? 'Sim' : v === 'nao' ? 'Não' : 'Não informado');
async function pedirTabela(id: string) {
  const { data, error } = await supabase.schema('public').rpc('im_tabela_empreendimento', { p_id: id });
  if (error) throw new Error(error.message);
  return data as any;
}
export function TabelaEmp({ id, fechar }: { id: string; fechar: () => void }) {
  const [tent, setTent] = useState(0);
  const [st, setSt] = useState<{ estado: 'carregando' | 'ok' | 'erro'; d?: any; erro?: string }>({ estado: 'carregando' });
  const [f, setF] = useState<'todas' | 'venda' | 'vendida'>('todas');
  const w = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let vivo = true;
    setSt({ estado: 'carregando' });
    /* uma nova tentativa: o primeiro pedido de um empreendimento grande pode passar do tempo do banco */
    pedirTabela(id).catch(() => pedirTabela(id))
      .then((j) => { if (!vivo) return; if (!j || !j.empreendimento) throw new Error('não encontrado'); setSt({ estado: 'ok', d: j }); })
      .catch((e) => { if (vivo) setSt({ estado: 'erro', erro: e.message }); });
    return () => { vivo = false; };
  }, [id, tent]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { fechar(); e.preventDefault(); e.stopImmediatePropagation(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [fechar]);
  useEffect(() => { if (w.current) w.current.scrollTop = 0; }, [f]);
  const x = <button className="iconbtn" aria-label="Fechar" onClick={fechar}><Ic n="close" /></button>;
  const e0 = mercado()?.emps.find((e) => e.id === id), tit = st.d?.empreendimento?.nome || e0?.nome || 'Empreendimento';
  let corpo: React.ReactNode;
  if (st.estado !== 'ok') {
    corpo = <>
      <div className="dh"><div><h2>{tit}</h2></div>{x}</div>
      <div className={`mkt-msg${st.estado === 'erro' ? '' : ' muted'}`}>{st.estado === 'erro'
        ? <>Não foi possível trazer a tabela do monitor de mercado ({st.erro || 'erro'}). <button className="btn text" onClick={() => setTent((t) => t + 1)}>Tentar de novo</button></>
        : 'Trazendo a tabela do monitor de mercado…'}</div>
    </>;
  } else {
    const E = st.d.empreendimento, U: any[] = st.d.unidades || [], venda = (u: any) => u.situacao === 'disponivel' || u.situacao === 'reservada';
    const cont = { todas: U.length, venda: U.filter(venda).length, vendida: U.filter((u) => u.situacao === 'vendida').length };
    const lista = f === 'venda' ? U.filter(venda) : f === 'vendida' ? U.filter((u) => u.situacao === 'vendida') : U;
    const tp = (t: string | null) => (t ? MK_TP_UN[t] || t.charAt(0).toUpperCase() + t.slice(1) : '—'), ar = (a: number | null) => (a == null ? '—' : num(a, 2) + ' m²');
    const per = (u: any) => { if (!u.vendida_de) return ''; if (u.vendida_de === u.vendida_ate) return mkData(u.vendida_de); const a = mkData(u.vendida_de), b = mkData(u.vendida_ate); return `${a.slice(6) === b.slice(6) ? a.slice(0, 5) : a} a ${b}`; };
    const kv = (k: string, v: React.ReactNode) => <div className="mkt-kv"><span className="muted">{k}</span><span>{v}</span></div>;
    const seg = (k: 'todas' | 'venda' | 'vendida', n: number) => <button type="button" className={`mkt-f${f === k ? ' on' : ''}`} aria-pressed={f === k} onClick={() => setF(k)}>{{ todas: 'Todas', venda: 'À venda', vendida: 'Vendidas' }[k]} <span className="num">{num(n)}</span></button>;
    const suites = (u: any) => (u.suites ? ` (${u.suites} suíte${u.suites > 1 ? 's' : ''})` : '');
    corpo = <>
      <div className="dh"><div><h2>{tit}</h2><div className="muted" style={{ marginTop: 4 }}>{[mkSitNome(E.situacao), E.bairro].filter(Boolean).join(' · ')}</div></div>{x}</div>
      <div className="mkt-cab">{kv('Incorporadora', E.incorporadora || 'Não informada')}{kv('CNPJ', E.cnpj || 'Não informado')}{kv('Endereço', E.endereco || 'Não informado')}
        {kv('Torres', E.torres == null ? '—' : num(E.torres))}{kv('Tipo', [E.tipo, E.finalidade].filter(Boolean).join(', ') || '—')}{kv('Enquadramento social', simNao(E.programa_social))}
        {kv('Lançamento', mkData(E.lancamento))}{kv('Entrega', mkData(E.entrega))}{kv('Unidades no Órulo', E.unidades == null ? '—' : num(E.unidades))}
        {E.link && kv('Fonte', <a href={E.link} target="_blank" rel="noopener">Ver no Órulo</a>)}</div>
      <div className="mkt-fs" role="group" aria-label="Situação">{seg('todas', cont.todas)}{seg('venda', cont.venda)}{seg('vendida', cont.vendida)}</div>
      {lista.length ? <div className="mkt-w" ref={w}>
        <table className="mkt"><thead><tr><th>Torre</th><th className="n">Andar</th><th>Unidade</th><th>Tipo</th><th className="n">Dorm.</th><th className="n">Vagas</th><th className="n">Área</th><th>Situação</th><th className="n">Preço</th><th className="n">R$/m²</th><th className="n">Primeiro preço</th><th>Vendida</th></tr></thead>
          <tbody>{lista.map((u, i) => { const m2 = mkM2(u.preco, u.area); return (
            <tr key={i} className={`mkt-${u.situacao || 'x'}`}>
              <td data-l="Torre">{u.torre || '—'}</td><td className="n" data-l="Andar">{u.andar == null ? '—' : u.andar}</td><td data-l="Unidade"><b>{u.numero || '—'}</b></td><td data-l="Tipo">{tp(u.tipo)}</td>
              <td className="n" data-l="Dorm.">{u.dormitorios == null ? '—' : u.dormitorios}{u.suites ? <span className="faint">{suites(u)}</span> : null}</td><td className="n" data-l="Vagas">{u.vagas == null ? '—' : u.vagas}</td><td className="n" data-l="Área">{ar(u.area)}</td>
              <td data-l="Situação"><span className="mkt-s">{MK_SIT_UN[u.situacao] || 'Não informada'}</span></td><td className="n" data-l="Preço">{u.preco == null ? '—' : brl(u.preco)}</td><td className="n" data-l="R$/m²">{m2 == null ? '—' : brl(m2)}</td>
              <td className="n" data-l="Primeiro preço">{u.primeiro_preco == null ? '—' : <>{brl(u.primeiro_preco)}<span className="faint mkt-sub">{u.primeiro_preco_em ? 'em ' + mkData(u.primeiro_preco_em) : ''}</span></>}</td>
              <td data-l="Vendida">{u.vendida_de ? (u.vendida_de === u.vendida_ate ? mkData(u.vendida_de) : <>{mkData(u.vendida_de)}<span className="mkt-sub">a {mkData(u.vendida_ate)}</span></>) : <span className="faint">—</span>}</td>
            </tr>); })}</tbody></table>
        <div className="mkt-m">{lista.map((u, i) => { const m2 = mkM2(u.preco, u.area), pv = per(u); return (
          <div key={i} className={`mkt-r mkt-${u.situacao || 'x'}`}>
            <div className="mkt-r1"><b>{[u.torre ? 'Torre ' + u.torre : '', u.numero].filter(Boolean).join(' · ') || '—'}</b>{u.andar != null && <span className="muted"> · {u.andar}º andar</span>}<span className="mkt-s">{MK_SIT_UN[u.situacao] || 'Não informada'}</span></div>
            <div className="muted">{[tp(u.tipo), u.dormitorios != null ? u.dormitorios + ' dorm.' + suites(u) : '', u.vagas != null ? u.vagas + ' vaga' + (u.vagas === 1 ? '' : 's') : '', ar(u.area)].filter((s) => s && s !== '—').join(' · ')}</div>
            <div>{u.preco != null ? <><b>{brl(u.preco)}</b>{m2 != null && <span className="muted"> · {brl(m2)}/m²</span>}</> : <span className="muted">Sem preço</span>}{u.primeiro_preco != null && <span className="faint"> · primeiro {brl(u.primeiro_preco)}{u.primeiro_preco_em ? ' em ' + mkData(u.primeiro_preco_em) : ''}</span>}</div>
            {pv && <div className="faint">Vendida {pv.includes(' a ') ? 'entre ' + pv.replace(' a ', ' e ') : 'em ' + pv}</div>}
          </div>); })}</div>
      </div> : <div className="mkt-msg muted">Nenhuma unidade nesta situação.</div>}
      <div className="faint mkt-nota">Monitor de mercado (Órulo), ao vivo. Unidades ativas, residenciais. Preço e situação da última coleta; "Vendida" é o período em que o monitor viu a venda (as de antes do monitor ficam sem data). Enquadramento social é do empreendimento: o Órulo não diz quais unidades são HIS ou HMP.</div>
    </>;
  }
  return (
    <div className="scrim" onMouseDown={(ev) => ev.target === ev.currentTarget && fechar()}>
      <div className="dialog mkt-dlg" role="dialog" aria-modal="true">{corpo}</div>
    </div>
  );
}
