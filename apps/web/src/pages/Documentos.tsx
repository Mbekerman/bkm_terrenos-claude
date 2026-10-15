import { Link, useSearchParams } from 'react-router-dom';
import { useDocumentos, useProcessos } from '../lib/api';
import { data } from '../lib/format';
import { diasParaVencer, JANELA_ALERTA } from '../lib/regras';
import type { DocumentoLinha } from '../lib/types';
import { Carregando, ChipDoc, Erro, Icon } from '../components/ui';

const vence = (d: DocumentoLinha) => {
  const n = diasParaVencer(d.valido_ate);
  return d.situacao_efetiva !== 'vencido' && d.situacao_efetiva !== 'rejeitado' && n != null && n >= 0 && n <= JANELA_ALERTA;
};
const FILTROS: [string, string, (d: DocumentoLinha) => boolean][] = [
  ['todos', 'Todos', () => true],
  ['vencidos', 'Vencidos', (d) => d.situacao_efetiva === 'vencido'],
  ['vencem', `Vencem em ${JANELA_ALERTA} dias`, vence],
  ['validar', 'Aguardando validação', (d) => d.situacao_efetiva === 'recebido'],
  ['rejeitados', 'Rejeitados', (d) => d.situacao_efetiva === 'rejeitado'],
];

export default function Documentos() {
  const [sp, setSp] = useSearchParams();
  const docsQ = useDocumentos();
  const proc = useProcessos();
  if (docsQ.isLoading || proc.isLoading) return <Carregando />;
  if (docsQ.error) return <Erro erro={docsQ.error} />;
  const ativos = new Map((proc.data ?? []).filter((p) => p.status === 'ativo').map((p) => [p.id, p]));
  const todos = (docsQ.data ?? []).filter((d) => ativos.has(d.processo_id));

  let f = sp.get('f') ?? 'todos';
  if (f === 'alerta') f = todos.some(FILTROS[1][2]) ? 'vencidos' : 'vencem';
  const filtro = FILTROS.find((x) => x[0] === f) ?? FILTROS[0];
  const lista = todos.filter(filtro[2]).sort((a, b) => (a.valido_ate ?? '9').localeCompare(b.valido_ate ?? '9'));

  return (
    <>
      <div className="page-h"><div><h1>Documentos</h1>
        <div className="sub">Documentos das negociações em andamento. Itens do checklist ainda não enviados aparecem na ficha de cada terreno.</div></div></div>
      <div className="split"><div className="fchips">
        {FILTROS.map(([k, l, fn]) => (
          <button key={k} className="fchip" aria-pressed={f === k} onClick={() => setSp(k === 'todos' ? {} : { f: k }, { replace: true })}>
            {f === k && <Icon n="check" s={16} />}{l} <span className="n">{todos.filter(fn).length}</span>
          </button>
        ))}
      </div></div>
      <div className="tbl">
        {lista.length ? (
          <>
            <div className="tr th docs"><span>Documento</span><span className="c-ter">Terreno</span><span>Situação</span><span className="c-val">Validade</span><span className="c-ver r">Versões</span></div>
            {lista.map((d) => {
              const p = ativos.get(d.processo_id)!;
              const n = diasParaVencer(d.valido_ate);
              const cor = d.situacao_efetiva === 'vencido' ? 'var(--crit)' : n != null && n <= JANELA_ALERTA ? 'var(--warn)' : undefined;
              return (
                <Link key={d.id} className="tr docs" to={`/terrenos/${p.terreno_id}/documentos`}>
                  <span style={{ minWidth: 0 }}><div className="t1">{d.tipo_nome}</div><div className="t2">{d.nome_arquivo ?? 'Nenhum arquivo'}</div></span>
                  <span className="c-ter" style={{ minWidth: 0 }}><div className="t1">{p.bairro}</div><div className="t2">{p.etapa_nome}</div></span>
                  <span><ChipDoc s={d.situacao_efetiva} /></span>
                  <span className="c-val num" style={{ color: cor }}>{d.valido_ate ? data(d.valido_ate) : 'Sem validade'}</span>
                  <span className="c-ver r num faint">{d.versao_atual ?? 0}</span>
                  <span className="meta-sm">{p.bairro} · {d.valido_ate ? 'vence ' + data(d.valido_ate) : 'sem validade'}</span>
                </Link>
              );
            })}
          </>
        ) : <div className="empty">Nenhum documento neste filtro.</div>}
      </div>
    </>
  );
}
