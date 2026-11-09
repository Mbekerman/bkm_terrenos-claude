/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { useRascunho, mudou, comRasc, useGuardarRasc, apagarRasc, LimparRasc } from '../components/Rascunho';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Adorno } from '../lib/mascara';
import { Ic } from '../components/Moldura';
import { data as fd, hojeISO, milhoes, m2, somarDias } from '../lib/format';
import type { Ficha, R } from './dados';
import Temperatura from './Temperatura';
import { lerNum, Quadro, abrirQuadro, abrirQuadroJa, focar, usePedido, Vivo } from './edicao';
import { daParte, ptArea, useLotes } from './Partes';
import { ComMencoes, MarcarPessoas, TextoMencao, useGente, type Gente, type Marcado } from '../components/Marcar';

// Aba Comercial da ficha (proto.js › abaComercialFicha = abaGeral(t,'neg') + abaComercial + abaNegociacao; proto_lotes.js ›
// secPartesCom; proto_mod.js › secReunioes). Negociação, Condições pedidas, Partes (o pedido de cada parte, oferta_partes),
// Ofertas recebidas, Corretores do terreno, Propostas e Reuniões, nos quadros que abrem e fecham.
// Regras: oferta por app.registrar_oferta (abre a negociação), referência por app.definir_oferta_referencia, proposta por
// app.registrar_proposta e app.atualizar_status_proposta; condições pedidas, partes da oferta, corretor principal e
// reuniões são escrita direta (tabelas sem regra, CLAUDE.md regra 2).

export const FORMA: Record<string, string> = {
  dinheiro: 'Dinheiro', permuta_fisica: 'Permuta física', permuta_financeira: 'Permuta financeira', permuta_geral: 'Permuta geral', permuta_com_torna: 'Permuta com torna',
};
const ST_PROP: Record<string, string> = {
  rascunho: 'Rascunho', apresentada: 'Apresentada', em_analise: 'Em análise', aceita: 'Aceita', recusada: 'Recusada', expirada: 'Expirada', retirada: 'Retirada', substituida: 'Substituída',
};
const ST_PROP_COR: Record<string, string> = { aceita: 'good', recusada: 'crit', expirada: 'crit', apresentada: 'blue', em_analise: 'blue' };
const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const numTxt = (v: number | null | undefined) => (v == null ? '' : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 }));
const ni = (x = 'Não informado') => <span className="ni">{x}</span>;

export interface Com { ofertas: R[]; ref: R | null; proc: R | null; tcor: R[]; corretores: R[]; props: R[]; reus: R[]; motivo: string | null }

export function useComercial(f: Ficha) {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['ficha-com', f.id, f.negId], enabled: !!empresa,
    queryFn: async (): Promise<Com> => {
      const neg = f.negId, nada = Promise.resolve({ data: null, error: null });
      const [of, ng, pr, tc, co, pp, ru] = await Promise.all([
        supabase.from('ofertas').select('id,data_oferta,valor_pedido,forma_pagamento_pedida,observacao_pagamento,aceita_permuta,validade,status,corretor_id,criado_em,oferta_partes(parte_id,valor_pedido,forma_pagamento)')
          .eq('terreno_id', f.id).order('data_oferta').order('criado_em'),
        neg ? supabase.from('negociacoes').select('oferta_referencia_id').eq('processo_id', neg).maybeSingle() : nada,
        neg ? supabase.from('processos').select('id,status,etapa_atual,subetapa_atual,subetapa_desde,motivo_encerramento,detalhe_encerramento').eq('id', neg).maybeSingle() : nada,
        supabase.from('terreno_corretores').select('corretor_id,principal').eq('terreno_id', f.id),
        supabase.from('corretores').select('id,creci,imobiliaria,ativo,pessoas(nome_razao_social)').eq('empresa_id', empresa!.id),
        neg ? supabase.from('propostas').select('*').eq('processo_id', neg).order('versao') : nada,
        supabase.from('reunioes').select('*,reuniao_participantes(id,lado,nome,email,user_id,pessoa_id,pessoas(nome_razao_social))').eq('terreno_id', f.id).order('inicio', { ascending: false }),
      ]);
      for (const r of [of, ng, pr, tc, co, pp, ru]) if (r.error) throw r.error;
      const ofertas = (of.data ?? []) as R[], proc = (pr.data as R) ?? null;
      const refId = (ng.data as R | null)?.oferta_referencia_id;
      const ref = ofertas.find((o) => o.id === refId)
        ?? ofertas.filter((o) => o.status === 'ativa').sort((a, b) => String(b.data_oferta).localeCompare(a.data_oferta))[0] ?? ofertas[0] ?? null;
      let motivo: string | null = null;
      if (proc && ['perdido', 'descartado'].includes(proc.status) && proc.motivo_encerramento) {
        const m = await supabase.from('motivos_encerramento').select('nome').eq('status', proc.status).eq('codigo', proc.motivo_encerramento)
          .or(`empresa_id.eq.${empresa!.id},empresa_id.is.null`).order('empresa_id', { nullsFirst: false }).limit(1);
        motivo = (m.data as R[] | null)?.[0]?.nome ?? proc.motivo_encerramento;
      }
      const corretores = ((co.data ?? []) as R[]).map((c) => ({ ...c, nome: c.pessoas?.nome_razao_social ?? '—' })).sort((a, b) => a.nome.localeCompare(b.nome));
      return { ofertas, ref, proc, tcor: (tc.data ?? []) as R[], corretores, props: (pp.data ?? []) as R[], reus: (ru.data ?? []) as R[], motivo };
    },
  });
}

function useRecarregar() {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: ['ficha-com'] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['mapa'] }); };
}

/* ---------- Registrar oferta (janela; também pela matrícula ou SQL de outro terreno) ---------- */
let ofertaPedida: { codigo: string; msg?: string } | null = null;
/** pede a janela de oferta na aba Comercial do terreno indicado (ela abre quando a aba aparecer) */
export function pedirOferta(codigo: string, msg?: string) { ofertaPedida = { codigo, msg }; window.dispatchEvent(new Event('ficha-oferta')); }

export function JanelaOferta({ f, corretores, fechar }: { f: Ficha; corretores: R[]; fechar: () => void }) {
  const toast = useToast(), recarregar = useRecarregar();
  const OF0 = { cid: '', valor: '', forma: '', validade: '', obs: '', aceita: '' }, kOf = `${f.id}:oferta`;
  const [v, setV] = useState<Record<string, string>>(() => comRasc(kOf, OF0));
  const [grav, setGrav] = useState(false);
  const fref = useRef<HTMLFormElement>(null);
  const temOf = Object.values(v).some((x) => x.trim() !== '');
  useGuardarRasc(kOf, v, temOf);
  const { aviso, pedir } = useRascunho(fref, temOf, 'a oferta', fechar);
  const m = (k: string) => (ev: { target: { value: string } }) => setV((o) => ({ ...o, [k]: ev.target.value }));
  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const valor = lerNum(v.valor);
    if (!valor || valor <= 0) { toast('Informe o valor pedido.', true); return; }
    setGrav(true);
    const { data, error } = await supabase.rpc('registrar_oferta', {
      p_terreno: f.id, p_valor: valor, p_forma: v.forma || null, p_corretor: v.cid || null, p_observacao_pagamento: v.obs.trim() || null,
      p_aceita_permuta: v.aceita.trim() || null, p_validade: v.validade || null,
    });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    recarregar();
    toast((data as R)?.negociacao_nova ? 'Oferta registrada. A negociação foi aberta.' : 'Oferta registrada.');
    apagarRasc(kOf);
    fechar();
  }
  return (
    <Dialogo titulo="Registrar oferta" onFechar={() => pedir(fechar)} rodape={<><LimparRasc chave={kOf} mostrar={temOf} limpar={() => setV(OF0)} /><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form="f-of" disabled={grav}>Registrar</button></>}>
      <form id="f-of" ref={fref} onSubmit={enviar}><div className="fields">
        <div className="field"><label htmlFor="o-c">Corretor</label><select id="o-c" value={v.cid} onChange={m('cid')}><option value="">Sem corretor / direto</option>
          {corretores.filter((c) => c.ativo !== false).map((c) => <option key={c.id} value={c.id}>{c.nome}{c.imobiliaria ? ' · ' + c.imobiliaria : ''}</option>)}</select></div>
        <div className="field"><label htmlFor="o-v">Valor pedido</label><Adorno t="moeda"><input id="o-v" inputMode="decimal" data-fmt="moeda" required value={v.valor} onChange={m('valor')} /></Adorno></div>
        <div className="field"><label htmlFor="o-f">Forma de pagamento pedida</label><select id="o-f" value={v.forma} onChange={m('forma')}><option value="">Não informada</option>
          {Object.entries(FORMA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="o-val">Validade</label><input id="o-val" type="date" value={v.validade} onChange={m('validade')} /></div>
        <div className="field full"><label htmlFor="o-o">Observação sobre a forma de pagamento</label><input id="o-o" value={v.obs} onChange={m('obs')} /></div>
        <div className="field full"><label htmlFor="o-a">Aceita permuta</label><input id="o-a" value={v.aceita} onChange={m('aceita')} /></div>
      </div></form>
      {aviso}
    </Dialogo>
  );
}

/* ---------- Negociação ---------- */
function SecNegociacao({ f, c, cor }: { f: Ficha; c: Com; cor: string }) {
  const { edita } = useSessao();
  const p = c.proc;
  if (!p) return null;
  const ets = f.etapasEnt, e = ets.find((x) => x.k === p.etapa_atual), sub = p.subetapa_atual ? e?.subs.find((s) => s.k === p.subetapa_atual)?.nome : null;
  const dias = p.subetapa_desde ? Math.max(0, Math.floor((Date.now() - new Date(p.subetapa_desde).getTime()) / 864e5)) : null;
  const sit = p.status === 'ativo' ? e?.nome ?? p.etapa_atual : ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: 'Comprado' } as R)[p.status] ?? p.status;
  const lp = c.props[c.props.length - 1];
  const agora = new Date().toISOString();
  const pr = c.reus.filter((m) => m.status === 'agendada' && m.inicio >= agora).sort((a, b) => a.inicio.localeCompare(b.inicio))[0];
  const lin = (k: string, v: ReactNode) => <div className="kv"><dt>{k}</dt><dd>{v == null || v === '' ? ni() : v}</dd></div>;
  return (
    <Quadro aba="comercial" id="neg" primeiro titulo="Negociação">
      <div className="sec-b"><dl className="kvl">
        {lin('Situação', <><span className="sitchip"><span className="sw" style={{ background: cor }} />{sit}</span>
          {p.status === 'ativo' && sub && <> <span className="chip sub">{sub}{dias != null ? ` · ${dias} d` : ''}</span></>}</>)}
        {['perdido', 'descartado'].includes(p.status) && lin('Motivo', [c.motivo, p.detalhe_encerramento].filter(Boolean).join(' · '))}
        {p.status === 'ativo' ? <div className="kv"><dt>Temperatura</dt><dd><Temperatura f={f} pode={edita} /></dd></div>
          : lin('Temperatura', f.temp ? `${f.temp} · ${['', 'Muito fria', 'Fria', 'Morna', 'Quente', 'Muito quente'][f.temp]}` : '')}
        {lin('Última proposta', lp ? `${milhoes(lp.valor_total)} · ${lp.origem === 'bkm' ? 'BKM' : 'Vendedor'} · ${ST_PROP[lp.status]}` : '')}
        {lin('Próxima reunião', pr ? `${fd(pr.inicio)} · ${new Date(pr.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '')}
      </dl></div>
    </Quadro>
  );
}

/* ---------- Condições pedidas (a oferta de referência; editar muda essa oferta) ----------
   Editadas no lugar, sem Editar nem Salvar: cada campo grava ao sair dele ou ao escolher (pedido do Moisés, 6/nov/2026) */
function SecCondicoes({ f, c, registrar, primeiro }: { f: Ficha; c: Com; registrar: () => void; primeiro: boolean }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const o = c.ref;
  const cp = c.corretores.find((x) => x.id === c.tcor.find((t) => t.principal)?.corretor_id);
  const [valorEd, setValorEd] = useState<number | null>(o?.valor_pedido ?? null);
  useEffect(() => setValorEd(o?.valor_pedido ?? null), [o?.valor_pedido]);
  const ed = edita && !!o;
  /* "Valor pedido" do que falta na ficha: o campo da oferta de referência; sem oferta, a janela de registrar oferta */
  usePedido(['cond'], () => {
    if (ed) { abrirQuadroJa('comercial', 'cond'); focar('c-valor'); } else if (edita) { registrar(); focar('o-v'); }
  });
  async function gravar(d: R) {
    if (!o) return false;
    const { error } = await supabase.from('ofertas').update(d).eq('id', o.id);
    if (error) { toast(error.message, true); return false; }
    /* corretor novo na oferta passa a constar no terreno (o primeiro vira principal), como no registro da oferta */
    if (d.corretor_id && !c.tcor.some((t) => t.corretor_id === d.corretor_id)) {
      const r = await supabase.from('terreno_corretores').upsert({ terreno_id: f.id, corretor_id: d.corretor_id, empresa_id: f.t.empresa_id, principal: !c.tcor.some((t) => t.principal) }, { ignoreDuplicates: true });
      if (r.error) toast(r.error.message, true);
    }
    recarregar();
    toast('Salvo.');
    return true;
  }
  const gravarValor = (v: string) => {
    const n = lerNum(v);
    if (n != null && n <= 0) { toast('O valor pedido precisa ser maior que zero.', true); return false; }
    return gravar({ valor_pedido: n });
  };
  const inp = (k: string, col: string, ini: string, extra: R = {}) => (
    <Vivo ini={ini} gravar={(v) => gravar({ [col]: v.trim() || null })}>{(p) => <input className="inl-x" id={`c-${k}`} placeholder="Não informado" {...extra} {...p} />}</Vivo>
  );
  const sel = (k: string, col: string, ini: string, opts: [string, string][], vazio: string) => (
    <Vivo ini={ini} imediato gravar={(v) => gravar({ [col]: v || null })}>{(p) =>
      <select className="inl-x" id={`c-${k}`} {...p}><option value="">{vazio}</option>{opts.map(([a, b]) => <option key={a} value={a}>{b}</option>)}</select>}</Vivo>
  );
  const area = f.area;
  const acoes = !o && edita ? <div className="sec-acoes"><button className="btn sm" onClick={registrar}><Ic n="add" s={16} />Registrar oferta</button></div> : undefined;
  const kv = (k: string, val: ReactNode, campo: () => ReactNode) => <div className="kv"><dt>{k}</dt><dd>{ed ? campo() : val}</dd></div>;
  return (
    <Quadro aba="comercial" id="cond" primeiro={primeiro} titulo="Condições pedidas" acoes={acoes}>
      <div className="sec-b">{o ? <>
        <div className={`cond2${ed ? ' vivo' : ''}`}>
          <div><div className="lbl">Valor pedido</div><div className="big">{ed
            ? <Adorno t="moeda"><Vivo ini={numTxt(o.valor_pedido)} gravar={gravarValor} aoMudar={(v) => setValorEd(lerNum(v))}>{(p) =>
              <input className="inl-x" id="c-valor" inputMode="decimal" data-fmt="moeda" aria-label="Valor pedido" placeholder="Não informado" {...p} />}</Vivo></Adorno>
            : o.valor_pedido ? milhoes(o.valor_pedido) : ni()}</div></div>
          <div><div className="lbl">Por m²</div><div className="big">{(ed ? valorEd : o.valor_pedido) && area ? brl((ed ? valorEd! : o.valor_pedido) / area) : ni('—')}</div></div>
        </div>
        <dl className={`kvl${ed ? ' kvl-ed vivo' : ''}`}>
          {kv('Forma de pagamento', o.forma_pagamento_pedida ? FORMA[o.forma_pagamento_pedida] : ni('Não informada'), () => sel('forma', 'forma_pagamento_pedida', o.forma_pagamento_pedida ?? '', Object.entries(FORMA), 'Não informada'))}
          {kv('Corretor', cp ? <span>{cp.nome}<span className="kv-2">{cp.imobiliaria}</span></span> : ni('—'),
            () => sel('cid', 'corretor_id', o.corretor_id ?? '', c.corretores.filter((x) => x.ativo !== false || x.id === o.corretor_id).map((x) => [x.id, `${x.nome}${x.imobiliaria ? ' · ' + x.imobiliaria : ''}`]), 'Sem corretor'))}
          {kv('Aceita permuta', o.aceita_permuta || ni(), () => inp('aceita', 'aceita_permuta', o.aceita_permuta ?? '', { placeholder: 'Como o vendedor encara a permuta e em que condições' }))}
          {kv('Pagamento', o.observacao_pagamento || ni(), () => inp('obs', 'observacao_pagamento', o.observacao_pagamento ?? '', { placeholder: 'Observação sobre a forma de pagamento' }))}
        </dl>
        {ed && <div className="hint" style={{ marginTop: 8 }}>Valores da oferta de {fd(o.data_oferta)}.</div>}</> : <div className="muted">Nenhuma oferta registrada.</div>}</div>
    </Quadro>
  );
}

/* ---------- Partes: o pedido de cada parte na oferta de referência ---------- */
function LinhaParte({ f, o, pa, um, area, zonas, nomeDet, mudar }: {
  f: Ficha; o: R | null; pa: R; um: boolean; area: number | null; zonas: string; nomeDet: string;
  mudar: (pa: R, valor: number | null, forma: string | null) => Promise<void>;
}) {
  const { edita } = useSessao();
  const op = o && !um ? (o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id) : null;
  const valor: number | null = !o ? null : um ? o.valor_pedido : op?.valor_pedido ?? null;
  const forma: string | null = !o ? null : um ? o.forma_pagamento_pedida : op?.forma_pagamento ?? o.forma_pagamento_pedida ?? null;
  const [vv, setVv] = useState(numTxt(valor));
  const [vm, setVm] = useState(valor != null && area ? numTxt(Math.round(valor / area)) : '');
  useEffect(() => { setVv(numTxt(valor)); setVm(valor != null && area ? numTxt(Math.round(valor / area)) : ''); }, [valor, area]);
  const ro = !edita || !o;
  const L = (x: string) => <span className="lbl-f ptcom-ml">{x}</span>;
  const gravarValor = (n: number | null) => { if (n !== valor) mudar(pa, n, um ? forma : op ? op.forma_pagamento ?? null : null); };
  void f;
  return (
    <div className="ptcom-r">
      <div className="ptcom-p"><b>{pa.nome}</b>{pa.pessoa_nome && <> <span className="faint">{pa.pessoa_nome}</span></>}<div className="faint">{nomeDet}</div></div>
      <div className="ptcom-c">{L('Área adotada')}<span>{area != null ? m2(area) : '—'}</span></div>
      <div className="ptcom-c">{L('Zoneamento')}<span>{zonas || '—'}</span></div>
      <div className="ptcom-c field">{L('Valor pedido')}{ro ? <span>{valor != null ? brl(valor) : '—'}</span>
        : <Adorno t="moeda"><input className="ptc-n" inputMode="decimal" data-fmt="moeda" value={vv} aria-label={`Valor pedido de ${pa.nome}`}
          onChange={(e) => { setVv(e.target.value); const n = lerNum(e.target.value); setVm(n != null && area ? numTxt(Math.round(n / area)) : ''); }}
          onBlur={() => gravarValor(lerNum(vv))} /></Adorno>}</div>
      <div className="ptcom-c field">{L('Valor por m²')}{ro ? <span>{valor != null && area ? brl(valor / area) : '—'}</span>
        : <Adorno t="moeda"><input className="ptc-n" inputMode="decimal" data-fmt="moeda" value={vm} placeholder={area ? 'por m²' : 'sem área'} disabled={!area} aria-label={`Valor por m² de ${pa.nome}`}
          onChange={(e) => { setVm(e.target.value); const n = lerNum(e.target.value); setVv(n != null && area ? numTxt(Math.round(n * area)) : ''); }}
          onBlur={() => { const n = lerNum(vm); gravarValor(n != null && area ? Math.round(n * area) : null); }} /></Adorno>}</div>
      <div className="ptcom-c field">{L('Condição de pagamento')}{ro ? <span>{forma ? FORMA[forma] : '—'}</span>
        : <select value={forma ?? ''} aria-label={`Condição de pagamento de ${pa.nome}`} onChange={(e) => mudar(pa, valor, e.target.value || null)}>
          <option value="">Não informada</option>{Object.entries(FORMA).map(([k, x]) => <option key={k} value={k}>{x}</option>)}</select>}</div>
    </div>
  );
}

function SecPartesCom({ f, c, registrar }: { f: Ficha; c: Com; registrar: () => void }) {
  const { edita, empresa } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const L = useLotes(f).data;
  const qc = useQueryClient();
  if (!L) return null;
  const P = L.partes, o = c.ref, um = P.length === 1, rot = L.base?.rotulo ?? 'Inscrição';
  // com uma parte só, ela é o terreno inteiro: vale a área adotada do terreno (sem ela, a das matrículas ou dos SQLs)
  const areaDe = (pid: string) => (um && f.area != null ? +f.area : ptArea(L, pid).area);
  const zonasDe = (pid: string) => [...new Set(daParte(L, 's', pid).map((e) => e.x).flatMap((i) => ((L.consultas[i.id]?.zonas ?? []) as R[]).map((z) => z.sigla)).filter(Boolean))].join(' / ');
  const det = (pid: string) => {
    const ms = daParte(L, 'm', pid).map((e) => e.x), is = daParte(L, 's', pid).map((e) => e.x);
    return ms.length || is.length ? [ms.length && 'Mat. ' + ms.map((m) => m.numero).join(', '), is.length && rot + ' ' + is.map((i) => i.inscricao).join(', ')].filter(Boolean).join(' · ') : 'sem matrícula nem SQL';
  };
  async function mudar(pa: R, valor: number | null, forma: string | null) {
    if (!o) return;
    if (valor != null && valor <= 0) { toast('O valor pedido precisa ser maior que zero.', true); return; }
    let error;
    if (um) ({ error } = await supabase.from('ofertas').update({ valor_pedido: valor, forma_pagamento_pedida: forma }).eq('id', o.id));
    else if (valor == null && forma == null) ({ error } = await supabase.from('oferta_partes').delete().eq('oferta_id', o.id).eq('parte_id', pa.id));
    else ({ error } = await supabase.from('oferta_partes').upsert({ oferta_id: o.id, parte_id: pa.id, empresa_id: empresa!.id, valor_pedido: valor, forma_pagamento: forma }));
    if (error) { toast(error.message, true); return; }
    recarregar();
    qc.invalidateQueries({ queryKey: ['ficha-lotes', f.id] });
  }
  const vs = P.map((pa) => (!o ? null : um ? o.valor_pedido : (o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id)?.valor_pedido ?? null));
  const aT = P.reduce((s, pa) => s + (areaDe(pa.id) || 0), 0), vT = vs.some((v) => v != null) ? vs.reduce((s, v) => s + (+v || 0), 0) : null;
  const aCom = P.filter((_, i) => vs[i] != null).reduce((s, pa) => s + (areaDe(pa.id) || 0), 0), falta = vs.filter((v) => v == null).length;
  const Lb = (x: string) => <span className="lbl-f ptcom-ml">{x}</span>;
  return (
    <Quadro aba="comercial" id="partes-com" titulo={<>Partes <span className="h-n">{P.length}</span></>}
      acoes={o ? <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>oferta de {fd(o.data_oferta)}</span> : undefined}>
      <div className="sec-b">
        {!o && <div className="muted" style={{ marginBottom: 10 }}>Registre a oferta para informar o valor pedido de cada parte. {edita && <button className="btn sm" onClick={registrar}><Ic n="add" s={16} />Registrar oferta</button>}</div>}
        <div className="ptcom">
          <div className="ptcom-r ptcom-th"><span>Parte</span><span>Área adotada</span><span>Zoneamento</span><span>Valor pedido</span><span>Valor por m²</span><span>Condição de pagamento</span></div>
          {P.map((pa) => <LinhaParte key={pa.id} f={f} o={o} pa={pa} um={um} area={areaDe(pa.id)} zonas={zonasDe(pa.id)} nomeDet={det(pa.id)} mudar={mudar} />)}
          {P.length > 1 && (
            <div className="ptcom-r ptcom-tot"><div className="ptcom-p"><b>Total</b></div><div className="ptcom-c">{Lb('Área adotada')}<span>{aT ? m2(aT) : '—'}</span></div><div className="ptcom-c" />
              <div className="ptcom-c">{Lb('Valor pedido')}<span>{vT != null ? <>{brl(vT)}{falta ? <> <span className="faint">(faltam {falta})</span></> : null}</> : '—'}</span></div>
              <div className="ptcom-c">{Lb('Valor por m²')}<span>{vT != null && aCom ? brl(vT / aCom) : '—'}</span></div><div className="ptcom-c" /></div>
          )}
        </div>
        <div className="hint">Digite o total ou o valor por m²: o outro se calcula pela área da parte (soma das matrículas dela). Área e zoneamento vêm da aba Terreno. As propostas da BKM ficam no quadro Propostas.</div>
      </div>
    </Quadro>
  );
}

/* ---------- Ofertas recebidas ---------- */
function SecOfertas({ f, c, registrar }: { f: Ficha; c: Com; registrar: () => void }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const os = c.ofertas.slice().sort((a, b) => String(a.data_oferta).localeCompare(b.data_oferta) || String(a.criado_em).localeCompare(b.criado_em));
  async function usar(o: R) {
    const { error } = await supabase.rpc('definir_oferta_referencia', { p_processo: f.negId, p_oferta: o.id });
    if (error) toast(error.message, true); else { toast('Oferta de referência trocada.'); recarregar(); }
  }
  const st = (s: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—');
  return (
    <Quadro aba="comercial" id="ofertas" titulo="Ofertas recebidas"
      acoes={edita ? <button className="btn sm" onClick={registrar}><Ic n="add" s={16} />Registrar oferta</button> : undefined}>
      <div className="sec-b">{os.length ? (
        <div className="tblwrap"><table className="mini-tbl"><thead><tr><th>Data</th><th>Corretor</th><th className="r">Valor pedido</th><th>Forma</th><th>Status</th><th /></tr></thead><tbody>
          {os.map((o, i) => {
            const co = c.corretores.find((x) => x.id === o.corretor_id);
            return (
              <tr key={o.id}>
                <td>{fd(o.data_oferta)}{i === 0 && os.length > 1 && <div><span className="chip of-1a" style={{ margin: '4px 0 0' }}>Primeira</span></div>}</td>
                <td className="nw">{co ? <>{co.nome}<div className="faint" style={{ fontSize: 12 }}>{co.imobiliaria}</div></> : 'Direto'}</td>
                <td className="r">{brl(o.valor_pedido)}</td>
                <td>{o.forma_pagamento_pedida ? FORMA[o.forma_pagamento_pedida] : '—'}</td>
                <td><span className={`chip ${o.status === 'ativa' ? 'good' : ''}`}>{st(o.status)}</span></td>
                <td className="r">{o.id === c.ref?.id ? <span className="chip blue">Referência</span>
                  : f.negId && edita ? <button className="btn sm text of-ref" onClick={() => usar(o)}>Usar como referência</button> : null}</td>
              </tr>
            );
          })}
        </tbody></table></div>
      ) : <div className="muted">Nenhuma oferta.</div>}</div>
    </Quadro>
  );
}

/* ---------- Corretores do terreno ---------- */
function SecCorretores({ f, c }: { f: Ficha; c: Com }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  async function principal(cid: string) {
    if (!edita) return;
    const a = await supabase.from('terreno_corretores').update({ principal: false }).eq('terreno_id', f.id).eq('principal', true);
    const b = a.error ? a : await supabase.from('terreno_corretores').update({ principal: true }).eq('terreno_id', f.id).eq('corretor_id', cid);
    if (b.error) toast(b.error.message, true); else recarregar();
  }
  const lista = c.tcor.map((t) => ({ corretor_id: t.corretor_id as string, principal: !!t.principal, c: c.corretores.find((x) => x.id === t.corretor_id) })).filter((x) => x.c)
    .sort((a, b) => Number(b.principal) - Number(a.principal) || a.c!.nome.localeCompare(b.c!.nome));
  return (
    <Quadro aba="comercial" id="corretores" titulo="Corretores do terreno">
      <div className="sec-b">{lista.length ? lista.map((x) => (
        <div key={x.corretor_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0' }}>
          <button className={`star ${x.principal ? 'on' : ''}`} disabled={!edita} onClick={() => !x.principal && principal(x.corretor_id)}
            aria-label={`Marcar ${x.c!.nome} como principal`} title={x.principal ? 'Principal' : 'Marcar como principal'}>★</button>
          <span style={{ minWidth: 0 }}><b>{x.c!.nome}</b>{x.principal && <> <span className="chip blue cfg-tag">Principal</span></>}
            <span className="muted" style={{ display: 'block', fontSize: 13 }}>{[x.c!.imobiliaria, x.c!.creci && `CRECI ${x.c!.creci}`].filter(Boolean).join(' · ')}</span></span>
        </div>
      )) : <div className="muted">Entram automaticamente quando apresentam uma oferta.</div>}</div>
    </Quadro>
  );
}

/* ---------- Propostas ---------- */
function SecPropostas({ f, c }: { f: Ficha; c: Com }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const ativa = c.proc?.status === 'ativo';
  const [form, setForm] = useState(false);
  const hoje = hojeISO();
  const [v, setV] = useState<Record<string, string>>({});
  const [grav, setGrav] = useState(false);
  const [ini, setIni] = useState<Record<string, string>>({});
  const kPr = `${f.id}:proposta`;
  const abrir = () => { const o = { origem: 'bkm', valor: '', forma: 'dinheiro', status: 'apresentada', data: hoje, validade: somarDias(hoje, 15), cond: '' }; setV(comRasc(kPr, o)); setIni(o); abrirQuadro('comercial', 'propostas'); setForm(true); };
  const fref = useRef<HTMLFormElement>(null);
  const sujoPr = form && mudou(v, ini);
  useGuardarRasc(kPr, v, sujoPr);
  const { aviso } = useRascunho(fref, sujoPr, 'a proposta', () => setForm(false));
  const m = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const n = c.props.length;
  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    const valor = lerNum(v.valor);
    if (!valor || valor <= 0) { toast('Informe o valor total.', true); return; }
    setGrav(true);
    const { error } = await supabase.rpc('registrar_proposta', {
      p_processo: f.negId, p_origem: v.origem, p_valor: valor, p_forma: v.forma, p_condicoes: v.cond.trim() || null,
      p_data_apresentacao: v.data || null, p_validade: v.validade || null, p_status: v.status,
    });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    apagarRasc(kPr);
    setForm(false);
    recarregar();
    toast(`Proposta v${n + 1} registrada.`);
  }
  async function status(p: R, s: string) {
    const { error } = await supabase.rpc('atualizar_status_proposta', { p_proposta: p.id, p_status: s });
    if (error) toast(error.message, true); else recarregar();
  }
  const chain = c.props.slice().reverse();
  return (
    <Quadro aba="comercial" id="propostas" titulo="Propostas"
      acoes={<span className="sec-acoes">{ativa && edita && !form && <button className="btn primary sm" onClick={abrir}><Ic n="add" s={16} />Nova proposta</button>}</span>}>
      <div className="sec-b">
        {form && (
          <form ref={fref} onSubmit={enviar} className="prop-form">
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>Nova proposta · v{n + 1}</h3>
            <div className="editgrid">
              <div className="field"><label htmlFor="pp-o">Origem</label><select id="pp-o" value={v.origem} onChange={m('origem')}><option value="bkm">BKM</option><option value="vendedor">Vendedor</option></select></div>
              <div className="field"><label htmlFor="pp-v">Valor total</label><Adorno t="moeda"><input id="pp-v" inputMode="decimal" data-fmt="moeda" required value={v.valor} onChange={m('valor')} /></Adorno></div>
              <div className="field"><label htmlFor="pp-f">Forma de pagamento</label><select id="pp-f" value={v.forma} onChange={m('forma')}>{Object.entries(FORMA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div className="field"><label htmlFor="pp-s">Status</label><select id="pp-s" value={v.status} onChange={m('status')}><option value="apresentada">Apresentada</option><option value="em_analise">Em análise</option><option value="rascunho">Rascunho</option></select></div>
              <div className="field"><label htmlFor="pp-d">Apresentada em</label><input id="pp-d" type="date" value={v.data} onChange={m('data')} /></div>
              <div className="field"><label htmlFor="pp-val">Validade</label><input id="pp-val" type="date" value={v.validade} onChange={m('validade')} /></div>
              <div className="field full"><label htmlFor="pp-c">Condições de pagamento</label><textarea id="pp-c" value={v.cond} onChange={m('cond')} placeholder="Entrada, parcelas, permuta, torna, condição suspensiva" /></div>
            </div>
            <div className="hint">{n ? `Responde à v${n}. Se vier do outro lado, a v${n} vira Recusada; se vier do mesmo lado, vira Substituída.` : 'Primeira proposta da negociação.'}</div>
            <div className="sec-f" style={{ padding: '12px 0 0' }}><LimparRasc chave={kPr} mostrar={sujoPr} limpar={() => setV(ini)} /><button type="button" className="btn text" onClick={() => setForm(false)}>Cancelar</button><button className="btn primary" disabled={grav}>Registrar</button></div>
          </form>
        )}
        {aviso}
        {chain.length ? (
          <div className="chain" style={{ marginTop: form ? 16 : 0 }}>{chain.map((p, i) => (
            <div key={p.id} className={`pnode ${p.origem}`}><span className="pd">v{p.versao}</span><div className="pc">
              <div className="ph"><span><span className="pv">{brl(p.valor_total)}</span> <span className="muted" style={{ fontSize: 13 }}><span className="p-sep">· </span>{p.origem === 'bkm' ? 'BKM' : 'Vendedor'}{p.versao > 1 ? ` responde à v${p.versao - 1}` : ''}</span></span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{i === 0 && ativa && edita
                  ? <select aria-label="Status da proposta" className="chip chip-sel" value={p.status} onChange={(e) => status(p, e.target.value)}>
                    {Object.entries(ST_PROP).filter(([k]) => k !== 'substituida' || p.status === k).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                  : <span className={`chip ${ST_PROP_COR[p.status] ?? ''}`}>{ST_PROP[p.status]}</span>}</span></div>
              <div className="pm">{FORMA[p.forma_pagamento]}{p.data_apresentacao ? ` · apresentada ${fd(p.data_apresentacao)}` : ''}{p.validade ? ` · válida até ${fd(p.validade)}` : ''}</div>
              {p.condicoes_pagamento && <div className="pt">{p.condicoes_pagamento}</div>}
            </div></div>
          ))}</div>
        ) : !form && <div className="muted">Nenhuma proposta ainda.</div>}
      </div>
    </Quadro>
  );
}

/* ---------- Reuniões ---------- */
const MOD: Record<string, string> = { presencial: 'Presencial', online: 'Online' };
const LOC: Record<string, string> = { bkm: 'Na BKM', externo: 'Externa' };
const ST_REU: Record<string, string> = { realizada: 'Realizada', agendada: 'Agendada', cancelada: 'Cancelada' };
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dataLocal = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
/** link digitado: sem http, ganha https:// */
const linkOk = (s: string) => { const t = s.trim(); return !t ? '' : /^https?:\/\//i.test(t) ? t : 'https://' + t; };

/** participante gravado → pessoa marcada no campo (o nome do colega vem da equipe) */
function marcadoDe(p: R, bkm: Gente[]): Marcado {
  if (p.user_id) return { id: p.id, k: 'u:' + p.user_id, nome: bkm.find((g) => g.user_id === p.user_id)?.nome ?? 'Colega', user_id: p.user_id, lado: 'bkm' };
  if (p.pessoa_id) return { id: p.id, k: 'p:' + p.pessoa_id, nome: p.pessoas?.nome_razao_social ?? '—', pessoa_id: p.pessoa_id, lado: p.lado };
  if (p.email) return { id: p.id, k: 'e:' + p.email, nome: p.nome ?? p.email, email: p.email, lado: p.lado };
  return { id: p.id, k: 'n:' + String(p.nome ?? '').toLowerCase(), nome: p.nome ?? '—', lado: p.lado };
}
const linhaDe = (m: Marcado) => (m.user_id ? { lado: 'bkm', user_id: m.user_id } : m.pessoa_id ? { lado: m.lado, pessoa_id: m.pessoa_id }
  : { lado: m.lado, nome: m.nome, email: m.email ?? null });
const lerMarc = (s: string): Marcado[] => { try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; } };

// Reunião: registrar e editar no mesmo formulário (editar: clicar na reunião; pedido do Moises, 9/nov/2026). Participantes
// marcados com @: colegas da BKM (avisados no sino pelo banco, app.tg_participante_mencao) e pessoas de fora cadastradas
// no terreno com e-mail ou nome digitado (ficam registradas como participantes; o convite por e-mail espera o Google Agenda).
// Online tem o link da reunião, digitado por ora.
function SecReunioes({ f, c }: { f: Ficha; c: Com }) {
  const { edita, empresa, membro } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const gente = useGente(f.id).data, bkm = gente?.bkm ?? [], fora = gente?.fora ?? [];
  const ativa = c.proc?.status === 'ativo';
  const [form, setForm] = useState(false);
  const [ed, setEd] = useState<R | null>(null);
  const [v, setV] = useState<Record<string, string>>({});
  const [grav, setGrav] = useState(false);
  const [ini, setIni] = useState<Record<string, string>>({});
  const fref = useRef<HTMLFormElement>(null);
  const kRe = `${f.id}:reuniao${ed ? ':' + ed.id : ''}`, sujoRe = form && mudou(v, ini);
  useGuardarRasc(kRe, v, sujoRe);
  const { aviso } = useRascunho(fref, sujoRe, 'a reunião', () => { setForm(false); setEd(null); });
  const eu: Marcado[] = membro ? [{ k: 'u:' + membro.user_id, nome: bkm.find((g) => g.user_id === membro.user_id)?.nome ?? membro.nome ?? 'Eu', user_id: membro.user_id, lado: 'bkm' }] : [];
  const abrir = () => {
    const o = { status: 'realizada', data: hojeISO(), hora: '10:00', modalidade: 'presencial', local: 'bkm', endereco: '', link: '', pbkm: JSON.stringify(eu), pext: '[]', pauta: '', resumo: '', enc: '' };
    setEd(null); setV(comRasc(`${f.id}:reuniao`, o)); setIni(o);
    abrirQuadro('comercial', 'reunioes');
    setForm(true);
  };
  const editar = (r: R) => {
    const ps = ((r.reuniao_participantes ?? []) as R[]).map((p) => marcadoDe(p, bkm));
    const o = {
      status: r.status, data: dataLocal(r.inicio), hora: hora(r.inicio), modalidade: r.modalidade, local: r.local ?? 'bkm', endereco: r.endereco ?? '', link: r.link ?? '',
      pbkm: JSON.stringify(ps.filter((p) => p.lado === 'bkm')), pext: JSON.stringify(ps.filter((p) => p.lado !== 'bkm')),
      pauta: r.pauta ?? '', resumo: r.resumo ?? '', enc: r.encaminhamentos ?? '',
    };
    setEd(r); setV(comRasc(`${f.id}:reuniao:${r.id}`, o)); setIni(o);
    setForm(true);
    /* o formulário fica no lugar da reunião: só leva o cursor para ele, sem acender o campo */
    setTimeout(() => { const el = document.getElementById('ru-s'); el?.focus({ preventScroll: true }); el?.closest('form')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60);
  };
  const fechar = () => { setForm(false); setEd(null); };
  const m = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  const mt = (k: string) => (txt: string) => setV((x) => ({ ...x, [k]: txt }));
  const mm = (k: string) => (l: Marcado[]) => setV((x) => ({ ...x, [k]: JSON.stringify(l) }));
  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (grav) return;
    const inicio = new Date(`${v.data}T${v.hora || '00:00'}`);
    if (isNaN(+inicio)) { toast('Informe a data.', true); return; }
    if (v.status === 'realizada' && inicio > new Date()) { toast('Reunião realizada não pode ter data futura.', true); return; }
    const pres = v.modalidade === 'presencial', rea = v.status === 'realizada', link = pres ? '' : linkOk(v.link);
    if (link && !/^https?:\/\/\S+$/i.test(link)) { toast('O link da reunião não pode ter espaços.', true); focar('ru-l'); return; }
    setGrav(true);
    const dados = {
      status: v.status, inicio: inicio.toISOString(), modalidade: v.modalidade, link: link || null,
      local: pres ? v.local : null, endereco: pres && v.local === 'externo' ? v.endereco.trim() || null : null, pauta: v.pauta.trim() || null,
      resumo: rea ? v.resumo.trim() || null : null, encaminhamentos: rea ? v.enc.trim() || null : null,
    };
    const { data, error } = ed
      ? await supabase.from('reunioes').update(dados).eq('id', ed.id).select('id').single()
      : await supabase.from('reunioes').insert({ ...dados, empresa_id: empresa!.id, terreno_id: f.id, processo_id: f.negId }).select('id').single();
    if (!error) {
      const rid = (data as R).id as string, novos = [...lerMarc(v.pbkm), ...lerMarc(v.pext)];
      const antes = ed ? ((ed.reuniao_participantes ?? []) as R[]).map((p) => p.id as string) : [];
      const sai = antes.filter((id) => !novos.some((n) => n.id === id));
      const entra = novos.filter((n) => !n.id).map((n) => ({ ...linhaDe(n), empresa_id: empresa!.id, reuniao_id: rid }));
      if (sai.length) { const r = await supabase.from('reuniao_participantes').delete().in('id', sai); if (r.error) toast(r.error.message, true); }
      if (entra.length) { const r = await supabase.from('reuniao_participantes').insert(entra); if (r.error) toast(r.error.message, true); }
    }
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    apagarRasc(kRe);
    fechar();
    recarregar();
    toast(ed ? 'Reunião alterada.' : 'Reunião registrada.');
  }
  async function feita(r: R) {
    const { error } = await supabase.from('reunioes').update({ status: 'realizada' }).eq('id', r.id);
    if (error) toast(error.message, true); else recarregar();
  }
  const part = (r: R, ladoBkm: boolean) => ((r.reuniao_participantes ?? []) as R[]).filter((p) => (p.lado === 'bkm') === ladoBkm)
    .map((p) => marcadoDe(p, bkm)).map((x) => (x.user_id || x.pessoa_id || x.email ? '@' : '') + x.nome).join(', ');
  const ms = c.reus, agora = new Date();
  const radio = (k: string, opts: Record<string, string>, rot: string) => (
    <div className="field"><span className="lbl" id={`ru-${k}-l`}>{rot}</span><span className="seg3" role="radiogroup" aria-labelledby={`ru-${k}-l`}>
      {Object.entries(opts).map(([a, b]) => <label key={a} className="opt-radio"><input type="radio" name={k} value={a} checked={v[k] === a} onChange={m(k)} />{b}</label>)}</span></div>
  );
  const formulario = (
    <form ref={fref} className="reu-form" onSubmit={enviar} aria-label={ed ? 'Editar reunião' : 'Registrar reunião'}><div className="editgrid">
      <div className="field"><label htmlFor="ru-s">Situação</label><select id="ru-s" value={v.status} onChange={m('status')}>
        {Object.entries(ST_REU).filter(([k]) => ed || k !== 'cancelada').map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
      <div className="field"><label htmlFor="ru-d">Data</label><input id="ru-d" type="date" required value={v.data} onChange={m('data')} /></div>
      <div className="field"><label htmlFor="ru-h">Hora</label><input id="ru-h" type="time" value={v.hora} onChange={m('hora')} /></div>
      {radio('modalidade', MOD, 'Modalidade')}
      {v.modalidade === 'presencial' && radio('local', LOC, 'Onde')}
      {v.modalidade === 'presencial' && v.local === 'externo' && <div className="field"><label htmlFor="ru-e">Endereço</label><input id="ru-e" value={v.endereco} onChange={m('endereco')} placeholder="Escritório do vendedor, no terreno..." /></div>}
      {v.modalidade === 'online' && <div className="field ru-link"><label htmlFor="ru-l">Link da reunião</label><input id="ru-l" inputMode="url" value={v.link} onChange={m('link')} placeholder="https://meet.google.com/..." /></div>}
      <div className="field full"><label htmlFor="ru-pb">Participantes da BKM</label>
        <MarcarPessoas id="ru-pb" opcoes={bkm} valor={lerMarc(v.pbkm)} onChange={mm('pbkm')} placeholder="Digite @ e o nome" vazio="Ninguém da equipe com esse nome" /></div>
      <div className="field full"><label htmlFor="ru-pe">Participantes externos</label>
        <MarcarPessoas id="ru-pe" opcoes={fora} valor={lerMarc(v.pext)} onChange={mm('pext')} livre="outro"
          placeholder={fora.length ? 'Digite @ e o nome (pessoas do terreno com e-mail) ou um nome' : 'Nome do vendedor, corretor, advogado'} /></div>
      <div className="field full"><label htmlFor="ru-p">Pauta</label><TextoMencao id="ru-p" value={v.pauta} onChange={mt('pauta')} colegas={bkm} /></div>
      {v.status === 'realizada' && <>
        <div className="field full"><label htmlFor="ru-r">O que foi tratado</label><TextoMencao area id="ru-r" value={v.resumo} onChange={mt('resumo')} colegas={bkm} placeholder="Posições de cada lado, valores citados, objeções" /></div>
        <div className="field full"><label htmlFor="ru-n">Encaminhamentos</label><TextoMencao area id="ru-n" value={v.enc} onChange={mt('enc')} colegas={bkm} placeholder="Quem faz o quê, até quando" /></div>
      </>}
    </div><div className="sec-f" style={{ padding: '12px 0 0' }}><LimparRasc chave={kRe} mostrar={sujoRe} limpar={() => setV(ini)} /><button type="button" className="btn text" onClick={fechar}>Cancelar</button>
      <button className="btn primary" disabled={grav}>{ed ? 'Salvar' : 'Registrar reunião'}</button></div></form>
  );
  return (
    <Quadro aba="comercial" id="reunioes" titulo={<>Reuniões{ms.length ? <> <span className="h-n">{ms.length}</span></> : null}</>}
      acoes={<span className="sec-acoes">{ativa && edita && !form && <button className="btn primary sm" onClick={abrir}><Ic n="add" s={16} />Registrar reunião</button>}</span>}>
      <div className="sec-b">
        {form && !ed && formulario}
        {aviso}
        {ms.length ? (
          <div className="reus">{ms.map((r) => {
            if (form && ed?.id === r.id) return <div key={r.id}>{formulario}</div>;
            const bk = part(r, true), ex = part(r, false), pode = edita && !form;
            return (
              <article key={r.id} className={`reu ${r.status}${pode ? ' reu-ed' : ''}`} data-mid={r.id}
                {...(pode ? { role: 'button', tabIndex: 0, 'aria-label': `Editar a reunião de ${fd(dataLocal(r.inicio))}`, onClick: (e: MouseEvent) => { if (!(e.target as HTMLElement).closest('a,button')) editar(r); },
                  onKeyDown: (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); editar(r); } } } : {})}>
                <div className="reu-h"><div><div className="reu-t">{fd(dataLocal(r.inicio))} · {hora(r.inicio)}</div>
                  <div className="reu-m">{MOD[r.modalidade]}{r.modalidade === 'presencial' ? ' · ' + LOC[r.local] + (r.endereco ? ' · ' + r.endereco : '') : ''}</div></div>
                  <span className="reu-acts">{r.link && r.status !== 'cancelada' && <a className="btn sm" href={r.link} target="_blank" rel="noopener noreferrer"><Ic n="link" s={16} />{r.status === 'agendada' ? 'Entrar na reunião' : 'Link da reunião'}</a>}
                    <span className="reu-st">{r.status === 'agendada' ? <span className="chip blue">Agendada</span> : r.status === 'cancelada' ? <span className="chip">Cancelada</span> : <span className="chip good">Realizada</span>}
                      {pode && <button className="iconbtn sm" aria-label="Editar reunião" title="Editar reunião" onClick={() => editar(r)}><Ic n="edit" s={18} /></button>}</span>
                    {r.status === 'agendada' && ativa && edita && new Date(r.inicio) <= agora && <button className="btn sm" onClick={() => feita(r)}><Ic n="check" s={16} />Marcar realizada</button>}</span></div>
                {(bk || ex) && <div className="reu-p"><span><b>BKM</b> {bk || '—'}</span><span><b>Externos</b> {ex || '—'}</span></div>}
                {r.pauta && <div className="reu-x"><span className="k">Pauta</span><ComMencoes texto={r.pauta} colegas={bkm} /></div>}
                {r.resumo && <div className="reu-x"><span className="k">Tratado</span><ComMencoes texto={r.resumo} colegas={bkm} /></div>}
                {r.encaminhamentos && <div className="reu-x"><span className="k">Encaminhamentos</span><ComMencoes texto={r.encaminhamentos} colegas={bkm} /></div>}
              </article>
            );
          })}</div>
        ) : !form && <div className="muted">Nenhuma reunião registrada.</div>}
      </div>
    </Quadro>
  );
}

/** aba Comercial: com negociação, abre no quadro Negociação; sem, em Condições pedidas */
export default function AbaComercial({ f, cor }: { f: Ficha; cor: string }) {
  const q = useComercial(f);
  const toast = useToast();
  const [janela, setJanela] = useState(false);
  useEffect(() => {
    const ver = () => { if (ofertaPedida?.codigo === f.codigo) { const msg = ofertaPedida.msg; ofertaPedida = null; setJanela(true); if (msg) toast(msg); } };
    ver();
    window.addEventListener('ficha-oferta', ver);
    return () => window.removeEventListener('ficha-oferta', ver);
  }, [f.codigo, toast]);
  if (q.isLoading) return <section className="sec"><div className="empty">Carregando…</div></section>;
  if (q.error || !q.data) return <section className="sec"><div className="empty">Não foi possível carregar a aba Comercial: {String((q.error as any)?.message ?? q.error)}</div></section>;
  const c = q.data, reg = () => setJanela(true);
  return (
    <div className="stack">
      {c.proc && <SecNegociacao f={f} c={c} cor={cor} />}
      <SecCondicoes f={f} c={c} registrar={reg} primeiro={!c.proc} />
      <SecPartesCom f={f} c={c} registrar={reg} />
      <SecOfertas f={f} c={c} registrar={reg} />
      <SecCorretores f={f} c={c} />
      {c.proc && <SecPropostas f={f} c={c} />}
      {c.proc && <SecReunioes f={f} c={c} />}
      {janela && <JanelaOferta f={f} corretores={c.corretores} fechar={() => setJanela(false)} />}
    </div>
  );
}
