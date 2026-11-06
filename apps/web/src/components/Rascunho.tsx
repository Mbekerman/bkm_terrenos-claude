import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/* Formulário de registro esquecido (pedido do Moisés, 6/nov/2026): com algo digitado e ainda não registrado, quando a
   pessoa parte para outra ação (clica num botão, aba, link ou seta de quadro fora do formulário, vai para outro campo,
   fecha a janela ou sai da página), aparece o aviso "Você não registrou …" com Continuar preenchendo e Sair sem registrar.
   Sair sem registrar faz o que a pessoa ia fazer e mantém o que foi digitado, guardado no navegador (useGuardarRasc), que
   volta preenchido ao reabrir; só registrar ou Limpar dados apagam. O Cancelar do próprio formulário não pergunta nada.
   Sair da página (fechar a aba, recarregar) usa o aviso do navegador, que não aceita texto próprio. */
const ACAO = 'a, button, [role=tab], [role=menuitem], [role=radio], summary, label, input, select, textarea, [tabindex]';

export function useRascunho(ref: RefObject<HTMLElement>, sujo: boolean, nome: string, descartar: () => void) {
  const [pend, setPend] = useState<null | { fazer: () => void }>(null);
  const pendR = useRef(pend), livre = useRef(false), desc = useRef(descartar), tocado = useRef(false);
  pendR.current = pend;
  desc.current = descartar;
  /* o rascunho guardado no navegador volta preenchido ao abrir: o aviso só arma depois que a pessoa digita nele de novo */
  useEffect(() => {
    if (!sujo) { tocado.current = false; return; }
    const digitou = (ev: Event) => { const el = ref.current; if (el && ev.target instanceof Node && el.contains(ev.target)) tocado.current = true; };
    document.addEventListener('input', digitou, true);
    document.addEventListener('change', digitou, true);
    return () => { document.removeEventListener('input', digitou, true); document.removeEventListener('change', digitou, true); };
  }, [sujo, ref]);
  useEffect(() => {
    if (!sujo) return;
    livre.current = false;
    /* dentro: o formulário, a janela em que ele está (o Registrar do rodapé fica fora do <form>), o próprio aviso e as janelas
       que o formulário abre por cima (data-rasc-livre, como o mapa de lotes do "Escolher no mapa") */
    const dentro = (n: EventTarget | null) => {
      if (!(n instanceof Node)) return true;
      const el = ref.current;
      if (!el) return true;
      const e = n instanceof Element ? n : n.parentElement;
      return el.contains(n) || !!el.closest('.dialog')?.contains(n) || !!e?.closest('.rasc-av, .pac-container, gmp-place-autocomplete, [data-rasc-livre]');
    };
    /* o aperto do mouse (ou do dedo) segura a ação antes de o foco sair do formulário; o clique que vem depois é engolido */
    let engolir = false;
    const acao = (alvo: HTMLElement) => () => {
      if (alvo.matches('input, select, textarea')) alvo.focus();
      else alvo.click();
    };
    const aperto = (ev: MouseEvent) => {
      if (!tocado.current || livre.current || ev.button !== 0 || dentro(ev.target)) return;
      const alvo = (ev.target as Element).closest?.(ACAO) as HTMLElement | null;
      if (!alvo) return;
      ev.preventDefault(); ev.stopPropagation();
      engolir = true;
      setPend({ fazer: acao(alvo) });
    };
    const clique = (ev: MouseEvent) => {
      if (!tocado.current || livre.current) return;
      if (engolir) { engolir = false; if (!(ev.target as Element).closest?.('.rasc-av')) { ev.preventDefault(); ev.stopPropagation(); } return; }
      if (dentro(ev.target)) return;
      const alvo = (ev.target as Element).closest?.(ACAO) as HTMLElement | null;
      if (!alvo) return;
      ev.preventDefault(); ev.stopPropagation();
      setPend({ fazer: acao(alvo) });
    };
    const foco = (ev: FocusEvent) => {
      if (!tocado.current || livre.current || pendR.current || dentro(ev.target)) return;
      const alvo = ev.target as HTMLElement;
      setPend({ fazer: () => alvo.focus() });
    };
    const sair = (ev: BeforeUnloadEvent) => { if (!tocado.current) return; ev.preventDefault(); ev.returnValue = ''; };
    document.addEventListener('mousedown', aperto, true);
    document.addEventListener('click', clique, true);
    document.addEventListener('focusin', foco, true);
    window.addEventListener('beforeunload', sair);
    return () => {
      document.removeEventListener('mousedown', aperto, true);
      document.removeEventListener('click', clique, true);
      document.removeEventListener('focusin', foco, true);
      window.removeEventListener('beforeunload', sair);
    };
  }, [sujo, ref]);
  const voltar = () => {
    setPend(null);
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input:not([disabled]), select, textarea')?.focus(), 0);
  };
  const largar = () => {
    const p = pendR.current;
    livre.current = true;
    setPend(null);
    /* o formulário fica como está: o que foi digitado continua guardado no navegador (pedido do Moisés, 6/nov/2026) */
    setTimeout(() => p?.fazer(), 0);
  };
  /** fechar a janela (X, Esc, clique fora) passa por aqui */
  const pedir = (fazer: () => void) => { if (sujo && tocado.current) setPend({ fazer }); else fazer(); };
  /* no corpo da página, para nunca ficar escondido atrás de outra janela (6/nov/2026: o aviso ficava atrás do mapa de lotes e a tela parecia travada) */
  const aviso: ReactNode = pend ? createPortal(
    <div className="scrim rasc-av" onMouseDown={(e) => { if (e.target === e.currentTarget) voltar(); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') voltar(); }}>
      <div className="dialog rasc-d" role="alertdialog" aria-modal="true" aria-label={`Você não registrou ${nome}`}>
        <div className="dh"><h2>Você não registrou {nome}</h2></div>
        <p className="muted" style={{ margin: 0 }}>O que você digitou fica guardado neste navegador e volta quando reabrir, até registrar ou usar Limpar dados.</p>
        <div className="df">
          <button type="button" className="btn text" onClick={largar}>Sair sem registrar</button>
          <button type="button" className="btn primary" autoFocus onClick={voltar}>Continuar preenchendo</button>
        </div>
      </div>
    </div>, document.body
  ) : null;
  return { aviso, pedir };
}

/** o formulário mudou em relação ao que abriu? (campos com valor padrão não contam como digitado) */
export const mudou = (v: Record<string, unknown>, ini: Record<string, unknown>) =>
  Object.keys({ ...v, ...ini }).some((k) => String(v[k] ?? '').trim() !== String(ini[k] ?? '').trim());

/* O que se digita nos formulários de registro fica guardado no navegador (pedido do Moises, 6/nov/2026): fechar a janela,
   o navegador ou descartar sem querer não perde nada, e ao reabrir o formulário volta como estava. Só sai quando o registro
   é gravado ou com "Limpar dados"; não expira. Chave: bkm-terrenos-rasc:<terreno>:<formulário>. */
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
