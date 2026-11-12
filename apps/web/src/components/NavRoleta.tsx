import { useRef, type ReactNode } from 'react';
import { useRoleta } from './Roleta';

/** barra de abas das janelas (estudo de massa e viabilidade) com a mesma roleta das abas da ficha (pedido do Moises,
    12/nov/2026): arrastar com o mouse, inércia, Shift + roda, e trocar de aba traz a ativa para a vista com 70% das
    vizinhas. Cada botão leva `data-t` com a chave da aba, que é o `ativo`. Componente próprio porque o useRoleta liga os
    eventos ao montar, e nas janelas a barra só aparece depois que o estudo carrega. */
export function NavRoleta({ cls, rotulo, ativo, conta, children }: { cls: string; rotulo: string; ativo: string; conta: number; children: ReactNode }) {
  const barra = useRef<HTMLDivElement>(null);
  const sobra = useRoleta(barra, ativo, conta);
  return <nav className={`${cls} roleta${sobra ? ' desliza' : ''}`} aria-label={rotulo} ref={barra}>{children}</nav>;
}
