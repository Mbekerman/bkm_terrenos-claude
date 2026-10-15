import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useEtapas, useProcessos } from '../lib/api';
import { data, m2, milhoes } from '../lib/format';
import type { ProcessoResumo } from '../lib/types';
import { Avatar, Carregando, Erro, Icon } from '../components/ui';

function Cartao({ p }: { p: ProcessoResumo }) {
  return (
    <Link className="kcard" to={`/terrenos/${p.terreno_id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="kr"><span className="num faint">{p.codigo}</span>
        <span className="num" title="Dias nesta etapa">{p.status === 'ganha' ? data(p.encerrado_em) : `${p.dias_na_etapa} d`}</span></div>
      <div className="kt">{p.bairro}</div>
      <div className="ks">{p.endereco}</div>
      <div className="kr"><span className="num">{m2(p.area_m2)}</span>
        <span className="num" style={{ color: 'var(--ink)', fontWeight: 500 }}>{p.ultima_proposta_valor ? 'Prop. ' : 'Pedido '}{milhoes(p.valor_referencia)}</span></div>
      <div className="kr">
        <Avatar nome={p.responsavel_nome} sm />
        <span className="flags">
          {p.docs_vencidos > 0 && <span className="flag crit" title="Documentos vencidos"><Icon n="doc" s={14} />{p.docs_vencidos}</span>}
          {p.tarefas_atrasadas > 0 && <span className="flag crit" title="Tarefas atrasadas"><Icon n="clock" s={14} />{p.tarefas_atrasadas}</span>}
          {p.acima_preco_max && <span className="flag warn" title="Proposta acima do preço máximo"><Icon n="money" s={14} /></span>}
        </span>
      </div>
    </Link>
  );
}

export default function Negociacoes() {
  const [vista, setVista] = useState<'ativas' | 'enc'>('ativas');
  const proc = useProcessos();
  const etapas = useEtapas().data ?? [];
  if (proc.isLoading) return <Carregando />;
  if (proc.error) return <Erro erro={proc.error} />;
  const todos = proc.data ?? [];
  const enc = todos.filter((p) => p.status === 'perdida' || p.status === 'suspensa');

  return (
    <>
      <div className="page-h">
        <div><h1>Negociações</h1><div className="sub">Abra um card para avançar a etapa. As regras de cada etapa são checadas antes de mover.</div></div>
        <div className="seg">
          <button aria-pressed={vista === 'ativas'} onClick={() => setVista('ativas')}>Em andamento</button>
          <button aria-pressed={vista === 'enc'} onClick={() => setVista('enc')}>Perdidas e suspensas ({enc.length})</button>
        </div>
      </div>
      {vista === 'ativas' ? (
        <div className="board">
          {etapas.map((e) => {
            const ps = todos.filter((p) => p.etapa_atual === e.codigo && (p.status === 'ativo' || (e.codigo === 'ganha' && p.status === 'ganha')));
            return (
              <section className="col" key={e.codigo}>
                <div className="col-h"><span>{e.nome}</span><span className="n">{ps.length}</span></div>
                {ps.length ? ps.map((p) => <Cartao key={p.id} p={p} />) : <div className="col-empty">Nenhuma</div>}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="tbl">
          {enc.length ? enc.map((p) => (
            <Link key={p.id} className="aitem" to={`/terrenos/${p.terreno_id}`}>
              <span className={`ai ${p.status === 'perdida' ? 'crit' : 'warn'}`}><Icon n={p.status === 'perdida' ? 'block' : 'pause'} s={18} /></span>
              <span style={{ minWidth: 0 }}>
                <div className="at">{p.bairro} · {p.endereco}</div>
                <div className="as">{p.status === 'perdida' ? `Perdida em ${p.etapa_nome}: ${p.motivo_encerramento}` : `Suspensa em ${p.etapa_nome} até ${data(p.retomar_em)}`}</div>
              </span>
              <span className="when">{data(p.encerrado_em)}</span>
            </Link>
          )) : <div className="empty">Nenhuma negociação encerrada.</div>}
        </div>
      )}
    </>
  );
}
