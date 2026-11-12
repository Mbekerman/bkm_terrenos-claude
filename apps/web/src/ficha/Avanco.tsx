import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { data as fd, diasEntre, hojeISO, somarDias } from '../lib/format';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import type { Ficha as F, ProcF, R } from './dados';

// Quadro de avanço da ficha, porte de tools/prototipo/proto_funil.js › painelNeg (e proto_fases.js › painelAvanco):
// subetapa com os dias e o prazo, "Próxima", o selo das pendências, Avançar (ou Pedir aprovação, ou Concluir como
// Comprado na última etapa), o ⋮ com Stand By, Perdido e Descartado, o pedido de aprovação em aberto com Aprovar,
// Recusar e Cancelar pedido, e as faixas de Stand By, Perdido, Descartado e Comprado. Tudo pelas regras do banco:
// app.checar_passagem, mover_etapa, mover_subetapa, encerrar_processo, retomar_processo, decidir_aprovacao e
// cancelar_aprovacao (regra 2 do CLAUDE.md: o front não muda processo direto).

const NIV_N: Record<string, string> = { gestor: 'Gestor', diretor: 'Diretor' };
export const aberto = (p?: ProcF | null) => !!p && (p.status === 'ativo' || p.status === 'stand_by');

export interface Item { ok: boolean; tipo?: string; texto: string; justifica?: boolean; aviso?: boolean }
export interface Passagem {
  proxima: string | null; proxima_tipo: string | null; proxima_nome: string | null; ok: boolean; pode_forcar: boolean; pode_justificar: boolean;
  itens: Item[]; aprovacoes: string[] | null; aprovacao_modo: string | null;
  pedido: { pedido_id: string; destino_nome: string | null; destino: string; aguardando: string; pedido_por: string | null; posso_decidir: boolean } | null;
}
export interface DadosAvanco {
  p: R; r: Passagem; subs: R[]; status: Record<string, string>; motivos: R[]; partes: R[]; niveis: R[]; pedidoPor: string | null;
}

/** os processos que ganham quadro: as fases abertas, da mais adiante para trás; sem nenhuma, a negociação encerrada */
export function procsAvanco(f: F): ProcF[] {
  const ord = f.fases.map((x) => x.k);
  const ab = f.procs.filter(aberto).sort((a, b) => ord.indexOf(b.fase) - ord.indexOf(a.fase));
  if (ab.length) return ab;
  const ent = f.fases.find((x) => x.entrada)?.k;
  const n = f.procs.filter((p) => p.fase === ent).slice(-1)[0];
  return n ? [n] : [];
}

async function carregar(empresa: string, id: string, fase: string): Promise<DadosAvanco> {
  const [p, r, ss, st, mo, pt] = await Promise.all([
    supabase.from('processos').select('id,fase,etapa_atual,subetapa_atual,subetapa_desde,etapa_desde,status,motivo_encerramento,detalhe_encerramento,pontos_sucesso,retomar_em,data_encerramento').eq('id', id).single(),
    supabase.rpc('checar_passagem', { p_processo: id }),
    supabase.from('subetapas_modelo').select('etapa,codigo,nome,ordem,ativo,prazo_dias').eq('empresa_id', empresa).eq('fase', fase).order('ordem'),
    supabase.from('status_modelo').select('status,nome').eq('empresa_id', empresa).eq('fase', fase),
    supabase.from('motivos_encerramento').select('status,codigo,nome,ordem,exige_texto,ativo').eq('empresa_id', empresa).order('ordem'),
    supabase.from('processos').select('id,status,parte_id').eq('principal_id', id),
  ]);
  for (const x of [p, r, ss, st, mo, pt]) if (x.error) throw x.error;
  const rr = r.data as Passagem;
  let niveis: R[] = [], pedidoPor: string | null = null;
  if (rr.pedido) {
    const a = await supabase.from('v_aprovacoes').select('nivel,ordem,status,na_vez,aprovador_previsto_nome,decidido_por_nome,pedido_por,pedido_por_nome,pedido_em,dados')
      .eq('pedido_id', rr.pedido.pedido_id).order('ordem').order('nivel');
    if (a.error) throw a.error;
    niveis = a.data as R[];
    pedidoPor = niveis[0]?.pedido_por ?? null;
  }
  return {
    p: p.data as R, r: { ...rr, itens: rr.itens ?? [] }, subs: ss.data as R[],
    status: Object.fromEntries((st.data as R[]).map((x) => [x.status, x.nome])), motivos: mo.data as R[], partes: pt.data as R[], niveis, pedidoPor,
  };
}

export function useAvanco(f: F, proc: ProcF) {
  const { empresa } = useSessao();
  return useQuery({ queryKey: ['ficha-adv', proc.id, f.versao, proc.status, proc.etapa, proc.sub], enabled: !!empresa && !!proc.id, queryFn: () => carregar(empresa!.id, proc.id, proc.fase) });
}

export function useRecarregar() {
  const qc = useQueryClient();
  return () => {
    for (const k of ['ficha', 'ficha-adv', 'ficha-com', 'ficha-logs', 'mapa']) qc.invalidateQueries({ queryKey: [k] });
  };
}

/** terreno sem negociação (Backlog): a oferta do cadastro não abre a negociação; aqui quem edita a inicia */
export function Backlog({ f }: { f: F }) {
  const { edita } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const [grav, setGrav] = useState(false);
  const iniciar = async () => {
    setGrav(true);
    const o = await supabase.from('ofertas').select('id').eq('terreno_id', f.id).eq('vigente', true).maybeSingle();
    const { error } = await supabase.rpc('abrir_negociacao', { p_terreno: f.id, p_oferta: o.data?.id ?? null });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    toast('Negociação iniciada.');
    recarregar();
  };
  return (
    <section className="sec sec-adv"><div className="banner" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', gap: 12 }}><Ic n="clock" /><span><b>Backlog</b><br /><span>Sem negociação aberta.</span></span></span>
      {edita && <button className="btn sm" disabled={grav} onClick={iniciar}>Iniciar negociação</button>}
    </div></section>
  );
}

/* Avançar de etapa passando por cima do que ela pedia (pedido do Moises, 12/nov/2026): a janela pergunta como fica
 * a etapa deixada. "Deixar com pendências" a marca (app.etapas_pendentes): a linha do tempo mostra o alerta e os
 * itens continuam em "Falta preencher" até serem cumpridos. Banco ainda sem o SQL de 12/nov: avança como antes. */
export type EscolhaPend = 'deixar' | 'concluida';
export async function moverEtapa(processo: string, forcar: boolean, j: string, pend?: EscolhaPend) {
  const a = { p_processo: processo, p_forcar: forcar, p_comentario: j || null };
  if (!pend) return supabase.rpc('mover_etapa', a);
  const r = await supabase.rpc('mover_etapa', { ...a, p_pendencias: pend });
  return r.error?.code === 'PGRST202' ? supabase.rpc('mover_etapa', a) : r;
}
export function PerguntaPend({ etapa }: { etapa: string }) {
  return (
    <fieldset className="adv-pend-esc">
      <legend>Como fica {etapa}?</legend>
      <label><input type="radio" name="pend" value="deixar" defaultChecked /><span><b>Deixar com pendências</b><span className="faint">O que falta continua em aberto na ficha, com o alerta na linha do tempo.</span></span></label>
      <label><input type="radio" name="pend" value="concluida" /><span><b>Considerar concluída</b><span className="faint">A etapa fica concluída, mesmo sem os itens acima.</span></span></label>
    </fieldset>
  );
}

/** lista dos requisitos (proto.js › advItens) */
export function Itens({ itens, modal }: { itens: Item[]; modal?: boolean }) {
  return (
    <ul className={`adv-lista${modal ? ' adv-modal' : ''}`}>
      {itens.map((x, i) => (
        <li key={i}><span className={x.aviso ? 'av' : x.ok ? 'ok' : 'no'}><Ic n={x.aviso ? 'warn' : x.ok ? 'check' : 'close'} s={16} /></span>
          <span>{x.texto}{!x.ok && x.justifica && <> <span className="faint">· pede justificativa</span></>}</span></li>
      ))}
    </ul>
  );
}

/** relato com formatação (Comprado): só negrito, itálico e lista (proto_funil.js › limpaHtml) */
export function limpaHtml(h: string): string {
  const tpl = document.createElement('template');
  tpl.innerHTML = String(h || '');
  const OK = ['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'BR', 'P', 'DIV'];
  const limpa = (no: Node) => {
    [...no.childNodes].forEach((c) => {
      if (c.nodeType === 1) {
        const el = c as Element;
        if (!OK.includes(el.tagName)) { limpa(el); el.replaceWith(...el.childNodes); return; }
        [...el.attributes].forEach((a) => el.removeAttribute(a.name));
        limpa(el);
      } else if (c.nodeType !== 3) c.remove();
    });
  };
  limpa(tpl.content);
  return tpl.innerHTML;
}
const textoDe = (h: string) => { const d = document.createElement('div'); d.innerHTML = limpaHtml(h); return (d.textContent ?? '').trim(); };

type Modal =
  | { k: 'bloq' | 'forcar'; nome: string; itens: Item[]; deixa?: string; exec: (forcar: boolean, j: string, pend?: EscolhaPend) => Promise<void> }
  | { k: 'comprar'; itens: Item[]; forcar: boolean; ap: string[] }
  | { k: 'stand_by' | 'perdido' | 'descartado'; ap: string[]; modo: string | null }
  | { k: 'recusar' }
  | { k: 'editar' };

const SVG_DOTS = <svg className="ic" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" d="M12 5.5h.01M12 12h.01M12 18.5h.01" /></svg>;
const CHEV = <svg className="adv-ch" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
let ADV_REQ = false;  // lista dos requisitos aberta: vale na sessão, como no protótipo

/** um quadro de avanço por processo */
export function Avanco({ f, proc, irAba }: { f: F; proc: ProcF; irAba: (k: string) => void }) {
  const { edita, usuario } = useSessao();
  const q = useAvanco(f, proc);
  const toast = useToast(), recarregar = useRecarregar();
  const [modal, setModal] = useState<Modal | null>(null);
  const [menu, setMenu] = useState(false);
  const [req, setReq] = useState(ADV_REQ);
  const [grav, setGrav] = useState(false);
  const mRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const fora = (ev: PointerEvent) => { if (!mRef.current?.contains(ev.target as Node)) setMenu(false); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setMenu(false); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc); };
  }, [menu]);
  if (!q.data) return null;
  const { p, r, subs, status, motivos, partes, niveis, pedidoPor } = q.data;
  const fase = f.fases.find((x) => x.k === proc.fase), entrada = !!fase?.entrada;
  const etapas = f.etapasPorFase[proc.fase] ?? [];
  const etN = (k: string) => etapas.find((e) => e.k === k)?.nome ?? k;
  const stN = (k: string) => status[k] ?? ({ stand_by: 'Stand By', perdido: 'Perdido', descartado: 'Descartado', concluido: entrada ? 'Comprado' : 'Concluído' } as R)[k] ?? k;
  const moN = (st: string, k: string) => motivos.find((m) => m.status === st && m.codigo === k)?.nome ?? k;
  const ro = !edita;
  const pref = entrada ? '' : `${fase?.nome ?? proc.fase} · `;

  const rodar = async (fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok?: (d: R) => string | null) => {
    setGrav(true);
    const { data, error } = await fn();
    setGrav(false);
    if (error) { toast(error.message, true); recarregar(); return false; }
    const m = ok?.((data ?? {}) as R);
    if (m) toast(m);
    recarregar();
    return true;
  };
  const resMsg = (nome: string) => (d: R) => (d.resultado === 'aguardando_aprovacao' ? 'Pedido de aprovação enviado.' : `Foi para ${nome}.`);

  /* faixas: encerrado ou parado */
  // o que ficou em branco ao encerrar (tudo é opcional, pedido do Moises de 10/nov/2026) e o lápis para completar depois
  const faltaEnc = [
    (p.status === 'perdido' || p.status === 'descartado') && !p.motivo_encerramento && 'motivo',
    p.status !== 'stand_by' && !textoDe(p.detalhe_encerramento ?? '') && (p.status === 'descartado' ? 'detalhe' : 'relato'),
    p.status === 'concluido' && entrada && !p.pontos_sucesso && 'pontos de sucesso',
    p.status === 'stand_by' && !p.retomar_em && 'data para retomar',
    p.status === 'stand_by' && !p.detalhe_encerramento && 'justificativa',
  ].filter(Boolean) as string[];
  const lapis = !ro && (
    <button className="iconbtn sm adv-enc-ed" aria-label="Editar" title={faltaEnc.length ? `Completar: ${faltaEnc.join(', ')}` : 'Editar'} onClick={() => setModal({ k: 'editar' })}><Ic n="edit" s={18} /></button>
  );
  const falta = faltaEnc.length > 0 && <div className="faint adv-enc-falta">Em branco: {faltaEnc.join(', ')}{!ro && <> · <button type="button" className="adv-enc-lk" onClick={() => setModal({ k: 'editar' })}>Completar</button></>}</div>;
  if (p.status === 'perdido' || p.status === 'descartado') return (
    <section className="sec sec-adv"><div className={`banner ${p.status === 'perdido' ? 'crit' : ''}`}><Ic n="block" />
      <div style={{ minWidth: 0, flex: 1 }}><div className="bt">{pref}{stN(p.status)} em {etN(p.etapa_atual)}{p.motivo_encerramento ? ' · ' + moN(p.status, p.motivo_encerramento) : ''}</div>
        <div>{p.detalhe_encerramento ?? ''}</div>{falta}<div className="faint" style={{ fontSize: 12, marginTop: 4 }}>{fd(p.data_encerramento)}</div></div>{lapis}</div>
      {modal && createPortal(dlg(), document.body)}</section>
  );
  if (p.status === 'concluido') return (
    <section className="sec sec-adv"><div className="banner good"><Ic n="check" />
      <div style={{ minWidth: 0, flex: 1 }}><div className="bt">{pref}{stN('concluido')} em {fd(p.data_encerramento)}</div>
        <div className="relato" dangerouslySetInnerHTML={{ __html: limpaHtml(p.detalhe_encerramento ?? '') }} />
        {p.pontos_sucesso && <div style={{ marginTop: 6 }}><b>Pontos de sucesso:</b> {p.pontos_sucesso}</div>}{falta}</div>{lapis}</div>
      {modal && createPortal(dlg(), document.body)}</section>
  );


  if (p.status === 'stand_by') return (
    <section className="sec sec-adv"><div className="banner warn" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', gap: 12 }}><Ic n="pause" /><span><b>{pref}Stand By em {etN(p.etapa_atual)}{p.retomar_em ? ` · revisitar em ${fd(p.retomar_em)}` : ''}</b>{p.detalhe_encerramento && <><br /><span>{p.detalhe_encerramento}</span></>}{falta}</span></span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>{lapis}{!ro && <button className="btn sm" disabled={grav} onClick={() => rodar(() => supabase.rpc('retomar_processo', { p_processo: p.id }), () => 'Negociação retomada.')}>Retomar</button>}</span>
    </div>{modal && createPortal(dlg(), document.body)}</section>
  );

  /* tentar uma passagem: confere antes; com pendência, a justificativa (quem pode) ou a lista do que falta */
  const tentar = async (tipo: string, dest: string, nome: string, exec: (forcar: boolean, j: string, pend?: EscolhaPend) => Promise<void>) => {
    const { data, error } = await supabase.rpc('checar_passagem', { p_processo: p.id, p_destino_tipo: tipo, p_destino: dest });
    if (error) { toast(error.message, true); return; }
    const c = data as Passagem, pend = (c.itens ?? []).filter((x) => !x.ok);
    if (!pend.length) { await exec(false, ''); return; }
    const deixa = tipo === 'etapa' ? etN(p.etapa_atual) : undefined;
    setModal({ k: c.pode_forcar || c.pode_justificar ? 'forcar' : 'bloq', nome, itens: pend, deixa, exec });
  };
  const subs0 = subs.filter((s) => s.etapa === p.etapa_atual && s.ativo !== false);
  const sub = subs.find((s) => s.etapa === p.etapa_atual && s.codigo === p.subetapa_atual);
  const dias = p.subetapa_desde ? diasEntre(p.subetapa_desde.slice(0, 10), hojeISO()) : null;
  const atras = sub?.prazo_dias != null && dias != null && dias > sub.prazo_dias;
  const pend = r.itens.filter((x) => !x.ok && x.tipo !== 'aprovacao_pendente');
  const itensV = r.itens.filter((x) => x.tipo !== 'aprovacao_pendente');
  const compra = r.proxima_tipo === 'status';
  const ap = r.aprovacoes ?? [];
  const ped = r.pedido;
  const trocaSub = (v: string) => {
    const s = subs0.find((x) => x.codigo === v);
    tentar('subetapa', v, s?.nome ?? v, async (forcar, j) => {
      await rodar(() => supabase.rpc('mover_subetapa', { p_processo: p.id, p_subetapa: v, p_forcar: forcar, p_comentario: j || null }), resMsg(s?.nome ?? v));
    });
  };
  const subSel = (
    <label className="adv-sub"><span>{entrada ? 'Subetapa' : `${fase?.nome ?? ''} · ${etN(p.etapa_atual)}`}</span>
      <select value={p.subetapa_atual ?? ''} disabled={ro || !!ped || grav} aria-label="Subetapa" onChange={(e) => trocaSub(e.target.value)}>
        {p.subetapa_atual && !subs0.some((s) => s.codigo === p.subetapa_atual) && <option value={p.subetapa_atual}>{sub?.nome ?? p.subetapa_atual} (inativa)</option>}
        {subs0.map((s) => <option key={s.codigo} value={s.codigo}>{s.nome}</option>)}
      </select>
      <span className="faint">{dias ?? '—'} d{sub?.prazo_dias ? ` de ${sub.prazo_dias}` : ''}</span>{atras && <span className="chip warn">prazo estourado</span>}
    </label>
  );
  const maisMenu = (
    <div className={`adv-mais${menu ? ' aberto' : ''}`} ref={mRef}>
      <button className="btn adv-mb" aria-haspopup="menu" aria-expanded={menu} aria-label="Mais ações" title={`Stand By${status.perdido ? ', Perdido' : ''}${status.descartado ? ' ou Descartado' : ''}`} onClick={() => setMenu(!menu)}>{SVG_DOTS}</button>
      <div className="adv-menu" role="menu">
        {status.stand_by && <button role="menuitem" onClick={() => abrirStatus('stand_by')}><Ic n="pause" s={18} />Colocar em Stand By</button>}
        {status.perdido && <button role="menuitem" className="danger" onClick={() => abrirStatus('perdido')}><Ic n="block" s={18} />Marcar como Perdido</button>}
        {status.descartado && <button role="menuitem" className="danger" onClick={() => abrirStatus('descartado')}><Ic n="close" s={18} />Descartar</button>}
      </div>
    </div>
  );
  async function abrirStatus(st: 'stand_by' | 'perdido' | 'descartado') {
    setMenu(false);
    const { data } = await supabase.rpc('checar_passagem', { p_processo: p.id, p_destino_tipo: 'status', p_destino: st });
    const c = data as Passagem | null;
    setModal({ k: st, ap: c?.aprovacoes ?? [], modo: c?.aprovacao_modo ?? null });
  }

  /* terreno dividido em partes: o quadro anda pelas partes (proto_funil.js › painelNeg, dividida) */
  const ativas = partes.filter((x) => x.status !== 'perdido' && x.status !== 'descartado');
  if (entrada && partes.length && !compra) return (
    <section className="sec sec-adv"><div className="adv adv-c">
      <div className="adv-sub"><span>Subetapa</span><b>{sub?.nome ?? '—'}</b><span className="faint">{dias ?? '—'} d</span></div>
      <div className="adv-l1"><span className="adv-t">Anda pelas partes · {ativas.length} {ativas.length === 1 ? 'parte' : 'partes'} · {ativas.filter((x) => x.status === 'concluido').length} compradas</span></div>
      <div className="faint" style={{ fontSize: 12 }}>O terreno fica na etapa da parte mais atrasada.</div>
      {!ro && <div className="adv-l2"><button className="btn" onClick={() => irAba('comercial')}>Ver partes</button>{maisMenu}</div>}
    </div>{modal && createPortal(dlg(), document.body)}</section>
  );

  const ir = () => {
    if (compra) {
      if (pend.length && !(r.pode_forcar || r.pode_justificar)) { setModal({ k: 'bloq', nome: 'concluir como ' + stN('concluido'), itens: pend, exec: async () => {} }); return; }
      setModal({ k: 'comprar', itens: pend, forcar: pend.length > 0, ap });
      return;
    }
    const nome = r.proxima_nome ?? r.proxima ?? '';
    tentar('etapa', r.proxima!, nome, async (forcar, j, pd) => {
      await rodar(() => moverEtapa(p.id, forcar, j, pd), resMsg(nome));
    });
  };
  const eu = usuario?.user_id;
  const pedBox = ped && (
    <div className="adv-ped">
      <div className="adv-ped-t"><Ic n="clock" s={18} /><span><b>Aguardando aprovação</b> para {ped.destino_nome ?? ped.destino}</span></div>
      <ol className="adv-niv">{niveis.map((x, i) => (
        <li key={i} className={x.status}><span className="nv-d">{x.status === 'aprovado' && <Ic n="check" s={14} />}</span>
          <span>{NIV_N[x.nivel] ?? x.nivel}{x.aprovador_previsto_nome ? ' · ' + x.aprovador_previsto_nome : ''}</span>
          <span className="faint">{x.status === 'aprovado' ? 'aprovou' + (x.decidido_por_nome && x.decidido_por_nome !== x.aprovador_previsto_nome ? ` (${x.decidido_por_nome})` : '') : x.na_vez ? 'na vez' : 'depois'}</span></li>
      ))}</ol>
      <div className="faint" style={{ fontSize: 12 }}>Pedido por {niveis[0]?.pedido_por_nome ?? ped.pedido_por ?? '—'} em {fd(niveis[0]?.pedido_em)}{niveis.length > 1 && r.aprovacao_modo !== 'sequencia' && niveis.every((x) => x.ordem === 1) ? ' · em paralelo' : ''}{niveis[0]?.dados?.forcado ? ' · sem requisitos: ' + (niveis[0].dados.comentario ?? '') : ''}</div>
      {!ro && <div className="adv-ped-a">
        {ped.posso_decidir && <><button className="btn primary sm" disabled={grav} onClick={() => rodar(() => supabase.rpc('decidir_aprovacao', { p_pedido: ped.pedido_id, p_aprovar: true }), (d) => (d.resultado === 'aprovado' ? 'Aprovado.' : 'Aprovação registrada.'))}><Ic n="check" s={16} />Aprovar</button>
          <button className="btn sm" disabled={grav} onClick={() => setModal({ k: 'recusar' })}>Recusar</button></>}
        {(pedidoPor === eu || ped.posso_decidir) && <button className="btn text sm" disabled={grav} onClick={() => rodar(() => supabase.rpc('cancelar_aprovacao', { p_pedido: ped.pedido_id }), () => 'Pedido cancelado.')}>Cancelar pedido</button>}
      </div>}
    </div>
  );
  const apTxt = ap.length ? <span className="adv-ap" title="Aprovação exigida"><Ic n="check" s={14} />{ap.map((x) => NIV_N[x] ?? x).join(r.aprovacao_modo === 'sequencia' ? ' → ' : ' + ')}</span> : null;
  return (
    <section className="sec sec-adv"><div className="adv adv-c">{subSel}
      {pedBox || <>
        <div className="adv-l1"><span className="adv-t">{compra ? `Próxima: concluir como ${stN('concluido')}` : `Próxima: ${r.proxima_nome ?? r.proxima ?? '—'}`}</span>{apTxt}
          {itensV.length > 0 && <button className={`adv-st ${pend.length ? 'adv-st-pend' : 'adv-st-ok'}`} aria-expanded={req} title={`${req ? 'Ocultar' : 'Ver'} requisitos`} onClick={() => { ADV_REQ = !req; setReq(!req); }}>
            {pend.length ? <><Ic n="warn" s={16} />{pend.length}{pend.length > 1 ? ' pendências' : ' pendência'}</> : <><Ic n="check" s={16} />Requisitos ok</>}{CHEV}</button>}
        </div>
        {req && itensV.length > 0 && <Itens itens={itensV} />}
      </>}
      {!ro && <div className="adv-l2">{!ped && <button className="btn primary" disabled={grav} onClick={ir}><Ic n={compra ? 'check' : 'fwd'} s={18} /><span>{compra ? `Concluir como ${stN('concluido')}` : ap.length ? 'Pedir aprovação' : 'Avançar'}</span></button>}{maisMenu}</div>}
    </div>{modal && createPortal(dlg(), document.body)}</section>
  );

  function dlg(): ReactNode {
    if (!modal) return null;
    const fechar = () => setModal(null);
    const rod = (id: string, l: string) => <><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form={id} disabled={grav}>{l}</button></>;
    const apInfo = (lv: string[], modo?: string | null) => lv.length
      ? <div className="banner blue" style={{ marginTop: 12 }}><Ic n="check" /><div>Vai como pedido de aprovação: {lv.map((x) => NIV_N[x] ?? x).join(modo === 'sequencia' ? ', depois ' : ' e ')}.</div></div> : null;
    const val = (ev: FormEvent<HTMLFormElement>, k: string) => ((ev.currentTarget.elements.namedItem(k) as HTMLInputElement | null)?.value ?? '').trim();
    if (modal.k === 'bloq') return (
      <Dialogo titulo={`Ainda não dá para ${modal.nome.startsWith('concluir') ? modal.nome : 'ir para ' + modal.nome}`} sub="Resolva o que falta. Gestor e diretor podem passar sem os requisitos, com justificativa." onFechar={fechar}
        rodape={<button className="btn primary" onClick={fechar}>Entendi</button>}><Itens itens={modal.itens} modal /></Dialogo>
    );
    if (modal.k === 'forcar') { const exige = modal.itens.some((x) => x.justifica); return (
      <Dialogo titulo={`Ir para ${modal.nome} sem os requisitos?`} onFechar={fechar} rodape={rod('f-fc', 'Avançar')}>
        <ul className="pend">{modal.itens.map((x, i) => <li key={i}><Ic n="close" s={16} />{x.texto}</li>)}</ul>
        <form id="f-fc" onSubmit={async (ev) => { ev.preventDefault(); const j = val(ev, 'j'), pd = modal.deixa ? (val(ev, 'pend') as EscolhaPend) || 'deixar' : undefined; const m = modal; setModal(null); await m.exec(true, j, pd); }}>
          {modal.deixa && <PerguntaPend etapa={modal.deixa} />}
          <div className="field"><label htmlFor="fc-j">Justificativa{exige ? '' : ' (opcional)'}, vai para o histórico</label><textarea id="fc-j" name="j" required={exige} /></div>
        </form>
      </Dialogo>
    ); }
    if (modal.k === 'recusar') return (
      <Dialogo titulo={`Recusar ${ped?.destino_nome ?? ''}?`} sub={`${niveis[0]?.pedido_por_nome ?? 'Quem pediu'} recebe o motivo no sino.`} onFechar={fechar} rodape={rod('f-rc', 'Recusar')}>
        <form id="f-rc" onSubmit={async (ev) => { ev.preventDefault(); const c = val(ev, 'coment'); if (await rodar(() => supabase.rpc('decidir_aprovacao', { p_pedido: ped!.pedido_id, p_aprovar: false, p_comentario: c }), () => 'Pedido recusado.')) fechar(); }}>
          <div className="field"><label htmlFor="rc-c">Motivo da recusa</label><textarea id="rc-c" name="coment" required /></div>
        </form>
      </Dialogo>
    );
    const encerrar = async (st: string, a: R, msg: string) => {
      const ok = await rodar(() => supabase.rpc('encerrar_processo', { p_processo: p.id, p_status: st, ...a }), (d) => (d.resultado === 'aguardando_aprovacao' ? 'Pedido de aprovação enviado.' : msg));
      if (ok) fechar();
    };
    const motivosSel = (st: string, atual = '') => (
      <select id="mo-m" name="motivo" defaultValue={atual}><option value="">Não informado</option>
        {motivos.filter((m) => m.status === st && m.ativo !== false).map((m) => <option key={m.codigo} value={m.codigo}>{m.nome}</option>)}</select>
    );
    if (modal.k === 'stand_by') return (
      <Dialogo titulo="Colocar em Stand By" onFechar={fechar} rodape={rod('f-s', 'Colocar em Stand By')}>
        <form id="f-s" onSubmit={(ev) => { ev.preventDefault(); encerrar('stand_by', { p_retomar_em: val(ev, 'retomar') || null, p_detalhe: val(ev, 'detalhe') || null }, 'Em Stand By.'); }}>
          <div className="fields"><div className="field"><label htmlFor="sp-d">Retomar em</label><input id="sp-d" name="retomar" type="date" min={somarDias(hojeISO(), 1)} defaultValue={somarDias(hojeISO(), 30)} /></div>
            <div className="field full"><label htmlFor="sp-t">Justificativa</label><textarea id="sp-t" name="detalhe" /></div></div>
          {apInfo(modal.ap, modal.modo)}
        </form>
      </Dialogo>
    );
    if (modal.k === 'perdido') return (
      <Dialogo titulo="Marcar como Perdido" sub="O vendedor não quis seguir com a BKM." onFechar={fechar} rodape={rod('f-p', 'Marcar como Perdido')}>
        <form id="f-p" onSubmit={(ev) => { ev.preventDefault(); encerrar('perdido', { p_motivo: val(ev, 'motivo') || null, p_detalhe: val(ev, 'detalhe') || null, p_tarefas: 'arquivar' }, 'Marcado como Perdido.'); }}>
          <div className="fields"><div className="field full"><label htmlFor="mo-m">Motivo</label>{motivosSel('perdido')}</div>
            <div className="field full"><label htmlFor="pd-d">Relato</label><textarea id="pd-d" name="detalhe" placeholder="O que aconteceu, com quem e quando" /></div></div>
          {apInfo(modal.ap, modal.modo)}
        </form>
      </Dialogo>
    );
    if (modal.k === 'descartado') return (
      <Dialogo titulo="Descartar" sub="A BKM decidiu não seguir." onFechar={fechar} rodape={rod('f-ds', 'Descartar')}>
        <form id="f-ds" onSubmit={(ev) => { ev.preventDefault(); encerrar('descartado', { p_motivo: val(ev, 'motivo') || null, p_detalhe: val(ev, 'detalhe') || null, p_tarefas: 'arquivar' }, 'Descartado.'); }}>
          <div className="fields"><div className="field full"><label htmlFor="mo-m">Motivo</label>{motivosSel('descartado')}</div>
            <div className="field full"><label htmlFor="ds-d">Detalhe</label><textarea id="ds-d" name="detalhe" /></div></div>
          {apInfo(modal.ap, modal.modo)}
        </form>
      </Dialogo>
    );
    /* completar depois o que ficou em branco ao encerrar (app.editar_encerramento) */
    if (modal.k === 'editar') {
      const st = p.status as string;
      const salvarEd = async (d: R) => {
        if (await rodar(() => supabase.rpc('editar_encerramento', { p_processo: p.id, p_dados: d }), () => 'Salvo.')) fechar();
      };
      return (
        <Dialogo titulo={`Editar ${stN(st)}`} sub={f.nome} onFechar={fechar} rodape={rod('f-ed', 'Salvar')}>
          <form id="f-ed" onSubmit={(ev) => {
            ev.preventDefault();
            if (st === 'stand_by') { salvarEd({ retomar_em: val(ev, 'retomar') || null, detalhe: val(ev, 'detalhe') }); return; }
            if (st === 'concluido') {
              const rel = limpaHtml((document.getElementById('cp-rel') as HTMLElement).innerHTML);
              salvarEd({ detalhe: textoDe(rel) ? rel : '', ...(entrada ? { pontos_sucesso: val(ev, 'pontos') } : {}) });
              return;
            }
            salvarEd({ motivo: val(ev, 'motivo') || null, detalhe: val(ev, 'detalhe') });
          }}>
            <div className="fields">
              {st === 'stand_by' && <>
                <div className="field"><label htmlFor="sp-d">Retomar em</label><input id="sp-d" name="retomar" type="date" min={somarDias(hojeISO(), 1)} defaultValue={p.retomar_em ?? ''} /></div>
                <div className="field full"><label htmlFor="sp-t">Justificativa</label><textarea id="sp-t" name="detalhe" defaultValue={p.detalhe_encerramento ?? ''} /></div></>}
              {(st === 'perdido' || st === 'descartado') && <>
                <div className="field full"><label htmlFor="mo-m">Motivo</label>{motivosSel(st, p.motivo_encerramento ?? '')}</div>
                <div className="field full"><label htmlFor="pd-d">{st === 'perdido' ? 'Relato' : 'Detalhe'}</label><textarea id="pd-d" name="detalhe" defaultValue={p.detalhe_encerramento ?? ''} /></div></>}
              {st === 'concluido' && <>
                <div className="field full"><span className="lbl-f" id="cp-l">{entrada ? 'Relato da compra' : 'Relato da conclusão'}</span>
                  <div className="rt"><div className="rt-bar" role="toolbar" aria-label="Formatação">
                    <button type="button" className="iconbtn sm" aria-label="Negrito" onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}><b>N</b></button>
                    <button type="button" className="iconbtn sm" aria-label="Itálico" onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}><i>I</i></button>
                    <button type="button" className="iconbtn sm" aria-label="Lista" onMouseDown={(e) => { e.preventDefault(); document.execCommand('insertUnorderedList'); }}>•</button>
                  </div><div id="cp-rel" className="rt-ed" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="cp-l"
                    dangerouslySetInnerHTML={{ __html: limpaHtml(p.detalhe_encerramento ?? '') }} /></div></div>
                {entrada && <div className="field full"><label htmlFor="cp-p">Pontos de sucesso</label><textarea id="cp-p" name="pontos" defaultValue={p.pontos_sucesso ?? ''} /></div>}</>}
            </div>
          </form>
        </Dialogo>
      );
    }
    /* comprar: relato com formatação, pontos de sucesso e, com pendência, a justificativa */
    const m = modal as Extract<Modal, { k: 'comprar' }>;
    return (
      <Dialogo titulo={`Concluir como ${stN('concluido')}`} sub={f.nome} onFechar={fechar} rodape={rod('f-cp', 'Concluir')}>
        <form id="f-cp" onSubmit={(ev) => {
          ev.preventDefault();
          const rel = limpaHtml((document.getElementById('cp-rel') as HTMLElement).innerHTML);
          encerrar('concluido', { p_detalhe: textoDe(rel) ? rel : null, p_pontos_sucesso: val(ev, 'pontos') || null, p_forcar: m.forcar, p_comentario: m.forcar ? val(ev, 'j') || null : null }, `Concluído como ${stN('concluido')}.`);
        }}>
          <div className="fields">
            <div className="field full"><span className="lbl-f" id="cp-l">Relato da compra</span>
              <div className="rt"><div className="rt-bar" role="toolbar" aria-label="Formatação">
                <button type="button" className="iconbtn sm" aria-label="Negrito" onMouseDown={(e) => { e.preventDefault(); document.execCommand('bold'); }}><b>N</b></button>
                <button type="button" className="iconbtn sm" aria-label="Itálico" onMouseDown={(e) => { e.preventDefault(); document.execCommand('italic'); }}><i>I</i></button>
                <button type="button" className="iconbtn sm" aria-label="Lista" onMouseDown={(e) => { e.preventDefault(); document.execCommand('insertUnorderedList'); }}>•</button>
              </div><div id="cp-rel" className="rt-ed" contentEditable suppressContentEditableWarning role="textbox" aria-multiline="true" aria-labelledby="cp-l" data-ph="Como foi a negociação, condições finais, quem participou" /></div></div>
            {entrada && <div className="field full"><label htmlFor="cp-p">Pontos de sucesso</label><textarea id="cp-p" name="pontos" placeholder="O que fez a compra dar certo e vale repetir" /></div>}
            {m.itens.length > 0 && <>
              <div className="field full"><div className="banner warn"><Ic n="warn" /><div><div className="bt">Comprar sem os requisitos</div>
                <ul className="pend">{m.itens.map((x, i) => <li key={i}><Ic n="close" s={16} />{x.texto}</li>)}</ul></div></div></div>
              <div className="field full"><label htmlFor="cp-j">Justificativa{m.itens.some((x) => x.justifica) ? '' : ' (opcional)'}, vai para o histórico</label><textarea id="cp-j" name="j" required={m.itens.some((x) => x.justifica)} /></div>
            </>}
          </div>
          {apInfo(m.ap, r.aprovacao_modo)}
        </form>
      </Dialogo>
    );
  }
}
