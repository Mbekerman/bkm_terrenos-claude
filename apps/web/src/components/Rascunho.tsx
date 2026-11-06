import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/* Formulário de registro esquecido (pedido do Moisés, 6/nov/2026): com algo digitado e ainda não registrado, quando a
   pessoa parte para outra ação (clica num botão, aba, link ou seta de quadro fora do formulário, vai para outro campo,
   fecha a janela ou sai da página), aparece o aviso "Você não registrou …" com Continuar preenchendo e Descartar.
   Descartar limpa o formulário e faz o que a pessoa ia fazer; o Cancelar do próprio formulário não pergunta nada.
   Sair da página (fechar a aba, recarregar) usa o aviso do navegador, que não aceita texto próprio. */
const ACAO = 'a, button, [role=tab], [role=menuitem], [role=radio], summary, label, input, select, textarea, [tabindex]';

export function useRascunho(ref: RefObject<HTMLElement>, sujo: boolean, nome: string, descartar: () => void) {
  const [pend, setPend] = useState<null | { fazer: () => void }>(null);
  const pendR = useRef(pend), livre = useRef(false), desc = useRef(descartar);
  pendR.current = pend;
  desc.current = descartar;
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
      if (livre.current || ev.button !== 0 || dentro(ev.target)) return;
      const alvo = (ev.target as Element).closest?.(ACAO) as HTMLElement | null;
      if (!alvo) return;
      ev.preventDefault(); ev.stopPropagation();
      engolir = true;
      setPend({ fazer: acao(alvo) });
    };
    const clique = (ev: MouseEvent) => {
      if (livre.current) return;
      if (engolir) { engolir = false; if (!(ev.target as Element).closest?.('.rasc-av')) { ev.preventDefault(); ev.stopPropagation(); } return; }
      if (dentro(ev.target)) return;
      const alvo = (ev.target as Element).closest?.(ACAO) as HTMLElement | null;
      if (!alvo) return;
      ev.preventDefault(); ev.stopPropagation();
      setPend({ fazer: acao(alvo) });
    };
    const foco = (ev: FocusEvent) => {
      if (livre.current || pendR.current || dentro(ev.target)) return;
      const alvo = ev.target as HTMLElement;
      setPend({ fazer: () => alvo.focus() });
    };
    const sair = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ''; };
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
    desc.current();
    setTimeout(() => p?.fazer(), 0);
  };
  /** fechar a janela (X, Esc, clique fora) passa por aqui */
  const pedir = (fazer: () => void) => { if (sujo) setPend({ fazer }); else fazer(); };
  /* no corpo da página, para nunca ficar escondido atrás de outra janela (6/nov/2026: o aviso ficava atrás do mapa de lotes e a tela parecia travada) */
  const aviso: ReactNode = pend ? createPortal(
    <div className="scrim rasc-av" onMouseDown={(e) => { if (e.target === e.currentTarget) voltar(); }}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') voltar(); }}>
      <div className="dialog rasc-d" role="alertdialog" aria-modal="true" aria-label={`Você não registrou ${nome}`}>
        <div className="dh"><h2>Você não registrou {nome}</h2></div>
        <p className="muted" style={{ margin: 0 }}>O que você digitou se perde se sair agora.</p>
        <div className="df">
          <button type="button" className="btn text" onClick={largar}>Descartar</button>
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
