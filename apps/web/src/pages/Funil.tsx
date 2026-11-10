import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { escondidos } from '../lib/escondidos';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { data as fd, diasEntre, hojeISO, somarDias } from '../lib/format';
import { Carregando, Dialogo, Erro, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { Itens, type Item, type Passagem } from '../ficha/Avanco';
import { TEMP } from '../ficha/dados';
import { BarraFx, GavetaFx, useFiltros } from '../filtros/Filtros';

// Funil, porte de tools/prototipo/proto_fases.js › pgFasesBoard, pgFaseBoard, negTopo, kcardFase, kcardProc e
// proto_funil.js › pgNeg, kcardNeg, soltar, tentar (decisões do Moisés, 23/out e 4/nov/2026). Três níveis no endereço:
// /funil (uma coluna por fase ativa, um card por fase aberta do terreno, sem arrastar), /funil/<fase> (etapas e Stand By;
// arrastar muda a etapa) e /funil/<fase>/<etapa> (subetapas; arrastar muda a subetapa). Tudo pelas regras do banco
// (checar_passagem, mover_etapa, mover_para_etapa, mover_subetapa, encerrar_processo, retomar_processo).
// Filtros e Visão: o painel de filtros (filtros/Filtros.tsx), com a seleção própria do Funil.

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
interface Sub { k: string; nome: string; prazo: number | null }
interface Etapa { k: string; nome: string; sla: number | null; subs: Sub[] }
interface Fase { k: string; nome: string; entrada: boolean; etapas: Etapa[] }
interface Proc { id: string; codigo: string; t: string; fase: string; etapa: string; sub: string | null; status: string; desde: string | null; subDesde: string | null; retomar: string | null }
interface Ter { id: string; codigo: string; nome: string; bairro: string | null; resp: { nome: string; foto: string | null } | null; temp: number | null;
  pedido: number | null; proposta: number | null; atrasadas: number; abaixoMin: boolean; reuniao: string | null; negId: string | null }
interface Dados { fases: Fase[]; procs: Proc[]; ters: Record<string, Ter>; ped: Record<string, string>; partes: Record<string, { n: number; comp: number }> }

async function carregar(emp: string): Promise<Dados> {
  const [f, e, s, p, v, a, pt] = await Promise.all([
    supabase.from('fases_modelo').select('codigo,nome,ordem,entrada,ativo').eq('empresa_id', emp).order('ordem'),
    supabase.from('etapas_modelo').select('fase,codigo,nome,ordem,sla_dias').eq('empresa_id', emp).order('ordem'),
    supabase.from('subetapas_modelo').select('fase,etapa,codigo,nome,ordem,ativo,prazo_dias').eq('empresa_id', emp).order('ordem'),
    supabase.from('processos').select('id,codigo,terreno_id,fase,etapa_atual,subetapa_atual,status,etapa_desde,subetapa_desde,retomar_em')
      .eq('empresa_id', emp).is('parte_id', null).in('status', ['ativo', 'stand_by']).order('etapa_desde'),
    supabase.from('v_terrenos').select('id,codigo,nome,bairro,responsavel_id,temperatura,valor_pedido,ultima_proposta_valor,proposta_ativa_valor,tarefas_atrasadas,abaixo_margem_min,proxima_reuniao_em,negociacao_id').eq('empresa_id', emp),
    supabase.from('v_aprovacoes').select('processo_id,nivel,na_vez,aprovador_previsto_nome').eq('empresa_id', emp).eq('status', 'pendente'),
    supabase.from('processos').select('principal_id,status').eq('empresa_id', emp).not('principal_id', 'is', null),
  ]);
  for (const x of [f, e, s, p, v, a, pt]) if (x.error) throw x.error;
  const fases: Fase[] = (f.data as R[]).filter((x) => x.ativo !== false).map((x) => ({
    k: x.codigo, nome: x.nome, entrada: !!x.entrada,
    etapas: (e.data as R[]).filter((y) => y.fase === x.codigo).map((y) => ({
      k: y.codigo, nome: y.nome, sla: y.sla_dias,
      subs: (s.data as R[]).filter((z) => z.fase === x.codigo && z.etapa === y.codigo && z.ativo !== false).map((z) => ({ k: z.codigo, nome: z.nome, prazo: z.prazo_dias })),
    })),
  }));
  const esc = await escondidos(emp);
  const vs = (v.data as R[]).filter((x) => !esc.has(x.id));
  const ids = [...new Set(vs.map((x) => x.responsavel_id).filter(Boolean))];
  const us = ids.length ? await supabase.from('usuarios').select('user_id,nome,email,foto_url').in('user_id', ids) : { data: [], error: null };
  if (us.error) throw us.error;
  const uN = Object.fromEntries((us.data as R[]).map((u) => [u.user_id, { nome: u.nome || u.email, foto: u.foto_url }]));
  const ters = Object.fromEntries(vs.map((x) => [x.id, {
    id: x.id, codigo: x.codigo, nome: x.nome ?? x.codigo, bairro: x.bairro, resp: uN[x.responsavel_id] ?? null, temp: x.temperatura,
    pedido: x.valor_pedido, proposta: x.proposta_ativa_valor ?? x.ultima_proposta_valor, atrasadas: x.tarefas_atrasadas ?? 0,
    abaixoMin: !!x.abaixo_margem_min, reuniao: x.proxima_reuniao_em, negId: x.negociacao_id,
  } as Ter]));
  const NIV: Record<string, string> = { gestor: 'gestor', diretor: 'diretor' };
  const ped: Record<string, string> = {};
  for (const r of (a.data as R[]).filter((x) => x.na_vez)) {
    const t = r.aprovador_previsto_nome ? `${r.aprovador_previsto_nome} (${NIV[r.nivel] ?? r.nivel})` : `um ${NIV[r.nivel] ?? r.nivel}`;
    ped[r.processo_id] = ped[r.processo_id] ? `${ped[r.processo_id]} e ${t}` : t;
  }
  const partes: Dados['partes'] = {};
  for (const r of pt.data as R[]) {
    if (r.status === 'perdido' || r.status === 'descartado') continue;
    const o = partes[r.principal_id] ?? (partes[r.principal_id] = { n: 0, comp: 0 });
    o.n++; if (r.status === 'concluido') o.comp++;
  }
  const procs: Proc[] = (p.data as R[]).filter((x) => ters[x.terreno_id]).map((x) => ({
    id: x.id, codigo: x.codigo, t: x.terreno_id, fase: x.fase, etapa: x.etapa_atual, sub: x.subetapa_atual, status: x.status,
    desde: x.etapa_desde?.slice(0, 10) ?? null, subDesde: x.subetapa_desde?.slice(0, 10) ?? null, retomar: x.retomar_em,
  }));
  return { fases, procs, ters, ped, partes };
}

const mi = (v: number | null) => (v == null ? '—' : 'R$\u00a0' + (v / 1e6).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '\u00a0mi');
const dias = (d: string | null) => (d ? diasEntre(d, hojeISO()) : 0);
function TempMini({ v }: { v: number | null }) {
  if (!v) return <span className="faint" style={{ fontSize: 12 }}>—</span>;
  return <span className={`temp-mini t${v}`} title={`Temperatura ${v} · ${TEMP[v]}`}>{[1, 2, 3, 4, 5].map((n) => <i key={n} className={n <= v ? 'on' : ''} />)}<b className="temp-n">{v}</b></span>;
}
function Av({ r }: { r: Ter['resp'] }) {
  if (!r) return <span />;
  let h = 0;
  for (const c of r.nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = r.nome.split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="avatar sm" style={{ background: `var(--av${(h % 4) + 1})`, overflow: 'hidden', padding: r.foto ? 0 : undefined }} title={r.nome}>
    {r.foto ? <img src={r.foto} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} /> : ini}</span>;
}

type Modal =
  | { k: 'bloq' | 'forcar'; nome: string; itens: Item[]; exec: (forcar: boolean, j: string) => Promise<void> }
  | { k: 'voltar'; p: Proc; etapa: Etapa }
  | { k: 'stand_by'; p: Proc; ap: string[] };

export default function Funil() {
  const { empresa, edita } = useSessao();
  const prm = useParams(), [fK, eK] = (prm['*'] ?? '').split('/').filter(Boolean);
  const navegar = useNavigate(), toast = useToast(), qc = useQueryClient();
  const q = useQuery({ queryKey: ['funil', empresa?.id], enabled: !!empresa, queryFn: () => carregar(empresa!.id) });
  const [modal, setModal] = useState<Modal | null>(null);
  const [grav, setGrav] = useState(false);
  const arr = useRef<{ id: string; col: string } | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const [orig, setOrig] = useState<string | null>(null);
  const fx = useFiltros('kanban');
  useEffect(() => { document.title = 'Funil'; }, []);
  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} />;
  if (!q.data) return null;
  /* o filtro dos terrenos vale no quadro (menos fase, etapa e subetapa, que vêm da navegação; proto_filtros.js › fxLista('kanban')) */
  const D = { ...q.data, procs: q.data.procs.filter((p) => fx.ok(p.t)) };
  const fase = D.fases.find((x) => x.k === fK) ?? null;
  const etapa = fase?.etapas.find((x) => x.k === eK) ?? null;
  const recarregar = () => { for (const k of ['funil', 'ficha', 'ficha-adv', 'mapa']) qc.invalidateQueries({ queryKey: [k] }); };
  const ir = (f?: string, e?: string) => navegar('/funil' + (f ? '/' + f + (e ? '/' + e : '') : ''));
  const abrir = (t: Ter) => navegar(`/terrenos/${t.codigo}`, { state: { de: 'funil', volta: location.pathname } });

  /* ---------- mover ---------- */
  const rodar = async (fn: () => PromiseLike<{ data: unknown; error: { message: string } | null }>, ok: string) => {
    setGrav(true);
    const { data, error } = await fn();
    setGrav(false);
    if (error) { toast(error.message, true); recarregar(); return null; }
    const d = (data ?? {}) as R;
    if (d.resultado === 'aguardando_aprovacao') toast('Pedido de aprovação enviado.'); else if (ok) toast(ok);
    recarregar();
    return d;
  };
  /* uma passagem: confere antes; com pendência, a justificativa (quem pode) ou a lista do que falta */
  const tentar = async (p: Proc, tipo: string, dest: string, nome: string, exec: (forcar: boolean, j: string) => Promise<void>) => {
    const { data, error } = await supabase.rpc('checar_passagem', { p_processo: p.id, p_destino_tipo: tipo, p_destino: dest });
    if (error) { toast(error.message, true); return; }
    const c = data as Passagem;
    if (c.pedido) { toast('Há um pedido de aprovação em aberto: aguarde a decisão ou cancele o pedido.', true); return; }
    const pend = (c.itens ?? []).filter((x) => !x.ok && x.tipo !== 'aprovacao_pendente');
    if (!pend.length) { await exec(false, ''); return; }
    setModal({ k: c.pode_forcar || c.pode_justificar ? 'forcar' : 'bloq', nome, itens: pend, exec });
  };
  /* avança etapa por etapa até o destino (proto_funil.js › levarAte); para no pedido de aprovação */
  const levar = async (p: Proc, f: Fase, alvo: number, nomeT: string) => {
    const i = f.etapas.findIndex((x) => x.k === p.etapa);
    if (i < 0 || i >= alvo) return;
    const prox = f.etapas[i + 1];
    await tentar(p, 'etapa', prox.k, prox.nome, async (forcar, j) => {
      const d = await rodar(() => supabase.rpc('mover_etapa', { p_processo: p.id, p_forcar: forcar, p_comentario: j || null }), i + 1 === alvo ? `${nomeT}: ${prox.nome}.` : '');
      if (d && d.resultado !== 'aguardando_aprovacao' && i + 1 < alvo) await levar({ ...p, etapa: prox.k }, f, alvo, nomeT);
    });
  };
  async function soltar(pid: string, col: string) {
    const p = D.procs.find((x) => x.id === pid), t = p && D.ters[p.t], f = p && D.fases.find((x) => x.k === p.fase);
    if (!p || !t || !f || !edita) return;
    if (col === 'stand_by') {
      if (p.status !== 'ativo') return;
      const { data } = await supabase.rpc('checar_passagem', { p_processo: p.id, p_destino_tipo: 'status', p_destino: 'stand_by' });
      setModal({ k: 'stand_by', p, ap: (data as Passagem | null)?.aprovacoes ?? [] });
      return;
    }
    if (col.startsWith('sub:')) {
      const k = col.slice(4), s = etapa?.subs.find((x) => x.k === k);
      if (!s || p.status !== 'ativo' || p.sub === k) return;
      await tentar(p, 'subetapa', k, s.nome, async (forcar, j) => {
        await rodar(() => supabase.rpc('mover_subetapa', { p_processo: p.id, p_subetapa: k, p_forcar: forcar, p_comentario: j || null }), `${t.nome}: ${s.nome}.`);
      });
      return;
    }
    const alvo = f.etapas.findIndex((x) => x.k === col), atual = f.etapas.findIndex((x) => x.k === p.etapa);
    if (alvo < 0) return;
    if (p.status === 'stand_by') {
      const d = await rodar(() => supabase.rpc('retomar_processo', { p_processo: p.id }), alvo === atual ? 'Retomada.' : '');
      if (!d || alvo === atual) return;
      p.status = 'ativo';
    }
    if (alvo === atual) return;
    if (alvo < atual) { setModal({ k: 'voltar', p, etapa: f.etapas[alvo] }); return; }
    await levar(p, f, alvo, t.nome);
  }

  /* ---------- arrastar (proto.js › dragstart, dragover, drop) ---------- */
  const arrastavel = edita && !!fase;
  const dnd = (pid: string, col: string) => arrastavel ? {
    draggable: true,
    onDragStart: (e: React.DragEvent) => { arr.current = { id: pid, col }; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', pid); (e.currentTarget as HTMLElement).classList.add('arrastando'); setOrig(col); document.body.classList.add('dnd'); },
    onDragEnd: (e: React.DragEvent) => { (e.currentTarget as HTMLElement).classList.remove('arrastando'); arr.current = null; setOrig(null); setSobre(null); document.body.classList.remove('dnd'); },
  } : {};
  const alvoCol = (col: string) => arrastavel ? {
    onDragOver: (e: React.DragEvent) => { if (!arr.current || col === orig) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (sobre !== col) setSobre(col); },
    onDragLeave: (e: React.DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setSobre((s) => (s === col ? null : s)); },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); const a = arr.current; arr.current = null; setOrig(null); setSobre(null); document.body.classList.remove('dnd'); if (a && a.col !== col) soltar(a.id, col); },
  } : {};

  /* ---------- cards ---------- */
  const outras = (p: Proc) => D.procs.filter((x) => x.t === p.t && x.fase !== p.fase).map((x) => D.fases.find((y) => y.k === x.fase)?.nome ?? x.fase);
  const subN = (f: Fase, p: Proc) => f.etapas.find((x) => x.k === p.etapa)?.subs.find((s) => s.k === p.sub);
  const etN = (f: Fase, k: string) => f.etapas.find((x) => x.k === k)?.nome ?? k;
  const ptTxt = (t: Ter) => { const x = t.negId ? D.partes[t.negId] : null; return x && x.n > 1 ? `${x.n} partes · ${x.comp} compradas` : null; };
  /* nível das fases (kcardFase) */
  const cardFase = (f: Fase, p: Proc, t: Ter) => {
    const s = subN(f, p), sb = p.status === 'stand_by', o = outras(p), pt = f.entrada ? ptTxt(t) : null;
    return (
      <button key={p.id} className="kcard" onClick={() => abrir(t)}>
        <div className="kr"><span className="num faint">{t.codigo}</span>{f.entrada && t.temp ? <TempMini v={t.temp} /> : null}</div>
        <div className="kt">{t.nome}</div>
        {s && <div className="kfe">{etN(f, p.etapa)}</div>}
        <div className="ksub"><span>{s ? s.nome : etN(f, p.etapa)}</span>{sb && <span className="faint">Stand By</span>}</div>
        <div className="ks">{t.bairro ?? ''}{o.length ? ' · também em ' + o.join(', ') : ''}</div>
        {pt && <div className="kpt"><Ic n="layers" s={14} />{pt}</div>}
        <div className="kr"><Av r={t.resp} /><span className="faint">{sb ? 'revisitar ' + fd(p.retomar) : dias(p.desde) + ' d na etapa'}</span></div>
      </button>
    );
  };
  /* etapas e subetapas (kcardNeg na fase de entrada, kcardProc nas outras) */
  const cardProc = (f: Fase, p: Proc, t: Ter, col: string, modoSub: boolean) => {
    const s = subN(f, p), sb = p.status === 'stand_by', ped = D.ped[p.id], o = outras(p);
    const ds = dias(p.subDesde ?? p.desde), atrSub = !!(p.status === 'ativo' && s?.prazo && ds > s.prazo);
    const et = f.etapas.find((x) => x.k === p.etapa), atrEt = !!(p.status === 'ativo' && et?.sla && dias(p.desde) > et.sla);
    const flags = f.entrada && (t.atrasadas > 0 || t.abaixoMin);
    const pt = f.entrada ? ptTxt(t) : null;
    return (
      <button key={p.id} className={`kcard${ped ? ' aprov' : ''}`} onClick={() => abrir(t)} {...dnd(p.id, col)}>
        <div className="kr">{!f.entrada && <span className="num faint">{p.codigo}</span>}<span className="num faint">{t.codigo}</span>{f.entrada && t.temp ? <TempMini v={t.temp} /> : null}</div>
        <div className="kt">{t.nome}</div>
        {!modoSub && s && <div className="ksub"><span>{s.nome}</span><span className="faint">{ds} d</span>{atrSub && <span className="flag warn" title="Passou do prazo da subetapa"><Ic n="clock" s={14} /></span>}</div>}
        <div className="ks">{t.bairro ?? ''}{sb ? ' · parou em ' + etN(f, p.etapa) : ''}{!f.entrada && o.length ? ' · também em ' + o.join(', ') : ''}</div>
        {pt && <div className="kpt"><Ic n="layers" s={14} />{pt}</div>}
        {f.entrada && <div className="kr"><span>{t.proposta != null ? 'Prop. ' + mi(t.proposta) : 'Pedido ' + mi(t.pedido)}</span></div>}
        {flags && <div className="kr kr-fl">
          {t.atrasadas > 0 && <span className="flag crit" title="Tarefas atrasadas"><Ic n="clock" s={14} />{t.atrasadas} atrasada{t.atrasadas > 1 ? 's' : ''}</span>}
          {t.abaixoMin && <span className="flag warn" title="Rentabilidade abaixo da mínima">Abaixo da mínima</span>}
        </div>}
        {f.entrada && t.reuniao && <div className="kr"><span className="faint">Reunião {fd(t.reuniao)} · {new Date(t.reuniao).toTimeString().slice(0, 5)}</span></div>}
        {ped && <div className="kped"><Ic n="clock" s={14} />Aguardando {ped}</div>}
        <div className="kr"><Av r={t.resp} /><span className={`faint${!sb && atrEt && !modoSub ? ' katr' : ''}`}>{sb ? 'revisitar ' + fd(p.retomar) : modoSub ? ds + ' d na subetapa' : dias(p.desde) + ' d na etapa'}</span></div>
      </button>
    );
  };

  /* ---------- topo (negTopo) ---------- */
  const trilha: { l: string; f?: string; e?: string }[] = [{ l: 'Funil' }];
  if (fase) trilha.push({ l: fase.nome, f: fase.k });
  if (fase && etapa) trilha.push({ l: etapa.nome, f: fase.k, e: etapa.k });
  const volta = trilha[trilha.length - 2];
  const topo = (
    <div className="page-h ph-barra"><div className="drill-h">
      {volta && <button className="iconbtn drill-v" title={`Voltar para ${volta.l}`} aria-label={`Voltar para ${volta.l}`} onClick={() => ir(volta.f, volta.e)}><Ic n="back" s={22} /></button>}
      <div>
        {volta && <ol className="drill-t" aria-label="Nível do quadro">{trilha.slice(0, -1).map((x, i) => <li key={i}><button className="linkbtn" onClick={() => ir(x.f, x.e)}>{x.l}</button></li>)}</ol>}
        <h1>{trilha[trilha.length - 1].l}</h1>
      </div>
    </div><div className="ph-l"><BarraFx fx={fx} /></div></div>
  );
  const colDesce = (l: string, dica: string, fn: () => void) => <button className="col-ab" title={dica} onClick={fn}><span>{l}</span><Ic n="chev" s={16} /></button>;
  const col = (k: string, titulo: ReactNode, n: number, corpo: ReactNode[], o: { cls?: string; s?: string; aria: string; vazio: string; drop?: boolean }) => (
    <section key={k} className={`col${o.cls ? ' ' + o.cls : ''}${sobre === k ? ' sobre' : ''}${orig === k ? ' origem' : ''}`} {...(o.drop ? { 'data-col': k, ...alvoCol(k) } : {})} aria-label={o.aria}>
      <div className="col-h">{titulo}<span className="n">{n}</span></div>
      {o.s && <div className="col-s faint">{o.s}</div>}
      {corpo.length ? corpo : <div className="col-empty">{o.vazio}</div>}
    </section>
  );

  let board: ReactNode;
  if (!fase) {
    board = <div className="board board-fases" id="board">{D.fases.map((f) => {
      const L = D.procs.filter((p) => p.fase === f.k);
      return col(f.k, colDesce(f.nome, 'Ver etapas de ' + f.nome, () => ir(f.k)), L.length, L.map((p) => cardFase(f, p, D.ters[p.t])), { aria: f.nome, vazio: 'Nenhum' });
    })}</div>;
  } else if (!etapa) {
    const L = D.procs.filter((p) => p.fase === fase.k);
    board = <div className="board" id="board">
      {fase.etapas.map((e) => {
        const ts = L.filter((p) => p.status === 'ativo' && p.etapa === e.k);
        return col(e.k, colDesce(e.nome, 'Ver subetapas de ' + e.nome, () => ir(fase.k, e.k)), ts.length, ts.map((p) => cardProc(fase, p, D.ters[p.t], e.k, false)), { aria: e.nome, vazio: 'Nenhuma', s: e.sla ? `SLA ${e.sla} d` : undefined, drop: true });
      })}
      {(() => { const ts = L.filter((p) => p.status === 'stand_by'); return col('stand_by', <span>Stand By</span>, ts.length, ts.map((p) => cardProc(fase, p, D.ters[p.t], 'stand_by', false)), { aria: 'Stand By', vazio: 'Nenhuma', cls: 'enc', drop: true }); })()}
    </div>;
  } else {
    const L = D.procs.filter((p) => p.fase === fase.k && p.status === 'ativo' && p.etapa === etapa.k);
    const orf = L.filter((p) => !etapa.subs.some((s) => s.k === p.sub));
    board = <div className="board board-sub" id="board">
      {orf.length > 0 && col('sub:', <span>Sem subetapa ativa</span>, orf.length, orf.map((p) => cardProc(fase, p, D.ters[p.t], 'sub:', true)), { aria: 'Sem subetapa ativa', vazio: 'Nenhuma', cls: 'enc' })}
      {etapa.subs.map((s) => {
        const ts = L.filter((p) => p.sub === s.k), k = 'sub:' + s.k;
        return col(k, <span>{s.nome}</span>, ts.length, ts.map((p) => cardProc(fase, p, D.ters[p.t], k, true)), { aria: s.nome, vazio: 'Nenhuma', s: s.prazo ? `Prazo ${s.prazo} d` : undefined, drop: true });
      })}
    </div>;
  }

  return (
    <div className="forma funil">
      {topo}
      {board}
      {modal && dlg()}
      <GavetaFx fx={fx} />
    </div>
  );

  function dlg(): ReactNode {
    if (!modal) return null;
    const fechar = () => setModal(null);
    const rod = (id: string, l: string) => <><button className="btn text" onClick={fechar}>Cancelar</button><button className="btn primary" type="submit" form={id} disabled={grav}>{l}</button></>;
    const val = (ev: FormEvent<HTMLFormElement>, k: string) => ((ev.currentTarget.elements.namedItem(k) as HTMLInputElement | null)?.value ?? '').trim();
    if (modal.k === 'bloq') return (
      <Dialogo titulo={`Ainda não dá para ir para ${modal.nome}`} sub="Resolva o que falta. Gestor e diretor podem passar sem os requisitos, com justificativa." onFechar={fechar}
        rodape={<button className="btn primary" onClick={fechar}>Entendi</button>}><Itens itens={modal.itens} modal /></Dialogo>
    );
    if (modal.k === 'forcar') return (
      <Dialogo titulo={`Ir para ${modal.nome} sem os requisitos?`} onFechar={fechar} rodape={rod('f-fc', 'Avançar')}>
        <ul className="pend">{modal.itens.map((x, i) => <li key={i}><Ic n="close" s={16} />{x.texto}</li>)}</ul>
        <form id="f-fc" onSubmit={async (ev) => { ev.preventDefault(); const j = val(ev, 'j'); const m = modal; setModal(null); await m.exec(true, j); }}>
          <div className="field"><label htmlFor="fc-j">Justificativa (vai para o histórico)</label><textarea id="fc-j" name="j" required /></div>
        </form>
      </Dialogo>
    );
    if (modal.k === 'voltar') return (
      <Dialogo titulo={`Voltar para ${modal.etapa.nome}?`} sub={D.ters[modal.p.t]?.nome} onFechar={fechar} rodape={rod('f-vt', 'Voltar')}>
        <form id="f-vt" onSubmit={async (ev) => {
          ev.preventDefault(); const c = val(ev, 'motivo'), m = modal;
          if (await rodar(() => supabase.rpc('mover_para_etapa', { p_processo: m.p.id, p_etapa: m.etapa.k, p_comentario: c }), `${D.ters[m.p.t]?.nome}: ${m.etapa.nome}.`)) fechar();
        }}>
          <div className="field"><label htmlFor="vt-m">Motivo (vai para o histórico)</label><textarea id="vt-m" name="motivo" required /></div>
        </form>
      </Dialogo>
    );
    const m = modal as Extract<Modal, { k: 'stand_by' }>;
    return (
      <Dialogo titulo="Colocar em Stand By" sub={D.ters[m.p.t]?.nome} onFechar={fechar} rodape={rod('f-s', 'Colocar em Stand By')}>
        <form id="f-s" onSubmit={async (ev) => {
          ev.preventDefault();
          if (await rodar(() => supabase.rpc('encerrar_processo', { p_processo: m.p.id, p_status: 'stand_by', p_retomar_em: val(ev, 'retomar'), p_detalhe: val(ev, 'detalhe') }), 'Em Stand By.')) fechar();
        }}>
          <div className="fields"><div className="field"><label htmlFor="sp-d">Retomar em</label><input id="sp-d" name="retomar" type="date" min={somarDias(hojeISO(), 1)} defaultValue={somarDias(hojeISO(), 30)} required /></div>
            <div className="field full"><label htmlFor="sp-t">Justificativa</label><textarea id="sp-t" name="detalhe" required /></div></div>
          {m.ap.length > 0 && <div className="banner blue" style={{ marginTop: 12 }}><Ic n="check" /><div>Vai como pedido de aprovação: {m.ap.map((x) => (x === 'gestor' ? 'Gestor' : x === 'diretor' ? 'Diretor' : x)).join(' e ')}.</div></div>}
        </form>
      </Dialogo>
    );
  }
}
