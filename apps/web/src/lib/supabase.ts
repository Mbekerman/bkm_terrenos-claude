import { createClient } from '@supabase/supabase-js';

import { SUPABASE_KEY as key, SUPABASE_URL as url } from './config';

export const configurado = Boolean(url && key);

// Os schemas `app` e `fluxo` precisam estar em Settings → API → Exposed schemas.
export const supabase = createClient(url ?? 'http://localhost', key ?? 'sem-chave', {
  db: { schema: 'app' },
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
});

/** Converte erro do PostgREST em mensagem legível. */
export function mensagemErro(e: unknown): string {
  if (!e) return 'Erro desconhecido';
  if (typeof e === 'object' && e && 'message' in e) {
    const m = String((e as { message: string }).message);
    if (m.includes('Failed to fetch')) return 'Sem conexão com o servidor. Verifique a internet e tente de novo.';
    if (m.includes('row-level security')) return 'Você não tem permissão para esta ação.';
    return m;
  }
  return String(e);
}
