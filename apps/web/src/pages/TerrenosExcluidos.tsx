import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { data as fd } from '../lib/format';
import { Carregando, Erro, useToast } from '../components/ui';
import { DialogoDeletar, type TerrenoMenu } from '../components/MenuTerreno';

// Terrenos excluídos (pedido do Moises, 9/nov/2026): só o administrador, pelo menu do perfil, até Configurações ser
// portada (aí vira a seção Configurações › Terrenos excluídos, no mesmo endereço). Cada linha mostra quem excluiu, quando
// e o dia em que a rotina apaga de vez, com Restaurar e Deletar de vez.
interface Excluido { id: string; codigo: string; nome: string; municipio: string | null; excluido_em: string; excluido_por_nome: string | null; apagar_em: string }

export default function TerrenosExcluidos() {
  const { membro, empresa } = useSessao();
  const qc = useQueryClient(), toast = useToast(), navegar = useNavigate();
  const [del, setDel] = useState<TerrenoMenu | null>(null);
  const [rest, setRest] = useState<string | null>(null);
  const admin = !!membro?.administrador;
  const q = useQuery({
    queryKey: ['terrenos-excluidos', empresa?.id],
    enabled: admin && !!empresa,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('terrenos_excluidos', { p_empresa: empresa!.id });
      if (error) throw error;
      return (data ?? []) as Excluido[];
    },
  });
  if (membro && !admin) return <Navigate to="/mapa" replace />;
  async function restaurar(x: Excluido) {
    setRest(x.id);
    const { error } = await supabase.rpc('restaurar_terreno', { p_terreno: x.id });
    setRest(null);
    if (error) { toast(error.message, true); return; }
    qc.invalidateQueries();
    toast(`${x.codigo} restaurado: voltou à lista, ao mapa e ao funil.`);
  }
  const l = q.data ?? [];
  return (
    <div className="forma tx-pag">
      <div className="page-h"><div><h1>Terrenos excluídos</h1>
        <div className="muted">Ficam guardados por 180 dias a partir da exclusão e depois são apagados de vez.</div></div></div>
      {q.isLoading ? <Carregando /> : q.error ? <Erro erro={q.error} /> : !l.length ? <div className="card"><div className="empty">Nenhum terreno excluído.</div></div> : (
        <div className="card tx-lista">
          {l.map((x) => (
            <div key={x.id} className="tx-l">
              <div className="tx-t">
                <div><span className="num">{x.codigo}</span> <b>{x.nome}</b>{x.municipio ? <span className="muted"> · {x.municipio}</span> : null}</div>
                <div className="muted">Excluído em {fd(x.excluido_em)}{x.excluido_por_nome ? ` por ${x.excluido_por_nome}` : ''} · apagado de vez em {fd(x.apagar_em)}</div>
              </div>
              <div className="tx-b">
                <button className="btn text mt-perigo-t" onClick={() => setDel({ id: x.id, codigo: x.codigo, nome: x.nome })}>Deletar de vez</button>
                <button className="btn" disabled={rest === x.id} onClick={() => restaurar(x)}>{rest === x.id ? 'Restaurando…' : 'Restaurar'}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {del && <DialogoDeletar t={del} fechar={() => setDel(null)} feito={() => navegar('/configuracoes/excluidos', { replace: true })} />}
    </div>
  );
}
