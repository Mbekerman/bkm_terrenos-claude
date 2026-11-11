import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { data } from '../lib/format';
import { Carregando, Dialogo, Erro } from './ui';
import { FORMA, ST_PROP, ST_PROP_COR } from '../ficha/Comercial';

type R = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* todas as propostas do terreno, as enviadas pela BKM e as recebidas do vendedor, da mais recente à mais antiga; aberta pelo
   olho da coluna Negociação do Pipeline (pedido do Moises, 11/nov/2026). Só leitura: registrar e mudar status é na aba
   Comercial da ficha */
async function carregar(id: string) {
  const [p, pt] = await Promise.all([
    supabase.from('propostas').select('id,versao,origem,data_apresentacao,validade,valor_total,forma_pagamento,condicoes_pagamento,status,criado_em,processos!inner(terreno_id,parte_id),proposta_partes(parte_id)')
      .eq('processos.terreno_id', id).order('criado_em', { ascending: false }),
    supabase.from('terreno_partes').select('id,nome').eq('terreno_id', id),
  ]);
  if (p.error) throw p.error;
  if (pt.error) throw pt.error;
  const nome = Object.fromEntries((pt.data as R[]).map((x) => [x.id, x.nome as string]));
  const ds = (x: R) => x.data_apresentacao ?? String(x.criado_em).slice(0, 10);
  return (p.data as R[]).map((x) => {
    const ids: string[] = (x.proposta_partes as R[] | null)?.map((y) => y.parte_id) ?? [];
    if (!ids.length && x.processos?.parte_id) ids.push(x.processos.parte_id);
    return { ...x, dia: ds(x), partes: ids.map((i) => nome[i]).filter(Boolean).join(', ') } as R;
  }).sort((a, b) => (a.dia < b.dia ? 1 : a.dia > b.dia ? -1 : 0));
}

const brl = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });

export function PropostasPop({ id, codigo, nome, fechar }: { id: string; codigo: string; nome: string; fechar: () => void }) {
  const q = useQuery({ queryKey: ['propostas-terreno', id], queryFn: () => carregar(id) });
  const ps = q.data ?? [];
  const env = ps.filter((x) => x.origem === 'bkm').length;
  return createPortal(
    <Dialogo titulo="Propostas" sub={`${codigo} · ${nome}${q.data ? ` · ${env} enviada${env === 1 ? '' : 's'}, ${ps.length - env} recebida${ps.length - env === 1 ? '' : 's'}` : ''}`}
      onFechar={fechar} cls="pp-pop">
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !ps.length ? <p className="t2">Nenhuma proposta registrada neste terreno.</p> :
        <div className="tblwrap"><table className="mini-tbl pp-tbl"><thead><tr>
          <th>Data</th><th>Proposta</th><th className="r">Valor</th><th>Pagamento</th><th>Partes</th><th>Status</th></tr></thead><tbody>
          {ps.map((x) => <tr key={x.id}>
            <td>{data(x.dia)}{x.validade && <div className="t2">válida até {data(x.validade)}</div>}</td>
            <td>{x.origem === 'bkm' ? 'Enviada' : 'Recebida'}<div className="t2">{x.origem === 'bkm' ? 'pela BKM' : 'do vendedor'} · v{x.versao}</div></td>
            <td className="r">{brl(x.valor_total)}</td>
            <td>{FORMA[x.forma_pagamento] ?? x.forma_pagamento}{x.condicoes_pagamento && <div className="t2 pp-cond">{x.condicoes_pagamento}</div>}</td>
            <td>{x.partes || '—'}</td>
            <td><span className={`chip ${ST_PROP_COR[x.status] ?? ''}`}>{ST_PROP[x.status] ?? x.status}</span></td>
          </tr>)}
        </tbody></table></div>}
    </Dialogo>, document.body);
}
