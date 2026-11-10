// Aba Jornada da ficha (a antiga seção Fases), porte de tools/prototipo/proto.js › abaJornada: a linha do tempo da
// negociação (proto_funil.js › trilhaHtml: dias em cada etapa e subetapa, contra o SLA) e as fases do terreno
// (proto_fases.js › abaFases: a situação de cada fase, o que falta para abrir e o botão Abrir, "Abrir antes da hora" para
// gestor e diretor, com justificativa, e Reabrir na fase descartada). Tudo pelo banco: app.fases_do_terreno e
// app.abrir_fase (regra 2 do CLAUDE.md: o front não abre processo direto).
import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { data as fd, diasEntre, hojeISO } from '../lib/format';
import { Dialogo, useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { Quadro } from './edicao';
import { useRecarregar } from './Avanco';
import type { Ficha, R } from './dados';

interface Dep { ok: boolean; texto: string }
interface FaseT { fase: string; nome: string; entrada: boolean; processo_id: string | null; processo_codigo: string | null; status: string | null; status_nome: string | null; dependencias: Dep[] }
interface Periodo { e: string; s: string | null; ini: string; fim: string | null; user: string }

/* começa um período: abertura, avanço, volta, troca de subetapa e retomada; encerram: conclusão, descarte, perda e Stand By */
const INICIA = new Set(['abertura', 'avanco', 'retorno', 'subetapa', 'retomada']);

async function carregar(empresa: string, terreno: string) {
  const fs = await supabase.rpc('fases_do_terreno', { p_terreno: terreno });
  if (fs.error) throw fs.error;
  const fases = (fs.data ?? []) as FaseT[];
  const ent = fases.find((x) => x.entrada);
  if (!ent?.processo_id) return { fases, trilha: null };
  const [tr, et, sb, pr] = await Promise.all([
    supabase.from('processo_transicoes').select('evento,para_etapa,para_subetapa,user_id,em').eq('processo_id', ent.processo_id).order('em'),
    supabase.from('etapas_modelo').select('codigo,nome,ordem,sla_dias').eq('empresa_id', empresa).eq('fase', ent.fase).order('ordem'),
    supabase.from('subetapas_modelo').select('etapa,codigo,nome').eq('empresa_id', empresa).eq('fase', ent.fase),
    supabase.from('processos').select('status,data_encerramento').eq('id', ent.processo_id).maybeSingle(),
  ]);
  for (const r of [tr, et, sb, pr]) if (r.error) throw r.error;
  const ev = ((tr.data ?? []) as R[]).filter((x) => x.evento !== 'temperatura');
  const uids = [...new Set(ev.map((x) => x.user_id).filter(Boolean))] as string[];
  const us = uids.length ? await supabase.from('usuarios').select('user_id,nome,email').in('user_id', uids) : { data: [], error: null };
  if (us.error) throw us.error;
  const nome = new Map(((us.data ?? []) as R[]).map((u) => [u.user_id, u.nome || u.email]));
  const proc = pr.data as R | null, ativo = proc?.status === 'ativo';
  const per: Periodo[] = [];
  ev.forEach((x, i) => {
    if (!INICIA.has(x.evento) || !x.para_etapa) return;
    const fim = ev[i + 1] ? String(ev[i + 1].em).slice(0, 10) : ativo ? hojeISO() : null;
    per.push({ e: x.para_etapa, s: x.para_subetapa, ini: String(x.em).slice(0, 10), fim, user: x.user_id ? nome.get(x.user_id) ?? '' : 'Sistema' });
  });
  return {
    fases,
    trilha: {
      per, etapas: (et.data ?? []) as R[], subs: (sb.data ?? []) as R[],
      fim: proc && !ativo && proc.status !== 'stand_by' ? { status: ent.status_nome ?? proc.status, em: proc.data_encerramento as string | null } : null,
    },
  };
}

export default function AbaJornada({ f }: { f: Ficha }) {
  const { empresa } = useSessao();
  const q = useQuery({ queryKey: ['ficha-jornada', f.id, f.versao, f.procs.map((p) => p.status + p.etapa + p.sub).join()], enabled: !!empresa, queryFn: () => carregar(empresa!.id, f.id) });
  if (q.error) return <section className="sec"><div className="banner warn"><Ic n="warn" /><div>Não foi possível carregar a jornada: {(q.error as Error).message}</div></div></section>;
  if (!q.data) return <section className="sec"><div className="empty">Carregando...</div></section>;
  return (
    <>
      {q.data.trilha ? <Trilha t={q.data.trilha} /> : null}
      <Fases f={f} fases={q.data.fases} primeiro={!q.data.trilha} />
    </>
  );
}

/** a linha do tempo da negociação: cada etapa com a data de entrada, os dias somados e o SLA, e as subetapas por onde passou */
function Trilha({ t }: { t: NonNullable<Awaited<ReturnType<typeof carregar>>['trilha']> }) {
  const subN = (e: string, s: string | null) => (s ? t.subs.find((x) => x.etapa === e && x.codigo === s)?.nome ?? s : '—');
  const etapas = t.etapas.filter((e) => t.per.some((p) => p.e === e.codigo));
  return (
    <Quadro aba="jornada" id="trilha" primeiro titulo="Linha do tempo">
      <div className="sec-b">
        {etapas.length ? (
          <ol className="trilha">
            {etapas.map((e) => {
              const ps = t.per.filter((p) => p.e === e.codigo), dias = ps.reduce((a, p) => a + (p.fim ? diasEntre(p.ini, p.fim) : 0), 0), sla = e.sla_dias as number | null;
              return (
                <li key={e.codigo} className="tr-e">
                  <div className="tr-eh"><b>{e.nome}</b><span className="faint">{fd(ps[0].ini)} · {dias} d{sla ? ` de ${sla}` : ''}</span>{sla && dias > sla ? <span className="chip warn">acima do prazo</span> : null}</div>
                  <ul>{ps.map((p, i) => (
                    <li key={i}><span>{subN(p.e, p.s)}</span><span className="faint">{fd(p.ini)}{p.fim ? ' → ' + fd(p.fim) : ''}{p.fim ? ` · ${diasEntre(p.ini, p.fim)} d` : ''}{p.user ? ` · ${p.user}` : ''}</span></li>
                  ))}</ul>
                </li>
              );
            })}
            {t.fim ? <li className="tr-e"><div className="tr-eh"><b>{t.fim.status}</b><span className="faint">{fd(t.fim.em)}</span></div></li> : null}
          </ol>
        ) : <div className="empty">Sem passagens registradas.</div>}
      </div>
    </Quadro>
  );
}

/** as fases do terreno: situação, datas, o que falta para abrir e o botão para abrir à mão */
function Fases({ f, fases, primeiro }: { f: Ficha; fases: FaseT[]; primeiro: boolean }) {
  const { edita, eGestor } = useSessao();
  const toast = useToast(), recarregar = useRecarregar();
  const [modal, setModal] = useState<{ fase: FaseT; falta: Dep[] } | null>(null);
  const [just, setJust] = useState(''), [grav, setGrav] = useState(false);
  /* a próxima fase que falta (a primeira, na ordem, que o terreno nunca teve) */
  const proxima = fases.find((x) => !x.entrada && !x.processo_id)?.fase;
  const abrir = async (x: FaseT, forcar = false) => {
    setGrav(true);
    const { error } = await supabase.rpc('abrir_fase', { p_terreno: f.id, p_fase: x.fase, p_forcar: forcar, p_comentario: forcar ? just.trim() : null });
    setGrav(false);
    if (error) { toast(error.message, true); return; }
    toast(`${x.nome} aberta.`); setModal(null); setJust(''); recarregar();
  };
  const clicar = (x: FaseT) => {
    const falta = (x.dependencias ?? []).filter((d) => !d.ok);
    if (!falta.length) { void abrir(x); return; }
    setJust(''); setModal({ fase: x, falta });
  };
  const enviar = (ev: FormEvent) => { ev.preventDefault(); if (!modal) return; if (!just.trim()) { toast('Justifique a abertura antes da hora.', true); return; } void abrir(modal.fase, true); };
  return (
    <>
      <Quadro aba="jornada" id="fases" primeiro={primeiro} titulo="Fases do terreno">
        <div className="sec-b">
          <ul className="fs-lst">
            {fases.map((x) => {
              const p = f.procs.find((y) => y.id === x.processo_id), deps = x.entrada ? [] : x.dependencias ?? [], falta = deps.filter((d) => !d.ok);
              const ab = x.status === 'ativo' || x.status === 'stand_by';
              const etapa = p ? f.etapasPorFase[x.fase]?.find((e) => e.k === p.etapa) : undefined, sub = etapa?.subs.find((s) => s.k === p?.sub);
              const st = !x.processo_id ? <span className="chip">{x.entrada ? 'Sem negociação' : 'Não aberta'}</span>
                : x.status === 'ativo' ? <><span className="chip fase">{etapa?.nome ?? p?.etapa ?? ''}</span>{sub ? <span className="chip sub">{sub.nome}</span> : null}</>
                : <span className={`chip ${x.status === 'concluido' ? 'good' : x.status === 'stand_by' ? 'warn' : ''}`}><span className="d" />{x.status_nome ?? x.status}</span>;
              /* abrir à mão: a próxima fase que falta, fase sem dependência, ou reabrir a descartada */
              const pode = !x.entrada && edita && (x.processo_id ? x.status === 'descartado' : proxima === x.fase || !deps.length);
              return (
                <li key={x.fase} className={`fs-i ${ab ? 'aberta' : ''}`}>
                  <div className="fs-it"><b>{x.nome}</b>{x.processo_codigo ? <span className="num faint">{x.processo_codigo}</span> : null}<span className="fs-st">{st}</span></div>
                  {p ? <div className="faint fs-d">{fd(p.desde)}{p.encerrado && !ab ? ' → ' + fd(p.encerrado) : ''}</div> : null}
                  {!x.processo_id && deps.length ? (
                    <ul className="fs-deps">{deps.map((d, i) => (
                      <li key={i} className={d.ok ? 'ok' : 'no'}>{d.ok ? <Ic n="check" s={14} /> : <span className="dep-o" aria-hidden="true" />}{d.ok ? '' : 'Falta: '}{d.texto}</li>
                    ))}</ul>
                  ) : null}
                  {!x.processo_id && !x.entrada && !deps.length ? <div className="faint fs-d">Sem dependência: abre à mão.</div> : null}
                  {pode ? (
                    <button className={`btn sm ${x.processo_id ? 'text' : ''}`} disabled={grav} onClick={() => clicar(x)}>
                      <Ic n="fwd" s={16} />{x.processo_id ? 'Reabrir' : 'Abrir'}{falta.length ? ' antes da hora' : ''}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      </Quadro>
      {modal ? (eGestor ? (
        <Dialogo titulo={`Abrir ${modal.fase.nome} antes da hora?`} onFechar={() => setModal(null)}
          rodape={<><button className="btn text" onClick={() => setModal(null)}>Cancelar</button><button className="btn primary" type="submit" form="f-forcar" disabled={grav}>Abrir fase</button></>}>
          <ul className="pend">{modal.falta.map((d, i) => <li key={i}><Ic n="close" s={16} />{d.texto}</li>)}</ul>
          <form id="f-forcar" onSubmit={enviar}>
            <div className="field"><label htmlFor="ff-j">Justificativa (vai para o histórico)</label><textarea id="ff-j" value={just} onChange={(e) => setJust(e.target.value)} /></div>
          </form>
        </Dialogo>
      ) : (
        <Dialogo titulo={`${modal.fase.nome} ainda não abre`} sub="Gestor e diretor podem abrir antes da hora, com justificativa." onFechar={() => setModal(null)}
          rodape={<button className="btn primary" onClick={() => setModal(null)}>Entendi</button>}>
          <ul className="adv-lista adv-modal">{modal.falta.map((d, i) => <li key={i}><span className="no"><Ic n="close" s={16} /></span><span>{d.texto}</span></li>)}</ul>
        </Dialogo>
      )) : null}
    </>
  );
}
