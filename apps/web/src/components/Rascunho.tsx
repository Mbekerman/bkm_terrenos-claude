import { useEffect } from 'react';

/** o formulário mudou em relação ao que abriu? (campos com valor padrão não contam como digitado) */
export const mudou = (v: Record<string, unknown>, ini: Record<string, unknown>) =>
  Object.keys({ ...v, ...ini }).some((k) => String(v[k] ?? '').trim() !== String(ini[k] ?? '').trim());

/* O que se digita nos formulários de registro fica guardado no navegador (pedido do Moises, 6/nov/2026): fechar a janela,
   o navegador ou sair do formulário não perde nada, e ao reabrir o formulário volta como estava. Só sai quando o registro
   é gravado ou com "Limpar dados"; não expira. Por isso sair do formulário não pergunta nada (o aviso "Você não registrou …"
   saiu em 9/nov/2026, pedido do Moises). Chave: bkm-terrenos-rasc:<terreno>:<formulário>. */
const PFX = 'bkm-terrenos-rasc:';
export function lerRasc<T>(chave: string): T | null {
  try { const s = localStorage.getItem(PFX + chave); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
export function apagarRasc(chave: string) { try { localStorage.removeItem(PFX + chave); } catch { /* sem armazenamento */ } }
/** o valor inicial do formulário, com o que estava guardado por cima */
export function comRasc<T>(chave: string, ini: T): T {
  const g = lerRasc<T>(chave);
  if (g == null) return ini;
  return ini && typeof ini === 'object' && !Array.isArray(ini) && typeof g === 'object' && !Array.isArray(g) ? { ...ini, ...g } : g;
}
/** guarda o valor enquanto há algo digitado (com tudo vazio, mantém o último guardado: só o registro ou o Limpar o tiram) */
export function useGuardarRasc(chave: string, valor: unknown, temAlgo: boolean) {
  const js = JSON.stringify(valor);
  useEffect(() => {
    if (!temAlgo) return;
    try { localStorage.setItem(PFX + chave, js); } catch { /* sem armazenamento */ }
  }, [chave, js, temAlgo]);
}
/** "Limpar dados": apaga o guardado e volta o formulário ao começo */
export function LimparRasc({ chave, limpar, mostrar = true }: { chave: string; limpar: () => void; mostrar?: boolean }) {
  if (!mostrar) return null;
  return <button type="button" className="btn text sm rasc-limpar" onClick={() => { apagarRasc(chave); limpar(); }}>Limpar dados</button>;
}
