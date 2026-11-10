// "Planta do loteamento" no quadro Endereço e localização, em São José dos Campos (pedido do Moises, 10/nov/2026): acha no GeoSanja
// a folha da planta do loteamento aprovado onde o terreno está (índice em novo/loteamentos-sjc.json) e baixa a imagem para consulta.
// É a planta da aprovação, não o cadastro de hoje: lotes juntados ou desmembrados depois não aparecem. Sem a aba Documentos,
// o arquivo só é baixado, não fica guardado no sistema.
import { useState } from 'react';
import { useToast, Dialogo } from '../components/ui';
import { Ic } from '../components/Moldura';
import { GSJ_BASE } from '../novo/geosanja';
import { baixarPlanta, plantasNoPonto, type PlantaSjc } from '../novo/lotesSjc';
import type { Ficha } from './dados';

export const MUN_SJC = '3549904';

export default function PlantaLoteamento({ f }: { f: Ficha }) {
  const toast = useToast();
  const [em, setEm] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<PlantaSjc[] | null>(null);
  if (!GSJ_BASE || f.lat == null || f.lng == null) return null;
  async function baixar(p: PlantaSjc) {
    setOpcoes(null); setEm(p.titulo);
    try {
      const b = await baixarPlanta(p), url = URL.createObjectURL(b), a = document.createElement('a');
      a.href = url; a.download = `${f.codigo} - Planta ${p.titulo.replace(/[\\/:*?"<>|]/g, '-')}.jpg`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (e) { toast(e instanceof Error ? e.message : String(e), true); } finally { setEm(null); }
  }
  async function abrir() {
    const ps = await plantasNoPonto(f.lat!, f.lng!);
    if (!ps.length) { toast('Nenhuma planta de loteamento aprovado do GeoSanja cobre este terreno.', true); return; }
    if (ps.length === 1) baixar(ps[0]); else setOpcoes(ps);
  }
  return <>
    <button className="btn sm text" disabled={!!em} onClick={abrir} title={em ? `Baixando ${em}...` : 'Planta do loteamento aprovado, do GeoSanja'}>
      {em ? <span className="spin" aria-hidden="true" /> : <Ic n="doc" s={16} />}{em ? 'Baixando a planta...' : 'Planta do loteamento'}</button>
    {opcoes && (
      <Dialogo titulo="Planta do loteamento" sub="Mais de uma folha cobre o terreno. Qual baixar?" onFechar={() => setOpcoes(null)}
        rodape={<button className="btn text" onClick={() => setOpcoes(null)}>Cancelar</button>}>
        <div className="hint" style={{ marginTop: 0 }}>É a planta aprovada do loteamento: lotes juntados ou desmembrados depois não aparecem nela.</div>
        <div className="lg-lista" style={{ marginTop: 8 }}>{opcoes.map((p) => <button key={p.camada} type="button" className="lg-it lg-op" onClick={() => baixar(p)}><span>{p.titulo}</span><Ic n="doc" s={16} /></button>)}</div>
      </Dialogo>
    )}
  </>;
}
