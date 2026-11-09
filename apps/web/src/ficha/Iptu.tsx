/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { data as fd, m2 } from '../lib/format';
import { ehSP, type Ficha, type R } from './dados';
import { Quadro } from './edicao';
import { FormIptu, useLotes } from './Partes';
import { filaIptu, pedirIptu as pedir, situacaoIptu } from '../lib/iptu';

// Seção IPTU da aba Terreno, logo depois de Áreas e dimensões (pedido do Moises, 9/nov/2026): o valor venal e o IPTU do
// exercício mais recente de cada SQL (app.inscricao_valores, o mesmo que a janela da etiqueta do SQL mostra) e a soma do
// terreno. Em São Paulo, "Buscar na Prefeitura" emite a notificação de lançamento pelo serviço do IPTU (services/iptu,
// por /iptu no mesmo endereço) e grava o que ela traz; o detalhe da notificação (áreas, testada, valor do m², fatores,
// impostos) abre na linha. A busca é sozinha: o SQL incluído vai para a fila do serviço, que consulta em segundo plano, e a
// seção fica carregando até chegar. Em São Paulo os valores não se digitam; fora de São Paulo não há busca e o IPTU se lança
// à mão, aqui ou na janela do SQL. IPTU mensal = anual ÷ 10 (as 10 prestações da Prefeitura).

const brl = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }));
const nf = (v: number | null | undefined, d = 2) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const vigente = (x: R): R | undefined => ((x.inscricao_valores ?? []) as R[]).filter((y) => y.vigente).sort((a, b) => b.exercicio - a.exercicio)[0];
const venalDe = (v: R) => v.valor_venal_imovel ?? (v.valor_venal_terreno != null || v.valor_venal_construcao != null ? (+(v.valor_venal_terreno ?? 0) + +(v.valor_venal_construcao ?? 0)) : null);

function Detalhe({ n }: { n: R }) {
  const b = n.bases ?? {}, ti = b.terreno_incorporado ?? {}, tn = b.terreno_nao_incorporado ?? {}, c = b.construcao ?? {}, cad = n.construcao ?? {}, ter = n.terreno ?? {};
  const imp = n.territorial?.imposto_a_pagar ? n.territorial : n.predial ?? {};
  const kv: [string, string][] = [
    ['Notificação', `NL ${n.notificacao ?? '—'} · ${n.exercicio}`],
    ['Área do terreno', ter.area_total_m2 == null ? '—' : m2(ter.area_total_m2)],
    ['Testada', ter.testada_m == null ? '—' : `${nf(ter.testada_m)} m`],
    ['Área construída', cad.area_construida_m2 == null ? '—' : m2(cad.area_construida_m2)],
    ['Uso', cad.uso ?? '—'],
    ['Padrão da construção', cad.padrao ?? '—'],
    ['Ano da construção (corrigido)', cad.ano_corrigido == null ? '—' : String(cad.ano_corrigido)],
    ['Valor do m² do terreno', brl(ti.valor_m2, 2)],
    ['Valor do m² da construção', brl(c.valor_m2, 2)],
    ['Fator de profundidade', nf(ti.fator_profundidade, 4)],
    ['Fator do tipo de terreno', nf(ti.fator_tipo_terreno, 4)],
    ['Fator de obsolescência', nf(c.fator_obsolescencia, 4)],
    ['Venal terreno incorporado', brl(ti.base_calculo)],
    ['Venal terreno não incorporado', brl(tn.base_calculo)],
    [n.territorial?.imposto_a_pagar ? 'Alíquota territorial' : 'Alíquota predial', pct(imp.aliquota)],
    ['Desconto ou acréscimo', brl(imp.desconto_acrescimo, 2)],
    ['Deduções ou acréscimos', brl(imp.deducoes_acrescimos, 2)],
    ['Imposto predial', brl(n.predial?.imposto_a_pagar, 2)],
    ['Imposto territorial', brl(n.territorial?.imposto_a_pagar, 2)],
    ['Total a pagar no ano', brl(n.pagar?.total, 2)],
    ['Vencimento da 1ª prestação', n.pagar?.vencimento_1a_prestacao ? fd(n.pagar.vencimento_1a_prestacao) : '—'],
  ];
  return <div className="kvg" style={{ padding: '8px 0 4px' }}>{kv.map(([k, v]) => <div key={k}><div className="k">{k}</div><div className={`v${v === '—' ? ' ni' : ''}`}>{v === '—' ? 'Não informado' : v}</div></div>)}</div>;
}

/** Panorama do terreno (pedido do Moises, 9/nov/2026): a soma de todos os SQLs. Os três valores venais em caixas como as
 * de Áreas e dimensões, lado a lado quando cabem; embaixo, em duplas, áreas da Prefeitura, impostos e, por último e em
 * destaque, IPTU anual e mensal. SQL por SQL fica no "Ver SQL por SQL". */
function Panorama({ linhas }: { linhas: { x: R; v: R | undefined }[] }) {
  const vs = linhas.map((l) => l.v).filter((v): v is R => !!v);
  const ns = vs.map((v) => v.notificacao as R | null).filter((n): n is R => !!n);
  const sem = linhas.length - vs.filter((v) => v.situacao_iptu !== 'nao_informada').length;
  const somar = (xs: (number | null | undefined)[]) => { const ok = xs.filter((x): x is number => x != null); return ok.length ? ok.reduce((a, b) => a + +b, 0) : null; };
  const juntos = (xs: (string | null | undefined)[]) => { const u = [...new Set(xs.filter((x): x is string => !!x && x !== '—'))]; return u.length ? u.join(' / ') : '—'; };
  const anual = somar(vs.map((v) => (v.situacao_iptu === 'isento' ? 0 : v.iptu_valor_anual)));
  const mensal = somar(vs.map((v) => (v.situacao_iptu === 'isento' ? 0 : v.iptu_mensal_informado ?? (v.iptu_valor_anual == null ? null : v.iptu_valor_anual / 10))));
  const parcial = (xs: unknown[]) => (xs.length && xs.length < linhas.length ? `${xs.length} de ${linhas.length} SQLs` : '');
  const area = (a: number | null) => (a == null ? '—' : m2(a));
  const venais: [string, string][] = [
    ['Valor venal do terreno', brl(somar(vs.map((v) => v.valor_venal_terreno)))],
    ['Valor venal da construção', brl(somar(vs.map((v) => v.valor_venal_construcao)))],
    ['Valor venal total', brl(somar(vs.map(venalDe)))],
  ];
  const pares: [string, string][][] = [];
  if (ns.length) pares.push(
    [['Área total do terreno', area(somar(ns.map((n) => n.terreno?.area_total_m2)))], ['Área construída', area(somar(ns.map((n) => n.construcao?.area_construida_m2)))]],
    [['Imposto predial', brl(somar(ns.map((n) => n.predial?.imposto_a_pagar)), 2)], ['Imposto territorial', brl(somar(ns.map((n) => n.territorial?.imposto_a_pagar)), 2)]],
    [['Valor do m² do terreno', juntos(ns.map((n) => (n.bases?.terreno_incorporado?.valor_m2 == null ? null : brl(n.bases.terreno_incorporado.valor_m2, 2))))], ['Padrão da construção', juntos(ns.map((n) => n.construcao?.padrao))]],
    [['Uso', juntos(ns.map((n) => n.construcao?.uso))], ['Vencimento da 1ª prestação', juntos(ns.map((n) => (n.pagar?.vencimento_1a_prestacao ? fd(n.pagar.vencimento_1a_prestacao) : null)))]],
  );
  const ex = juntos(vs.map((v) => String(v.exercicio)));
  const cel = ([k, v]: [string, string], cls = '') => (
    <div className={`area${cls}`} key={k}><div className="al">{k}</div><div className="av">{v === '—' ? <span className="faint" style={{ fontSize: 14, fontStyle: 'italic' }}>Não informado</span> : v}</div></div>
  );
  const pv = parcial(vs), pn = parcial(ns);
  return (
    <div className="iptu-pan">
      <div className="geo-st">Panorama do terreno<span className="faint"> · {linhas.length} SQL{linhas.length > 1 ? 's' : ''}{ex !== '—' ? ` · exercício ${ex}` : ''}{pv ? ` · valores de ${pv}` : ''}{sem > 0 ? ` · ${sem} sem IPTU` : ''}</span></div>
      <div className="areas iptu-venal">{venais.map((c) => cel(c))}</div>
      {pares.length > 0 && <div className="iptu-pares">{pares.flatMap((p) => p.map((c) => cel(c, ' iptu-k')))}</div>}
      {pn && pn !== pv ? <div className="hint">Áreas e impostos da Prefeitura de {pn}.</div> : null}
      <div className="iptu-pares iptu-dest">{cel(['IPTU anual', brl(anual, 2)], ' iptu-k')}{cel(['IPTU mensal (anual ÷ 10)', brl(mensal, 2)], ' iptu-k')}</div>
    </div>
  );
}

/** SQLs já postos na fila nesta página: um SQL que deu erro não volta sozinho à fila a cada visita (fica o botão Buscar). */
const jaNaFila = new Set<string>();
const PENDENTE = new Set(['na_fila', 'consultando']);

export default function SecIptu({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const q = useLotes(f), qc = useQueryClient(), toast = useToast();
  const [busc, setBusc] = useState<string | null>(null), [aberto, setAberto] = useState<string | null>(null), [pdf, setPdf] = useState<string | null>(null);
  const [lanc, setLanc] = useState<string | null>(null);
  const sp = ehSP(f);
  const insc = (q.data?.insc ?? []) as R[];
  /* o detalhe da notificação vem à parte: se a coluna ainda não existir no banco, só o detalhe some */
  const ids = insc.map((x) => x.id).sort().join(',');
  const qn = useQuery({
    queryKey: ['ficha-iptu', f.id, ids],
    enabled: !!ids,
    queryFn: async () => {
      const r = await supabase.from('inscricao_valores').select('id,notificacao').in('inscricao_id', ids.split(',')).eq('vigente', true);
      return Object.fromEntries(((r.data ?? []) as R[]).map((y) => [y.id, y.notificacao]));
    },
  });
  const linhas = insc.map((x) => { const v = vigente(x); return { x, v: v ? ({ ...v, notificacao: qn.data?.[v.id] ?? null } as R) : v }; });

  /* a fila do serviço: o que está na fila ou consultando, de 4 em 4 segundos enquanto houver */
  const qs = useQuery({
    queryKey: ['iptu-situacao', f.id, ids],
    enabled: sp && !!ids,
    queryFn: () => situacaoIptu(ids.split(',')).catch(() => ({})),
    refetchInterval: (qq) => (Object.values((qq.state.data ?? {}) as Record<string, { estado: string }>).some((y) => PENDENTE.has(y.estado)) ? 4000 : false),
  });
  const sit = (qs.data ?? {}) as Record<string, { estado: string; error?: string }>;
  const pend = insc.filter((x) => PENDENTE.has(sit[x.id]?.estado));
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-lotes', f.id] }); qc.invalidateQueries({ queryKey: ['ficha-iptu', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['ficha-logs'] }); };
  /* um SQL que saiu da fila recarrega a seção */
  const antes = useRef('');
  const pendSig = pend.map((x) => x.id).join(',');
  useEffect(() => { if (antes.current && antes.current !== pendSig) recarregar(); antes.current = pendSig || '-'; }, [pendSig]); // eslint-disable-line react-hooks/exhaustive-deps
  /* SQL de São Paulo sem o IPTU da Prefeitura e fora da fila: entra na fila sozinho (ex.: SQL incluído antes desta versão) */
  useEffect(() => {
    if (!edita || !sp || !qs.isFetched || !qn.isFetched) return;
    const faltam = linhas.filter(({ x, v }) => !v?.notificacao && !sit[x.id] && !jaNaFila.has(x.id)).map(({ x }) => x.id);
    if (!faltam.length) return;
    faltam.forEach((id) => jaNaFila.add(id));
    void filaIptu(faltam).then(() => qc.invalidateQueries({ queryKey: ['iptu-situacao', f.id] }));
  }, [edita, sp, qs.isFetched, qn.isFetched, ids, qs.data, qn.data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function buscar(lista: R[]) {
    let ok = 0; const erros: string[] = [];
    for (const x of lista) {
      setBusc(x.id);
      try { await pedir('consultar', { inscricao_id: x.id }); ok++; }
      catch (e: any) { erros.push(`${x.inscricao}: ${e?.message ?? e}`); if (/não está disponível|configurada|captcha|recusou/i.test(String(e?.message))) break; }
    }
    setBusc(null);
    recarregar();
    qc.invalidateQueries({ queryKey: ['iptu-situacao', f.id] });
    if (erros.length) toast(erros.join(' · '), true);
    else toast(ok === 1 ? 'IPTU trazido da Prefeitura.' : `IPTU de ${ok} SQLs trazido da Prefeitura.`);
  }
  async function baixar(x: R, ex: number) {
    setPdf(x.id);
    try {
      const r = await pedir('notificacao', { inscricao_id: x.id, exercicio: ex });
      const url = URL.createObjectURL(await r.blob()), a = document.createElement('a');
      a.href = url; a.download = `IPTU-${x.inscricao_norm}-${ex}.pdf`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e: any) { toast(e?.message ?? String(e), true); } finally { setPdf(null); }
  }

  const podeBuscar = edita && sp && insc.length > 0, podeLancar = edita && !sp, ocupado = !!busc || pend.length > 0;
  const acao = podeBuscar || podeLancar;
  const carregando = pend.length > 0 || (sp && !!ids && (!qs.isFetched || !qn.isFetched));
  return (
    <Quadro aba="terreno" id="iptu" titulo="IPTU"
      acoes={podeBuscar ? <div className="qd-acoes"><button className="btn sm text" disabled={ocupado} onClick={() => buscar(insc)}><Ic n="search" s={16} />{busc ? 'Consultando a Prefeitura...' : insc.length > 1 ? 'Buscar todos de novo' : 'Buscar de novo'}</button></div> : undefined}>
      <div className="sec-b">
        {!q.data ? <div className="muted">{q.error ? 'Não foi possível carregar os SQLs.' : 'Carregando...'}</div>
          : !insc.length ? <div className="muted">Sem SQL no terreno. Inclua os SQLs em Matrículas e SQLs.</div> : (
            <div className={`iptu-corpo${carregando ? ' carregando' : ''}`} aria-busy={carregando || undefined}>
              {carregando && <div className="iptu-load" role="status"><span className="iptu-spin" aria-hidden="true" />
                {pend.length ? `Buscando o IPTU na Prefeitura: ${insc.length - pend.length} de ${insc.length} SQL${insc.length > 1 ? 's' : ''}` : 'Carregando o IPTU...'}</div>}
              <Panorama linhas={linhas} />
              <details className="details lz-lotes"><summary>Ver SQL por SQL ({linhas.length})</summary>
              <div className="tblwrap" style={{ marginTop: 8 }}><table className="mini-tbl"><thead><tr>
                <th>SQL</th><th>Exercício</th><th className="r">Venal terreno</th><th className="r">Venal construção</th><th className="r">Venal total</th><th className="r">IPTU anual</th><th className="r">Mensal (anual ÷ 10)</th><th>Fonte</th>{acao && <th />}
              </tr></thead><tbody>{linhas.map(({ x, v }) => {
                const n = v?.notificacao as R | null | undefined, ab = aberto === x.id && !!n, s = sit[x.id];
                return (
                  <Fragment key={x.id}>
                    <tr>
                      <td><b>{x.inscricao}</b></td>
                      <td>{v ? v.exercicio : '—'}</td>
                      <td className="r">{brl(v?.valor_venal_terreno)}</td>
                      <td className="r">{brl(v?.valor_venal_construcao)}</td>
                      <td className="r"><b>{v ? brl(venalDe(v)) : '—'}</b></td>
                      <td className="r">{!v ? '—' : v.situacao_iptu === 'isento' ? <span className="chip good">Isento</span> : brl(v.iptu_valor_anual, 2)}</td>
                      <td className="r">{v?.iptu_mensal_informado != null ? brl(v.iptu_mensal_informado, 2) : v?.iptu_valor_anual != null && v.situacao_iptu !== 'isento' ? brl(v.iptu_valor_anual / 10, 2) : '—'}</td>
                      <td className="muted">{PENDENTE.has(s?.estado ?? '') ? 'Buscando na Prefeitura...'
                        : s?.estado === 'erro' && !n ? <span className="iptu-erro">{s.error ?? 'A busca falhou.'}</span>
                        : v ? <>{n ? 'Prefeitura' : v.fonte || 'Digitado'}{v.data_verificacao ? <span className="faint"> · {fd(v.data_verificacao)}</span> : null}
                        {n && <> · <button className="btn sm text" style={{ padding: 0, height: 'auto' }} onClick={() => setAberto(ab ? null : x.id)}>{ab ? 'Fechar detalhe' : 'Detalhe'}</button></>}</> : 'Sem IPTU'}</td>
                      {acao && <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        {podeBuscar && <button className="btn sm text" disabled={ocupado} title="Buscar este SQL na Prefeitura de novo" onClick={() => buscar([x])}>{busc === x.id ? 'Consultando...' : 'Buscar'}</button>}
                        {podeBuscar && <button className="btn sm text" disabled={pdf === x.id} title="Emitir o PDF da notificação de lançamento" onClick={() => baixar(x, v?.exercicio ?? new Date().getFullYear())}>{pdf === x.id ? 'Emitindo...' : 'PDF'}</button>}
                        {podeLancar && <button className="btn sm text" onClick={() => setLanc(lanc === x.id ? null : x.id)}>{lanc === x.id ? 'Fechar' : v ? 'Atualizar' : 'Lançar'}</button>}
                      </td>}
                    </tr>
                    {ab && <tr><td colSpan={acao ? 9 : 8}><Detalhe n={n!} /></td></tr>}
                    {podeLancar && lanc === x.id && <tr><td colSpan={9}><FormIptu f={f} x={x} vv={v} onFeito={() => setLanc(null)} /></td></tr>}
                  </Fragment>
                );
              })}</tbody></table></div>
              </details>
              <p className="hint" style={{ marginTop: 8 }}>
                {sp ? 'Em São Paulo, o valor venal e o IPTU vêm sozinhos da notificação de lançamento da Prefeitura, ao incluir o SQL, e não se digitam. ' : 'Fora de São Paulo não há busca na Prefeitura: o IPTU se lança à mão, em Lançar ou Atualizar no SQL por SQL. '}
                Mensal = IPTU anual ÷ 10. Só vale o exercício mais recente.
              </p>
            </div>
          )}
      </div>
    </Quadro>
  );
}
