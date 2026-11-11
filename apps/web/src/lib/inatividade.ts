// Login guardado no navegador, com prazo por inatividade (pedido do Moises, 11/nov/2026).
// O supabase-js já guarda a sessão no navegador e a renova sozinho; quem fica mais de 30 dias
// sem abrir o sistema neste navegador sai e entra de novo pelo Google. O mesmo prazo vale no
// servidor (Supabase › Authentication › Sessions › Inactivity timeout), que é o que manda de fato;
// aqui é a segunda trava, para valer mesmo se o painel mudar.

const CHAVE = 'bkm-terrenos-ultimo-uso';
export const DIAS_INATIVIDADE = 30;
const LIMITE_MS = DIAS_INATIVIDADE * 24 * 60 * 60 * 1000;
/** Grava o uso no máximo a cada 10 minutos, para não escrever no navegador a cada clique. */
const INTERVALO_MS = 10 * 60 * 1000;

let ultimaGravacao = 0;
/** Só marca uso depois que a sessão guardada foi conferida, para um clique logo ao abrir não renovar o prazo vencido. */
let conferido = false;

function ler(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Passou do prazo desde o último uso registrado neste navegador. Sem registro, não venceu. */
export function venceuPorInatividade(agora = Date.now()): boolean {
  const v = ler();
  return v !== null && agora - v > LIMITE_MS;
}

export function marcarUso(forcar = false) {
  if (!conferido) return;
  const agora = Date.now();
  if (!forcar && agora - ultimaGravacao < INTERVALO_MS) return;
  ultimaGravacao = agora;
  try { localStorage.setItem(CHAVE, String(agora)); } catch { /* navegador sem armazenamento: vale só o prazo do servidor */ }
}

/** Chamada depois de conferir a sessão guardada: daí em diante o uso conta. */
export function liberarMarcacao() {
  conferido = true;
}

export function esquecerUso() {
  ultimaGravacao = 0;
  try { localStorage.removeItem(CHAVE); } catch { /* idem */ }
}

/** Marca uso em clique, tecla e volta à aba. Devolve a função que desliga. */
export function acompanharUso(): () => void {
  const f = () => marcarUso();
  const vis = () => { if (document.visibilityState === 'visible') marcarUso(); };
  window.addEventListener('pointerdown', f, { passive: true });
  window.addEventListener('keydown', f);
  document.addEventListener('visibilitychange', vis);
  return () => {
    window.removeEventListener('pointerdown', f);
    window.removeEventListener('keydown', f);
    document.removeEventListener('visibilitychange', vis);
  };
}
