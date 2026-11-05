/**
 * Configuração do ambiente, lida das metas da página. No Cloud Run o Caddy põe ali os
 * valores das variáveis do serviço (SUPABASE_URL, SUPABASE_KEY, AMBIENTE), como faz com
 * a chave do Google no protótipo; assim dev e produção usam o mesmo build. No `npm run dev`
 * as metas chegam sem trocar ("{% env ... %}") e valem as variáveis VITE_* do .env.local.
 */
function meta(nome: string): string | undefined {
  const v = document.querySelector<HTMLMetaElement>(`meta[name="${nome}"]`)?.content?.trim();
  return v && !v.startsWith('{%') ? v : undefined;
}

export const SUPABASE_URL = meta('supabase-url') ?? (import.meta.env.VITE_SUPABASE_URL as string | undefined);
export const SUPABASE_KEY = meta('supabase-key') ?? (import.meta.env.VITE_SUPABASE_KEY as string | undefined)
  ?? (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);
/** 'dev' no ambiente de desenvolvimento; vazio em produção. */
export const AMBIENTE = meta('bkm-ambiente') ?? (import.meta.env.VITE_AMBIENTE as string | undefined) ?? '';
export const EH_DEV = AMBIENTE === 'dev';
/** Domínio do Google Workspace que entra no sistema. */
export const DOMINIO = 'bkm.com.br';
/** Chave do Google Maps (meta gmaps-key, que o Caddy preenche com GOOGLE_MAPS_KEY; no npm run dev, VITE_GMAPS_KEY). */
const gk = meta('gmaps-key') ?? (import.meta.env.VITE_GMAPS_KEY as string | undefined) ?? '';
export const GMAPS_KEY = /^AIza[\w-]{20,}$/.test(gk) ? gk : '';
