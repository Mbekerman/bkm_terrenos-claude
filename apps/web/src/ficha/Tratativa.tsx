import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase, mensagemErro } from '../lib/supabase';
import { useSessao } from '../lib/sessao';
import { useToast } from '../components/ui';
import { Ic } from '../components/Moldura';
import CompararLotes from '../novo/CompararLotes';
import type { Ficha, R } from './dados';

// Tratativa de imóvel sobreposto na ficha (pedido do Moises, 10/nov/2026; app.tratativa_terreno): a marca "Sobreposição
// parcial" com a lupa que compara os lotes no mapa da prefeitura e, no terreno escondido (a tratativa ativa é a de outro),
// a faixa que explica e o Assumir para quem pode (o responsável, com a outra vencida, ou o diretor).

export function useTratativa(id: string) {
  return useQuery({
    queryKey: ['tratativa', id], staleTime: 30_000,
    queryFn: async (): Promise<R | null> => {
      const { data, error } = await supabase.rpc('tratativa_terreno', { p_terreno: id });
      /* banco ainda sem o SQL de 10/nov: a ficha segue sem a faixa */
      if (error) { if (error.code === 'PGRST202' || error.code === '42883') return null; throw error; }
      return data as R | null;
    },
  });
}

export default function FaixaTratativa({ f }: { f: Ficha }) {
  const q = useTratativa(f.id), { empresa } = useSessao(), toast = useToast(), qc = useQueryClient(), navegar = useNavigate();
  const [cmp, setCmp] = useState<R | null>(null);
  const [grav, setGrav] = useState(false);
  const t = q.data;
  if (!t || !empresa) return null;
  const ligados: R[] = t.ligados ?? [], ativo: R[] = t.ativo ?? [];
  if (!t.escondido && !ligados.length) return null;
  async function assumir() {
    setGrav(true);
    const { error } = await supabase.rpc('assumir_tratativa', { p_terreno: f.id });
    setGrav(false);
    if (error) { toast(mensagemErro(error), true); return; }
    toast(`${f.codigo} é a tratativa ativa.`);
    qc.invalidateQueries();
  }
  return <>
    {t.escondido && (
      <div className="banner warn trat-faixa"><Ic n="warn" /><div style={{ flex: 1 }}>
        <div className="bt">Terreno escondido: a tratativa ativa deste imóvel é a de outro terreno</div>
        <div>{ativo.some((a) => a.vencida) ? `A outra tratativa está vencida (${Math.min(...ativo.map((a) => a.dias))} dias sem ação).` : 'A outra tratativa está em andamento. Você será avisado quando ela vencer.'}
          {' '}Enquanto isso, este terreno não aparece no mapa, no funil nem nas listas.</div></div>
        {t.pode_assumir && <button className="btn sm primary" disabled={grav} onClick={assumir}>Assumir a tratativa</button>}
      </div>
    )}
    {ligados.length > 0 && (
      <div className="trat-sob">{ligados.map((l) => (
        <span key={l.id} className="chip warn trat-chip">Sobreposição parcial com <button className="lnk num" onClick={() => navegar(`/terrenos/${l.codigo}`)}>{l.codigo}</button>
          {l.escondido ? ' (escondido)' : ''}
          <button className="iconbtn sm" title="Comparar os lotes" aria-label={`Comparar os lotes com ${l.codigo}`} onClick={() => setCmp(l)}><Ic n="search" s={16} /></button></span>
      ))}</div>
    )}
    {cmp && <CompararLotes empresa={empresa.id} fechar={() => setCmp(null)} a={{ titulo: f.codigo, lotes: t.lotes ?? [] }} b={{ titulo: cmp.codigo, lotes: cmp.lotes ?? [] }} />}
  </>;
}
