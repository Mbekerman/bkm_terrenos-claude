// Onde a pessoa parou na gaveta da ficha, por terreno (pedido do Moises, 9/nov/2026): a aba, a rolagem e os quadros
// abertos e fechados de cada aba. Fica no navegador (localStorage, vale depois de fechar e reabrir), só para os 50
// terrenos abertos mais recentemente; o mais antigo sai quando entra o 51º.

const KEY = 'bkm-terrenos-gaveta-pos', MAX = 50;

export interface PosGaveta {
  aba: string;
  /** rolagem do corpo da gaveta, em px */
  top: number;
  /** por aba, os quadros abertos (e as marcas "§id" do primeiro quadro já aberto por padrão; ver Quadro em edicao.tsx) */
  qd: Record<string, string[]>;
  /** quando foi mexida por último (ms), para cortar as mais antigas */
  em: number;
}

function ler(): Record<string, PosGaveta> {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || '{}');
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch { return {}; }
}

/** a posição guardada do terreno, já conferida (o que veio estragado é ignorado) */
export function lerPos(codigo: string): PosGaveta | null {
  const p = ler()[codigo];
  if (!p || typeof p !== 'object') return null;
  const qd: Record<string, string[]> = {};
  if (p.qd && typeof p.qd === 'object') for (const [a, ids] of Object.entries(p.qd)) if (Array.isArray(ids)) qd[a] = ids.filter((x) => typeof x === 'string');
  return { aba: typeof p.aba === 'string' ? p.aba : 'geral', top: Number.isFinite(p.top) && p.top > 0 ? p.top : 0, qd, em: Number(p.em) || 0 };
}

/** grava o que mudou do terreno e corta a lista nos 50 mais recentes */
export function guardarPos(codigo: string, mudou: Partial<Omit<PosGaveta, 'em'>>) {
  try {
    const t = ler();
    const base: Omit<PosGaveta, 'em'> = { aba: 'geral', top: 0, qd: {} };
    t[codigo] = { ...base, ...t[codigo], ...mudou, em: Date.now() };
    const ks = Object.keys(t).sort((a, b) => (Number(t[b]?.em) || 0) - (Number(t[a]?.em) || 0));
    for (const k of ks.slice(MAX)) delete t[k];
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch { /* sem storage: só não lembra */ }
}
