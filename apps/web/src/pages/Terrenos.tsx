import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { useProcessos } from '../lib/api';
import { m2, milhoes } from '../lib/format';
import type { ProcessoResumo } from '../lib/types';
import { Carregando, ChipStatus, Erro, Icon } from '../components/ui';
import type { ShellCtx } from '../components/Shell';

const FILTROS: [string, string, (p: ProcessoResumo) => boolean][] = [
  ['todos', 'Todos', () => true],
  ['ativos', 'Em negociação', (p) => p.status === 'ativo'],
  ['ganhos', 'Ganhos', (p) => p.status === 'ganha'],
  ['encerrados', 'Perdidos e suspensos', (p) => p.status === 'perdida' || p.status === 'suspensa'],
];

function bate(p: ProcessoResumo, q: string) {
  if (!q) return true;
  const alvo = [p.terreno_codigo, p.bairro, p.endereco, p.zoneamento, p.responsavel_nome, p.etapa_nome].join(' ').toLowerCase();
  return q.toLowerCase().split(/\s+/).every((w) => alvo.includes(w));
}

/** Uma linha por terreno: a negociação mais recente de cada um. */
function porTerreno(lista: ProcessoResumo[]) {
  const m = new Map<string, ProcessoResumo>();
  for (const p of lista) if (!m.has(p.terreno_id)) m.set(p.terreno_id, p); // lista já vem por aberto_em desc
  return [...m.values()];
}

export default function Terrenos() {
  const [sp, setSp] = useSearchParams();
  const { abrirNovaOferta } = useOutletContext<ShellCtx>();
  const q = sp.get('q') ?? '';
  const f = sp.get('f') ?? 'todos';
  const proc = useProcessos();
  if (proc.isLoading) return <Carregando />;
  if (proc.error) return <Erro erro={proc.error} />;
  const base = porTerreno(proc.data ?? []);
  const filtro = FILTROS.find((x) => x[0] === f) ?? FILTROS[0];
  const lista = base.filter(filtro[2]).filter((p) => bate(p, q)).sort((a, b) => b.terreno_codigo.localeCompare(a.terreno_codigo));
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };

  return (
    <>
      <div className="page-h">
        <div><h1>Terrenos</h1><div className="sub">Cada terreno aparece uma vez, mesmo quando chega por vários corretores.</div></div>
        <button className="btn primary" onClick={abrirNovaOferta}><Icon n="add" s={18} />Nova oferta</button>
      </div>
      <div className="split">
        <div className="fchips">
          {FILTROS.map(([k, l, fn]) => (
            <button key={k} className="fchip" aria-pressed={f === k} onClick={() => setParam('f', k === 'todos' ? '' : k)}>
              {f === k && <Icon n="check" s={16} />}{l} <span className="n">{base.filter(fn).length}</span>
            </button>
          ))}
        </div>
        <label className="search" htmlFor="q-page" style={{ margin: 0, maxWidth: 340, height: 40, flex: '1 1 220px' }}>
          <Icon n="search" s={18} />
          <input id="q-page" type="search" value={q} onChange={(e) => setParam('q', e.target.value)} placeholder="Filtrar por bairro, código, responsável" autoComplete="off" />
        </label>
      </div>
      <div className="tbl">
        {!lista.length ? (
          <div className="empty">Nenhum terreno encontrado{q ? ` para “${q}”` : ''}.<br />
            <button className="btn sm" style={{ marginTop: 12 }} onClick={abrirNovaOferta}><Icon n="add" s={18} />Cadastrar nova oferta</button></div>
        ) : (
          <>
            <div className="tr th"><span className="c-id">Código</span><span>Terreno</span><span className="c-area r">Área</span><span className="c-zon">Zona</span><span className="c-val r">Valor ref.</span><span>Etapa</span><span className="c-go" /></div>
            {lista.map((p) => (
              <Link key={p.terreno_id} className="tr" to={`/terrenos/${p.terreno_id}`}>
                <span className="c-id faint num">{p.terreno_codigo}</span>
                <span style={{ minWidth: 0 }}>
                  <div className="t1">{p.bairro}</div>
                  <div className="t2">{p.endereco}{p.qtd_ofertas > 1 ? ` · ${p.qtd_ofertas} ofertas` : ''}</div>
                </span>
                <span className="c-area r num">{m2(p.area_m2)}</span>
                <span className="c-zon muted">{p.zoneamento ?? '—'}</span>
                <span className="c-val r num">{milhoes(p.valor_referencia)}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <ChipStatus status={p.status} etapa={p.etapa_nome} />
                  {(p.docs_vencidos > 0 || p.tarefas_atrasadas > 0) && <span className="flag crit" title="Pendências"><Icon n="warn" s={14} /></span>}
                </span>
                <span className="c-go faint"><Icon n="chev" s={18} /></span>
                <span className="meta-sm num">{p.terreno_codigo} · {m2(p.area_m2)} · {p.zoneamento ?? '—'} · {milhoes(p.valor_referencia)}</span>
              </Link>
            ))}
          </>
        )}
      </div>
    </>
  );
}
