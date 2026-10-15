import { useState, type FormEvent } from 'react';
import { useAcao, useNomes } from '../../lib/api';
import { ATIVIDADE, data } from '../../lib/format';
import { useSessao } from '../../lib/sessao';
import { mensagemErro, supabase } from '../../lib/supabase';
import type { Atividade, ProcessoResumo } from '../../lib/types';
import { Icon, useToast, type NomeIcone } from '../../components/ui';

const ICONE: Record<string, NomeIcone> = { ligacao: 'chat', visita: 'place', reuniao: 'chat', email: 'chat', nota: 'doc' };

export default function AbaAtividades({ p, itens }: { p: ProcessoResumo; itens: Atividade[] }) {
  const toast = useToast();
  const { empresa } = useSessao();
  const nomes = useNomes();
  const [tipo, setTipo] = useState('ligacao');
  const [resumo, setResumo] = useState('');
  const criar = useAcao(async () => {
    const { error } = await supabase.from('atividades').insert({ empresa_id: empresa!.id, processo_id: p.id, tipo, resumo });
    if (error) throw error;
  });
  async function enviar(e: FormEvent) {
    e.preventDefault();
    try { await criar.mutateAsync(undefined); setResumo(''); toast('Atividade registrada.'); }
    catch (err) { toast(mensagemErro(err), true); }
  }
  return (
    <>
      <section className="card" style={{ marginBottom: 16 }}><div className="card-b">
        <form className="inline-form" style={{ border: 0, margin: 0, padding: 0 }} onSubmit={enviar}>
          <div className="field" style={{ flex: '0 1 150px' }}><label htmlFor="at-t">Tipo</label>
            <select id="at-t" value={tipo} onChange={(e) => setTipo(e.target.value)}>{Object.entries(ATIVIDADE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div className="field grow"><label htmlFor="at-x">O que aconteceu</label>
            <input id="at-x" required value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Resumo da conversa ou visita" /></div>
          <button className="btn primary sm" type="submit" disabled={criar.isPending}>Registrar</button>
        </form>
      </div></section>
      <section className="card"><div className="tl">
        {itens.length ? itens.map((a) => (
          <div key={a.id} className="tli">
            <span className="ai blue"><Icon n={ICONE[a.tipo] ?? 'chat'} s={16} /></span>
            <div><div className="tx"><b>{ATIVIDADE[a.tipo]}</b> · {a.resumo}</div><div className="ts">{nomes(a.user_id)}</div></div>
            <span className="when">{data(a.ocorreu_em)}</span>
          </div>
        )) : <div className="empty">Nenhuma atividade registrada.</div>}
      </div></section>
    </>
  );
}
