/* VSO histórico do empreendimento, pelo relatório de 36 meses do Órulo (public.im_vso_historico, banco do monitor;
   pedido do Moisés, 12/nov/2026). No card da concorrência, o VSO mensal médio do projeto com a cor do quartil de vendas
   em que ele está (0–25, 25–50, 50–75, 75–100% vendido); o clique abre o gráfico com o VSO mensal médio de cada quartil.
   VSO mensal médio = 1 − (1 − VSO do período)^(1/meses): a taxa que, repetida todo mês sobre o que sobra, vende o mesmo. */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Ic } from '../components/Moldura';
import { supabase } from '../lib/supabase';
import { mkData, mkPct, num } from './mercado';

export interface Quartil { quartil: number; de: number; ate: number; situacao: 'concluido' | 'em_andamento' | 'futuro'; vendido_ate: number | null; meses: number | null; mesmo_mes: boolean; vso_mes: number | null }
export interface VsoHist {
  primeiro_mes: string; ultimo_mes: string; lancamento: string | null; completo: boolean;
  janelas: Record<'1m' | '3m' | '6m' | '12m' | 'todo', { vso_mes: number | null; vendas: number; liquidas: number; distratos: number; estoque: number; meses: number } | null>;
  geral: { unidades: number; estoque: number; vendido: number; vendido_pct: number | null; meses_desde_lancamento: number | null; vso_mes: number | null };
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

/* VSO mensal médio dos últimos 3 meses; com menos de 3 meses de histórico, o do período que houver (pedido do Moises, 12/nov/2026).
   A janela de 3 meses já conta só os meses que existem no histórico (`meses`). */
/* janela de n meses até o último mês do histórico. Se o lançamento cai dentro dela, vale o desde o lançamento (vendido ÷ unidades):
   o relatório do Órulo só conta como venda a unidade que sai da tabela, e a pré-venda (unidades que já entram vendidas) ficaria de fora,
   achatando o VSO de quem lançou há pouco. */
type Jan = { vso_mes: number | null; vendas: number; distratos: number; liquidas: number; meses: number; lanc: boolean };
export function janela(d: VsoHist, n: 3 | 6 | 12): Jan | null {
  const g = d.geral, ml = g.meses_desde_lancamento;
  if (ml != null && ml > 0 && ml <= n) return { vso_mes: g.vso_mes, vendas: g.vendido, distratos: 0, liquidas: g.vendido, meses: ml, lanc: true };
  const j = d.janelas[`${n}m` as '3m' | '6m' | '12m'];
  if (!j) return null;
  /* mais distrato que venda: VSO negativo, pela mesma conta (pedido do Moises, 12/nov/2026); o banco devolve nulo nesse caso */
  let v = j.vso_mes;
  if (v == null && j.liquidas < 0 && j.liquidas + j.estoque > 0 && j.meses > 0) {
    const p = j.liquidas / (j.liquidas + j.estoque);
    v = Math.round((1 - Math.pow(1 - p, 1 / j.meses)) * 1e4) / 1e4;
  }
  return { ...j, vso_mes: v, lanc: false };
}


/** bloco do card: VSO mensal médio dos últimos 3 meses, vendas nesses meses e o quartil de vendas em que o projeto está (Órulo);
    o clique abre o gráfico. Sem histórico do Órulo, fica o que o monitor mediu (`semHist`). */
export function VsoKv({ id, abrir, semHist }: { id: string; abrir: () => void; semHist: ReactNode }) {
  const st = useVso(id), d = st.d, q = d?.vendas?.quartil_atual || null;
  const [info, setInfo] = useState(false);
  if (st.erro || st.d === null || (d && !janela(d, 3))) return <>{semHist}</>;
  const j = d ? janela(d, 3) : null;
  return (
    <button type="button" className="vq-kv" onClick={abrir} disabled={!d} title="Histórico de vendas do Órulo. Clique para ver o VSO de cada quartil de vendas">
      {/* quadro com os VSOs médios mensais de 3, 6 e 12 meses e do empreendimento inteiro (pedido do Moises, 12/nov/2026) */}
      <span className="vq-quadro"><span className="muted vq-quadro-t">VSO mensal médio{d ? ` · até ${mkData(d.ultimo_mes).slice(3)}` : ''}</span>
        {([3, 6, 12] as const).map((n) => { const w = d ? janela(d, n) : null; return (
          <span key={n} className="vq-cel" title={w?.liquidas != null && w.liquidas < 0 ? 'Mais distratos que vendas' : w?.lanc ? `Lançado há ${w.meses} ${w.meses === 1 ? 'mês' : 'meses'}: vale o desde o lançamento` : undefined}>
            <span className="faint">{n} meses</span><span className="num">{d ? mkPct(w?.vso_mes ?? null) : '…'}{w?.lanc ? '*' : ''}</span></span>); })}
        <span className="vq-cel"><span className="faint">Desde o lançamento</span><span className="num">{d ? mkPct(d.geral.vso_mes) : '…'}</span></span>
        {d && [3, 6, 12].some((n) => janela(d, n as 3 | 6 | 12)?.lanc) && <span className="faint vq-quadro-n">* lançado há {d.geral.meses_desde_lancamento} {d.geral.meses_desde_lancamento === 1 ? 'mês' : 'meses'}: vale o desde o lançamento</span>}
      </span>
      {/* vendas líquidas (pode ser negativa) e o ⓘ com vendas e distratos (pedido do Moises, 12/nov/2026) */}
      <span className="mk-kv vq-liq"><span className="muted">Vendas líquidas{j?.lanc ? '' : ` em ${j ? j.meses : 3} ${j?.meses === 1 ? 'mês' : 'meses'}`}</span>
        <span className="num">{d && j ? num(j.liquidas) : '…'}{d && j && <span role="button" tabIndex={0} className="vq-i" aria-label="Ver vendas e distratos" aria-expanded={info}
          onClick={(ev) => { ev.stopPropagation(); setInfo(!info); }} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ev.stopPropagation(); setInfo(!info); } }}>i</span>}</span>
        {d && <span className="faint">{j?.lanc ? 'desde o lançamento' : `até ${mkData(d.ultimo_mes).slice(3)}`}</span>}
        {info && j && <span className="vq-info" onClick={(ev) => ev.stopPropagation()}>{j.lanc
          ? <>Lançado há {j.meses} {j.meses === 1 ? 'mês' : 'meses'}: {num(j.vendas)} unidades vendidas desde o lançamento, com a pré-venda.</>
          : <><b>{num(j.vendas)}</b> venda{j.vendas === 1 ? '' : 's'} e <b>{num(j.distratos)}</b> distrato{j.distratos === 1 ? '' : 's'} em {j.meses} {j.meses === 1 ? 'mês' : 'meses'} (até {mkData(d!.ultimo_mes).slice(3)}).</>}</span>}</span>
      <span className="mk-kv vq-kv-q"><span className="muted">Quartil de vendas</span>
        <span className="num">{q ? <span className="vq-chip" style={{ background: VQ_COR[q - 1], color: VQ_TXT[q - 1] }}>{q}º quartil</span> : d ? '—' : '…'}</span>
        {d && <span className="faint">{d.geral.vendido_pct != null ? num(d.geral.vendido_pct * 100, 0) + '% vendido' : ''}{d.geral.meses_desde_lancamento ? ` em ${d.geral.meses_desde_lancamento} meses` : ''}</span>}</span>
      <span className="vq-kv-ver">Ver VSO por quartil<Ic n="chev" s={16} /></span>
    </button>
  );
}

/* janela sem VSO por ter mais distrato que venda (ajuste de tabela ou devoluções): diz por quê, em vez de só o traço */
const jSub = (_j?: unknown) => 'ao mês';

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
  const W = 520, H = 236, ml = 44, mr = 8, mt = 24, mb = 58, bw = 56, slot = (W - ml - mr) / 4;
  const y = (v: number) => mt + (H - mt - mb) * (1 - v / topo);
  const marcas = Array.from({ length: Math.round(topo / 0.05) + 1 }, (_, i) => i * 0.05).filter((_, i, a) => a.length <= 6 || i % 2 === 0);
  const ini = d ? mkData(d.primeiro_mes).slice(3) : '';
  const desc = (q: Quartil) => q.situacao === 'futuro' ? 'Ainda não chegou'
    : q.vso_mes == null ? (q.situacao === 'em_andamento' && q.meses != null ? 'Entrou neste quartil agora' : `Começou antes do histórico (${ini})`)
    : `${mkPct(q.vso_mes)} ao mês${q.meses ? ` · ${q.meses} ${q.meses === 1 ? 'mês' : 'meses'}` : ''}${q.mesmo_mes ? ' (no mesmo mês do anterior)' : ''}${q.situacao === 'em_andamento' ? ' · em andamento' : ''}`;
  const j3 = d ? janela(d, 3) : null, j6 = d ? janela(d, 6) : null, j12 = d ? janela(d, 12) : null;
  /* prazo para atingir o quartil: meses desde o lançamento até o mês em que chegou ao fim dele (marcos de 25, 50, 75 e 99%) */
  const MK = ['25', '50', '75', '99'];
  const ating = (q: Quartil) => d?.vendas?.marcos?.[MK[q.quartil - 1]] || null;
  const prazo = (q: Quartil) => { const m = ating(q); return q.situacao === 'futuro' ? 'ainda não chegou' : q.situacao === 'em_andamento' ? 'em andamento'
    : m?.meses ? `atingido no ${m.meses}º mês` : 'antes do histórico'; };
  const algum = Q.some((q) => q.vso_mes != null);
  return createPortal(
    <div className="scrim" onMouseDown={(ev) => ev.target === ev.currentTarget && fechar()}>
      <div className="dialog vq-dlg" role="dialog" aria-modal="true" aria-label={`VSO de ${nome}`}>
        <div className="dh"><div><h2>VSO mensal médio por quartil de vendas</h2><div className="muted" style={{ marginTop: 4 }}>{nome}</div></div>
          <button className="iconbtn" aria-label="Fechar" onClick={fechar}><Ic n="close" /></button></div>
        {!d ? <div className="muted">{st.erro ? 'Não foi possível trazer o histórico.' : 'Trazendo o histórico…'}</div> : <>
          <div className="vq-res">
            <div><span className="muted">Últimos 3 meses</span><b className="num">{mkPct(j3?.vso_mes ?? null)}</b><span className="faint">{jSub(j3)}{j3 ? ` · ${num(j3.vendas)} vendas${j3.distratos ? `, ${num(j3.distratos)} distratos` : ''}` : ''}{j3?.lanc ? ` · lançado há ${j3.meses} ${j3.meses === 1 ? 'mês' : 'meses'}` : ''}</span></div>
            <div><span className="muted">Últimos 6 meses</span><b className="num">{mkPct(j6?.vso_mes ?? null)}</b><span className="faint">{jSub(j6)}{j6?.lanc ? ` · lançado há ${j6.meses} ${j6.meses === 1 ? 'mês' : 'meses'}` : ''}</span></div>
            <div><span className="muted">Últimos 12 meses</span><b className="num">{mkPct(j12?.vso_mes ?? null)}</b><span className="faint">{jSub(j12)}{j12?.lanc ? ` · lançado há ${j12.meses} ${j12.meses === 1 ? 'mês' : 'meses'}` : ''}</span></div>
            <div><span className="muted">Desde o lançamento</span><b className="num">{mkPct(d.geral.vso_mes)}</b><span className="faint">ao mês</span></div>
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
                  <text x={x + bw / 2} y={H - mb + 16} textAnchor="middle" className="vq-eixo vq-q">{q.quartil}º quartil</text>
                  <text x={x + bw / 2} y={H - mb + 31} textAnchor="middle" className="vq-sub">{vqNome(q.quartil)}{q.quartil === atual ? ' · atual' : ''}</text>
                  <text x={x + bw / 2} y={H - mb + 45} textAnchor="middle" className="vq-sub">{prazo(q)}</text>
                </g>);
            })}
            <line x1={ml} x2={W - mr} y1={y(0)} y2={y(0)} className="vq-base" />
          </svg>}
          {algum && <div className="vq-dica" aria-live="polite">{foco != null && Q[foco] ? <><b>{vqNome(Q[foco].quartil)} vendido</b> · {desc(Q[foco])}</> : <span className="faint">Passe o mouse numa barra para ver os detalhes.</span>}</div>}
          <table className="vq-tab"><thead><tr><th>Quartil</th><th className="num">VSO médio</th><th className="num">Duração</th><th>Atingido em</th><th>Situação</th></tr></thead>
            <tbody>{Q.map((q, i) => <tr key={i}><td><span className="vq-pt" style={{ background: VQ_COR[i] }} />{q.quartil}º <span className="faint">({vqNome(q.quartil)})</span></td><td className="num">{mkPct(q.vso_mes)}</td>
              <td className="num">{q.meses ? `${q.meses} ${q.meses === 1 ? 'mês' : 'meses'}` : '—'}</td>
              <td>{ating(q)?.meses && q.situacao === 'concluido' ? `${ating(q)!.meses}º mês (${mkData(ating(q)!.mes).slice(3)})` : '—'}</td><td>{q.situacao === 'concluido' ? 'Concluído' : q.situacao === 'em_andamento' ? 'Em andamento' : 'Ainda não chegou'}{q.mesmo_mes ? ' (mesmo mês)' : ''}</td></tr>)}</tbody></table>
          <div className="faint vq-nota">Relatório de vendas do Órulo, {mkData(d.primeiro_mes).slice(3)} a {mkData(d.ultimo_mes).slice(3)}. VSO mensal médio do quartil = a taxa mensal sobre o que sobrava ao entrar nele, contada pelos meses que o projeto levou para atravessá-lo (duração). Atingido em = meses desde o lançamento (o mês do lançamento é o 1º) até o mês em que o vendido chegou ao fim do quartil (99% no último). Os primeiros 25% costumam sair já no mês do lançamento, com a pré-venda. Nos últimos 3, 6 e 12 meses, quem lançou dentro do período fica com o VSO desde o lançamento, porque o relatório não conta a pré-venda como venda do mês.{!d.completo && algum && ` O histórico deste empreendimento começa em ${ini}, depois do lançamento: quartil vencido antes disso fica sem VSO.`}</div>
        </>}
      </div>
    </div>, document.body);
}
