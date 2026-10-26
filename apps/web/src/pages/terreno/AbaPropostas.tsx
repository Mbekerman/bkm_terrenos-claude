import { useState, type FormEvent } from 'react';
import { rpc, useAcao } from '../../lib/api';
import { data, FORMA, lerValor, reais, SITUACAO_PROPOSTA } from '../../lib/format';
import { mensagemErro } from '../../lib/supabase';
import type { ProcessoResumo, Proposta, SituacaoProposta } from '../../lib/types';
import { Icon, useToast } from '../../components/ui';

const COR: Record<SituacaoProposta, string> = { aceita: 'good', recusada: 'crit', contraproposta: 'warn', em_analise: 'blue' };

export default function AbaPropostas({ p, propostas }: { p: ProcessoResumo; propostas: Proposta[] }) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [f, setF] = useState({ autor: 'nos', valor: '', forma: 'dinheiro', pct: '', cond: '' });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const v = lerValor(f.valor);
  const ativa = p.status === 'ativo';

  const registrar = useAcao(() => rpc('registrar_proposta', {
    p_processo: p.id, p_autor: f.autor, p_valor: v, p_forma: f.forma,
    p_permuta_pct: lerValor(f.pct), p_condicoes: f.cond || null,
  }));
  const situacao = useAcao(({ id, s }: { id: string; s: string }) => rpc('atualizar_situacao_proposta', { p_proposta: id, p_situacao: s }));

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (!v) { toast('Informe o valor.', true); return; }
    try {
      await registrar.mutateAsync(undefined);
      toast(`Proposta v${(propostas[0]?.versao ?? 0) + 1} registrada.`);
      setAberto(false); setF({ autor: 'nos', valor: '', forma: 'dinheiro', pct: '', cond: '' });
    } catch (err) { toast(mensagemErro(err), true); }
  }

  return (
    <>
      <div className="split">
        <div className="muted">{p.margem_pct != null ? <>Margem do estudo: <b className="num" style={{ color: 'var(--ink)' }}>{Number(p.margem_pct).toLocaleString('pt-BR')}%</b></> : 'Sem estudo de viabilidade vinculado.'}</div>
        {ativa && !aberto && <button className="btn primary" onClick={() => setAberto(true)}><Icon n="add" s={18} />Nova proposta</button>}
      </div>

      {aberto && (
        <section className="card" style={{ marginBottom: 16 }}>
          <div className="card-h"><h2>Nova proposta · v{(propostas[0]?.versao ?? 0) + 1}</h2>
            <button className="iconbtn" onClick={() => setAberto(false)} aria-label="Fechar"><Icon n="close" /></button></div>
          <div className="card-b">
            <form onSubmit={enviar}>
              <div className="fields">
                <div className="field"><label htmlFor="pp-a">Quem propõe</label>
                  <select id="pp-a" value={f.autor} onChange={set('autor')}><option value="nos">Nós</option><option value="proprietario">Proprietário</option></select></div>
                <div className="field"><label htmlFor="pp-v">Valor total (R$)</label>
                  <input id="pp-v" inputMode="numeric" required value={f.valor} onChange={set('valor')} placeholder="6.150.000" /></div>
                <div className="field"><label htmlFor="pp-f">Forma de pagamento</label>
                  <select id="pp-f" value={f.forma} onChange={set('forma')}>{Object.entries(FORMA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div className="field"><label htmlFor="pp-p">Permuta (% do VGV)</label>
                  <input id="pp-p" inputMode="decimal" value={f.pct} onChange={set('pct')} placeholder="0" /></div>
                <div className="field full"><label htmlFor="pp-c">Condições</label>
                  <textarea id="pp-c" value={f.cond} onChange={set('cond')} placeholder="Parcelas, condição suspensiva de aprovação, prazos" /></div>
                <div className="field full">
                  {p.abaixo_margem_min && (
                    <div className="banner warn"><Icon n="warn" /><div>Rentabilidade do estudo abaixo da mínima da empresa. A aprovação interna vai precisar decidir.</div></div>
                  )}
                </div>
              </div>
              <div className="df" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
                <button type="button" className="btn text" onClick={() => setAberto(false)}>Cancelar</button>
                <button className="btn primary" type="submit" disabled={registrar.isPending}>Registrar proposta</button>
              </div>
            </form>
          </div>
        </section>
      )}

      <section className="card">
        {propostas.length ? propostas.map((x, i) => {
          const ultima = i === 0;
          return (
            <div key={x.id} className={`prop ${x.autor === 'nos' ? 'nos' : ''}`}>
              <span className="pv">v{x.versao}</span>
              <div style={{ minWidth: 0 }}>
                <div className="pval">{reais(Number(x.valor_total))}</div>
                <div className="pmeta">
                  <span>{x.autor === 'nos' ? 'Nossa proposta' : 'Proposta do proprietário'}</span><span>·</span>
                  <span>{data(x.criado_em)}</span><span>·</span>
                  <span>{FORMA[x.forma]}{Number(x.permuta_pct) > 0 && ` (${Number(x.permuta_pct).toLocaleString('pt-BR')}% permuta)`}</span>
                </div>
                {x.condicoes && <div className="pcond">{x.condicoes}</div>}
              </div>
              <div className="pside">
                {ultima && ativa ? (
                  <select aria-label="Situação da proposta" className={`chip ${COR[x.situacao]}`} style={{ border: 0, height: 28, cursor: 'pointer' }}
                    value={x.situacao} disabled={situacao.isPending}
                    onChange={(e) => situacao.mutate({ id: x.id, s: e.target.value }, {
                      onSuccess: () => toast(`Proposta v${x.versao}: ${SITUACAO_PROPOSTA[e.target.value]}.`),
                      onError: (er) => toast(mensagemErro(er), true),
                    })}>
                    {Object.entries(SITUACAO_PROPOSTA).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                ) : <span className={`chip ${COR[x.situacao]}`}>{SITUACAO_PROPOSTA[x.situacao]}</span>}
              </div>
            </div>
          );
        }) : <div className="empty">Nenhuma proposta ainda.{ativa && ' Registre a primeira para iniciar o histórico de versões.'}</div>}
      </section>
    </>
  );
}
