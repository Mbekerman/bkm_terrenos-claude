import { useEffect } from 'react';
import { useToast } from './ui';

/* Ctrl+Z desfaz (pedido do Moisés, 6/nov/2026): fora de um campo, Ctrl+Z (⌘Z no Mac) desfaz a última alteração da pessoa
   nesta sessão, uma por vez, com o aviso "Desfeito: …". Dentro de um campo vale o desfazer do próprio navegador.
   Entra na pilha o que se desfaz sem efeito colateral: os campos da ficha (app.salvar_terreno, com a área adotada) e as
   etiquetas (parte de matrícula e SQL e os dados da janela da etiqueta) e o ajuste na poligonal pelo mapa. Funil, registros e exclusões ficam de fora:
   têm regra, aprovação e aviso próprios. */
export interface Desfeito { rotulo: string; fazer: () => Promise<boolean> }
const PILHA: Desfeito[] = [];
const MAX = 50;
let desfazendo = false;
/** guarda como desfazer a alteração que acabou de gravar (não guarda a gravação do próprio desfazer) */
export function empilhar(d: Desfeito) {
  if (desfazendo) return;
  PILHA.push(d);
  if (PILHA.length > MAX) PILHA.shift();
}
const ehCampo = (el: Element | null) => !!el && (el.matches('input, textarea, select') || (el as HTMLElement).isContentEditable);

export function Desfazer() {
  const toast = useToast();
  useEffect(() => {
    let ocupado = false;
    const tecla = async (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z' || e.defaultPrevented) return;
      if (ehCampo(document.activeElement)) return;
      e.preventDefault();
      if (ocupado) return;
      const d = PILHA.pop();
      if (!d) { toast('Nada para desfazer.'); return; }
      ocupado = true; desfazendo = true;
      try {
        const ok = await d.fazer();
        if (ok) toast(`Desfeito: ${d.rotulo}.`);
      } catch (x: any) { toast(x?.message ?? String(x), true); } finally { ocupado = false; desfazendo = false; }
    };
    /* na janela, depois dos outros: o desenho e a edição da poligonal desfazem o próprio ponto antes (e marcam o evento) */
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [toast]);
  return null;
}
