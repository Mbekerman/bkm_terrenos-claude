// Etapas deixadas com pendências (pedido do Moises, 12/nov/2026): quem avança passando por cima do que a etapa pedia
// pode deixá-la com pendências (janela do Avançar, ficha/Avanco.tsx › PerguntaPend). A linha do tempo do topo mostra
// a etapa com a bolinha laranja de alerta no lugar do check azul, com a bolinha azul da contagem, que abre os itens; e
// os itens continuam em "Falta preencher". O que falta vem do banco ao vivo (app.pendencias_etapas): cumprido o item,
// ele sai; sem nada faltando, a etapa volta a aparecer concluída. "Considerar concluída" tira a marca
// (app.considerar_etapa_concluida). Banco ainda sem o SQL de 12/nov: nada aparece.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import type { Ficha as F } from './dados';

export interface EtapaPend {
  id: string; processo_id: string; parte_id: string | null; parte_nome: string | null;
  fase: string; etapa: string; etapa_nome: string; criado_em: string;
  itens: { texto: string; tipo?: string; justifica?: boolean }[]; resolvida: boolean;
}

export function useEtapasPend(f: F): EtapaPend[] {
  const q = useQuery({
    queryKey: ['ficha', 'etapas-pend', f.id],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('pendencias_etapas', { p_terreno: f.id });
      if (error) { if (error.code === 'PGRST202') return []; throw error; }
      return (data ?? []) as EtapaPend[];
    },
  });
  return (q.data ?? []).filter((x) => !x.resolvida && x.itens.length > 0);
}

export const nomeEtapaPend = (x: EtapaPend) => x.etapa_nome + (x.parte_nome ? ` (${x.parte_nome})` : '');

export function useConsiderarConcluida() {
  const qc = useQueryClient(), toast = useToast();
  return async (x: EtapaPend) => {
    const { error } = await supabase.rpc('considerar_etapa_concluida', { p_id: x.id });
    if (error) { toast(error.message, true); return; }
    toast(`${nomeEtapaPend(x)}: considerada concluída.`);
    for (const k of ['ficha', 'ficha-logs']) qc.invalidateQueries({ queryKey: [k] });
  };
}

/** a bolinha da etapa na linha do tempo: laranja com "!" e a contagem em azul; o clique abre o que falta */
export function DotPend({ pend, nome }: { pend: EtapaPend[]; nome: string }) {
  const [ab, setAb] = useState<DOMRect | null>(null);
  const bt = useRef<HTMLButtonElement>(null), pop = useRef<HTMLDivElement>(null);
  const { edita } = useSessao();
  const considerar = useConsiderarConcluida();
  const n = pend.reduce((s, x) => s + x.itens.length, 0);
  useEffect(() => {
    if (!ab) return;
    const fora = (ev: PointerEvent) => { const t = ev.target as Node; if (!pop.current?.contains(t) && !bt.current?.contains(t)) setAb(null); };
    const esc = (ev: KeyboardEvent) => { if (ev.key === 'Escape') setAb(null); };
    const rolou = (ev: Event) => { if (!pop.current?.contains(ev.target as Node)) setAb(null); };
    document.addEventListener('pointerdown', fora); document.addEventListener('keydown', esc);
    document.addEventListener('scroll', rolou, { capture: true, passive: true }); window.addEventListener('resize', rolou);
    return () => {
      document.removeEventListener('pointerdown', fora); document.removeEventListener('keydown', esc);
      document.removeEventListener('scroll', rolou, { capture: true }); window.removeEventListener('resize', rolou);
    };
  }, [ab]);
  /* a janelinha não passa da borda direita da tela */
  const [esq, setEsq] = useState(0);
  useLayoutEffect(() => {
    if (!ab || !pop.current) return;
    setEsq(Math.max(8, Math.min(ab.left - 8, window.innerWidth - pop.current.offsetWidth - 8)));
  }, [ab]);
  const rot = `${nome}: ${n} ${n > 1 ? 'pendências' : 'pendência'}. Ver o que falta`;
  return (
    <>
      <button type="button" ref={bt} className="dot dot-pend" aria-haspopup="dialog" aria-expanded={!!ab} aria-label={rot} title={rot}
        onClick={() => setAb((x) => (x ? null : bt.current!.getBoundingClientRect()))}>
        <span aria-hidden="true">!</span><span className="dot-pend-n" aria-hidden="true">{n}</span>
      </button>
      {ab && createPortal(
        <div ref={pop} className="adv-menu ep-pop" role="dialog" aria-label={`Pendências de ${nome}`} style={{ top: ab.bottom + 8, left: esq }}>
          {pend.map((x) => (
            <div key={x.id} className="ep-g">
              <div className="fi-comp-t">{pend.length > 1 || x.parte_nome ? `${nomeEtapaPend(x)}: deixada com pendências` : 'Etapa deixada com pendências'}</div>
              <ul className="ep-l">{x.itens.map((i, k) => <li key={k}>{i.texto}</li>)}</ul>
              {edita && <button type="button" className="ep-ok" onClick={() => { setAb(null); void considerar(x); }}>Considerar concluída</button>}
            </div>
          ))}
        </div>, document.body)}
    </>
  );
}
