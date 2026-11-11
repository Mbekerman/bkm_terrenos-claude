// Selo "Válido" das listas de estudos (estudos de massa e de viabilidade), clicável (pedido do Moises, 11/nov/2026):
// no estudo que não é o válido, o clique o torna o válido (e o que era deixa de ser); no válido, tira a marca e o
// terreno fica sem estudo válido. Sem permissão (ou sem poder ser o válido), o selo só mostra.
import { useState } from 'react';

export function SeloValido({ valido, pode, nome, porque, clicar }: {
  valido: boolean; pode: boolean; nome: string;
  /** por que não dá para clicar (vai na dica) */
  porque?: string;
  clicar: () => Promise<unknown> | void;
}) {
  const [grav, setGrav] = useState(false);
  const dica = !pode ? porque || undefined : valido ? 'Clique para deixar de ser o válido' : 'Clique para tornar este o válido';
  const txt = valido ? 'Válido' : 'Inválido';
  if (!pode) return <span className={`chip selo-val${valido ? ' good' : ''}`} title={dica}>{valido ? <span className="d" /> : null}{txt}</span>;
  return (
    <button type="button" className={`chip selo-val clic${valido ? ' good' : ''}`} title={dica} disabled={grav} aria-pressed={valido}
      aria-label={valido ? `${nome} é o válido. Clique para deixar de ser` : `Tornar ${nome} o válido`}
      onClick={async (e) => { e.stopPropagation(); setGrav(true); try { await clicar(); } finally { setGrav(false); } }}>
      {valido ? <span className="d" /> : null}{txt}
    </button>
  );
}
