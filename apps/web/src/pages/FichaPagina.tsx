import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Carregando, Erro, useToast } from '../components/ui';
import Ficha, { abaN, useFicha } from '../ficha/Ficha';

// Ficha na página própria: /terrenos/A123 (Visão geral) e /terrenos/A123/<aba>. Código que não existe volta ao mapa com aviso.
export default function FichaPagina() {
  const p = useParams(), codigo = (p.codigo ?? '').toUpperCase(), aba = abaN((p['*'] || '').split('/')[0] || 'geral');
  const navegar = useNavigate(), loc = useLocation(), toast = useToast();
  const q = useFicha(codigo);
  useEffect(() => {
    if (q.data === null) { toast(`Terreno ${codigo} não encontrado.`); navegar('/mapa', { replace: true }); }
  }, [q.data]); // eslint-disable-line react-hooks/exhaustive-deps
  /* link antigo (/cadastro, /negociacao...) vira o da aba nova */
  const seg = (p['*'] || '').split('/')[0];
  useEffect(() => {
    if (seg && seg !== aba) navegar(`/terrenos/${codigo}${aba === 'geral' ? '' : '/' + aba}`, { replace: true });
  }, [seg, aba, codigo, navegar]);
  if (q.isLoading) return <Carregando />;
  if (q.error) return <Erro erro={q.error} />;
  if (!q.data) return null;
  const st = loc.state as { de?: string; volta?: string } | null, de = st?.de;
  return (
    <Ficha f={q.data} aba={aba}
      irAba={(k) => navegar(`/terrenos/${codigo}${k === 'geral' ? '' : '/' + k}`, { state: loc.state })}
      voltar={{ rotulo: de === 'funil' ? 'Funil' : de === 'terrenos' ? 'Terrenos' : 'Mapa', ir: () => navegar(de === 'funil' ? st?.volta ?? '/funil' : de === 'terrenos' ? '/terrenos' : `/mapa/${codigo}`) }}
      abrirMapa={(lat, lng, z) => navegar(`/mapa/${codigo}`, { state: { centro: { lat, lng, z } } })} />
  );
}
