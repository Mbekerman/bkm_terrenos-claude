/* Filtros de terrenos: botão, chips, Limpar e Visão na barra da página e a gaveta à direita (porte de
   tools/prototipo/proto_filtros.js › fxBarra, fxDrawer, fxCampo; decisões do Moises, 23/out e 4/nov/2026).
   Cada página tem o seu filtro (Mapa e Funil; pedido do Moises, 4/nov/2026), guardado na sessão e no endereço (#f=).
   Visões salvas em app.filtros_salvos: cada um salva as suas; as da empresa, só o administrador. */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import {
  FX, GRUPOS, ativos, carregarFx, chipTxt, conta, lerNum, limparDependentes, passa, soValidos, tem, tira,
  type Ctx, type DadosFx, type Def, type Filtro,
} from './dados';
import { ORD, alternar, comparar, ordTxt, soOrdValida, type Ord } from './ordem';

const GK = 'bkm-terrenos-filtros-pag';
type Guardado = Record<string, { f: Filtro; v: string | null }>;
/* a ordenação fica no navegador (localStorage), por página: a página sempre abre com ela (pedido do Moises, 9/nov/2026) */
const OK = 'bkm-terrenos-ordem';
const lerOrd = (ctx: string): unknown => { try { return (JSON.parse(localStorage.getItem(OK) || '{}') || {})[ctx]; } catch { return null; } };
function gravarOrd(ctx: string, o: Ord[]) {
  try { const g = JSON.parse(localStorage.getItem(OK) || '{}') || {}; if (o.length) g[ctx] = o; else delete g[ctx]; localStorage.setItem(OK, JSON.stringify(g)); } catch { /* sem armazenamento */ }
}
const lerG = (): Guardado => { try { return JSON.parse(sessionStorage.getItem(GK) || '{}') || {}; } catch { return {}; } };
function doEndereco(): Filtro | null {
  try { const h = location.hash.match(/[#&?]f=([^&]+)/); return h ? soValidos(JSON.parse(decodeURIComponent(h[1]))) : null; } catch { return null; }
}
function ordDoEndereco(): Ord[] | null {
  try { const h = location.hash.match(/[#&?]o=([^&]+)/); return h ? soOrdValida(JSON.parse(decodeURIComponent(h[1]))) : null; } catch { return null; }
}
function porNoEndereco(f: Filtro, o: Ord[]) {
  const h = location.hash.replace(/^#/, '').split('&').filter((x) => x && !x.startsWith('f=') && !x.startsWith('o='));
  if (Object.keys(f).length) h.push('f=' + encodeURIComponent(JSON.stringify(f)));
  if (o.length) h.push('o=' + encodeURIComponent(JSON.stringify(o)));
  history.replaceState(history.state, '', location.pathname + location.search + (h.length ? '#' + h.join('&') : ''));
}

export interface Fx {
  ctx: Ctx; D: DadosFx | null; f: Filtro; mudar: (f: Filtro) => void; visao: string | null; setVisao: (v: string | null, f?: Filtro) => void; mudou: boolean;
  aberto: boolean; setAberto: (b: boolean) => void; ok: (id: string) => boolean; n: number; eu: string | null;
  /** ordenação (só onde a página ordena uma lista: hoje, o Mapa); vazia = a ordem própria da página */
  ordena: boolean; o: Ord[]; setO: (o: Ord[]) => void; cmp: (a: string, b: string) => number;
}

/** o filtro da página: dados, seleção e quem passa */
export function useFiltros(ctx: Ctx): Fx {
  const { empresa, session } = useSessao();
  const eu = session?.user.id ?? null;
  const q = useQuery({ queryKey: ['filtros', empresa?.id], enabled: !!empresa, queryFn: () => carregarFx(empresa!.id) });
  const ordena = ctx === 'mapa';
  const [st, setSt] = useState<{ f: Filtro; v: string | null; m: boolean }>(() => {
    const e = doEndereco();
    if (e) return { f: e, v: null, m: false };
    const g = lerG()[ctx];
    return { f: soValidos(g?.f ?? {}), v: g?.v ?? null, m: false };
  });
  const [o, setO] = useState<Ord[]>(() => (ordena ? ordDoEndereco() ?? soOrdValida(lerOrd(ctx)) : []));
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    const g = lerG(); g[ctx] = { f: st.f, v: st.v };
    try { sessionStorage.setItem(GK, JSON.stringify(g)); } catch { /* sem sessão */ }
    porNoEndereco(st.f, o);
    if (ordena) gravarOrd(ctx, o);
  }, [st, o, ctx, ordena]);
  const D = q.data ?? null;
  const porId = useMemo(() => new Map((D?.ters ?? []).map((t) => [t.id, t])), [D]);
  const cmp = useCallback((a: string, b: string) => (D && o.length ? comparar(o, D, porId.get(a), porId.get(b)) : 0), [D, o, porId]);
  const passam = useMemo(() => {
    if (!D) return null;
    return new Set(D.ters.filter((t) => passa(t, ctx, D, st.f, eu)).map((t) => t.id));
  }, [D, st.f, ctx, eu]);
  /* terreno que ainda não está nos dados dos filtros (acabou de entrar) passa */
  const ok = useCallback((id: string) => !passam || passam.has(id) || !D!.ters.some((t) => t.id === id), [passam, D]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    ctx, D, f: st.f, visao: st.v, mudou: st.m, aberto, setAberto, eu,
    mudar: (f) => setSt((s) => ({ f: D ? limparDependentes(f, D) : f, v: s.v, m: !!s.v })),
    setVisao: (v, f) => setSt((s) => ({ f: f ? soValidos(f) : s.f, v, m: false })),
    ok, ordena, o, setO, cmp,
    n: D ? ativos(ctx, D, st.f).length : 0,
  };
}

interface Visao { id: string; nome: string; user_id: string | null; filtros: Filtro }
function useVisoes() {
  const { empresa } = useSessao();
  return useQuery({ queryKey: ['visoes', empresa?.id], enabled: !!empresa, queryFn: async () => {
    const { data, error } = await supabase.from('filtros_salvos').select('id,nome,user_id,filtros').eq('empresa_id', empresa!.id).order('ordem').order('nome');
    if (error) throw error;
    return (data ?? []) as Visao[];
  } });
}

/* ---------- barra da página: botão, chips, Limpar e Visão ---------- */
export function BarraFx({ fx }: { fx: Fx }) {
  const { membro, session } = useSessao();
  const toast = useToast(), qc = useQueryClient();
  const vs = useVisoes().data ?? [];
  const { D, f, ctx } = fx;
  const at = D ? ativos(ctx, D, f) : [];
  const cur = vs.find((v) => v.id === fx.visao);
  const pode = cur && (cur.user_id === session?.user.id || (!cur.user_id && membro?.administrador));
  async function excluir() {
    if (!cur) return;
    const { error } = await supabase.from('filtros_salvos').delete().eq('id', cur.id);
    if (error) { toast(error.message, true); return; }
    fx.setVisao(null);
    qc.invalidateQueries({ queryKey: ['visoes'] });
    toast(`Visão "${cur.nome}" excluída.`);
  }
  const grupo = (g: 'empresa' | 'minhas') => {
    const L = vs.filter((v) => (g === 'empresa' ? !v.user_id : v.user_id));
    return L.length ? <optgroup label={g === 'empresa' ? 'Da empresa' : 'Minhas'}>{L.map((v) => <option key={v.id} value={v.id}>{v.nome}{v.id === fx.visao && fx.mudou ? ' (alterada)' : ''}</option>)}</optgroup> : null;
  };
  return (
    <div className="fx-barra" id="fx-barra">
      <button className="fx-btn" aria-pressed={at.length > 0} aria-expanded={fx.aberto} aria-controls="fx-dr" onClick={() => fx.setAberto(!fx.aberto)}>
        <Ic n="filtro" s={18} />Filtros{at.length ? <span className="fx-n">{at.length}</span> : null}</button>
      {D && at.map((d) => <span key={d.k} className="fx-chip">{chipTxt(d, f, D)}<button className="fx-cx" aria-label={`Tirar o filtro ${d.l}`} title="Tirar" onClick={() => fx.mudar(tira(f, d.k))}><Ic n="close" s={16} /></button></span>)}
      {fx.o.length > 0 && <span className="fx-chip fx-chip-ord" title="Ordenação: abre na aba Ordenação dos filtros">Ordem: {ordTxt(fx.o)}<button className="fx-cx" aria-label="Tirar a ordenação" title="Tirar" onClick={() => fx.setO([])}><Ic n="close" s={16} /></button></span>}
      {at.length > 0 && <button className="linkbtn fx-limpar" onClick={() => { fx.setVisao(null, {}); toast('Filtros limpos.'); }}>Limpar</button>}
      <span className="fx-visw">
        <label className="fx-vis"><span className="sr-only">Visão</span>
          <select aria-label="Visão salva" value={fx.visao ?? ''} onChange={(e) => { const v = vs.find((x) => x.id === e.target.value); fx.setVisao(v?.id ?? null, v ? v.filtros : undefined); }}>
            <option value="">{cur ? 'Nenhuma' : 'Visões salvas'}</option>{grupo('empresa')}{grupo('minhas')}
          </select></label>
        {pode && <button className="iconbtn fx-vx" title={`Excluir a visão ${cur!.nome}`} aria-label={`Excluir a visão ${cur!.nome}`} onClick={excluir}><Ic n="close" s={18} /></button>}
      </span>
    </div>
  );
}

/* ---------- a gaveta ---------- */
export function GavetaFx({ fx }: { fx: Fx }) {
  const { D, f, ctx, eu } = fx;
  const [sec, setSec] = useState('funil');
  const [aba, setAba] = useState<'filtros' | 'ordem'>('filtros');
  const naOrdem = fx.ordena && aba === 'ordem';
  const [busca, setBusca] = useState<Record<string, string>>({});
  const [salvar, setSalvar] = useState(false);
  const corpo = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!fx.aberto) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape' && !salvar && !document.querySelector('.scrim')) { e.preventDefault(); e.stopPropagation(); fx.setAberto(false); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [fx, salvar]);
  if (!fx.aberto || !D) return null;
  const gs = GRUPOS.map(([g, l]) => { const ds = FX.filter((d) => d.g === g && !(ctx === 'kanban' && d.funil)); return { g, l, ds, n: ds.filter((d) => tem(d, f)).length }; }).filter((x) => x.ds.length);
  const cur = gs.find((x) => x.g === sec) ?? gs[0];
  const total = D.ters.filter((t) => passa(t, ctx, D, f, eu)).length, nat = ativos(ctx, D, f).length;
  const op = (d: Def, o: [string, string, string?]) => {
    const sel: string[] = f[d.k] || [], on = sel.includes(o[0]), n = conta(d, o[0], ctx, D, f, eu);
    return <button key={o[0]} className="fx-op" aria-pressed={on} data-zero={!on && !n ? '1' : undefined}
      onClick={() => { const nv = on ? sel.filter((x) => x !== o[0]) : [...sel, o[0]]; fx.mudar(nv.length ? { ...f, [d.k]: nv } : tira(f, d.k)); }}>
      {on && <Ic n="check" s={16} />}{o[1]} <span className="q">{n}</span></button>;
  };
  const campo = (d: Def) => {
    if (d.vis && !d.vis(D, f)) return d.dica ? <div key={d.k} className="fx-c"><div className="fx-l">{d.l}</div><div className="fx-hint">{d.dica}</div></div> : null;
    const v = f[d.k], dica = d.dica2 ? <small>{d.dica2}</small> : null;
    if (d.tipo === 'marca') {
      const n = D.ters.filter((t) => passa(t, ctx, D, f, eu, d.k) && d.p!(t, eu)).length;
      return <button key={d.k} className="fx-op fx-mk" aria-pressed={!!v} onClick={() => fx.mudar(v ? tira(f, d.k) : { ...f, [d.k]: true })}>{v && <Ic n="check" s={16} />}{d.l} <span className="q">{n}</span></button>;
    }
    if (d.tipo === 'lista') {
      let ops = d.op!(D, f);
      const sel: string[] = v || [];
      if (d.k === 'etapa' || d.k === 'sub') {
        const fs = [...new Set(ops.map((o) => o[2]))];
        return <div key={d.k} className="fx-c"><div className="fx-l">{d.l}{dica}</div>{fs.map((fk) => <div key={fk}>
          {(fs.length > 1 || d.k === 'sub') && <div className="fx-sub">{D.fases.find((x) => x.k === fk)?.nome}</div>}
          <div className="fx-ops">{ops.filter((o) => o[2] === fk).map((o) => op(d, o))}</div></div>)}</div>;
      }
      const qq = (busca[d.k] || '').toLowerCase();
      const temBusca = d.busca && ops.length > 6;
      if (qq) ops = ops.filter((o) => sel.includes(o[0]) || o[1].toLowerCase().includes(qq));
      return <div key={d.k} className="fx-c"><div className="fx-l">{d.l}{dica}</div>
        {temBusca && <input className="fx-in" type="search" placeholder={`Buscar ${d.l.toLowerCase()}…`} value={busca[d.k] || ''} aria-label={`Buscar ${d.l.toLowerCase()}`} onChange={(e) => setBusca({ ...busca, [d.k]: e.target.value })} />}
        <div className="fx-ops">{ops.length ? ops.map((o) => op(d, o)) : <span className="fx-hint">Nada encontrado.</span>}</div></div>;
    }
    if (d.tipo === 'faixa') {
      const w = v || {}, sem = D.ters.filter((t) => passa(t, ctx, D, f, eu, d.k) && d.v!(t) == null).length;
      return <div key={d.k} className="fx-c"><div className="fx-l">{d.l}{d.un ? ` (${d.un})` : ''}{dica}</div>
        <div className="fx-r"><Num d={d} p="min" fx={fx} /><span>até</span><Num d={d} p="max" fx={fx} /></div>
        {sem > 0 && tem(d, f) && <button className="fx-op fx-mk fx-sem" aria-pressed={!!w.semInfo} onClick={() => fx.mudar({ ...f, [d.k]: { ...w, semInfo: !w.semInfo } })}>{w.semInfo && <Ic n="check" s={16} />}Incluir sem informação <span className="q">{sem}</span></button>}
        {d.un === 'R$' && <div className="fx-hint">Aceita "12 mi" ou "800 mil".</div>}</div>;
    }
    if (d.tipo === 'periodo') {
      const w = v || {};
      const per = (p: 'min' | 'max', e: string) => { const x = { ...w, [p]: e || null }; fx.mudar(x.min || x.max ? { ...f, [d.k]: x } : tira(f, d.k)); };
      return <div key={d.k} className="fx-c"><div className="fx-l">{d.l}</div><div className="fx-r">
        <input className="fx-in" type="date" value={w.min || ''} aria-label="De" onChange={(e) => per('min', e.target.value)} /><span>e</span>
        <input className="fx-in" type="date" value={w.max || ''} aria-label="Até" onChange={(e) => per('max', e.target.value)} /></div></div>;
    }
    return <div key={d.k} className="fx-c"><div className="fx-l">{d.l}</div><div className="fx-r1">
      <NumSimples d={d} fx={fx} /><span>{d.suf}</span></div></div>;
  };
  /* marcas soltas ficam juntas numa linha de botões */
  const lista: JSX.Element[] = [];
  let mk: JSX.Element[] = [];
  const sai = () => { if (mk.length) { lista.push(<div key={'mk' + lista.length} className="fx-ops">{mk}</div>); mk = []; } };
  for (const d of cur.ds) { const c = campo(d); if (!c) continue; if (d.tipo === 'marca') mk.push(c); else { sai(); lista.push(c); } }
  sai();
  return createPortal(<>
    <div className="fx-scrim" onClick={() => fx.setAberto(false)} />
    <aside id="fx-dr" className="fx-dr" role="dialog" aria-label={naOrdem ? 'Ordenação' : 'Filtros'}>
      <div className="fx-h"><h2>{naOrdem ? 'Ordenação' : 'Filtros'}</h2>
        {naOrdem ? fx.o.length > 0 && <button className="linkbtn" onClick={() => fx.setO([])}>Tirar ordenação</button>
          : Object.keys(f).length > 0 && <button className="linkbtn" onClick={() => fx.setVisao(null, {})}>Limpar tudo</button>}
        <button className="iconbtn" aria-label="Fechar filtros" title="Fechar (Esc)" onClick={() => fx.setAberto(false)}><Ic n="close" s={22} /></button></div>
      {fx.ordena && <div className="seg fx-modo" role="tablist" aria-label="Filtros ou ordenação">
        <button role="tab" aria-selected={!naOrdem} className={!naOrdem ? 'on' : ''} onClick={() => setAba('filtros')}>Filtros{nat ? <span className="fx-sn">{nat}</span> : null}</button>
        <button role="tab" aria-selected={naOrdem} className={naOrdem ? 'on' : ''} onClick={() => setAba('ordem')}>Ordenação{fx.o.length ? <span className="fx-sn">{fx.o.length}</span> : null}</button></div>}
      {naOrdem ? <div className="fx-b"><section className="fx-s fx-s1" role="tabpanel"><div className="fx-sb">
        <div className="fx-hint">Um clique ordena crescente, o segundo decrescente e o terceiro tira o campo. Com vários, o primeiro manda e os seguintes desempatam. Quem não tem o dado fica no fim.</div>
        <div className="fx-ords">{ORD.map((d) => {
          const i = fx.o.findIndex((x) => x.k === d.k), st = i >= 0 ? fx.o[i] : null;
          return <button key={d.k} className="fx-ord" aria-pressed={!!st} onClick={() => fx.setO(alternar(fx.o, d.k))}
            title={st ? (st.dir === 'asc' ? 'Crescente: clique para decrescente' : 'Decrescente: clique para tirar') : 'Ordenar em ordem crescente'}>
            <span className="fx-ord-t"><span>{d.l}</span><small>{d.dica}</small></span>
            {st && fx.o.length > 1 && <span className="fx-ord-n" aria-label={`${i + 1}ª ordem`}>{i + 1}</span>}
            <span className="fx-ord-d">{st ? (st.dir === 'asc' ? '↑ Crescente' : '↓ Decrescente') : '↕'}</span></button>;
        })}</div></div></section></div> : <>
      <div className="fx-abas" role="tablist" aria-label="Seções dos filtros">{gs.map((x) =>
        <button key={x.g} role="tab" className="fx-aba" aria-selected={x.g === cur.g} aria-controls="fx-sec-b" title={x.n ? `${x.n} filtro${x.n > 1 ? 's' : ''} nesta seção` : undefined}
          onClick={() => { setSec(x.g); if (corpo.current) corpo.current.scrollTop = 0; }}>{x.l}{x.n ? <span className="fx-sn">{x.n}</span> : null}</button>)}</div>
      <div className="fx-b" ref={corpo}><section className="fx-s fx-s1" id="fx-sec-b" role="tabpanel"><div className="fx-sb">
        {cur.g === 'funil' && ctx === 'kanban' && <div className="fx-hint">No quadro, a fase e a etapa vêm da navegação (Funil › fase › etapa).</div>}
        {lista}</div></section></div></>}
      <div className="fx-f" id="fx-f"><span className="fx-tot">{nat ? `${nat} filtro${nat > 1 ? 's' : ''}` : 'Sem filtros'}</span>
        <button className="btn sm" disabled={!nat} onClick={() => setSalvar(true)}>Salvar visão</button>
        <button className="btn primary sm" onClick={() => fx.setAberto(false)}>Ver {total} terreno{total === 1 ? '' : 's'}</button></div>
    </aside>
    {salvar && <SalvarVisao fx={fx} fechar={() => setSalvar(false)} />}
  </>, document.body);
}

/* número digitado: só o resultado muda enquanto se digita; grava 250 ms depois */
function Num({ d, p, fx }: { d: Def; p: 'min' | 'max'; fx: Fx }) {
  const w = fx.f[d.k] || {}, fmt = (x: number | null | undefined) => (x == null ? '' : x.toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
  const [t, setT] = useState(fmt(w[p]));
  const tm = useRef<number>();
  useEffect(() => { if (document.activeElement?.getAttribute('data-fx') !== d.k + p) setT(fmt(w[p])); }, [w[p]]); // eslint-disable-line react-hooks/exhaustive-deps
  const aplicar = (s: string) => {
    const x = { ...(fx.f[d.k] || {}), [p]: lerNum(s) };
    fx.mudar(x.min != null || x.max != null ? { ...fx.f, [d.k]: x } : tira(fx.f, d.k));
  };
  return <input className="fx-in" inputMode="decimal" data-fx={d.k + p} placeholder={p === 'min' ? 'Mínimo' : 'Máximo'} value={t} aria-label={`${d.l} ${p === 'min' ? 'mínimo' : 'máximo'}`}
    onChange={(e) => { setT(e.target.value); clearTimeout(tm.current); const s = e.target.value; tm.current = window.setTimeout(() => aplicar(s), 250); }} />;
}
function NumSimples({ d, fx }: { d: Def; fx: Fx }) {
  const [t, setT] = useState(fx.f[d.k] != null ? String(fx.f[d.k]) : '');
  const tm = useRef<number>();
  return <input className="fx-in" inputMode="numeric" placeholder={d.ph} value={t} aria-label={d.l}
    onChange={(e) => { setT(e.target.value); clearTimeout(tm.current); const s = e.target.value; tm.current = window.setTimeout(() => {
      const n = parseInt(s, 10);
      fx.mudar(isFinite(n) && n >= 0 ? { ...fx.f, [d.k]: n } : tira(fx.f, d.k));
    }, 250); }} />;
}

/* ---------- salvar visão ---------- */
function SalvarVisao({ fx, fechar }: { fx: Fx; fechar: () => void }) {
  const { empresa, membro } = useSessao();
  const toast = useToast(), qc = useQueryClient();
  const [nome, setNome] = useState(''), [emp, setEmp] = useState(false);
  async function gravar(e: React.FormEvent) {
    e.preventDefault();
    const n = nome.trim();
    if (!n || !empresa) return;
    const { data, error } = await supabase.from('filtros_salvos').insert({ empresa_id: empresa.id, nome: n, filtros: fx.f, ...(emp ? { user_id: null } : {}) }).select('id').single();
    if (error) { toast(/duplicate|unique/i.test(error.message) ? 'Já existe uma visão com esse nome.' : error.message, true); return; }
    await qc.invalidateQueries({ queryKey: ['visoes'] });
    fx.setVisao((data as { id: string }).id, fx.f);
    fechar();
    toast(`Visão "${n}" salva${emp ? ' para a empresa' : ''}.`);
  }
  return <Dialogo titulo="Salvar visão" sub="Guarda os filtros de agora com um nome, para voltar a eles pelo seletor Visão." onFechar={fechar}
    rodape={<><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form="f-fxs">Salvar</button></>}>
    <form id="f-fxs" onSubmit={gravar}><div className="fields">
      <div className="field full"><label htmlFor="fxs-n">Nome</label><input id="fxs-n" required maxLength={60} placeholder="Ex.: Quentes em São Paulo" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      {membro?.administrador && <label className="chk full"><input type="checkbox" checked={emp} onChange={(e) => setEmp(e.target.checked)} />Para toda a empresa (todos veem; só o administrador muda)</label>}
    </div></form>
  </Dialogo>;
}

