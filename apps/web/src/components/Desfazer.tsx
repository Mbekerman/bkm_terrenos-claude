import { useEffect } from 'react';
import { useToast } from './ui';

/* Ctrl+Z desfaz e Ctrl+Y refaz (pedido do Moisés, 6/nov/2026): fora de um campo, Ctrl+Z (⌘Z no Mac) desfaz a última alteração da pessoa
   nesta sessão, uma por vez, com o aviso "Desfeito: …". Dentro de um campo vale o desfazer do próprio navegador.
   Entra na pilha o que se desfaz sem efeito colateral: os campos da ficha (app.salvar_terreno, com a área adotada) e as
   etiquetas (parte de matrícula e SQL e os dados da janela da etiqueta) e o ajuste na poligonal pelo mapa. Funil, registros e exclusões ficam de fora:
   têm regra, aprovação e aviso próprios. Ctrl+Y (ou Ctrl+Shift+Z; ⌘Y e ⇧⌘Z no Mac) refaz o que foi desfeito, até a pessoa
   fazer outra alteração (pedido do Moisés, 6/nov/2026). */
export interface Desfeito { rotulo: string; fazer: () => Promise<boolean>; refazer: () => Promise<boolean> }
const PILHA: Desfeito[] = [], REFAZ: Desfeito[] = [];
const MAX = 50;
let desfazendo = false;
/** guarda como desfazer a alteração que acabou de gravar (não guarda a gravação do próprio desfazer nem do refazer) */
export function empilhar(d: Desfeito) {
  if (desfazendo) return;
  PILHA.push(d);
  if (PILHA.length > MAX) PILHA.shift();
  REFAZ.length = 0;
}
const ehCampo = (el: Element | null) => !!el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable);

export function Desfazer() {
  const toast = useToast();
  useEffect(() => {
    let ocupado = false;
    const tecla = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.defaultPrevented) return;
      const k = e.key.toLowerCase(), refaz = k === 'y' || (k === 'z' && e.shiftKey);
      if (k !== 'z' && k !== 'y') return;
      if (ehCampo(document.activeElement)) return;
      e.preventDefault();
      if (ocupado) return;
      const d = (refaz ? REFAZ : PILHA).pop();
      if (!d) { toast(refaz ? 'Nada para refazer.' : 'Nada para desfazer.'); return; }
      ocupado = true; desfazendo = true;
      try {
        const ok = await (refaz ? d.refazer() : d.fazer());
        if (ok) { (refaz ? PILHA : REFAZ).push(d); toast(`${refaz ? 'Refeito' : 'Desfeito'}: ${d.rotulo}.`); }
        else (refaz ? REFAZ : PILHA).push(d);
      } catch (x: any) { toast(x?.message ?? String(x), true); } finally { ocupado = false; desfazendo = false; }
    };
    /* na janela, depois dos outros: o desenho e a edição da poligonal desfazem o próprio ponto antes (e marcam o evento) */
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [toast]);
  return null;
}
