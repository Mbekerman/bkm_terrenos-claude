import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { iniciais } from '../lib/format';
import type { SituacaoDoc, StatusProcesso } from '../lib/types';

// ---------------------------------------------------------------------
// Ícones (Material Symbols, paths 24px)
// ---------------------------------------------------------------------
const P = {
  home: 'M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z',
  layers: 'M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z',
  board: 'M3 5h5v14H3zm6.5 0h5v9h-5zM16 5h5v12h-5z',
  doc: 'M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z',
  add: 'M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z',
  back: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
  check: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z',
  warn: 'M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z',
  clock: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z',
  upload: 'M5 20h14v-2H5v2zm0-10h4v6h6v-6h4l-7-7-7 7z',
  close: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
  chev: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
  pause: 'M6 19h4V5H6v14zm8-14v14h4V5h-4z',
  block: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9A7.9 7.9 0 0 1 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1A7.9 7.9 0 0 1 20 12c0 4.42-3.58 8-8 8z',
  link: 'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z',
  fwd: 'M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z',
  chat: 'M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z',
  place: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z',
  money: 'M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z',
  search: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z',
  logout: 'M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z',
  open: 'M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z',
};
export type NomeIcone = keyof typeof P;

export function Icon({ n, s = 20 }: { n: NomeIcone; s?: number }) {
  return (
    <svg className="ic" viewBox="0 0 24 24" width={s} height={s} aria-hidden="true">
      <path fill="currentColor" d={P[n]} />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Marca
// ---------------------------------------------------------------------
export function Marca() {
  return (
    <>
      <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
        <defs>
          <linearGradient id="bkm-g" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#19c2ff" />
            <stop offset="1" stopColor="#0f5fd8" />
          </linearGradient>
        </defs>
        <path d="M16 2.5 28.4 13.7c1 .9 1.6 2.2 1.6 3.6V25a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4v-7.7c0-1.4.6-2.7 1.6-3.6Z" fill="url(#bkm-g)" />
        <path d="M16 11.2 25.2 20H6.8Z" fill="#fff" />
      </svg>
      <span className="wordmark">b<span className="k">k</span>m</span>
    </>
  );
}

// ---------------------------------------------------------------------
// Avatar e chips
// ---------------------------------------------------------------------
const CORES = ['--av1', '--av2', '--av3', '--av4'];
function cor(nome: string) {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `var(${CORES[h % CORES.length]})`;
}

export function Avatar({ nome, sm }: { nome: string | null | undefined; sm?: boolean }) {
  const n = nome ?? '?';
  return (
    <span className={`avatar ${sm ? 'sm' : ''}`} style={{ background: cor(n) }} title={n}>
      {iniciais(n)}
    </span>
  );
}

export function ChipStatus({ status, etapa }: { status: StatusProcesso; etapa: string }) {
  if (status === 'perdida') return <span className="chip crit"><span className="d" />Perdida</span>;
  if (status === 'stand_by') return <span className="chip warn"><span className="d" />Stand by</span>;
  if (status === 'ganha') return <span className="chip good"><span className="d" />Ganha</span>;
  return <span className="chip blue"><span className="d" />{etapa}</span>;
}

export function ChipDoc({ s }: { s: SituacaoDoc }) {
  const m: Record<SituacaoDoc, [string, string]> = {
    pendente: ['', 'Pendente'],
    recebido: ['blue', 'Aguardando validação'],
    validado: ['good', 'Validado'],
    vencido: ['crit', 'Vencido'],
    rejeitado: ['crit', 'Rejeitado'],
  };
  const [c, l] = m[s];
  return <span className={`chip ${c}`}>{l}</span>;
}

// ---------------------------------------------------------------------
// Diálogo (bottom sheet no celular)
// ---------------------------------------------------------------------
export function Dialogo({ titulo, sub, onFechar, children, rodape }: {
  titulo: string; sub?: string; onFechar: () => void; children: ReactNode; rodape?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fechar = useRef(onFechar);
  fechar.current = onFechar;
  // roda só ao abrir: foca o primeiro campo e devolve o foco ao fechar
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && fechar.current();
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); prev?.focus?.(); };
  }, []);
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <div className="dh">
          <div>
            <h2>{titulo}</h2>
            {sub && <div className="muted" style={{ marginTop: 4 }}>{sub}</div>}
          </div>
          <button className="iconbtn" onClick={onFechar} aria-label="Fechar"><Icon n="close" /></button>
        </div>
        {children}
        {rodape && <div className="df">{rodape}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------
const ToastCtx = createContext<(msg: string, erro?: boolean) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [t, setT] = useState<{ msg: string; erro: boolean; id: number } | null>(null);
  const show = useCallback((msg: string, erro = false) => setT({ msg, erro, id: Date.now() }), []);
  useEffect(() => {
    if (!t) return;
    const h = setTimeout(() => setT(null), 3200);
    return () => clearTimeout(h);
  }, [t]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      <div className={`toast ${t ? 'show' : ''} ${t?.erro ? 'err' : ''}`} role="status" aria-live="polite">{t?.msg}</div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return <div className="empty muted">{texto}</div>;
}

export function Erro({ erro }: { erro: unknown }) {
  const m = erro && typeof erro === 'object' && 'message' in erro ? String((erro as Error).message) : String(erro);
  return <div className="banner crit"><Icon n="warn" /><div><div className="bt">Não foi possível carregar</div><div>{m}</div></div></div>;
}
