/* eslint-disable @typescript-eslint/no-explicit-any */
import { Fragment, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import { data as fd, m2 } from '../lib/format';
import { ehSP, type Ficha, type R } from './dados';
import { Quadro } from './edicao';
import { useLotes } from './Partes';

// Seção IPTU da aba Terreno, logo depois de Áreas e dimensões (pedido do Moises, 9/nov/2026): o valor venal e o IPTU do
// exercício mais recente de cada SQL (app.inscricao_valores, o mesmo que a janela da etiqueta do SQL mostra) e a soma do
// terreno. Em São Paulo, "Buscar na Prefeitura" emite a notificação de lançamento pelo serviço do IPTU (services/iptu,
// por /iptu no mesmo endereço) e grava o que ela traz; o detalhe da notificação (áreas, testada, valor do m², fatores,
// impostos) abre na linha. Fora de São Paulo, o IPTU se lança à mão na janela do SQL.

const brl = (v: number | null | undefined, d = 0) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: d, maximumFractionDigits: d }));
const nf = (v: number | null | undefined, d = 2) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(Number(v) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const vigente = (x: R): R | undefined => ((x.inscricao_valores ?? []) as R[]).filter((y) => y.vigente).sort((a, b) => b.exercicio - a.exercicio)[0];
const venalDe = (v: R) => v.valor_venal_imovel ?? (v.valor_venal_terreno != null || v.valor_venal_construcao != null ? (+(v.valor_venal_terreno ?? 0) + +(v.valor_venal_construcao ?? 0)) : null);

async function pedir(rota: 'consultar' | 'notificacao', corpo: object): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Entre de novo no sistema.');
  let r: Response;
  try {
    r = await fetch(`/iptu/${rota}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(200_000) });
  } catch (e: any) {
    throw new Error(e?.name === 'TimeoutError' ? 'A Prefeitura não respondeu a tempo. Tente de novo.' : 'Não foi possível falar com o serviço do IPTU.');
  }
  if (!r.ok) {
    const j = await r.json().catch(() => null);
    throw new Error(j?.error ?? (r.status === 502 ? 'O serviço do IPTU não está disponível neste ambiente.' : `O serviço do IPTU respondeu ${r.status}.`));
  }
  return r;
}

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

export default function SecIptu({ f }: { f: Ficha }) {
  const { edita } = useSessao();
  const q = useLotes(f), qc = useQueryClient(), toast = useToast();
  const [busc, setBusc] = useState<string | null>(null), [aberto, setAberto] = useState<string | null>(null), [pdf, setPdf] = useState<string | null>(null);
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
  const com = linhas.filter((l) => l.v), semIptu = linhas.length - com.filter((l) => l.v!.situacao_iptu !== 'nao_informada').length;
  const soma = (fn: (v: R) => number | null) => { const vs = com.map((l) => fn(l.v!)).filter((v): v is number => v != null); return vs.length ? vs.reduce((a, b) => a + +b, 0) : null; };
  const venalTot = soma(venalDe), anualTot = soma((v) => (v.situacao_iptu === 'isento' ? 0 : v.iptu_valor_anual));

  const recarregar = () => { qc.invalidateQueries({ queryKey: ['ficha-lotes', f.id] }); qc.invalidateQueries({ queryKey: ['ficha-iptu', f.id] }); qc.invalidateQueries({ queryKey: ['ficha'] }); qc.invalidateQueries({ queryKey: ['ficha-logs'] }); };
  async function buscar(lista: R[]) {
    let ok = 0; const erros: string[] = [];
    for (const x of lista) {
      setBusc(x.id);
      try { await pedir('consultar', { inscricao_id: x.id }); ok++; }
      catch (e: any) { erros.push(`${x.inscricao}: ${e?.message ?? e}`); if (/não está disponível|configurada|captcha|recusou/i.test(String(e?.message))) break; }
    }
    setBusc(null);
    recarregar();
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

  const podeBuscar = edita && sp && insc.length > 0;
  return (
    <Quadro aba="terreno" id="iptu" titulo="IPTU"
      acoes={podeBuscar ? <div className="qd-acoes"><button className="btn sm text" disabled={!!busc} onClick={() => buscar(insc)}><Ic n="search" s={16} />{busc ? 'Consultando a Prefeitura...' : insc.length > 1 ? 'Buscar todos na Prefeitura' : 'Buscar na Prefeitura'}</button></div> : undefined}>
      <div className="sec-b">
        {!q.data ? <div className="muted">{q.error ? 'Não foi possível carregar os SQLs.' : 'Carregando...'}</div>
          : !insc.length ? <div className="muted">Sem SQL no terreno. Inclua os SQLs em Matrículas e SQLs.</div> : (
            <>
              <div className="kvg">
                <div><div className="k">Valor venal do terreno</div>{venalTot == null ? <span className="v ni">Não informado</span> : <div className="v">{brl(venalTot)}</div>}</div>
                <div><div className="k">IPTU anual</div>{anualTot == null ? <span className="v ni">Não informado</span> : <div className="v">{brl(anualTot, 2)}</div>}</div>
                <div><div className="k">IPTU mensal</div>{anualTot == null ? <span className="v ni">Não informado</span> : <div className="v">{brl(anualTot / 12, 2)} <span className="faint" style={{ fontSize: 13 }}>anual ÷ 12</span></div>}</div>
                {semIptu > 0 && <div><div className="k">Sem IPTU</div><div className="v">{semIptu} de {linhas.length} SQL{linhas.length > 1 ? 's' : ''}</div></div>}
              </div>
              <div className="tblwrap" style={{ marginTop: 14 }}><table className="mini-tbl"><thead><tr>
                <th>SQL</th><th>Exercício</th><th className="r">Venal terreno</th><th className="r">Venal construção</th><th className="r">Venal total</th><th className="r">IPTU anual</th><th className="r">Mensal</th><th>Fonte</th>{podeBuscar && <th />}
              </tr></thead><tbody>{linhas.map(({ x, v }) => {
                const n = v?.notificacao as R | null | undefined, ab = aberto === x.id && !!n;
                return (
                  <Fragment key={x.id}>
                    <tr>
                      <td><b>{x.inscricao}</b></td>
                      <td>{v ? v.exercicio : '—'}</td>
                      <td className="r">{brl(v?.valor_venal_terreno)}</td>
                      <td className="r">{brl(v?.valor_venal_construcao)}</td>
                      <td className="r"><b>{v ? brl(venalDe(v)) : '—'}</b></td>
                      <td className="r">{!v ? '—' : v.situacao_iptu === 'isento' ? <span className="chip good">Isento</span> : brl(v.iptu_valor_anual, 2)}</td>
                      <td className="r">{v?.iptu_mensal_informado != null ? brl(v.iptu_mensal_informado, 2) : v?.iptu_valor_anual != null && v.situacao_iptu !== 'isento' ? brl(v.iptu_valor_anual / 12, 2) : '—'}</td>
                      <td className="muted">{v ? <>{n ? 'Prefeitura' : v.fonte || 'Digitado'}{v.data_verificacao ? <span className="faint"> · {fd(v.data_verificacao)}</span> : null}
                        {n && <> · <button className="btn sm text" style={{ padding: 0, height: 'auto' }} onClick={() => setAberto(ab ? null : x.id)}>{ab ? 'Fechar detalhe' : 'Detalhe'}</button></>}</> : 'Sem IPTU'}</td>
                      {podeBuscar && <td className="r" style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn sm text" disabled={!!busc} title="Buscar este SQL na Prefeitura" onClick={() => buscar([x])}>{busc === x.id ? 'Consultando...' : 'Buscar'}</button>
                        {n && <button className="btn sm text" disabled={pdf === x.id} title="Emitir o PDF da notificação de lançamento" onClick={() => baixar(x, v!.exercicio)}>{pdf === x.id ? 'Emitindo...' : 'PDF'}</button>}
                      </td>}
                    </tr>
                    {ab && <tr><td colSpan={podeBuscar ? 9 : 8}><Detalhe n={n!} /></td></tr>}
                  </Fragment>
                );
              })}</tbody></table></div>
              <p className="hint" style={{ marginTop: 8 }}>
                {sp ? 'Em São Paulo, o valor venal e o IPTU vêm da notificação de lançamento da Prefeitura (cada busca leva até um minuto por SQL). ' : 'Fora de São Paulo, o IPTU se lança à mão na janela de cada SQL. '}
                Mensal = IPTU anual ÷ 12. Só vale o exercício mais recente.
              </p>
            </>
          )}
      </div>
    </Quadro>
  );
}
