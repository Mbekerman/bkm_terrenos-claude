/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { mudou, comRasc, useGuardarRasc, apagarRasc, LimparRasc } from '../components/Rascunho';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, mensagemErro } from '../lib/supabase';
import { EscolherCorretor } from '../components/Corretor';
import { useTratativa } from './Tratativa';
import { useSessao } from '../lib/sessao';
import { Dialogo, useToast } from '../components/ui';
import { Adorno } from '../lib/mascara';
import { finTxt, fisTxt, modDe, modProposta, resumoMod, type Modalidades } from '../lib/modalidades';
import { Ic } from '../components/Moldura';
import { data as fd, diasEntre, hojeISO, milhoes, m2, somarDias } from '../lib/format';
import type { Ficha, R } from './dados';
import Temperatura from './Temperatura';
import { lerNum, num, Quadro, abrirQuadro, abrirQuadroJa, focar, usePedido, Vivo } from './edicao';
import { copias, daParte, fracao, ptArea, useLotes, type Lotes } from './Partes';
import { useRentabilidade } from '../viab/Viabilidade';
import { ComMencoes, MarcarPessoas, TextoMencao, useGente, type Gente, type Marcado } from '../components/Marcar';

// Aba Comercial da ficha (proto.js › abaComercialFicha = abaGeral(t,'neg') + abaComercial + abaNegociacao; proto_lotes.js ›
// secPartesCom; proto_mod.js › secReunioes). Negociação, Condições pedidas com o pedido de cada parte (oferta_partes),
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

export interface Com { ofertas: R[]; ref: R | null; proc: R | null; tcor: R[]; corretores: R[]; props: R[]; reus: R[]; motivo: string | null; partes: R[] }

export function useComercial(f: Ficha) {
  const { empresa } = useSessao();
  return useQuery({
    queryKey: ['ficha-com', f.id, f.negId], enabled: !!empresa,
    queryFn: async (): Promise<Com> => {
      const neg = f.negId, nada = Promise.resolve({ data: null, error: null });
      const [of, ng, pr, tc, co, pp, ru, pt] = await Promise.all([
        supabase.from('ofertas').select('id,numero,vigente,criado_por,data_oferta,valor_pedido,permuta_fin_pct,permuta_fis_pct,permuta_fis_unidades,forma_pagamento_pedida,observacao_pagamento,aceita_permuta,validade,status,corretor_id,observacoes,criado_em,oferta_partes(parte_id,valor_pedido,permuta_fin_pct,permuta_fis_pct,permuta_fis_unidades,forma_pagamento,observacoes),oferta_corretores(id,corretor_id,criado_em)')
          .eq('terreno_id', f.id).order('data_oferta').order('criado_em'),
        neg ? supabase.from('negociacoes').select('oferta_referencia_id').eq('processo_id', neg).maybeSingle() : nada,
        neg ? supabase.from('processos').select('id,status,etapa_atual,subetapa_atual,subetapa_desde,motivo_encerramento,detalhe_encerramento').eq('id', neg).maybeSingle() : nada,
        supabase.from('terreno_corretores').select('corretor_id,principal').eq('terreno_id', f.id),
        supabase.from('corretores').select('id,apelido,creci,imobiliaria,ativo,pessoas(nome_razao_social)').eq('empresa_id', empresa!.id),
        neg ? supabase.from('propostas').select('*,proposta_partes(parte_id)').eq('processo_id', neg).order('versao') : nada,
        supabase.from('reunioes').select('*,reuniao_participantes(id,lado,nome,email,user_id,pessoa_id,pessoas(nome_razao_social))').eq('terreno_id', f.id).order('inicio', { ascending: false }),
        // todas as partes, também as tiradas do terreno: a proposta antiga pode ter sido feita a uma delas
        supabase.from('terreno_partes').select('id,nome,ativa,criado_em').eq('terreno_id', f.id).order('criado_em'),
      ]);
      for (const r of [of, ng, pr, tc, co, pp, ru, pt]) if (r.error) throw r.error;
      const ofertas = (of.data ?? []) as R[], proc = (pr.data as R) ?? null;
      const refId = (ng.data as R | null)?.oferta_referencia_id;
      /* a oferta ativa do terreno (pedido do Moises, 10/nov/2026); a de referência da negociação é ela */
      const ref = ofertas.find((o) => o.id === refId) ?? ofertas.find((o) => o.vigente)
        ?? ofertas.filter((o) => o.status === 'ativa').sort((a, b) => String(b.data_oferta).localeCompare(a.data_oferta))[0] ?? ofertas.find((o) => o.status !== 'aguardando') ?? null;
      let motivo: string | null = null;
      if (proc && ['perdido', 'descartado'].includes(proc.status) && proc.motivo_encerramento) {
        const m = await supabase.from('motivos_encerramento').select('nome').eq('status', proc.status).eq('codigo', proc.motivo_encerramento)
          .or(`empresa_id.eq.${empresa!.id},empresa_id.is.null`).order('empresa_id', { nullsFirst: false }).limit(1);
        motivo = (m.data as R[] | null)?.[0]?.nome ?? proc.motivo_encerramento;
      }
      const corretores = ((co.data ?? []) as R[]).map((c) => ({ ...c, nome: (c.pessoas?.nome_razao_social ?? '—') + (c.apelido ? ` (${c.apelido})` : '') })).sort((a, b) => a.nome.localeCompare(b.nome));
      return { ofertas, ref, proc, tcor: (tc.data ?? []) as R[], corretores, props: (pp.data ?? []) as R[], reus: (ru.data ?? []) as R[], motivo, partes: (pt.data ?? []) as R[] };
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

export function JanelaOferta({ f, fechar }: { f: Ficha; corretores?: R[]; partes?: R[]; fechar: () => void }) {
  /* Registrar oferta só com o corretor e a observação (pedido do Moises, 10/nov/2026): o valor pedido, a forma de
     pagamento e o resto vão em Condições pedidas, por parte; a data e os outros corretores, no card da oferta */
  const toast = useToast(), recarregar = useRecarregar();
  const OF0 = { cid: '', obs: '' }, kOf = `${f.id}:oferta2`;
  const [v, setV] = useState<Record<string, string>>(() => comRasc(kOf, OF0));
  const [grav, setGrav] = useState(false);
  const temOf = Object.values(v).some((x) => x.trim() !== '');
  useGuardarRasc(kOf, v, temOf);
  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (grav) return;
    setGrav(true);
    const { data, error } = await supabase.rpc('registrar_oferta', { p_terreno: f.id, p_valor: null, p_corretor: v.cid || null });
    if (!error && v.obs.trim()) {
      const r = await supabase.from('ofertas').update({ observacoes: v.obs.trim() }).eq('id', (data as R).oferta_id);
      if (r.error) toast(mensagemErro(r.error), true);
    }
    setGrav(false);
    if (error) { toast(mensagemErro(error), true); return; }
    recarregar();
    toast((data as R)?.negociacao_nova ? 'Oferta registrada. A negociação foi aberta.' : 'Oferta registrada.');
    apagarRasc(kOf);
    fechar();
  }
  return (
    <Dialogo titulo="Registrar oferta" onFechar={fechar} rodape={<><LimparRasc chave={kOf} mostrar={temOf} limpar={() => setV(OF0)} /><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form="f-of" disabled={grav}>Registrar</button></>}>
      <form id="f-of" onSubmit={enviar}><div className="fields">
        <div className="field full"><label htmlFor="o-c">Corretor</label><EscolherCorretor id="o-c" value={v.cid} onChange={(x) => setV((o) => ({ ...o, cid: x }))} /></div>
        <div className="field full"><label htmlFor="o-o">Observação sobre a oferta</label><textarea id="o-o" rows={4} placeholder="Impressões sobre o corretor, firmeza da proposta..." value={v.obs} onChange={(e) => setV((o) => ({ ...o, obs: e.target.value }))} /></div>
      </div></form>
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
        <div className="kv"><dt>Temperatura</dt><dd><Temperatura f={f} pode={edita} /></dd></div>
        {lin('Última proposta', lp ? `${resumoMod(modProp(lp), milhoes)} · ${lp.origem === 'bkm' ? 'BKM' : 'Vendedor'} · ${ST_PROP[lp.status]}` : '')}
        {lin('Próxima reunião', pr ? `${fd(pr.inicio)} · ${new Date(pr.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '')}
      </dl></div>
    </Quadro>
  );
}

/* ---------- Condições pedidas (a oferta de referência; editar muda essa oferta) ----------
   Um quadro só com as partes (pedido do Moises, 10/nov/2026: "Condições pedidas" e "Partes" eram o resumo um do outro).
   O valor pedido nunca se digita no total: cada parte tem o seu e o topo é a soma, em blocos de resumo; com uma parte só,
   o valor dela é o da oferta. Corretor, permuta e observação são da oferta, uma vez só. Cada campo grava ao sair dele ou
   ao escolher (pedido do Moisés, 6/nov/2026). */
/* ---------- Partes: o pedido de cada parte na oferta de referência ---------- */
/* as matrículas da parte em etiquetas que não se tiram, cada uma abrindo a janela com os SQLs dela, a área e o percentual
   da parte (pedido do Moises, 10/nov/2026: só as matrículas, sem os SQLs na linha) */
const pctTxt = (fr: { f: number; est: boolean }) => { const p = Math.round(fr.f * 1000) / 10; return `${num(p, p % 1 ? 1 : 0)}%${fr.est ? ' (estimado)' : ''}`; };
function MatsParte({ L, pid, rot }: { L: Lotes; pid: string; rot: string }) {
  const [ab, setAb] = useState<string | null>(null);
  const ms = daParte(L, 'm', pid);
  if (!ms.length) return <div className="faint">sem matrícula</div>;
  const e = ms.find((m) => m.c.id === ab);
  return (
    <div className="ptcom-mats">
      {ms.map(({ x, c }) => {
        const fr = fracao(L, 'm', c), pz = Math.round(fr.f * 1000) / 10;
        return (
          <span key={c.id} className="etq m">
            <span className={`etq-pz${fr.est ? ' est' : ''}`} style={{ '--p': pz, marginLeft: 8 } as any} aria-hidden="true" />
            <button type="button" className="etq-n num" title={`Matrícula ${x.numero} · ${pctTxt(fr)} desta parte · clique para ver`} onClick={() => setAb(c.id)}>{x.numero}</button>
          </span>
        );
      })}
      {e && <JanelaMat L={L} x={e.x} c={e.c} rot={rot} fechar={() => setAb(null)} />}
    </div>
  );
}
function JanelaMat({ L, x, c, rot, fechar }: { L: Lotes; x: R; c: R; rot: string; fechar: () => void }) {
  const fr = fracao(L, 'm', c), area = x.area_registrada_m2 != null ? +x.area_registrada_m2 : null;
  const parte = L.partes.find((pa) => pa.id === c.parte_id)?.nome ?? '';
  const outras = copias(L, 'm', x.id).filter((y) => y.id !== c.id && y.parte_id).map((y) => L.partes.find((pa) => pa.id === y.parte_id)?.nome).filter(Boolean);
  /* os SQLs que estão nesta matrícula, nesta parte: área × % do SQL × % da matrícula, como a área da parte */
  const sqls = L.ci.filter((y) => y.matricula_parte_id === c.id).map((y) => ({ i: L.insc.find((z) => z.id === y.inscricao_id), y })).filter((s) => s.i) as { i: R; y: R }[];
  const linhas = sqls.map(({ i, y }) => {
    const fs = fracao(L, 's', y), a = i.area_cadastral_m2 != null ? +i.area_cadastral_m2 : null;
    return { i, fs, a, ap: a != null ? Math.round(a * fs.f * fr.f * 100) / 100 : null };
  });
  const totA = linhas.length && linhas.every((l) => l.ap != null) ? linhas.reduce((s, l) => s + l.ap!, 0) : null;
  return (
    <Dialogo titulo={`Matrícula ${x.numero}`} sub={[parte, x.cartorio].filter(Boolean).join(' · ')} onFechar={fechar}>
      <div className="ptm-dlg">
        <dl className="kvl">
          <div className="kv"><dt>Área registrada</dt><dd>{area != null ? m2(area) : <span className="ni">Não informada</span>}</dd></div>
          <div className="kv"><dt>Percentual da parte na matrícula</dt><dd>{pctTxt(fr)}</dd></div>
          <div className="kv"><dt>Área da parte na matrícula</dt><dd><b>{area != null ? m2(Math.round(area * fr.f * 100) / 100) : '—'}</b></dd></div>
          {outras.length > 0 && <div className="kv"><dt>Também em</dt><dd>{outras.join(', ')}</dd></div>}
        </dl>
        <h3 className="etq-h3">{rot === 'SQL' ? 'SQLs' : 'Inscrições'} nesta matrícula</h3>
        {!linhas.length ? <div className="muted">Nenhum {rot} dentro desta matrícula nesta parte.</div> : (
          <div className="tblwrap"><table className="mini-tbl"><thead><tr><th>{rot}</th><th className="r">Área do lote</th><th className="r">% da parte</th><th className="r">Área da parte</th></tr></thead><tbody>
            {linhas.map((l) => <tr key={l.i.id}><td><b>{l.i.inscricao}</b></td><td className="r">{l.a != null ? m2(l.a) : '—'}</td><td className="r">{pctTxt(l.fs)}</td><td className="r">{l.ap != null ? m2(l.ap) : '—'}</td></tr>)}
            {linhas.length > 1 && <tr><td><b>Total</b></td><td /><td /><td className="r"><b>{totA != null ? m2(Math.round(totA * 100) / 100) : '—'}</b></td></tr>}
          </tbody></table></div>)}
        {linhas.length > 0 && <div className="hint">Área da parte = área do lote × % da parte no lote × % da parte na matrícula.</div>}
      </div>
    </Dialogo>
  );
}

/** as colunas do pedido gravadas na oferta (uma parte) ou na linha da parte (várias) */
type Patch = Partial<Record<'valor_pedido' | 'permuta_fin_pct' | 'permuta_fis_pct' | 'permuta_fis_unidades', number | null>>;
const MODS = ['valor_pedido', 'permuta_fin_pct', 'permuta_fis_pct', 'permuta_fis_unidades'] as const;
const modProp = (p: R): Modalidades => modProposta(p);
const modRow = (x: R | null | undefined): Modalidades => modDe({ valor: x?.valor_pedido, fin: x?.permuta_fin_pct, fisPct: x?.permuta_fis_pct, fisUn: x?.permuta_fis_unidades });

/** campo de número que grava ao sair (Enter passa ao próximo); vazio = não informado */
function CampoNum({ valor, t, gravar, rot, id, ph }: { valor: number | null; t: 'pct' | 'un' | 'moeda'; gravar: (n: number | null) => void; rot: string; id?: string; ph?: string }) {
  const txt = (v: number | null) => (v == null ? '' : t === 'un' ? String(v) : numTxt(v));
  const [v, setV] = useState(txt(valor));
  useEffect(() => { setV(txt(valor)); }, [valor, t]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Adorno t={t}><input className="ptc-n" id={id} inputMode={t === 'un' ? 'numeric' : 'decimal'} data-fmt={t === 'un' ? undefined : t} value={v} placeholder={ph} aria-label={rot}
    onChange={(e) => setV(t === 'un' ? e.target.value.replace(/\D/g, '') : e.target.value)}
    onBlur={() => { const n = t === 'un' ? (v ? parseInt(v, 10) : null) : lerNum(v); if (n !== valor) gravar(n); }} /></Adorno>;
}

/** permuta física: em % ou em unidades, uma das duas (pedido do Moises, 11/nov/2026); trocar a unidade leva o número junto */
function CampoFisica({ m, gravar, rot }: { m: Modalidades; gravar: (p: Patch) => void; rot: string }) {
  const [un, setUn] = useState(m.fisPct == null);
  useEffect(() => { if (m.fisPct != null) setUn(false); else if (m.fisUn != null) setUn(true); }, [m.fisPct, m.fisUn]);
  const atual = un ? m.fisUn : m.fisPct;
  const trocar = (u: boolean) => {
    setUn(u);
    if (atual == null) return;
    gravar(u ? { permuta_fis_pct: null, permuta_fis_unidades: Math.max(1, Math.round(atual)) } : { permuta_fis_unidades: null, permuta_fis_pct: Math.min(100, atual) });
  };
  return (
    <div className="pfis">
      <CampoNum valor={atual} t={un ? 'un' : 'pct'} rot={`${rot} ${un ? 'em unidades' : 'em %'}`}
        gravar={(n) => gravar(un ? { permuta_fis_unidades: n, permuta_fis_pct: null } : { permuta_fis_pct: n, permuta_fis_unidades: null })} />
      <span className="seg pfis-seg" role="group" aria-label="Permuta física em">
        <button type="button" aria-pressed={!un} onClick={() => trocar(false)}>%</button>
        <button type="button" aria-pressed={un} onClick={() => trocar(true)}>Unid.</button>
      </span>
    </div>
  );
}

function LinhaParte({ o, pa, um, primeiro, area, zonas, nomeDet, mudar, gravarObs }: {
  o: R | null; pa: R; um: boolean; primeiro: boolean; area: number | null; zonas: string; nomeDet: ReactNode;
  mudar: (pa: R, p: Patch) => Promise<void>;
  gravarObs: (pa: R, v: string | null) => Promise<boolean>;
}) {
  const { edita } = useSessao();
  const op = o && !um ? (o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id) : null;
  const md = !o ? modRow(null) : um ? modRow(o) : modRow(op);
  const valor = md.din;
  // informações gerais da pedida desta parte nesta oferta; o texto da oferta (corretor, firmeza) é outro campo, no card da oferta
  const obs: string = (o ? (o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id)?.observacoes : null) ?? '';
  const [vv, setVv] = useState(numTxt(valor));
  const [vm, setVm] = useState(valor != null && area ? numTxt(Math.round(valor / area)) : '');
  useEffect(() => { setVv(numTxt(valor)); setVm(valor != null && area ? numTxt(Math.round(valor / area)) : ''); }, [valor, area]);
  const ro = !edita || !o;
  const L = (x: string) => <span className="lbl-f ptcom-ml">{x}</span>;
  const gravarValor = (n: number | null) => { if (n !== valor) mudar(pa, { valor_pedido: n }); };
  return (
    <div className="ptcom-r">
      <div className="ptcom-p"><b>{pa.nome}</b>{pa.pessoa_nome && <> <span className="faint">{pa.pessoa_nome}</span></>}{nomeDet}</div>
      <div className="ptcom-c ptcom-ar">{L(um ? 'Área adotada' : 'Área da parte')}<span>{area != null ? m2(Math.round(area * 100) / 100) : '—'}</span>{zonas && <span className="ptcom-zona" title="Zoneamento">{zonas}</span>}</div>
      <div className="ptcom-c field ptcom-v">{L('Dinheiro')}{ro ? <span>{valor != null ? brl(valor) : '—'}</span>
        : <Adorno t="moeda"><input className="ptc-n" id={primeiro ? 'c-valor' : undefined} inputMode="decimal" data-fmt="moeda" value={vv} aria-label={`Valor em dinheiro pedido por ${pa.nome}`}
          onChange={(e) => { setVv(e.target.value); const n = lerNum(e.target.value); setVm(n != null && area ? numTxt(Math.round(n / area)) : ''); }}
          onBlur={() => gravarValor(lerNum(vv))} /></Adorno>}</div>
      <div className="ptcom-c field ptcom-m">{L('Dinheiro por m²')}{ro ? <span>{valor != null && area ? brl(valor / area) : '—'}</span>
        : <Adorno t="moeda"><input className="ptc-n" inputMode="decimal" data-fmt="moeda" value={vm} placeholder={area ? 'por m²' : 'sem área'} disabled={!area} aria-label={`Valor por m² de ${pa.nome}`}
          onChange={(e) => { setVm(e.target.value); const n = lerNum(e.target.value); setVv(n != null && area ? numTxt(Math.round(n * area)) : ''); }}
          onBlur={() => { const n = lerNum(vm); gravarValor(n != null && area ? Math.round(n * area) : null); }} /></Adorno>}</div>
      <div className="ptcom-c field ptcom-fin">{L('Permuta financeira (% VGVL)')}{ro ? <span>{finTxt(md) ?? '—'}</span>
        : <CampoNum valor={md.fin} t="pct" rot={`Permuta financeira pedida por ${pa.nome}, em % do VGV líquido`} gravar={(n) => mudar(pa, { permuta_fin_pct: n })} />}</div>
      <div className="ptcom-c field ptcom-fis">{L('Permuta física')}{ro ? <span>{fisTxt(md) ?? '—'}</span>
        : <CampoFisica m={md} rot={`Permuta física pedida por ${pa.nome}`} gravar={(p) => mudar(pa, p)} />}</div>
      {/* informações gerais da parte nesta oferta: a composição das partes pode mudar de uma oferta para outra (pedido do Moises, 10/nov/2026) */}
      <div className="ptcom-c field ptcom-obs"><span className="lbl-f">Informações gerais</span>{ro ? <span>{obs || '—'}</span>
        : <Vivo ini={obs} gravar={(v) => (obs === v.trim() ? true : gravarObs(pa, v.trim() || null))}>
          {(p) => <textarea {...p} rows={2} placeholder="Entrada, prazos, o que mais este vendedor pediu nesta oferta" aria-label={`Informações gerais de ${pa.nome}`} />}
        </Vivo>}</div>
    </div>
  );
}

/* número que encolhe a fonte até caber no bloco (pedido do Moises, 10/nov/2026: até R$ 999.000.000,00) */
export function Cabe({ className, children }: { className: string; children: ReactNode }) {
  const r = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = r.current; if (!el) return;
    const ajustar = () => {
      el.style.fontSize = '';
      const max = parseFloat(getComputedStyle(el).fontSize) || 24;
      let t = max;
      while (t > 12 && el.scrollWidth > el.clientWidth) { t -= 1; el.style.fontSize = t + 'px'; }
    };
    ajustar();
    const ro = new ResizeObserver(ajustar); ro.observe(el);
    return () => ro.disconnect();
  });
  return <div ref={r} className={className}>{children}</div>;
}
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' e ' + xs[xs.length - 1]);

function SecCondicoes({ f, c, registrar, primeiro }: { f: Ficha; c: Com; registrar: () => void; primeiro: boolean }) {
  const { edita, empresa } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const L = useLotes(f).data;
  const qc = useQueryClient();
  const o = c.ref, ed = edita && !!o;
  /* "Valor pedido" do que falta na ficha: o valor da primeira parte; sem oferta, a janela de registrar oferta */
  /* "Corretor da oferta" (pedido do Moises, 10/nov/2026): o corretor da oferta ativa; sem oferta, o da janela */
  usePedido(['cond'], (pd) => {
    if (pd.campo === 'cid') { if (ed) { abrirQuadroJa('comercial', 'cond'); focar('c-cid'); } else if (edita) { registrar(); focar('o-c'); } return; }
    if (ed) { abrirQuadroJa('comercial', 'cond'); focar('c-valor'); } else if (edita) registrar();
  });
  const acoes = !o ? (edita ? <div className="sec-acoes"><button className="btn sm" onClick={registrar}><Ic n="add" s={16} />Registrar oferta</button></div> : undefined)
    : <span className="faint" style={{ fontSize: 12, marginLeft: 'auto' }}>oferta de {fd(o.data_oferta)}</span>;

  const P = L?.partes ?? [], um = P.length <= 1, rot = L?.base?.rotulo ?? 'Inscrição';
  // com uma parte só, ela é o terreno inteiro: vale a área adotada do terreno (sem ela, a das matrículas ou dos SQLs)
  const areaDe = (pid: string) => (um && f.area != null ? +f.area : L ? ptArea(L, pid).area : null);
  // zoneamento da parte, discreto embaixo da área (pedido do Moises, 10/nov/2026)
  const zonasDe = (pid: string) => (!L ? '' : [...new Set(daParte(L, 's', pid).map((e) => e.x).flatMap((i) => ((L.consultas[i.id]?.zonas ?? []) as R[]).map((z) => z.sigla)).filter(Boolean))].join(' / '));
  const valorDe = (pid: string): number | null => (!o ? null : um ? o.valor_pedido ?? null : (o.oferta_partes ?? []).find((x: R) => x.parte_id === pid)?.valor_pedido ?? null);
  /* cada modalidade grava sozinha; com várias partes, a oferta guarda a soma de cada uma (é o que a lista, o funil, os
     filtros e o Pipeline leem; pedido do Moises, 11/nov/2026) */
  async function mudar(pa: R, p: Patch) {
    if (!o) return;
    if (p.valor_pedido != null && p.valor_pedido <= 0) { toast('O valor pedido precisa ser maior que zero.', true); return; }
    if ((p.permuta_fin_pct != null && (p.permuta_fin_pct <= 0 || p.permuta_fin_pct > 100)) || (p.permuta_fis_pct != null && (p.permuta_fis_pct <= 0 || p.permuta_fis_pct > 100))) {
      toast('O percentual vai de 0 a 100.', true); return;
    }
    if (p.permuta_fis_unidades != null && p.permuta_fis_unidades <= 0) { toast('Informe ao menos uma unidade.', true); return; }
    let error;
    if (um) ({ error } = await supabase.from('ofertas').update(p).eq('id', o.id));
    else {
      const ant = (o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id) ?? {};
      const nv = { ...Object.fromEntries(MODS.map((k) => [k, ant[k] ?? null])), ...p };
      if (MODS.every((k) => nv[k] == null) && !ant.observacoes) ({ error } = await supabase.from('oferta_partes').delete().eq('oferta_id', o.id).eq('parte_id', pa.id));
      else ({ error } = await supabase.from('oferta_partes').upsert({ oferta_id: o.id, parte_id: pa.id, empresa_id: empresa!.id, ...p }));
      if (!error) {
        const linhas = P.map((x) => (x.id === pa.id ? nv : (o.oferta_partes ?? []).find((y: R) => y.parte_id === x.id) ?? {}));
        const soma: Patch = {};
        for (const k of MODS) {
          const vs = linhas.map((l: R) => l[k]).filter((v: unknown) => v != null).map(Number);
          soma[k] = vs.length ? vs.reduce((a, b) => a + b, 0) : null;
          if ((k === 'permuta_fin_pct' || k === 'permuta_fis_pct') && soma[k] != null) soma[k] = Math.min(100, soma[k]!);
        }
        if (MODS.some((k) => soma[k] !== (o[k] == null ? null : +o[k]))) ({ error } = await supabase.from('ofertas').update(soma).eq('id', o.id));
      }
    }
    if (error) { toast(error.message, true); return; }
    recarregar();
    qc.invalidateQueries({ queryKey: ['ficha-lotes', f.id] });
  }
  async function gravarObs(pa: R, v: string | null) {
    if (!o) return false;
    let error;
    /* sempre na linha da parte na oferta, também com uma parte só (o texto da oferta é outro dado) */
    const op = (o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id);
    if (!v && op && MODS.every((k) => op[k] == null)) ({ error } = await supabase.from('oferta_partes').delete().eq('oferta_id', o.id).eq('parte_id', pa.id));
    else ({ error } = await supabase.from('oferta_partes').upsert({ oferta_id: o.id, parte_id: pa.id, empresa_id: empresa!.id, observacoes: v }));
    if (error) { toast(error.message, true); return false; }
    recarregar();
    return true;
  }
  const vs = P.map((pa) => valorDe(pa.id));
  const vT = vs.some((v) => v != null) ? vs.reduce<number>((s, v) => s + (+(v ?? 0)), 0) : null;
  const aCom = P.filter((_, i) => vs[i] != null).reduce((s, pa) => s + (areaDe(pa.id) || 0), 0);
  // parte "com pedido" = com alguma modalidade (dinheiro ou permuta)
  const mds = P.map((pa) => (!o ? modRow(null) : um ? modRow(o) : modRow((o.oferta_partes ?? []).find((x: R) => x.parte_id === pa.id))));
  const comPed = mds.map((x) => x.din != null || x.fin != null || x.fisPct != null || x.fisUn != null);
  const nCom = comPed.filter(Boolean).length;
  const soma = (k: keyof Modalidades) => { const xs = mds.map((x) => x[k]).filter((v): v is number => v != null); return xs.length ? xs.reduce((a, b) => a + b, 0) : null; };
  const mT: Modalidades = { din: vT, fin: soma('fin'), fisPct: soma('fisPct'), fisUn: soma('fisUn') };
  const permT = [finTxt(mT), fisTxt(mT)].filter(Boolean).join(' · ');
  const aT = P.reduce((s, pa) => s + (areaDe(pa.id) || 0), 0);
  // valor antigo, gravado para o terreno inteiro antes de existir o valor por parte
  const antigo = !um && o && vT == null && o.valor_pedido ? +o.valor_pedido : null;
  const total = vT ?? antigo;
  const porM2 = vT != null ? (aCom ? vT / aCom : null) : antigo && f.area ? antigo / +f.area : null;
  const Lb = (x: string) => <span className="lbl-f ptcom-ml">{x}</span>;
  return (
    <Quadro aba="comercial" id="cond" primeiro={primeiro} titulo="Condições pedidas" acoes={acoes}>
      <div className="sec-b">{o ? <>
        <div className="cond-resw"><div className="cond-res">
          <div className="cond-b"><div className="lbl">{um ? 'Em dinheiro' : 'Em dinheiro, total'}</div><Cabe className="big">{total != null ? brl(total) : ni('—')}</Cabe></div>
          <div className="cond-b"><div className="lbl">Dinheiro por m²</div><Cabe className="big">{porM2 != null ? brl(porM2) : ni('—')}</Cabe>
            {!um && vT != null && vs.some((v) => v == null) && aCom > 0 && <div className="cond-sub">sobre {m2(Math.round(aCom * 100) / 100)} com valor</div>}</div>
          <div className="cond-b"><div className="lbl">Em permuta{!um ? ', total' : ''}</div><Cabe className="big">{permT || ni('—')}</Cabe></div>
        </div></div>
        {!um && nCom < P.length && antigo == null && <div className="cond-aviso"><Ic n="warn" s={16} />Falta o pedido {P.length - nCom === 1 ? 'de' : 'das partes'} {lista(P.filter((_, i) => !comPed[i]).map((x) => x.nome))}.</div>}
        {antigo != null && <div className="cond-aviso">O valor de {brl(antigo)} foi registrado para o terreno inteiro. Informe o valor de cada parte abaixo; o total passa a ser a soma delas.</div>}
        {L && <div className="ptcom cond-pt">
          <div className="ptcom-r ptcom-th"><span>{um ? 'Parte' : 'Por parte'}</span><span>{um ? 'Área adotada' : 'Área da parte'}</span><span>Dinheiro</span><span>Dinheiro por m²</span><span>Permuta financeira</span><span>Permuta física</span></div>
          {P.map((pa, i) => <LinhaParte key={pa.id} gravarObs={gravarObs} o={o} pa={pa} um={um} primeiro={i === 0} area={areaDe(pa.id)} zonas={zonasDe(pa.id)} nomeDet={<MatsParte L={L} pid={pa.id} rot={rot} />} mudar={mudar} />)}
          {!um && (
            <div className="ptcom-r ptcom-tot"><div className="ptcom-p"><b>Total</b></div><div className="ptcom-c">{Lb('Área da parte')}<span>{aT ? m2(Math.round(aT * 100) / 100) : '—'}</span></div>
              <div className="ptcom-c">{Lb('Dinheiro')}<span>{vT != null ? brl(vT) : '—'}</span></div>
              <div className="ptcom-c">{Lb('Dinheiro por m²')}<span>{vT != null && aCom ? brl(vT / aCom) : '—'}</span></div>
              <div className="ptcom-c">{Lb('Permuta financeira')}<span>{finTxt(mT) ?? '—'}</span></div>
              <div className="ptcom-c">{Lb('Permuta física')}<span>{fisTxt(mT) ?? '—'}</span></div></div>
          )}
        </div>}
        {ed && <div className="hint">{um ? 'Preencha só o que foi pedido: dinheiro (ou dinheiro por m², calculado pela área adotada), permuta financeira em % do VGV líquido e permuta física em % ou em unidades.' : 'Preencha só o que cada parte pediu: dinheiro (ou por m², pela área da parte), permuta financeira em % do VGV líquido e permuta física em % ou em unidades. O total é a soma das partes.'}</div>}
      </> : <div className="muted">Nenhuma oferta registrada.</div>}</div>
    </Quadro>
  );
}

/* ---------- Ofertas recebidas ---------- */
// Lista (pedido do Moises, 10/nov/2026): ativa ou não, data, área cadastral do terreno e corretor, e o "i" que abre o card
// da oferta. A oferta que espera a tratativa vencer só aparece para quem a cadastrou e para o diretor.
const corretoresDe = (o: R, c: Com): R[] => [...(o.oferta_corretores ?? [])]
  .sort((a: R, b: R) => (a.corretor_id === o.corretor_id ? -1 : b.corretor_id === o.corretor_id ? 1 : String(a.criado_em).localeCompare(b.criado_em)))
  .map((x: R) => ({ ...x, c: c.corretores.find((y) => y.id === x.corretor_id) }));

/** o "i" do card da oferta */
const IcInfo = () => <svg className="ic" viewBox="0 0 24 24" width={18} height={18} aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" d="M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM12 11v5M12 7.6v.01" /></svg>;

function SecOfertas({ f, c, registrar }: { f: Ficha; c: Com; registrar: () => void }) {
  const { edita, session, membro } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const eu = session?.user.id, dir = membro?.papel === 'diretor', resp = f.t.responsavel_id === eu;
  const os = c.ofertas.filter((o) => o.status !== 'aguardando' || o.criado_por === eu || dir)
    .sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0) || String(a.criado_em).localeCompare(b.criado_em));
  const trat = useTratativa(f.id);
  const [card, setCard] = useState<string | null>(null);
  const temObs = (o: R) => !!o.observacoes || (o.oferta_partes ?? []).some((x: R) => x.observacoes);
  const nomeParte = (id: string) => c.partes.find((p) => p.id === id)?.nome ?? 'Parte';
  const aCad = f.t.area_cadastral_m2 != null ? +f.t.area_cadastral_m2 : null;
  async function ativa(o: R) {
    const { error } = await supabase.rpc('definir_oferta_vigente', { p_oferta: o.id });
    if (error) toast(mensagemErro(error), true); else { toast(`Oferta ${f.codigo}-${o.numero} é a ativa.`); recarregar(); }
  }
  async function assumir(o: R) {
    const { error } = await supabase.rpc('assumir_oferta', { p_oferta: o.id });
    if (error) toast(mensagemErro(error), true); else { toast(`Você assumiu o ${f.codigo}: a oferta ${f.codigo}-${o.numero} é a ativa.`); recarregar(); trat.refetch(); }
  }
  const aberta = os.find((o) => o.id === card);
  return (
    <Quadro aba="comercial" id="ofertas" chip="Ofertas" titulo={<>Ofertas recebidas{os.length ? <> <span className="h-n">{os.length}</span></> : null}</>}
      acoes={edita ? <button className="btn sm" onClick={registrar}><Ic n="add" s={16} />Registrar oferta</button> : undefined}>
      <div className="sec-b">{os.length ? (
        <div className="tblwrap"><table className="mini-tbl"><thead><tr><th>Oferta</th><th>Situação</th><th>Data</th><th className="r">Área cadastral</th><th>Corretor</th><th /><th /></tr></thead><tbody>
          {os.map((o) => {
            const cs = corretoresDe(o, c);
            const pode = (trat.data?.aguardando ?? []).find((x: R) => x.id === o.id)?.pode_assumir;
            return (
              <tr key={o.id} className={o.vigente ? 'of-ativa' : undefined}>
                <td className="nw num">{f.codigo}-{o.numero}</td>
                <td className="nw">{o.vigente ? <span className="chip good">Ativa</span> : o.status === 'aguardando' ? <span className="chip warn">Aguardando</span> : <span className="chip">Não ativa</span>}</td>
                <td className="nw">{fd(o.data_oferta)}</td>
                <td className="r nw">{aCad != null ? m2(aCad) : '—'}</td>
                <td>{cs.length ? cs.map((x) => <div key={x.id}>{x.c?.nome ?? '—'}</div>) : 'Direto'}</td>
                <td className="r nw">{o.vigente ? null
                  : o.status === 'aguardando' ? (pode ? <button className="btn sm" onClick={() => assumir(o)}>Assumir</button> : <span className="faint" style={{ fontSize: 12 }}>Até a tratativa vencer</span>)
                  : edita && (resp || dir) && o.status === 'ativa' ? <button className="btn sm text of-ref" onClick={() => ativa(o)}>Marcar como ativa</button> : null}</td>
                <td className="r"><button className="iconbtn sm" title="Card da oferta" aria-label={`Card da oferta ${f.codigo}-${o.numero}`} onClick={() => setCard(o.id)}><IcInfo /></button></td>
              </tr>
            );
          })}
        </tbody></table></div>
      ) : <div className="muted">Nenhuma oferta.</div>}
      {/* o diretor vê as observações de todas as ofertas do terreno juntas (pedido do Moises, 10/nov/2026) */}
      {dir && os.some(temObs) && <div className="of-obs-todas">
        <div className="of-t">Observações das ofertas</div>
        {os.filter(temObs).sort((a, b) => (b.numero ?? 0) - (a.numero ?? 0)).map((o) => (
          <div key={o.id} className="of-obs"><div className="of-obs-h"><b className="num">{f.codigo}-{o.numero}</b> · {fd(o.data_oferta)}{o.vigente && <span className="chip good sm">Ativa</span>}</div>
            {o.observacoes && <div className="of-obs-t">{o.observacoes}</div>}
            {/* e as informações gerais da pedida de cada parte, com o nome dela (oferta_partes.observacoes, #318) */}
            {(o.oferta_partes ?? []).filter((x: R) => x.observacoes).map((x: R) => (
              <div key={x.parte_id} className="of-obs-p"><span className="of-obs-pn">{nomeParte(x.parte_id)}</span><span className="of-obs-t">{x.observacoes}</span></div>
            ))}</div>
        ))}
      </div>}</div>
      {aberta && <CardOferta f={f} c={c} o={aberta} fechar={() => setCard(null)} />}
    </Quadro>
  );
}

/* Card da oferta (pedido do Moises, 10/nov/2026): data, corretores, os lotes do terreno com a área de cada um e o total
   (só leitura: mudam com os SQLs incluídos ou tirados no terreno) e as observações; quem edita muda na hora. */
function CardOferta({ f, c, o, fechar }: { f: Ficha; c: Com; o: R; fechar: () => void }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const L = useLotes(f).data;
  const [novo, setNovo] = useState('');
  const ed = edita && o.status !== 'aguardando';
  const cs = corretoresDe(o, c);
  const sp = !f.municipio || /^São Paulo$/i.test(f.municipio);
  const ins = L?.insc ?? [];
  const soma = ins.length && ins.every((i) => i.area_cadastral_m2 != null) ? ins.reduce((t, i) => t + +i.area_cadastral_m2, 0) : null;
  const aCad = f.t.area_cadastral_m2 != null ? +f.t.area_cadastral_m2 : soma;
  async function gravar(d: R) {
    const { error } = await supabase.from('ofertas').update(d).eq('id', o.id);
    if (error) { toast(mensagemErro(error), true); return false; }
    recarregar(); toast('Salvo.'); return true;
  }
  async function por(cid: string) {
    setNovo('');
    if (!cid || cs.some((x) => x.corretor_id === cid)) return;
    const { error } = await supabase.from('oferta_corretores').insert({ oferta_id: o.id, corretor_id: cid, empresa_id: f.t.empresa_id });
    if (error) toast(mensagemErro(error), true); else { recarregar(); toast('Corretor incluído na oferta.'); }
  }
  async function tirar(x: R) {
    const { error } = await supabase.from('oferta_corretores').delete().eq('id', x.id);
    if (error) toast(mensagemErro(error), true); else { recarregar(); toast(`${x.c?.nome ?? 'Corretor'} tirado da oferta.`); }
  }
  return (
    <Dialogo titulo={`Oferta ${f.codigo}-${o.numero}`} sub={o.vigente ? 'Oferta ativa' : o.status === 'aguardando' ? 'Aguardando a tratativa vencer' : 'Não ativa'} onFechar={fechar}
      rodape={<button className="btn primary" onClick={fechar}>Concluir</button>}>
      <div className="of-card">
        <div className="field"><label htmlFor="of-data">Data da oferta</label>{ed
          ? <Vivo ini={o.data_oferta ?? ''} imediato gravar={(v) => (v && v !== o.data_oferta ? gravar({ data_oferta: v }) : true)}>{(p) => <input id="of-data" type="date" max={hojeISO()} {...p} />}</Vivo>
          : <span>{fd(o.data_oferta)}</span>}</div>

        <div className="of-bl"><div className="of-t">Corretores</div>
          {cs.length ? <ul className="of-cor">{cs.map((x, i) => (
            <li key={x.id}><div><b>{x.c?.nome ?? '—'}</b>{i === 0 && cs.length > 1 && <span className="chip sm">principal</span>}
              <div className="faint" style={{ fontSize: 12 }}>{[x.c?.imobiliaria, x.c?.creci && `Creci ${x.c.creci}`].filter(Boolean).join(' · ')}</div></div>
              {ed && <button className="iconbtn sm" title="Tirar da oferta" aria-label={`Tirar ${x.c?.nome ?? 'corretor'} da oferta`} onClick={() => tirar(x)}><Ic n="close" s={16} /></button>}</li>
          ))}</ul> : <div className="muted">Direto, sem corretor.</div>}
          {ed && <div className="field of-add"><label htmlFor="of-cor">Adicionar corretor</label><EscolherCorretor id="of-cor" value={novo} vazio="Escolha o corretor" onChange={por} /></div>}
        </div>

        <div className="of-bl"><div className="of-t">Lotes</div>
          {!L ? <div className="muted">Carregando…</div> : ins.length ? (
            <table className="mini-tbl"><thead><tr><th>{sp ? 'SQL' : 'Inscrição'}</th><th className="r">Área cadastral</th></tr></thead><tbody>
              {ins.map((i) => <tr key={i.id}><td className="num">{i.inscricao}</td><td className="r">{i.area_cadastral_m2 != null ? m2(+i.area_cadastral_m2) : '—'}</td></tr>)}
              <tr className="of-tot"><td><b>Área total</b></td><td className="r"><b>{aCad != null ? m2(aCad) : '—'}</b></td></tr>
            </tbody></table>
          ) : <div className="muted">Nenhum {sp ? 'SQL' : 'lote'} no terreno. Os lotes entram pela aba Terreno.</div>}
        </div>

        <div className="field"><label htmlFor="of-obs">Observações</label>{ed
          ? <Vivo ini={o.observacoes ?? ''} gravar={(v) => ((o.observacoes ?? '') === v.trim() ? true : gravar({ observacoes: v.trim() || null }))}>{(p) => <textarea id="of-obs" rows={4} placeholder="Impressões sobre o corretor, firmeza da proposta..." {...p} />}</Vivo>
          : <span style={{ whiteSpace: 'pre-wrap' }}>{o.observacoes || '—'}</span>}</div>
      </div>
    </Dialogo>
  );
}

/* ---------- Propostas ---------- */
// Partes da proposta (pedidos do Moises, 9/nov/2026): de uma a todas as partes ativas; com uma parte só ela já vem marcada,
// com mais de uma nasce em branco e não registra sem escolher. Nenhuma proposta mexe em outra: com duas ou mais em aberto e
// parte em comum (a antiga, sem parte, conta como de todas), o quadro avisa e quem edita decide (status de qualquer uma,
// excluir uma ou deixar as duas). Nos resumos do terreno vale a última feita.
const ptsDe = (p: R): string[] => (p.proposta_partes ?? []).map((x: R) => x.parte_id);
const cruzam = (a: string[], b: string[]) => !a.length || !b.length || a.some((x) => b.includes(x));
const ABERTA = ['rascunho', 'apresentada', 'em_analise'];

function SecPropostas({ f, c }: { f: Ficha; c: Com }) {
  const { edita } = useSessao();
  const rent = useRentabilidade(f);
  const toast = useToast(), recarregar = useRecarregar();
  const ativa = c.proc?.status === 'ativo';
  const [form, setForm] = useState(false);
  const hoje = hojeISO();
  const [v, setV] = useState<Record<string, string>>({});
  const [grav, setGrav] = useState(false);
  const [ini, setIni] = useState<Record<string, string>>({});
  const kPr = `${f.id}:proposta`;
  const ativas = c.partes.filter((x) => x.ativa), nomeParte = (id: string) => c.partes.find((x) => x.id === id)?.nome ?? 'Parte';
  const [errPt, setErrPt] = useState(false);
  const abrir = () => {
    const o = { origem: 'bkm', valor: '', fin: '', fis: '', fisModo: 'pct', finMin: '', fisMin: '', status: 'apresentada', data: hoje, dias: '15', validade: somarDias(hoje, 15), cond: '', partes: ativas.length === 1 ? ativas[0].id : '' };
    const r = comRasc(kPr, o);
    r.partes = (r.partes ?? '').split(',').filter((id: string) => ativas.some((x) => x.id === id)).join(',') || o.partes; // rascunho com parte que saiu
    setV(r); setIni(o); setErrPt(false); abrirQuadro('comercial', 'propostas'); setForm(true);
  };
  const sel = (v.partes ?? '').split(',').filter(Boolean);
  // área total da proposta (pedido do Moises, 10/nov/2026): soma das áreas das partes marcadas, a mesma do quadro Partes
  // (Σ área do SQL × % do SQL × % da matrícula; senão a das matrículas); com uma parte só, a área adotada do terreno
  const L = useLotes(f).data;
  const areaPt = (id: string) => (ativas.length === 1 && f.area != null ? +f.area : L ? ptArea(L, id).area : null);
  const semArea = sel.filter((id) => areaPt(id) == null);
  const areaSel = sel.length > semArea.length ? sel.reduce((s, id) => s + (areaPt(id) ?? 0), 0) : null;
  const valorSel = lerNum(v.valor ?? '');
  const marcar = (id: string) => { setErrPt(false); setV((x) => { const a = (x.partes ?? '').split(',').filter(Boolean); return { ...x, partes: (a.includes(id) ? a.filter((y) => y !== id) : [...a, id]).join(',') }; }); };
  const fref = useRef<HTMLFormElement>(null);
  const sujoPr = form && mudou(v, ini);
  useGuardarRasc(kPr, v, sujoPr);
  const m = (k: string) => (ev: { target: { value: string } }) => setV((x) => ({ ...x, [k]: ev.target.value }));
  /* dias de validade: o digitado ou, sem ele (rascunho antigo), a diferença entre as datas */
  const diasVal = (x: R): number | null => x.dias != null && x.dias !== '' ? +x.dias
    : x.dias === '' ? null : x.data && x.validade ? Math.max(0, diasEntre(x.data, x.validade)) : null;
  const n = c.props.length;
  async function enviar(ev: FormEvent) {
    ev.preventDefault();
    if (!sel.length) {
      setErrPt(true); toast('Falta escolher para qual parte é a proposta.', true);
      document.getElementById('pp-pt')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return;
    }
    // as mesmas modalidades da pedida (pedido do Moises, 11/nov/2026); a forma de pagamento sai delas no banco
    const valor = lerNum(v.valor ?? ''), fin = lerNum(v.fin ?? ''), fisN = v.fisModo === 'un' ? (v.fis ? parseInt(v.fis, 10) : null) : lerNum(v.fis ?? '');
    // mínimos garantidos (pedido do Moises, 11/nov/2026): só valem com a modalidade deles
    const finMin = fin != null ? lerNum(v.finMin ?? '') : null;
    const fisMinUn = fisN != null && v.fisModo !== 'un' && v.fisMin ? parseInt(v.fisMin, 10) : null;
    if ((finMin != null && finMin <= 0) || (fisMinUn != null && fisMinUn <= 0)) { toast('Os mínimos garantidos precisam ser maiores que zero.', true); return; }
    if (valor == null && fin == null && fisN == null) { toast('Informe o valor em dinheiro ou alguma permuta.', true); return; }
    if ((valor != null && valor <= 0) || (fin != null && (fin <= 0 || fin > 100)) || (fisN != null && (fisN <= 0 || (v.fisModo !== 'un' && fisN > 100)))) {
      toast('Confira os valores: dinheiro maior que zero e percentuais de 0 a 100.', true); return;
    }
    setGrav(true);
    const { error } = await supabase.rpc('registrar_proposta', {
      p_processo: f.negId, p_origem: v.origem, p_valor: valor, p_forma: null, p_condicoes: (v.cond ?? '').trim() || null,
      p_data_apresentacao: v.data || null, p_validade: v.validade || null, p_status: v.status, p_partes: sel,
      p_permuta_fin_pct: fin, p_permuta_fis_pct: v.fisModo === 'un' ? null : fisN, p_permuta_fis_unidades: v.fisModo === 'un' ? fisN : null,
      p_permuta_fin_minimo: finMin, p_permuta_fis_min_unidades: fisMinUn,
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
  async function excluir(p: R) {
    if (!confirm(`Excluir a proposta v${p.versao} (${[p.valor_total != null ? brl(p.valor_total) : null, finTxt(modProp(p)), fisTxt(modProp(p))].filter(Boolean).join(' + ')})? Ela some da lista; o registro fica nos Logs.`)) return;
    const { error } = await supabase.rpc('excluir_proposta', { p_proposta: p.id });
    if (error) { toast(error.message, true); return; }
    recarregar();
    toast(`Proposta v${p.versao} excluída.`);
  }
  const chain = c.props.slice().reverse();
  const abertas = chain.filter((p) => ABERTA.includes(p.status));
  const nomesDe = (ids: string[]) => (ids.length ? ids.map(nomeParte).join(', ') : 'parte não informada');
  // grupos de propostas em aberto com parte em comum (cada par que se cruza)
  const sobre: { vs: number[]; partes: string }[] = [];
  abertas.forEach((a, i) => abertas.slice(i + 1).forEach((b) => {
    if (!cruzam(ptsDe(a), ptsDe(b))) return;
    const comuns = ptsDe(a).length && ptsDe(b).length ? ptsDe(a).filter((x) => ptsDe(b).includes(x)) : (ptsDe(a).length ? ptsDe(a) : ptsDe(b));
    sobre.push({ vs: [b.versao, a.versao], partes: nomesDe(comuns) });
  }));
  // no formulário: abertas que já cobrem alguma das partes escolhidas
  const jaAbertas = sel.length ? abertas.filter((p) => cruzam(ptsDe(p), sel)) : [];
  return (
    <Quadro aba="comercial" id="propostas" titulo="Propostas"
      acoes={<span className="sec-acoes">{ativa && edita && !form && <button className="btn primary sm" onClick={abrir}><Ic n="add" s={16} />Nova proposta</button>}</span>}>
      <div className="sec-b">
        {form && (
          <form ref={fref} onSubmit={enviar} className="prop-form">
            <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 500 }}>Nova proposta · v{n + 1}</h3>
            <div className="pp-grid">
              <div className="field"><label htmlFor="pp-o">Origem</label><select id="pp-o" value={v.origem} onChange={m('origem')}><option value="bkm">BKM</option><option value="vendedor">Vendedor</option></select></div>
              <div className="field"><label htmlFor="pp-v">Dinheiro</label><Adorno t="moeda"><input id="pp-v" inputMode="decimal" data-fmt="moeda" value={v.valor} onChange={m('valor')} /></Adorno></div>
              <div className="field"><label htmlFor="pp-fin">Permuta financeira (% VGVL)</label><Adorno t="pct"><input id="pp-fin" inputMode="decimal" data-fmt="pct" value={v.fin ?? ''} onChange={m('fin')} /></Adorno></div>
              {lerNum(v.fin ?? '') != null
                ? <div className="field"><label htmlFor="pp-fmin">Mínimo garantido (opcional)</label><Adorno t="moeda"><input id="pp-fmin" inputMode="decimal" data-fmt="moeda" value={v.finMin ?? ''} onChange={m('finMin')} /></Adorno></div>
                : <div className="pp-vazio" />}
              <div className="field"><label htmlFor="pp-s">Status</label><select id="pp-s" value={v.status} onChange={m('status')}><option value="apresentada">Apresentada</option><option value="em_analise">Em análise</option><option value="rascunho">Rascunho</option></select></div>
              <div className="pp-vazio" />
              <div className="field"><label htmlFor="pp-fis">Permuta física</label><div className="pfis">
                <Adorno t={v.fisModo === 'un' ? 'un' : 'pct'}><input id="pp-fis" inputMode={v.fisModo === 'un' ? 'numeric' : 'decimal'} data-fmt={v.fisModo === 'un' ? undefined : 'pct'} value={v.fis ?? ''}
                  onChange={(e) => setV((x) => ({ ...x, fis: x.fisModo === 'un' ? e.target.value.replace(/\D/g, '') : e.target.value }))} /></Adorno>
                <span className="seg pfis-seg" role="group" aria-label="Permuta física em">
                  <button type="button" aria-pressed={v.fisModo !== 'un'} onClick={() => setV((x) => ({ ...x, fisModo: 'pct' }))}>%</button>
                  <button type="button" aria-pressed={v.fisModo === 'un'} onClick={() => setV((x) => ({ ...x, fisModo: 'un', fis: (x.fis ?? '').replace(/\D.*$/, '') }))}>Unid.</button>
                </span></div></div>
              {v.fisModo !== 'un' && lerNum(v.fis ?? '') != null
                ? <div className="field"><label htmlFor="pp-umin">Mínimo de unidades (opcional)</label><Adorno t="un"><input id="pp-umin" inputMode="numeric" value={v.fisMin ?? ''}
                  onChange={(e) => setV((x) => ({ ...x, fisMin: e.target.value.replace(/\D/g, '') }))} /></Adorno></div>
                : <div className="pp-vazio" />}
              {/* validade em dias ou na data: um preenche o outro, contando de Apresentada em (pedido do Moises, 11/nov/2026) */}
              <div className="field"><label htmlFor="pp-d">Apresentada em</label><input id="pp-d" type="date" value={v.data}
                onChange={(e) => { const d = e.target.value; setV((x) => { const n = diasVal(x); return { ...x, data: d, validade: d && n != null ? somarDias(d, n) : x.validade }; }); }} /></div>
              <div className="field"><label htmlFor="pp-vd">Validade</label><Adorno t="dias"><input id="pp-vd" inputMode="numeric" value={diasVal(v) ?? ''}
                onChange={(e) => { const t = e.target.value.replace(/\D/g, '').slice(0, 4); setV((x) => ({ ...x, dias: t, validade: t && x.data ? somarDias(x.data, +t) : t ? x.validade : '' })); }} /></Adorno></div>
              <div className="field"><label htmlFor="pp-val">Válida até</label><input id="pp-val" type="date" value={v.validade}
                onChange={(e) => { const d = e.target.value; setV((x) => ({ ...x, validade: d, dias: d && x.data ? String(Math.max(0, diasEntre(x.data, d))) : '' })); }} /></div>
            </div>
            <div className="editgrid" style={{ marginTop: 'var(--e4)' }}>
              <div className={`field full${errPt ? ' campo-erro' : ''}`} id="pp-pt" role="group" aria-labelledby="pp-pt-l">
                <label id="pp-pt-l">{ativas.length > 1 ? 'Partes da proposta' : 'Parte da proposta'}</label>
                {ativas.length ? (
                  <div className="pp-partes">{ativas.map((x) => {
                    const on = sel.includes(x.id);
                    return <button key={x.id} type="button" className="fx-op" aria-pressed={on} onClick={() => marcar(x.id)}>{on && <Ic n="check" s={16} />}{x.nome}</button>;
                  })}
                  {ativas.length > 2 && sel.length < ativas.length && <button type="button" className="btn text sm" onClick={() => { setErrPt(false); setV((x) => ({ ...x, partes: ativas.map((y) => y.id).join(',') })); }}>Marcar todas</button>}</div>
                ) : <div className="muted">O terreno não tem parte: cadastre uma na aba Terreno.</div>}
                {sel.length > 0 && L && <div className="pp-area" aria-live="polite">
                  Área total da proposta: <b>{areaSel != null ? m2(Math.round(areaSel * 100) / 100) : 'não informada'}</b>
                  {ativas.length > 1 && <span className="muted"> · {sel.length} de {ativas.length} partes</span>}
                  {areaSel && valorSel ? <span className="muted"> · {brl(valorSel / areaSel)}/m²</span> : null}
                  {areaSel != null && semArea.length > 0 && <div className="muted">Sem área: {semArea.map(nomeParte).join(', ')} (fora da soma)</div>}
                </div>}
                {errPt && <div className="campo-msg">Escolha pelo menos uma parte.</div>}
              </div>
              <div className="field full"><label htmlFor="pp-c">Condições de pagamento</label><textarea id="pp-c" value={v.cond} onChange={m('cond')} placeholder="Entrada, parcelas, permuta, torna, condição suspensiva" /></div>
            </div>
            {rent && <div className="banner warn" id="pp-warn" style={{ marginTop: 12 }}><Ic n="warn" /><div>Rentabilidade abaixo da mínima: {rent.txt}.</div></div>}
            {jaAbertas.length > 0 && <div className="diverg"><Ic n="warn" s={16} />{jaAbertas.length > 1 ? 'Já há propostas em aberto' : 'Já há proposta em aberto'} para {nomesDe(sel.filter((x) => jaAbertas.some((p) => !ptsDe(p).length || ptsDe(p).includes(x))))}: {jaAbertas.map((p) => `v${p.versao}`).join(', ')}. Nenhuma muda sozinha: depois de registrar, mude o status ou exclua a que não vale.</div>}
            <div className="sec-f" style={{ padding: '12px 0 0' }}><LimparRasc chave={kPr} mostrar={sujoPr} limpar={() => setV(ini)} /><button type="button" className="btn text" onClick={() => setForm(false)}>Cancelar</button><button className="btn primary" disabled={grav}>Registrar</button></div>
          </form>
        )}
        {sobre.length > 0 && <div className="banner warn pp-sobre" role="status"><Ic n="warn" s={20} /><div>
          <div className="bt">Propostas em aberto para a mesma parte</div>
          {sobre.map((x) => <div key={x.vs.join('-')}>v{x.vs[0]} e v{x.vs[1]}: {x.partes}</div>)}
          <div className="muted">Nos resumos do terreno vale a mais recente. Mude o status, exclua uma ou deixe as duas.</div>
        </div></div>}
        {chain.length ? (
          <div className="chain" style={{ marginTop: form ? 16 : 0 }}>{chain.map((p) => (
            <div key={p.id} className={`pnode ${p.origem}`}><span className="pd">v{p.versao}</span><div className="pc">
              <div className="ph"><span><span className="pv">{[p.valor_total != null ? brl(p.valor_total) : null, finTxt(modProp(p)), fisTxt(modProp(p))].filter(Boolean).join(' + ')}</span> <span className="muted" style={{ fontSize: 13 }}><span className="p-sep">· </span>{p.origem === 'bkm' ? 'BKM' : 'Vendedor'}</span></span>
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{ativa && edita
                  ? <><select aria-label={`Status da proposta v${p.versao}`} className="chip chip-sel" value={p.status} onChange={(e) => status(p, e.target.value)}>
                    {Object.entries(ST_PROP).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                    <button type="button" className="iconbtn sm" title="Excluir proposta" aria-label={`Excluir a proposta v${p.versao}`} onClick={() => excluir(p)}><Ic n="lixo" s={18} /></button></>
                  : <span className={`chip ${ST_PROP_COR[p.status] ?? ''}`}>{ST_PROP[p.status]}</span>}</span></div>
              <div className="pp-pts">{ptsDe(p).length
                ? ptsDe(p).map((id) => { const x = c.partes.find((y) => y.id === id); return <span key={id} className="chip" title={x && !x.ativa ? 'Parte tirada do terreno' : undefined}>{nomeParte(id)}{x && !x.ativa ? ' (saiu)' : ''}</span>; })
                : <span className="chip ni">Parte não informada</span>}</div>
              <div className="pm">{FORMA[p.forma_pagamento] ?? p.forma_pagamento}{p.data_apresentacao ? ` · apresentada ${fd(p.data_apresentacao)}` : ''}{p.validade ? ` · válida até ${fd(p.validade)}` : ''}</div>
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
    <Quadro aba="comercial" id="reunioes" chip="Reuniões" titulo={<>Reuniões{ms.length ? <> <span className="h-n">{ms.length}</span></> : null}</>}
      acoes={<span className="sec-acoes">{ativa && edita && !form && <button className="btn primary sm" onClick={abrir}><Ic n="add" s={16} />Registrar reunião</button>}</span>}>
      <div className="sec-b">
        {form && !ed && formulario}
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
      {c.proc && <SecPropostas f={f} c={c} />}
      {c.proc && <SecReunioes f={f} c={c} />}
      <SecOfertas f={f} c={c} registrar={reg} />
      {janela && <JanelaOferta f={f} corretores={c.corretores} partes={c.partes} fechar={() => setJanela(false)} />}
    </div>
  );
}
