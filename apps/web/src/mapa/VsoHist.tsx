/* VSO histórico do empreendimento, pelo relatório de 36 meses do Órulo (public.im_vso_historico, banco do monitor;
   pedido do Moisés, 12/nov/2026). No card da concorrência, o VSO mensal médio do projeto com a cor do quartil de vendas
   em que ele está (0–25, 25–50, 50–75, 75–100% vendido); o clique abre o gráfico com o VSO mensal médio de cada quartil.
   VSO mensal médio = 1 − (1 − VSO do período)^(1/meses): a taxa que, repetida todo mês sobre o que sobra, vende o mesmo. */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '../components/Moldura';
import { supabase } from '../lib/supabase';
import { mkData, mkPct, num } from './mercado';

export interface Quartil { quartil: number; de: number; ate: number; situacao: 'concluido' | 'em_andamento' | 'futuro'; vendido_ate: number | null; meses: number | null; mesmo_mes: boolean; vso_mes: number | null }
export interface VsoHist {
  primeiro_mes: string; ultimo_mes: string; lancamento: string | null; completo: boolean;
  janelas: Record<'1m' | '3m' | '6m' | '12m' | 'todo', { vso_mes: number | null; liquidas: number; meses: number } | null>;
  geral: { unidades: number; estoque: number; vendido_pct: number | null; meses_desde_lancamento: number | null; vso_mes: number | null };
  vendas: { quartis: Quartil[]; quartil_atual: number | null; vendido_pct: number | null; marcos: Record<string, { mes: string | null; meses: number | null; vso_mes: number | null }> } | null;
}

/* um tom de azul por quartil, do claro ao escuro: quanto mais vendido, mais escuro */
export const VQ_COR = ['#8ab4f8', '#4c8df6', '#1a5fd0', '#0b3d91'];
const VQ_TXT = ['#041e49', '#ffffff', '#ffffff', '#ffffff'];
export const vqNome = (q: number) => ['0 a 25%', '25 a 50%', '50 a 75%', '75 a 100%'][q - 1];

const cache = new Map<string, Promise<VsoHist | null>>();
export function pedirVso(id: string) {
  if (!cache.has(id)) {
    const p = Promise.resolve(supabase.schema('public').rpc('im_vso_historico', { p_emp: id })).then(({ data, error }) => {
      if (error) throw new Error(error.message);
      return (data as VsoHist) || null;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return cache.get(id)!;
}
export function useVso(id: string) {
  const [st, setSt] = useState<{ id: string; d?: VsoHist | null; erro?: boolean }>({ id });
  useEffect(() => {
    let vivo = true;
    setSt({ id });
    pedirVso(id).then((d) => vivo && setSt({ id, d }), () => vivo && setSt({ id, erro: true }));
    return () => { vivo = false; };
  }, [id]);
  return st.id === id ? st : { id };
}

/** linha do card: VSO mensal médio do projeto com o selo do quartil; o clique abre o gráfico */
export function VsoKv({ id, abrir }: { id: string; abrir: () => void }) {
  const st = useVso(id), d = st.d, q = d?.vendas?.quartil_atual || null;
  if (st.erro || (st.d === null)) return null;
  const v = d?.geral?.vso_mes ?? null;
  return (
    <button type="button" className="mk-kv vq-kv" onClick={abrir} disabled={!d} title="VSO mensal médio desde o lançamento (Órulo). Clique para ver por quartil de vendas">
      <span className="muted">VSO mensal médio</span>
      <span className="num">{d ? mkPct(v) : '…'}{q && <span className="vq-chip" style={{ background: VQ_COR[q - 1], color: VQ_TXT[q - 1] }}>{q}º quartil</span>}</span>
      {d && <span className="faint">{d.geral.vendido_pct != null ? num(d.geral.vendido_pct * 100, 0) + '% vendido' : ''}{d.geral.meses_desde_lancamento ? ` em ${d.geral.meses_desde_lancamento} meses` : ''}</span>}
    </button>
  );
}

/* janela sem VSO por ter mais distrato que venda (ajuste de tabela ou devoluções): diz por quê, em vez de só o traço */
const jSub = (j?: { vso_mes: number | null; liquidas: number } | null) => j && j.vso_mes == null && j.liquidas < 0 ? 'mais distratos que vendas' : 'ao mês';

/** janela com o VSO mensal médio de cada quartil de vendas */
export function PopVso({ id, nome, fechar }: { id: string; nome: string; fechar: () => void }) {
  const st = useVso(id), d = st.d;
  const [foco, setFoco] = useState<number | null>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { fechar(); e.preventDefault(); e.stopImmediatePropagation(); } };
    document.addEventListener('keydown', k, true);
    return () => document.removeEventListener('keydown', k, true);
  }, [fechar]);
  const Q = d?.vendas?.quartis || [], atual = d?.vendas?.quartil_atual || null;
  const max = Math.max(0.05, ...Q.map((q) => q.vso_mes || 0));
  const topo = Math.ceil(max * 20) / 20; /* escala em passos de 5% */
  const W = 520, H = 220, ml = 44, mr = 8, mt = 24, mb = 44, bw = 56, slot = (W - ml - mr) / 4;
  const y = (v: number) => mt + (H - mt - mb) * (1 - v / topo);
  const marcas = Array.from({ length: Math.round(topo / 0.05) + 1 }, (_, i) => i * 0.05).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  const ini = d ? mkData(d.primeiro_mes).slice(3) : '';
  const desc = (q: Quartil) => q.situacao === 'futuro' ? 'Ainda não chegou'
    : q.vso_mes == null ? (q.situacao === 'em_andamento' && q.meses != null ? 'Entrou neste quartil agora' : `Começou antes do histórico (${ini})`)
    : `${mkPct(q.vso_mes)} ao mês${q.meses ? ` · ${q.meses} ${q.meses === 1 ? 'mês' : 'meses'}` : ''}${q.mesmo_mes ? ' (no mesmo mês do anterior)' : ''}${q.situacao === 'em_andamento' ? ' · em andamento' : ''}`;
  const J = d?.janelas;
  const algum = Q.some((q) => q.vso_mes != null);
  return createPortal(
    <div className="scrim" onMouseDown={(ev) => ev.target === ev.currentTarget && fechar()}>
      <div className="dialog vq-dlg" role="dialog" aria-modal="true" aria-label={`VSO de ${nome}`}>
        <div className="dh"><div><h2>VSO mensal médio por quartil de vendas</h2><div className="muted" style={{ marginTop: 4 }}>{nome}</div></div>
          <button className="iconbtn" aria-label="Fechar" onClick={fechar}><Ic n="close" /></button></div>
        {!d ? <div className="muted">{st.erro ? 'Não foi possível trazer o histórico.' : 'Trazendo o histórico…'}</div> : <>
          <div className="vq-res">
            <div><span className="muted">Desde o lançamento</span><b className="num">{mkPct(d.geral.vso_mes)}</b><span className="faint">ao mês</span></div>
            <div><span className="muted">Últimos 3 meses</span><b className="num">{mkPct(J?.['3m']?.vso_mes ?? null)}</b><span className="faint">{jSub(J?.['3m'])}</span></div>
            <div><span className="muted">Últimos 12 meses</span><b className="num">{mkPct(J?.['12m']?.vso_mes ?? null)}</b><span className="faint">{jSub(J?.['12m'])}</span></div>
            <div><span className="muted">Vendido</span><b className="num">{d.geral.vendido_pct == null ? '—' : num(d.geral.vendido_pct * 100, 0) + '%'}</b>
              <span className="faint">{atual ? `${atual}º quartil` : ''}</span></div>
          </div>
          {!algum && <div className="vq-vazio muted">Sem VSO por quartil: o histórico do Órulo deste empreendimento começa em {ini}{d.lancamento ? `, depois do lançamento (${mkData(d.lancamento).slice(3)})` : ' e o lançamento não está no monitor'}, e não dá para saber em que mês ele passou de cada quartil.</div>}
          {algum && <svg className="vq-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="VSO mensal médio em cada quartil de vendas">
            {marcas.map((v) => <g key={v}><line x1={ml} x2={W - mr} y1={y(v)} y2={y(v)} className="vq-grade" />
              <text x={ml - 6} y={y(v) + 4} textAnchor="end" className="vq-eixo">{num(v * 100, 0)}%</text></g>)}
            {Q.map((q, i) => {
              const x = ml + slot * i + (slot - bw) / 2, v = q.vso_mes, h = v == null ? 0 : Math.max(2, y(0) - y(v)), on = foco === i;
              const cor = VQ_COR[i];
              return (
                <g key={i} onPointerEnter={() => setFoco(i)} onPointerLeave={() => setFoco(null)} onFocus={() => setFoco(i)} onBlur={() => setFoco(null)} tabIndex={0}
                  aria-label={`${vqNome(q.quartil)}: ${desc(q)}`}>
                  <rect x={ml + slot * i} y={mt} width={slot} height={H - mt - mb} fill="transparent" />
                  {v != null && <path d={`M${x},${y(0)} v${-(h - 4)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${h - 4} z`} fill={cor}
                    opacity={foco != null && !on ? 0.45 : 1} className={q.situacao === 'em_andamento' ? 'vq-and' : ''} />}
                  {v == null && <line x1={x} x2={x + bw} y1={y(0) - 1} y2={y(0) - 1} stroke={cor} strokeWidth={2} strokeDasharray="4 3" />}
                  <text x={x + bw / 2} y={v == null ? y(0) - 8 : y(v) - 6} textAnchor="middle" className="vq-val">{v == null ? '—' : mkPct(v)}</text>
                  <text x={x + bw / 2} y={H - mb + 16} textAnchor="middle" className="vq-eixo">{vqNome(q.quartil)}</text>
                  <text x={x + bw / 2} y={H - mb + 31} textAnchor="middle" className="vq-sub">{q.situacao === 'futuro' ? 'ainda não' : q.meses ? `${q.meses} ${q.meses === 1 ? 'mês' : 'meses'}` : ''}{q.quartil === atual ? ' · atual' : ''}</text>
                </g>);
            })}
            <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} className="vq-base" />
          </svg>}
          {algum && <div className="vq-dica" aria-live="polite">{foco != null && Q[foco] ? <><b>{vqNome(Q[foco].quartil)} vendido</b> · {desc(Q[foco])}</> : <span className="faint">Passe o mouse numa barra para ver os detalhes.</span>}</div>}
          <table className="vq-tab"><thead><tr><th>Quartil</th><th className="num">VSO mensal médio</th><th className="num">Meses</th><th>Situação</th></tr></thead>
            <tbody>{Q.map((q, i) => <tr key={i}><td><span className="vq-pt" style={{ background: VQ_COR[i] }} />{vqNome(q.quartil)}</td><td className="num">{mkPct(q.vso_mes)}</td>
              <td className="num">{q.meses ?? '—'}</td><td>{q.situacao === 'concluido' ? 'Concluído' : q.situacao === 'em_andamento' ? 'Em andamento' : 'Ainda não chegou'}{q.mesmo_mes ? ' (mesmo mês)' : ''}</td></tr>)}</tbody></table>
          <div className="faint vq-nota">Relatório de vendas do Órulo, {mkData(d.primeiro_mes).slice(3)} a {mkData(d.ultimo_mes).slice(3)}. VSO mensal médio do quartil = a taxa mensal sobre o que sobrava ao entrar nele, contada pelos meses que o projeto levou para atravessá-lo. Os primeiros 25% costumam sair já no mês do lançamento, com a pré-venda.{!d.completo && algum && ` O histórico deste empreendimento começa em ${ini}, depois do lançamento: quartil vencido antes disso fica sem VSO.`}</div>
        </>}
      </div>
    </div>, document.body);
}
