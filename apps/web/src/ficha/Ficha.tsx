import { useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSessao } from '../lib/sessao';
import { supabase } from '../lib/supabase';
import { data as fd, milhoes, m2 } from '../lib/format';
import { useToast } from '../components/ui';
import { Bi, Ic } from '../components/Moldura';
import { corSub, type Fase as FaseMapa, type TerrenoMapa } from '../mapa/dados';
import { carregarFicha, completude, FONTE_AREA, TEMP, TP_N, ZONA, type Ficha as F, type ProcF } from './dados';
import MiniMapa from './MiniMapa';
import AbaTerreno, { dadosArea, dadosEndereco, fonteSel, numInp, useEdicao, valoresArea } from './Terreno';
import { CamposEndereco, END_CAMPOS, lerNum, OPT } from './edicao';

// Ficha do terreno, porte de tools/prototipo/proto.js › pgFicha (topo, abas, fiAbasCaber), proto_fases.js › linhaTopo,
// proto_funil.js › linhaEtapas e proto_mod.js › abaGeral (Visão geral: Localização e Resumo). Mesma marcação e classes do
// protótipo (estilos em styles.css). Primeira entrega do porte da ficha: topo, abas e Visão geral; Terreno e Comercial
// vêm nas próximas, e o quadro de avanço com o painel de Logs depois delas. As abas fora da primeira versão ficam
// com o aviso.

export const ABAS: [string, string][] = [['geral', 'Visão geral'], ['terreno', 'Terreno'], ['comercial', 'Comercial'], ['parametros', 'Parâmetros'],
  ['massa', 'Estudos de massa'], ['viabilidade', 'Viabilidades'], ['infra', 'Infraestrutura'], ['entorno', 'Entorno'], ['jornada', 'Jornada'], ['documentos', 'Documentos']];
/** links antigos caem na aba nova (CLAUDE.md, ficha em abas) */
const ANTIGA: Record<string, string> = { cadastro: 'terreno', negociacao: 'comercial', urbanismo: 'parametros', fases: 'jornada', viabilidades: 'viabilidade' };
export const abaN = (k: string | undefined | null) => { const a = ANTIGA[k ?? ''] ?? k ?? 'geral'; return ABAS.some((x) => x[0] === a) ? a : 'geral'; };
const PROXIMAS = new Set(['comercial']);

const num = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: d }));
const aberto = (p?: ProcF | null) => !!p && (p.status === 'ativo' || p.status === 'stand_by');

/** fase atual: a aberta mais adiante; sem nenhuma aberta, a última que o terreno teve */
function faseAtual(f: F): { k: string; p: ProcF | null } | null {
  const ord = f.fases.map((x) => x.k);
  const ps = f.procs.slice().sort((a, b) => ord.indexOf(a.fase) - ord.indexOf(b.fase));
  const ab = ps.filter(aberto);
  if (ab.length) { const p = ab[ab.length - 1]; return { k: p.fase, p }; }
  if (!ps.length) return null;
  const k = ps[ps.length - 1].fase;
  return { k, p: f.procs.filter((p) => p.fase === k).slice(-1)[0] ?? null };
}

/** linha do tempo do topo: na entrada, as etapas da negociação; depois, as fases */
function LinhaTopo({ f }: { f: F }) {
  const a = faseAtual(f), ent = f.fases.find((x) => x.entrada);
  const ck = <Ic n="check" s={14} />;
  if (!a || a.k === ent?.k) {
    const n = ent && f.procs.filter((p) => p.fase === ent.k).slice(-1)[0];
    if (!n) return null;
    const ets = f.etapasEnt, idx = ets.findIndex((e) => e.k === n.etapa), fim = n.status === 'concluido';
    const entrou = (e: string) => {
      const x = f.trans.filter((v) => v.processo === n.id && v.paraEtapa === e && v.deEtapa !== e).pop();
      return x ? x.em.slice(0, 10) : n.etapa === e ? n.desde : null;
    };
    const sub = n.sub ? ets[idx]?.subs.find((s) => s.k === n.sub)?.nome : null;
    return (
      <nav className="tl-topo" aria-label="Etapas da negociação"><ol className="stepper">
        {ets.map((s, i) => {
          const st = i < idx || fim ? 'done' : i === idx ? 'cur' : 'fut', em = i <= idx ? entrou(s.k) : null;
          return (
            <li key={s.k} className={`step ${st}`} aria-current={i === idx && !fim ? 'step' : undefined}>
              <span className="dot">{st === 'done' ? ck : i + 1}</span>
              <span className="sl-w"><span className="sl" title={s.nome}>{s.nome}</span>{em && <span className="sd">{st === 'cur' && sub ? sub + ' · ' : ''}{fd(em)}</span>}</span>
            </li>
          );
        })}
        {fim && <li className="step done"><span className="dot">{ck}</span><span className="sl-w"><span className="sl">Comprado</span><span className="sd">{fd(n.encerrado)}</span></span></li>}
      </ol></nav>
    );
  }
  const teve = (k: string) => f.procs.some((p) => p.fase === k);
  return (
    <nav className="tl-topo" aria-label="Fases do terreno"><ol className="stepper">
      {f.fases.filter((x) => x.ativo || teve(x.k)).map((x, i) => {
        const p = f.procs.filter((q) => q.fase === x.k).slice(-1)[0], fim = p?.status === 'concluido', cur = x.k === a.k && !fim;
        const st = fim ? 'done' : cur || aberto(p) ? 'cur' : 'fut';
        const sd = !p ? '' : cur || aberto(p) ? f.etapasPorFase[x.k]?.find((e) => e.k === p.etapa)?.nome ?? '' : fim ? fd(p.encerrado) : '';
        return (
          <li key={x.k} className={`step ${st}`} aria-current={cur ? 'step' : undefined}>
            <span className="dot">{st === 'done' ? ck : i + 1}</span>
            <span className="sl-w"><span className="sl" title={x.nome}>{x.nome}</span>{sd && <span className="sd" title={sd}>{sd}</span>}</span>
          </li>
        );
      })}
    </ol></nav>
  );
}

/** fase, etapa e subetapa do topo; fora de andamento, a situação no lugar da etapa */
function faseTxt(f: F): ReactNode[] {
  const a = faseAtual(f);
  if (!a) return [];
  const fase = f.fases.find((x) => x.k === a.k), p = a.p, nome = fase?.nome ?? a.k;
  if (!p) return [nome];
  if (p.status !== 'ativo') {
    const n = fase?.entrada
      ? ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: 'Comprado' } as Record<string, string>)[p.status] ?? p.status
      : ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: 'Concluído' } as Record<string, string>)[p.status] ?? p.status;
    return [nome, <span className={`chip ${p.status === 'concluido' ? 'good' : p.status === 'stand_by' ? 'warn' : ''}`}>{n}</span>];
  }
  const e = f.etapasPorFase[a.k]?.find((x) => x.k === p.etapa), s = p.sub ? e?.subs.find((x) => x.k === p.sub)?.nome : '';
  return [nome, e?.nome ?? p.etapa, s].filter(Boolean) as string[];
}

function Temperatura({ f, pode }: { f: F; pode: boolean }) {
  const qc = useQueryClient(), toast = useToast();
  const [v, setV] = useState(f.temp ?? 0);
  useEffect(() => setV(f.temp ?? 0), [f.temp]);
  async function definir(n: number) {
    const antes = v;
    setV(n);
    const { error } = await supabase.rpc('definir_temperatura', { p_processo: f.negId, p_temperatura: n || null });
    if (error) { setV(antes); toast(error.message); return; }
    qc.invalidateQueries({ queryKey: ['ficha'] });
    qc.invalidateQueries({ queryKey: ['mapa'] });
  }
  return (
    <div className="temp" title="Temperatura da negociação">
      <span className="bars" role="radiogroup" aria-label="Temperatura da negociação">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={v === n} aria-label={`${n} · ${TEMP[n]}`} className={`${n <= v ? 'on' : ''} t${v}`}
            disabled={!pode} onClick={() => definir(n === v ? 0 : n)} />
        ))}
      </span>
      <span className="tl" style={{ color: v ? `var(--t${v})` : 'var(--texto-suave)' }}>{v ? `${v} · ${TEMP[v]}` : 'Não avaliada'}</span>
    </div>
  );
}

function Resp({ r }: { r: F['resp'] }) {
  if (!r) return null;
  const ini = r.nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  let h = 0;
  for (const c of r.nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span className="avatar" style={{ background: `var(--av${(h % 4) + 1})`, overflow: 'hidden', padding: r.foto ? 0 : undefined }} title={r.nome}>
        {r.foto ? <img src={r.foto} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : ini}
      </span>
      <div><div style={{ fontWeight: 500 }}>{r.nome}</div><div className="faint" style={{ fontSize: 12 }}>Responsável</div></div>
    </div>
  );
}

const SVG_DOTS = <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01" /></svg>;
const seta = (d: number) => <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d={d < 0 ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} /></svg>;

/** barra das abas sem rolagem lateral: aparecem as que cabem e as demais vão para o ⋮ no fim; a ativa nunca vai para o menu */
function Abas({ f, aba, irAba }: { f: F; aba: string; irAba: (k: string) => void }) {
  const barra = useRef<HTMLDivElement>(null), w = useRef<HTMLDivElement>(null);
  const [fora, setFora] = useState<string[]>([]);
  const [menu, setMenu] = useState(false);
  const q: Record<string, number> = { comercial: f.qComercial, viabilidade: f.qViab, massa: f.qMassa, documentos: f.qDocs };
  const caber = () => {
    const b = barra.current;
    if (!b) return;
    const bs = [...b.querySelectorAll<HTMLButtonElement>('button[role=tab]')];
    bs.forEach((x) => { x.hidden = false; });
    const out: string[] = [];
    for (let i = bs.length - 1; i >= 0 && b.scrollWidth > b.clientWidth + 1; i--) {
      if (bs[i].dataset.t === aba) continue;
      bs[i].hidden = true;
      out.unshift(bs[i].dataset.t!);
    }
    setFora((o) => (o.join() === out.join() ? o : out));
  };
  useLayoutEffect(caber);
  useEffect(() => {
    const el = w.current;
    if (!el || !window.ResizeObserver) return;
    let lw = el.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - lw) < 1) return; lw = el.clientWidth; caber(); });
    ro.observe(el);
    return () => ro.disconnect();
  });
  useEffect(() => {
    if (!menu) return;
    const fecha = (ev: PointerEvent) => { if (!(ev.target as HTMLElement).closest?.('.fi-mais')) setMenu(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { setMenu(false); ev.preventDefault(); ev.stopPropagation(); } };
    document.addEventListener('pointerdown', fecha, true);
    document.addEventListener('keydown', esc, true);
    return () => { document.removeEventListener('pointerdown', fecha, true); document.removeEventListener('keydown', esc, true); };
  }, [menu]);
  const vis = ABAS.filter(([k]) => !fora.includes(k) || k === aba).map(([k]) => k);
  const ia = ABAS.findIndex(([k]) => k === aba), ant = ABAS[ia - 1], prox = ABAS[ia + 1];
  const rot = (k: string, l: string) => <>{l}{q[k] ? <span className="tkm-n">{q[k]}</span> : null}</>;
  return (
    <div className="fi-abas-w" ref={w}>
      <div className="fi-abas" role="tablist" aria-label="Seções do terreno" ref={barra}>
        {ABAS.map(([k, l]) => (
          <button key={k} role="tab" data-t={k} aria-selected={k === aba} aria-controls={`bl-${k}`} hidden={!vis.includes(k)} onClick={() => irAba(k)}>{rot(k, l)}</button>
        ))}
      </div>
      <div className="fi-fim">
        <div className={`adv-mais fi-mais${menu ? ' aberto' : ''}`} hidden={!fora.length}>
          <button className="iconbtn adv-mb" aria-haspopup="menu" aria-expanded={menu} aria-label="Mais ações" title="Mais ações" onClick={() => setMenu(!menu)}>{SVG_DOTS}</button>
          <div className="adv-menu" role="menu">
            {ABAS.filter(([k]) => fora.includes(k) && k !== aba).map(([k, l]) => <button key={k} role="menuitem" onClick={() => { setMenu(false); irAba(k); }}>{rot(k, l)}</button>)}
          </div>
        </div>
        <button className="iconbtn fi-ant" aria-label="Seção anterior" disabled={!ant} title={ant ? `Anterior: ${ant[1]}` : 'Primeira seção'} onClick={() => ant && irAba(ant[0])}>{seta(-1)}</button>
        <button className="iconbtn fi-prox" aria-label="Próxima seção" disabled={!prox} title={prox ? `Próxima: ${prox[1]}` : 'Última seção'} onClick={() => prox && irAba(prox[0])}>{seta(1)}</button>
      </div>
    </div>
  );
}

/** cor do pino do mini-mapa: a da subetapa, como a bolinha da lista do mapa */
function corPino(f: F): [string, string] {
  const fs: FaseMapa[] = f.fases.map((x) => ({ ...x, etapas: f.etapasPorFase[x.k] ?? [] }));
  const t: TerrenoMapa = { id: f.id, codigo: f.codigo, nome: f.nome, bairro: null, zona: null, municipio: null, corretor: null, lat: f.lat, lng: f.lng, poly: f.poly, area: f.area,
    procs: f.procs.map((p) => ({ fase: p.fase, etapa: p.etapa, sub: p.sub, status: p.status })) };
  return corSub(fs, t);
}

function VisaoGeral({ f, abrirMapa }: { f: F; abrirMapa: (lat: number, lng: number, z: number) => void }) {
  const { edita, empresa } = useSessao();
  const ed = useEdicao(f);
  const qc = useQueryClient(), toast = useToast();
  const ni = <span className="ni">Não informado</span>;
  const lapis = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" /></svg>;
  const pe = <div className="kv-f"><button type="button" className="btn text sm" onClick={ed.fechar}>Cancelar</button><button className="btn primary sm" disabled={ed.gravando}>Salvar</button></div>;
  /* edição direta no Resumo: grava nos mesmos campos da aba Terreno, pelo mesmo caminho (proto_mod.js › linE, linArea) */
  const linE = (rot: string, val: ReactNode, id: string, abrir: () => void, corpo: () => ReactNode, montar: () => Promise<Record<string, unknown> | string> | Record<string, unknown> | string) => {
    if (ed.edit === id) return <div className="kv editando" id={`sec-g-${id}`}><dt>{rot}</dt><dd><form className="kv-form" onSubmit={(ev) => ed.salvar(ev, montar)}>{corpo()}{pe}</form></dd></div>;
    return lin(rot, val, edita ? <button className="kv-ed" aria-label={`Editar ${rot.toLowerCase()}`} title="Editar" onClick={abrir}>{lapis}</button> : undefined);
  };
  /* valor pedido e corretor não moram em terrenos: gravam direto na oferta de entrada e no corretor principal */
  const [gravD, setGravD] = useState(false);
  const salvarDireto = async (ev: FormEvent, fazer: () => Promise<string | null>) => {
    ev.preventDefault();
    if (gravD) return;
    setGravD(true);
    try {
      const erro = await fazer();
      if (erro) { toast(erro); return; }
      await qc.invalidateQueries({ queryKey: ['ficha'] });
      qc.invalidateQueries({ queryKey: ['mapa'] });
      toast('Salvo.');
      ed.fechar();
    } catch (e: any) { toast(e?.message ?? String(e)); } finally { setGravD(false); }
  };
  const corretores = useQuery({
    queryKey: ['corretores', empresa?.id], enabled: !!empresa && ed.edit === 'cor',
    queryFn: async () => {
      const r = await supabase.from('corretores').select('id,imobiliaria,ativo,pessoas(nome_razao_social)').eq('empresa_id', empresa!.id);
      if (r.error) throw r.error;
      return (r.data as any[]).filter((c) => c.ativo !== false || c.id === f.corretor?.id)
        .map((c) => ({ id: c.id as string, nome: (c.pessoas?.nome_razao_social ?? '') as string, imob: c.imobiliaria as string | null }))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    },
  });
  const gravarValor = async () => {
    const v = lerNum(ed.vals.valor), d = ed.vals.data || null;
    if (ed.vals.valor?.trim() && v == null) return 'Valor inválido.';
    if (v != null && v <= 0) return 'O valor pedido precisa ser maior que zero.';
    const o = f.ofertaEntrada;
    if (o) {
      const r = await supabase.from('ofertas').update({ valor_pedido: v, ...(d ? { data_oferta: d } : {}) }).eq('id', o.id);
      return r.error?.message ?? null;
    }
    if (v == null) return null;
    const r = await supabase.from('ofertas').insert({ empresa_id: empresa!.id, terreno_id: f.id, valor_pedido: v, ...(d ? { data_oferta: d } : {}) });
    return r.error?.message ?? null;
  };
  const gravarCorretor = async () => {
    let cid = ed.vals.cid || null;
    if (cid === 'novo') {
      const nome = (ed.vals.nome ?? '').trim();
      if (!nome) return 'Escreva o nome do corretor.';
      const p = await supabase.from('pessoas').insert({ empresa_id: empresa!.id, tipo_pessoa: 'PF', nome_razao_social: nome, telefone: ed.vals.tel?.trim() || null }).select('id').single();
      if (p.error) return p.error.message;
      const c = await supabase.from('corretores').insert({ empresa_id: empresa!.id, pessoa_id: p.data.id, imobiliaria: ed.vals.imob?.trim() || null }).select('id').single();
      if (c.error) return c.error.message;
      cid = c.data.id;
      qc.invalidateQueries({ queryKey: ['corretores'] });
    }
    if (cid === (f.corretor?.id ?? null)) return null;
    if (f.corretor) {
      const r = await supabase.from('terreno_corretores').update({ principal: false }).eq('terreno_id', f.id).eq('corretor_id', f.corretor.id);
      if (r.error) return r.error.message;
    }
    if (!cid) return null;
    const r = await supabase.from('terreno_corretores').upsert({ terreno_id: f.id, corretor_id: cid, empresa_id: empresa!.id, principal: true }, { onConflict: 'terreno_id,corretor_id' });
    return r.error?.message ?? null;
  };
  const linD = (rot: string, val: ReactNode, id: string, abrir: () => void, corpo: () => ReactNode, fazer: () => Promise<string | null>) => {
    if (ed.edit === id) return <div className="kv editando" id={`sec-g-${id}`}><dt>{rot}</dt><dd><form className="kv-form" onSubmit={(ev) => salvarDireto(ev, fazer)}>{corpo()}
      <div className="kv-f"><button type="button" className="btn text sm" onClick={ed.fechar}>Cancelar</button><button className="btn primary sm" disabled={gravD}>Salvar</button></div></form></dd></div>;
    return lin(rot, val, edita ? <button className="kv-ed" aria-label={`Editar ${rot.toLowerCase()}`} title="Editar" onClick={abrir}>{lapis}</button> : undefined);
  };
  const lin = (rot: string, val: ReactNode, acao: ReactNode = <span className="kv-ed" aria-hidden="true" />) => (
    <div className="kv"><dt>{rot}</dt><dd>{val == null || val === '' ? ni : val}</dd>{acao}</div>
  );
  const dois = (a: ReactNode, b: ReactNode) => <span>{a}{b ? <span className="kv-2">{b}</span> : null}</span>;
  const [cor, fg] = corPino(f);
  const end = [f.logradouro && f.logradouro + (f.numero ? ', ' + f.numero : ''), f.bairro].filter(Boolean).join(' · ');
  const mun = [[f.municipio, f.uf].filter(Boolean).join(' · '), f.zona && 'Zona ' + (ZONA[f.zona] ?? f.zona)].filter(Boolean).join(' · ');
  const e = f.estacao;
  const est = e && e.pe != null
    ? dois(`${e.pe < 1000 ? Math.round(e.pe / 10) * 10 + ' m' : num(e.pe / 1000, 2) + ' km'} a pé${e.seg != null ? ` · ${Math.round(e.seg / 60)} min` : ''}`, e.nome)
    : f.entornoBuscado ? 'Nenhuma estação a até 1,5 km a pé' : '';
  const tp = f.topo
    ? <span id="rs-topo"><span className={`tp-chip tp-${f.topo.perfil}`}>{f.topo.perfil === 'inclinado' ? `Inclinado · ${num(f.topo.decl, 1)}%` : TP_N[f.topo.perfil] ?? f.topo.perfil}</span>
      {f.topo.desnivel != null && <span className="kv-2">desnível {num(f.topo.desnivel, 1)} m</span>}</span>
    : '';
  return (
    <div className="geral">
      <div className="geral-c">
        <section className="sec g-loc"><div className="sec-h"><h2><Bi n="localizacao" s={32} />Localização</h2></div><div className="sec-b">
          {f.lat != null && f.lng != null
            ? <MiniMapa key={f.id} lat={f.lat} lng={f.lng} poly={f.poly} cor={cor} fg={fg} abrirMapa={abrirMapa} />
            : <div className="empty" style={{ padding: 'var(--e6) 0' }}>Sem localização.</div>}
        </div></section>
      </div>
      <div className="geral-c">
        <section className="sec g-res"><div className="sec-h"><h2>Resumo</h2></div><div className="sec-b"><dl className="kvl">
          {linE('Endereço', end, 'end', () => ed.abrir('end', END_CAMPOS),
            () => <CamposEndereco f={f} vals={ed.vals} mudar={ed.mudar} mun={ed.mun} setMun={ed.setMun} />,
            () => dadosEndereco(f, ed, END_CAMPOS))}
          {linE('Município e região', mun, 'reg', () => ed.abrir('reg', ['zona']),
            () => <div className="kv-campos"><div className="field"><label htmlFor="g-zona">Zona</label><select id="g-zona" value={ed.vals.zona ?? ''} onChange={(ev) => ed.mudar('zona', ev.target.value)}>
              <option value="">Não informado</option>{Object.entries(OPT.zona).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div></div>,
            () => ({ zona: ed.vals.zona || null }))}
          {lin('Zoneamento', f.zonas)}
          {linE('Área adotada', f.area != null ? dois(m2(f.area), f.fonteArea ? FONTE_AREA[f.fonteArea] : null) : '', 'area', () => ed.abrir('area', [], valoresArea(f.t)),
            () => <div className="kv-campos"><div className="field"><label htmlFor="g-fonteArea">Área adotada</label>{fonteSel(ed, 'g-fonteArea', 'Nenhuma')}</div>
              {numInp(ed, 'area_documental_m2', 'Documental (m²)', 'm²', 'g')}{numInp(ed, 'area_cadastral_m2', 'Cadastral (m²)', 'm²', 'g')}
              {numInp(ed, 'area_levantamento_m2', 'Levantamento (m²)', 'm²', 'g')}{numInp(ed, 'estimativa', 'Estimativa (m²)', 'm²', 'g')}</div>,
            () => dadosArea(f, ed.vals))}
          {lin('Unidades do estudo válido', f.unidades != null ? `${num(f.unidades)} unidades` : '')}
          {lin('VGV do estudo válido', f.vgv != null ? milhoes(f.vgv) : '')}
          {lin('Distância do metrô ou trem', est)}
          {linD('Valor pedido na entrada', f.ofertaEntrada?.valor ? dois(milhoes(f.ofertaEntrada.valor), `oferta de ${fd(f.ofertaEntrada.data)}`) : '', 'valor',
            () => ed.abrir('valor', [], { valor: f.ofertaEntrada?.valor != null ? num(f.ofertaEntrada.valor, 2) : '', data: f.ofertaEntrada?.data ?? '' }),
            () => <div className="kv-campos">
              <div className="field"><label htmlFor="g-valor">Valor pedido (R$)</label><input id="g-valor" inputMode="decimal" placeholder="R$ ou 12 mi" value={ed.vals.valor ?? ''} onChange={(ev) => ed.mudar('valor', ev.target.value)} /></div>
              <div className="field"><label htmlFor="g-data">Data da oferta</label><input id="g-data" type="date" value={ed.vals.data ?? ''} onChange={(ev) => ed.mudar('data', ev.target.value)} /></div></div>,
            gravarValor)}
          {lin('Perfil topográfico', tp)}
          {linD('Corretor', f.corretor ? dois(f.corretor.nome, f.corretor.imob) : '', 'cor',
            () => ed.abrir('cor', [], { cid: f.corretor?.id ?? '' }),
            () => <div className="kv-campos">
              <div className="field"><label htmlFor="g-cid">Corretor</label><select id="g-cid" value={ed.vals.cid ?? ''} onChange={(ev) => ed.mudar('cid', ev.target.value)}>
                <option value="">Sem corretor</option>
                {f.corretor && !corretores.data && <option value={f.corretor.id}>{f.corretor.nome}</option>}
                {(corretores.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.imob ? ` · ${c.imob}` : ''}</option>)}
                <option value="novo">+ Novo corretor</option></select></div>
              {ed.vals.cid === 'novo' && <>
                <div className="field"><label htmlFor="g-cnome">Nome</label><input id="g-cnome" value={ed.vals.nome ?? ''} onChange={(ev) => ed.mudar('nome', ev.target.value)} /></div>
                <div className="field"><label htmlFor="g-cimob">Imobiliária</label><input id="g-cimob" value={ed.vals.imob ?? ''} onChange={(ev) => ed.mudar('imob', ev.target.value)} /></div>
                <div className="field"><label htmlFor="g-ctel">Telefone</label><input id="g-ctel" inputMode="tel" value={ed.vals.tel ?? ''} onChange={(ev) => ed.mudar('tel', ev.target.value)} /></div></>}
            </div>,
            gravarCorretor)}
        </dl></div></section>
      </div>
    </div>
  );
}

export function useFicha(codigo: string) {
  const { empresa } = useSessao();
  return useQuery({ queryKey: ['ficha', empresa?.id, codigo], enabled: !!empresa, queryFn: () => carregarFicha(empresa!.id, codigo) });
}

/** a ficha (página ou gaveta): o voltar só na página */
export default function Ficha({ f, aba, irAba, voltar, abrirMapa }: {
  f: F; aba: string; irAba: (k: string) => void; voltar?: { rotulo: string; ir: () => void };
  abrirMapa: (lat: number, lng: number, z: number) => void;
}) {
  const { edita } = useSessao();
  const c = completude(f);
  const meta: ReactNode[] = [...faseTxt(f), `Cadastrado em ${fd(f.dataIdent ?? f.criadoEm)}`];
  const corpo = aba === 'geral' ? <VisaoGeral f={f} abrirMapa={abrirMapa} />
    : aba === 'terreno' ? <AbaTerreno key={f.id} f={f} />
    : <section className="sec"><div className="empty">{PROXIMAS.has(aba) ? 'Esta aba está sendo portada do protótipo e entra nas próximas entregas.' : 'Esta aba entra depois da primeira versão.'}</div></section>;
  return (
    <div className="ficha-wrap"><div className="ficha-main">
      <LinhaTopo f={f} />
      {voltar && <button className="back" onClick={voltar.ir}><Ic n="back" s={20} />{voltar.rotulo}</button>}
      <div className="dhead fi-head">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow"><span className="num">{f.codigo}</span></div>
          <h1>{f.nome}</h1>
          <div className="fi-meta">
            {meta.map((x, i) => <span key={i} style={{ display: 'contents' }}>{i > 0 && <span className="fi-sep">·</span>}<span>{x}</span></span>)}
            {f.negId && <><span className="fi-sep">·</span><span className="fi-temp">
              {f.negStatus === 'ativo' ? <Temperatura f={f} pode={edita} />
                : f.temp ? <>{TEMP[f.temp]}</> : <span className="faint">Temperatura não avaliada</span>}
            </span></>}
          </div>
        </div>
        <Resp r={f.resp} />
      </div>
      <div className="stack">
        {c.pct < 100 && (
          <div className="complete">
            <span className="progress"><span className="bar"><span style={{ width: `${c.pct}%` }} /></span><b>Ficha {c.pct}% completa</b></span>
            {c.faltam.length > 0 && <>
              <span className="muted" style={{ fontSize: 13 }}>Falta:</span>
              <span className="missing">
                {c.faltam.slice(0, 6).map(([r, k]) => <button key={r} onClick={() => irAba(k)}>{r}</button>)}
                {c.faltam.length > 6 && <span className="faint" style={{ fontSize: 12, alignSelf: 'center' }}>+{c.faltam.length - 6}</span>}
              </span>
            </>}
          </div>
        )}
      </div>
      <Abas f={f} aba={aba} irAba={irAba} />
      <section className="bl fi-aba" id={`bl-${aba}`} role="tabpanel"><div className="bl-c">{corpo}</div></section>
    </div></div>
  );
}
