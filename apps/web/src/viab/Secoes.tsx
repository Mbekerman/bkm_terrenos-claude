import { useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { Ic } from '../components/Moldura';
import { Adorno } from '../lib/mascara';
import { lerNum } from '../ficha/edicao';
import { brl, ehPct, gruposDe, mi, nf, r2, vin, VB_GRUPO, VB_RESTRITO, VB_SECAO, VB_TIPO, pctVgv, type Calc, type Desp, type Linha, type Tipo, type Viab } from './calc';

// Seções do estudo com linhas de custo (porte de proto_viab.js › vbPopHtml: terreno, obra, lns, vbLinha, vbCombo):
// Custo do terreno, Despesas comerciais, Custo de obras (em quadros) e Despesas gerais; Taxas e Despesas financeiras
// usam o mesmo desenho. Cada campo grava ao sair dele: os dados do estudo por app.salvar_viabilidade e as linhas por
// escrita direta em app.viabilidade_linhas (o gatilho confere a base, o item da lista e quem muda Taxas e Financeiras).

type Gravar = (fn: () => PromiseLike<{ error: unknown }>, depois?: (r: any) => void) => void; // eslint-disable-line @typescript-eslint/no-explicit-any
export interface Ctx {
  v: Viab; c: Calc; desp: Desp[]; ro: boolean; dir: boolean; empresa: string;
  setV: (fn: (o: Viab | null) => Viab | null) => void; gravar: Gravar;
  /** quadros fechados (aba Obras), guardados no popup */
  fechados: Set<string>; alternar: (k: string) => void;
}

const VB_ADD: Record<string, string> = {
  obra_atipica: 'Adicionar item atípico', obra_nao_incidente: 'Adicionar item', projetos: 'Adicionar projeto', pos_obra: 'Adicionar item',
};
// Despesas gerais: um item fixo por grupo ("Despesas gerais com …", em % do VGV), na mesma tabela de Comercial
// (pedido do Moises, 11/nov/2026); os grupos continuam, para a DRE.
/** a aba Obras sempre abre com todos os quadros fechados (decisão do Moisés, 28/out/2026) */
export const vbQPadrao = () => new Set(['raso', 'g-obra_nao_incidente', 'g-projetos', 'g-pos_obra']);
const semAcento = (s: string) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const m2 = (x: number | null | undefined) => (x == null ? '—' : nf(x, 2) + ' m²');
const pctTxt = (a: number, b: number) => (b > 0 ? nf(a / b * 100, 1) + '%' : '—');

/* ---------- campo de número que grava ao sair ---------- */
/* Percentual (fmt "pct"): o % faz parte do texto, logo depois do número, e sempre com duas casas ("12,50%"), em vez
   do % fixo na direita do campo; enquanto se digita, o ",00%" que falta aparece em cinza depois do texto (data-suf,
   mostrarSombra em lib/mascara.ts) (pedido do Moises, 11/nov/2026). */
const pctIn = (v: number | null | undefined, d: number) =>
  v == null ? '' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: Math.max(2, d) }) + '%';
function Num({ v, d = 2, fmt, aoMudar, aoSair, ...rest }: {
  v: number | null; d?: number; fmt: string; aoMudar: (n: number | null) => void; aoSair: (mudou: boolean) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur' | 'onFocus'>) {
  const pct = fmt === 'pct';
  const mostra = (n: number | null) => (pct ? pctIn(n, d) : vin(n, d));
  const [txt, setTxt] = useState(mostra(v));
  const foco = useRef(false), ult = useRef(v), ini = useRef(v);
  ult.current = v;
  if (!foco.current && txt !== mostra(v)) setTxt(mostra(v));
  return (
    <input data-fmt={fmt} data-suf={pct ? '%' : undefined} inputMode="decimal" value={txt} {...rest}
      onFocus={() => { foco.current = true; ini.current = ult.current; }}
      onChange={(e) => { setTxt(e.target.value); aoMudar(lerNum(e.target.value.replace('%', ''))); }}
      onBlur={() => { foco.current = false; setTxt(mostra(ult.current)); aoSair(ini.current !== ult.current); }} />
  );
}

/* ---------- dados do estudo (salvar_viabilidade) ---------- */
type Hd = 'custo_m2' | 'area_construida' | 'permuta_fin_pct' | 'deducao_vgv_pct' | 'minimo_garantido' | 'pagamento_dinheiro' | 'comissao_dinheiro';
function salvarHd(x: Ctx, dados: Record<string, unknown>) {
  x.gravar(() => supabase.rpc('salvar_viabilidade', { p_id: x.v.id, p_dados: dados }));
}
function mudarHd(x: Ctx, k: Hd, n: number | null) {
  if (n != null && n < 0) n = null;
  if (n != null && (k === 'permuta_fin_pct' || k === 'deducao_vgv_pct')) n = Math.min(100, n);
  x.setV((o) => o && { ...o, [k]: n });
}
function CampoHd({ x, k, rot, d = 2, dica }: { x: Ctx; k: Hd; rot: string; d?: number; dica?: string }) {
  const pct = k === 'permuta_fin_pct' || k === 'deducao_vgv_pct';
  return (
    <div className="field"><label htmlFor={`vb-${k}`}>{rot}</label>
      {(() => {
        const campo = <Num id={`vb-${k}`} v={x.v[k]} d={d} fmt={pct ? 'pct' : 'moeda'} disabled={x.ro}
          aoMudar={(n) => mudarHd(x, k, n)} aoSair={(m) => { if (m) salvarHd(x, { [k]: x.v[k] }); }} />;
        return pct ? campo : <Adorno t="moeda">{campo}</Adorno>;
      })()}
      {dica && <div className="hint">{dica}</div>}
    </div>
  );
}
const Ro = ({ itens }: { itens: [string, string, string?][] }) => (
  <>{itens.map(([l, v, s]) => <div key={l}><span className="vb-rl">{l}</span><b>{v}</b>{s && <small className="faint">{s}</small>}</div>)}</>
);

/* ---------- Custo do terreno ---------- */
export function SecTerreno({ x }: { x: Ctx }) {
  const { v, c, desp, ro } = x;
  const dedutiveis = desp.filter((d) => d.grupo === 'comercial' && d.deduz_vgv && (d.ativo || v.deduz_vgv.includes(d.codigo)));
  const marcar = (cod: string, sim: boolean) => {
    const nv = sim ? [...new Set([...v.deduz_vgv, cod])] : v.deduz_vgv.filter((y) => y !== cod);
    x.setV((o) => o && { ...o, deduz_vgv: nv });
    salvarHd(x, { deduz_vgv: nv });
  };
  return <>
    <h3 className="vb-h3 vb-h3-1">Permuta física</h3>
    <div className="vb-ro"><Ro itens={[['Unidades permutadas', nf(c.unp)], ['Área privativa permutada', c.ap ? m2(c.ap) : '—'], ['% das unidades', pctTxt(c.unp, c.un)], ['% da área privativa', pctTxt(c.ap, c.A)]]} /></div>
    <h3 className="vb-h3">Permuta financeira</h3>
    <div className="editgrid vb-campos">
      <CampoHd x={x} k="permuta_fin_pct" rot="Permuta financeira (% da base da permuta)" d={4} />
      <CampoHd x={x} k="deducao_vgv_pct" rot="Dedução do VGV para a base da permuta (%)" d={4} />
      <CampoHd x={x} k="minimo_garantido" rot="Valor mínimo garantido (R$)" />
    </div>
    <fieldset className="vb-chks"><legend>Deduzir também da base da permuta a verba prevista em {VB_SECAO.comercial}</legend>
      {dedutiveis.map((d) => {
        const l = v.linhas.find((y) => y.despesa === d.codigo);
        return (
          <label key={d.codigo} className="chk"><input type="checkbox" checked={v.deduz_vgv.includes(d.codigo)} disabled={ro} onChange={(e) => marcar(d.codigo, e.target.checked)} />
            <span>{d.nome} <small className="faint">{l ? brl(c.L[l.id]?.valor) : '—'}</small></span></label>
        );
      })}
    </fieldset>
    <div className="vb-ro"><Ro itens={[
      ['VGV líquido', brl(c.vv), 'sem permuta e comissão'],
      ['Deduções', brl(r2(c.dedp + c.dedc)), `${v.deducao_vgv_pct ? nf(v.deducao_vgv_pct, 2) + '% = ' + brl(c.dedp) : 'sem %'}${c.dedc ? ' + ' + brl(c.dedc) + ' comerciais' : ''}`],
      ['Base da permuta', brl(c.liq), 'VGV líquido menos a dedução e as despesas marcadas'],
      ['Permuta financeira', brl(c.pf), c.minimo ? `mínimo garantido (o % daria ${brl(c.pfc)})` : v.permuta_fin_pct ? `${nf(v.permuta_fin_pct, 2)}% da base da permuta` : ''],
    ]} /></div>
    <h3 className="vb-h3">Pagamento em dinheiro</h3>
    <div className="editgrid vb-campos"><CampoHd x={x} k="pagamento_dinheiro" rot="Valor pago em dinheiro (R$)" /></div>
    <h3 className="vb-h3">Comissão</h3>
    <div className="vb-ro"><Ro itens={[['Unidades da comissão', nf(c.unc)], ['Área privativa da comissão', c.ac ? m2(c.ac) : '—']]} /></div>
    <div className="editgrid vb-campos"><CampoHd x={x} k="comissao_dinheiro" rot="Comissão em dinheiro (R$)" /></div>
  </>;
}

/* ---------- linhas ---------- */
const dpDe = (x: Ctx) => new Map(x.desp.map((d) => [d.codigo, d]));
/** linhas de um grupo; nos fixos, na ordem da lista da empresa (e sem as de item inativo sem valor) */
function linhasGrupo(x: Ctx, g: string) {
  const dp = dpDe(x), ls = x.v.linhas.filter((l) => dp.get(l.despesa)?.grupo === g);
  if (!VB_GRUPO[g]?.fixo) return ls;
  const o = (cd: string) => x.desp.findIndex((d) => d.codigo === cd);
  return ls.filter((l) => dp.get(l.despesa)?.ativo || l.valor != null).sort((a, b) => o(a.despesa) - o(b.despesa));
}
function baseTxt(l: Linha, c: Calc) {
  const L = c.L[l.id], b = L?.base ?? null, d = L?.ded ? ' · deduzida da base da permuta' : '';
  switch (l.tipo) {
    case 'pct_vgv': return `sobre o VGV líquido (${mi(b)})${d}`;
    case 'pct_obra_tipica': return `sobre a obra raso (${mi(b)})`;
    case 'pct_obra_raso': return `sobre a obra incidente (${mi(b)})`;
    case 'pct_obra_total': return `sobre a obra total (${mi(b)})`;
    case 'pct_lucro': return `sobre o lucro antes dos itens em % do lucro (${mi(b)})`;
    case 'pct_aporte_permuta': return `sobre a permuta financeira em dinheiro (${mi(b)})`;
    case 'pct_aporte_pagamento': return `sobre o pagamento em dinheiro (${mi(b)})`;
    case 'area': return `× ${m2(b)}`;
    case 'verba_unidade': return `× ${nf(b)} unidades líquidas${d}`;
    case 'verba_mensal': return `${l.quantidade && l.quantidade !== 1 ? nf(l.quantidade, 2) + ' meses' : '1 mês'}${d}`;
    default: return d.slice(3);
  }
}
function gravarLinha(x: Ctx, id: string, dados: Partial<Linha>) {
  x.gravar(() => supabase.from('viabilidade_linhas').update(dados).eq('id', id));
}
function mudarLinha(x: Ctx, id: string, dados: Partial<Linha>) {
  x.setV((o) => o && { ...o, linhas: o.linhas.map((l) => (l.id === id ? { ...l, ...dados } : l)) });
}

/** busca na lista de itens da empresa, só do grupo (vbCombo) */
function Combo({ x, g, txt, dis, escolher, cancelar }: { x: Ctx; g: string; txt: string; dis?: boolean; escolher: (d: Desp) => void; cancelar?: () => void }) {
  const [q, setQ] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const id = useRef('vb-dd-' + Math.random().toString(36).slice(2)).current;
  const its = q == null ? [] : x.desp.filter((d) => d.ativo && d.grupo === g && (!q || semAcento(d.nome).includes(semAcento(q))));
  const aberto = q != null;
  return (
    <span className="vb-cb">
      <input value={aberto ? q! : txt} placeholder="Buscar na lista" autoComplete="off" role="combobox" aria-expanded={aberto} aria-autocomplete="list" aria-controls={id} aria-label="Item" disabled={dis}
        aria-activedescendant={aberto && its[at] ? `${id}-${at}` : undefined}
        onFocus={(e) => { setQ(''); setAt(0); e.target.select(); }}
        onChange={(e) => { setQ(e.target.value); setAt(0); }}
        onBlur={() => setTimeout(() => { setQ(null); }, 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (its.length) setAt((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + its.length) % its.length); }
          else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (its[at]) { escolher(its[at]); setQ(null); } }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setQ(null); (e.target as HTMLInputElement).blur(); cancelar?.(); }
        }} />
      <span className="vb-dd" id={id} role="listbox" hidden={!aberto}>
        {its.length ? its.map((d, i) => (
          <span key={d.codigo} className="vb-dd-i" role="option" id={`${id}-${i}`} aria-selected={i === at}
            onMouseDown={(e) => { e.preventDefault(); escolher(d); setQ(null); (document.activeElement as HTMLElement | null)?.blur(); }}><span>{d.nome}</span></span>
        )) : <span className="vb-dd-v faint">Nada com esse nome em {VB_GRUPO[g]?.nome || 'este grupo'}. O administrador inclui em Configurações › Viabilidade.</span>}
      </span>
    </span>
  );
}

function LinhaRow({ x, l }: { x: Ctx; l: Linha }) {
  const { c, ro, dir } = x;
  const d = dpDe(x).get(l.despesa), g = d?.grupo ?? '', G = VB_GRUPO[g], fixo = G?.fixo;
  const nome = d ? d.nome + (d.ativo ? '' : ' (inativo)') : l.despesa;
  const dis = ro || (VB_RESTRITO.includes(G?.secao) && !dir);
  const tipos = G?.tipos ?? [l.tipo];
  const trocarItem = (n: Desp) => {
    const tp = VB_GRUPO[n.grupo].tipos;
    let tipo = l.tipo, valor = l.valor;
    if (l.valor == null) { tipo = n.tipo_padrao || l.tipo; valor = n.valor_padrao ?? null; }
    if (!tp.includes(tipo)) tipo = tp[0];
    const dados = { despesa: n.codigo, tipo, valor };
    mudarLinha(x, l.id, dados); gravarLinha(x, l.id, dados);
  };
  return (
    <div className="vb-r" data-ln={l.id}>
      <span className="vb-c vb-desp"><span className="vb-l">Item</span>{fixo ? <span className="vb-nome">{nome}</span> : <Combo x={x} g={g} txt={nome} dis={dis} escolher={trocarItem} />}</span>
      {tipos.length === 1
        ? <span className="vb-c vb-tipo"><span className="vb-l">Base de cálculo</span><span className="vb-nome">{VB_TIPO[l.tipo]}</span></span>
        : <label className="vb-c vb-tipo"><span className="vb-l">Base de cálculo</span>
          <select value={l.tipo} aria-label={`Base de cálculo de ${nome}`} disabled={dis} onChange={(e) => {
            const tipo = e.target.value as Tipo, dados: Partial<Linha> = { tipo };
            if (tipo === 'verba_mensal' && !(l.quantidade > 0)) dados.quantidade = 1;
            mudarLinha(x, l.id, dados); gravarLinha(x, l.id, dados);
          }}>{tipos.map((k) => <option key={k} value={k}>{VB_TIPO[k]}</option>)}</select></label>}
      <label className="vb-c vb-mult"><span className="vb-l">{l.tipo === 'area' ? 'Valor unitário' : 'Valor'}</span>
        {(() => {
          const campo = <Num v={l.valor} d={4} fmt={ehPct(l.tipo) ? 'pct' : 'moeda'} aria-label={`Valor de ${nome}`} disabled={dis}
            aoMudar={(n) => mudarLinha(x, l.id, { valor: n })} aoSair={(m) => { if (m) gravarLinha(x, l.id, { valor: x.v.linhas.find((y) => y.id === l.id)?.valor ?? null }); }} />;
          return ehPct(l.tipo) ? campo : <Adorno t="moeda">{campo}</Adorno>;
        })()}</label>
      {l.tipo === 'verba_mensal'
        ? <label className="vb-c vb-qtd"><span className="vb-l">Meses</span><Num v={l.quantidade} d={2} fmt="num" aria-label={`Meses de ${nome}`} disabled={dis}
          aoMudar={(n) => mudarLinha(x, l.id, { quantidade: n != null && n > 0 ? n : 1 })} aoSair={(m) => { if (m) gravarLinha(x, l.id, { quantidade: x.v.linhas.find((y) => y.id === l.id)?.quantidade ?? 1 }); }} /></label>
        : <span className="vb-c vb-qtd" />}
      <span className="vb-c vb-out"><span className="vb-l">Resultado</span><b>{brl(c.L[l.id]?.valor)}</b><small className="faint">{baseTxt(l, c)}</small></span>
      {dis || fixo ? <span className="vb-x" /> : <button className="iconbtn sm vb-del vb-x" onClick={() => {
        x.setV((o) => o && { ...o, linhas: o.linhas.filter((y) => y.id !== l.id) });
        x.gravar(() => supabase.from('viabilidade_linhas').delete().eq('id', l.id));
      }} aria-label={`Remover ${nome}`} title="Remover"><Ic n="close" s={18} /></button>}
    </div>
  );
}

const Hd = () => (
  <div className="vb-r vb-hd" aria-hidden="true"><span>Item</span><span>Base de cálculo</span><span>Valor</span><span className="vb-qtd">Meses</span><span className="vb-hr">Resultado</span><span className="vb-x" /></div>
);
/** a coluna Meses só onde há verba mensal e a da lixeira só onde se tira item */
const lnsCls = (sec: string) => {
  const gs = gruposDe(sec);
  return (gs.some((g) => VB_GRUPO[g].tipos.includes('verba_mensal')) ? '' : ' sem-meses') + (gs.some((g) => !VB_GRUPO[g].fixo) ? '' : ' sem-x');
};

function QTitulo({ x, k, titulo, valor, sub }: { x: Ctx; k: string; titulo: string; valor: number; sub?: boolean }) {
  const ab = !x.fechados.has(k);
  return (
    <div className={`vb-r vb-qh${sub ? ' sub' : ''}`}>
      <span className="vb-c vb-qt">{sub ? <h4>{titulo}</h4> : <h3><button className="vb-qtg" aria-expanded={ab} onClick={() => x.alternar(k)}>
        <svg className="bl-seta" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        <span>{titulo}</span></button></h3>}</span>
      <span className="vb-c vb-out"><b>{brl(valor)}</b><small className="faint">{pctVgv(valor, x.c)}</small></span><span className="vb-x" />
    </div>
  );
}

/** um grupo que não é fixo, em quadro, com a busca para incluir item */
function GrupoQ({ x, g, sub }: { x: Ctx; g: string; sub?: boolean }) {
  const [nova, setNova] = useState(false);
  const G = VB_GRUPO[g], ls = linhasGrupo(x, g), dis = x.ro || (VB_RESTRITO.includes(G.secao) && !x.dir);
  const incluir = (d: Desp) => {
    setNova(false);
    const tipo = (d.tipo_padrao || G.tipos[0]) as Tipo;
    const ordem = Math.max(0, ...x.v.linhas.map((l) => l.ordem)) + 1;
    x.gravar(() => supabase.from('viabilidade_linhas').insert({ empresa_id: x.empresa, viabilidade_id: x.v.id, ordem, despesa: d.codigo, tipo, valor: d.valor_padrao, quantidade: 1 }).select('id').single(), (r) => {
      const id = r.data.id as string;
      x.setV((o) => o && { ...o, linhas: [...o.linhas, { id, ordem, despesa: d.codigo, tipo, valor: d.valor_padrao, quantidade: 1 }] });
      setTimeout(() => document.querySelector<HTMLInputElement>(`[data-ln="${id}"] .vb-mult input`)?.focus(), 40);
    });
  };
  return (
    <div className={`vb-q${sub ? ' sub' : ''}${!sub && x.fechados.has('g-' + g) ? ' fechado' : ''}`}>
      <QTitulo x={x} k={'g-' + g} titulo={G.nome} valor={x.c.GR[g] || 0} sub={sub} />
      {ls.map((l) => <LinhaRow key={l.id} x={x} l={l} />)}
      {!ls.length && !(nova && !dis) && <div className="muted vb-vazio">Nenhum item.</div>}
      {nova && !dis && (
        <div className="vb-r vb-nova"><span className="vb-c vb-desp"><span className="vb-l">Item</span><NovaCombo x={x} g={g} escolher={incluir} cancelar={() => setNova(false)} /></span>
          <span className="vb-c vb-dica faint">Escolha na lista da empresa; a base de cálculo e o valor vêm preenchidos e podem ser trocados.</span>
          <button className="iconbtn sm vb-del" onClick={() => setNova(false)} aria-label="Cancelar" title="Cancelar"><Ic n="close" s={18} /></button></div>
      )}
      {!dis && !G.fixo && <div className="vb-qadd"><button className="btn sm" onClick={() => setNova(true)}><Ic n="add" s={16} />{VB_ADD[g]}</button></div>}
    </div>
  );
}
function NovaCombo(p: { x: Ctx; g: string; escolher: (d: Desp) => void; cancelar: () => void }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  /* a busca nova já nasce com o foco, aberta */
  return <span ref={(el) => { if (el && !ref.current) { ref.current = el; setTimeout(() => el.querySelector('input')?.focus(), 20); } }} style={{ display: 'contents' }}>
    <Combo x={p.x} g={p.g} txt="" escolher={p.escolher} cancelar={p.cancelar} /></span>;
}

/* ---------- seções de linhas (Comercial, Gerais, Taxas, Financeiras) ---------- */
export function SecLinhas({ x, sec }: { x: Ctx; sec: string }) {
  return (
    <div className={`vb-tab vb-lns${lnsCls(sec)}`}><Hd />
      {gruposDe(sec).map((g) => (VB_GRUPO[g].fixo
        ? linhasGrupo(x, g).map((l) => <LinhaRow key={l.id} x={x} l={l} />)
        : <GrupoQ key={g} x={x} g={g} />))}
    </div>
  );
}

/* ---------- Custo de obras, em quadros ---------- */
export function SecObra({ x }: { x: Ctx }) {
  const { v, c, ro } = x;
  const preso = !!v.estudo_massa_id;
  const fe = (k: string) => x.fechados.has(k);
  const obraTxt = v.obra_base === 'construida' ? `× ${m2(c.Ab)} de área construída` : `× ${m2(c.A)} de área privativa`;
  const base: ReactNode = (
    <label className="vb-c vb-tipo"><span className="vb-l">Base de cálculo</span>
      <select value={v.obra_base} aria-label="Área da obra incidente" disabled={ro} onChange={(e) => {
        const ob = e.target.value === 'construida' ? 'construida' : 'privativa';
        x.setV((o) => o && { ...o, obra_base: ob }); salvarHd(x, { obra_base: ob });
      }}><option value="privativa">{VB_TIPO.area}</option><option value="construida">R$/m² × área construída</option></select></label>
  );
  return (
    <div className={`vb-tab vb-lns${lnsCls('obra')}`}><Hd />
      <div className={`vb-q${fe('raso') ? ' fechado' : ''}`}>
        <QTitulo x={x} k="raso" titulo="Custo de obra incidente" valor={c.raso} />
        <div className="vb-q sub">
          <QTitulo x={x} k="oi" titulo="Custo de obra típico" valor={c.oi} sub />
          <div className="vb-r" data-ln="oi">
            <span className="vb-c vb-desp"><span className="vb-l">Item</span><span className="vb-nome">Custo de obra raso</span></span>
            {base}
            <label className="vb-c vb-mult"><span className="vb-l">Valor unitário</span><Adorno t="moeda"><Num v={v.custo_m2} fmt="moeda" aria-label="Valor unitário da obra incidente (R$ por m²)" disabled={ro}
              aoMudar={(n) => mudarHd(x, 'custo_m2', n)} aoSair={(m) => { if (m) salvarHd(x, { custo_m2: x.v.custo_m2 }); }} /></Adorno></label>
            <span className="vb-c vb-qtd" />
            <span className="vb-c vb-out"><span className="vb-l">Resultado</span><b>{brl(c.oi)}</b><small className="faint">{obraTxt}</small></span><span className="vb-x" />
          </div>
          {v.obra_base === 'construida' && (
            <div className="vb-r" data-ln="constr">
              <span className="vb-c vb-desp"><span className="vb-l">Item</span><span className="vb-nome">Área construída total</span></span>
              <span className="vb-c vb-tipo"><span className="vb-l">Origem</span><span className="vb-nome faint">{preso ? 'do estudo de massa' : 'digitada'}</span></span>
              <label className="vb-c vb-mult"><span className="vb-l">m²</span><Adorno t="m2"><Num v={v.area_construida} fmt="num" aria-label="Área construída total (m²)" disabled={ro || preso} title={preso ? 'Vem do estudo de massa' : undefined}
                aoMudar={(n) => mudarHd(x, 'area_construida', n)} aoSair={(m) => { if (m) salvarHd(x, { area_construida: x.v.area_construida }); }} /></Adorno></label>
              <span className="vb-c vb-qtd" /><span className="vb-c vb-out" /><span className="vb-x" />
            </div>
          )}
        </div>
        <GrupoQ x={x} g="obra_atipica" sub />
      </div>
      <GrupoQ x={x} g="obra_nao_incidente" /><GrupoQ x={x} g="projetos" /><GrupoQ x={x} g="pos_obra" />
    </div>
  );
}

/* ---------- DRE (decisão do Moisés, 26/out/2026; vbResHtml): da receita bruta ao lucro líquido, com o detalhe de cada
   grupo; análise vertical sobre a receita (VGV líquido; a base da permuta só serve à permuta financeira, decisão do
   Moises de 11/nov/2026). Mesmos números do cálculo: só muda a apresentação.
   Fora da diretoria, Despesas financeiras e Taxas só com o total. ---------- */
export function SecDre({ x }: { x: Ctx }) {
  const { v, c, dir } = x;
  const dp = dpDe(x);
  const pct = (y: number | null | undefined) => (c.vv > 0 && y != null ? nf(y / c.vv * 100, 1) + '%' : '');
  let i = 0;
  const ln = (rot: string, y: number | null | undefined, cls = '') => (
    <tr key={i++} className={cls}><td className="esq">{rot}</td><td className="num">{brl(y)}</td><td className="num">{pct(y)}</td></tr>
  );
  const sub = (rot: string, y: number | null | undefined) => (y ? ln(rot, y, 'vb-sub') : null);
  const itens = (ls: Linha[]) => ls.map((l) => sub(dp.get(l.despesa)?.nome || l.despesa, c.L[l.id]?.valor));
  const lsDe = (gs: string[]) => v.linhas.filter((l) => gs.includes(dp.get(l.despesa)?.grupo ?? ''));
  const comLs = lsDe(['comercial']);
  const bruto = r2(c.vv - c.SEC.terreno - c.SEC.obra);
  const det = (gs: string[]) => (dir ? itens(lsDe(gs)) : null);
  const FIN = gruposDe('financeiro');
  const marg = (rot: string, y: string, forte?: boolean) => <tr key={i++} className={`vb-tt${forte ? ' forte' : ''}`}><td className="esq">{rot}</td><td className="num">{y}</td><td /></tr>;
  return <>
    <div className="dt-wrap"><table className="dt compacta vb-rt vb-dre"><thead><tr><th className="esq"><span className="sr-only">Demonstração do resultado</span></th><th className="num">Valor</th><th className="num">% da receita</th></tr></thead><tbody>
      {ln(`Receita bruta de vendas (VGV, ${nf(c.un)} unidades)`, c.vgv, 'forte')}
      {c.vp ? ln(`(−) Permuta física (${nf(c.unp)} unidades)`, c.vp) : null}
      {c.vc ? ln(`(−) Unidades dadas na comissão (${nf(c.unc)})`, c.vc) : null}
      {ln('(=) Receita (VGV líquido)', c.vv, 'vb-tt')}
      {ln('(−) ' + VB_SECAO.terreno, c.SEC.terreno)}
      {sub(c.minimo ? 'Permuta financeira (mínimo garantido)' : 'Permuta financeira', c.pf)}
      {sub('Pagamento em dinheiro', v.pagamento_dinheiro)}
      {sub('Comissão em dinheiro', v.comissao_dinheiro)}
      {ln('(−) ' + VB_SECAO.obra, c.SEC.obra)}
      {sub('Custo de obra típico', c.oi)}
      {['obra_atipica', 'obra_nao_incidente', 'projetos', 'pos_obra'].map((g) => sub(VB_GRUPO[g].nome, c.GR[g]))}
      {ln('(=) Lucro bruto', bruto, 'vb-tt')}
      {ln(`(−) ${VB_SECAO.comercial}`, c.SEC.comercial)}
      {itens(comLs)}
      {ln('(−) ' + VB_SECAO.despesas, c.SEC.despesas)}
      {['terreno', 'incorporacao', 'cef', 'adm_financeiro'].map((g) => sub(VB_GRUPO[g].nome, c.GR[g]))}
      {ln('(=) EBITDA', c.ebitda, 'vb-tt')}
      {ln('(−) ' + VB_SECAO.financeiro, c.SEC.financeiro)}
      {det(FIN)}
      {ln('(=) Resultado sem as taxas', c.semTaxas, 'vb-tt forte')}
      {marg('Margem sem as taxas', c.vv > 0 ? nf(c.semTaxas / c.vv * 100, 2) + '%' : '—')}
      {ln('(−) ' + VB_SECAO.taxas, c.SEC.taxas)}
      {det(['taxas'])}
      {ln('(=) Lucro líquido (pagando as taxas)', c.lucro, 'vb-tt forte')}
      {marg('Margem líquida', c.margem == null ? '—' : nf(c.margem, 2) + '%', true)}
    </tbody></table></div>
    <div className="faint vb-obra">Margem bruta {c.vv > 0 ? nf(bruto / c.vv * 100, 1) + '%' : '—'} · obra incidente {brl(c.raso)} · obra total {brl(c.ot)}</div>
  </>;
}
